// guide-arrow-logic.mjs — 悬浮箭头纯逻辑(2026-09-27 3D 箭头指引)
// 零依赖:浮沉/自转的时序函数。scene/guide-arrow.js 只做 three 接线,
// 改手感(幅度/频率/转速)来这里,改样子去 guide-arrow.js。

/** 浮沉幅度(m)与角频率(rad/s):sin(t*3),周期约 2.1s */
export const ARROW_BOB_AMP = 0.15;
export const ARROW_BOB_FREQ = 3;
/** 自转角速度(rad/s):约 3.1s 一圈 */
export const ARROW_SPIN_SPEED = 2;

/** t 秒时箭头高度(基准上下浮沉,不发散) */
export function arrowBobY(tSec, baseY, amp) {
  const a = typeof amp === 'number' && isFinite(amp) ? amp : ARROW_BOB_AMP;
  return baseY + Math.sin(tSec * ARROW_BOB_FREQ) * a;
}

/** t 秒时箭头自转角(0..2π 卷绕,单调递增不跳变) */
export function arrowSpin(tSec, speed) {
  const s = typeof speed === 'number' && isFinite(speed) ? speed : ARROW_SPIN_SPEED;
  const twoPi = Math.PI * 2;
  return ((tSec * s) % twoPi + twoPi) % twoPi;
}
