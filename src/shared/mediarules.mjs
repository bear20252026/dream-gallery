// mediarules.mjs — 媒体可见性决策表·单一源(2026-07-28 架构深化④)
// 服务端(lib/siteconfig.js canServeMedia 下载放行,Node≥22.12 经 require(ESM) 取用)
// 与客户端(src/gallery/mode.js 上墙/paintings.js 配文与视频,native ESM/Vite 双通道)共用本表。
// 为什么共用:下载 403 与墙面隐藏是同一套规则的两个面——以前两边各写一份人肉同步,
// 改一边忘另一边就是安全事故(2026-07-26/27 两次堵口的根因)。本模块纯函数、零依赖;
// 规则改动只许改这里。放 src/ 下:开发模式浏览器经 /src/(仅 localhost)拿原生 ESM,生产由 Vite 打包。
//
// 「归类」由各侧自备(服务端按设备指纹 dk/mt 令牌判本人;客户端按 /api/siteconfig 下发的 myUploads 名单),
// 「归完类之后怎么办」= 本模块的决策表。
//
// 2026-09-06 主人定:特殊模式整体删除——mode 参数保留仅为调用方兼容,决策一律按普通模式;
// 图库照片全库退役(数据源 data.js 仅剩 5 张演示照片),演示/本人上传可见,其余隐藏。

// ===================== 名字模式 =====================
// 缩略图按原文件名判定(photos/thumbs/x.jpg → x.jpg)
export function stripThumbs(name) {
  return name.startsWith('thumbs/') ? name.slice(7) : name;
}
// 缩略图与原图是同一件内容(DG-SEC-003):可见性一律继承原图,不再有"thumbs 恒公开"这条短路。
// gen-thumbs.js 把任意扩展名统一写成 thumbs/<主干>.webp —— 前缀去掉了扩展名却换了,
// 所以归类要按"主干名"回查原条目,只比全名会把私有照片的缩略图误判成"查无此名"而公开。
export function isThumbName(name) {
  return String(name || '').startsWith('thumbs/');
}
export function mediaStem(name) {
  const base = stripThumbs(String(name || ''));
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}
// thumbs/<x>.webp → 候选原图条目名(在调用方自备的已知条目名单里按主干名找)。
// 名单里没有就返回剥前缀后的名字本身,由决策表按"无归属"拒绝(fail-closed)。
export function thumbSourceNames(name, entryNames) {
  const base = stripThumbs(name);
  if (!isThumbName(name)) return [base];
  const stem = mediaStem(base);
  const hits = (entryNames || []).filter((n) => mediaStem(n) === stem);
  return hits.length ? Array.from(new Set(hits)) : [base];
}
// 白板作品:全员展品(仅 photos 目录)
export function isWhiteboard(dir, base) {
  return dir === 'photos' && /^whiteboard-/i.test(base);
}
// 户外大屏:本站广播(仅 videos 目录)
export function isBigscreen(dir, base) {
  return dir === 'videos' && base.startsWith('户外大屏/');
}

// ===================== 待审核态(2026-10-11 DG-UP-003) =====================
// 审核通道已开启却拿不到结论(失败/超时/无响应)的**公开展品**,服务端软处理:文件保留,
// gateData.uploads[name].pending = 时间戳。调用方(服务端 canServeMedia / 客户端 paintInputs)
// 把该标记随同一批输入传进本表,于是"不上墙"与"不放行下载"仍是一张表说了算,不出现两套口径。
// 认 pending 也认 isPending,免得两侧调用点为字段名再分叉一次。
export function isPending(o) {
  return !!(o && (o.pending || o.isPending));
}

// ===================== 上墙决策(客户端 mode.js applyPaintMode) =====================
// 输入:{mode(已废弃,忽略), isDemo, isMine, isLib, pending}
// 输出:{visible 整框显隐, content 内容面显隐(empty 标记)}
// 表(2026-09-06 特殊模式删除后):演示照片上墙;本人上传上墙出内容;其余(图库/他人)整框隐藏
// 待审核(pending)内容一律不上墙 —— 审核结论出来之前不自动见客
export function wallDecision(o) {
  if (isPending(o)) return { visible: false, content: false };
  if (o.isDemo) return { visible: true, content: true };
  if (o.isMine) return { visible: true, content: true };
  return { visible: false, content: false };
}

// ===================== 内容/纹理门禁(scene.js texAllowed / paintings.js 视频调度) =====================
// 与 wallDecision().content 恒一致:演示+本人上传放行,待审核拒绝。
export function contentAllowed(o) {
  return wallDecision(o).content;
}

// ===================== 配文门禁(paintings.js captionAllowed,2026-07-25 主人修订) =====================
// 只显示演示照片和本人上传的配文;待审核内容连配文一起压住。
export function captionAllowed(o) {
  if (isPending(o)) return false;
  return !!(o.isDemo || o.isMine);
}

// ===================== 下载放行决策(服务端 canServeMedia,2026-07-26/27 堵口版) =====================
// 输入:{dir, base(缩略图必须先经 thumbSourceNames 归一成**原图条目名**;isThumb 声明这一形态),
//        isDemo, isMine, hasMt, pending, globalSpecial/deviceSpecial(已废弃,忽略)}
// 输出:{allow, pub} pub=true 表示可按公开名给 CDN 边缘缓存(req._mediaPublic)
// 表:白板/大屏/演示=公开;本人上传(dk 或 mt)=仅本人;其余一律拒绝
// pending 在最前面短路:待审核展品即便走的是"按名字公开"的白板/大屏路径也不下发
//   (否则审核失败的内容会先被 CDN 缓存成公开对象)
// 缩略图不另立规则:归一后吃的就是原图那一条,所以私有照片的缩略图与原图同判(陌生人拒、本人放行、
//   CDN 分级同样是 private)——DG-SEC-003 的成因正是旧的 `if (name.includes('thumbs/')) return true` 无条件短路
export function serveDecision(o) {
  if (isPending(o)) return { allow: false, pub: false };
  // 带着 thumbs/ 前缀进来=调用方漏了归一,一律拒:宁可挡住也不留第二条绕过原图判定的路
  if (isThumbName(o.base)) return { allow: false, pub: false };
  if (isWhiteboard(o.dir, o.base)) return { allow: true, pub: true };
  if (isBigscreen(o.dir, o.base)) return { allow: true, pub: true };
  if (o.isDemo) return { allow: true, pub: true };
  if (o.isMine) return { allow: true, pub: false };
  if (o.hasMt) return { allow: true, pub: false };
  return { allow: false, pub: false };
}
