// publish.js — 文件落名之后的公共尾巴(归属记录 → 反刷 → 响应 → 广播 / R2 镜像 / 压缩 / SSE)
// (2026-10-12 审计挂账 R2 第一步自 lib/files-upload.js 搬入:判定结论、状态码、响应文案、执行顺序
//  逐条对齐改造前。刻意不动的一处:违规拒传时的删文件从 unlinkSync 改为异步 fs.unlink + 容忍 ENOENT
//  ——它只改变"文件从磁盘消失的时刻",不改变任何对外结论;需要绝对同步的场合仍用 unlinkSync。)
//
// 四条上传入口在这里只余两种尾巴:
//   publishAnonUpload      访客直传 + 分片末片合并(同一条后处理:审核 → aid/dk/mt 落账 → 反刷 → 201 → 广播/镜像/压缩)
//   publishWhiteboardSave  白板匿名保存 + 后台 token 直传(归属保留原 mt、pending 三态、429 文案与公开路不同)
//
// ⚠️ 刻意不做的事:
//   · 不在这里判断可见性 —— 决策表只有 src/shared/mediarules.mjs 一份,服务端裁决只有 lib/siteconfig.js 的
//     canServeMedia 一处;本模块只写 uploads[name] 的归属/待审字段(审核不可用时打 pending 标记)。
//   · 不 require 编排层(lib/files-upload.js):R2 镜像必须走它那份"进程内待补推集合 + 持久台账"的实现,
//     由调用方作为参数注入(bigscreen.js 也共用同一份),否则 no-circular 硬闸立刻红。
const fs = require('fs');
const crypto = require('crypto');
const { sendJson } = require('../util');
const { gateData, saveGateData, deviceKey, ownerAid, authVid } = require('../store');
const { mediaBroadcast } = require('../media-push');
const quota = require('./quota');
const names = require('./names');
const { moderateImage } = require('./moderate');
const { compressJob } = require('./transcode');

// ===================== 尾巴 A:访客直传 / 分片合并 =====================
// opts.compress=false ⇒ 不进后台压缩队列(分片应急通道的既有语义,见下方注释)
// 返回 true=已发布(201),false=已在本函数内回过响应(422/429)
async function publishAnonUpload(req, res, opts) {
  const { dir, name, filePath, isImg, r2Mirror } = opts;
  const compress = opts.compress !== false;
  // C8 NSFW 审核:图片写完后过 vision 双通道,违规即删+拒传
  // 本人私有照片(自己看自己,不外泄)按既定口径维持:'unavailable'(审核不可用)仍放行
  if (isImg) {
    const verdict = await moderateImage(filePath);
    if (verdict === 'block') {
      try { fs.unlink(filePath, () => {}); } catch (e) {}
      if (!res.writableEnded) sendJson(res, 422, { error: '这片灵蕴暂时无法归位' });
      return false;
    }
  }
  if (!gateData.uploads) gateData.uploads = {};
  const dk = deviceKey(req);
  // aid=不可猜测访客身份(vid Cookie 优先,2026-07-28 审计加固;旧记录无 aid 走 UA 兜底)
  const aid = ownerAid(req);
  const st = fs.statSync(filePath);
  gateData.uploads[name] = { dk, aid, ts: Date.now(), mt: crypto.randomBytes(10).toString('hex') };
  // 2026-09-18 审计 P2#8:反刷硬拒(速率/单文件/设备累计)——超限删文件并 429
  const abuseBlock = quota.check(dk, name, st.size);
  if (abuseBlock && abuseBlock !== 'storage') {
    try { fs.unlinkSync(filePath); } catch (e) {}
    delete gateData.uploads[name];
    try { saveGateData(); } catch (e) {}
    sendJson(res, 429, { error: '上传过于频繁或超出设备配额，请稍后再试' });
    return false;
  }
  saveGateData();
  sendJson(res, 201, { ok: true, name, url: `/${dir}/${encodeURIComponent(name)}`, size: st.size, mt: gateData.uploads[name].mt });
  try { mediaBroadcast({ dir, name }); } catch (e) {}
  r2Mirror(dir, name, filePath);
  // 压缩队列:直传照旧进队;**分片应急通道刻意不进实时队列**(改造前的既有语义,搬动时原样保留)——
  //   那条路存在的理由就是"边缘→源站只有 12-40KB/s 的晚高峰",来的多半是几百 MB 的视频,
  //   在 2 核源站上排队 ffmpeg 会把正在服务的其它请求一起拖慢。
  //   容器归一不因此放弃:由 lib/files-upload.js 的 sweepVideoNormalize(启动 + 每小时)事后补投同一个队列。
  if (compress) setImmediate(() => compressJob(dir, name, r2Mirror));
  return true;
}

