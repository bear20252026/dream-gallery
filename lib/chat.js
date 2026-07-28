// ===================== 聊天室(昆仑灵鉴:全员可见,保留最近100条) =====================
// GET  /api/chat        拉取最近 100 条(所有人可读)
// POST /api/chat {text} 发言(≤140字,每设备 3 秒一条;昵称取雅号,未起名显示「无名藏梦人」)
// 存 gateData.chat(最多 100 条,满了挤掉最旧);防刷:按设备指纹限流
const { sendJson, readBody } = require('./util');
const { gateData, saveGateData, deviceKey } = require('./store');

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
    if (!gateData.chatRate) gateData.chatRate = {};
    const now = Date.now();
    if (gateData.chatRate[dk] && now - gateData.chatRate[dk] < RATE_MS) {
      sendJson(res, 429, { error: '说得太快了,歇口气' }); return;
    }
    gateData.chatRate[dk] = now;
    if (!gateData.chat) gateData.chat = [];
    gateData.chat.push({ n: nickOf(req), t: text, ts: now, dk });
    if (gateData.chat.length > MAX_MSG) gateData.chat.splice(0, gateData.chat.length - MAX_MSG);
    saveGateData();
    sendJson(res, 200, { ok: true });
    // @昆仑之灵(或 @机器人):召唤机器人回答(异步,不阻塞发言响应)
    if (/@(昆仑之灵|机器人|bot)/i.test(text)) summonBot(text.replace(/@(昆仑之灵|机器人|bot)/gi, '').trim(), deviceKey(req));
  });
}

// ===================== 昆仑之灵(聊天机器人) =====================
// 复用 AI 阅卷双通道(密钥在服务器环境变量,不出服务器):
//   主 AI_GRADE_API_KEY(moonshot/kimi-k2.6) → 备 AI_GRADE_API_KEY_BACKUP(Kimi Code 会员/coding 端点)
// 防刷:每设备每天限 10 次召唤;失败静默(不扰聊天流)
const BOT_NAME = '昆仑之灵';
const BOT_DAILY = 10;
const BOT_PROMPT = '你是昆仑山巅「万镜画廊」的守护灵，名唤昆仑之灵。画廊的主题是女娲补天、灵蕴、记忆与凝视。语气：温和、古雅、简短。规则：回答不超过 60 字；访客问与画廊/神话/记忆无关的问题时，简短作答后温和地把话题引回画廊。只输出回答正文，不要解释、不要前缀。';

async function callAI(text) {
  const channels = [
    { key: process.env.AI_GRADE_API_KEY || '', url: process.env.AI_GRADE_BASE_URL || 'https://api.moonshot.cn/v1/chat/completions', model: process.env.AI_GRADE_MODEL || 'kimi-k2.6' },
    { key: process.env.AI_GRADE_API_KEY_BACKUP || '', url: process.env.AI_GRADE_BASE_URL_BACKUP || 'https://api.kimi.com/coding/v1/chat/completions', model: process.env.AI_GRADE_MODEL_BACKUP || 'kimi-for-coding' },
  ].filter(c => c.key);
  for (const c of channels) {
    try {
      const r = await fetch(c.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.key },
        body: JSON.stringify({
          model: c.model, temperature: 1, max_tokens: 300,
          messages: [
            { role: 'system', content: BOT_PROMPT },
            { role: 'user', content: text.slice(0, 200) },
          ],
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!r.ok) continue;
      const d = await r.json();
      const out = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content || '').trim();
      if (out) return out.slice(0, 140);
    } catch (e) { /* 换下一通道 */ }
  }
  return null;
}

function summonBot(question, dk) {
  if (!question) return;
  const day = new Date().toISOString().slice(0, 10);
  if (!gateData.botQuota) gateData.botQuota = {};
  const q = gateData.botQuota[dk] || { day, n: 0 };
  if (q.day !== day) { q.day = day; q.n = 0; }
  if (q.n >= BOT_DAILY) return;
  q.n++; gateData.botQuota[dk] = q; saveGateData();
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
