// shadow.js — 影子双写层(R1 第 2 步):四个热集合在既有写入点"同写新表"
// ===================== 三条硬要求(违反任何一条都是引入新缺陷)=====================
//   ① **绝不抛异常**:better-sqlite3 是同步 API,任何一次 INSERT 失败(库锁死、磁盘满、列类型炸)
//      都会被 guard() 吞掉,只在**每种失败原因第一次**时 console.warn 一条并计数;热路径不刷屏。
//   ② **绝不改变响应码/响应体**:影子写只在既有写入点旁边加一次落表,不读表、不参与任何判定。
//      切读是下一阶段的事,判据是 scripts/admin/table-parity.cjs 连续跑绿。
//   ③ **绝不让请求路径变慢到可感知**:预编译语句缓存 + 点击沿用 track.js 的攒批(一批一个事务),
//      单行 INSERT 在 WAL 下是几十微秒量级。
//
// ===================== 两个总闸 =====================
//   SHADOW_WRITE=0  → 整个影子层停用(不建表、不写、不回填、不清表);读路径本来就不碰表,不受影响。
//   USE_SQLITE=0 / better-sqlite3 缺失 / sqlite.close() → sqlite.available() 为假 ⇒ 自动停用。
//
// ===================== 依赖方向 =====================
// 只 require ./sqlite-store、./migrate、./repo/*(全是叶子)。
// **绝不 require ./store / ./chat / ./track / ./client-errors**:上层已经 require 本模块,
// 反向引用就是循环依赖(depcruise no-circular 与运行时 TDZ 都会咬人)。需要 gateData /
// client_errors.json 的数据时,由调用方把数组**作为参数传进来**(见 start / backfillFileErrors)。
const sqlite = require('./sqlite-store');
const migrate = require('./migrate');
const repoChat = require('./repo/chat');
const repoClicks = require('./repo/clicks');
const repoErrors = require('./repo/errors');
const repoVisits = require('./repo/visits');

const BACKFILL_COLLECTIONS = {
  chat: { table: repoChat.TABLE, key: 'chat_messages' },
  linkClicks: { table: repoClicks.TABLE, key: 'click_events' },
  clientErrors: { table: repoErrors.TABLE + ':gate', key: 'client_errors_gate' },
  visits: { table: repoVisits.TABLE, key: 'visits' },
  fileErrors: { table: repoErrors.TABLE + ':file', key: 'client_errors_file' },
};

let schemaReady = false;
const stats = {
  schemaErrors: 0,
  lastError: null,
  writes: { chat: 0, clicks: 0, gateErrors: 0, fileErrors: 0, visits: 0 },
  failures: { chat: 0, clicks: 0, gateErrors: 0, fileErrors: 0, visits: 0 },
  skipped: { chat: 0, clicks: 0, gateErrors: 0, fileErrors: 0, visits: 0 }, // 畸形行(缺时间戳/缺主键)
  cleared: { clicks: 0, gateErrors: 0, fileErrors: 0 },
  pruned: { chat: 0, clicks: 0, errors: 0, visits: 0 },
  backfill: {},
};

/** SHADOW_WRITE 开关(默认开;'0' 一键停) */
function writeSwitchOn() {
  return process.env.SHADOW_WRITE !== '0';
}

/** 影子层是否活着 = 开关允许 ∧ SQLite 可用(USE_SQLITE=0 / better-sqlite3 缺失时自动停用) */
function on() {
  return writeSwitchOn() && sqlite.available();
}

/** 一次性告警:同一 reason 只 console.warn 一次,之后只计数(热路径不许刷屏) */
const warned = new Set();
function warnOnce(reason, e) {
  const detail = (e && (e.message || e)) || String(e);
  stats.lastError = reason + ': ' + detail;
  if (warned.has(reason)) return;
  warned.add(reason);
  console.warn('[shadow] ' + reason + ' 双写失败,已吞掉(业务无感知,读路径本来就不碰表):', detail,
    '—— 同类失败此后只计数不再刷屏;要整体停用影子写:SHADOW_WRITE=0(或 USE_SQLITE=0)。');
}

