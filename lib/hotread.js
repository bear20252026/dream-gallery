// hotread.js — 热集合读门面(2026-11-17 B5 拆双轨后精简)
// ===================== 它现在是什么 =====================
// 真表(chat_messages/click_events/client_errors/visits)是四热集合**唯一权威**。
// 本模块只剩六个**读门面**:SQLite 可用 ⇒ 读真表;不可用/读抛错 ⇒ 返回 null,
// 调用方回 json/kv 旁路(内存数组)。写路径不再经本模块——直接看 shadow.* 的返回值
// (true=确实落表⇒免整库落盘;false⇒回旁路 数组+saveGateData,一条不丢)。
//
// ===================== 拆除的矩阵(B5) =====================
// HOT_READ 闸 / SHADOW_WRITE 闸 / 启动对账 disable / disable 钩子 /
// confirm*(写确认,内移进 shadow) / count*(写前基线,不再需要) /
// mergeTablesIntoArrays(表→数组反向归并,方向反了;现为旁路→表回灌,见 shadow.start)。
//
// ===================== 依赖方向 =====================
// 只 require ./shadow 与 ./repo/*(全是叶子)。绝不 require ./store/./chat/./track(反向成环)。
const shadow = require('./shadow');
const repoChat = require('./repo/chat');
const repoClicks = require('./repo/clicks');
const repoErrors = require('./repo/errors');
const repoVisits = require('./repo/visits');

const stats = { readFallbacks: 0, lastFallback: null };

/** 读门面统一包装:SQLite 不可用或读抛错 ⇒ null(调用方用旁路数组) */
function read(where, fn) {
  if (!shadow.on()) return null;
  try {
    return fn();
  } catch (e) {
    stats.readFallbacks++;
    stats.lastFallback = where + ': ' + ((e && e.message) || String(e));
    return null;
  }
}

/** 最近 n 条聊天(形状 {n,t,ts,dk,admin?,bot?}) */
function chatTail(n) {
  return read('chatTail', () => repoChat.readTail(n));
}
/** 最近 n 条点击(rowid 升序=追加序) */
function clicksTail(n) {
  return read('clicksTail', () => repoClicks.readTail(n));
}
/** 点击全量(xlsx 导出用) */
function clicksAll() {
  return read('clicksAll', () => repoClicks.readAll());
}
/** 最近 n 条 gate 信道报错 */
function gateErrorsTail(n) {
  return read('gateErrorsTail', () => repoErrors.readGateTail(n));
}
/** file 信道聚合报错全量(client_errors.json 的表侧等价) */
function fileErrorsAll() {
  return read('fileErrorsAll', () => repoErrors.readFileAll());
}
/** 最近 n 条访问明细 {t,id} */
function visitsTail(n) {
  return read('visitsTail', () => repoVisits.readTail(n));
}

/** 观测面(只读) */
function hotReadStats() {
  return {
    enabled: shadow.on(),
    readFallbacks: stats.readFallbacks,
    lastFallback: stats.lastFallback,
  };
}

/** 测试钩子:复位计数 */
function _reset() {
  stats.readFallbacks = 0;
  stats.lastFallback = null;
}

module.exports = {
  hotReadStats, _reset,
  chatTail, clicksTail, clicksAll, gateErrorsTail, fileErrorsAll, visitsTail,
};