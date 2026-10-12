#!/usr/bin/env node
// table-parity.cjs — 影子表与 gateData 数组的**只读**对账工具(R1 第 2 步的验收尺子)
//
// ===================== 它回答什么问题 =====================
// "影子写到底写对了吗?" —— 逐集合比较 源数组/源小文件 与 对应真表 的行数与逐条内容。
// 这是"切读"(R1 第 2 步之后那一步)的**判据**:连续跑绿一周才允许把读路径搬进表。
//
// ===================== 只读,不改任何东西 =====================
// 数据库以 `readonly: true, fileMustExist: true` 打开:线上进程正在写也读得动(WAL),
// 既不会创建文件、也不会锁住写者。不执行任何 INSERT/UPDATE/DELETE/VACUUM。
//
// ===================== 判据(为什么不是"行数相等就通过")=====================
//   ① 源是**多重集**,表也是;比对方式是"按内容签名分组 + 组内贪心配时间戳",
//      不是按下标对齐 —— 因为两侧落库有先后(表先写、快照后写),读到的那一瞬
//      表完全可能比源**多 1 行在途写入**。按下标比会把这种正常在途当成缺陷。
//   ② 时间戳允许 **±1ms** 的写入差:本轮实现里源对象与表行用的是**同一个内存对象的同一个
//      字段**(见 lib/chat.js / lib/store.js / lib/track.js / lib/client-errors.js 的写入点),
//      所以实际应当逐位相等;±1ms 是给"以后哪一侧自己再取一次 Date.now()"留的余量,
//      超过 1ms 就是真差异。
//   ③ 表**只受保留期约束,不受各模块条数上限约束**(chat 100 / visits 1000 / errors 500 /
//      clicks 5000 是环形裁剪,超上限的最旧行只留在表里)。因此
//      "表比源多的行"默认是**正常现象,只报条数不判失败**;反过来"源有、表没有"才是差异。
//   ④ client_errors 表是**两条信道共用**:channel='gate' ↔ gateData.clientErrors(纯追加),
//      channel='file' ↔ client_errors.json(按 message+source+type 聚合、同 id 覆盖计数),
//      两条分别比对,不能合起来数总行数。
//   ⑤ 布尔/可选字段的归一:`admin: undefined` ≡ 缺省 ≡ false;`dk: null` ≡ 缺省。
//
// ===================== 退出码(机器可判,刻意不靠管道)=====================
//   0 = 一致(每个集合都通过;可能附带"表多 N 行历史/在途"的信息)
//   1 = 有差异(源里有表里没有的行,或逐条内容不吻合)
//   2 = **无法比对**(SQLite 未启用、库文件读不到、表还没建、快照读不出来、better-sqlite3 缺失)
// ⚠️ 调用方要单独取退出码判定:`cmd | tail` 的 $? 属于 tail,这仓库被咬过两次。
'use strict';

const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const EXIT = { OK: 0, DIFF: 1, UNKNOWN: 2 };
const TS_TOLERANCE_MS = 1; // 判据②:允许 ±1ms 的写入差
const SAMPLE_LIMIT = 3; // 每个集合最多打印几条差异样本

const repoChat = require(path.join(ROOT, 'lib/repo/chat.js'));
const repoClicks = require(path.join(ROOT, 'lib/repo/clicks.js'));
const repoErrors = require(path.join(ROOT, 'lib/repo/errors.js'));
const repoVisits = require(path.join(ROOT, 'lib/repo/visits.js'));

function log(...args) {
  console.log(...args);
}
function fail(...args) {
  console.log(...args);
}

/** 无法比对:打印原因并给出退出码 2(状态未知 ≠ 一致,也 ≠ 失败) */
function cannotCompare(reason) {
  fail('无法比对: ' + reason);
  fail('提示: 判据请用退出码本身(0 一致 / 1 有差异 / 2 无法比对),不要接管道后读 $?。');
  process.exit(EXIT.UNKNOWN);
}

// ===================== 路径解析(与 lib/store.js 的派生规则一致)=====================
const DATA_FILE = process.env.GATE_DATA_FILE || path.join(ROOT, 'gate_data.json');
const DB_FILE = process.env.SQLITE_PATH || DATA_FILE.replace(/\.json$/i, '.db');
const ERRORS_FILE = process.env.CLIENT_ERRORS_FILE || path.join(ROOT, 'client_errors.json');

