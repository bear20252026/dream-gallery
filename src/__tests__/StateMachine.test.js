// StateMachine 单元测试
import { describe, it, expect, vi } from 'vitest';
import { StateMachine, PlayerState } from '../player/StateMachine.js';

describe('PlayerState', () => {
  it('构造时设置 name', () => {
    const s = new PlayerState('idle');
    expect(s.name).toBe('idle');
  });

  it('默认方法不抛异常', () => {
    const s = new PlayerState('test');
    expect(s.enter()).toBeUndefined();
    expect(s.update(0.016)).toBeNull();
    expect(s.exit()).toBeUndefined();
  });
});

describe('StateMachine', () => {
  it('初始状态为 null', () => {
    const sm = new StateMachine();
    expect(sm.current).toBeNull();
  });

  it('change 设置 current 并调用 enter', () => {
    const sm = new StateMachine();
    const s = new PlayerState('idle');
    s.enter = vi.fn();
    sm.change(s);
    expect(sm.current).toBe(s);
    expect(s.enter).toHaveBeenCalledOnce();
  });

  it('change 时调用旧状态 exit', () => {
    const sm = new StateMachine();
    const old = new PlayerState('idle');
    old.exit = vi.fn();
    const next = new PlayerState('walk');
    sm.change(old);
    sm.change(next);
    expect(old.exit).toHaveBeenCalledOnce();
    expect(sm.current).toBe(next);
  });

  it('change 到同一状态不重复 exit 但会再次 enter', () => {
    const sm = new StateMachine();
    const s = new PlayerState('idle');
    s.exit = vi.fn();
    s.enter = vi.fn();
    sm.change(s);
    sm.change(s);
    // 当前实现: this.current !== state 为 false 跳过 exit，但无条件调 state.enter()
    expect(s.exit).not.toHaveBeenCalled();
    expect(s.enter).toHaveBeenCalledTimes(2);
  });

  it('tick 调用 current.update', () => {
    const sm = new StateMachine();
    const s = new PlayerState('idle');
    s.update = vi.fn().mockReturnValue(null);
    sm.change(s);
    sm.tick(0.016);
    expect(s.update).toHaveBeenCalledWith(0.016);
  });

  it('tick 自动切换 update 返回的新状态', () => {
    const sm = new StateMachine();
    const idle = new PlayerState('idle');
    const walk = new PlayerState('walk');
    idle.update = vi.fn().mockReturnValue(walk);
    idle.exit = vi.fn();
    walk.enter = vi.fn();
    sm.change(idle);
    sm.tick(0.016);
    expect(idle.exit).toHaveBeenCalledOnce();
    expect(walk.enter).toHaveBeenCalledOnce();
    expect(sm.current).toBe(walk);
  });

  it('tick 时 current 为 null 不抛异常', () => {
    const sm = new StateMachine();
    expect(() => sm.tick(0.016)).not.toThrow();
  });

  it('完整链路: idle → walk → airborne → idle', () => {
    const sm = new StateMachine();
    const order = [];
    const idle = new PlayerState('idle');
    const walk = new PlayerState('walk');
    const air = new PlayerState('airborne');

    idle.enter = () => order.push('idle:enter');
    idle.exit = () => order.push('idle:exit');
    walk.enter = () => order.push('walk:enter');
    walk.exit = () => order.push('walk:exit');
    air.enter = () => order.push('air:enter');
    air.exit = () => order.push('air:exit');

    sm.change(idle);
    expect(order).toEqual(['idle:enter']);

    idle.update = () => walk;
    sm.tick(0.016);
    expect(order).toEqual(['idle:enter', 'idle:exit', 'walk:enter']);

    walk.update = () => air;
    sm.tick(0.016);
    expect(order).toEqual(['idle:enter', 'idle:exit', 'walk:enter', 'walk:exit', 'air:enter']);

    air.update = () => idle;
    sm.tick(0.016);
    expect(order).toEqual([
      'idle:enter',
      'idle:exit',
      'walk:enter',
      'walk:exit',
      'air:enter',
      'air:exit',
      'idle:enter',
    ]);
  });
});
