// repo/chat.js — chat_messages 表(gateData.chat 的影子表)的数据访问层
// 契约:入参是源数组元素的原形状 { n, t, ts, dk, admin?, bot? },出参 mapRow 还原回同形状。
// 生产读路径**一律不许改调这里**(R1 第 2 步只做影子写;这里的读接口只服务对账工具与单测)。
const { stmt, tx, db, isNum, boolCol } = require('./_db');

const TABLE = 'chat_messages';
const COLUMNS = ['ts', 'nick', 'body', 'dk', 'admin', 'bot', 'src', 'written_at'];
const INSERT_SQL =
  'INSERT INTO ' + TABLE + ' (' + COLUMNS.join(',') + ') VALUES (@ts,@nick,@body,@dk,@admin,@bot,@src,@written_at)';

/** 源数组元素 -> 表行;缺时间戳的畸形条目返回 null(不落表,与保留期"缺时间戳跳过不删"同口径) */
function toRow(msg, opts) {
  const m = msg || {};
  if (!isNum(m.ts)) return null;
  const o = opts || {};
  return {
    ts: m.ts,
    nick: typeof m.n === 'string' ? m.n : '',
    body: typeof m.t === 'string' ? m.t : '',
    dk: m.dk === undefined || m.dk === null ? null : String(m.dk),
    admin: boolCol(m.admin),
    bot: boolCol(m.bot),
    src: o.src || 'live',
    written_at: isNum(o.writtenAt) ? o.writtenAt : Date.now(),
  };
}

/** 表行 -> 源数组元素形状(读时投影 me 由调用方按 dk 判定,与 lib/chat.js 一致) */
function mapRow(r) {
  const out = { n: r.nick, t: r.body, ts: r.ts };
  if (r.dk !== null && r.dk !== undefined) out.dk = r.dk;
  if (r.admin) out.admin = true;
  if (r.bot) out.bot = true;
  return out;
}

/** 单条落表;畸形(无 ts)返回 0 而不抛 */
function insert(msg, opts) {
  const row = toRow(msg, opts);
  if (!row) return 0;
  db(); // 先要句柄:未启用时抛 sqlite-unavailable,由影子层吞掉
  return stmt(INSERT_SQL).run(row).changes;
}

/** 批量插入:一个事务,一条预编译语句;返回实际落表的行数 */
function insertMany(list, opts) {
  const rows = [];
  for (const m of list || []) {
    const r = toRow(m, opts);
    if (r) rows.push(r);
  }
  if (!rows.length) return 0;
  db();
  const s = stmt(INSERT_SQL);
  return tx(() => {
    for (const r of rows) s.run(r);
    return rows.length;
  });
}

function count() {
  const row = stmt('SELECT COUNT(*) AS n FROM ' + TABLE).get();
  return (row && row.n) || 0;
}

/** 保留期裁剪:整表只有一个时间维度,直接按 ts 删 */
function removeOlderThan(cutoff) {
  if (!isNum(cutoff)) return 0;
  return stmt('DELETE FROM ' + TABLE + ' WHERE ts < ?').run(cutoff).changes;
}

/** 预览用:本轮将会删掉多少行(不执行 DELETE) */
function countOlderThan(cutoff) {
  if (!isNum(cutoff)) return 0;
  const row = stmt('SELECT COUNT(*) AS n FROM ' + TABLE + ' WHERE ts < ?').get(cutoff);
  return (row && row.n) || 0;
}

function removeAll() {
  return stmt('DELETE FROM ' + TABLE).run().changes;
}

/** 全量按落表次序读回(rowid = 追加次序,与数组一致),还原成源数组元素形状 */
function readAll() {
  return stmt('SELECT * FROM ' + TABLE + ' ORDER BY rowid ASC').all().map(mapRow);
}

/** 最近 N 条(对账脚本按"数组尾部 N 条"逐条比对的依据) */
function readTail(n) {
  return rawTail(n).map(mapRow);
}

/** 带 id / src / written_at 的原始行(诊断与对账要看写入痕迹) */
function rawTail(n) {
  const k = isNum(n) && n > 0 ? Math.floor(n) : 0;
  return stmt('SELECT * FROM ' + TABLE + ' ORDER BY rowid DESC LIMIT ?').all(k).reverse();
}

module.exports = {
  TABLE, toRow, mapRow, insert, insertMany, count,
  removeOlderThan, countOlderThan, removeAll, readAll, readTail, rawTail,
};
