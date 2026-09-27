// dayphase-logic.mjs — 昼夜相位纯逻辑(2026-09-27 台词⇔时间联动)
// 零依赖、零 three、零 DOM:时刻目标/相位判定/跨午夜最短插值。
// scene/time-shift.js 只做场景接线(读写 ctx.media.dayTimeSource),改数值来这里。

/** 台词时刻目标(小时制):羊问"天亮了吗"=MORNING / 画羊=NOON 前后 / 求日落=SUNSET / 数数=NIGHT */
export const DAY_HOURS = {
  MORNING: 7.5,
  NOON: 12,
  SUNSET: 17.6,
  NIGHT: 22,
};

/** 小时钳进 0..24(脏数据/NaN 兜底回正午,不抛) */
export function clampHour(h) {
  h = Number(h);
  if (!isFinite(h)) return 12;
  h = h % 24;
  return h < 0 ? h + 24 : h;
}

/**
 * 时刻 → 相位名(与 desert/atmosphere.js 渲染大致同档:
 * 7.5=明亮早晨 / 12=正午 / 17.6=暖黄昏 / 22=深夜)。
 */
export function phaseForHour(h) {
  h = clampHour(h);
  if (h >= 5.5 && h < 7.5) return 'dawn';
  if (h >= 7.5 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'sunset';
  return 'night';
}

/** 跨午夜最短有向差值(-12..12]:23→1 走 +2 而非 -22 */
export function shortestDelta(from, to) {
  let d = (clampHour(to) - clampHour(from)) % 24;
  if (d > 12) d -= 24;
  if (d <= -12) d += 24;
  return d;
}

/** 平滑快切插值:smoothstep 缓动 + 最短路径;t 越界直接钳端点 */
export function tweenHour(from, to, t) {
  if (t <= 0) return clampHour(from);
  if (t >= 1) return clampHour(to);
  const s = t * t * (3 - 2 * t);
  return clampHour(clampHour(from) + shortestDelta(from, to) * s);
}
