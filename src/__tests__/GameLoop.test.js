// GameLoop 单元测试 — timeScale 容器
import { describe, it, expect, beforeEach } from 'vitest';
import { GameLoop } from '../loop.js';

describe('GameLoop', () => {
  let loop;

  beforeEach(() => {
    loop = new GameLoop();
  });

  it('初始 timeScale 为 1.0', () => {
    expect(loop.timeScale).toBe(1.0);
  });

  it('pause 设 timeScale=0', () => {
    loop.pause();
    expect(loop.timeScale).toBe(0);
  });

  it('resume 恢复 timeScale=1', () => {
    loop.pause();
    loop.resume();
    expect(loop.timeScale).toBe(1);
  });
});
