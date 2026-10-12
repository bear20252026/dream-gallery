// migrate.js — 版本化迁移器(R1 第 1 步:审计挂账「SQLite 真表结构化」的地基)
// ===================== 为什么需要它 =====================
// lib/sqlite-store.js 过去只有一张 kv 表(整个 gateData 塞单行),没有"库结构版本"这个概念。
// 一旦引入真表,就必须回答"线上库现在是什么结构、能不能安全往前推"——这就是 schema_version。
//
// ===================== 纪律(路线图明文,不是建议)=====================
//   ① 迁移文件 = lib/migrations/<NNN>_<名字>.sql,数字前缀即版本号,**单向前进**;
//   ② SQL 只能加表 / 加索引(CREATE ... IF NOT EXISTS),**禁止任何破坏性 ALTER**
//      (DROP / RENAME / 改列类型 / TRUNCATE)。迁移器不做静态审查,靠 review + 幂等写法兜住;
//      想删列就等于"从此不再读它",留列。
//   ③ 已应用的版本号不再重跑;文件内容改了但版本号没加 ⇒ **拒绝执行并点名**(防止线上
//      "悄悄改了个已经跑过的迁移"),见 verifyAppliedIntegrity。
//   ④ 每个迁移在一个事务里执行:better-sqlite3 的 db.exec 支持多语句,DDL 在事务内合法。
//
// ===================== 依赖方向 =====================
// 只依赖 Node 内置 fs/path + 调用方传进来的 db 句柄。**绝不 require 任何 lib/ 上层模块**
// (store/chat/track…):迁移器是底座,反向 require 会造出循环依赖(depcruise no-circular 是硬闸)。
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const FILE_RE = /^(\d+)_[^/\\]+\.sql$/;

// ===================== 迁移器自己的两张记账表(幂等,非破坏)=====================
// schema_version:已应用的版本号 + 文件名 + 应用时刻。
// shadow_backfill:一次性历史回填的哨兵(每个集合最多灌一次;重跑绝不重复灌,详见 shadow.js)。
const META_DDL = `
CREATE TABLE IF NOT EXISTS schema_version (
  version    INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  checksum   TEXT    NOT NULL,
  applied_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS shadow_backfill (
  collection TEXT    PRIMARY KEY,
  rows       INTEGER NOT NULL,
  done_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
`;

/** 迁移文件内容的短摘要:用来发现"改了一个已经跑过的迁移" */
function checksum(sql) {
  return require('crypto').createHash('sha256').update(sql).digest('hex').slice(0, 16);
}

/**
 * 扫描迁移目录,按版本号升序返回待用清单。
 * @returns {Array<{version:number,name:string,file:string,sql:string}>}
 * @throws 版本号重复、或文件名不合 <NNN>_<name>.sql 规范时抛错(宁可启动失败也不猜)
 */
function plan(dir) {
  const d = dir || MIGRATIONS_DIR;
  let entries = [];
  try {
    entries = fs.readdirSync(d);
  } catch (e) {
    throw new Error('[migrate] 迁移目录不可读 ' + d + ': ' + (e && e.message), { cause: e });
  }
  const out = [];
  const seen = new Set();
  for (const name of entries.filter((n) => FILE_RE.test(n)).sort()) {
    const version = Number(name.match(FILE_RE)[1]);
    if (seen.has(version)) throw new Error('[migrate] 版本号重复:' + name);
    seen.add(version);
    out.push({
      version,
      name: name.replace(/\.sql$/, ''),
      file: path.join(d, name),
      sql: fs.readFileSync(path.join(d, name), 'utf8'),
    });
  }
  return out;
}

/** 建迁移器自己的记账表(幂等) */
function ensureMetaTables(db) {
  db.exec(META_DDL);
}

/** 当前库里的版本号(表不存在/无记录 => 0) */
function currentVersion(db) {
  try {
    const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get();
    return row && typeof row.v === 'number' ? row.v : 0;
  } catch {
    return 0; // schema_version 还没建:等价于 0 版
  }
}

/** 已应用记录的摘要校验:同版本号但内容变了 => 抛错(绝不能"悄悄重跑/略过") */
function verifyAppliedIntegrity(db, migrations) {
  const bad = [];
  const stmt = db.prepare('SELECT name, checksum FROM schema_version WHERE version = ?');
  for (const m of migrations) {
    let row = null;
    try {
      row = stmt.get(m.version);
    } catch {
      continue; // schema_version 还不存在:后面 ensureMetaTables 之后才有意义
    }
    if (row && row.checksum && row.checksum !== checksum(m.sql)) {
      bad.push(m.name + '(库里记的是 ' + row.checksum + ',磁盘上是 ' + checksum(m.sql) + ')');
    }
  }
  if (bad.length) {
    throw new Error('[migrate] 已应用的迁移文件被改过,拒绝继续(请新增一个版本号,不要改历史): ' + bad.join(', '));
  }
}

/**
 * 按版本前进地跑完所有未应用的迁移。
 * @param {object} db better-sqlite3 句柄
 * @param {{dir?:string}} [opts]
 * @returns {{from:number,to:number,applied:string[],checked:number}}
 * @throws 迁移执行失败 / 历史迁移被改过 —— 由调用方(shadow.js)捕获,绝不让请求路径或启动崩掉
 */
function runMigrations(db, opts) {
  if (!db) throw new Error('[migrate] 没有数据库句柄(SQLite 未启用?)');
  ensureMetaTables(db);
  const migrations = plan(opts && opts.dir);
  verifyAppliedIntegrity(db, migrations);
  const from = currentVersion(db);
  const applied = [];
  const ins = db.prepare('INSERT INTO schema_version (version, name, checksum) VALUES (?, ?, ?)');
  for (const m of migrations) {
    if (m.version <= from) continue;
    db.transaction(() => {
      db.exec(m.sql);
      ins.run(m.version, m.name, checksum(m.sql));
    })();
    applied.push(m.name);
  }
  return { from, to: currentVersion(db), applied, checked: migrations.length };
}

/** 表存在性检查(只读工具用:对账脚本要靠它区分"没迁移"与"迁移了但没数据") */
function hasTable(db, name) {
  try {
    const row = db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
    return !!row;
  } catch {
    return false;
  }
}

/** 迁移台账概览(只读诊断用) */
function listApplied(db) {
  try {
    return db.prepare('SELECT version, name, checksum, applied_at FROM schema_version ORDER BY version').all();
  } catch {
    return [];
  }
}

module.exports = {
  MIGRATIONS_DIR, plan, runMigrations, currentVersion, ensureMetaTables,
  verifyAppliedIntegrity, hasTable, listApplied, checksum, META_TABLES: ['schema_version', 'shadow_backfill'],
};
