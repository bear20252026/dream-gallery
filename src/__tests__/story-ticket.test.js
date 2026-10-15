// story-ticket.test.js — 故事链票据(第六轮外部审计 M-03 的统一作废闸,纯逻辑单测)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStoryTicket } from '../shared/story-ticket.mjs';

describe('createStoryTicket', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('later:留在本章就照常用一次', () => {
    const story = createStoryTicket(() => true);
    const fn = vi.fn();
    story.later(fn, 1000);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(story.leaks()).toBe(0);
  });

  it('bump 之后未落点的 later 一律不执行(旧链子改不动新场景)', () => {
    const story = createStoryTicket(() => true);
    const fn = vi.fn();
    story.later(fn, 1000);
    story.later(fn, 2000);
    story.bump();
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
    expect(story.leaks()).toBe(0);
  });

  it('离开本章(stillHome 变 false)时 later 的回调被吞,但票据没作废:回来仍能用', () => {
    let inChapter = false;
    const story = createStoryTicket(() => inChapter);
    const fn = vi.fn();
    story.later(fn, 1000);
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled(); // 玩家已不在本章
    inChapter = true;
    story.later(fn, 500);
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1); // 回到本章,链子照常
  });

  it('wait:正常落回 true;bump 落回 false(不是永远挂着)', async () => {
    const story = createStoryTicket(() => true);
    const p = story.wait(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await p).toBe(true);
    const q = story.wait(2000);
    story.bump();
    expect(await q).toBe(false); // 挂起的 await 立刻以"别继续"落回
    expect(story.leaks()).toBe(0);
  });

  it('wait:玩家离场时落回 false,链子据此 return', async () => {
    let inChapter = true;
    const story = createStoryTicket(() => inChapter);
    const p = story.wait(1500);
    inChapter = false;
    await vi.advanceTimersByTimeAsync(1500);
    expect(await p).toBe(false);
  });

  it('onTeardown:bump 时复位一次,之后不再重复', () => {
    const story = createStoryTicket(() => true);
    const veil = { shown: false };
    const reset = () => {
      veil.shown = false;
    };
    veil.shown = true;
    expect(story.onTeardown(reset)).toBe(true);
    expect(story.onTeardown(reset)).toBe(false); // 同一件事不重复登记
    story.bump();
    expect(veil.shown).toBe(false);
    story.bump(); // 收尾表已清空,不会把别处的状态也改掉
    veil.shown = true;
    story.bump();
    expect(veil.shown).toBe(true);
  });

  it('cancel:摘掉单个计时器,leaks 跟着降', () => {
    const story = createStoryTicket(() => true);
    const fn = vi.fn();
    const h = story.later(fn, 1000);
    story.later(fn, 4000);
    expect(story.leaks()).toBe(2);
    story.cancel(h);
    expect(story.leaks()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('不传 stillHome 时票据只管轮次(纯 dispose 场景)', () => {
    const story = createStoryTicket();
    const fn = vi.fn();
    story.later(fn, 10);
    vi.advanceTimersByTime(10);
    expect(fn).toHaveBeenCalledTimes(1);
    story.later(fn, 10);
    story.bump();
    vi.advanceTimersByTime(10);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('bump 返回新的轮次号(可用来判定"我这一轮还在不在")', () => {
    const story = createStoryTicket(() => true);
    expect(story.bump()).toBe(1);
    expect(story.bump()).toBe(2);
  });

  it('here():链子入口守卫用它,不必各处手写 activeWorld', () => {
    let inChapter = true;
    const story = createStoryTicket(() => inChapter);
    expect(story.here()).toBe(true);
    inChapter = false;
    expect(story.here()).toBe(false);
    story.bump(); // bump 作废的是轮次,不是"在不在场"
    inChapter = true;
    expect(story.here()).toBe(true);
  });
});
