// siteconfig.js — 站点配置:展示区模式(普通/特殊) + 自定义链接 + 访客上传归属
// 数据存 gate_data.json 的 siteConfig/uploads/photoCaptions 三个键,重启不丢
// 模式映射(2026-07-25 主人定):
//   normal(普通,默认):图库照片/视频不上墙、金山文档(isLink2,4~13)/瑶华传(isLink3)/秘密花园(isGarden)链接屏蔽、
//                      情书(isLink)改写为《元素共鸣准则》;访客可见自己上传的照片
//   special(特殊):现状全展示
const { gateData, saveGateData, deviceKey } = require('./store');
const { sendJson, readBody, getCookies } = require('./util');
const { tokenOk } = require('./admin');

// 结构默认值(老数据文件没有这些键时补齐)
if (!gateData.siteConfig) gateData.siteConfig = { mode: 'normal', customLinks: [], demoPhotos: [] };
if (!gateData.siteConfig.customLinks) gateData.siteConfig.customLinks = [];
// 演示照片(2026-07-25 主人提供 201~205):普通模式公开展示;特殊模式不上墙,仅后台展现
if (!gateData.siteConfig.demoPhotos) gateData.siteConfig.demoPhotos = ['201.jpg', '202.jpg', '203.jpg', '204.jpg', '205.png'];
if (!gateData.uploads) gateData.uploads = {};            // 文件名 -> {dk, ts, mt}(访客上传归属)
if (!gateData.photoCaptions) gateData.photoCaptions = {}; // 文件名 -> AI 配文

// 媒体令牌迁移(2026-07-27 血泪:QQ 浏览器图片代理改用代理 UA 请求 <img>,dk 对不上 → 本人照片 403 粉框)
// 为存量上传补发 mt;上传即下发,客户端拼 ?mt=,UA 漂移/图片代理仍能认出本人
{
  const crypto = require('crypto');
  let migrated = false;
  for (const u of Object.values(gateData.uploads)) {
    if (u && !u.mt) { u.mt = crypto.randomBytes(10).toString('hex'); migrated = true; }
  }
  if (migrated) saveGateData();
}

// 判断上传是否属于当前访客(2026-07-25 隧道修订;2026-07-28 审计加固:vid Cookie 优先):
// ①vid 匹配(不可猜测,仅本人浏览器持有)→ ②新指纹 ③同 UA 的历史设备记录(兼容旧数据/UA 漂移)
// 隧道前上传记的 dk 含旧公网 IP,隧道后 dk 只含 UA
function isMineUpload(req, u, dk) {
  if (u.aid) {
    const vid = getCookies(req).vid;
    if (vid && u.aid === vid) return true;
  }
  if (u.dk === dk) return true;
  const ua = req.headers['user-agent'] || '';
  if (ua) {
    for (const a of Object.values(gateData.applicants || {})) {
      if (a.dk === u.dk && a.ua === ua) return true;
    }
  }
  return false;
}

// GET /api/siteconfig(公开):模式 + 自定义链接 + 演示照片 + 本人上传(及配文) + 本人链接
// 模式判定:该设备被后台授予「特殊访问」→ special;否则用全局默认模式
// 特殊访问只能后台被动授予,前台不可申请;myUploads/myLinks 按设备指纹过滤
function handlePublicConfig(req, res) {
  const dk = deviceKey(req);
  const myUploads = Object.entries(gateData.uploads)
    .filter(([, u]) => u && isMineUpload(req, u, dk))
    .map(([name]) => name);
  const captions = {};
  for (const n of myUploads) if (gateData.photoCaptions[n]) captions[n] = gateData.photoCaptions[n];
  // 本人上传的媒体令牌(客户端拼 ?mt= 过图片代理)
  const myUploadTokens = {};
  for (const n of myUploads) if (gateData.uploads[n] && gateData.uploads[n].mt) myUploadTokens[n] = gateData.uploads[n].mt;
  const myLinks = (gateData.userLinks || [])
    .filter(l => l.dk === dk || isMineUpload(req, l, dk))
    .map(l => ({ id: l.id, name: l.name, url: l.url, model: l.model, pos: l.pos }));
  const me = Object.values(gateData.applicants || {}).find(a => a.dk === dk || a.ua === (req.headers['user-agent'] || ''));
  const special = !!(me && me.special);
  sendJson(res, 200, {
    mode: special ? 'special' : (gateData.siteConfig.mode === 'special' ? 'special' : 'normal'),
    customLinks: gateData.siteConfig.customLinks.map(l => ({ id: l.id, name: l.name, url: l.url, icon: l.icon, model: l.model })),
    demoPhotos: gateData.siteConfig.demoPhotos,
    myUploads,
    myUploadTokens,
    myLinks,
    captions,
  });
}

