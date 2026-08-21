// events.js 单元测试
import { describe, it, expect, vi, beforeEach } from 'vitest';

// events.js 使用模块级 listeners 对象，需要每次重新导入以重置状态
// 由于 ES 模块缓存，我们直接测试行为而不重置
import { events } from '../events.js';

describe('EventBus', () => {
  it('on + emit 触发回调', () => {
    const handler = vi.fn();
    events.on('test:basic', handler);
    events.emit('test:basic', 'arg1', 42);
    expect(handler).toHaveBeenCalledWith('arg1', 42);
    events.off('test:basic');
  });

  it('on 返回取消订阅函数', () => {
    const handler = vi.fn();
    const unsub = events.on('test:unsub', handler);
    unsub();
    events.emit('test:unsub');
    expect(handler).not.toHaveBeenCalled();
  });

  it('once 只触发一次', () => {
    const handler = vi.fn();
    events.once('test:once', handler);
    events.emit('test:once', 1);
    events.emit('test:once', 2);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(1);
  });

  it('off 移除指定回调', () => {
    const handler = vi.fn();
    events.on('test:off', handler);
    events.off('test:off', handler);
    events.emit('test:off');
    expect(handler).not.toHaveBeenCalled();
  });

  it('off 不传 fn 清空该事件所有回调', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    events.on('test:offall', h1);
    events.on('test:offall', h2);
    events.off('test:offall');
    events.emit('test:offall');
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  it('emit 不存在的事件不抛异常', () => {
    expect(() => events.emit('nonexistent:event')).not.toThrow();
  });

  it('回调中抛错不影响其他回调', () => {
    const good = vi.fn();
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    events.on('test:error', bad);
    events.on('test:error', good);
    events.emit('test:error');
    expect(good).toHaveBeenCalled();
    events.off('test:error');
  });

  it('多个订阅者按注册顺序调用', () => {
    const order = [];
    events.on('test:order', () => order.push(1));
    events.on('test:order', () => order.push(2));
    events.on('test:order', () => order.push(3));
    events.emit('test:order');
    expect(order).toEqual([1, 2, 3]);
    events.off('test:order');
  });
});
