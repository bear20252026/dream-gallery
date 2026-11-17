// ===================== 聊天室(昆仑灵鉴:全员可见,保留最近100条) =====================
// GET  /api/chat        拉取最近 100 条(所有人可读)
// POST /api/chat {text} 发言(≤140字,每设备 3 秒一条;昵称取雅号,未起名显示「无名藏梦人」)
// 存 gateData.chat(最多 100 条,满了挤掉最旧);防刷:按设备指纹限流
// ⚠️ 条数上限与时间维度**共存**(DG-PRIV-001):这里的 MAX_MSG 不被保留期削弱,
//   超过 RETENTION_DAYS.chat(lib/retention.js)的发言由保留期清扫额外裁掉;
//   每条发言必须带 ts(毫秒),保留期判定靠它——缺 ts 的条目保留期一律跳过不删。
const { sendJson, readBody } = require('./util');
// 命名空间引用(与 track.js 同款):saveGateData 可被测试替换计数;gateData 是同一对象引用
const store = require('./store');
const { gateData, deviceKey, quotaKey, capKeys } = store;
// 热集合持久层(B5 拆双轨后):chat_messages 真表唯一权威。
// shadow.chat 返回真实持久判定:true 免整库落盘;false 回旁路(数组+saveGateData),一条不丢。
const shadow = require('./shadow');
// 读门面:读走真表;SQLite 不可用/读抛错返 null ⇒ 回 gateData 旁路数组(见 lib/hotread.js)。
const hotread = require('./hotread');
// 管理员回话(2026-10-10):后台 chat tab 以 x-token 直发公开聊天室,name 固定「管理员」。
// tokenOk 从 ./admin 引入无环(admin 不 require chat);普通访客 POST 不受影响。
const { tokenOk } = require('./admin');
// 召唤触发词单一源(2026-10-17 审计 C9):界面写着 @B612之灵 而后端只认 @(昆仑之灵|机器人|bot)
// ⇒ 照屏幕教的打字**根本不召唤**,前端还会刷一次去等那条永远不来的回帖。两侧现在共读这张表。
// ⚠️ 这个 .mjs 必须进后端部署清单(scripts/backend-files.sh)—— 与 mediarules.mjs 同一族,
//    漏了就是 2026-10-12 那次"清单不递归 ⇒ 线上 Cannot find module ⇒ 全站 502"的重演。
const CHAT_WORDS = require('../src/shared/chat-words.mjs');

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
  // R1 切读:真表 tail 优先(表不受 MAX_MSG 截断,保留期内的历史都在);null ⇒ 数组老路
  const src = hotread.chatTail(MAX_MSG) || (gateData.chat || []).slice(-MAX_MSG);
  const msgs = src.map((m) => ({ n: m.n, t: m.t, ts: m.ts, me: m.dk === dk }));
  sendJson(res, 200, { msgs });
}

function handleChatPost(req, res) {
  readBody(req, (obj) => {
    const text = String(obj.text || '').trim();
    if (!text) {
      sendJson(res, 400, { error: '说点什么再发' });
      return;
    }
    if (text.length > MAX_LEN) {
      sendJson(res, 400, { error: '太长了,140 字以内' });
      return;
    }
    const dk = deviceKey(req);
    const qk = quotaKey(req);
    if (!gateData.chatRate) gateData.chatRate = {};
    const now = Date.now();
    if (gateData.chatRate[qk] && now - gateData.chatRate[qk] < RATE_MS) {
      sendJson(res, 429, { error: '说得太快了,歇口气' });
      return;
    }
    gateData.chatRate[qk] = now;
    if (Object.keys(gateData.chatRate).length > 3000) capKeys(gateData.chatRate, 2500);
    if (!gateData.chat) gateData.chat = [];
    const adminPost = tokenOk(req, {});
    const msg = {
      n: adminPost ? '管理员' : nickOf(req),
      t: text,
      ts: now,
      dk,
      admin: adminPost || undefined,
    };
    gateData.chat.push(msg);
    if (gateData.chat.length > MAX_MSG) gateData.chat.splice(0, gateData.chat.length - MAX_MSG);
    // B5 拆双轨:shadow.chat 返回真实持久判定。true=确实落表(WAL 崩溃安全)⇒免整库落盘;
    // false=SQLite 不可用/写失败 ⇒ 回 json/kv 旁路(数组+saveGateData),一条不丢。
    if (!shadow.chat(msg)) store.saveGateData();
    sendJson(res, 200, { ok: true });
    // 召唤机器人(触发词表 = src/shared/chat-words.mjs 单一源,与聊天室界面的提示同源)
    // 洪水防护(2026-10-07 审查#2):召唤是 AI 成本;每 IP 每分钟 6 次,超限本次静默不召唤
    // (发言本身照常入库,访客的其他消息不受影响)
    if (
      CHAT_WORDS.triggerRe().test(text) &&
      require('./ratelimit').hit(req, CHAT_WORDS.BOT_RATE_BUCKET, CHAT_WORDS.BOT_RATE_PER_MIN).ok
    ) {
      // 语言随发言带上(2026-11-11 审计 C9-2):英文站的召唤不再拿中文回帖;
      // 只认 en/zh 两个值,其余一律按 zh(老客户端不带 lang 时行为不变)
      const lang = String(obj.lang || '').toLowerCase() === 'en' ? 'en' : 'zh';
      summonBot(CHAT_WORDS.stripTriggers(text), lang);
    }
  });
}

