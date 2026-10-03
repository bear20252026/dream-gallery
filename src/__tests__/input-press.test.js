import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputManager } from '../engine.js';

afterEach(() => vi.unstubAllGlobals());
function setup() {
  const events = new Map();
  vi.stubGlobal('document', { addEventListener: (name, fn) => events.set(name, fn) });
  const input = new InputManager();
  input.initDefaults();
  return { input, events };
}
describe('低帧率时的主动观察输入', () => {
  it('E按下与松开都在下一帧之前发生时，仍交付一次互动', () => {
    const { input, events } = setup(),
      press = vi.fn();
    input.onKeyPress('e', press);
    events.get('keydown')({ key: 'E', repeat: false });
    events.get('keyup')({ key: 'E' });
    expect(input.isKeyDown('e')).toBe(false);
    expect(press).toHaveBeenCalledTimes(1);
  });
  it('按住不连跳对白，系统销毁后不留下旧消费者', () => {
    const { input, events } = setup(),
      press = vi.fn();
    const unsubscribe = input.onKeyPress('e', press);
    events.get('keydown')({ key: 'e' });
    events.get('keydown')({ key: 'e', repeat: true });
    unsubscribe();
    events.get('keydown')({ key: 'e' });
    expect(press).toHaveBeenCalledTimes(1);
  });
  it('连续W行走仍按帧更新，不被单次互动事件改成一步一按', () => {
    const { input, events } = setup(),
      move = vi.fn();
    input.on('forward', move);
    events.get('keydown')({ key: 'w' });
    input.tick(0.1);
    input.tick(0.1);
    events.get('keyup')({ key: 'w' });
    input.tick(0.1);
    expect(move).toHaveBeenCalledTimes(2);
  });
});
