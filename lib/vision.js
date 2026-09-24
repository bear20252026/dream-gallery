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
// 通道登记处单一源(lib/aichannels.js,2026-07-28 主人定小米首选):mimo-v2.5 全模态 → moonshot 视觉 → Kimi Code
const { chatVision } = require('./aichannels');
async function analyzeImage(filePath) {
  const b64 = fs.readFileSync(filePath).toString('base64');
  const r = await chatVision({
    text: '用一句优美的中文描述这张照片(30字以内),风格像画廊展品墙上的配文,只输出配文本身,不要引号不要解释。',
    imageB64: b64,
    maxTokens: 120,
    timeoutMs: 90000,
  });
  if (!r) return null;
  const caption = r.text.trim().replace(/^["'「『]+|["'」』\n]+$/g, '').slice(0, 60);
  return caption || null;
}

// POST /api/vision/analyze {file:'xxx.jpg'}(公开,仅限本人上传的照片)
// 同步返回配文(最多等 90s);已分析过的直接返回缓存
// 成本天然有界:只有照片上传者本人可分析 + 每张照片只分析一次(结果缓存 photoCaptions)。
// (2026-09-24 主人令:每设备日限 20 次已拆除 —— 有界成本不再需要配额闸)
function handleVisionAnalyze(req, res) {
  readBody(req, async obj => {
    const name = String(obj.file || '');
    if (!isValidName(name)) { sendJson(res, 400, { error: '文件名不合法' }); return; }
    const dk = deviceKey(req);
    const rec = gateData.uploads && gateData.uploads[name];
    if (!rec || !isMineUpload(req, rec, dk)) { sendJson(res, 403, { error: '只能分析自己上传的照片' }); return; }
    if (gateData.photoCaptions[name]) { sendJson(res, 200, { ok: true, caption: gateData.photoCaptions[name], cached: true }); return; }
    const photoRoot = path.join(ROOT, 'photos');
    const filePath = `${photoRoot}${path.sep}${name}`; // 与 join 等价,name 须落回 photos 内
    if (!filePath.startsWith(photoRoot + path.sep)) { sendJson(res, 400, { error: 'bad name' }); return; }
    let caption = null;
    try { caption = await analyzeImage(filePath); } catch (e) { /* 回退 */ }
    if (!caption) caption = FALLBACK;
    gateData.photoCaptions[name] = caption;
    saveGateData();
    sendJson(res, 200, { ok: true, caption, fallback: caption === FALLBACK });
  });
}

module.exports = { handleVisionAnalyze };