// 复用 AI 通道登记处(lib/aichannels.js,2026-07-28 主人定小米首选);密钥只在服务器环境变量,不出服务器
// (2026-09-24 主人令:每设备每天 10 次召唤限额已拆除;发言本身仍有 3 秒/条限流兜底)
// 失败静默(不扰聊天流)
const { chatText } = require('./aichannels');
const aiusage = require('./aiusage'); // 用量台账(2026-10-12 审计 P2):只记维度,不记消息内容
const BOT_NAME = CHAT_WORDS.BOT_NAME; // 显示名单一源(改名只动 chat-words.mjs 那一行,不在这里再写一遍)
// 2026-11-12 世界观统一(主人要求「只留小王子」):人格从「昆仑山巅/女娲补天/灵蕴」换成
// B612 守护灵,意象改为沙漠、玫瑰、日落、水井、狐狸与「用心去看」——与主线剧情同一套语汇。
// 语气与长度约束一字不改(温和、简短、只输出正文),只换世界观名词。
const BOT_PROMPT =
  '你是 B612 小行星的守护灵，名唤 B612之灵。这里是一段关于《小王子》的旅程：沙漠、玫瑰、日落、水井、狐狸，以及「只有用心才能看清」。语气：温和、清澈、简短。规则：回答不超过 60 字；访客问与这段旅程/星星/记忆无关的问题时，简短作答后温和地把话题引回旅程。只输出回答正文，不要解释、不要前缀。';
// 英文站同款人设(2026-11-11 审计 C9-2):召唤语言随发言携带,英文访客不再拿中文回帖
const BOT_PROMPT_EN =
  'You are the guardian spirit of the little planet B612, named Spirit of B612. This is a journey through The Little Prince: desert, rose, sunsets, the well, the fox, and "what is essential is invisible to the eye". Tone: gentle, clear, brief. Rules: answer in at most 40 words; if asked about things unrelated to this journey/the stars/memory, answer briefly then gently steer back. Output only the answer body, no explanations, no prefixes. Always answer in English.';

async function callAI(text, lang) {
  const t0 = Date.now();
  let r = null;
  let thrown = false;
  try {
    r = await chatText({
      messages: [
        { role: 'system', content: lang === 'en' ? BOT_PROMPT_EN : BOT_PROMPT },
        { role: 'user', content: text.slice(0, 200) },
      ],
      maxTokens: 300,
      temperature: 1,
      timeoutMs: 30000,
    });
  } catch (e) {
    thrown = true;
  }
  aiusage.record({
    capability: 'chat-bot',
    channel: r && r.by,
    model: r && r.model,
    ok: !!(r && r.text),
    latencyMs: Date.now() - t0,
    tokens: (r && r.tokens) || 0,
    errKind: thrown ? 'throw' : r ? (r.text ? '' : 'empty') : 'no-channel',
  });
  return r ? r.text.trim().slice(0, 140) : null;
}

function summonBot(question, lang) {
  if (!question) return;
  setImmediate(async () => {
    try {
      const answer = await callAI(question, lang);
      if (!answer) return;
      if (!gateData.chat) gateData.chat = [];
      const botMsg = { n: BOT_NAME, t: answer, ts: Date.now(), bot: true };
      gateData.chat.push(botMsg);
      if (gateData.chat.length > MAX_MSG) gateData.chat.splice(0, gateData.chat.length - MAX_MSG);
      if (!shadow.chat(botMsg)) store.saveGateData(); // 与访客发言同一纪律(B5)
    } catch (e) {
      /* 静默 */
    }
  });
}

module.exports = { handleChatList, handleChatPost, MAX_MSG };
