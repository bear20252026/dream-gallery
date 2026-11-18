// media-access.js — 媒体归属与可见性门禁(2026-11-17 D1 阶段4 从 siteconfig.js 拆出)
// ===================== 为什么独立成叶子 =====================
// security(静态服务门禁)与 files-upload(列表/本人清单)要调 canServeMedia/isMineUpload,
// 此前被迫懒 require 整个 siteconfig.js(站点配置 handler 大文件)。本模块只收**门禁判定**,
// 依赖 store + shared/mediarules.mjs 决策表,security/files-upload 顶部直依赖,懒加载消除。
// siteconfig.js 保留同名 re-export(测试与消费方形状不变)。
//
// 可见性判定只有这一处,而它吃 src/shared/mediarules.mjs 那张决策表 ——
// 任何模块(以及 lib/upload/*)不许再写第二处可见性判断。
const { gateData, saveGateData, deviceKey, authVid } = require('./store');
// 决策表单一源=src/shared/mediarules.mjs(2026-07-28 深化④,客户端上墙规则同表,改规则只改那一处;
// Node≥22.12 require(ESM) 直接取用——本模块无顶层 await,本地 v24/线上 v22.23 均已验证)
// 2026-09-06 主人定:特殊模式删除,globalSpecial/deviceSpecial 不再参与决策
const MR = require('../src/shared/mediarules.mjs');

// 存量记录认领绑定 aid 的合并落盘(一请求内多条认领只落一次盘)
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

module.exports = { isMineUpload, canServeMedia };