// POST /api/admin/demo {file, demo:true|false}(token):标记/取消演示照片
function handleAdminDemo(req, res, query) {
  if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
  readBody(req, obj => {
    const file = String(obj.file || '');
    const list = gateData.siteConfig.demoPhotos;
    const i = list.indexOf(file);
    if (obj.demo && i < 0) list.push(file);
    if (!obj.demo && i >= 0) list.splice(i, 1);
    saveGateData();
    sendJson(res, 200, { ok: true, demoPhotos: list });
  });
}

// POST /api/admin/caption {file, caption}(token):后台编辑照片的 AI 配文
function handleAdminCaption(req, res, query) {
  if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
  readBody(req, obj => {
    const file = String(obj.file || '');
    if (!file) { sendJson(res, 400, { error: '缺少文件名' }); return; }
    const caption = String(obj.caption || '').trim().slice(0, 60);
    if (!caption) { delete gateData.photoCaptions[file]; }
    else { gateData.photoCaptions[file] = caption; }
    saveGateData();
    sendJson(res, 200, { ok: true, caption: gateData.photoCaptions[file] || '' });
  });
}

// POST /api/admin/mode {mode:'normal'|'special'}(token)
function handleAdminMode(req, res, query) {
  if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
  readBody(req, obj => {
    const mode = obj.mode === 'special' ? 'special' : obj.mode === 'normal' ? 'normal' : null;
    if (!mode) { sendJson(res, 400, { error: 'mode 必须是 normal 或 special' }); return; }
    gateData.siteConfig.mode = mode;
    saveGateData();
    sendJson(res, 200, { ok: true, mode });
  });
}

// POST /api/admin/links {action:'add'|'del', name, url, id, icon, model}(token)
// icon=挂载到原有 3D 图案(仅普通模式生效:火星 isLink5/木星 isLink6/地球 isLink7 等,特殊模式不挂)
// model=新建模型类型(sphere/cube/cone/octa/torus/cylinder/icosa/knot/capsule/dodeca)
function handleAdminLinks(req, res, query) {
  if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
  readBody(req, obj => {
    const list = gateData.siteConfig.customLinks;
    if (obj.action === 'add') {
      const name = String(obj.name || '').trim().slice(0, 12);
      const url = String(obj.url || '').trim();
      const icon = String(obj.icon || '').trim();
      const model = String(obj.model || '').trim();
      if (!name || !/^https?:\/\//i.test(url)) { sendJson(res, 400, { error: '名称不能为空,链接必须是 http(s) 地址' }); return; }
      if (list.length >= 12) { sendJson(res, 400, { error: '自定义链接最多 12 条' }); return; }
      const item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, url, icon, model };
      list.push(item);
      saveGateData();
      sendJson(res, 200, { ok: true, item });
      return;
    }
    if (obj.action === 'del') {
      const i = list.findIndex(l => l.id === obj.id);
      if (i < 0) { sendJson(res, 404, { error: '链接不存在' }); return; }
      list.splice(i, 1);
      saveGateData();
      sendJson(res, 200, { ok: true });
      return;
    }
    if (obj.action === 'delUser') {
      // 后台删除访客自己添加的链接
      const ul = gateData.userLinks || [];
      const i = ul.findIndex(l => l.id === obj.id);
      if (i < 0) { sendJson(res, 404, { error: '链接不存在' }); return; }
      ul.splice(i, 1);
      saveGateData();
      sendJson(res, 200, { ok: true });
      return;
    }
    sendJson(res, 400, { error: 'action 必须是 add 或 del' });
  });
}

