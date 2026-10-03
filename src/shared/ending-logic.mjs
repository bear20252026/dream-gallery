// ending-logic.mjs — 结局线纯逻辑(2026-10-03「先做结局」;不依赖 3D,单测钉死)
//
// 结局线 = 酒鬼(327)之后直接接:书页六~八(临时画册页)→ 找井 → 告别 → 六年后。
// 进度只存一个数 endingStep(存档键 b612EndingStep),只前进不回退:
//   0 未开始 · 1 画册页读完(正在找井) · 2 井已找到、嘴套已画(等第二天傍晚)
//   3 告别已完成(尾声待播) · 4 尾声看完(全书完)
//
// 「临时画册页」日后被 3D 场景替换时,只要 328/329/330 的章节写入方接上,
// endingReady() 的门槛可以从 chapter>=3 改成 chapter>=6,其余不动。

export const ENDING = Object.freeze({ NONE: 0, BOOK: 1, WELL: 2, FAREWELL: 3, DONE: 4 });
export const ENDING_MAX = 4;

/** 酒鬼章(327)完成 = chapter>=3。B612 三页(page1)也必须已读。 */
export const ENDING_GATE_CHAPTER = 3;

export function clampEnding(n) {
  n = Math.floor(Number(n) || 0);
  if (n < 0) return 0;
  return Math.min(n, ENDING_MAX);
}

/** 结局线只前进不回退(重看结局不改存档) */
export function advanceEnding(current, next) {
  return Math.max(clampEnding(current), clampEnding(next));
}

/** 是否该进入结局线(画册页从这里开始) */
export function endingReady(flags) {
  const f = flags || {};
  return !!f.page1 && (Number(f.chapter) || 0) >= ENDING_GATE_CHAPTER;
}

/**
 * 结局线 → 已完成书页数(9 页制,语义同 story-progress 的「已完成页数」)。
 * 读完画册页 = 书页六/七/八完成 → 8 页;告别完成 = 书页九完成 → 9 页。
 */
const ENDING_TO_PAGES = { 0: 0, 1: 8, 2: 8, 3: 9, 4: 9 };
export function pagesFromEnding(step) {
  return ENDING_TO_PAGES[clampEnding(step)] || 0;
}

/** 当前结局节拍(任务册「进程」行) */
export function endingBeat(step) {
  switch (clampEnding(step)) {
    case 0:
      return { code: 'ending-book', en: 'Pages VI–VIII — the book continues', zh: '书页六~八 · 这本书还没写完' };
    case 1:
      return { code: 'ending-well', en: 'Page IX — looking for a well', zh: '书页九 · 找一口井' };
    case 2:
      return { code: 'ending-farewell', en: 'Page IX — the next evening', zh: '书页九 · 第二天傍晚' };
    case 3:
      return { code: 'ending-epilogue', en: 'Epilogue — six years later', zh: '尾声 · 六年后' };
    default:
      return { code: 'finale', en: 'The book is written', zh: '这本书，写完了' };
  }
}

/** 下一步指引(任务册「下一步」行;界面语言,不是台词) */
export function endingNext(step, world) {
  const inMain = !world || world === 'main';
  switch (clampEnding(step)) {
    case 0:
      return inMain
        ? { code: 'next-book', en: 'Open the book — tap the card at the bottom of the screen', zh: '翻开书——点屏幕下方的卡片' }
        : {
            code: 'next-book-return',
            en: 'Go back to the desert through the stone ring; the book will open there',
            zh: '从石环回到沙漠，书会在那里翻开',
          };
    case 1:
      return { code: 'next-well', en: 'No compass tonight. Stand still, listen, walk toward the water', zh: '今夜没有罗盘。站定，听，朝水声走' };
    case 2:
      return { code: 'next-farewell', en: 'Go back to the well. He is waiting on the old stone wall', zh: '回到井边，他在旧石墙上等你' };
    case 3:
      return { code: 'next-epilogue', en: 'Look up at the stars', zh: '抬头看星星' };
    default:
      return { code: 'next-done', en: 'The book is written. Look at the stars whenever you like', zh: '书写完了。想看星星时，随时回来' };
  }
}

// ===================== 找井:用耳朵导航 =====================
// 没有箭头。玩家只拿到两样东西:水声有多清楚(距离) + 从哪一侧传来(左右声像)。
// 静止越久听得越清楚——"要紧的东西,眼睛看不见"的可玩化。

/** 井的位置:坠机点(-9,76)东北约 70m 的空沙地(避开喷泉/建筑/狐狸站/石门) */
export const WELL_POS = Object.freeze({ x: 48, z: 118 });
/** 听得见的最远距离(m) */
export const LISTEN_RANGE = 170;
/** 走近到这个距离算「找到了」 */
export const WELL_REACH = 4.5;
/** 静止多少秒后听觉达到最清楚 */
export const STILL_FULL = 2.5;

/**
 * 听觉信号。
 * @param {number} dist 玩家到井的水平距离(m)
 * @param {number} stillSec 玩家已静止的秒数
 * @returns {{level:number, clarity:number}} level=水声大小 0..1;clarity=静止带来的清晰度 0..1
 */
export function listenSignal(dist, stillSec) {
  const d = Math.max(0, Number(dist) || 0);
  const near = Math.max(0, 1 - d / LISTEN_RANGE);
  // 平方让远处更含糊、近处变化更明显(走对方向时"越来越清楚"的感觉)
  const level = near * near * 0.85 + near * 0.15;
  const clarity = Math.max(0, Math.min(1, (Number(stillSec) || 0) / STILL_FULL));
  return { level: round3(level), clarity: round3(clarity) };
}

/**
 * 水声从哪一侧来。yaw 约定同玩家/罗盘:目标 yaw = atan2(-dx,-dz),rel = want - yaw。
 * rel>0 = 目标在左侧。
 * @returns {{pan:number, behind:boolean, rel:number}} pan: -1 左 .. +1 右
 */
export function soundSide(px, pz, yaw, wx, wz) {
  const dx = wx - px,
    dz = wz - pz;
  const want = Math.atan2(-dx, -dz);
  let rel = want - (Number(yaw) || 0);
  rel = Math.atan2(Math.sin(rel), Math.cos(rel)); // 归一到 (-π, π]
  return { pan: round3(-Math.sin(rel)), behind: Math.abs(rel) > Math.PI / 2, rel: round3(rel) };
}

/** 走路途中的台词按「已走完的路程比例」触发:返回应已播放的句数 */
export function walkLinesDue(startDist, dist, total) {
  const s = Math.max(1, Number(startDist) || 1);
  const done = Math.max(0, Math.min(1, 1 - (Number(dist) || 0) / s));
  const n = Math.max(0, Math.floor(Number(total) || 0));
  // 第一句在走出 12% 时,最后一句在 85% 时
  if (done < 0.12) return 0;
  return Math.min(n, 1 + Math.floor(((done - 0.12) / 0.73) * (n - 1)));
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}