// ===================== 尾巴 B:白板匿名保存 / 后台 token 直传 =====================
async function publishWhiteboardSave(req, res, opts) {
  const { dir, finalName, filePath, adminWrite, exclusiveNew, overwriteOwn, r2Mirror } = opts;
  let st;
  try { st = fs.statSync(filePath); } catch (e) { sendJson(res, 500, { error: '文件状态异常' }); return; }
  const isWb = names.isPublicLike(dir, finalName);
  // DG-SEC-001:白板归属落账 —— aid=本人有效 vid(覆盖判定与后台"归属"列都吃它),
  //   重保存保留原 mt(已分享出去的 URL 不断),新作品签发新 mt(与公开分支同形)
  if (!adminWrite && isWb) {
    if (!gateData.uploads) gateData.uploads = {};
    const aid = authVid(req);
    const prev = gateData.uploads[finalName];
    gateData.uploads[finalName] = (prev && prev.aid === aid)
      ? Object.assign({}, prev, { dk: deviceKey(req), aid, ts: Date.now() })
      : { dk: deviceKey(req), aid, ts: Date.now(), mt: crypto.randomBytes(10).toString('hex') };
    try { saveGateData(); } catch (e) {}
  }
  // 2026-09-20 审计 M2:非 public 分支补齐公开路同款防线——
  //   ① 图片过 NSFW(白板是匿名公开展品,与照片同险);② 白板计入 abuse 限速(超限删文件+429)。
  if (isWb && st.size) {
    const verdict = await moderateImage(filePath);
    if (verdict === 'block') {
      try { fs.unlinkSync(filePath); } catch (e) {}
      if (gateData.uploads) delete gateData.uploads[finalName];
      if (!res.writableEnded) sendJson(res, 422, { error: '这片灵蕴暂时无法归位' });
      return;
    }
    // DG-UP-003 决策:只对公开展品 fail-closed。审核通道已开启却失败/超时/无响应 = 'unavailable'
    //   ⇒ 不自动上墙(记 uploads[name].pending,决策表 mediarules 据此同时挡墙面与下载);
    //   按数据保留铁律软处理:文件保留、绝不删,后台复核或下次上传通过即摘除标记。
    //   私人上传(自己看自己)维持原样:unavailable 仍按放行处理。
    if (verdict === 'unavailable') {
      if (!gateData.uploads) gateData.uploads = {};
      const ts = Date.now();
      const rec = gateData.uploads[finalName] || (gateData.uploads[finalName] = {
        dk: deviceKey(req), aid: adminWrite ? ownerAid(req) : authVid(req), ts, mt: crypto.randomBytes(10).toString('hex'),
      });
      rec.pending = ts;
      try { saveGateData(); } catch (e) {}
      if (!res.writableEnded) sendJson(res, 202, {
        ok: true, pending: true, name: finalName, url: `/${dir}/${encodeURIComponent(finalName)}`, size: st.size,
        status: 'pending-review', message: '作品已收到,审核通道暂不可用,复核通过后自动上墙',
      });
      return;
    }
    // 审核正常通过:摘掉历史 pending 标记(白板允许本人重保存,重画即重审)
    if (gateData.uploads && gateData.uploads[finalName] && gateData.uploads[finalName].pending) {
      delete gateData.uploads[finalName].pending;
      try { saveGateData(); } catch (e) {}
    }
  }
  if (isWb || /^whiteboard-/.test(finalName)) {
    const dk = deviceKey(req);
    const block = quota.check(dk, finalName, st.size);
    if (block && block !== 'storage') {
      try { fs.unlinkSync(filePath); } catch (e) {}
      if (gateData.uploads) delete gateData.uploads[finalName];
      try { saveGateData(); } catch (e) {}
      if (!res.writableEnded) sendJson(res, 429, { error: '上传太快啦，休息一下再来' });
      return;
    }
  }
  sendJson(res, 201, {
    ok: true, name: finalName, url: `/${dir}/${encodeURIComponent(finalName)}`, size: st.size,
    // 服务端签发口径回给前端:新作品 issued=true(前端据此把当前画绑定到这个名字,后续保存即覆盖自己)
    issued: !adminWrite && exclusiveNew ? true : undefined,
    overwritten: overwriteOwn || undefined,
  });
  // 服务端主动推送:新文件立即通知所有在线游戏页刷新(2026-08-29)
  try { mediaBroadcast({ dir, name: finalName }); } catch (e) {}
  // 自动镜像到 R2(白板/后台直传;压缩完成若替换会再同步一次)
  r2Mirror(dir, finalName, filePath);
  // 白板新作即时推送(替代访客端 5s 轮询,2026-07-25):SSE 通知所有在线页面刷新作品墙
  if (/^whiteboard-/.test(finalName)) { try { require('../gate').sseKick(); } catch (e) {} }
}

module.exports = { publishAnonUpload, publishWhiteboardSave };