function readSnapshot() {
  // 优先读 SQLite 里的权威快照(kv 单行),再退回 JSON 镜像(USE_SQLITE=0 时才是唯一来源)
  let db = null;
  try {
    const Database = require('better-sqlite3');
    db = new Database(DB_FILE, { readonly: true, fileMustExist: true });
  } catch (e) {
    return { db: null, error: e };
  }
  let snapshot = null;
  try {
    const row = db.prepare("SELECT value FROM kv WHERE key = 'gateData'").get();
    snapshot = row ? JSON.parse(row.value) : null;
  } catch (e) {
    snapshot = null;
  }
  if (!snapshot) {
    try {
      snapshot = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
      return { db, error: e, snapshot: null };
    }
  }
  return { db, error: null, snapshot };
}

// ===================== 归一与比对 =====================
function normText(v) {
  if (v === undefined || v === null) return '';
  return String(v);
}
function normBool(v) {
  return v ? true : false;
}
function normNum(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
function normObj(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'object') return v;
  return null;
}

/**
 * 「源里既可能是字符串、也可能是对象」的列(brand)用的归一。
 * ⚠️ 这里绝不能用 normText:String({brand:'Mac'}) 永远是 '[object Object]',
 *    于是**两个完全不同的品牌会互相吻合**,这样的对账等于没比
 *    (2026-10-13 线上第一次跑真数据就撞上:表侧存的是 JSON 文本、源侧是对象)。
 *    对象按"键排序后的 JSON"参与签名;文本里如果本来就是一段 JSON 也解析后同样处理,
 *    两侧因此落在同一个域里,又不会把差异抹平。
 */
function normAny(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return stableKey(v);
  const s = String(v);
  const t = s.trim();
  if (t[0] === '{' || t[0] === '[') {
    try { return stableKey(JSON.parse(t)); } catch (e) { return s; }
  }
  return s;
}

/** 时间戳字段单独取出来做 ±1ms 匹配,签名里只放内容 */
function splitTime(row, timeKey) {
  const t = row[timeKey];
  const rest = {};
  for (const k of Object.keys(row)) if (k !== timeKey) rest[k] = row[k];
  return { t: typeof t === 'number' ? t : null, sig: stableKey(rest), row, timeKey };
}

/** 稳定签名:键排序后 JSON,对象属性顺序不影响结果 */
function stableKey(obj) {
  return JSON.stringify(normalizeForSignature(obj));
}
function normalizeForSignature(v) {
  if (Array.isArray(v)) return v.map(normalizeForSignature);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) {
      const x = v[k];
      if (x === undefined) continue; // undefined 与"没有这个键"等价
      out[k] = normalizeForSignature(x);
    }
    return out;
  }
  return v;
}

/**
 * 多重集比对:源每一行都要在表里找到一行同签名、时间差 ≤ 容差的目标(一对一占用)。
 * @param {string} name 集合名
 * @param {Array} srcRows 源数组(已归一到表侧 mapRow 的形状)
 * @param {Array} tableRows 表行(同样已归一)
 * @param {string} timeKey 时间字段名
 */
function compareCollection(name, srcRows, tableRows, timeKey) {
  const res = { name, src: srcRows.length, table: tableRows.length, missing: 0, extra: 0, samples: [] };
  const buckets = new Map(); // sig -> 时间戳数组(升序,可用池)
  for (const row of tableRows) {
    const s = splitTime(row, timeKey);
    if (!buckets.has(s.sig)) buckets.set(s.sig, []);
    buckets.get(s.sig).push(s);
  }
  for (const pool of buckets.values()) pool.sort((a, b) => (a.t || 0) - (b.t || 0));

  for (const src of srcRows) {
    const s = splitTime(src, timeKey);
    const pool = buckets.get(s.sig);
    let matched = -1;
    if (pool) {
      let best = Infinity;
      for (let i = 0; i < pool.length; i++) {
        const cand = pool[i];
        if (cand.used) continue;
        const d = Math.abs((cand.t || 0) - (s.t || 0));
        if (d <= TS_TOLERANCE_MS && d < best) {
          best = d;
          matched = i;
        }
      }
    }
    if (matched < 0) {
      res.missing++;
      if (res.samples.length < SAMPLE_LIMIT) {
        res.samples.push({ kind: '源有表无', row: src });
      }
    } else if (pool) {
      pool[matched].used = true;
    }
  }
  for (const pool of buckets.values()) {
    for (const c of pool) {
      if (!c.used) {
        res.extra++;
        if (res.samples.filter((x) => x.kind === '表多出行').length < 1) {
          res.samples.push({ kind: '表多出行(条数上限之外的历史行或读到的那一瞬的在途写入,不判失败)', row: c.row });
        }
      }
    }
  }
  res.pass = res.missing === 0;
  return res;
}

function printResult(r) {
  const flag = r.pass ? '✓' : '✗';
  log(`  ${flag} ${r.name}: 源 ${r.src} 行 / 表 ${r.table} 行` +
    (r.missing ? ` —— 源里有 ${r.missing} 行在表里找不到` : '') +
    (r.extra ? ` (表多 ${r.extra} 行,不判失败)` : ''));
  for (const s of r.samples) {
    log('      · ' + s.kind + ': ' + clipRow(s.row));
  }
}

