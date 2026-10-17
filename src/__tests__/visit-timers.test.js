// visit-timers.test.js — 世代时钟的四条契约(2026-10-17 审计 C4)
//
// 判据对象是**真实行为**:回调到底有没有被执行、interval 到底有没有被停掉(而不是"执行了但没作用")。
// 用假定时器推进时间,零 DOM、零 ctx —— 这正是把机制抽成纯模块的意义:
// 留在场景文件里时,这件事只能在真浏览器里快返两次去撞(而且撞不撞得中看 CPU 快慢)。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createVisitClock } from '../shared/visit-timers.mjs';

describe('世代时钟', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('同世代 + 在场 ⇒ later 执行一次,并把自己从在飞集合里摘掉', () => {
    const clock = createVisitClock(() => true);
    const g = clock.gen('w1');
    const fn = vi.fn();
    clock.later('w1', g, fn, 100);
    expect(clock.pending('w1')).toBe(1);
    vi.advanceTimersByTime(120);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(clock.pending('w1')).toBe(0);
  });

  it('★ 换世之后,上一世的 later 一律不执行(同世界快返的现场)', () => {
    const here = { v: true };
    const clock = createVisitClock(() => here.v);
    const g = clock.gen('w1');
    const stale = vi.fn();
    clock.later('w1', g, stale, 100);
    clock.bump('w1'); // 离开即换世
    here.v = true; // 玩家又走回来了 —— 在场判定此刻是成立的
    vi.advanceTimersByTime(200);
    expect(stale, '旧世代的尾巴还在拆新一世的面板/推新世的剧情').not.toHaveBeenCalled();
  });

  it('在场判定为假时不执行(离场后未 bump 的一刻也不偷偷跑)', () => {
    const here = { v: true };
    const clock = createVisitClock(() => here.v);
    const g = clock.gen('w1');
    const fn = vi.fn();
    clock.later('w1', g, fn, 50);
    here.v = false;
    vi.advanceTimersByTime(80);
    expect(fn).not.toHaveBeenCalled();
    here.v = true;
    vi.advanceTimersByTime(80); // 一次性计时器已经被吃掉了,不会再补跑
    expect(fn).not.toHaveBeenCalled();
  });

  it('★ every 换世后是真停止:后续 tick 一个都不再来(不是靠回调自己早退)', () => {
    const clock = createVisitClock(() => true);
    const g = clock.gen('w1');
    const tick = vi.fn();
    clock.every('w1', g, tick, 100);
    vi.advanceTimersByTime(320);
    expect(tick).toHaveBeenCalledTimes(3);
    expect(clock.bump('w1')).toBe(g + 1);
    vi.advanceTimersByTime(1000);
    expect(tick).toHaveBeenCalledTimes(3);
  });

  it('every 不在场时只跳过这一拍,回来继续(呼吸/翻面这类动画语义)', () => {
    const here = { v: true };
    const clock = createVisitClock(() => here.v);
    const g = clock.gen('w1');
    const tick = vi.fn();
    clock.every('w1', g, tick, 100);
    vi.advanceTimersByTime(150);
    here.v = false;
    vi.advanceTimersByTime(300);
    here.v = true;
    vi.advanceTimersByTime(60); // 累计 510ms ⇒ 只跨过 500 那一拍(600 还没到)
    expect(tick).toHaveBeenCalledTimes(2); // 100ms 一拍 + 回来后的 500ms 一拍
  });

  it('teardown 每次 bump 至多一次,且第二次 bump 不会再跑(交还路灯这类动作不能重复)', () => {
    const clock = createVisitClock(() => true);
    const out = vi.fn();
    clock.onLeave('w1', clock.gen('w1'), out);
    clock.bump('w1');
    clock.bump('w1');
    expect(out).toHaveBeenCalledTimes(1);
  });

  it('来世代的 teardown 注册被拒(迟到的注册不许污染当前世代)', () => {
    const clock = createVisitClock(() => true);
    const old = clock.gen('w1');
    clock.bump('w1');
    expect(clock.onLeave('w1', old, vi.fn())).toBe(false);
    expect(clock.onLeave('w1', clock.gen('w1'), vi.fn())).toBe(true);
  });

  it('三颗星互不干扰:只对 bump 的那颗生效', () => {
    const clock = createVisitClock(() => true);
    const a = vi.fn();
    const b = vi.fn();
    clock.later('wA', clock.gen('wA'), a, 100);
    clock.later('wB', clock.gen('wB'), b, 100);
    clock.bump('wA');
    vi.advanceTimersByTime(150);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('gen 单调递增,且 alive 同时管“同世代 ∧ 在场”两件事', () => {
    const here = { v: true };
    const clock = createVisitClock(() => here.v);
    const g0 = clock.gen('w1');
    expect(clock.alive('w1', g0)).toBe(true);
    expect(clock.alive('w1', g0 + 1)).toBe(false);
    here.v = false;
    expect(clock.alive('w1', g0)).toBe(false);
    here.v = true;
    expect(clock.bump('w1')).toBe(g0 + 1);
    expect(clock.alive('w1', g0)).toBe(false);
    expect(clock.alive('w1', g0 + 1)).toBe(true);
  });

  it('没登记过的世界不会凭空冒世代号(bump 从 1 起,便于探针读)', () => {
    const clock = createVisitClock(() => true);
    expect(clock.gen('fresh')).toBe(0);
    expect(clock.bump('fresh')).toBe(1);
    expect(clock.pending('fresh')).toBe(0);
  });
});
