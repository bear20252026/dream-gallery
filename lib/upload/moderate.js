// moderate.js — C8 NSFW 审核(2026-07-30 建;三态化 2026-10-11 DG-UP-003)
// (2026-10-12 审计挂账 R2 第一步自 lib/files-upload.js 原样搬入,三态结论与降级路径一字未改)
//
// 图片上传完成后过 vision 双通道判定;开关由 NSFW_MODERATE=1 控制(默认关,不惊扰/不烧钱/测试确定性);
// 三态返回:
//   'allow'        = 判定安全,或审核开关未开(主人的成本策略,照旧放行)
//   'block'        = 判定违规(调用方删文件 + 422)
//   'unavailable'  = 审核已开启却拿不到结论(取样失败/AI 全通道失败/超时/空响应)
//                    ⇒ 调用方按展品公开性决定:匿名公开展品 fail-closed(挂 pending 不上墙),私人展品放行
// 开关按调用时读环境:运行期可关可开,单测也能确定性切换三态
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { chatVision } = require('../aichannels');

// spawn 走调用期取用(不在顶层解构):单测据此可桩掉 ffmpeg,不必依赖真二进制
function spawnProc(cmd, args, opts) { return require('child_process').spawn(cmd, args, opts); }

function nsfwEnabled() { return process.env.NSFW_MODERATE === '1'; }
const NSFW_PROMPT = '你是内容安全审核员。判断图像是否包含色情、裸露、性暗示、血腥暴力或违法内容。只回复一个单词:若安全请回复 PASS,若违反请回复 BLOCK。不要输出任何其他文字或标点。';

// 送样前降采样到 ≤maxPx 的 JPEG(2026-10-11 DG-AI-001:整张原图直送 base64 是内存放大器
//   —— 50MB 照片 = 一次性 ~67MB 字符串 + JSON 体再翻倍;仓内早有 scale='min(512,iw)' 先例)
// 小文件不必起 ffmpeg / ffmpeg 缺失或失败 → 回退原图字节;全程异步,不在事件循环上同步读盘
// 返回 { b64, via } via: 'scaled'|'raw'|'missing'|'error'(调用方据此判是否拿到可用样本)
const SAMPLE_INLINE_MAX = 256 * 1024;
async function imgB64Sample(filePath, maxPx) {
  const px = Number(maxPx) > 0 ? Number(maxPx) : 512;
  let size = 0;
  try { size = (await fs.promises.stat(filePath)).size; }
  catch (e) { return { b64: '', via: 'missing' }; }
  const raw = async () => {
    try { return { b64: (await fs.promises.readFile(filePath)).toString('base64'), via: 'raw' }; }
    catch (e) { return { b64: '', via: 'error' }; }
  };
  if (size <= SAMPLE_INLINE_MAX) return await raw();
  const tmp = path.join(os.tmpdir(), 'sample-' + crypto.randomBytes(6).toString('hex') + '.jpg');
  return await new Promise(resolve => {
    let settled = false;
    const fin = async useTmp => {
      if (settled) return;
      settled = true;
      let out;
      try {
        const buf = await fs.promises.readFile(useTmp ? tmp : filePath);
        out = { b64: buf.toString('base64'), via: useTmp ? 'scaled' : 'raw' };
      } catch (e) { out = { b64: '', via: 'error' }; }
      fs.unlink(tmp, () => {});
      resolve(out);
    };
    let p;
    try {
      p = spawnProc('ffmpeg', ['-y', '-i', filePath, '-vf', `scale='min(${px},iw)':-2`, '-q:v', '5', tmp], { stdio: 'ignore' });
    } catch (e) { return fin(false); }
    p.on('error', () => fin(false));
    p.on('close', code => fin(code === 0 && fs.existsSync(tmp)));
  });
}

async function moderateImage(filePath) {
  if (!nsfwEnabled()) return 'allow';
  let sample;
  try { sample = await imgB64Sample(filePath, 512); } catch (e) { return 'unavailable'; }
  if (!sample || !sample.b64) return 'unavailable';
  try {
    const r = await chatVision({ text: NSFW_PROMPT, imageB64: sample.b64, maxTokens: 8, timeoutMs: 25000 });
    if (!r || !r.text) return 'unavailable';
    return /BLOCK/.test(r.text.toUpperCase()) ? 'block' : 'allow';
  } catch (e) { return 'unavailable'; }
}

module.exports = { moderateImage, imgB64Sample, nsfwEnabled, NSFW_PROMPT, SAMPLE_INLINE_MAX };
