// earth-day-logic.mjs — 地球之日(第 10 场)纯逻辑(2026-10-04;零依赖,单测钉死)
// 七站顺序照原著:蛇 → 三瓣花 → 回声 → 玫瑰园 → 狐狸 → 再看玫瑰 → 狐狸的秘密。
// 进度 earthStep = 已走完的站数(0..7);7 = 走完(同时写 earthDay 标记)。
import { ENDING_GATE_CHAPTER } from './ending-logic.mjs';

export const EARTH_STOPS = Object.freeze([
  'snake',
  'flower',
  'echo',
  'roses',
  'fox',
  'rosesAgain',
  'foxAgain',
]);
export const EARTH_DONE = EARTH_STOPS.length;

/** 该不该在沙漠里走「地球之日」:六颗星都走完、还没走过、结局线也还没开始 */
export function earthDue(f) {
  const s = f || {};
  return (
    !!s.page1 &&
    (Number(s.chapter) || 0) >= ENDING_GATE_CHAPTER &&
    !s.earthDay &&
    !(Number(s.endingStep) > 0)
  );
}
