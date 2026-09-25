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
const { sendJson } = require('./util');

const EDGE_TTS = '/opt/tts-venv/bin/edge-tts';
const VOICE = 'zh-CN-XiaoxiaoNeural';
// 2026-09-24 剧情台词朗读上线(主人指令):对话框每行显示即请求朗读 → 单场剧情 30-50 行,
// 旧 100 字截断会把长台词拦腰砍 → 提到 220 字。
const MAX_LEN = 220;
const CACHE_DIR = path.join(ROOT, '.tts-cache'); // 点目录,静态黑名单天然拦截公网访问

// 单任务队列(2 核小机,合成是 CPU+网络双活;2026-09-25 升级双工位)
// 2026-09-25 主人报「没有语音且卡」:剧情一场 30-50 行台词每行都发合成请求,
// 串行单工位 + MiMo SGP 2~4s/条 → 队列积压数分钟,后面的台词全部饿死(browser Audio
// 15s readyState 0 实测)。三条防线:
//   ① 双工位并行(网络型任务,2 核机无压力)
//   ② JOB_TTL:排队超过 12s 的请求直接 502 快速失败(台词已滚过屏,合成出来也是废品)
//   ③ MAX_QUEUE:待队上限 6,超出丢最旧(保新弃旧)
const WORKERS = 2;
const JOB_TTL = 12000;
const MAX_QUEUE = 6;
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
    const args = ['--text', text, '--voice', voice || VOICE, '--write-media', file];
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
    const job = queue.shift();
    if (!job) return;
    if (Date.now() - job.t > JOB_TTL) {
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
  const key = crypto.createHash('sha256').update(VOICE + '|' + voice + '|' + text).digest('hex').slice(0, 20);
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

module.exports = { handleTts };
