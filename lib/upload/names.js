// names.js — 服务端签发名与"防覆盖"闸门(2026-10-12 审计挂账 R2 第一步自 lib/files-upload.js 原样搬入)
// 规矩(DG-SEC-001,2026-10-12)一字未改:
//   ① 匿名侧新作品名字**由服务端签发** + 'wx' 独占创建 ⇒ 前端再也落不到自己挑的名字上,
//      "知道别人的文件名就能替换那幅画"这条路从源头消失;
//   ② 覆盖只允许"服务端签发给本人"的既有作品(gateData.uploads[name].aid === authVid(req));
//   ③ 判定全部在打开文件之前 ⇒ 不属于自己的一律拒,原文件一个字节都不动;
//   ④ 后台 token 直传(auth:'write')语义一字不改:自己挑名字、允许覆盖(主人要改要换画照旧)。
// 本模块只做"名字与归属"的裁决,不回响应、不碰写流 —— 回哪个状态码由编排层(files-upload.js)执行。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { authVid } = require('../store');

// 白板作品名形态:必须匹配 lib/routes.js 路由 guard 的 ^whiteboard-[\w-]+\.(png|jpe?g|webp)$
const WHITEBOARD_NAME_RE = /^whiteboard-[\w-]+\.(png|jpe?g|webp)$/i;

// 白板作品=匿名公开展品(非 public 分支里唯一面向全员的通道),NSFW 审计适用。
// 匿名侧目录一起钉死为 photos 的 whiteboard-*(此前 dir=videos|music 配白板名也能走进来=第二个洞)
function isPublicLike(dir, name) {
  return dir === 'photos' && WHITEBOARD_NAME_RE.test(name);
}

// 服务端签发白板作品名:形态保留时间戳是因为白板作品管理面板与作品墙都按名字读时间
// (旧名字本就是 whiteboard-<ISO 时间>.png)
function newWhiteboardName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return 'whiteboard-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
    '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) +
    '-' + crypto.randomBytes(4).toString('hex') + '.png';
}

// 匿名白板写入的裁决结果(verdict):
//   reject(code=403) 目录/名字不在白板口径内(一个文件都不碰)
//   reject(code=401) 没表明身份(无 Cookie / 会话过期 / 已被吊销)——与"身份对不上"分开,
//                    前端才能给出对的自助出路(回游戏页重新进入)
//   reject(code=409) 他人作品或 2026-10-12 前的无归属存量:原文件字节与 aid/mt 一字不变
//   overwrite        本人既有作品的合法重保存(允许截断,这正是白板的产品行为)
//   issue            新作品:换服务端签发名 + 独占创建
function decideAnonWhiteboard(req, gateData, dir, name, filePath) {
  if (!isPublicLike(dir, name)) {
    return { verdict: 'reject', code: 403, error: '这个接口只保存白板作品(photos 目录的 whiteboard-*.png/jpg/webp)' };
  }
  let exists = false;
  try { exists = fs.existsSync(filePath); } catch (e) {}
  const rec = (gateData.uploads || {})[name];
  if (exists || rec) {
    const vid = authVid(req);
    if (!vid) {
      return { verdict: 'reject', code: 401, error: '更新这幅白板作品需要有效的访客身份，请回到游戏页重新进入后再保存' };
    }
    // 既有作品没有归属记录(2026-10-12 之前的存量)或归属不是本人 ⇒ 拒,且判在开文件之前
    if (!rec || rec.aid !== vid) {
      return { verdict: 'reject', code: 409, error: '这不是你的作品，无法覆盖；请直接保存成新的一幅' };
    }
    return { verdict: 'overwrite' };
  }
  return { verdict: 'issue', name: newWhiteboardName() };
}

// 打开写入目标:'wx'=独占创建(堵掉"查存在→开写"的 TOCTOU 竞态),'w'=截断(本人重保存/后台直传)
// 服务端随机名理论会撞(撞了也绝不落到别人的文件上):换个名字重来,最多两次
function openWriteTarget(dirPath, name, exclusive) {
  let finalName = name;
  let filePath = path.join(dirPath, name);
  let fd = null;
  let error = null;
  for (let attempt = 0; ; attempt++) {
    try { fd = fs.openSync(filePath, exclusive ? 'wx' : 'w'); error = null; break; }
    catch (e) {
      error = e;
      if (exclusive && e && e.code === 'EEXIST' && attempt < 2) {
        finalName = newWhiteboardName();
        filePath = path.join(dirPath, finalName);
        continue;
      }
      break;
    }
  }
  return { fd, finalName, filePath, error };
}

module.exports = { WHITEBOARD_NAME_RE, isPublicLike, newWhiteboardName, decideAnonWhiteboard, openWriteTarget };
