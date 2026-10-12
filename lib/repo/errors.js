// repo/errors.js — client_errors 表:两条报错信道共用一张表,channel 列区分
//   channel='gate' → gateData.clientErrors(lib/track.js handleTrackError),**纯追加**
//                    源记录 { t, dk, name, ip, brand, msg, src, line, ua }
//   channel='file' → client_errors.json(lib/client-errors.js record()),**按 message+source+type 聚合**
//                    源条目 { id, t, lastT, count, type, message, source, lineno, colno, stack,
//                             url, viewMode, playerPos, ua, world, ip }
// 因为 file 信道是同一条错误反复出现时原地改 count / lastT,落表走 UPSERT
// (ON CONFLICT(channel, src_id) DO UPDATE),重跑不产生重复行。
const { stmt, tx, db, isNum, numCol, anyCol, textCol } = require('./_db');

const TABLE = 'client_errors';
const GATE = 'gate';
const FILE = 'file';

const GATE_COLUMNS = ['channel', 't', 'dk', 'name', 'ip', 'brand', 'msg', 'src_file', 'line', 'ua', 'src', 'written_at'];
const GATE_INSERT_SQL =
  'INSERT INTO ' + TABLE + ' (' + GATE_COLUMNS.join(',') + ') VALUES (' + GATE_COLUMNS.map((c) => '@' + c).join(',') + ')';

const FILE_COLUMNS = [
  'channel', 'src_id', 't', 'last_t', 'count', 'type', 'message', 'source', 'lineno', 'colno',
  'stack', 'url', 'view_mode', 'player_pos', 'world', 'ua', 'ip', 'src', 'written_at',
];
const FILE_UPSERT_SQL =
  'INSERT INTO ' + TABLE + ' (' + FILE_COLUMNS.join(',') + ') VALUES (' + FILE_COLUMNS.map((c) => '@' + c).join(',') + ') ' +
  'ON CONFLICT(channel, src_id) DO UPDATE SET ' +
  ['t', 'last_t', 'count', 'type', 'message', 'source', 'lineno', 'colno', 'stack', 'url', 'view_mode', 'player_pos', 'world', 'ua', 'ip']
    .map((c) => c + '=excluded.' + c)
    .join(',') + ',written_at=excluded.written_at';

/** gate 信道:追加一条(track.js 那条信道的元素形状) */
function gateToRow(rec, opts) {
  const r = rec || {};
  if (!isNum(r.t)) return null;
  const o = opts || {};
  return {
    channel: GATE,
    t: r.t,
    dk: textCol(r.dk),
    name: textCol(r.name),
    ip: textCol(r.ip),
    brand: textCol(r.brand),
    msg: textCol(r.msg),
    src_file: textCol(r.src),
    line: anyCol(r.line),
    ua: textCol(r.ua),
    src: o.src || 'live',
    written_at: isNum(o.writtenAt) ? o.writtenAt : Date.now(),
  };
}

/** file 信道:client_errors.json 的聚合条目(整条覆盖,含 count / lastT) */
function fileToRow(item, opts) {
  const e = item || {};
  if (!e.id) return null; // 没有聚合主键 => 无法幂等,不落表
  const t = isNum(e.t) ? e.t : isNum(e.lastT) ? e.lastT : null;
  if (t === null) return null; // 两个时间字段都没有:畸形,不落表
  const o = opts || {};
  return {
    channel: FILE,
    src_id: String(e.id),
    t,
    last_t: numCol(e.lastT),
    count: isNum(e.count) ? e.count : 1,
    type: textCol(e.type),
    message: textCol(e.message),
    source: textCol(e.source),
    lineno: anyCol(e.lineno),
    colno: anyCol(e.colno),
    stack: textCol(e.stack),
    url: textCol(e.url),
    view_mode: anyCol(e.viewMode),
    player_pos: textCol(e.playerPos),
    world: textCol(e.world),
    ua: textCol(e.ua),
    ip: textCol(e.ip),
    src: o.src || 'live',
    written_at: isNum(o.writtenAt) ? o.writtenAt : Date.now(),
  };
}

function mapGate(row) {
  const out = {
    t: row.t,
    dk: row.dk === null ? '' : row.dk,
    name: row.name === null ? '' : row.name,
    ip: row.ip === null ? '' : row.ip,
    brand: row.brand === null ? '' : row.brand,
    msg: row.msg === null ? '' : row.msg,
    src: row.src_file === null ? '' : row.src_file,
    ua: row.ua === null ? '' : row.ua,
  };
  if (row.line !== null && row.line !== undefined) out.line = row.line;
  return out;
}

