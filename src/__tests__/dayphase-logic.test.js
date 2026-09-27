// dayphase-logic.test.js — 昼夜相位纯逻辑契约(2026-09-27 台词⇔时间联动)
// 回归锚点:时刻目标改一个数,全链天光跟着走 —— 相位判定/跨午夜插值必须钉死,
// 否则"台词说黄昏天上是半夜"悄悄回来。
import { describe, it, expect } from 'vitest';
import {
  DAY_HOURS,
  clampHour,
  phaseForHour,
  shortestDelta,
  tweenHour,
} from '../shared/dayphase-logic.mjs';

describe('时刻目标 DAY_HOURS(台词⇔天光契约)', () => {
  it('早上羊问天亮=明亮早晨,夜里数数=深夜', () => {
    expect(phaseForHour(DAY_HOURS.MORNING)).toBe('day');
    expect(phaseForHour(DAY_HOURS.NOON)).toBe('day');
    expect(phaseForHour(DAY_HOURS.SUNSET)).toBe('sunset');
    expect(phaseForHour(DAY_HOURS.NIGHT)).toBe('night');
  });
});

describe('clampHour(脏时钟兜底)', () => {
  it('负数/超界卷绕进 0..24', () => {
    expect(clampHour(-1)).toBe(23);
    expect(clampHour(25)).toBe(1);
    expect(clampHour(7.5)).toBe(7.5);
  });
  it('NaN/非数回正午,不抛', () => {
    expect(clampHour(NaN)).toBe(12);
    expect(clampHour(undefined)).toBe(12);
    expect(clampHour('abc')).toBe(12);
  });
});

describe('phaseForHour(与渲染同档)', () => {
  it('拂晓/白天/黄昏/深夜四档', () => {
    expect(phaseForHour(6)).toBe('dawn');
    expect(phaseForHour(10)).toBe('day');
    expect(phaseForHour(18)).toBe('sunset');
    expect(phaseForHour(3)).toBe('night');
    expect(phaseForHour(22)).toBe('night');
  });
});

describe('shortestDelta(跨午夜走近路)', () => {
  it('23→1 走 +2 而非 -22', () => {
    expect(shortestDelta(23, 1)).toBe(2);
  });
  it('1→23 走 -2 而非 +22', () => {
    expect(shortestDelta(1, 23)).toBe(-2);
  });
  it('同值差 0', () => {
    expect(shortestDelta(12, 12)).toBe(0);
  });
});

describe('tweenHour(平滑快切)', () => {
  it('端点钳住:0=起点,1=终点', () => {
    expect(tweenHour(10, 22, 0)).toBe(10);
    expect(tweenHour(10, 22, 1)).toBe(22);
    expect(tweenHour(10, 22, -5)).toBe(10);
    expect(tweenHour(10, 22, 99)).toBe(22);
  });
  it('中点走一半(顺路方向)', () => {
    expect(tweenHour(10, 12, 0.5)).toBeCloseTo(11, 9);
  });
  it('跨午夜中点走近路:23→1 中点≈0(午夜)而非 12(正午)', () => {
    expect(tweenHour(23, 1, 0.5)).toBeCloseTo(0, 9);
  });
  it('单调不跳变:10→22 全程步进 <1h', () => {
    let prev = tweenHour(10, 22, 0);
    for (let i = 1; i <= 20; i++) {
      const cur = tweenHour(10, 22, i / 20);
      expect(Math.abs(cur - prev)).toBeLessThan(1);
      prev = cur;
    }
  });
});
