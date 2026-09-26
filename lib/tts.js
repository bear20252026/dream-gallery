// ===================== TTS 语音合成代理(昆仑灵鉴·让昆仑开口) =====================
// 设计:浏览器 HTTPS 页面不能直连 http 语音服务(mixed content),故经本代理。
//   合成器:MiMo TTS(云端) → edge-tts 本地兜底(venv:/opt/tts-venv),中文女声 zh-CN-XiaoxiaoNeural
//   防线:文案≤220字;按文案哈希缓存到 .tts-cache/(同一句永不重复合成);串行队列(2 核小机)
//   (2026-09-24 主人令:按设备日限已拆除 —— 台词朗读是核心体验,不再设配额闸)
//   失败(网络/服务不可用)返回 502,前端静默吞掉,绝不影响页面功能
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { ROOT } = require('./config');
const { sendJson, readBody } = require('./util');

const EDGE_TTS = '/opt/tts-venv/bin/edge-tts';
const VOICE = 'zh-CN-XiaoxiaoNeural';
// 2026-09-26 MiMo 预置音色 → edge-tts 兜底映射(MiMo 失败时本地引擎按同性别/语种补位;
// 官方音色表 https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5)
const EDGE_VOICE_MAP = {
  '苏打': 'zh-CN-YunxiNeural',
  '茉莉': 'zh-CN-XiaoxiaoNeural',
  '冰糖': 'zh-CN-XiaoyiNeural',
  '白桦': 'zh-CN-YunyangNeural',
  Milo: 'en-US-ChristopherNeural',
  Dean: 'en-US-GuyNeural',
  Mia: 'en-US-JennyNeural',
  Chloe: 'en-US-AriaNeural',
};
// 2026-09-24 剧情台词朗读上线(主人指令):对话框每行显示即请求朗读 → 单场剧情 30-50 行,
// 旧 100 字截断会把长台词拦腰砍 → 提到 220 字。
const MAX_LEN = 220;
const CACHE_DIR = path.join(ROOT, '.tts-cache'); // 点目录,静态黑名单天然拦截公网访问

// ============ 版本化缓存键 + 边缘可缓存出口(2026-09-26 实测取证定案) ============
// 病根:/api/tts?text=.. 的响应 Cloudflare 恒不缓存(cf-cache-status: DYNAMIC,URL 无
// 缓存扩展名)→ 每条音频都跨境回源;晚高峰单流拥塞 16KB 爬 10s+ → 台词链条被
// onVoiceEnd 的 15s 兜底拖着走 = 主人报的「无声/太快」。源站缓存命中本身只要 ~2ms。
// 修法:新增只读出口 GET /tts-audio/<key>.mp3 —— URL 带 .mp3 扩展名,命中 Cloudflare
// 默认缓存扩展名清单 → 边缘自动缓存就近交付(DYNAMIC→HIT)。
// ⚠️ key 算法是前后端契约:客户端 src/core/dialog-voice.mjs ttsUrl() 复算同一哈希拼 URL,
// 两端必须同步;改键格式 = 升 KEY_VER + 两端同改(旧缓存文件成孤儿,预热会自动重煮)。
const KEY_VER = 'tts1';
function ttsKey(voice, text) {
  return crypto.createHash('sha256').update(KEY_VER + '|' + voice + '|' + text).digest('hex').slice(0, 20);
}

