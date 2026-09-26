// story-progress.mjs — B612 剧情进度纯逻辑(2026-09-24 自 planets.js / gameshell-system.js 抽出)
// 目的:剧情域大文件每次改都是回归裸奔——把不依赖 3D 的进度契约钉进单测。
// 三条契约:
//   1. 章节只前进不回退,封顶 6(setChapter/存档回读共用);
//   2. 书页换算 planetsChapter → 任务册「书页 x/9」(2026-09-20 起gameshell 展示);
//   3. 罗盘页 place 装饰:已点亮章节追加「 · 已点亮」(顺序与 spirits SPIRITS 一致)。
// 回归锚点:书页映射表改动曾只改一处漏另一处(线性映射想当然),此表是唯一权威。
import { PLANETS } from './planet-logic.mjs';

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
 * 进程节拍(2026-09-26 主人报「情节推进理解困难」单一权威)。
 * 按存档标志算「现在讲到哪」,任务册「进程」行展示 —— 开场弧线(坠机→画羊→夜与石门)
 * 此前在羊皮卷上不可见(书页数字不讲人名),玩家不知道故事进行到哪一章。
 * chapter 语义 = 已完成星数(scene6-king 完成时 setChapter(1))→ 当前章 = 下一颗未完成的星。
 * @param {{scene2?:boolean, page1?:boolean, chapter?:number}} flags 存档标志
 * @returns {{code:string, en:string, zh:string}} 调用方 tt() 取当前语言
 */
export function storyBeat(flags) {
  const f = flags || {};
  const ch = clampChapter(f.chapter);
  if (!f.scene2) {
    return { code: 'crash', en: 'The crash — draw me a sheep', zh: '坠机 · 画一只羊' };
  }
  if (!f.page1) {
    return {
      code: 'night',
      en: 'Page I — the night, the box & the glowing door',
      zh: '书页一 · 夜、羊箱与石门',
    };
  }
  const p = PLANETS[ch]; // 已完成 ch 颗 → 当前章是下一颗(325 起)
  if (!p) {
    return { code: 'finale', en: 'Finale — the book is written', zh: '终章 · 这本书，写完了' };
  }
  return { code: 'planet' + ch, en: p.num + ' · ' + p.en, zh: p.num + ' · ' + p.name };
}

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
