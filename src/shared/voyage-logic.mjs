// voyage-logic.mjs — 「旅途卡」:一夜接一夜的下一站(2026-10-04 主人反馈「换星球时衔接很乱」)
// 原来:每颗星走完 → 自己找回程石环 → 回 B612 → 再找底部按钮 → 进下一颗;327 之后又要自己回沙漠。
// 现在:每段回忆一结束,翻出一张「书页卡」(第几夜 · 哪一页 · 原著一句),点「继续」直接到下一站;
// 「在这里再待一会儿」= 先不走,底部导航钮会留一个「下一夜 →」随时接上。
// 零依赖纯函数,单测钉死;卡片与切换在 ui/voyage.js。
import { PLANETS } from './planet-logic.mjs';

/**
 * 当前该去的下一站。
 * @param {{page1?:boolean, chapter?:number, earthDone?:boolean}} f
 *   chapter = 已完成的星球数(planetsChapter);earthDone = 地球一天已走完
 * @returns {string|null} 'kingNNN' | 'earth' | null(还没到旅途 / 已全部走完)
 */
export function nextStop(f, planets = PLANETS) {
  const s = f || {};
  if (!s.page1) return null;
  const done = Math.max(0, Number(s.chapter) || 0);
  for (let i = done; i < planets.length; i++) if (planets[i].built) return 'king' + planets[i].num;
  return s.earthDone ? null : 'earth';
}

/** 旅途卡要去的世界:地球 = 沙漠主世界 */
export function worldOf(stop) {
  return stop === 'earth' ? 'main' : stop;
}

/** 星球世界里这段回忆是否已走完(用于在该星显示「下一夜 →」) */
export function kingDone(world, chapter, planets = PLANETS) {
  const idx = planets.findIndex((p) => 'king' + p.num === world);
  return idx >= 0 && (Number(chapter) || 0) > idx;
}
