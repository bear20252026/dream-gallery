// ===================== TTS 语音合成代理(昆仑灵鉴·让昆仑开口) =====================
// 设计:浏览器 HTTPS 页面不能直连 http 语音服务(mixed content),故经本代理。
//   合成器:服务器本地 edge-tts(venv:/opt/tts-venv),中文女声 zh-CN-XiaoxiaoNeural
//   防线:文案≤100字;按设备限流 30 次/天;按文案哈希缓存到 .tts-cache/(同一句永不重复合成)
//   失败(网络/服务不可用)返回 502,前端静默吞掉,绝不影响页面功能
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { ROOT } = require('./config');
const { sendJson } = require('./util');
const { gateData, saveGateData, deviceKey } = require('./store');

const EDGE_TTS = '/opt/tts-venv/bin/edge-tts';
const VOICE = 'zh-CN-XiaoxiaoNeural';
const MAX_LEN = 100;
const DAILY_LIMIT = 30;
const CACHE_DIR = path.join(ROOT, '.tts-cache'); // 点目录,静态黑名单天然拦截公网访问

// 单任务队列(2 核小机,合成是 CPU+网络双活,串行最稳)
let busy = false;
const queue = [];

function synth(file, text, cb) {
  const args = ['--text', text, '--voice', VOICE, '--write-media', file];
  const p = spawn(EDGE_TTS, args, { stdio: 'ignore', timeout: 20000 });
  p.on('error', () => cb(false));
  p.on('close', code => cb(code === 0 && fs.existsSync(file) && fs.statSync(file).size > 500));
}

function pump() {
  if (busy) return;
  const job = queue.shift();
  if (!job) return;
  busy = true;
  synth(job.file, job.text, ok => {
    busy = false;
    job.cb(ok);
    pump();
  });
}

// GET /api/tts?text=... → audio/mpeg(带缓存);限流按设备指纹
function handleTts(req, res, query) {
  const text = String(query.text || '').trim().slice(0, MAX_LEN);
  if (!text) { sendJson(res, 400, { error: 'text 不能为空' }); return; }
  // 限流:每设备每天 30 次(缓存命中不计)
  const key = crypto.createHash('sha1').update(VOICE + '|' + text).digest('hex').slice(0, 20);
  const file = path.join(CACHE_DIR, key + '.mp3');
  if (fs.existsSync(file)) {
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': fs.statSync(file).size, 'Cache-Control': 'public, max-age=86400' });
    fs.createReadStream(file).pipe(res);
    return;
  }
  const dk = deviceKey(req);
  const day = new Date().toISOString().slice(0, 10);
  if (!gateData.ttsQuota) gateData.ttsQuota = {};
  const q = gateData.ttsQuota[dk] || { day, n: 0 };
  if (q.day !== day) { q.day = day; q.n = 0; }
  if (q.n >= DAILY_LIMIT) { sendJson(res, 429, { error: '今日语音次数已用完' }); return; }
  q.n++; gateData.ttsQuota[dk] = q; saveGateData();
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (e) {}
  const tmp = file + '.tmp';
  queue.push({ file: tmp, text, cb: ok => {
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
