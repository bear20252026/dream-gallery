// scene/time-shift.js — 台词⇔时间联动:强制快速昼夜切换(2026-09-27)
// 背景:主世界默认时间源是 60 秒快转一周 ((12+now/2500)%24),剧情锁时曾是瞬跳
// (scene3-night 直接 dayTimeSource=()=>22,天光"咔"一下变黑,台词说黄昏天上却是半夜)。
// 本模块提供平滑快切:3~5 秒内沿最短路径滑到目标时刻再锁定时钟,台词说的早上/
// 白天/黄昏/夜晚与天光对上号。数学在 shared/dayphase-logic.mjs(单测钉死),
// 这里只读写 ctx.media.dayTimeSource,不碰 dayNight 本体。
import { ctx } from '../ctx.js';
import { clampHour, tweenHour } from '../shared/dayphase-logic.mjs';

let active = null; // {from, to, t0, dur} 进行中的快切;null=已锁定或自动循环

/** 当前时钟读数(快切中途取插值,不跳变) */
export function currentHour() {
  const h = ctx.media && ctx.media.dayHour;
  if (typeof h === 'number' && isFinite(h)) return ((h % 24) + 24) % 24;
  return 12;
}

/**
 * 强制快切到 hour(0-24),durationMs 内滑到位后锁定。
 * 可打断:中途再调一次,以上一帧的插值位置为新起点,不跳变。
 */
export function shiftDayTo(hour, durationMs) {
  if (!ctx.media) return;
  const to = clampHour(hour);
  const dur = durationMs == null ? 4000 : Math.max(1, durationMs);
  const now = performance.now();
  const from = active
    ? tweenHour(active.from, active.to, (now - active.t0) / active.dur)
    : currentHour();
  if (Math.abs(from - to) < 0.001 && !active) {
    ctx.media.dayTimeSource = function () {
      return to;
    };
    return;
  }
  active = { from: from, to: to, t0: now, dur: dur };
  ctx.media.dayTimeSource = function () {
    if (!active) return to;
    const t = (performance.now() - active.t0) / active.dur;
    if (t >= 1) {
      const locked = active.to;
      active = null;
      ctx.media.dayTimeSource = function () {
        return locked;
      };
      return locked;
    }
    return tweenHour(active.from, active.to, t);
  };
}

/** 瞬锁(旧行为保留:热修正/测试等不需要过场时用) */
export function lockDayAt(hour) {
  if (!ctx.media) return;
  const to = clampHour(hour);
  active = null;
  ctx.media.dayTimeSource = function () {
    return to;
  };
}

/** 放回自动快转循环(剧情不再锁时的出口,勿忘) */
export function releaseDay() {
  active = null;
  if (ctx.media) ctx.media.dayTimeSource = null;
}
