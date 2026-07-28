// aichannels.js — AI 通道登记处·单一源(2026-07-28 主人定:小米 MiMo 首选,其余接口排后)
// 全站 AI 能力(文本/视觉/语音)只走这里;密钥只读环境变量,永不落盘、永不进代码库。
//   文本:MIMO mimo-v2.5-pro → moonshot kimi-k2.6 → Kimi Code 会员 kimi-for-coding
//   视觉:MIMO mimo-v2.5(全模态)→ moonshot-v1-8k-vision-preview → kimi-for-coding(支持视觉)
//   语音:MIMO mimo-v2.5-tts(限免)→ edge-tts 本地(在 tts.js 兜底,不在本模块)
// 环境变量:MIMO_API_KEY(必);MIMO_BASE_URL/MIMO_TEXT_MODEL/MIMO_VISION_MODEL/MIMO_TTS_(MODEL|VOICE)(可)
// 注意:测试确定性——test.js 屏蔽 AI key 时须同时屏蔽 MIMO_API_KEY(评分用例走本地细则)。

function mimoKey() { return process.env.MIMO_API_KEY || ''; }
function mimoUrl() { return (process.env.MIMO_BASE_URL || 'https://api.xiaomimimo.com/v1') + '/chat/completions'; }

// ===================== 文本通道 =====================
function textChannels() {
  return [
    { name: 'mimo', key: mimoKey(), url: mimoUrl(), model: process.env.MIMO_TEXT_MODEL || 'mimo-v2.5-pro', minTokens: 1500 }, // 推理型:留足推理 token
    { name: 'moonshot', key: process.env.AI_GRADE_API_KEY || '', url: process.env.AI_GRADE_BASE_URL || 'https://api.moonshot.cn/v1/chat/completions', model: process.env.AI_GRADE_MODEL || 'kimi-k2.6' },
    { name: 'kimi-code', key: process.env.AI_GRADE_API_KEY_BACKUP || '', url: process.env.AI_GRADE_BASE_URL_BACKUP || 'https://api.kimi.com/coding/v1/chat/completions', model: process.env.AI_GRADE_MODEL_BACKUP || 'kimi-for-coding', minTokens: 1500, forceTemp: 1 },
  ].filter(c => c.key);
}

// chatText({messages, maxTokens, temperature, timeoutMs}) → {text, by} | null
// 逐通道尝试,任一成功即返回;全部失败/未配置返回 null(调用方走本地兜底)
async function chatText(opts) {
  const timeoutMs = opts.timeoutMs || 90000;
  for (const c of textChannels()) {
    try {
      const r = await fetch(c.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.key },
        body: JSON.stringify({
          model: c.model,
          temperature: c.forceTemp !== undefined ? c.forceTemp : (opts.temperature !== undefined ? opts.temperature : 0.6),
          max_tokens: Math.max(opts.maxTokens || 600, c.minTokens || 0),
          messages: opts.messages,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!r.ok) continue;
      const d = await r.json();
      const text = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content || '').trim();
      if (text) return { text, by: c.name };
    } catch (e) { /* 换下一通道 */ }
  }
  return null;
}

// ===================== 视觉通道 =====================
function visionChannels() {
  return [
    { name: 'mimo', key: mimoKey(), url: mimoUrl(), model: process.env.MIMO_VISION_MODEL || 'mimo-v2.5', minTokens: 800 },
    { name: 'moonshot-vision', key: process.env.AI_GRADE_API_KEY || '', url: process.env.AI_VISION_BASE_URL || process.env.AI_GRADE_BASE_URL || 'https://api.moonshot.cn/v1/chat/completions', model: process.env.AI_VISION_MODEL || 'moonshot-v1-8k-vision-preview' },
    { name: 'kimi-code', key: process.env.AI_GRADE_API_KEY_BACKUP || '', url: process.env.AI_VISION_BASE_URL_BACKUP || 'https://api.kimi.com/coding/v1/chat/completions', model: process.env.AI_VISION_MODEL_BACKUP || 'kimi-for-coding', minTokens: 800, forceTemp: 1 },
  ].filter(c => c.key);
}

// chatVision({text, imageB64, maxTokens, timeoutMs}) → {text, by} | null
async function chatVision(opts) {
  const timeoutMs = opts.timeoutMs || 90000;
  for (const c of visionChannels()) {
    try {
      const r = await fetch(c.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.key },
        body: JSON.stringify({
          model: c.model,
          temperature: c.forceTemp !== undefined ? c.forceTemp : 0.6,
          max_tokens: Math.max(opts.maxTokens || 120, c.minTokens || 0),
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${opts.imageB64}` } },
              { type: 'text', text: opts.text },
            ],
          }],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!r.ok) continue;
      const d = await r.json();
      const text = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content || '').trim();
      if (text) return { text, by: c.name };
    } catch (e) { /* 换下一通道 */ }
  }
  return null;
}

// ===================== 语音通道(MiMo TTS;edge-tts 兜底在 lib/tts.js) =====================
// synthTts(text) → Buffer(mp3) | null;失败返回 null 由调用方回退本地引擎
async function synthTts(text) {
  const key = mimoKey();
  if (!key) return null;
  try {
    const r = await fetch(mimoUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: process.env.MIMO_TTS_MODEL || 'mimo-v2.5-tts',
        messages: [{ role: 'assistant', content: text }],
        audio: { format: 'mp3', voice: process.env.MIMO_TTS_VOICE || 'mimo_default' },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const b64 = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.audio && d.choices[0].message.audio.data;
    if (!b64) return null;
    const buf = Buffer.from(b64, 'base64');
    return buf.length > 500 ? buf : null;
  } catch (e) {
    return null;
  }
}

module.exports = { chatText, chatVision, synthTts };
