// controls-lesson.test.js — 首次操作小课(2026-10-03):只在玩家真的做到后才前进
import { describe, it, expect } from 'vitest';
import {
  LESSON_STEPS,
  LESSON_TEXT,
  WALK_METERS,
  LOOK_RADIANS,
  advanceLesson,
  angleDelta,
  shouldStartLesson,
} from '../shared/controls-lesson-logic.mjs';

describe('controls lesson', () => {
  it('三步顺序固定:走 → 看 → 跟指引', () => {
    expect(LESSON_STEPS).toEqual(['walk', 'look', 'follow']);
  });
  it('键盘/触屏两套文案,每步中英都有', () => {
    for (const set of [LESSON_TEXT.keyboard, LESSON_TEXT.touch])
      for (const k of LESSON_STEPS) {
        expect(set[k].zh.length).toBeGreaterThan(4);
        expect(set[k].en.length).toBeGreaterThan(4);
      }
  });
  it('原地不动不前进;走满 2m 才算会走', () => {
    let s = advanceLesson({ step: 0 }, { x: 0, z: 0, yaw: 0 });
    expect(s.step).toBe(0);
    s = advanceLesson(s, { x: 1, z: 1, yaw: 0 });
    expect(s.step).toBe(0);
    s = advanceLesson(s, { x: WALK_METERS, z: 0.5, yaw: 0 });
    expect(s.step).toBe(1);
  });
  it('转头累计够角度才算会看,来回摆头也算', () => {
    let s = { step: 1, origin: { x: 0, z: 0 }, turned: 0 };
    s = advanceLesson(s, { x: 0, z: 0, yaw: 0.35, prevYaw: 0 });
    expect(s.step).toBe(1);
    s = advanceLesson(s, { x: 0, z: 0, yaw: 0, prevYaw: 0.35 });
    expect(s.turned).toBeGreaterThanOrEqual(LOOK_RADIANS - 1e-9);
    expect(s.step).toBe(2);
  });
  it('第三步不会自动结束(要玩家点「知道了」)', () => {
    const s = advanceLesson(
      { step: 2, origin: { x: 0, z: 0 }, turned: 9 },
      { x: 50, z: 50, yaw: 3, prevYaw: 0 }
    );
    expect(s.step).toBe(2);
  });
  it('跨 ±π 的转头按最短角计算', () => {
    expect(Math.abs(angleDelta(3.1, -3.1))).toBeLessThan(0.1);
  });
  it('不改传入的 state', () => {
    const st = { step: 0, origin: { x: 0, z: 0 }, turned: 0 };
    advanceLesson(st, { x: 9, z: 0, yaw: 0 });
    expect(st.step).toBe(0);
  });
  it('开课时机:画完羊后、无对白/弹层/画板、没上过课', () => {
    const base = {
      done: false,
      scene2: true,
      dialog: false,
      overlay: false,
      board: false,
      hasPlayer: true,
    };
    expect(shouldStartLesson(base)).toBe(true);
    expect(shouldStartLesson({ ...base, done: true })).toBe(false);
    expect(shouldStartLesson({ ...base, scene2: false })).toBe(false);
    expect(shouldStartLesson({ ...base, dialog: true })).toBe(false);
    expect(shouldStartLesson({ ...base, overlay: true })).toBe(false);
    expect(shouldStartLesson({ ...base, board: true })).toBe(false);
    expect(shouldStartLesson({ ...base, hasPlayer: false })).toBe(false);
  });
});
