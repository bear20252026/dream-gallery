// story-progress.mjs — B612 剧情进度纯逻辑(2026-09-24 自 planets.js / gameshell-system.js 抽出)
// 目的:剧情域大文件每次改都是回归裸奔——把不依赖 3D 的进度契约钉进单测。
// 三条契约:
//   1. 章节只前进不回退,封顶 6(setChapter/存档回读共用);
//   2. 书页换算 planetsChapter → 任务册「书页 x/9」(2026-09-20 起gameshell 展示);
//   3. 罗盘页 place 装饰:已点亮章节追加「 · 已点亮」(顺序与 spirits SPIRITS 一致)。
// 回归锚点:书页映射表改动曾只改一处漏另一处(线性映射想当然),此表是唯一权威。

/** 章节封顶(6 = 六章全部点亮) */
export const CHAPTER_MAX = 6;

/** 任意读数钳进 0..6(存档脏数据兜底) */
export function clampChapter(n) {
  n = Number(n) || 0;
  if (n < 0) return 0;
  return Math.min(Math.floor(n), CHAPTER_MAX);
}

/** 章节推进:只前进不回退(setChapter 语义)。返回新章节,不落盘——落盘由调用方做 */
export function advanceChapter(current, n) {
  return Math.max(clampChapter(current), clampChapter(n));
}

/**
 * 章节 → 任务册书页加成(9 页制)。
 * ⚠️ 忠实钉住 2026-09-24 线上行为:仅 0..4 有映射;章节 5/6 **未映射返回 0**
 * (调用方 Math.max 兜底回 page1 标记 = 1 页)——这是剧情进行中的现状,不是 bug;
 * 后续场次推进时在此表补行,勿"优化"成线性式。
 */
const CHAPTER_TO_PAGES = { 0: 1, 1: 4, 2: 5, 3: 6, 4: 7 };
export function pagesBonusForChapter(chapter) {
  return CHAPTER_TO_PAGES[clampChapter(chapter)] || 0;
}

/** 任务册书页总数(展示层「x / 9」的分母) */
export const PAGES_TOTAL = 9;

/**
 * 罗盘页(spiritsState)装饰:前 PLANETS.length 项覆盖 name/en,并给已点亮章节
 * 的 place 追加「 · 已点亮」。原数组不动(返回新对象)。
 * @param {Array<{name:string,en:string,place:string}>} arr prevSpiritsState() 结果
 * @param {Array<{name:string,en:string,place:string}>} planets PLANETS(与 SPIRITS 同序)
 * @param {number} chapter 当前章节
 */
export function decorateSpiritsState(arr, planets, chapter) {
  return (arr || []).map(function (st, i) {
    if (i >= planets.length) return st;
    return Object.assign({}, st, {
      name: planets[i].name,
      en: planets[i].en,
      place: chapter > i ? planets[i].place + ' · 已点亮' : planets[i].place,
    });
  });
}
