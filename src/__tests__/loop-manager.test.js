// loop-manager.test.js — 唯一主循环的启停契约(2026-10-11 DG-LOOP-001)
// 旧实现只保存 _running 布尔、不保存 RAF id,循环一旦起来就停不下去,
// 而 core/loop.js 的 facade 早已承诺 stop: () => lm.stop()(被调用即 undefined is not a function)。
// 这里用可控 RAF/performance 钉死:start 幂等、stop 可重复、stop→start 可恢复、无残留句柄。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LoopManager } from '../loop-manager.js';
import { eventBus } from '../event-bus.js';

let rafSeq = 0;
/** @type {Map<number, Function>} 已登记但尚未执行的 RAF 句柄 */
let scheduled;
let clock;

function makeCtx() {
  return {
    loop: { timeScale: 1 },
    player: {},
    scene: {},
    media: {},
    ui: {},
    store: { setJson: () => {} },
    tickers: [],
  };
}

/** 浏览器逐帧:跑掉当前所有待执行回调(每个回调会再登记下一条) */
function flushFrames(times = 1) {
  for (let i = 0; i < times; i++) {
    const cbs = [...scheduled.entries()];
    scheduled.clear();
    for (const [, cb] of cbs) cb();
  }
}

beforeEach(() => {
  rafSeq = 0;
  scheduled = new Map();
  clock = 0;
  vi.stubGlobal('devicePixelRatio', 2);
  vi.stubGlobal('requestAnimationFrame', (cb) => {
    const id = ++rafSeq;
    scheduled.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id) => scheduled.delete(id));
  vi.stubGlobal('performance', {
    now: () => {
      clock += 16; // 每次取时前进一帧,dt 稳定 16ms
      return clock;
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * 只跑循环骨架的实例:帧内业务(物理/相机/渲染/小地图)是场景接线,归浏览器探针验。
 * 注意 start() 会同步跑第一帧,所以计数前一律 mockClear。
 */
function makeLoop() {
  const ctx = makeCtx();
  const lm = new LoopManager(ctx);
  vi.spyOn(lm, 'adaptiveQuality').mockImplementation(() => {});
  vi.spyOn(lm, '_executePhases').mockImplementation(() => {});
  return { lm, ctx };
}

describe('LoopManager 启停', () => {
  it('start() 只登记一条 RAF 链,并同步跑第一帧', () => {
    const { lm } = makeLoop();
    lm.start();
    expect(scheduled.size).toBe(1);
    expect(lm._running).toBe(true);
    expect(lm._rafId).not.toBe(0);
    expect(lm._executePhases).toHaveBeenCalledTimes(1);
  });

  it('start() 幂等:重复 start 不产生第二条 RAF 链', () => {
    const { lm } = makeLoop();
    lm.start();
    lm.start();
    lm.start();
    expect(scheduled.size).toBe(1);
    expect(lm._executePhases).toHaveBeenCalledTimes(1);
    lm._executePhases.mockClear();
    flushFrames(3);
    expect(scheduled.size).toBe(1);
    expect(lm._executePhases).toHaveBeenCalledTimes(3);
  });

  it('帧逐帧推进业务(dt 经 timeScale 缩放)', () => {
    const { lm, ctx } = makeLoop();
    lm.start();
    ctx.loop.timeScale = 0.5;
    lm._executePhases.mockClear();
    flushFrames(2);
    expect(lm._executePhases).toHaveBeenCalledTimes(2);
    expect(lm.frameCount).toBe(3); // 首帧 + 两帧
    lm._executePhases.mockClear();
    ctx.loop.timeScale = 1;
  });

  it('stop() 后不再执行帧回调,并撤销待执行的 RAF 句柄', () => {
    const { lm } = makeLoop();
    lm.start();
    flushFrames(1);
    const stale = [...scheduled.values()];
    lm.stop();
    expect(scheduled.size).toBe(0);
    expect(lm._running).toBe(false);
    expect(lm._rafId).toBe(0);
    lm._executePhases.mockClear();
    stale.forEach((cb) => cb()); // 已排进浏览器队列的旧句柄回流
    expect(lm._executePhases).not.toHaveBeenCalled();
    expect(scheduled.size).toBe(0); // 旧句柄不得续链
  });

  it('stop() 可重复调用,不抛错、不残留句柄/定时器', () => {
    const { lm } = makeLoop();
    lm.start();
    flushFrames(2);
    expect(() => {
      lm.stop();
      lm.stop();
      lm.stop();
    }).not.toThrow();
    expect(scheduled.size).toBe(0);
    expect(lm._rafId).toBe(0);
    expect(lm._timers.length).toBe(0);
    lm._executePhases.mockClear();
    flushFrames(3);
    expect(lm._executePhases).not.toHaveBeenCalled();
  });

  it('stop → start 能重新工作', () => {
    const { lm } = makeLoop();
    lm.start();
    flushFrames(1);
    lm.stop();
    lm._executePhases.mockClear();
    lm.start();
    expect(lm._running).toBe(true);
    expect(scheduled.size).toBe(1);
    expect(lm._executePhases).toHaveBeenCalledTimes(1);
    lm._executePhases.mockClear();
    flushFrames(2);
    expect(lm._executePhases).toHaveBeenCalledTimes(2);
    lm.stop();
    expect(scheduled.size).toBe(0);
  });

  it('pause/resume 只动 timeScale,不停循环', () => {
    const { lm, ctx } = makeLoop();
    lm.start();
    lm.pause();
    expect(ctx.loop.timeScale).toBe(0);
    expect(lm._running).toBe(true);
    lm._executePhases.mockClear();
    flushFrames(1);
    expect(lm._executePhases).toHaveBeenCalledTimes(1);
    lm.resume();
    expect(ctx.loop.timeScale).toBe(1);
    lm.stop();
  });

  it('frameTicks 单调累计且不随 fps 窗口重置(冒烟门禁的启动判据)', () => {
    // 2026-11-20:冒烟门禁原用 getFPS() > 0 判「世界已启动」,而 fps 是
    // 「最近 ~1s 窗口」的 Math.round 值 —— 帧率低于 1fps 时恒为 0,
    // CI(swiftshader 软渲染)上两次假超时。改判累计帧数,与帧率解耦。
    const { lm } = makeLoop();
    lm.ctx.scene.rnd = { getPixelRatio: () => 2 }; // getPerformanceInfo 要读它
    expect(lm.frameTicks).toBe(0);
    lm.start(); // 同步跑首帧
    expect(lm.frameTicks).toBe(1);
    flushFrames(3);
    expect(lm.frameTicks).toBe(4);
    // 本用例时钟每帧只走 16ms,远不到 fpsUpdateInterval(1000ms):
    // frameCount 与 fps 仍是「窗口未到期」的瞬时态,frameTicks 已如实累计
    expect(lm.fps).toBe(0);
    expect(lm.frameTicks).toBeGreaterThanOrEqual(lm.frameCount);
    expect(lm.getPerformanceInfo().frameTicks).toBe(4);
  });

  it('stop() 广播 loop:stopped 供订阅方收尾', () => {
    const calls = [];
    const off = eventBus.on('loop:stopped', () => calls.push(1));
    const { lm } = makeLoop();
    lm.start();
    lm.stop();
    off();
    lm.stop(); // 订阅已撤,不再计数
    expect(calls.length).toBe(1);
  });
});