// POST /api/mylinks(公开,访客自己的链接):{action:'add'|'del', name, url, model, pos, id}
// 每人最多 10 条;模型新建后直接出现在玩家眼前(pos 由前端传);后台可见全部
function handleMyLinks(req, res) {
  readBody(req, obj => {
    if (!gateData.userLinks) gateData.userLinks = [];
    const dk = deviceKey(req);
    const list = gateData.userLinks;
    if (obj.action === 'add') {
      const name = String(obj.name || '').trim().slice(0, 12);
      const url = String(obj.url || '').trim();
      const model = String(obj.model || 'sphere').trim();
      if (!name || !/^https?:\/\//i.test(url)) { sendJson(res, 400, { error: '名称不能为空,链接必须是 http(s) 地址' }); return; }
      if (list.filter(l => l.dk === dk || isMineUpload(req, l, dk)).length >= 10) { sendJson(res, 400, { error: '每人最多添加 10 条自己的链接' }); return; }
      const pos = obj.pos && typeof obj.pos === 'object' ? { x: +obj.pos.x || 0, y: +obj.pos.y || 2, z: +obj.pos.z || 0 } : null;
      const item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), dk, name, url, model, pos, ts: Date.now() };
      list.push(item);
      saveGateData();
      sendJson(res, 200, { ok: true, item });
      return;
    }
    if (obj.action === 'del') {
      const i = list.findIndex(l => l.id === obj.id && (l.dk === dk || isMineUpload(req, l, dk)));
      if (i < 0) { sendJson(res, 404, { error: '链接不存在' }); return; }
      list.splice(i, 1);
      saveGateData();
      sendJson(res, 200, { ok: true });
      return;
    }
    sendJson(res, 400, { error: 'action 必须是 add 或 del' });
  });
}

// 媒体文件级门禁(2026-07-26 紧急堵口):3D 场景里的隐藏只是"看不见",裸 URL 以前谁都能下——
// 普通用户只放行:演示照片 / 白板作品 / 户外大屏 / 本人上传;图库与他人上传仅特殊模式设备
// thumbs/ 子路径按原文件名判定;全局 special 模式=全展示(主人开关)
// 决策表单一源=src/shared/mediarules.mjs(2026-07-28 深化④,客户端上墙规则同表,改规则只改那一处;
// Node≥22.12 require(ESM) 直接取用——本模块无顶层 await,本地 v24/线上 v22.23 均已验证)
const MR = require('../src/shared/mediarules.mjs');
function canServeMedia(req, dir, name) {
  // 缩略图永远公开(不涉及隐私)
  if (name.includes('thumbs/')) return true;
  const base = MR.stripThumbs(name);
  const dk = deviceKey(req);
  const u = gateData.uploads && gateData.uploads[base];
  // req._mediaPublic:按名字公开的媒体才允许 CDN 边缘缓存(2026-07-27 血泪:200 被 Cloudflare 缓存后对全员公开)
  const me = Object.values(gateData.applicants || {}).find(a => a.dk === dk || a.ua === (req.headers['user-agent'] || ''));
  const r = MR.serveDecision({
    dir, base,
    isDemo: gateData.siteConfig.demoPhotos.includes(base),
    isMine: !!(u && isMineUpload(req, u, dk)),
    hasMt: !!(u && u.mt && (req.url || '').includes('mt=' + u.mt)), // 媒体令牌:QQ/UC 图片代理 UA 漂移时仍能认出本人
    globalSpecial: gateData.siteConfig.mode === 'special',
    deviceSpecial: !!(me && me.special),
  });
  if (r.pub) req._mediaPublic = true;
  return r.allow;
}

module.exports = { handlePublicConfig, handleAdminMode, handleAdminLinks, handleAdminDemo, handleAdminCaption, handleMyLinks, isMineUpload, canServeMedia };