/**
 * 建表(幂等、惰性、只跑一次)。失败返回 false 并记一次告警——**绝不让调用方崩**。
 * 惰性是为了:即使某个入口没走 server.js 的 start(),第一次写之前也会把表建好。
 */
function ensureSchema() {
  if (schemaReady) return true;
  if (!sqlite.available()) return false;
  try {
    const report = migrate.runMigrations(sqlite.getDb());
    schemaReady = true;
    if (report.applied.length) {
      console.log('[shadow] 迁移完成 ' + report.from + ' -> ' + report.to + '(' + report.applied.join(', ') + ')');
    }
    return true;
  } catch (e) {
    stats.schemaErrors++;
    warnOnce('schema', e);
    return false;
  }
}

/**
 * 统一的写入包装:开关判定 + 惰性建表 + 吞异常 + 计数。返回 true 只表示"尝试过",不表示写成功。
 * @param {string} name 计数键
 * @param {Function} fn 真正干活体(返回落表行数)
 * @param {{skipCountsZero?:boolean}} [opts] skipCountsZero=false ⇒ 0 行算 skipped(畸形输入);
 *        清空类操作传 false 进去(本来就没行可清不是异常)。
 */
function guard(name, fn, opts) {
  const o = opts || {};
  const skipZero = o.skipCountsZero !== false;
  if (!on()) return false;
  if (!ensureSchema()) return false;
  try {
    const n = fn() || 0;
    if (skipZero && !n) stats.skipped[name] = (stats.skipped[name] || 0) + 1;
    stats.writes[name] = (stats.writes[name] || 0) + n;
    return true;
  } catch (e) {
    stats.failures[name] = (stats.failures[name] || 0) + 1;
    warnOnce(name, e);
    return false;
  }
}

// ===================== 四个写入点(与既有落库点一一对应)=====================

/** gateData.chat 的一条发言(lib/chat.js handleChatPost 与 summonBot 两处) */
function chat(msg) {
  return guard('chat', () => repoChat.insert(msg));
}

/** gateData.linkClicks 的一批点击(lib/track.js flushTrack —— **必须整批一次**,保住攒批语义) */
function clicks(batch) {
  return guard('clicks', () => repoClicks.insertMany(batch));
}

/** gateData.clientErrors 的一条(track.js handleTrackError,gate 信道) */
function gateError(rec) {
  return guard('gateErrors', () => repoErrors.insertGate(rec));
}

/** client_errors.json 的一条(lib/client-errors.js record,新增与合并计数都走 upsert) */
function fileError(item) {
  return guard('fileErrors', () => repoErrors.upsertFile(item));
}

/** gateData.visits 的一次访问(lib/store.js recordVisit) */
function visit(v) {
  return guard('visits', () => repoVisits.insert(v));
}

// ===================== 后台"清空"动作的镜像(数组清了表也得清,否则对账永远对不上)=====================
// skipCountsZero:false —— 本来就没行可清不是畸形,别记进 skipped。
function clearClicks() {
  return guard('clicks', () => {
    const n = repoClicks.removeAll();
    stats.cleared.clicks += n;
    return n;
  }, { skipCountsZero: false });
}
function clearGateErrors() {
  return guard('gateErrors', () => {
    const n = repoErrors.removeAll(repoErrors.GATE);
    stats.cleared.gateErrors += n;
    return n;
  }, { skipCountsZero: false });
}
function clearFileErrors() {
  return guard('fileErrors', () => {
    const n = repoErrors.removeAll(repoErrors.FILE);
    stats.cleared.fileErrors += n;
    return n;
  }, { skipCountsZero: false });
}

// ===================== 保留期裁剪(DG-PRIV-001:新表必须一起吃保留期)=====================
/**
 * 按时间维度裁剪四张表。**不产生任何全库快照落盘**(表删自己的,不调 saveGateData),
 * 所以 lib/retention.js 的"整轮清扫只一次 saveGateData()"纪律原样保持。
 * @param {{now:number, keepMs:object, preview?:boolean}} o
 *   keepMs:{ chat, linkClicks, clientErrors, visits }(毫秒,单一源仍是 lib/retention.js)
 * @returns {{chat:number,clicks:number,errors:number,visits:number}} 删掉(或将删)的行数
 */
