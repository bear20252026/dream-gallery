// ===================== 户外大屏配置管理(2026-08-29) =====================
// 需求:户外大屏视频软编码(不再写死在 video-wall.js),参与后台管理(上传/替换/清空)。
// 配置存 gate_data.json 的 bigscreen 数组(与 siteConfig 同机制),持久化、后台可改。
// 槽位沿用原有 5 屏几何:main1/main2 共用大mesh, main3 为 HLS 小mesh, v45a/v45b 共用小屏 mesh。
// 文件统一放 videos/户外大屏/ 子目录;上传/删除同时经 r2outbox 镜像 R2(记账 + 失败退避重试)并广播游戏端。
const fs = require('fs');
const path = require('path');
const { ROOT, TOKEN } = require('./config');
const { sendJson, safeJoin, isValidName } = require('./util');
const { gateData, saveGateData } = require('./store');
const { tokenOk } = require('./admin');
const r2outbox = require('./r2outbox'); // 持久待发台账:镜像失败不再"永久缺席 R2"(2026-10-11 DG-R2-003)
const { mediaBroadcast } = require('./media-push');
// 2026-10-12 审计挂账 R2 第一步:大屏与访客上传原先各写一套"Content-Length 预检 / 流式计数 /
// 超限 destroy / 失败 unlink"(2026-10-11 分批补上去的,形态重复)——现共用 lib/upload/stream.js,
// 扩展名白名单与拒答文案共用 lib/upload/magic.js。**端点鉴权(后台 token)、2GB 上限、错误码一律不动**:
// 大屏不接容量/并发闸(lib/upload/quota.js),因为那是管理员入口,占位在账会改变匿名侧的 4 并发口径。
const stream = require('./upload/stream');
const magic = require('./upload/magic');

const BSCREEN_DIR = path.join(ROOT, 'videos', '户外大屏');
const BSCREEN_KEY = '户外大屏';
// 大屏上传上限 2GB(2026-10-11 三十一):此前全函数零上限(Cl 不预检、字节不计数、失败不 unlink),
//   一条请求可写满磁盘。注意这是**管理员入口**(路由 auth:'write',仅后台 token 可达)的上限,
//   不是访客入口(访客直传 50MB/700MB、分片同规),两个口径刻意不同:大屏要放长轮播片。
const BIGSCREEN_MAX_BYTES = 2 * 1024 * 1024 * 1024;

// 镜像到 R2(2026-10-11 DG-R2-003):优先走 files-upload 的 r2Mirror(进程内待补推集合 + 持久台账),
//   拿不到该模块时退回 r2outbox 直记台账 —— 两条路都会落账,失败由退避重试兜住,不再有"永久缺席"
function mirrorToR2(dir, keyName, filePath) {
  try {
    require('./files-upload').r2Mirror(dir, keyName, filePath);
  } catch (e) {
    try { r2outbox.syncPut(dir, keyName, filePath); } catch (e2) {
      console.warn('[bigscreen] R2 镜像记账失败(台账与直推都不可用):', dir, keyName, e2 && e2.message);
    }
  }
}

// 默认 5 槽(与 2026-08-29 之前 video-wall.js 硬编码一致;file 可被后台上传替换)
const DEFAULT_BIGSCREEN = [
  { slot: 'main1', label: '大屏1号', group: 'main', file: '户外大屏1号.mp4', x: 67.51, y: 46.6, z: 15.97, sx: 2.5, hls: false, plays: 1 },
  { slot: 'main2', label: '大屏2号', group: 'main', file: '户外大屏2号.mp4', x: 67.51, y: 46.6, z: 15.97, sx: 2.5, hls: false, plays: 2 },
  { slot: 'main3', label: '大屏3号', group: 'main', file: '户外大屏3号.m3u8', x: -0.67, y: 46.6, z: 99.99, sx: 1, hls: true, plays: 1 },
  { slot: 'v45a', label: '大屏4号', group: 'v45', file: '户外大屏4号.mp4', x: 0.58, y: 46.6, z: -100.02, sx: 2.5, hls: false, plays: 1 },
  { slot: 'v45b', label: '大屏5号', group: 'v45', file: '户外大屏5号.mp4', x: 0.58, y: 46.6, z: -100.02, sx: 2.5, hls: false, plays: 2 },
];

function getBigscreen() {
  if (!gateData.bigscreen || !Array.isArray(gateData.bigscreen) || !gateData.bigscreen.length) {
    gateData.bigscreen = DEFAULT_BIGSCREEN.map(s => ({ ...s }));
  }
  return gateData.bigscreen;
}
function findSlot(slot) {
  return getBigscreen().find(s => s.slot === slot);
}

