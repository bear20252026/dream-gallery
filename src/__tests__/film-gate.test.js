// film-gate.test.js — 开场电影收束状态机(三路 finish 幂等/skip 幂等/dead 守卫)
// 背景:skip 后 play() 的 async 残余曾摸到已删 DOM(2026-09-06 线上血泪);
// 收束定时器曾"先挂先炸",skip 的 1.6s 收束会被更早的自然收束定时器截断。
import { describe, it, expect } from 'vitest';
import { createFilmGate } from '../gate/film-gate.mjs';

function fakeClock() {
  let now = 0;
  const jobs = [];
  return {
    setTimeoutFn(fn, ms) {
      jobs.push({ id: jobs.length + 1, at: now + ms, fn, done: false, cancelled: false });
      return jobs.length;
    },
    clearTimeoutFn(id) {
      const j = jobs.find((x) => x.id === id);
      if (j) j.cancelled = true;
    },
    advance(ms) {
      now += ms;
      jobs
        .filter((j) => !j.done && !j.cancelled && j.at <= now)
        .forEach((j) => {
          j.done = true;
          j.fn();
        });
    },
  };
}

describe('运行/守卫', () => {
  it('begin 防重入;skip 后 dead 为真', () => {
    const g = createFilmGate(() => {});
    expect(g.begin()).toBe(true);
    expect(g.begin()).toBe(false);
    expect(g.dead).toBe(false);
    g.skip();
    expect(g.skipped).toBe(true);
    expect(g.dead).toBe(true);
  });
  it('未 begin 时 dead 已为真(防御异常路径)', () => {
    const g = createFilmGate(() => {});
    expect(g.dead).toBe(true);
  });
  it('skip 幂等且只在播放中有效', () => {
    const g = createFilmGate(() => {});
    expect(g.skip()).toBe(false); // 未开播
    g.begin();
    expect(g.skip()).toBe(true);
    expect(g.skip()).toBe(false);
  });
  it('endRun(自然剧终)后残余 await 走 dead 分支', () => {
    const g = createFilmGate(() => {});
    g.begin();
    g.endRun();
    expect(g.dead).toBe(true);
    expect(g.skipped).toBe(false);
  });
});

describe('收束调度(假时钟)', () => {
  it('finish 幂等:重复调用只 fire 一次', () => {
    let fired = 0;
    const g = createFilmGate(() => fired++);
    g.begin();
    expect(g.finish()).toBe(true);
    expect(g.finish()).toBe(false);
    expect(fired).toBe(1);
  });
  it('schedule 到点自动 finish;后挂的 finish 无效', () => {
    let fired = 0;
    const clock = fakeClock();
    const g = createFilmGate(() => fired++, clock);
    g.begin();
    g.schedule(1600);
    clock.advance(1700);
    expect(g.fired).toBe(true);
    expect(g.finish()).toBe(false);
    expect(fired).toBe(1);
  });
  it('后来居上:skip 的收束替换更早挂着的自然收束(不被截断)', () => {
    let fired = 0;
    const clock = fakeClock();
    const g = createFilmGate(() => fired++, clock);
    g.begin();
    g.schedule(5600); // 自然收束(startImpact +5.6s)
    clock.advance(5000);
    g.skip();
    g.schedule(1600); // skip 收束应从此刻起算 1.6s,而非被 0.6s 后的旧定时器截断
    clock.advance(600);
    expect(fired).toBe(0); // 旧定时器已被取消
    clock.advance(1100);
    expect(fired).toBe(1);
  });
  it('finish 后 schedule 不再受理(降级路径迟到调用静默)', () => {
    let fired = 0;
    const clock = fakeClock();
    const g = createFilmGate(() => fired++, clock);
    g.begin();
    g.finish();
    expect(g.schedule(400)).toBeNull();
    clock.advance(1000);
    expect(fired).toBe(1);
  });
  it('skip 后仍可 schedule 收束(skip 路径本身依赖此序)', () => {
    let fired = 0;
    const clock = fakeClock();
    const g = createFilmGate(() => fired++, clock);
    g.begin();
    g.skip();
    g.schedule(1600);
    clock.advance(1700);
    expect(fired).toBe(1);
  });
});
