// repo/visits.js — visits 表(gateData.visits 的影子表)的数据访问层
// 源元素 { t, id } —— id 是访客档案键(= vid),可为 null。写入点:lib/store.js recordVisit。
const { stmt, tx, db, isNum, textCol } = require('./_db');

const TABLE = 'visits';
const COLUMNS = ['t', 'vid', 'src', 'written_at'];
const INSERT_SQL = 'INSERT INTO ' + TABLE + ' (' + COLUMNS.join(',') + ') VALUES (@t,@vid,@src,@written_at)';

function toRow(v, opts) {
  const o = opts || {};
  if (!v || !isNum(v.t)) return null; // 缺时间戳:不落表(与保留期"跳过不删"同口径)
  return {
    t: v.t,
    vid: textCol(v.id === undefined ? null : v.id),
    src: o.src || 'live',
    written_at: isNum(o.writtenAt) ? o.writtenAt : Date.now(),
  };
}

function mapRow(r) {
  return { t: r.t, id: r.vid === undefined ? null : r.vid };
}

function insert(v, opts) {
  const row = toRow(v, opts);
  if (!row) return 0;
  db();
  return stmt(INSERT_SQL).run(row).changes;
}

function insertMany(list, opts) {
  const rows = [];
  for (const v of list || []) {
    const r = toRow(v, opts);
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

function removeOlderThan(cutoff) {
  if (!isNum(cutoff)) return 0;
  return stmt('DELETE FROM ' + TABLE + ' WHERE t < ?').run(cutoff).changes;
}

function countOlderThan(cutoff) {
  if (!isNum(cutoff)) return 0;
  const row = stmt('SELECT COUNT(*) AS n FROM ' + TABLE + ' WHERE t < ?').get(cutoff);
  return (row && row.n) || 0;
}

function removeAll() {
  return stmt('DELETE FROM ' + TABLE).run().changes;
}

/** 全量按落表次序读回,还原成源数组元素形状 { t, id } */
function readAll() {
  return stmt('SELECT * FROM ' + TABLE + ' ORDER BY rowid ASC').all().map(mapRow);
}

function readTail(n) {
  return rawTail(n).map(mapRow);
}

function rawTail(n) {
  const k = isNum(n) && n > 0 ? Math.floor(n) : 0;
  return stmt('SELECT * FROM ' + TABLE + ' ORDER BY rowid DESC LIMIT ?').all(k).reverse();
}

module.exports = {
  TABLE, toRow, mapRow, insert, insertMany, count,
  removeOlderThan, countOlderThan, removeAll, readAll, readTail, rawTail,
};
