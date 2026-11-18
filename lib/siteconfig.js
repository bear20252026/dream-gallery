// siteconfig.js — 站点配置:展示区模式(普通/特殊) + 自定义链接 + 访客上传归属
// 数据存 gate_data.json 的 siteConfig/uploads/photoCaptions 三个键,重启不丢
// 模式映射(2026-07-25 主人定):
//   normal(普通,默认):图库照片/视频不上墙、金山文档(isLink2,4~13)/瑶华传(isLink3)/秘密花园(isGarden)链接屏蔽、
//                      情书(isLink)改写为《元素共鸣准则》;访客可见自己上传的照片
//   special(特殊):现状全展示
const { gateData, saveGateData, deviceKey, authVid, rotateMt } = require('./store');
const { sendJson, readBody } = require('./util');
const { tokenOk } = require('./authz'); // D1:直依赖鉴权叶子,不再拖 admin handler 链
const ratelimit = require('./ratelimit'); // /api/mylinks 洪水防护(DG-SEC-002)
// 链接模型白名单单一源(2026-11-11 全面审计 P1-2):model 字段此前任意字符串可入库,
// 后台把未知 model 原样拼 innerHTML ⇒ 存储型 XSS。入库前归一,非法值回落 sphere。
const { normalizeLinkModel } = require('../src/shared/link-models.mjs');

// mt 令牌老化上限(DG-AUTH-003):mt 是「带即放行」的 bearer 令牌,永久不过期意味着一次泄漏=终身有效。
// 取 180 天:覆盖「一个赛季之后回访」的真实间隔,超龄即在本人下次访问时静默重签,
// 旧 URL(含浏览器/图片代理/聊天记录里的历史链接)自然失效,代价只是本人重取一次令牌。
const MT_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

// 结构默认值(老数据文件没有这些键时补齐)
if (!gateData.siteConfig) gateData.siteConfig = { mode: 'normal', customLinks: [], demoPhotos: [] };
if (!gateData.siteConfig.customLinks) gateData.siteConfig.customLinks = [];
// 演示照片(2026-07-25 主人提供 201~205):普通模式公开展示;特殊模式不上墙,仅后台展现
if (!gateData.siteConfig.demoPhotos) gateData.siteConfig.demoPhotos = ['201.jpg', '202.jpg', '203.jpg', '204.jpg', '205.png'];
if (!gateData.uploads) gateData.uploads = {};            // 文件名 -> {dk, aid, ts, mt, mtIssuedAt}(访客上传归属)
if (!gateData.photoCaptions) gateData.photoCaptions = {}; // 文件名 -> AI 配文

// 媒体令牌迁移(2026-07-27 血泪:QQ 浏览器图片代理改用代理 UA 请求 <img>,dk 对不上 → 本人照片 403 粉框)
// 为存量上传补发 mt;上传即下发,客户端拼 ?mt=,UA 漂移/图片代理仍能认出本人
// mtIssuedAt(DG-AUTH-003):签发时间戳,已存在则不动;存量记录按上传时间 ts 回填(ts 就是当时的上传时刻)
{
  const crypto = require('crypto');
  let migrated = false;
  for (const u of Object.values(gateData.uploads)) {
    if (!u) continue;
    if (!u.mt) {
      u.mt = crypto.randomBytes(10).toString('hex');
      u.mtIssuedAt = u.ts || Date.now();
      migrated = true;
    } else if (!u.mtIssuedAt) {
      u.mtIssuedAt = u.ts || Date.now();
      migrated = true;
    }
  }
  if (migrated) saveGateData();
}

// 2026-11-17 D1 阶段4:媒体归属/可见性门禁(isMineUpload/canServeMedia + 认领合并落盘)
// 已拆 lib/media-access.js 叶子 —— security/files-upload 顶部直依赖它,不再懒 require 本 handler 大文件。
// 这里 re-export 保测试与消费方形状;本文件内部(本人上传/链接过滤)也经同一引用。
const { isMineUpload, canServeMedia } = require('./media-access');

