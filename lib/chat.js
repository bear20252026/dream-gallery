// ===================== 聊天室(昆仑灵鉴:全员可见,保留最近100条) =====================
// GET  /api/chat        拉取最近 100 条(所有人可读)
// POST /api/chat {text} 发言(≤140字,每设备 3 秒一条;昵称取雅号,未起名显示「无名藏梦人」)
// 存 gateData.chat(最多 100 条,满了挤掉最旧);防刷:按设备指纹限流
const { sendJson, readBody } = require('./util');
const { gateData, saveGateData, deviceKey, quotaKey, capKeys } = require('./store');

const MAX_MSG = 100;
const MAX_LEN = 140;
const RATE_MS = 3000;

function nickOf(req) {
  const dk = deviceKey(req);
  for (const a of Object.values(gateData.applicants || {})) {
    if (a.dk === dk && a.answer) return String(a.answer).slice(0, 16);
  }
  return '无名藏梦人';
}

function handleChatList(req, res) {
  const dk = deviceKey(req);
  // 标注哪些是本设备发的(前端气泡分左右用);dk 只用于比对,不下发
  const msgs = (gateData.chat || []).slice(-MAX_MSG).map(m => ({ n: m.n, t: m.t, ts: m.ts, me: m.dk === dk }));
  sendJson(res, 200, { msgs });
}

function handleChatPost(req, res) {
  readBody(req, obj => {
    const text = String(obj.text || '').trim();
    if (!text) { sendJson(res, 400, { error: '说点什么再发' }); return; }
    if (text.length > MAX_LEN) { sendJson(res, 400, { error: '太长了,140 字以内' }); return; }
    const dk = deviceKey(req);
    const qk = quotaKey(req);
    if (!gateData.chatRate) gateData.chatRate = {};
    const now = Date.now();
    if (gateData.chatRate[qk] && now - gateData.chatRate[qk] < RATE_MS) {
      sendJson(res, 429, { error: '说得太快了,歇口气' }); return;
    }
    gateData.chatRate[qk] = now;
    if (Object.keys(gateData.chatRate).length > 3000) capKeys(gateData.chatRate, 2500);
    if (!gateData.chat) gateData.chat = [];
    gateData.chat.push({ n: nickOf(req), t: text, ts: now, dk });
    if (gateData.chat.length > MAX_MSG) gateData.chat.splice(0, gateData.chat.length - MAX_MSG);
    saveGateData();
    sendJson(res, 200, { ok: true });
    // @昆仑之灵(或 @机器人):召唤机器人回答(异步,不阻塞发言响应)
    if (/@(昆仑之灵|机器人|bot)/i.test(text)) summonBot(text.replace(/@(昆仑之灵|机器人|bot)/gi, '').trim(), quotaKey(req));
  });
}

// 复用 AI 通道登记处(lib/aichannels.js,2026-07-28 主人定小米首选);密钥只在服务器环境变量,不出服务器
// 防刷:每设备每天限 10 次召唤;失败静默(不扰聊天流)
const { chatText } = require('./aichannels');
const BOT_NAME = '昆仑之灵';
const BOT_DAILY = 10;
const BOT_PROMPT = '你是昆仑山巅「万镜画廊」的守护灵，名唤昆仑之灵。画廊的主题是女娲补天、灵蕴、记忆与凝视。语气：温和、古雅、简短。规则：回答不超过 60 字；访客问与画廊/神话/记忆无关的问题时，简短作答后温和地把话题引回画廊。只输出回答正文，不要解释、不要前缀。';

async function callAI(text) {
  const r = await chatText({
    messages: [
      { role: 'system', content: BOT_PROMPT },
      { role: 'user', content: text.slice(0, 200) },
    ],
    maxTokens: 300, temperature: 1, timeoutMs: 30000,
  });
  return r ? r.text.trim().slice(0, 140) : null;
}

function summonBot(question, qk) {
  if (!question) return;
  const day = new Date().toISOString().slice(0, 10);
  if (!gateData.botQuota) gateData.botQuota = {};
  const q = gateData.botQuota[qk] || { day, n: 0 };
  if (q.day !== day) { q.day = day; q.n = 0; }
  if (q.n >= BOT_DAILY) return;
  q.n++; gateData.botQuota[qk] = q;
  if (Object.keys(gateData.botQuota).length > 3000) capKeys(gateData.botQuota, 2500);
  saveGateData();
  setImmediate(async () => {
    try {
      const answer = await callAI(question);
      if (!answer) return;
      if (!gateData.chat) gateData.chat = [];
      gateData.chat.push({ n: BOT_NAME, t: answer, ts: Date.now(), bot: true });
      if (gateData.chat.length > MAX_MSG) gateData.chat.splice(0, gateData.chat.length - MAX_MSG);
      saveGateData();
    } catch (e) { /* 静默 */ }
  });
}

module.exports = { handleChatList, handleChatPost };
