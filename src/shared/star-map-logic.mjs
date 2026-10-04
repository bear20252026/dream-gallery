// star-map-logic.mjs — 星图的站点、解锁与排布(2026-10-04;零依赖纯逻辑,单测钉死)
import { PLANETS } from './planet-logic.mjs';

/** 航路上的八颗星:地球(沙漠)→ B612 → 325 … 330。chapter = chapterList 里对应章节 id */
export const STAR_STOPS = [
  {
    id: 'earth',
    world: 'main',
    num: '',
    chapter: 'crash',
    title: { en: 'Earth · the desert', zh: '地球 · 沙漠' },
  },
  {
    id: 'b612',
    world: 'b612',
    num: 'B612',
    chapter: 'home',
    title: { en: 'His home', zh: '他的家' },
  },
  ...PLANETS.map((p) => ({
    id: 'king' + p.num,
    world: 'king' + p.num,
    num: p.num,
    chapter: 'king' + p.num,
    title: { en: p.en, zh: p.name.replace(/之星$/, '') },
  })),
];

/**
 * 每颗星的状态:done / current / locked(来自 chapterStates)。
 * 地球(沙漠)是家门口,永远能回去:不是 locked 就按 done 处理。
 * @param {Array<{id:string,state:string}>} chapters chapterStates() 结果
 */
export function stopStates(chapters) {
  const by = {};
  (chapters || []).forEach((c) => (by[c.id] = c.state));
  const out = {};
  for (const s of STAR_STOPS) {
    let st = by[s.chapter] || 'locked';
    if (s.id === 'earth') st = st === 'current' ? 'current' : 'done';
    out[s.id] = st;
  }
  return out;
}

/** 排布(百分比坐标):横屏两行之字形,竖屏左右交错往下 */
export function layoutFor(portrait) {
  const n = STAR_STOPS.length;
  if (portrait) return STAR_STOPS.map((_, i) => [i % 2 ? 70 : 30, ((i + 0.5) / n) * 100]);
  return STAR_STOPS.map((_, i) => [8 + (i * 84) / (n - 1), i % 2 ? 36 : 70]);
}