function clipRow(row) {
  const s = JSON.stringify(row);
  return s.length > 200 ? s.slice(0, 200) + '…' : s;
}

// ===================== 四个集合(源形状 -> 表形状的双向归一)=====================
function srcChat(g) {
  return (Array.isArray(g.chat) ? g.chat : []).map((m) => ({
    ts: normNum(m.ts),
    n: normText(m.n),
    t: normText(m.t),
    dk: m.dk === undefined || m.dk === null ? null : normText(m.dk),
    admin: normBool(m.admin),
    bot: normBool(m.bot),
  }));
}
function tableChat(rows) {
  return rows.map((r) => {
    const m = repoChat.mapRow(r);
    return {
      ts: normNum(m.ts),
      n: normText(m.n),
      t: normText(m.t),
      dk: m.dk === undefined || m.dk === null ? null : normText(m.dk),
      admin: normBool(m.admin),
      bot: normBool(m.bot),
    };
  });
}

function srcClicks(g) {
  return (Array.isArray(g.linkClicks) ? g.linkClicks : []).map((c) => ({
    t: normNum(c.t),
    dk: normText(c.dk),
    name: normText(c.name),
    ip: normText(c.ip),
    geo: normText(c.geo),
    ua: normText(c.ua),
    brand: normAny(c.brand),
    dev: normObj(c.dev) || {},
    fp: normObj(c.fp) || {},
    link: normText(c.link),
    url: normText(c.url),
    pos: normPos(c.pos),
  }));
}
function tableClicks(rows) {
  return rows.map((r) => {
    const c = repoClicks.mapRow(r);
    return {
      t: normNum(c.t),
      dk: normText(c.dk),
      name: normText(c.name),
      ip: normText(c.ip),
      geo: normText(c.geo),
      ua: normText(c.ua),
      brand: normAny(c.brand),
      dev: normObj(c.dev) || {},
      fp: normObj(c.fp) || {},
      link: normText(c.link),
      url: normText(c.url),
      pos: normPos(c.pos),
    };
  });
}
function normPos(pos) {
  if (!pos || typeof pos !== 'object') return null;
  return { x: normNum(pos.x) || 0, y: normNum(pos.y) || 0, z: normNum(pos.z) || 0 };
}

function srcGateErrors(g) {
  return (Array.isArray(g.clientErrors) ? g.clientErrors : []).map((e) => ({
    t: normNum(e.t),
    dk: normText(e.dk),
    name: normText(e.name),
    ip: normText(e.ip),
    brand: normAny(e.brand),
    msg: normText(e.msg),
    src: normText(e.src),
    line: normNum(e.line),
    ua: normText(e.ua),
  }));
}
function tableGateErrors(rows) {
  return rows.map((r) => {
    const e = repoErrors.mapGate(r);
    return {
      t: normNum(e.t),
      dk: normText(e.dk),
      name: normText(e.name),
      ip: normText(e.ip),
      brand: normAny(e.brand),
      msg: normText(e.msg),
      src: normText(e.src),
      line: normNum(e.line),
      ua: normText(e.ua),
    };
  });
}

function srcFileErrors(list) {
  return (Array.isArray(list) ? list : []).map((e) => ({
    id: normText(e.id),
    t: normNum(e.t) !== null ? normNum(e.t) : normNum(e.lastT),
    last_t: normNum(e.lastT),
    count: normNum(e.count) === null ? 1 : normNum(e.count),
    type: normText(e.type),
    message: normText(e.message),
    source: normText(e.source),
    lineno: normNum(e.lineno),
    colno: normNum(e.colno),
    stack: normText(e.stack),
    url: normText(e.url),
    view_mode: normText(e.viewMode),
    player_pos: normText(e.playerPos),
    world: normText(e.world),
    ua: normText(e.ua),
    ip: normText(e.ip),
  }));
}
function tableFileErrors(rows) {
  return rows.map((r) => {
    const e = repoErrors.mapFile(r);
    return {
      id: normText(e.id),
      t: normNum(e.t),
      last_t: normNum(e.lastT === undefined ? null : e.lastT),
      count: normNum(e.count) === null ? 1 : normNum(e.count),
      type: normText(e.type),
      message: normText(e.message),
      source: normText(e.source),
      lineno: normNum(e.lineno),
      colno: normNum(e.colno),
      stack: normText(e.stack),
      url: normText(e.url),
      view_mode: normText(e.viewMode),
      player_pos: normText(e.playerPos),
      world: normText(e.world),
      ua: normText(e.ua),
      ip: normText(e.ip),
    };
  });
}