// GET /api/siteconfig(公开):模式 + 自定义链接 + 演示照片 + 本人上传(及配文) + 本人链接
// 2026-09-06 主人定:特殊模式整体删除——mode 恒为 'normal',不再读取设备特殊访问/全局模式
function handlePublicConfig(req, res) {
  const dk = deviceKey(req);
  const myUploads = Object.entries(gateData.uploads)
    .filter(([, u]) => u && isMineUpload(req, u, dk))
    .map(([name]) => name);
  const captions = {};
  for (const n of myUploads) if (gateData.photoCaptions[n]) captions[n] = gateData.photoCaptions[n];
  // 本人上传的媒体令牌(客户端拼 ?mt= 过图片代理);超龄即在本次访问静默重签
  const myUploadTokens = {};
  let rotated = false;
  for (const n of myUploads) {
    const u = gateData.uploads[n];
    if (!u || !u.mt) continue;
    if (!u.mtIssuedAt) u.mtIssuedAt = u.ts || Date.now();
    if (Date.now() - u.mtIssuedAt > MT_MAX_AGE_MS) { rotateMt(n, true); rotated = true; }
    myUploadTokens[n] = u.mt;
  }
  if (rotated) saveGateData();
  const myLinks = (gateData.userLinks || [])
    .filter(l => l && isMineUpload(req, l, dk))
    .map(l => ({ id: l.id, name: l.name, url: l.url, model: l.model, pos: l.pos }));
  sendJson(res, 200, {
    mode: 'normal',
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
// POST /api/admin/mode(2026-09-06 特殊模式删除:接口保留仅回 normal,兼容旧后台调用)
function handleAdminMode(req, res, query) {
  if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
  readBody(req, obj => {
    gateData.siteConfig.mode = 'normal';
    saveGateData();
    sendJson(res, 200, { ok: true, mode: 'normal' });
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
      const model = normalizeLinkModel(obj.model); // 白名单归一(审计 P1-2):非法形状回落 sphere,不原样入库
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

// POST /api/mylinks(写接口,须有效会话):{action:'add'|'del', name, url, model, pos, id}
// 每人最多 USER_LINKS_PER_PERSON 条(按 aid 计,不再经 UA);全局硬上限 USER_LINKS_MAX;
// 每 IP 每分钟 MYLINKS_RATE 次洪水防护(DG-SEC-002:原先无 Cookie 也能写——既不占自己配额
// 又能反复 saveGateData 整库快照落盘,且 userLinks 无总量上限)。
// 字段形状(aid/dk/name/url/model/pos/ts)是后台 handleAdminList 与客户端 renderMyLinks 的契约,勿动。
// ⚠️ 这三个常量 2026-10-13 起**定义在 lib/config.js**(叶子层):后台要把「已用 n / 上限」显示出来,
//   而 admin.js 一旦 require ./siteconfig 就成环(siteconfig → admin → siteconfig,no-circular 是硬闸)。
//   这里只是 re-export ⇒ 既有消费者与 lib-mylinks.test.js 的取值路径一字未变,**值也只有一份**。
const { USER_LINKS_PER_PERSON, USER_LINKS_MAX, MYLINKS_RATE } = require('./config');
function handleMyLinks(req, res) {
  readBody(req, obj => {
    const rl = ratelimit.hit(req, 'mylinks', MYLINKS_RATE);
    if (!rl.ok) { sendJson(res, 429, { error: '操作过于频繁,请稍后再试', retryAfter: rl.retryAfter }); return; }
    const vid = authVid(req);
    if (!vid) { sendJson(res, 401, { error: '需要有效会话(请先完成进入申请)才能管理自己的链接' }); return; }
    if (!gateData.userLinks) gateData.userLinks = [];
    const dk = deviceKey(req);
    const list = gateData.userLinks;
    if (obj.action === 'add') {
      const name = String(obj.name || '').trim().slice(0, 12);
      const url = String(obj.url || '').trim();
      const model = normalizeLinkModel(obj.model); // 白名单归一(审计 P1-2):访客可控字段绝不原样入库
      if (!name || !/^https?:\/\//i.test(url)) { sendJson(res, 400, { error: '名称不能为空,链接必须是 http(s) 地址' }); return; }
      if (list.filter(l => l && l.aid === vid).length >= USER_LINKS_PER_PERSON) { sendJson(res, 400, { error: `每人最多添加 ${USER_LINKS_PER_PERSON} 条自己的链接` }); return; }
      if (list.length >= USER_LINKS_MAX) { // 全局上限:拒绝必须在写盘之前,一次落盘都不许发生
        console.warn(`[mylinks] 访客链接总数已达硬上限 ${USER_LINKS_MAX},拒绝新增(需后台清理 gateData.userLinks)`);
        sendJson(res, 503, { error: '访客链接总数已达上限,请稍后再试' });
        return;
      }
      const pos = obj.pos && typeof obj.pos === 'object' ? { x: +obj.pos.x || 0, y: +obj.pos.y || 2, z: +obj.pos.z || 0 } : null;
      // aid 建条目即盖章:归属只认本人 vid,dk 仅作 2026-09-18 前存量记录的迁移兜底
      const item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), aid: vid, dk, name, url, model, pos, ts: Date.now() };
      list.push(item);
      saveGateData(); // 一个请求最多一次落盘(add/del 各只在这里写一次)
      sendJson(res, 200, { ok: true, item });
      return;
    }
    if (obj.action === 'del') {
      // isMineUpload 对无 aid 的存量记录仍按 dk 命中并当场绑 aid(一次性迁移,见 DG-SEC-001);
      // 有 aid 的只认 aid===本人 vid,删不掉别人的条目
      const i = list.findIndex(l => l && l.id === obj.id && isMineUpload(req, l, dk));
      if (i < 0) { sendJson(res, 404, { error: '链接不存在' }); return; }
      list.splice(i, 1);
      saveGateData();
      sendJson(res, 200, { ok: true });
      return;
    }
    sendJson(res, 400, { error: 'action 必须是 add 或 del' });
  });
}

// (媒体文件级门禁 canServeMedia 已随 isMineUpload 迁 lib/media-access.js,D1 阶段4;顶部 re-export)

module.exports = {
  handlePublicConfig, handleAdminMode, handleAdminLinks, handleAdminDemo, handleAdminCaption, handleMyLinks,
  isMineUpload, canServeMedia, rotateMt, MT_MAX_AGE_MS,
  USER_LINKS_PER_PERSON, USER_LINKS_MAX, MYLINKS_RATE,
};
