// ===================== 户外大屏配置管理(2026-08-29) =====================
// 需求:户外大屏视频软编码(不再写死在 video-wall.js),参与后台管理(上传/替换/清空)。
// 配置存 gate_data.json 的 bigscreen 数组(与 siteConfig 同机制),持久化、后台可改。
// 槽位沿用原有 5 屏几何:main1/main2 共用大mesh, main3 为 HLS 小mesh, v45a/v45b 共用小屏 mesh。
// 文件统一放 videos/户外大屏/ 子目录;上传/删除同时 r2Put/r2Delete 镜像 R2 并广播游戏端。
const fs = require('fs');
const path = require('path');
const { ROOT, TOKEN } = require('./config');
const { sendJson, safeJoin, isValidName } = require('./util');
const { gateData, saveGateData } = require('./store');
const { tokenOk } = require('./admin');
const { r2Put, r2Delete } = require('./r2sync');
const { mediaBroadcast } = require('./media-push');

const BSCREEN_DIR = path.join(ROOT, 'videos', '户外大屏');
const BSCREEN_KEY = '户外大屏';

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
  const ext = path.extname(name).toLowerCase();
  if (!['.mp4', '.webm', '.m4v', '.mov', '.m3u8', '.mkv'].includes(ext)) {
    sendJson(res, 400, { error: '仅支持视频:mp4/webm/m4v/mov/mkv 或 HLS:m3u8' });
    return;
  }
  try { fs.mkdirSync(BSCREEN_DIR, { recursive: true }); } catch (e) {}
  const filePath = safeJoin(path.join('videos', BSCREEN_KEY, name));
  if (!filePath) { sendJson(res, 400, { error: '路径不合法' }); return; }
  const ws = fs.createWriteStream(filePath);
  req.pipe(ws);
  ws.on('finish', () => {
    const st = fs.statSync(filePath);
    // 更新配置并持久化
    slot.file = name;
    saveGateData();
    // 镜像 R2 + 广播游戏端刷新大屏
    try { r2Put('videos', BSCREEN_KEY + '/' + name, filePath).catch(() => {}); } catch (e) {}
    try { mediaBroadcast({ dir: 'videos', name: BSCREEN_KEY + '/' + name, bigscreen: true }); } catch (e) {}
    sendJson(res, 201, { ok: true, slot: slot.slot, name, size: st.size });
  });
  ws.on('error', () => sendJson(res, 500, { error: '写入失败' }));
}

// POST /api/admin/bigscreen/delete?slot=main1(token):清空该槽位视频(文件+配置+R2)
function handleBigscreenDelete(req, res, query) {
  if (TOKEN && !tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
  const slot = findSlot(String(query.slot || ''));
  if (!slot) { sendJson(res, 400, { error: '槽位不存在' }); return; }
  const old = slot.file;
  if (!old) { sendJson(res, 200, { ok: true, already: true }); return; }
  const filePath = safeJoin(path.join('videos', BSCREEN_KEY, old));
  if (filePath) fs.unlink(filePath, () => {});
  slot.file = '';
  saveGateData();
  try { r2Delete('videos', BSCREEN_KEY + '/' + old).catch(() => {}); } catch (e) {}
  try { mediaBroadcast({ dir: 'videos', name: BSCREEN_KEY + '/' + old, bigscreen: true }); } catch (e) {}
  sendJson(res, 200, { ok: true, slot: slot.slot, removed: old });
}

module.exports = { getBigscreen, handleBigscreenGet, handleBigscreenUpload, handleBigscreenDelete };
