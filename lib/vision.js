// vision.js — AI 看图:访客上传照片后生成墙上配文
// 走主 AI 通道(AI_GRADE_API_KEY),默认低价视觉模型 moonshot-v1-8k-vision-preview
// 仅在上传时触发一次;AI 审核不过/调用失败也照常上传,配文用回退句
// DG-AI-001/002(2026-10-11)整改:
//   ① 送样前降采样到 ≤512px(复用 lib/files-upload.js 的 imgB64Sample 单一实现)并走异步读盘
//      —— 原先 fs.readFileSync(50MB 照片).toString('base64') 在事件循环上同步制造几十 MB 字符串;
//   ② analysisInFlight 去重 —— 原先"查缓存 → await 分析 → 写缓存"之间并发双请求双付费;
//   ③ 失败不再落盘 —— 原先无条件写缓存,一次瞬时 AI 故障就把这张照片永久锁成回退句;
//   ④ 补 ratelimit 桶(每 IP 每分钟 6 次)—— vision 是四个 AI 端点里唯一没有洪水防护的。
//      阈值依据:预热脚本与单张上传都是"一张一问",6/分 打不到正常访客(缓存命中还免检)。
const path = require('path');
const { ROOT } = require('./config');
const { gateData, saveGateData, deviceKey } = require('./store');
const { sendJson, readBody, isValidName } = require('./util');
const { isMineUpload } = require('./siteconfig');
const ratelimit = require('./ratelimit');
const { imgB64Sample } = require('./files-upload');

const FALLBACK = '这张照片,已替你好好珍藏。';
const VISION_RATE_PER_MIN = 6;

// 调视觉模型,返回配文字符串;任何失败都返回 null(调用方用回退句,且下次可重试)
// 通道登记处单一源(lib/aichannels.js,2026-07-28 主人定小米首选):mimo-v2.5 全模态 → moonshot 视觉 → Kimi Code
// 用量记账(2026-10-12 审计 P2):以前 r.by(命中哪个通道)在这里被直接丢掉,现在补进 lib/aiusage.js 台账;
//   只记维度(能力/通道/模型/耗时/成败/token/错误类别),照片名与配文文本一律不入台账(隐私铁律)。
const { chatVision } = require('./aichannels');
const aiusage = require('./aiusage');
async function analyzeImage(filePath) {
  const sample = await imgB64Sample(filePath, 512);
  if (!sample || !sample.b64) return null; // 没出网,不计用量
  const t0 = Date.now();
  let r = null;
  let thrown = false;
  try {
    r = await chatVision({
      text: '用一句优美的中文描述这张照片(30字以内),风格像画廊展品墙上的配文,只输出配文本身,不要引号不要解释。',
      imageB64: sample.b64,
      maxTokens: 120,
      timeoutMs: 90000,
    });
  } catch (e) {
    thrown = true;
  }
  aiusage.record({
    capability: 'vision',
    channel: r && r.by,
    model: r && r.model,
    ok: !!(r && r.text),
    latencyMs: Date.now() - t0,
    tokens: (r && r.tokens) || 0,
    errKind: thrown ? 'throw' : r ? (r.text ? '' : 'empty') : 'no-channel',
  });
  if (!r || !r.text) return null;
  const caption = r.text.trim().replace(/^["'「『]+|["'」』\n]+$/g, '').slice(0, 60);
  return caption || null;
}

// 同名照片只允许一个在途 AI 请求;成功才落 photoCaptions,失败留空让下次重问
const analysisInFlight = new Map(); // name -> Promise<string|null>
function analyzeDeduped(name, filePath) {
  const running = analysisInFlight.get(name);
  if (running) return running;
  const task = (async () => {
    let caption = null;
    try { caption = await analyzeImage(filePath); } catch (e) { caption = null; }
    if (caption) {
      if (!gateData.photoCaptions) gateData.photoCaptions = {};
      gateData.photoCaptions[name] = caption;
      try { saveGateData(); } catch (e) {}
    }
    return caption;
  })();
  analysisInFlight.set(name, task);
  task.then(() => { if (analysisInFlight.get(name) === task) analysisInFlight.delete(name); },
            () => { if (analysisInFlight.get(name) === task) analysisInFlight.delete(name); });
  return task;
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
    if (gateData.photoCaptions && gateData.photoCaptions[name]) { sendJson(res, 200, { ok: true, caption: gateData.photoCaptions[name], cached: true }); return; }
    // 洪水防护(2026-10-11 DG-AI-001):只对真要花钱的分析计额,缓存命中在上面已免检
    if (!ratelimit.hit(req, 'vision', VISION_RATE_PER_MIN).ok) {
      sendJson(res, 429, { error: '看图配文请求太频繁,请稍后再试' });
      return;
    }
    const photoRoot = path.join(ROOT, 'photos');
    const filePath = `${photoRoot}${path.sep}${name}`; // 与 join 等价,name 须落回 photos 内
    if (!filePath.startsWith(photoRoot + path.sep)) { sendJson(res, 400, { error: 'bad name' }); return; }
    const deduped = analysisInFlight.has(name); // 并发第二问:等同一个 Promise,不再多花一次额度
    let caption = null;
    try { caption = await analyzeDeduped(name, filePath); } catch (e) { caption = null; }
    sendJson(res, 200, {
      ok: true,
      caption: caption || FALLBACK,
      fallback: !caption,
      retryable: !caption, // 回退句是临时的:下次再来会重新问 AI(2026-10-11 不再永久锁死)
      deduped,
    });
  });
}

module.exports = { handleVisionAnalyze, analyzeImage, analyzeDeduped, FALLBACK, VISION_RATE_PER_MIN };