function srcVisits(g) {
  return (Array.isArray(g.visits) ? g.visits : []).map((v) => ({ t: normNum(v.t), vid: v.id == null ? null : normText(v.id) }));
}
function tableVisits(rows) {
  return rows.map((r) => {
    const v = repoVisits.mapRow(r);
    return { t: normNum(v.t), vid: v.id == null ? null : normText(v.id) };
  });
}

// ===================== 主流程 =====================
function main() {
  log('[table-parity] 只读对账 —— 影子表 vs gateData / client_errors.json');
  log('  库: ' + DB_FILE);
  log('  源: ' + DATA_FILE + '(kv 读不到时回退这份 JSON 镜像)');

  if (process.env.USE_SQLITE === '0') {
    cannotCompare('USE_SQLITE=0 —— SQLite 未启用,影子层本来就不写表,没有可比的东西');
  }

  const loaded = readSnapshot();
  if (!loaded.db) {
    cannotCompare('打不开库文件(readonly): ' + ((loaded.error && loaded.error.message) || loaded.error) +
      ' —— 文件不存在/没有读权限/better-sqlite3 缺失都算这一类');
  }
  const db = loaded.db;
  if (!loaded.snapshot) {
    cannotCompare('读不到 gateData 快照(kv 里没有 gateData 行,JSON 镜像也读不出): ' +
      ((loaded.error && loaded.error.message) || ''));
  }
  const g = loaded.snapshot;

  // 表存在性:任何一张影子表没建起来都属于"无法比对"(还没跑迁移),不是"有差异"
  const migrate = require(path.join(ROOT, 'lib/migrate.js'));
  const missing = [];
  for (const t of ['chat_messages', 'click_events', 'client_errors', 'visits']) {
    if (!migrate.hasTable(db, t)) missing.push(t);
  }
  if (missing.length) {
    cannotCompare('表尚未建立: ' + missing.join(', ') + ' —— 启动迁移没跑过(server.js 的 shadow.start),或库不对');
  }

  let errorsList = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(ERRORS_FILE, 'utf8'));
    errorsList = Array.isArray(parsed.list) ? parsed.list : [];
  } catch {
    log('  · client_errors.json 读不到(' + ERRORS_FILE + '):按空列表处理 —— 这是正常状态,不判无法比对');
  }

  const read = (sql) => {
    try {
      return db.prepare(sql).all();
    } catch (e) {
      cannotCompare('读表失败: ' + ((e && e.message) || e));
      return [];
    }
  };

  const results = [
    compareCollection('chat_messages ← gateData.chat', srcChat(g), tableChat(read('SELECT * FROM chat_messages ORDER BY rowid')), 'ts'),
    compareCollection('click_events ← gateData.linkClicks', srcClicks(g), tableClicks(read('SELECT * FROM click_events ORDER BY rowid')), 't'),
    compareCollection("client_errors(channel='gate') ← gateData.clientErrors", srcGateErrors(g),
      tableGateErrors(read("SELECT * FROM client_errors WHERE channel = 'gate' ORDER BY rowid")), 't'),
    compareCollection("client_errors(channel='file') ← client_errors.json", srcFileErrors(errorsList),
      tableFileErrors(read("SELECT * FROM client_errors WHERE channel = 'file' ORDER BY rowid")), 't'),
    compareCollection('visits ← gateData.visits', srcVisits(g), tableVisits(read('SELECT * FROM visits ORDER BY rowid')), 't'),
  ];

  log('');
  log('逐集合比对(判据见文件头:表是"保留期内的全集",源数组另有条数上限,故只看"源有表无"):');
  for (const r of results) printResult(r);

  const bad = results.filter((r) => !r.pass);
  const totalMissing = bad.reduce((s, r) => s + r.missing, 0);
  log('');
  log('  schema 版本: ' + migrate.currentVersion(db) + ' / 已应用 ' + JSON.stringify(migrate.listApplied(db).map((a) => a.name)));
  if (bad.length) {
    fail('结果: 有差异 —— ' + bad.length + ' 个集合不吻合,共 ' + totalMissing + ' 行源里有表里没有');
    fail('处置: 这一阶段读路径仍走 gateData,不影响线上行为;差异要查影子写(见 lib/shadow.js 的 shadowStats)。');
    process.exit(EXIT.DIFF);
  }
  log('结果: 一致(退出码 0)—— 影子写与源集合逐条吻合;切读判据已具备,按"连续跑绿一周"的节奏推进。');
  process.exit(EXIT.OK);
}

try {
  main();
} catch (e) {
  // 任何未预期异常都归入"无法比对":工具本身坏掉不等于"有差异",更不等于"一致"
  cannotCompare('工具异常: ' + ((e && (e.stack || e.message)) || e));
}
