// _db.js — repo 层共用原语:取句柄 + 预编译语句缓存 + JSON 列编解码
// ===================== 依赖方向(repo 层是叶子,不是上层)=====================
// 只 require ../sqlite-store(它自己只依赖 Node 内置 path)。
// **禁止** require ../store / ../chat / ../track 等上层模块:repo 被它们调用,反向引用就是循环
// (depcruise no-circular 是硬闸,而静态扫 require——函数内延迟 require 也断不开环)。
// 因此 repo 的入参一律是"已经拆好的纯数据行",不感知 gateData。
const sqlite = require('../sqlite-store');

/** 取当前 db 句柄;SQLite 未启用(USE_SQLITE=0 / better-sqlite3 缺失 / 已 close)时抛错,由影子层捕获 */
function db() {
  const h = sqlite.getDb();
  if (!h) throw new Error('sqlite-unavailable');
  return h;
}

// 预编译语句缓存:WeakMap 按 db 实例分键 ⇒ 换库/重开库自动失效,不会拿到绑在旧句柄上的语句。
const CACHE = new WeakMap();
function stmt(sql) {
  const h = db();
  let m = CACHE.get(h);
  if (!m) {
    m = new Map();
    CACHE.set(h, m);
  }
  let s = m.get(sql);
  if (!s) {
    s = h.prepare(sql);
    m.set(sql, s);
  }
  return s;
}

/** 在一个事务里跑一批写入(better-sqlite3 是同步 API,事务包起来才省掉逐条 fsync) */
function tx(fn) {
  return db().transaction(fn)();
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 嵌套对象列:按 JSON 落;undefined / null 一律 NULL(读回 null,与源记录的 null 对齐) */
function jsonCol(v) {
  if (v === undefined || v === null) return null;
  try {
    return JSON.stringify(v);
  } catch {
    return null; // 循环引用之类的畸形值:存 NULL 而不是让双写抛出去
  }
}

function parseJsonCol(v) {
  if (v === null || v === undefined) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

/**
 * 「文本或 JSON」列的读回(2026-10-13 线上对账暴露的):brand / playerPos 这类字段源里**既可能是字符串
 * 也可能是对象**(UA parser 给对象、兜底给字符串),落表时 textCol 把对象转成 JSON 文本、字符串原样存。
 * 读回必须回到源的那个域:看着像 JSON 对象/数组的文本就 parse,否则原样给字符串。
 * 不这么做的话,源里的对象与表里的 JSON 文本永远对不上(对账脚本会把两侧都 String(),对象那侧变成
 * '[object Object]' 把差异洗平),而将来切读时调用点拿到的类型也和老数组不一致。
 */
function maybeParseJson(v) {
  if (typeof v !== 'string') return v === undefined ? null : v;
  const s = v.trim();
  if (s.length < 2 || (s[0] !== '{' && s[0] !== '[')) return v;
  try {
    return JSON.parse(s);
  } catch (e) {
    return v; // 不是合法 JSON(例如消息里就是带花括号的文本):原样
  }
}

/**
 * TEXT 列里装数字的读回(2026-10-13 线上实测):`view_mode TEXT` 收到 JS number 时,
 * better-sqlite3 按 double 绑定,SQLite 的 TEXT 亲和把 REAL 写成 **'0.0'** 而不是 '0'。
 * 迁移文件已经在线上跑过,**动它一个字就会被校验和闸门拒绝**(见 lib/migrate.js 纪律③),
 * 所以列类型不改,在读回这一侧把 '0' / '0.0' 归一回数字 0 —— 与源里的 viewMode 同域。
 * 写入侧同时改成 textCol,新行直接存 '0'。
 */
function numText(v) {
  if (typeof v !== 'string') return v === undefined ? null : v;
  return /^-?\d+(\.0+)?$/.test(v.trim()) ? Number(v) : v;
}

/** 文本列:只接受字符串/数字,其余(对象、数组)按 JSON 落,绝不把 undefined 变成 "undefined" */
function textCol(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return jsonCol(v);
}

/** 0/1 列(SQLite 没有布尔) */
function boolCol(v) {
  return v ? 1 : 0;
}

/** 可选数字列:非有限数字 => NULL(读回 null,等价于"源记录里就没有") */
function numCol(v) {
  return isNum(v) ? v : null;
}

/**
 * 原样列:客户端可提交任意 JSON(line / lineno / colno / viewMode 都是 `obj.x || 0` 这种透传)。
 * 基本类型直接落(布尔存 0/1),对象/数组按 JSON 存,undefined/null 存 NULL。
 * ⚠️ 声明为 INTEGER 的列遇到字符串值时,SQLite 的列亲和只对"看着像数字"的字符串做转换
 *    ('5' -> 5),读回可能是数字而源里是字符串——对账脚本按 String() 松判,不因此报差异。
 */
function anyCol(v) {
  if (v === undefined || v === null) return null;
  const t = typeof v;
  if (t === 'boolean') return v ? 1 : 0;
  if (t === 'number' || t === 'string') return v;
  return jsonCol(v);
}

module.exports = { db, stmt, tx, isNum, jsonCol, parseJsonCol, maybeParseJson, numText, textCol, boolCol, numCol, anyCol };
