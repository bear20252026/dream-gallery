// siteconfig.js — 站点配置:展示区模式(普通/特殊) + 自定义链接 + 访客上传归属
// 数据存 gate_data.json 的 siteConfig/uploads/photoCaptions 三个键,重启不丢
// 模式映射(2026-07-25 主人定):
//   normal(普通,默认):图库照片/视频不上墙、金山文档(isLink2,4~13)/瑶华传(isLink3)/秘密花园(isGarden)链接屏蔽、
//                      情书(isLink)改写为《元素共鸣准则》;访客可见自己上传的照片
//   special(特殊):现状全展示
const { gateData, saveGateData, deviceKey, authVid, rotateMt } = require('./store');
const { sendJson, readBody } = require('./util');
const { tokenOk } = require('./admin');
const ratelimit = require('./ratelimit'); // /api/mylinks 洪水防护(DG-SEC-002)

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

// 存量迁移落盘收口:一次请求可能绑定多条记录,合并成一次写盘(避免逐条全量 JSON 落盘)
let _aidBindQueued = false;
function queueAidBindSave() {
  if (_aidBindQueued) return;
  _aidBindQueued = true;
  setImmediate(() => { _aidBindQueued = false; try { saveGateData(); } catch (e) {} });
}

// 判断记录是否属于当前访客——授权判定只认本人 vid(u.aid === 当前有效 vid)。
// dk(UA 指纹)不再是授权依据(DG-SEC-001/002:同 UA 的陌生访客原本互相被判定为同一人):
// 仅 2026-09-18 之前没有 aid 的存量记录可按 dk 认领,且认领当场把 aid 绑成当前 vid 并落盘,
// 之后这条记录就只跟这个 vid 走;拿不到有效 vid 时绝不因 UA 相同而放行私有媒体或下发 mt。
// 同 UA 历史档案的循环兜底已删除(它就是把 A 判给 B 的第二条路)。
function isMineUpload(req, u, dk) {
  const vid = authVid(req);
  if (u.aid) return !!vid && u.aid === vid;
  if (!vid || !dk || u.dk !== dk) return false;
  u.aid = vid;
  queueAidBindSave();
  return true;
}

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
      const model = String(obj.model || 'sphere').trim();
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

// 媒体文件级门禁(2026-07-26 紧急堵口):3D 场景里的隐藏只是"看不见",裸 URL 以前谁都能下——
// 普通用户只放行:演示照片 / 白板作品 / 户外大屏 / 本人上传;其余一律拒绝
// 缩略图(photos/thumbs/*)= 原图的衍生品,可见性与 CDN 分级一律继承原图(DG-SEC-003:
// 原先 `name.includes('thumbs/')` 直接 return true,本人私有照片原图 403 而 1024px 缩略图人人可取)
// 决策表单一源=src/shared/mediarules.mjs(2026-07-28 深化④,客户端上墙规则同表,改规则只改那一处;
// Node≥22.12 require(ESM) 直接取用——本模块无顶层 await,本地 v24/线上 v22.23 均已验证)
// 2026-09-06 主人定:特殊模式删除,globalSpecial/deviceSpecial 不再参与决策
const MR = require('../src/shared/mediarules.mjs');
function canServeMedia(req, dir, name) {
  const isThumb = MR.isThumbName(name);
  const uploads = gateData.uploads || {};
  const demo = (gateData.siteConfig && gateData.siteConfig.demoPhotos) || [];
  const dk = deviceKey(req);
  // 归一:thumbs/<主干>.webp → 原图条目名(生成器换扩展名,故按主干名回查 uploads+演示名单);
  // 非缩略图维持原样(名字即条目),不为每个文件白建一次名单(/api/files 会逐项调用本函数)。
  // 同名多扩展(a.jpg 与 a.png 都存在时 thumbs/a.webp 只有一份)取**交集**:
  // 任一候选是私有的/待审核的就拒,公开标记也只在全部候选都公开时才给—— fail-closed。
  const sources = isThumb ? MR.thumbSourceNames(name, Object.keys(uploads).concat(demo)) : [MR.stripThumbs(name)];
  const ds = sources.map((src) => {
    const u = uploads[src];
    return MR.serveDecision({
      dir,
      base: src,
      isThumb,
      isDemo: demo.includes(src),
      isMine: !!(u && isMineUpload(req, u, dk)),
      hasMt: !!(u && u.mt && (req.url || '').includes('mt=' + u.mt)), // 媒体令牌:QQ/UC 图片代理 UA 漂移时仍能认出本人
      pending: !!(u && u.pending), // 待审核展品 fail-closed(2026-10-11 DG-UP-003,由 files-upload 打标)
    });
  });
  const allow = ds.length > 0 && ds.every((d) => d.allow);
  // req._mediaPublic:按名字公开的媒体才允许 CDN 边缘缓存(2026-07-27 血泪:200 被 Cloudflare 缓存后对全员公开)。
  // 必须无条件赋值:私有内容的缩略图若留下上一次请求的 true,边缘照样会把私有图缓存成公开对象。
  req._mediaPublic = ds.length > 0 && ds.every((d) => d.pub);
  return allow;
}

module.exports = {
  handlePublicConfig, handleAdminMode, handleAdminLinks, handleAdminDemo, handleAdminCaption, handleMyLinks,
  isMineUpload, canServeMedia, rotateMt, MT_MAX_AGE_MS,
  USER_LINKS_PER_PERSON, USER_LINKS_MAX, MYLINKS_RATE,
};
