// repo/clicks.js — click_events 表(gateData.linkClicks 的影子表)的数据访问层
// 源记录(lib/track.js handleTrackClick 组装、flushTrack 攒批落库):
//   { t, dk, name, ip, geo, ua, brand, dev{}, fp{}, link, url, pos|null }
// ⚠️ 影子写必须**沿用攒批**:一批一次 insertMany(一个事务),不要每条一 insert。
const { stmt, tx, db, isNum, jsonCol, parseJsonCol, maybeParseJson, textCol } = require('./_db');

const TABLE = 'click_events';
const COLUMNS = ['t', 'dk', 'name', 'ip', 'geo', 'ua', 'brand', 'dev', 'fp', 'link', 'url', 'pos', 'src', 'written_at'];
const INSERT_SQL =
  'INSERT INTO ' + TABLE + ' (' + COLUMNS.join(',') + ') VALUES (' + COLUMNS.map((c) => '@' + c).join(',') + ')';

function toRow(rec, opts) {
  const r = rec || {};
  if (!isNum(r.t)) return null; // 缺时间戳:不落表
  const o = opts || {};
  return {
    t: r.t,
    dk: textCol(r.dk),
    name: textCol(r.name),
    ip: textCol(r.ip),
    geo: textCol(r.geo),
    ua: textCol(r.ua),
    brand: textCol(r.brand),
    dev: jsonCol(r.dev),
    fp: jsonCol(r.fp),
    link: textCol(r.link),
    url: textCol(r.url),
    pos: jsonCol(r.pos),
    src: o.src || 'live',
    written_at: isNum(o.writtenAt) ? o.writtenAt : Date.now(),
  };
}

/** 表行 -> 源记录形状。dev/fp 在源里是对象且从不为 null(缺省 {}),pos 允许 null */
function mapRow(row) {
  const brand = maybeParseJson(row.brand); // 源里可能是字符串,也可能是 UA 解析出的对象
  return {
    t: row.t,
    dk: row.dk === null ? '' : row.dk,
    name: row.name === null ? '' : row.name,
    ip: row.ip === null ? '' : row.ip,
    geo: row.geo === null ? '' : row.geo,
    ua: row.ua === null ? '' : row.ua,
    brand: brand === null || brand === undefined ? '' : brand,
    dev: parseJsonCol(row.dev) || {},
    fp: parseJsonCol(row.fp) || {},
    link: row.link === null ? '' : row.link,
    url: row.url === null ? '' : row.url,
    pos: parseJsonCol(row.pos),
  };
}

function insert(rec, opts) {
  const row = toRow(rec, opts);
  if (!row) return 0;
  db();
  return stmt(INSERT_SQL).run(row).changes;
}

/** 一批一次多行写入(攒批语义的落表侧对应物) */
function insertMany(list, opts) {
  const rows = [];
  for (const rec of list || []) {
    const r = toRow(rec, opts);
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

/** 后台 POST /api/admin/clicks/clear 的真删是**数组与表一起清**,否则对账永远对不上 */
function removeAll() {
  return stmt('DELETE FROM ' + TABLE).run().changes;
}

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
