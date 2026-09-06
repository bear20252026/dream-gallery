// client-errors.js — 客户端报错反馈:接收前端上报的运行时错误并在后台展示
// 2026-08-30 主人要求:"把报错反馈安进游戏里,报错直接在后台展现"
//
// 覆盖范围(前端 src/error-report.js 负责采集):
//   js        — window.onerror 未捕获异常
//   promise   — unhandledrejection 未处理的 Promise 拒绝
//   resource  — img/script/link/audio/video 等资源加载失败
//   webgl     — WebGL context lost(画面黑屏/冻结的常见原因)
//   network   — fetch 失败(后端不可达/超时)
//
// 存储:独立的 client_errors.json(不混进 gate_data,便于清理与限容)
// 安全:上报接口公开(任何访客都可能报错),但做了限流 + 字段裁剪 + 总量上限
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./config');
const { sendJson, readBody } = require('./util');
const { tokenOk } = require('./admin');

const FILE = path.join(ROOT, 'client_errors.json');
const MAX_ITEMS = 500; // 滚动保留最近 500 条(去重后的独立错误)
const MAX_BODY = 64 * 1024; // 单条上报最大 64KB(stack 可能很长)
const RATE_WINDOW = 60 * 1000; // 限流窗口 1 分钟
const RATE_MAX = 30; // 单 IP 每窗口最多 30 条

let db = { list: [] };
const rateMap = new Map(); // ip -> { n, t0 }

// ---------- 持久化 ----------
function load() {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const j = JSON.parse(raw);
    if (j && Array.isArray(j.list)) db = j;
  } catch (e) {
    // 首次运行或文件损坏:从空开始,不阻塞启动
  }
  if (!Array.isArray(db.list)) db.list = [];
}
function save() {
  try {
    fs.writeFileSync(FILE, JSON.stringify(db));
  } catch (e) {
    console.log('[client-errors] 写入失败:', e.message);
  }
}
load();

// ---------- 工具 ----------
function clip(s, n) {
  if (s === undefined || s === null) return '';
  s = String(s);
  return s.length > n ? s.slice(0, n) : s;
}
function clientIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    (req.socket && req.socket.remoteAddress) ||
    ''
  );
}
/** 单 IP 限流:窗口内超过上限直接丢弃(防止死循环报错把磁盘打满) */
function rateOk(ip) {
  const now = Date.now();
  const r = rateMap.get(ip);
  if (!r || now - r.t0 > RATE_WINDOW) {
    rateMap.set(ip, { n: 1, t0: now });
    return true;
  }
  r.n++;
  return r.n <= RATE_MAX;
}
// 定期清理限流表,避免内存泄漏
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateMap) if (now - v.t0 > RATE_WINDOW) rateMap.delete(k);
}, RATE_WINDOW).unref?.();

/**
 * 写入一条错误。相同 message+source 视为同一错误,合并计数并更新 lastT。
 * @returns {object|null} 合并后的错误条目(被限流/已超容量时返回 null)
 */
function record(entry) {
  const msg = clip(entry.message, 400);
  const src = clip(entry.source, 200);
  const type = clip(entry.type || 'js', 20);
  const found = db.list.find((e) => e.message === msg && e.source === src && e.type === type);
  if (found) {
    found.count++;
    found.lastT = Date.now();
    // 保留最新的上下文(玩家位置/页面/UA 可能变化)
    if (entry.url) found.url = clip(entry.url, 200);
    if (entry.viewMode !== undefined) found.viewMode = entry.viewMode;
    if (entry.playerPos) found.playerPos = clip(entry.playerPos, 60);
    if (entry.ua) found.ua = clip(entry.ua, 200);
    if (entry.world) found.world = clip(entry.world, 20);
    if (stack(entry) ) found.stack = clip(entry.stack, 2000);
    save();
    return found;
  }
  const item = {
    id: 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    t: Date.now(),
    lastT: Date.now(),
    type,
    message: msg,
    source: src,
    lineno: entry.lineno || 0,
    colno: entry.colno || 0,
    stack: clip(entry.stack, 2000),
    url: clip(entry.url, 200),
    viewMode: entry.viewMode,
    playerPos: clip(entry.playerPos, 60),
    ua: clip(entry.ua, 200),
    world: clip(entry.world, 20),
    ip: clip(entry.ip, 60),
    count: 1,
  };
  db.list.push(item);
  // 滚动:超出上限时丢弃最旧的
  if (db.list.length > MAX_ITEMS) db.list.splice(0, db.list.length - MAX_ITEMS);
  save();
  return item;
}
function stack(entry) {
  return entry && entry.stack;
}

// ---------- 接口 ----------
/** 公开:前端上报(无需 token) */
function handleReport(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method' });
  const ip = clientIp(req);
  if (!rateOk(ip)) return sendJson(res, 429, { error: 'rate limited' });
  // ⚠️ util.readBody 内部已经做了 JSON.parse,回调拿到的是**对象**而非字符串;
  //   这里再 parse 一次会得到 "[object Object]" → 解析失败 → 全部 400。
  readBody(req, (payload) => {
    payload = payload && typeof payload === 'object' ? payload : {};
    // 支持单条或批量(前端会缓冲后批量发送)
    const items = Array.isArray(payload.items) ? payload.items : [payload];
    let n = 0;
    for (const it of items.slice(0, 20)) {
      // 只保留已知字段,防止客户端塞入任意内容
      const ok = record({
        type: it.type,
        message: it.message,
        source: it.source,
        lineno: it.lineno,
        colno: it.colno,
        stack: it.stack,
        url: it.url,
        viewMode: it.viewMode,
        playerPos: it.playerPos,
        ua: it.ua,
        world: it.world,
        ip,
      });
      if (ok) n++;
    }
    sendJson(res, 200, { ok: true, accepted: n });
  }, MAX_BODY);
}

/** 后台:列表(需 token) */
function handleAdminErrors(req, res, query) {
  if (!tokenOk(req, query)) return sendJson(res, 401, { error: 'bad token' });
  const type = query.type || '';
  const q = (query.q || '').toLowerCase();
  let list = db.list.slice();
  if (type) list = list.filter((e) => e.type === type);
  if (q) {
    list = list.filter(
      (e) =>
        (e.message || '').toLowerCase().includes(q) ||
        (e.source || '').toLowerCase().includes(q) ||
        (e.url || '').toLowerCase().includes(q)
    );
  }
  // 最近的排前面
  list.sort((a, b) => b.lastT - a.lastT);
  // 统计
  const byType = {};
  let total = 0;
  for (const e of db.list) {
    byType[e.type] = (byType[e.type] || 0) + (e.count || 1);
    total += e.count || 1;
  }
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const recent24 = db.list
    .filter((e) => now - e.lastT < day)
    .reduce((s, e) => s + (e.count || 1), 0);
  sendJson(res, 200, {
    list: list.slice(0, 200), // 单次最多返回 200 条,避免响应过大
    total,
    unique: db.list.length,
    recent24,
    byType,
  });
}

/** 后台:清空(需 token) */
function handleAdminErrorsClear(req, res, query) {
  if (!tokenOk(req, query)) return sendJson(res, 401, { error: 'bad token' });
  db.list = [];
  save();
  sendJson(res, 200, { ok: true });
}

module.exports = { handleReport, handleAdminErrors, handleAdminErrorsClear };
