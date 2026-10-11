// ===================== 媒体变更即时推送(SSE, 2026-08-29) =====================
// 需求:后台/访客上传、删除文件后,游戏端"当即立即"刷新(不等待 45-60s 轮询)。
// 实现:游戏页持有 GET /api/media/sse 长连接;files.js 在增删成功后调 mediaBroadcast()
//       广播 media_changed(含 dir/name),游戏端 src/media-push.js 收到即触发对应刷新。
// 鉴权:仅推送"媒体变更"这类低敏信号,与 /api/gate/watch 一样不设 token(公开轻量)。
//
// ⚠️ 长连接资源账(2026-10-11 DG-RT-001 同源问题):本路由在 dispatch 命中即回响应,
// **先于** server.js 的 entryGate,所以被踢设备/被拉黑 IP 仍能长期占住这条流。
// 这里先把「占用」封顶:按 IP 与全局并发上限 + 空闲/超寿回收 + 空集合摘除注册表。
// 状态门禁本身(IP 拉黑/被踢)要真正生效必须在 entryGate 之前拦,那半归 lib/gate.js(另一代理在改)。
const { realIP } = require('./store');

const MAX_SSE_TOTAL = 500;         // 进程内长连接总数兜底
const MAX_SSE_PER_IP = 12;         // 单 IP(多标签/多页)上限
const HB_MS = 25000;               // 心跳间隔(与整改前一致)
const IDLE_MS = HB_MS * 4;         // 心跳连续写不出去 = 对端已断,回收
const MAX_AGE_MS = 30 * 60 * 1000; // 连接最长寿命:到点主动收,浏览器 EventSource 会自动重连
const SWEEP_MS = 30000;

const clients = new Map(); // ip -> Set<{res, openedAt, lastWrite}> — 空集合立刻摘除,不留僵尸桶
let sweeper = null;

function countAll() {
  let n = 0;
  for (const set of clients.values()) n += set.size;
  return n;
}

function alive(entry) {
  return entry.res && !entry.res.destroyed && !entry.res.writableEnded;
}

function writeEntry(entry, chunk) {
  if (!alive(entry)) { drop(entry); return false; }
  try {
    entry.res.write(chunk);
    entry.lastWrite = Date.now();
    return true;
  } catch (e) {
    drop(entry);
    return false;
  }
}

function drop(entry) {
  const set = clients.get(entry.ip);
  if (set) {
    set.delete(entry);
    if (set.size === 0) clients.delete(entry.ip); // 空集合从注册表摘除
  }
  if (entry.hb) { clearInterval(entry.hb); entry.hb = null; }
}

function endEntry(entry) {
  drop(entry);
  try { if (alive(entry)) entry.res.end(); } catch (e) {}
}

function ensureSweeper() {
  if (sweeper) return;
  sweeper = setInterval(() => {
    const now = Date.now();
    for (const set of [...clients.values()]) {
      for (const entry of [...set]) {
        if (now - entry.lastWrite > IDLE_MS || now - entry.openedAt > MAX_AGE_MS) endEntry(entry);
      }
    }
    if (clients.size === 0 && sweeper) { clearInterval(sweeper); sweeper = null; } // 全空就停表
  }, SWEEP_MS);
  sweeper.unref(); // 回收器不该把事件循环拖住(测试/优雅关闭友好)
}

function mediaSseRegister(req, res) {
  const ip = realIP(req) || 'unknown';
  const perIp = clients.get(ip);
  if ((perIp && perIp.size >= MAX_SSE_PER_IP) || countAll() >= MAX_SSE_TOTAL) {
    console.warn('[media-sse] 拒绝长连接(数量上限)ip=' + ip, 'total=' + countAll());
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '60' });
    res.end('连接数已满');
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write(':ok\n\n');
  const entry = { ip, res, openedAt: Date.now(), lastWrite: Date.now(), hb: null };
  if (!perIp) clients.set(ip, new Set([entry]));
  else perIp.add(entry);
  entry.hb = setInterval(() => { writeEntry(entry, ':hb\n\n'); }, HB_MS);
  req.on('close', () => drop(entry));
  res.on('error', () => drop(entry)); // 写已断连接的 res 会异步 emit error,必须接住(否则冒泡成 uncaughtException)
  ensureSweeper();
}

// payload: { dir: 'photos'|'videos'|'music', name: 'x.jpg' }
function mediaBroadcast(payload) {
  const data = JSON.stringify({ type: 'media_changed', ...payload, t: Date.now() });
  for (const set of clients.values()) {
    for (const entry of [...set]) writeEntry(entry, `data: ${data}\n\n`);
  }
}

// 优雅关闭时主动收束长连接(server.js 调用),否则 server.close() 要等满排空窗口
function closeMediaSse() {
  for (const set of [...clients.values()]) {
    for (const entry of [...set]) endEntry(entry);
  }
  clients.clear();
  if (sweeper) { clearInterval(sweeper); sweeper = null; }
}

module.exports = { mediaSseRegister, mediaBroadcast, closeMediaSse };
