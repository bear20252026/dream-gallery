// tts-stats.js — 台词语音播放追踪(2026-09-26 主人令:「播放过/播放错误/播放条数全部记录」)
// 存储:独立 tts_stats.json(照 client-errors 模式,不混 gate_data)
// 事件(ev):
//   speak  — 台词发起朗读(speakLine 决策通过)
//   ok     — play() 成功开播
//   fail   — play() 失败(err 带原因,如 AbortError/NotAllowedError)
//   muted  — 静音跳过(对话框 🔇 或总闸)
//   skip   — 缓存未命中走实时合成(供观测预热命中率,可选上报)
// 汇总 counters 全量累计;明细 list 滚动保留最近 400 条。
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./config');
const { sendJson, readBody } = require('./util');

const FILE = path.join(ROOT, 'tts_stats.json');
const MAX_ITEMS = 400;
const MAX_BODY = 32 * 1024;
const RATE_WINDOW = 60 * 1000;
const RATE_MAX = 120; // 事件是正常剧情流(一场 30-50 行),上限放宽到 120/分钟

let db = { list: [], counters: { speak: 0, ok: 0, fail: 0, muted: 0, skip: 0, cut: 0 } };
const rateMap = new Map();

function load() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (j && Array.isArray(j.list)) db = j;
  } catch (e) {
    /* 首次运行:空开始 */
  }
  if (!Array.isArray(db.list)) db.list = [];
  if (!db.counters) db.counters = { speak: 0, ok: 0, fail: 0, muted: 0, skip: 0, cut: 0 };
}
function save() {
  try {
    fs.writeFileSync(FILE, JSON.stringify(db));
  } catch (e) {
    console.log('[tts-stats] 写入失败:', e.message);
  }
}
load();

function clip(s, n) {
  if (s === undefined || s === null) return '';
  return String(s).slice(0, n);
}
function clientIp(req) {
  return require('./store').realIP(req);
}
function rateOk(ip) {
  const now = Date.now();
  const r = rateMap.get(ip);
  if (!r || now - r.t0 > RATE_WINDOW) {
    rateMap.set(ip, { n: 1, t0: now });
    return true;
  }
  r.n++;
  return r.n <= RATE_MAX;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateMap) if (now - v.t0 > RATE_WINDOW) rateMap.delete(k);
}, RATE_WINDOW).unref?.();

const OK_EV = { speak: 1, ok: 1, fail: 1, muted: 1, skip: 1, cut: 1 };

/** 批量记录:events=[{ev,text,voice,ms,err}];返回 {ok, accepted} */
function recordStats(req, events) {
  if (!rateOk(clientIp(req))) return { ok: true, accepted: 0, rateLimited: true };
  let accepted = 0;
  for (const it of events.slice(0, 80)) {
    const ev = it && OK_EV[it.ev] ? it.ev : null;
    if (!ev) continue;
    db.counters[ev]++;
    accepted++;
    db.list.push({
      ev,
      text: clip(it.text, 24),
      voice: clip(it.voice, 12),
      ms: Number.isFinite(it.ms) ? Math.round(it.ms) : undefined,
      err: clip(it.err, 60),
      t: Date.now(),
    });
  }
  while (db.list.length > MAX_ITEMS) db.list.shift();
  save();
  return { ok: true, accepted };
}

function getStats() {
  const recent24 = db.list.filter((e) => Date.now() - e.t < 24 * 3600 * 1000);
  const byEv = {};
  for (const e of recent24) byEv[e.ev] = (byEv[e.ev] || 0) + 1;
  return {
    counters: db.counters,
    total: db.list.length,
    recent24: recent24.length,
    byEv24: byEv,
    // 命中率:开播成功 / 发起(speak) —— 主人最关心的「到底响没响」
    audibleRate:
      db.counters.speak > 0 ? Math.round((db.counters.ok / db.counters.speak) * 100) : null,
    list: db.list.slice(-120).reverse(), // 最新在前
  };
}

function clearStats() {
  db = { list: [], counters: { speak: 0, ok: 0, fail: 0, muted: 0, skip: 0, cut: 0 } };
  save();
}

/** POST /api/tts/stats(公开打点) */
function handleTtsStats(req, res) {
  readBody(req, (obj) => {
    try {
      const events = obj && Array.isArray(obj.events) ? obj.events : [];
      sendJson(res, 200, recordStats(req, events));
    } catch (e) {
      sendJson(res, 400, { error: 'bad body' });
    }
  }, MAX_BODY);
}

/** GET /api/admin/tts-stats */
function handleAdminTtsStats(req, res) {
  sendJson(res, 200, getStats());
}

/** POST /api/admin/tts-stats/clear */
function handleAdminTtsStatsClear(req, res) {
  clearStats();
  sendJson(res, 200, { ok: true });
}

module.exports = { handleTtsStats, handleAdminTtsStats, handleAdminTtsStatsClear };