// 单任务队列(2 核小机,合成是 CPU+网络双活;2026-09-25 升级双工位)
// 2026-09-25 主人报「没有语音且卡」:剧情一场 30-50 行台词每行都发合成请求,
// 串行单工位 + MiMo SGP 2~4s/条 → 队列积压数分钟,后面的台词全部饿死(browser Audio
// 15s readyState 0 实测)。三条防线:
//   ① 双工位并行(网络型任务,2 核机无压力)
//   ② JOB_TTL:排队超过 12s 的请求直接 502 快速失败(台词已滚过屏,合成出来也是废品)
//   ③ MAX_QUEUE:待队上限 6,超出丢最旧(保新弃旧)
// 2026-09-26 预合成流水线(主人令「最好的方案」·调研定案):剧情台词 100% 静态文本,
//   业界共识是「静态走预合成缓存,动态才走流式」→ 新增 batch 低优先级入队:
//   pump 时实时 job 永远优先于 batch(batch 让位,不挤占正在说话的台词);
//   batch 自身 TTL 放宽到 120s(不赶时间,慢慢煮)。
const WORKERS = 2;
const JOB_TTL = 12000;
// 2026-09-26 主人报「部分对话朗读不了」实锤:batch 队列上限 120 < 台词总量 228,
// 尾部台词(中文全在队尾)被静默丢弃;TTL 120s 又赶不上 2 worker×4.5s/条的消化速度
// (120s 只能煮 ~53 条)。改:TTL 放宽到 30min(batch 是纯预取,不赶时间)、
// 上限 400(一次会话全量入队,~9min 煮完,之后永远命中缓存)。
const BATCH_TTL = 1800000;
const MAX_QUEUE = 6;
const MAX_BATCH_ITEMS = 60;
const busy = new Array(WORKERS).fill(false);
const queue = [];

// 合成链(2026-07-28 主人定):首选小米 MiMo TTS(mimo-v2.5-tts,云端) → 兜底本地 edge-tts
// 接口形状不变:synth(file,text,cb);引擎迁移只许动本函数
// 血泪(2026-07-28):spawn ENOENT 会同时触发 'error' 和 'close',回调双击 → 502 双写 →
// ERR_HTTP_HEADERS_SENT 崩进程(有 edge-tts 的生产不触发,无 venv 的开发机必炸)——回调必须单次保险丝
const { synthTts } = require('./aichannels');
function synth(file, text, cb, voice) {
  let done = false;
  const fin = ok => { if (done) return; done = true; cb(ok); };
  const spawnFallback = () => {
    const ev = EDGE_VOICE_MAP[voice] || voice || VOICE; // MiMo 音色名映射到 edge-tts 等位声线
    const args = ['--text', text, '--voice', ev, '--write-media', file];
    const p = spawn(EDGE_TTS, args, { stdio: 'ignore', timeout: 20000 });
    p.on('error', () => fin(false));
    p.on('close', code => fin(code === 0 && fs.existsSync(file) && fs.statSync(file).size > 500));
  };
  synthTts(text, voice).then(buf => {
    if (buf) {
      try { fs.writeFileSync(file, buf); return fin(true); } catch (e) { /* 落盘失败走本地 */ }
    }
    spawnFallback();
  }).catch(spawnFallback);
}

function pump() {
  for (let i = 0; i < WORKERS; i++) {
    if (busy[i]) continue;
    // 优先级取件:实时 job 先行,batch 让位(找到第一个非 batch;全是 batch 才取 batch)
    let idx = queue.findIndex(j => !j.pr);
    if (idx < 0) idx = queue.findIndex(j => j.pr === 'batch');
    if (idx < 0) return;
    const job = queue.splice(idx, 1)[0];
    if (Date.now() - job.t > (job.ttl || JOB_TTL)) {
      job.cb(false); // 排队超时,快速失败让位给新请求
      i--;
      continue;
    }
    busy[i] = true;
    synth(job.file, job.text, ok => {
      busy[i] = false;
      job.cb(ok);
      pump();
    }, job.voice);
  }
}

// GET /api/tts?text=... → audio/mpeg(带缓存)
function handleTts(req, res, query) {
  const text = String(query.text || '').trim().slice(0, MAX_LEN);
  if (!text) { sendJson(res, 400, { error: 'text 不能为空' }); return; }
  // B6 音色分层:voice 来自前端 kunlunSpeak(text, voice);空→兜底默认音色
  const voice = String(query.voice || '').trim().slice(0, 40);
  // 限流:每设备每天 30 次(缓存命中不计);缓存键含音色,不同音色不混用
  const key = ttsKey(voice, text);
  const file = path.join(CACHE_DIR, key + '.mp3');
  if (!file.startsWith(CACHE_DIR + path.sep)) { sendJson(res, 400, { error: 'bad key' }); return; }
  if (fs.existsSync(file)) {
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': fs.statSync(file).size, 'Cache-Control': 'public, max-age=86400' });
    fs.createReadStream(file).pipe(res);
    return;
  }
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (e) {}
  const tmp = file + '.tmp';
  // 队列上限:超出丢最旧(旧台词早已滚过屏),保证新台词能及时合成
  while (queue.length >= MAX_QUEUE) {
    const stale = queue.shift();
    try { stale.cb(false); } catch (e) {}
  }
  queue.push({ file: tmp, text, voice, t: Date.now(), cb: ok => {
    if (ok) {
      try { fs.renameSync(tmp, file); } catch (e) {}
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': fs.statSync(file).size, 'Cache-Control': 'public, max-age=86400' });
      fs.createReadStream(file).pipe(res);
    } else {
      try { fs.unlinkSync(tmp); } catch (e) {}
      sendJson(res, 502, { error: '语音合成暂不可用' });
    }
  } });
  pump();
}

