// mediarules.mjs — 媒体可见性决策表·单一源(2026-07-28 架构深化④)
// 服务端(lib/siteconfig.js canServeMedia 下载放行,Node≥22.12 经 require(ESM) 取用)
// 与客户端(src/gallery/mode.js 上墙/paintings.js 配文与视频,native ESM/Vite 双通道)共用本表。
// 为什么共用:下载 403 与墙面隐藏是同一套规则的两个面——以前两边各写一份人肉同步,
// 改一边忘另一边就是安全事故(2026-07-26/27 两次堵口的根因)。本模块纯函数、零依赖;
// 规则改动只许改这里。放 src/ 下:开发模式浏览器经 /src/(仅 localhost)拿原生 ESM,生产由 Vite 打包。
//
// 「归类」由各侧自备(服务端按设备指纹 dk/mt 令牌判本人;客户端按 /api/siteconfig 下发的 myUploads 名单),
// 「归完类之后怎么办」= 本模块的决策表。

// ===================== 名字模式 =====================
// 缩略图按原文件名判定(photos/thumbs/x.jpg → x.jpg)
export function stripThumbs(name) {
  return name.startsWith('thumbs/') ? name.slice(7) : name;
}
// 白板作品:全员展品(仅 photos 目录)
export function isWhiteboard(dir, base) {
  return dir === 'photos' && /^whiteboard-/i.test(base);
}
// 户外大屏:本站广播(仅 videos 目录)
export function isBigscreen(dir, base) {
  return dir === 'videos' && base.startsWith('户外大屏/');
}

// ===================== 上墙决策(客户端 mode.js applyPaintMode) =====================
// 输入:{mode:'normal'|'special', isDemo, isMine, isLib}
// 输出:{visible 整框显隐, content 内容面显隐(empty 标记)}
// 表(2026-07-27 主人终版,优先级 demo > mine > lib > 他人):
//   演示照片:普通模式上墙;特殊模式不上墙(仅后台展现)
//   本人上传:两模式都上墙出内容
//   图库:特殊模式全展示;普通模式「框留下,照片拿掉」(白卡空框)
//   他人上传:任何模式整框隐藏(仅本人与后台可见)
export function wallDecision(o) {
  if (o.isDemo) return { visible: o.mode === 'normal', content: true };
  if (o.isMine) return { visible: true, content: true };
  if (o.isLib) return { visible: true, content: o.mode === 'special' };
  return { visible: false, content: false };
}

// ===================== 内容/纹理门禁(scene.js texAllowed / paintings.js 视频调度) =====================
// 普通模式只放行演示+本人上传;特殊模式全放行。与 wallDecision().content 一致。
export function contentAllowed(o) {
  return wallDecision(o).content;
}

// ===================== 配文门禁(paintings.js captionAllowed,2026-07-25 主人修订) =====================
// 普通模式只显示演示照片和本人上传的配文,图库画框不显示;特殊模式全显示。
export function captionAllowed(o) {
  if (o.mode !== 'normal') return true;
  return !!(o.isDemo || o.isMine);
}

// ===================== 下载放行决策(服务端 canServeMedia,2026-07-26/27 堵口版) =====================
// 输入:{dir, base(已 stripThumbs), isDemo, isMine, hasMt(带媒体令牌), globalSpecial, deviceSpecial}
// 输出:{allow, pub} pub=true 表示可按公开名给 CDN 边缘缓存(req._mediaPublic)
// 表:白板/大屏/演示=公开;本人上传(dk 或 mt)=仅本人;全局特殊模式=全放行;其余仅特殊访问设备
export function serveDecision(o) {
  if (isWhiteboard(o.dir, o.base)) return { allow: true, pub: true };
  if (isBigscreen(o.dir, o.base)) return { allow: true, pub: true };
  if (o.isDemo) return { allow: true, pub: true };
  if (o.isMine) return { allow: true, pub: false };
  if (o.hasMt) return { allow: true, pub: false };
  if (o.globalSpecial) return { allow: true, pub: false };
  return { allow: !!o.deviceSpecial, pub: false };
}