function pruneTables(o) {
  const out = { chat: 0, clicks: 0, errors: 0, visits: 0 };
  if (!on()) return out; // SHADOW_WRITE=0 / SQLite 停用 ⇒ 表侧清扫同样停用
  const opt = o || {};
  const now = typeof opt.now === 'number' && isFinite(opt.now) ? opt.now : Date.now();
  const keep = opt.keepMs || {};
  const preview = !!opt.preview;
  const jobs = [
    ['chat', repoChat, keep.chat],
    ['clicks', repoClicks, keep.linkClicks],
    ['errors', repoErrors, keep.clientErrors],
    ['visits', repoVisits, keep.visits],
  ];
  for (const [name, repo, ms] of jobs) {
    try {
      if (!ensureSchema()) break;
      if (typeof ms !== 'number' || !isFinite(ms) || ms <= 0) continue; // 没给保留期就不删(宁可多留)
      const cutoff = now - ms;
      const n = preview ? repo.countOlderThan(cutoff) : repo.removeOlderThan(cutoff);
      out[name] = n || 0;
      if (!preview) stats.pruned[name] += out[name];
    } catch (e) {
      stats.failures.prunes = (stats.failures.prunes || 0) + 1;
      warnOnce('prune-' + name, e);
    }
  }
  return out;
}

// ===================== 一次性历史回填(sentinel + 空表双保险,重跑绝不重复灌)=====================
/** 该集合是否已经灌过(哨兵存在即永不再灌) */
function alreadyBackfilled(db, key) {
  try {
    const row = db.prepare('SELECT rows AS n FROM shadow_backfill WHERE collection = ?').get(key);
    return !!row;
  } catch {
    return false;
  }
}

function markBackfilled(db, key, rows) {
  db.prepare('INSERT OR IGNORE INTO shadow_backfill (collection, rows) VALUES (?, ?)').run(key, rows);
}

/**
 * 表为空 ∧ 源数组有历史数据 ∧ 没灌过 ⇒ 一次性灌进表(标 src='backfill')。
 * @returns {number} 灌入行数(0 = 什么都不做)
 */
function backfillOne(db, key, rowCount, list, insertFn) {
  if (alreadyBackfilled(db, key)) return 0;
  if (rowCount > 0) return 0; // 表里已经有行(可能是影子写先落进来的)⇒ 不回填,避免重复
  if (!Array.isArray(list) || !list.length) return 0; // 没有历史数据:标记留给后面(空表也不算灌过)
  const n = insertFn(list);
  markBackfilled(db, key, n);
  stats.backfill[key] = n;
  return n;
}

/**
 * client_errors.json 的聚合表回填(由 lib/client-errors.js 在自身加载后调用:
 * 本模块不许 require 它,否则会造出 client-errors→admin→store→shadow→client-errors 的环)。
 */
function backfillFileErrors(list) {
  if (!on()) return 0;
  if (!ensureSchema()) return 0;
  const db = sqlite.getDb();
  try {
    return backfillOne(db, BACKFILL_COLLECTIONS.fileErrors.key, repoErrors.count(repoErrors.FILE), list,
      (rows) => repoErrors.upsertFileMany(rows, { src: 'backfill' }));
  } catch (e) {
    stats.failures.backfill = (stats.failures.backfill || 0) + 1;
    warnOnce('backfill-fileErrors', e);
    return 0;
  }
}

/**
 * 影子层启动:建表(按版本前进)+ 一次性回填四个 gateData 集合。
 * 由 server.js 的 listen 回调调用(与保留期清扫、R2 台账同一个位置:
 * 反向依赖 store 的模块都只在入口层接,避免底座成环)。
 * @param {object} g gateData(store.js 传进来)
 * @returns {{enabled:boolean,schema:object,backfill:object,reason?:string}}
 */