// GET /api/bigscreen(公开):返回槽位配置(含 src 完整 CDN URL)
function handleBigscreenGet(req, res) {
  const slots = getBigscreen().map(s => ({
    ...s,
    src: s.file ? `https://cdn.cloudbear.cloud/videos/${BSCREEN_KEY}/${encodeURIComponent(s.file)}` : '',
  }));
  sendJson(res, 200, { ok: true, slots });
}

// POST /api/admin/bigscreen/upload?slot=main1&name=xxx.mp4(token, body=文件内容)
function handleBigscreenUpload(req, res, query) {
  if (TOKEN && !tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
  const slot = findSlot(String(query.slot || ''));
  const name = String(query.name || '');
  if (!slot) { sendJson(res, 400, { error: '槽位不存在' }); return; }
  if (!isValidName(name)) { sendJson(res, 400, { error: '文件名不合法' }); return; }
  if (!magic.bscreenExtAllowed(name)) {
    sendJson(res, 400, { error: magic.BSCREEN_FORMAT_ERROR });
    return;
  }
  try { fs.mkdirSync(BSCREEN_DIR, { recursive: true }); } catch (e) {}
  const filePath = safeJoin(path.join('videos', BSCREEN_KEY, name));
  if (!filePath) { sendJson(res, 400, { error: '路径不合法' }); return; }
  // ① Content-Length 预检(超限连一个字节都不落盘)
  if (stream.overContentLength(req, BIGSCREEN_MAX_BYTES)) { sendJson(res, 413, { error: magic.BSCREEN_TOO_BIG }); return; }
  const ws = fs.createWriteStream(filePath);
  // ② 流式字节计数 + ③ 超限即刻 destroy + ④ 任何失败路径 unlink —— 与访客侧共用 lib/upload/stream.js
  stream.guard(req, ws, {
    maxBytes: BIGSCREEN_MAX_BYTES,
    filePath,
    overflow: { code: 413, message: magic.BSCREEN_TOO_BIG },
    onUnlinkError: (err, msg) => console.warn('[bigscreen] 超限清理失败:', msg, err.message),
    respond: (code, message) => { if (!res.writableEnded) sendJson(res, code, { error: message }); },
    onFinish: () => {
      let st;
      try { st = fs.statSync(filePath); }
      catch (e) { if (!res.writableEnded) sendJson(res, 500, { error: '文件状态异常' }); return; }
      // 更新配置并持久化
      slot.file = name;
      saveGateData();
      // 镜像 R2 + 广播游戏端刷新大屏
      mirrorToR2('videos', BSCREEN_KEY + '/' + name, filePath);
      try { mediaBroadcast({ dir: 'videos', name: BSCREEN_KEY + '/' + name, bigscreen: true }); } catch (e) {}
      sendJson(res, 201, { ok: true, slot: slot.slot, name, size: st.size });
    },
    onError: (st, err) => {
      if (st.over()) return; // 超限中止已经回过 413,不再补一次 500
      fs.unlink(filePath, ue => { if (ue && ue.code !== 'ENOENT') console.warn('[bigscreen] 写失败后清理失败:', err.message, ue.message); });
      if (!res.writableEnded) sendJson(res, 500, { error: '写入失败' });
    },
  });
}

// POST /api/admin/bigscreen/delete?slot=main1(token):清空该槽位视频(文件+配置+R2)
function handleBigscreenDelete(req, res, query) {
  if (TOKEN && !tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
  const slot = findSlot(String(query.slot || ''));
  if (!slot) { sendJson(res, 400, { error: '槽位不存在' }); return; }
  const old = slot.file;
  if (!old) { sendJson(res, 200, { ok: true, already: true }); return; }
  const filePath = safeJoin(path.join('videos', BSCREEN_KEY, old));
  if (filePath) fs.unlink(filePath, err => {
    // 删除失败必须留痕:配置已置空但文件还在 = 继续占盘且 R2/源站不一致
    if (err && err.code !== 'ENOENT') console.warn('[bigscreen] 槽位文件删除失败:', old, err.message);
  });
  slot.file = '';
  saveGateData();
  // R2 侧也要删掉:失败进台账按退避接着重试(反向分歧:源站已删而 CDN 还挂着大屏片)
  try { r2outbox.syncDelete('videos', BSCREEN_KEY + '/' + old); } catch (e) {
    console.warn('[bigscreen] R2 删除记账失败:', e && e.message);
  }
  try { mediaBroadcast({ dir: 'videos', name: BSCREEN_KEY + '/' + old, bigscreen: true }); } catch (e) {}
  sendJson(res, 200, { ok: true, slot: slot.slot, removed: old });
}

module.exports = { getBigscreen, handleBigscreenGet, handleBigscreenUpload, handleBigscreenDelete, BIGSCREEN_MAX_BYTES };
