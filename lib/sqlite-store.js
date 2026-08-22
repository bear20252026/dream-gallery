// sqlite-store.js — SQLite 存储适配层(2026-08-22 大厂标准)
// 替代 gate_data.json 单文件存储,解决并发写入问题
// 用法: 设置环境变量 USE_SQLITE=1 启用;默认仍用 JSON 文件
// 依赖: better-sqlite3 (npm install better-sqlite3)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DB_PATH = process.env.SQLITE_PATH || path.join(ROOT, 'gate_data.db');

let db = null;

/**
 * 初始化 SQLite 数据库
 * @returns {Object} better-sqlite3 实例
 */
function initDb() {
  if (db) return db;

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch {
    console.error('[sqlite] better-sqlite3 未安装,回退到 JSON 存储');
    return null;
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL'); // 写前日志,并发读写性能好
  db.pragma('synchronous = NORMAL'); // 平衡安全和性能

  // 创建表
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS applicants (
      vid TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      dk TEXT,
      ua TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS blocked_ips (
      ip TEXT PRIMARY KEY,
      reason TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS watch_ips (
      ip TEXT PRIMARY KEY,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      vid TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data TEXT NOT NULL,
      dismissed INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS admin_chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dk TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vid TEXT,
      data TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_applicants_dk ON applicants(dk);
    CREATE INDEX IF NOT EXISTS idx_applicants_ua ON applicants(ua);
    CREATE INDEX IF NOT EXISTS idx_visits_ts ON visits(ts);
    CREATE INDEX IF NOT EXISTS idx_visits_vid ON visits(vid);
    CREATE INDEX IF NOT EXISTS idx_alerts_dismissed ON alerts(dismissed);
    CREATE INDEX IF NOT EXISTS idx_admin_chats_dk ON admin_chats(dk);
  `);

  console.log('[sqlite] 数据库已初始化:', DB_PATH);
  return db;
}

/**
 * 从 JSON 文件迁移到 SQLite
 * @param {string} jsonPath - gate_data.json 路径
 */
function migrateFromJson(jsonPath) {
  const d = initDb();
  if (!d) return false;

  let data;
  try {
    data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch {
    console.warn('[sqlite] JSON 文件读取失败,跳过迁移');
    return false;
  }

  const upsertKv = d.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)');
  const upsertApplicant = d.prepare('INSERT OR REPLACE INTO applicants (vid, data, dk, ua) VALUES (?, ?, ?, ?)');
  const upsertBlocked = d.prepare('INSERT OR IGNORE INTO blocked_ips (ip) VALUES (?)');
  const upsertWatch = d.prepare('INSERT OR IGNORE INTO watch_ips (ip) VALUES (?)');
  const insertVisit = d.prepare('INSERT INTO visits (ts, vid) VALUES (?, ?)');
  const insertAlert = d.prepare('INSERT INTO alerts (data, dismissed) VALUES (?, ?)');
  const insertChat = d.prepare('INSERT INTO admin_chats (dk, data) VALUES (?, ?)');
  const insertQuiz = d.prepare('INSERT INTO quiz_attempts (data) VALUES (?)');
  const insertUpload = d.prepare('INSERT INTO uploads (vid, data) VALUES (?, ?)');

  const txn = d.transaction(() => {
    // 迁移 KV 数据
    if (data.secret) upsertKv.run('secret', data.secret);
    if (data.stats) upsertKv.run('stats', JSON.stringify(data.stats));
    if (data._visitRate) upsertKv.run('_visitRate', JSON.stringify(data._visitRate));

    // 迁移申请人
    if (data.applicants) {
      for (const [vid, appData] of Object.entries(data.applicants)) {
        upsertApplicant.run(vid, JSON.stringify(appData), appData.dk || null, appData.ua || null);
      }
    }

    // 迁移黑名单
    if (data.blockedIps) {
      for (const ip of data.blockedIps) {
        upsertBlocked.run(ip);
      }
    }

    // 迁移关注列表
    if (data.watchIps) {
      for (const ip of data.watchIps) {
        upsertWatch.run(ip);
      }
    }

    // 迁移访问日志
    if (data.visits) {
      for (const v of data.visits) {
        insertVisit.run(v.t, v.id || null);
      }
    }

    // 迁移预警
    if (data.alerts) {
      for (const a of data.alerts) {
        insertAlert.run(JSON.stringify(a), a.dismissed ? 1 : 0);
      }
    }

    // 迁移管理聊天
    if (data.adminChats) {
      for (const [dk, chats] of Object.entries(data.adminChats)) {
        for (const chat of chats) {
          insertChat.run(dk, JSON.stringify(chat));
        }
      }
    }

    // 迁移答题记录
    if (data.quizAttempts) {
      for (const qa of data.quizAttempts) {
        insertQuiz.run(JSON.stringify(qa));
      }
    }

    // 迁移上传记录
    if (data.uploads) {
      for (const [vid, uploadData] of Object.entries(data.uploads)) {
        insertUpload.run(vid, JSON.stringify(uploadData));
      }
    }
  });

  txn();
  console.log('[sqlite] 迁移完成,共迁移:', {
    applicants: data.applicants ? Object.keys(data.applicants).length : 0,
    visits: data.visits ? data.visits.length : 0,
    alerts: data.alerts ? data.alerts.length : 0,
  });
  return true;
}

// ===================== KV 操作 =====================

function getSecret() {
  const d = initDb();
  if (!d) return null;
  const row = d.prepare('SELECT value FROM kv WHERE key = ?').get('secret');
  if (!row) {
    const secret = crypto.randomBytes(24).toString('hex');
    d.prepare('INSERT INTO kv (key, value) VALUES (?, ?)').run('secret', secret);
    return secret;
  }
  return row.value;
}

function getStats() {
  const d = initDb();
  if (!d) return { total: 0, byDay: {} };
  const row = d.prepare('SELECT value FROM kv WHERE key = ?').get('stats');
  return row ? JSON.parse(row.value) : { total: 0, byDay: {} };
}

function setStats(stats) {
  const d = initDb();
  if (!d) return;
  d.prepare('INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, unixepoch())')
    .run('stats', JSON.stringify(stats));
}

function getVisitRate() {
  const d = initDb();
  if (!d) return {};
  const row = d.prepare('SELECT value FROM kv WHERE key = ?').get('_visitRate');
  return row ? JSON.parse(row.value) : {};
}

function setVisitRate(rate) {
  const d = initDb();
  if (!d) return;
  d.prepare('INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, unixepoch())')
    .run('_visitRate', JSON.stringify(rate));
}

// ===================== 申请人操作 =====================

function getApplicant(vid) {
  const d = initDb();
  if (!d) return null;
  const row = d.prepare('SELECT data FROM applicants WHERE vid = ?').get(vid);
  return row ? JSON.parse(row.data) : null;
}

function setApplicant(vid, data) {
  const d = initDb();
  if (!d) return;
  d.prepare('INSERT OR REPLACE INTO applicants (vid, data, dk, ua, updated_at) VALUES (?, ?, ?, ?, unixepoch())')
    .run(vid, JSON.stringify(data), data.dk || null, data.ua || null);
}

function getAllApplicants() {
  const d = initDb();
  if (!d) return {};
  const rows = d.prepare('SELECT vid, data FROM applicants').all();
  const result = {};
  for (const row of rows) {
    result[row.vid] = JSON.parse(row.data);
  }
  return result;
}

function findByDk(dk) {
  const d = initDb();
  if (!d) return null;
  const rows = d.prepare('SELECT vid, data FROM applicants WHERE dk = ?').all(dk);
  let best = null, bestId = null;
  for (const row of rows) {
    const a = JSON.parse(row.data);
    if (!best || a.applyTime > best.applyTime) { best = a; bestId = row.vid; }
  }
  return best ? { id: bestId, a: best } : null;
}

function findByUa(ua) {
  const d = initDb();
  if (!d) return null;
  const rows = d.prepare('SELECT vid, data FROM applicants WHERE ua = ?').all(ua);
  let best = null, bestId = null;
  for (const row of rows) {
    const a = JSON.parse(row.data);
    if (!best || a.applyTime > best.applyTime) { best = a; bestId = row.vid; }
  }
  return best ? { id: bestId, a: best } : null;
}

// ===================== IP 操作 =====================

function isBlockedIp(ip) {
  const d = initDb();
  if (!d) return false;
  return !!d.prepare('SELECT 1 FROM blocked_ips WHERE ip = ?').get(ip);
}

function addBlockedIp(ip, reason) {
  const d = initDb();
  if (!d) return;
  d.prepare('INSERT OR IGNORE INTO blocked_ips (ip, reason) VALUES (?, ?)').run(ip, reason || null);
}

function removeBlockedIp(ip) {
  const d = initDb();
  if (!d) return;
  d.prepare('DELETE FROM blocked_ips WHERE ip = ?').run(ip);
}

function getBlockedIps() {
  const d = initDb();
  if (!d) return [];
  return d.prepare('SELECT ip, reason FROM blocked_ips').all();
}

function isWatchIp(ip) {
  const d = initDb();
  if (!d) return false;
  return !!d.prepare('SELECT 1 FROM watch_ips WHERE ip = ?').get(ip);
}

function addWatchIp(ip) {
  const d = initDb();
  if (!d) return;
  d.prepare('INSERT OR IGNORE INTO watch_ips (ip) VALUES (?)').run(ip);
}

function removeWatchIp(ip) {
  const d = initDb();
  if (!d) return;
  d.prepare('DELETE FROM watch_ips WHERE ip = ?').run(ip);
}

function getWatchIps() {
  const d = initDb();
  if (!d) return [];
  return d.prepare('SELECT ip FROM watch_ips').all().map(r => r.ip);
}

// ===================== 访问日志 =====================

function addVisit(vid) {
  const d = initDb();
  if (!d) return;
  d.prepare('INSERT INTO visits (ts, vid) VALUES (?, ?)').run(Date.now(), vid || null);
}

function getVisits(limit = 1000) {
  const d = initDb();
  if (!d) return [];
  return d.prepare('SELECT ts, vid FROM visits ORDER BY ts DESC LIMIT ?').all(limit);
}

function cleanupOldVisits(keepCount = 1000) {
  const d = initDb();
  if (!d) return;
  d.prepare(`
    DELETE FROM visits WHERE id NOT IN (
      SELECT id FROM visits ORDER BY ts DESC LIMIT ?
    )
  `).run(keepCount);
}

// ===================== 预警 =====================

function addAlert(alert) {
  const d = initDb();
  if (!d) return;
  d.prepare('INSERT INTO alerts (data, dismissed) VALUES (?, 0)').run(JSON.stringify(alert));
  cleanupOldAlerts();
}

function getAlerts(includeDismissed = false) {
  const d = initDb();
  if (!d) return [];
  const where = includeDismissed ? '' : 'WHERE dismissed = 0';
  const rows = d.prepare(`SELECT id, data, dismissed FROM alerts ${where} ORDER BY id DESC`).all();
  return rows.map(r => ({ ...JSON.parse(r.data), _id: r.id, dismissed: !!r.dismissed }));
}

function dismissAlert(id) {
  const d = initDb();
  if (!d) return;
  d.prepare('UPDATE alerts SET dismissed = 1 WHERE id = ?').run(id);
}

function clearAlerts() {
  const d = initDb();
  if (!d) return;
  d.prepare('DELETE FROM alerts').run();
}

function cleanupOldAlerts(keepCount = 500) {
  const d = initDb();
  if (!d) return;
  d.prepare(`
    DELETE FROM alerts WHERE id NOT IN (
      SELECT id FROM alerts ORDER BY id DESC LIMIT ?
    )
  `).run(keepCount);
}

// ===================== 管理聊天 =====================

function addAdminChat(dk, chat) {
  const d = initDb();
  if (!d) return;
  d.prepare('INSERT INTO admin_chats (dk, data) VALUES (?, ?)').run(dk, JSON.stringify(chat));
  cleanupOldChats(dk);
}

function getAdminChats(dk, limit = 200) {
  const d = initDb();
  if (!d) return [];
  const rows = d.prepare('SELECT data FROM admin_chats WHERE dk = ? ORDER BY id DESC LIMIT ?').all(dk, limit);
  return rows.map(r => JSON.parse(r.data)).reverse();
}

function cleanupOldChats(dk, keepCount = 200) {
  const d = initDb();
  if (!d) return;
  d.prepare(`
    DELETE FROM admin_chats WHERE dk = ? AND id NOT IN (
      SELECT id FROM admin_chats WHERE dk = ? ORDER BY id DESC LIMIT ?
    )
  `).run(dk, dk, keepCount);
}

// ===================== 答题记录 =====================

function addQuizAttempt(attempt) {
  const d = initDb();
  if (!d) return;
  d.prepare('INSERT INTO quiz_attempts (data) VALUES (?)').run(JSON.stringify(attempt));
}

function getQuizAttempts(limit = 100) {
  const d = initDb();
  if (!d) return [];
  const rows = d.prepare('SELECT data FROM quiz_attempts ORDER BY id DESC LIMIT ?').all(limit);
  return rows.map(r => JSON.parse(r.data)).reverse();
}

// ===================== 上传记录 =====================

function addUpload(vid, upload) {
  const d = initDb();
  if (!d) return;
  d.prepare('INSERT INTO uploads (vid, data) VALUES (?, ?)').run(vid, JSON.stringify(upload));
}

function getUploadsByVid(vid) {
  const d = initDb();
  if (!d) return [];
  const rows = d.prepare('SELECT data FROM uploads WHERE vid = ? ORDER BY id DESC').all(vid);
  return rows.map(r => JSON.parse(r.data));
}

function getAllUploads() {
  const d = initDb();
  if (!d) return {};
  const rows = d.prepare('SELECT vid, data FROM uploads ORDER BY id').all();
  const result = {};
  for (const row of rows) {
    if (!result[row.vid]) result[row.vid] = [];
    result[row.vid].push(JSON.parse(row.data));
  }
  return result;
}

// ===================== 兼容层:模拟 gateData 对象 =====================

/**
 * 创建兼容 gateData 的代理对象
 * 保持现有代码中 gateData.xxx 的访问方式不变
 */
function createGateDataProxy() {
  const d = initDb();
  if (!d) return null;

  return {
    get secret() { return getSecret(); },
    set secret(v) { /* secret 不允许直接设置 */ },

    get applicants() { return getAllApplicants(); },
    set applicants(v) { /* 不允许直接设置 */ },

    get stats() { return getStats(); },
    set stats(v) { setStats(v); },

    get blockedIps() { return getBlockedIps(); },
    set blockedIps(v) {
      const d = initDb();
      if (!d) return;
      d.prepare('DELETE FROM blocked_ips').run();
      for (const ip of v) addBlockedIp(ip);
    },

    get watchIps() { return getWatchIps(); },
    set watchIps(v) {
      const d = initDb();
      if (!d) return;
      d.prepare('DELETE FROM watch_ips').run();
      for (const ip of v) addWatchIp(ip);
    },

    get visits() { return getVisits(); },
    set visits(v) { /* 不允许直接设置 */ },

    get alerts() { return getAlerts(true); },
    set alerts(v) { /* 不允许直接设置 */ },

    get adminChats() {
      const d = initDb();
      if (!d) return {};
      const rows = d.prepare('SELECT dk, data FROM admin_chats ORDER BY id').all();
      const result = {};
      for (const row of rows) {
        if (!result[row.dk]) result[row.dk] = [];
        result[row.dk].push(JSON.parse(row.data));
      }
      return result;
    },
    set adminChats(v) { /* 不允许直接设置 */ },

    get quizAttempts() { return getQuizAttempts(); },
    set quizAttempts(v) { /* 不允许直接设置 */ },

    get uploads() {
      const d = initDb();
      if (!d) return {};
      const rows = d.prepare('SELECT vid, data FROM uploads ORDER BY id').all();
      const result = {};
      for (const row of rows) {
        if (!result[row.vid]) result[row.vid] = [];
        result[row.vid].push(JSON.parse(row.data));
      }
      return result;
    },
    set uploads(v) { /* 不允许直接设置 */ },

    // 方法
    get _visitRate() { return getVisitRate(); },
    set _visitRate(v) { setVisitRate(v); },
  };
}

// ===================== 工具函数 =====================

function todayStr() {
  var d = new Date();
  var yyyy = d.getFullYear();
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return yyyy + '-' + mm + '-' + dd;
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  // 初始化
  initDb,
  migrateFromJson,
  close,
  isAvailable: () => !!db,

  // KV
  getSecret,
  getStats,
  setStats,
  getVisitRate,
  setVisitRate,

  // 申请人
  getApplicant,
  setApplicant,
  getAllApplicants,
  findByDk,
  findByUa,

  // IP
  isBlockedIp,
  addBlockedIp,
  removeBlockedIp,
  getBlockedIps,
  isWatchIp,
  addWatchIp,
  removeWatchIp,
  getWatchIps,

  // 访问
  addVisit,
  getVisits,
  cleanupOldVisits,

  // 预警
  addAlert,
  getAlerts,
  dismissAlert,
  clearAlerts,

  // 聊天
  addAdminChat,
  getAdminChats,

  // 答题
  addQuizAttempt,
  getQuizAttempts,

  // 上传
  addUpload,
  getUploadsByVid,
  getAllUploads,

  // 兼容层
  createGateDataProxy,
  todayStr,
};
