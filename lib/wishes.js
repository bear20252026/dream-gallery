// ===================== 一念(心愿墙:凡人一念,可补天缺) =====================
// POST /api/wish   {text}  写下一念(≤60字;每设备每天 3 条 + 3 秒限流;提交即上墙,后台可删)
// GET  /api/wishes         拉取最近 100 条(所有人可读;me 标记本设备,dk 只比对不下发)
// GET  /api/admin/wishes   后台拉取(含 dk/id 全字段)
// POST /api/admin/wish     {action:'del',id} 删除(仅后台)
// 存 gateData.wishes(上限 5000 条防存储 DoS,满了挤掉最旧);公开政策与聊天室一致:先发后审
const { sendJson, readBody } = require('./util');
const { gateData, saveGateData, deviceKey, quotaKey, capKeys } = require('./store');

const MAX_MSG = 100; // 公开墙保留条数
const MAX_TOTAL = 5000; // 存储硬上限(防刷盘)
const MAX_LEN = 60; // 一念宜短
const RATE_MS = 3000;
const DAILY = 3; // 每设备每天 3 念

function nickOf(req) {
  const dk = deviceKey(req);
  for (const a of Object.values(gateData.applicants || {})) {
    if (a.dk === dk && a.answer) return String(a.answer).slice(0, 16);
  }
  return '无名藏梦人';
}

function handleWishList(req, res) {
  const dk = deviceKey(req);
  const msgs = (gateData.wishes || [])
    .slice(-MAX_MSG)
    .map((w) => ({ n: w.n, t: w.t, ts: w.ts, me: w.dk === dk }));
  sendJson(res, 200, { msgs });
}

function handleWishPost(req, res) {
  readBody(req, (obj) => {
    const text = String(obj.text || '').trim().replace(/\s+/g, ' ');
    if (!text) { sendJson(res, 400, { error: '写下你想说的那句话' }); return; }
    if (text.length > MAX_LEN) { sendJson(res, 400, { error: '一念宜短,' + MAX_LEN + ' 字以内' }); return; }
    if (/(https?:\/\/|www\.|\.com\b|\.cn\b)/i.test(text)) {
      sendJson(res, 400, { error: '一念里放不下链接——只写心事就好' });
      return;
    }
    const dk = deviceKey(req);
    const qk = quotaKey(req);
    const day = new Date().toISOString().slice(0, 10);
    if (!gateData.wishRate) gateData.wishRate = {};
    const now = Date.now();
    const q = gateData.wishRate[qk] || { day, n: 0, t: 0 };
    if (q.day !== day) { q.day = day; q.n = 0; }
    if (now - (q.t || 0) < RATE_MS) { sendJson(res, 429, { error: '念想刚落,歇口气再说' }); return; }
    if (q.n >= DAILY) { sendJson(res, 429, { error: '今日的三念已用完,明天再来' }); return; }
    q.n++; q.t = now;
    gateData.wishRate[qk] = q;
    if (Object.keys(gateData.wishRate).length > 3000) capKeys(gateData.wishRate, 2500);
    if (!gateData.wishes) gateData.wishes = [];
    gateData.wishes.push({
      id: now.toString(36) + Math.random().toString(36).slice(2, 6),
      n: nickOf(req),
      t: text,
      ts: now,
      dk,
    });
    if (gateData.wishes.length > MAX_TOTAL) gateData.wishes.splice(0, gateData.wishes.length - MAX_TOTAL);
    saveGateData();
    sendJson(res, 200, { ok: true });
  });
}

function handleAdminWishes(req, res) {
  const all = gateData.wishes || [];
  sendJson(res, 200, { total: all.length, list: all.slice(-300).reverse() });
}

function handleAdminWish(req, res) {
  readBody(req, (obj) => {
    const id = String(obj.id || '');
    if (obj.action !== 'del') { sendJson(res, 400, { error: '未知操作' }); return; }
    if (!gateData.wishes) gateData.wishes = [];
    const i = gateData.wishes.findIndex((w) => w.id === id);
    if (i < 0) { sendJson(res, 404, { error: '找不到这条一念' }); return; }
    gateData.wishes.splice(i, 1);
    saveGateData();
    sendJson(res, 200, { ok: true });
  });
}

module.exports = { handleWishPost, handleWishList, handleAdminWishes, handleAdminWish };
