// hotread.js — R1 第 3 步「只读切换」的判定与读取门面(2026-11-16)
// ===================== 它解决什么 =====================
// 影子双写(shadow.js)已把四个热集合同写进真表;本模块把**生产读路径**从
// gateData 数组切到真表,并让热写路径不再为 append-only 记录触发整库 saveGateData()。
// 判据(R1 验收):一次发言/一批点击/一条报错/一次访问明细的 saveGateData 调用数 → 0。
//
// ===================== 开关与回退(全部可一键回老路) =====================
//   HOT_READ=0        → 读路径整体回 gateData 数组(写路径仍是双写,行为=影子期)。
//   SHADOW_WRITE=0 / USE_SQLITE=0 / better-sqlite3 缺失 → shadow.on() 恒假 ⇒ 本模块自动全回退。
//   单次读表抛错       → 该次读回退数组并计数(绝不把 500 抛给请求)。
//   启动对账不一致     → server.js 调 disable() 整体回退,服务照常(只影响读源,不丢数据)。
//
// ===================== 写路径的对称纪律 =====================
// 表写成功(shadow.chat/clicks/... 返回 true 且落表行数>0)⇒ 内存数组照常维护
// (限流/统计/对账/保留期全依赖它),但**跳过整库落盘**——表行已经持久,WAL 崩溃安全。
// 表写失败/畸形/停用 ⇒ 走老路:数组 + saveGateData(),一条不丢。
// shadow.js 的返回值只表示"尝试过";这里用 confirm*() 以行数差判定"确实落表"。
//
// ===================== 依赖方向 =====================
// 只 require ./shadow(它只依赖 sqlite-store/migrate/repo/*,全是叶子)。
// **绝不 require ./store / ./chat / ./track**:它们 require 本模块,反向就是环。
// gateData 一律由调用方作为参数传入(与 shadow.start(g) 同一纪律)。
const shadow = require('./shadow');
const repoChat = require('./repo/chat');
const repoClicks = require('./repo/clicks');
const repoErrors = require('./repo/errors');
const repoVisits = require('./repo/visits');

let disabled = false; // 启动对账不一致时置真(server.js);HOT_READ=0 是环境闸,两者独立
const stats = { fallbacks: 0, lastFallback: null, skippedSaves: 0 };
// 审计2修 P2-3:运行时 disable 也要把真表归并回数组(否则回退后读旧)。
// 本模块不 require store(成环),由 server.js 启动时注入归并+落盘钩子。
let onDisableHook = null;
function setDisableHook(fn) { onDisableHook = typeof fn === 'function' ? fn : null; }

function enabled() {
  return !disabled && process.env.HOT_READ !== '0' && shadow.on();
}

/** 启动对账不一致 ⇒ 整体回退(读回数组;写路径回到"数组+整库落盘"老路) */
function disable(reason) {
  disabled = true;
  stats.lastFallback = 'startup-parity: ' + (reason || '');
  console.warn('[hotread] 对账不一致,读路径整体回退 gateData 数组:', reason,
    '—— 先归并真表行回数组再回退,数据无损;修复后重启即恢复,或 HOT_READ=0 显式保持老路。');
  if (onDisableHook) {
    try { onDisableHook(); } catch (e) { console.error('[hotread] 回退归并失败:', e && (e.message || e)); }
  }
}

function fallback(where, e) {
  stats.fallbacks++;
  stats.lastFallback = where + ': ' + ((e && e.message) || String(e));
  return null; // 调用方拿到 null ⇒ 用数组
}

// ===================== 读门面(返回 null = 请调用方用数组) =====================

/** 最近 n 条聊天(源数组形状 {n,t,ts,dk,admin?,bot?}) */
function chatTail(n) {
  if (!enabled()) return null;
  try {
    return repoChat.readTail(n);
  } catch (e) {
    return fallback('chatTail', e);
  }
}

/** 最近 n 条点击(倒序由调用方处理,这里保持 rowid 升序=追加序) */
function clicksTail(n) {
  if (!enabled()) return null;
  try {
    return repoClicks.readTail(n);
  } catch (e) {
    return fallback('clicksTail', e);
  }
}

/** 点击全量(xlsx 导出用;表受保留期约束,可能比 5000 上限的数组更多历史) */
function clicksAll() {
  if (!enabled()) return null;
  try {
    return repoClicks.readAll();
  } catch (e) {
    return fallback('clicksAll', e);
  }
}

/** 最近 n 条 gate 信道报错 */
function gateErrorsTail(n) {
  if (!enabled()) return null;
  try {
    return repoErrors.readGateTail(n);
  } catch (e) {
    return fallback('gateErrorsTail', e);
  }
}

/** file 信道聚合报错全量(client_errors.json 的表侧等价) */
function fileErrorsAll() {
  if (!enabled()) return null;
  try {
    return repoErrors.readFileAll();
  } catch (e) {
    return fallback('fileErrorsAll', e);
  }
}

