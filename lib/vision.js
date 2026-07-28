// vision.js — AI 看图:访客上传照片后生成墙上配文
// 走主 AI 通道(AI_GRADE_API_KEY),默认低价视觉模型 moonshot-v1-8k-vision-preview
// 仅在上传时触发一次;AI 审核不过/调用失败也照常上传,配文用回退句
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./config');
const { gateData, saveGateData, deviceKey } = require('./store');
const { sendJson, readBody, isValidName } = require('./util');
const { isMineUpload } = require('./siteconfig');

const FALLBACK = '这张照片,已替你好好珍藏。';

// 调视觉模型,返回配文字符串;任何失败都返回 null(调用方用回退句)
// 双通道:主 moonshot 视觉模型 → 备 Kimi Code(思考型,支持视觉;max_tokens 留足推理空间)
async function analyzeImage(filePath) {
  const b64 = fs.readFileSync(filePath).toString('base64');
  const channels = [
    {
      key: process.env.AI_GRADE_API_KEY || '',
      url: process.env.AI_VISION_BASE_URL || process.env.AI_GRADE_BASE_URL || 'https://api.moonshot.cn/v1/chat/completions',
      model: process.env.AI_VISION_MODEL || 'moonshot-v1-8k-vision-preview',
      maxTokens: 120,
    },
    {
      key: process.env.AI_GRADE_API_KEY_BACKUP || '',
      url: process.env.AI_VISION_BASE_URL_BACKUP || 'https://api.kimi.com/coding/v1/chat/completions',
      model: process.env.AI_VISION_MODEL_BACKUP || 'kimi-for-coding',
      temperature: 1, // kimi-for-coding 只允许 temperature=1(实测 400: invalid temperature)
      maxTokens: 800, // 思考型模型:推理链约 600 token
    },
  ].filter(c => c.key);
  for (const c of channels) {
    const r = await analyzeWithChannel(c, b64);
    if (r) return r;
  }
  return null;
}

async function analyzeWithChannel(c, b64) {
  try {
    const r = await fetch(c.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.key },
      body: JSON.stringify({
        model: c.model, temperature: c.temperature !== undefined ? c.temperature : 0.6, max_tokens: c.maxTokens,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
            { type: 'text', text: '用一句优美的中文描述这张照片(30字以内),风格像画廊展品墙上的配文,只输出配文本身,不要引号不要解释。' },
          ],
        }],
      }),
      signal: AbortSignal.timeout(90000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const text = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
    const caption = text.trim().replace(/^["'「『]+|["'」』\n]+$/g, '').slice(0, 60);
    return caption || null;
  } catch (e) {
    return null;
  }
}

// POST /api/vision/analyze {file:'xxx.jpg'}(公开,仅限本人上传的照片)
// 同步返回配文(最多等 90s);已分析过的直接返回缓存
// 成本闸(2026-07-28 OWASP 审计:上传无限+每张可分析一次 → AI 费用可被刷;每设备每天限 20 次,缓存命中不计)
function handleVisionAnalyze(req, res) {
  readBody(req, async obj => {
    const name = String(obj.file || '');
    if (!isValidName(name)) { sendJson(res, 400, { error: '文件名不合法' }); return; }
    const dk = deviceKey(req);
    const rec = gateData.uploads && gateData.uploads[name];
    if (!rec || !isMineUpload(req, rec, dk)) { sendJson(res, 403, { error: '只能分析自己上传的照片' }); return; }
    if (gateData.photoCaptions[name]) { sendJson(res, 200, { ok: true, caption: gateData.photoCaptions[name], cached: true }); return; }
    const day = new Date().toISOString().slice(0, 10);
    if (!gateData.visionQuota) gateData.visionQuota = {};
    const q = gateData.visionQuota[dk] || { day, n: 0 };
    if (q.day !== day) { q.day = day; q.n = 0; }
    if (q.n >= 20) { sendJson(res, 429, { error: '今日看图次数已用完' }); return; }
    q.n++; gateData.visionQuota[dk] = q; saveGateData();
    const filePath = path.join(ROOT, 'photos', name);
    let caption = null;
    try { caption = await analyzeImage(filePath); } catch (e) { /* 回退 */ }
    if (!caption) caption = FALLBACK;
    gateData.photoCaptions[name] = caption;
    saveGateData();
    sendJson(res, 200, { ok: true, caption, fallback: caption === FALLBACK });
  });
}

module.exports = { handleVisionAnalyze };