// POST /api/tts/batch — 剧情台词批量预合成(2026-09-26 预合成流水线)
// body: { items: [{text, voice}] } ≤60 条/次;命中缓存的直接计数不入队。
// 全部为低优先级 batch job(实时台词永远优先),TTL 120s(不赶时间)。
// 响应: { ok, cached, queued, keys } —— keys=已命中缓存的键(2026-09-26 最后一米:
// 客户端拿键后台 load /tts-audio/<key>.mp3,在闸门/电影死时间填满边缘+浏览器缓存,
// 剧情开播时每行 <100ms 就绪;未煮的键不给,免得客户端预载到 404 白跑一趟回源)。
function handleTtsBatch(req, res) {
  readBody(req, obj => {
    try {
      const items = (obj && Array.isArray(obj.items) ? obj.items : []).slice(0, MAX_BATCH_ITEMS);
      let cached = 0, queued = 0;
      const keys = [];
      for (const it of items) {
        const text = String((it && it.text) || '').trim().slice(0, MAX_LEN);
        const voice = String((it && it.voice) || '').trim().slice(0, 40);
        if (!text) continue;
        const key = ttsKey(voice, text);
        const file = path.join(CACHE_DIR, key + '.mp3');
        if (!file.startsWith(CACHE_DIR + path.sep)) continue;
        if (fs.existsSync(file)) { cached++; keys.push(key); continue; }
        try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (e) {}
        const tmp = file + '.tmp';
        // batch 不受 MAX_QUEUE 限制(它们全部让位于实时请求);上限 400 ≥ 台词总量 228,
        // 一次会话全量入队(2026-09-26 旧值 120 < 228,尾部台词被静默丢弃=「部分对话没声」)
        if (queue.filter(j => j.pr === 'batch').length >= 400) continue;
        queue.push({ file: tmp, text, voice, t: Date.now(), ttl: BATCH_TTL, pr: 'batch', cb: ok => {
          if (ok) { try { fs.renameSync(tmp, file); } catch (e) {} }
          else { try { fs.unlinkSync(tmp); } catch (e) {} }
        } });
        queued++;
      }
      pump();
      sendJson(res, 200, { ok: true, cached, queued, keys });
    } catch (e) {
      sendJson(res, 400, { error: 'bad body' });
    }
  }, 256 * 1024);
}

// GET /tts-audio/<key>.mp3 — 台词音频边缘可缓存出口(2026-09-26)
// 纯只读静态服务:命中即回(源站 ~2ms);未命中 404 —— 哈希不可逆,这里捞不回文本,
// 冷台词由客户端回退 /api/tts 触发合成,落盘后下次本路由直接命中。
// 响应带 public max-age=86400 且无 Set-Cookie:.mp3 扩展名在 CF 默认缓存清单 → 边缘 HIT。
function handleTtsAudio(req, res, key) {
  if (!/^[0-9a-f]{20}$/.test(String(key || ''))) { sendJson(res, 400, { error: 'bad key' }); return; }
  const file = path.join(CACHE_DIR, key + '.mp3');
  if (!file.startsWith(CACHE_DIR + path.sep) || !fs.existsSync(file)) { sendJson(res, 404, { error: 'not ready' }); return; }
  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Content-Length': fs.statSync(file).size,
    'Cache-Control': 'public, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
  });
  fs.createReadStream(file).pipe(res);
}

module.exports = { handleTts, handleTtsBatch, handleTtsAudio, ttsKey };
