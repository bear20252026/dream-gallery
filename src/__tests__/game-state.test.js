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

// —— M-02(第六轮外部审计):写回顺序与失败欠账 ——
describe('Stage4 写回的顺序与补写', () => {
  it('写回先于通知:订阅者在通知期间读到的命名空间值已是新值', () => {
    const gs = createGameState({ siteMode: 'demo' });
    const vault = { siteMode: 'demo' }; // 模拟 ctx.mode 背后的共享存储(老代码都从这里读)
    gs.bindNamespace('mode', ['siteMode'], (p, v) => {
      vault[p] = v;
    });
    const seen = [];
    gs.subscribe((k, v) => seen.push([v, vault[k]]));
    gs.set('siteMode', 'custom');
    // 此前 apply 排在 notify 之后 ⇒ 这里会是 ['custom', 'demo']:同一次变更两个答案
    expect(seen).toEqual([['custom', 'custom']]);
  });

  it('apply 抛错不留粘性:同值重设会补写,ctx 与 gameState 不长期错位', () => {
    const gs = createGameState({});
    const vault = {};
    let fail = true;
    gs.bindNamespace('player', ['viewMode'], (p, v) => {
      if (fail) throw new Error('ctx busy');
      vault[p] = v;
    });
    gs.set('viewMode', 1);
    expect(gs.get('viewMode')).toBe(1); // 自身状态照旧已写
    expect(vault.viewMode).toBeUndefined(); // 这一次确实没落到 ctx
    fail = false;
    gs.set('viewMode', 1); // 同值:M-02 之前这句被早返回吃掉,欠账永远补不回来
    expect(vault.viewMode).toBe(1);
  });

  it('补写欠账不重复通知(同值幂等契约不变)', () => {
    const gs = createGameState({});
    let fail = true;
    gs.bindNamespace('player', ['viewMode'], () => {
      if (fail) throw new Error('ctx busy');
    });
    const fn = vi.fn();
    gs.subscribe(fn);
    gs.set('viewMode', 2); // 变更:通知 1 次,写回失败
    fail = false;
    gs.set('viewMode', 2); // 补写:不该再通知
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('换成新值时以新值为准:过期欠账不会被补写进 ctx', () => {
    const gs = createGameState({});
    const vault = {};
    const applied = [];
    let failFirst = true;
    gs.bindNamespace('kunlun', ['flightLock'], (p, v) => {
      applied.push(v);
      if (failFirst) {
        failFirst = false;
        throw new Error('once');
      }
      vault[p] = v;
    });
    gs.set('flightLock', true); // 失败,欠账 true
    gs.set('flightLock', false); // 新值成功 ⇒ 清欠账
    expect(vault.flightLock).toBe(false);
    gs.set('flightLock', false); // 同值:不该把 true 再补一遍
    expect(vault.flightLock).toBe(false);
    expect(applied).toEqual([true, false]);
  });

  it('命名空间镜像回写(state-system 的回路)不死循环、不重复通知', () => {
    // apply 里再 gs.set(同值)就是 core/state-system.js 的镜像路径,靠同值早返回断开。
    const gs = createGameState({ quizPassed: false });
    const vault = {};
    gs.bindNamespace('player', ['quizPassed'], (p, v) => {
      vault[p] = v;
      gs.set(p, v);
    });
    const fn = vi.fn();
    gs.subscribe(fn);
    expect(() => gs.set('quizPassed', true)).not.toThrow();
    expect(vault.quizPassed).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1); // 只有那次真变更
  });
});
