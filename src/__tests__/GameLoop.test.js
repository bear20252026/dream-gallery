// GameLoop 单元测试
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameLoop } from '../loop.js';

describe('GameLoop', () => {
  let loop;

  beforeEach(() => {
    loop = new GameLoop();
  });

  it('初始状态未运行', () => {
    expect(loop._running).toBe(false);
    expect(loop.timeScale).toBe(1.0);
    expect(loop.maxDelta).toBe(100);
  });

  it('注册到有效阶段', () => {
    const fn = vi.fn();
    const unsub = loop.on('update', fn);
    expect(typeof unsub).toBe('function');
    expect(loop._phases.update).toContain(fn);
  });

  it('注册到无效阶段抛异常', () => {
    expect(() => loop.on('invalid', vi.fn())).toThrow('未知阶段');
  });

  it('off 移除指定函数', () => {
    const fn = vi.fn();
    loop.on('update', fn);
    loop.off('update', fn);
    expect(loop._phases.update).not.toContain(fn);
  });

  it('off 不传 fn 时该阶段回调不变（仅传 fn 才移除）', () => {
    loop.on('update', vi.fn());
    loop.on('update', vi.fn());
    // off 不传 fn 时，代码用 filter(fn) 但 fn=undefined，filter 不匹配任何项
    loop.off('update');
    // 实际上 off(undefined) 不会清空，因为 filter(f => f !== undefined) 不匹配
    // 这是当前实现的行为，测试验证它
    expect(loop._phases.update).toHaveLength(2);
  });

  it('unsubscribe 函数移除注册', () => {
    const fn = vi.fn();
    const unsub = loop.on('update', fn);
    unsub();
    expect(loop._phases.update).not.toContain(fn);
  });

  it('pause 设 timeScale=0, resume 设 timeScale=1', () => {
    loop.pause();
    expect(loop.timeScale).toBe(0);
    loop.resume();
    expect(loop.timeScale).toBe(1);
  });

  it('各阶段存在且为空数组', () => {
    expect(loop._phases.input).toEqual([]);
    expect(loop._phases.update).toEqual([]);
    expect(loop._phases.render).toEqual([]);
    expect(loop._phases.ui).toEqual([]);
  });
});