function mapFile(row) {
  const out = {
    id: row.src_id,
    t: row.t,
    type: row.type,
    message: row.message,
    source: row.source,
    count: row.count,
  };
  if (row.last_t !== null && row.last_t !== undefined) out.lastT = row.last_t;
  for (const [k, col] of [
    ['lineno', 'lineno'], ['colno', 'colno'], ['stack', 'stack'], ['url', 'url'],
    ['playerPos', 'player_pos'], ['ua', 'ua'], ['world', 'world'], ['ip', 'ip'],
  ]) {
    if (row[col] !== null && row[col] !== undefined) out[k] = row[col];
  }
  if (row.view_mode !== null && row.view_mode !== undefined) out.viewMode = row.view_mode;
  return out;
}

function insertGate(rec, opts) {
  const row = gateToRow(rec, opts);
  if (!row) return 0;
  db();
  return stmt(GATE_INSERT_SQL).run(row).changes;
}

function insertGateMany(list, opts) {
  const rows = [];
  for (const rec of list || []) {
    const r = gateToRow(rec, opts);
    if (r) rows.push(r);
  }
  if (!rows.length) return 0;
  db();
  const s = stmt(GATE_INSERT_SQL);
  return tx(() => {
    for (const r of rows) s.run(r);
    return rows.length;
  });
}

/** file 信道:同 id 覆盖(聚合计数与 lastT 刷新都走这一条,重跑不产生重复行) */
function upsertFile(item, opts) {
  const row = fileToRow(item, opts);
  if (!row) return 0;
  db();
  return stmt(FILE_UPSERT_SQL).run(row).changes;
}

function upsertFileMany(list, opts) {
  const rows = [];
  for (const it of list || []) {
    const r = fileToRow(it, opts);
    if (r) rows.push(r);
  }
  if (!rows.length) return 0;
  db();
  const s = stmt(FILE_UPSERT_SQL);
  return tx(() => {
    for (const r of rows) s.run(r);
    return rows.length;
  });
}

function count(channel) {
  const row = channel
    ? stmt('SELECT COUNT(*) AS n FROM ' + TABLE + ' WHERE channel = ?').get(channel)
    : stmt('SELECT COUNT(*) AS n FROM ' + TABLE).get();
  return (row && row.n) || 0;
}

const EXPIRED_WHERE =
  "WHERE (channel = 'gate' AND t < ?) OR (channel = 'file' AND COALESCE(last_t, t) < ?)";

/**
 * 保留期裁剪。两条信道判龄字段不同(与 lib/retention.js 数组侧的既有口径逐条对齐):
 *   gate 按 t;file 按 COALESCE(last_t, t)(仍在复发的永不老化)。
 */
function removeOlderThan(cutoff) {
  if (!isNum(cutoff)) return 0;
  return stmt('DELETE FROM ' + TABLE + ' ' + EXPIRED_WHERE).run(cutoff, cutoff).changes;
}

function countOlderThan(cutoff) {
  if (!isNum(cutoff)) return 0;
  const row = stmt('SELECT COUNT(*) AS n FROM ' + TABLE + ' ' + EXPIRED_WHERE).get(cutoff, cutoff);
  return (row && row.n) || 0;
}

/** 按信道分列的过期数(保留期报告与对账脚本要用两个数,不是一个) */
function countOlderThanByChannel(cutoff) {
  const out = { [GATE]: 0, [FILE]: 0 };
  if (!isNum(cutoff)) return out;
  const rows = stmt('SELECT channel, COUNT(*) AS n FROM ' + TABLE + ' ' + EXPIRED_WHERE + ' GROUP BY channel')
    .all(cutoff, cutoff);
  for (const r of rows) out[r.channel] = r.n;
  return out;
}

/** 后台清空报错:数组信道与文件信道各清各的(调用方决定清哪个) */
function removeAll(channel) {
  return channel
    ? stmt('DELETE FROM ' + TABLE + ' WHERE channel = ?').run(channel).changes
    : stmt('DELETE FROM ' + TABLE).run().changes;
}

function readGateTail(n) {
  const k = isNum(n) && n > 0 ? Math.floor(n) : 0;
  return stmt("SELECT * FROM " + TABLE + " WHERE channel = 'gate' ORDER BY rowid DESC LIMIT ?").all(k)
    .reverse().map(mapGate);
}

/** file 信道全量(它是聚合表,行数就有意义,不做 tail 对齐) */
function readFileAll() {
  return stmt("SELECT * FROM " + TABLE + " WHERE channel = 'file' ORDER BY rowid ASC").all().map(mapFile);
}

function readFileRawAll() {
  return stmt("SELECT * FROM " + TABLE + " WHERE channel = 'file' ORDER BY rowid ASC").all();
}

module.exports = {
  TABLE, GATE, FILE,
  gateToRow, fileToRow, mapGate, mapFile,
  insertGate, insertGateMany, upsertFile, upsertFileMany,
  count, removeOlderThan, countOlderThan, countOlderThanByChannel, removeAll,
  readGateTail, readFileAll, readFileRawAll,
};
