// game-state.test.js — 单向写入口契约(2026-09-18 审计 P1 补测;Stage4 写路径单入口规矩)
import { describe, it, expect, vi } from 'vitest';
import { createGameState } from '../core/game-state.js';

describe('createGameState 基础', () => {
  it('get/snapshot:初始值与快照隔离(快照是副本)', () => {
    const gs = createGameState({ a: 1 });
    expect(gs.get('a')).toBe(1);
    const snap = gs.snapshot();
    snap.a = 99;
    expect(gs.get('a')).toBe(1);
    expect(gs.get('不存在')).toBeUndefined();
  });

  it('set:变更才通知(同值幂等),通知带 (key,value,old)', () => {
    const gs = createGameState({ m: 'normal' });
    const fn = vi.fn();
    gs.subscribe(fn);
    gs.set('m', 'normal'); // 同值:不通知
    expect(fn).not.toHaveBeenCalled();
    gs.set('m', 'special');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('m', 'special', 'normal');
  });

  it('subscribe 返回退订函数;订阅者抛错不炸总线', () => {
    const gs = createGameState({});
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    const un = gs.subscribe(bad);
    gs.subscribe(good);
    expect(() => gs.set('x', 1)).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    un();
    gs.set('x', 2);
    expect(bad).toHaveBeenCalledTimes(1); // 已退订
  });

  it('patch 逐键走 set(逐键通知)', () => {
    const gs = createGameState({});
    const fn = vi.fn();
    gs.subscribe(fn);
    gs.patch({ a: 1, b: 2, a2: undefined });
    expect(fn).toHaveBeenCalledTimes(2); // undefined 值也会 set(patch 不滤空)
  });
});

describe('Stage4 bindNamespace 写回', () => {
  it('已绑 prop:set 后经 apply 写回命名空间;isBound 判定', () => {
    const gs = createGameState({});
    const apply = vi.fn();
    gs.bindNamespace('mode', ['siteMode'], apply);
    expect(gs.isBound('siteMode')).toBe(true);
    expect(gs.isBound('other')).toBe(false);
    gs.set('siteMode', 'x');
    expect(apply).toHaveBeenCalledWith('siteMode', 'x');
  });

  it('未绑 prop:set 不写回;apply 抛错被吞不炸调用方', () => {
    const gs = createGameState({});
    gs.bindNamespace('player', ['quizPassed'], () => {
      throw new Error('ctx write fail');
    });
    expect(() => gs.set('quizPassed', true)).not.toThrow();
    expect(gs.get('quizPassed')).toBe(true); // 自身状态仍已写
    const apply = vi.fn();
    gs.bindNamespace('player', ['viewMode'], apply);
    gs.set('flightLock', true); // 未绑:不调 apply
    expect(apply).not.toHaveBeenCalled();
  });

  it('bindNamespace 参数残缺直接忽略', () => {
    const gs = createGameState({});
    expect(() => gs.bindNamespace('', ['a'], () => {})).not.toThrow();
    expect(() => gs.bindNamespace('ns', null, () => {})).not.toThrow();
    expect(() => gs.bindNamespace('ns', ['a'], null)).not.toThrow();
    expect(gs.isBound('a')).toBe(false);
  });
});