/** 最近 n 条访问明细 {t,id} */
function visitsTail(n) {
  if (!enabled()) return null;
  try {
    return repoVisits.readTail(n);
  } catch (e) {
    return fallback('visitsTail', e);
  }
}

// ===================== 写确认(落表行数差判定,失败一律回老路) =====================
// 注意:这些函数在 shadow.* 已经写完之后调用,只读 COUNT,不再写。
// COUNT 与 INSERT 同为同步 API,单进程内无并发窗口;测试替身把 shadow.* mock 成
// 不落表时,行数差=0 ⇒ 判未持久 ⇒ 老路落盘,行为与影子期一致(既有测试零改动)。

function confirmChat(before) {
  // 审计2修 P2-2:before<0 = 写前 COUNT 失败/停用 ⇒ 基线不可信,恒走老路落盘。
  // 旧写法在 COUNT 瞬时抛错(-1)后恢复时会误判 count>-1 恒真 ⇒ 未落表也跳 save,重启丢数据。
  if (!enabled() || !(before >= 0)) return false;
  try {
    const ok = repoChat.count() > before;
    if (ok) stats.skippedSaves++;
    return ok;
  } catch (e) {
    fallback('confirmChat', e);
    return false;
  }
}
function confirmClicks(before, n) {
  if (!enabled() || !(before >= 0)) return false; // 审计2修 P2-2:基线不可信恒老路
  try {
    const ok = repoClicks.count() >= before + n;
    if (ok) stats.skippedSaves++;
    return ok;
  } catch (e) {
    fallback('confirmClicks', e);
    return false;
  }
}
function confirmGateError(before) {
  if (!enabled() || !(before >= 0)) return false; // 审计2修 P2-2:基线不可信恒老路
  try {
    const ok = repoErrors.count(repoErrors.GATE) > before;
    if (ok) stats.skippedSaves++;
    return ok;
  } catch (e) {
    fallback('confirmGateError', e);
    return false;
  }
}
function confirmVisit(before) {
  if (!enabled() || !(before >= 0)) return false; // 审计2修 P2-2:基线不可信恒老路
  try {
    const ok = repoVisits.count() > before;
    if (ok) stats.skippedSaves++;
    return ok;
  } catch (e) {
    fallback('confirmVisit', e);
    return false;
  }
}

/** 写前取行数(停用/读不到时返回 -1,confirm* 对 -1 恒 false ⇒ 老路) */
function countChat() {
  if (!enabled()) return -1;
  try { return repoChat.count(); } catch { return -1; }
}
function countClicks() {
  if (!enabled()) return -1;
  try { return repoClicks.count(); } catch { return -1; }
}
function countGateErrors() {
  if (!enabled()) return -1;
  try { return repoErrors.count(repoErrors.GATE); } catch { return -1; }
}
function countVisits() {
  if (!enabled()) return -1;
  try { return repoVisits.count(); } catch { return -1; }
}

/** file 信道 upsert 的持久判定:新增看行数差,合并看该 id 的 lastT/count 是否跟上 */
function confirmFileError(before, item) {
  if (!enabled() || !item || !(before >= 0)) return false; // 审计2修 P2-2:基线不可信恒老路
  try {
    const now = repoErrors.count(repoErrors.FILE);
    if (now > before) {
      stats.skippedSaves++;
      return true;
    }
    // 合并分支:行数不变,查同 id 行的 last_t 是否 ≥ 内存条目(表侧 upsert 已覆盖)
    const rows = repoErrors.readFileRawAll();
    const hit = rows.find((r) => r.src_id === item.id);
    const ok = !!hit && (hit.last_t === null || hit.last_t >= (item.lastT || 0));
    if (ok) stats.skippedSaves++;
    return ok;
  } catch (e) {
    fallback('confirmFileError', e);
    return false;
  }
}
function countFileErrors() {
  if (!enabled()) return -1;
  try { return repoErrors.count(repoErrors.FILE); } catch { return -1; }
}

/** 观测面(只读):后台/探针用 */
function hotReadStats() {
  return {
    enabled: enabled(),
    disabled,
    envOff: process.env.HOT_READ === '0',
    fallbacks: stats.fallbacks,
    lastFallback: stats.lastFallback,
    skippedSaves: stats.skippedSaves,
  };
}

/** 测试钩子:复位回退闸与计数(用例之间互不牵连) */
function _reset() {
  disabled = false;
  stats.fallbacks = 0;
  stats.lastFallback = null;
  stats.skippedSaves = 0;
}

