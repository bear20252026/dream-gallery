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
// 保留期(DG-PRIV-001):条数上限 MAX_ITEMS 与时间维度**共存** —— 超过
//   RETENTION_DAYS.clientErrors(lib/retention.js,按 lastT 判龄,仍在复发的不老化)的条目
//   由保留期清扫 sweepExpiredClientErrors() 裁掉;本模块只提供自己的裁剪实现,
//   调度与"整轮只写一次 gateData 快照"由 retention.js 统一负责。
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./config');
const { sendJson, readBody } = require('./util');
const { tokenOk } = require('./admin');
// 影子双写(R1 第 2 步):本文件的聚合表(client_errors.json)镜像进 client_errors 表
// (channel='file',按条目 id UPSERT)。只写不读,失败静默;SHADOW_WRITE=0 一键停用。
const shadow = require('./shadow');

// CLIENT_ERRORS_FILE 可重定向(单测用它把写入引到系统临时目录,绝不碰仓库真实文件;默认路径不变)
const FILE = process.env.CLIENT_ERRORS_FILE || path.join(ROOT, 'client_errors.json');
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
// 一次性历史回填(哨兵 + 空表双保险,重跑绝不重复灌进表)。本模块**不许被 shadow require**
// (client-errors→admin→store→shadow→client-errors 就是环),所以由这边主动把数组交给影子层。
try { shadow.backfillFileErrors(db.list); } catch { /* 回填失败绝不影响报错上报 */ }

// ---------- 工具 ----------
function clip(s, n) {
  if (s === undefined || s === null) return '';
  s = String(s);
  return s.length > n ? s.slice(0, n) : s;
}
function clientIp(req) {
  // 2026-09-20 审计 M1:改用 store.realIP(仅当直连地址是可信反向代理时才采
  // cf-connecting-ip/x-forwarded-for),访客自伪造 XFF 首段不再能轮换绕开限流
  return require('./store').realIP(req);
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
    shadow.fileError(found); // 影子写:同 id 的聚合条目整行覆盖(count / lastT 一起跟上)
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
  shadow.fileError(item); // 影子写:新条目落 client_errors 表(channel='file',带 src_id 幂等键)
  return item;
}
function stack(entry) {
  return entry && entry.stack;
}

// ---------- 保留期裁剪(由 lib/retention.js 的统一 sweep 调用) ----------
const DAY_MS = 24 * 60 * 60 * 1000;
// 兜底保留期:调用方(retention.js)总会显式传 keepMs,这里只是防"没人给数字"时的保守值
const FALLBACK_KEEP_MS = 30 * DAY_MS;

/**
 * 按时间维度裁剪错误条目。判龄用 lastT(同一错误合并计数时会刷新),退回 t;
 * 两个字段都不是数字的畸形条目**跳过而不是删**。
 * @param {{now?:number, keepMs?:number, preview?:boolean}} [opts] preview=true 只统计、不改不落盘
 * @returns {number} 移除(或将移除)的条数
 */
function sweepExpiredClientErrors(opts) {
  const o = opts || {};
  const now = typeof o.now === 'number' && isFinite(o.now) ? o.now : Date.now();
  const keepMs = typeof o.keepMs === 'number' && isFinite(o.keepMs) ? o.keepMs : FALLBACK_KEEP_MS;
  const preview = !!o.preview;
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const expired = (e) => {
    if (!e || typeof e !== 'object') return false;
    const t = isNum(e.lastT) ? e.lastT : isNum(e.t) ? e.t : null;
    return t !== null && now - t > keepMs;
  };
  if (preview) return db.list.filter(expired).length;
  let w = 0;
  for (let r = 0; r < db.list.length; r++) {
    if (expired(db.list[r])) continue;
    if (w !== r) db.list[w] = db.list[r];
    w++;
  }
  const removed = db.list.length - w;
  if (removed > 0) {
    db.list.length = w;
    save(); // 独立小文件(不在 gateData 快照里),不计入 retention 的 writes
  }
  return removed;
}

// 测试/运维钩子:整体替换内存条目(不落盘),让用例之间互不牵连
function _setErrorList(list) { db.list = Array.isArray(list) ? list : []; }
function _getErrorList() { return db.list; }

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
  // 镜像清表:后台点"清空"是对这份数据的真删,影子表跟着清才不会永远对不上账
  // (与 lib/track.js handleClicksClear 同一口径;响应体/状态码一字未改)
  shadow.clearFileErrors();
  sendJson(res, 200, { ok: true });
}

module.exports = {
  handleReport, handleAdminErrors, handleAdminErrorsClear,
  sweepExpiredClientErrors, MAX_ITEMS, FILE,
  _setErrorList, _getErrorList,
};