function start(g) {
  const report = { enabled: false, schema: null, backfill: {}, reason: null };
  if (!writeSwitchOn()) {
    report.reason = 'SHADOW_WRITE=0';
    return report;
  }
  if (!sqlite.available()) {
    report.reason = 'sqlite-unavailable';
    return report;
  }
  report.enabled = true;
  try {
    const db = sqlite.getDb();
    report.schema = migrate.runMigrations(db);
    schemaReady = true;
    const gateData = g || {};
    const jobs = [
      [BACKFILL_COLLECTIONS.chat.key, repoChat.count(), gateData.chat, (l) => repoChat.insertMany(l, { src: 'backfill' })],
      [BACKFILL_COLLECTIONS.linkClicks.key, repoClicks.count(), gateData.linkClicks, (l) => repoClicks.insertMany(l, { src: 'backfill' })],
      [BACKFILL_COLLECTIONS.clientErrors.key, repoErrors.count(repoErrors.GATE), gateData.clientErrors, (l) => repoErrors.insertGateMany(l, { src: 'backfill' })],
      [BACKFILL_COLLECTIONS.visits.key, repoVisits.count(), gateData.visits, (l) => repoVisits.insertMany(l, { src: 'backfill' })],
    ];
    for (const [key, rowCount, list, insertFn] of jobs) {
      try {
        report.backfill[key] = backfillOne(db, key, rowCount, list, insertFn);
      } catch (e) {
        stats.failures.backfill = (stats.failures.backfill || 0) + 1;
        warnOnce('backfill-' + key, e);
        report.backfill[key] = 0;
      }
    }
  } catch (e) {
    stats.schemaErrors++;
    warnOnce('start', e);
    report.reason = (e && e.message) || String(e);
  }
  return report;
}

/** 观测面(只读):对账脚本、后台面板、单测都用这一个读数口 */
function shadowStats() {
  return {
    on: on(),
    writeSwitchOn: writeSwitchOn(),
    sqliteAvailable: sqlite.available(),
    schemaReady,
    version: schemaReady ? migrate.currentVersion(sqlite.getDb()) : 0,
    tables: {
      chat_messages: safeCount(() => repoChat.count()),
      click_events: safeCount(() => repoClicks.count()),
      client_errors: safeCount(() => repoErrors.count()),
      visits: safeCount(() => repoVisits.count()),
    },
    writes: Object.assign({}, stats.writes),
    failures: Object.assign({}, stats.failures),
    skipped: Object.assign({}, stats.skipped),
    cleared: Object.assign({}, stats.cleared),
    pruned: Object.assign({}, stats.pruned),
    backfill: Object.assign({}, stats.backfill),
    schemaErrors: stats.schemaErrors,
    lastError: stats.lastError,
  };
}

function safeCount(fn) {
  if (!sqlite.available()) return -1; // -1 = 读不到(SQLite 未启用),与"0 行"区分
  try {
    return fn();
  } catch {
    return -1;
  }
}

/** 测试钩子:清空计数与"只告警一次"的记忆(不同用例之间要能复位) */
function _resetStats() {
  for (const k of Object.keys(stats.writes)) {
    stats.writes[k] = 0;
    stats.failures[k] = 0;
    stats.skipped[k] = 0;
  }
  stats.cleared = { clicks: 0, gateErrors: 0, fileErrors: 0 };
  stats.pruned = { chat: 0, clicks: 0, errors: 0, visits: 0 };
  stats.backfill = {};
  stats.schemaErrors = 0;
  stats.lastError = null;
  warned.clear();
}

/** 测试钩子:强制"表已建好"的 memo 复位(换库/重开库后要重新迁移) */
function _dropSchemaReady() {
  schemaReady = false;
}

module.exports = {
  on, start, ensureSchema,
  chat, clicks, gateError, fileError, visit,
  clearClicks, clearGateErrors, clearFileErrors,
  pruneTables, backfillFileErrors, shadowStats,
  SHADOW_TABLES: ['chat_messages', 'click_events', 'client_errors', 'visits'],
  _resetStats, _dropSchemaReady,
};