// ===================== 表 → 数组归并(审计2修 P2-3,2026-11-16)=====================
// 缺口:热写落表确认后跳过整库 saveGateData ⇒ gateData 快照(JSON/kv)长期滞后。
//   运行时读表抛错回退数组读到的是**内存态**(正确);但**重启**后 loadGateData 只读快照,
//   真表里的新行从不合并回数组 ⇒ HOT_READ=0(或启动对账 disable)时聊天/点击/访问读旧、
//   stats 聚合丢计数。修法:在"读源切回数组"的两个时刻把真表行归并回内存数组——
//   ① 启动时(server.js listen 回调,shadow.start 之后、对账之前);
//   ② disable() 时(运行时对账不一致回退)。
// 归并是**幂等并集**:按内容签名去重,表有数组无的补进数组(保持时间序),数组有表无的保留
//   (那是表写失败走老路落盘的,不能丢)。归并后由调用方落一次盘,快照即追上。
// 依赖纪律:本模块不 require store/client-errors(它们 require 本模块,反向成环);
//   gateData 与落盘函数由调用方注入(与 shadow.start(g) 同款)。

/** 内容签名:同一逻辑行在数组与表里字段值必然一致(影子写用同一对象引用) */
function sigChat(m) {
  return [m.ts, m.n, m.t, m.dk || '', m.admin ? 1 : 0, m.bot ? 1 : 0].join('|');
}
function sigVisit(v) { return [v.t, v.id || ''].join('|'); }
function sigClick(c) {
  return [c.t, c.dk || '', c.link || '', c.url || '', c.ip || '', JSON.stringify(c.pos || null)].join('|');
}
function sigGateErr(e) {
  return [e.t, e.dk || '', e.msg || '', e.src || '', e.line == null ? '' : e.line].join('|');
}

/**
 * 幂等并集归并:把真表行补进内存数组(数组有表无的保留)。
 * @param {object} g gateData(调用方注入)
 * @param {object} [opts] { fileErrors: {list,set} } —— file 信道聚合表由 client-errors 注入(防成环)
 * @returns {{chat:number,clicks:number,gateErrors:number,visits:number,fileErrors:number}} 各集合补入行数
 */
function mergeTablesIntoArrays(g, opts) {
  const added = { chat: 0, clicks: 0, gateErrors: 0, visits: 0, fileErrors: 0 };
  if (!g || !shadow.on()) return added; // 影子层停用 ⇒ 表不可信,不归并
  const merge = (arr, rows, sig, cap, tk) => {
    if (!Array.isArray(rows) || !rows.length) return 0;
    const seen = new Set((arr || []).map(sig));
    const fresh = rows.filter((r) => !seen.has(sig(r)));
    if (!fresh.length) return 0;
    const out = (arr || []).concat(fresh);
    out.sort((a, b) => (a[tk] || 0) - (b[tk] || 0)); // 保持时间序(数组消费方都按追加序)
    if (cap && out.length > cap) out.splice(0, out.length - cap);
    arr.length = 0;
    for (const r of out) arr.push(r); // 原地替换:保留数组引用(retention/对账都握它)
    return fresh.length;
  };
  try {
    if (!Array.isArray(g.chat)) g.chat = [];
    added.chat = merge(g.chat, repoChat.readAll(), sigChat, 100, 'ts');
  } catch (e) { fallback('merge.chat', e); }
  try {
    if (!Array.isArray(g.linkClicks)) g.linkClicks = [];
    added.clicks = merge(g.linkClicks, repoClicks.readAll(), sigClick, 5000, 't');
  } catch (e) { fallback('merge.clicks', e); }
  try {
    if (!Array.isArray(g.clientErrors)) g.clientErrors = [];
    added.gateErrors = merge(g.clientErrors, repoErrors.readGateTail(100000), sigGateErr, 500, 't');
  } catch (e) { fallback('merge.gateErrors', e); }
  try {
    if (!Array.isArray(g.visits)) g.visits = [];
    added.visits = merge(g.visits, repoVisits.readAll(), sigVisit, 1000, 't');
  } catch (e) { fallback('merge.visits', e); }
  // file 信道:聚合表按 id upsert,count/lastT 取表与数组的较大者(表是权威持久层)
  try {
    const fe = opts && opts.fileErrors;
    if (fe && Array.isArray(fe.list)) {
      const rows = repoErrors.readFileAll();
      const byId = new Map(fe.list.map((e) => [e.id, e]));
      for (const r of rows) {
        const cur = byId.get(r.id);
        if (!cur) { fe.list.push(r); byId.set(r.id, r); added.fileErrors++; }
        else if ((r.count || 0) > (cur.count || 0) || (r.lastT || 0) > (cur.lastT || 0)) {
          Object.assign(cur, r); added.fileErrors++;
        }
      }
      if (added.fileErrors && typeof fe.set === 'function') fe.set(fe.list);
    }
  } catch (e) { fallback('merge.fileErrors', e); }
  return added;
}

module.exports = {
  enabled, disable, setDisableHook, hotReadStats, _reset, mergeTablesIntoArrays,
  chatTail, clicksTail, clicksAll, gateErrorsTail, fileErrorsAll, visitsTail,
  countChat, countClicks, countGateErrors, countVisits, countFileErrors,
  confirmChat, confirmClicks, confirmGateError, confirmVisit, confirmFileError,
};