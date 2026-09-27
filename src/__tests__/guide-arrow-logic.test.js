// guide-arrow-logic.test.js — 悬浮箭头纯逻辑契约(2026-09-27 3D 箭头指引)
// 回归锚点:浮沉发散/自转跳变会让箭头像"抽搐" —— 时序函数必须钉死周期与包络。
import { describe, it, expect } from 'vitest';
import {
  ARROW_BOB_AMP,
  ARROW_BOB_FREQ,
  ARROW_SPIN_SPEED,
  arrowBobY,
  arrowSpin,
} from '../shared/guide-arrow-logic.mjs';

describe('arrowBobY(浮沉不发散)', () => {
  it('t=0 回基准高度', () => {
    expect(arrowBobY(0, 5)).toBe(5);
  });
  it('全程包络 ±幅度,不漂移', () => {
    for (let i = 0; i <= 100; i++) {
      const y = arrowBobY(i * 0.1, 5);
      expect(Math.abs(y - 5)).toBeLessThanOrEqual(ARROW_BOB_AMP + 1e-9);
    }
  });
  it('周期 = 2π/频率,整周期回原位', () => {
    const period = (Math.PI * 2) / ARROW_BOB_FREQ;
    expect(arrowBobY(period, 5)).toBeCloseTo(5, 9);
  });
});

describe('arrowSpin(自转不跳变)', () => {
  it('t=0 朝 0', () => {
    expect(arrowSpin(0)).toBe(0);
  });
  it('恒卷绕在 0..2π', () => {
    for (let i = 0; i <= 100; i++) {
      const a = arrowSpin(i * 0.37);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(Math.PI * 2);
    }
  });
  it('转速契约:t=1 时角度=转速', () => {
    expect(arrowSpin(1)).toBeCloseTo(ARROW_SPIN_SPEED % (Math.PI * 2), 9);
  });
  it('步进连续:相邻采样差值小(无跳帧式突变)', () => {
    let prev = arrowSpin(0);
    for (let i = 1; i <= 60; i++) {
      const cur = arrowSpin(i * 0.05);
      let d = Math.abs(cur - prev);
      d = Math.min(d, Math.PI * 2 - d); // 卷绕边计最短弧
      expect(d).toBeLessThan(0.5);
      prev = cur;
    }
  });
});
