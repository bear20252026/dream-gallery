// sqlite-store.js — gateData SQLite 持久化引擎(2026-09-01 审计改进项#1)
// 设计说明(为什么是"整体快照"而不是逐行表):
//   现有代码以"内存 gateData 单对象 + 原地修改"为核心(store.js/gate.js/admin.js/abuse.js 等
//   十余个模块共几十处 gateData.xxx[...] = ... 直接赋值)。逐行 SQL 化需要重构全部调用点,
//   风险与当前收益不成比例。本模块只做一件事:把整个 gateData 快照以 WAL 事务写入 SQLite——
//   单事务原子写、崩溃安全(WAL + fsync)、去掉了 JSON 的 .tmp+rename 方案。
//   原适配层的"代理兼容层"已移除:代理每次读取返回新副本,与原地修改风格不兼容,会静默丢改动。
// 用法:store.js 在 USE_SQLITE=0 时跳过本模块(一键回滚开关);better-sqlite3 缺失时自动降级 JSON。
const ROOT = require('path').join(__dirname, '..');

let db = null;

/**
 * 打开数据库(WAL 模式)。失败一律降级返回 null,由调用方回退 JSON。
 * @param {string} dbPath - .db 文件路径
 */
function initDb(dbPath) {
  if (db) return db;
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch {
    console.warn('[sqlite] better-sqlite3 不可用,使用 JSON 存储(如需启用: npm i better-sqlite3)');
    return null;
  }
  try {
    db = new Database(dbPath || require('path').join(ROOT, 'gate_data.db'));
    db.pragma('journal_mode = WAL');  // 写前日志:并发读写性能好,崩溃后自动恢复
    db.pragma('synchronous = NORMAL'); // WAL 下 NORMAL 已保证事务持久性,性能更好
    db.exec(`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER DEFAULT (unixepoch())
      );
    `);
  } catch (e) {
    console.error('[sqlite] 打开数据库失败,降级 JSON 存储:', e.message);
    try { if (db) db.close(); } catch { /* ignore */ }
    db = null;
  }
  return db;
}

/**
 * 读取完整快照。空库/读取失败返回 null(调用方回退 JSON)。
 */
function loadAll() {
  if (!db) return null;
  try {
    const row = db.prepare('SELECT value FROM kv WHERE key = ?').get('gateData');
    return row ? JSON.parse(row.value) : null;
  } catch (e) {
    console.error('[sqlite] 读取失败,回退 JSON:', e.message);
    return null;
  }
}

/**
 * 原子写入完整快照(单事务)。失败返回 false(调用方继续写 JSON 镜像兜底)。
 */
function syncAll(data) {
  if (!db) return false;
  try {
    db.prepare('INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, unixepoch())')
      .run('gateData', JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('[sqlite] 写入失败(JSON 镜像仍会写入):', e.message);
    return false;
  }
}

function close() {
  if (db) { try { db.close(); } catch { /* ignore */ } db = null; }
}

module.exports = { initDb, loadAll, syncAll, close, available: () => !!db };
