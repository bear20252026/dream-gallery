// core/loop.js — 单一主循环 facade(阶段1·P0-1 收口后续,2026-08-28)
//
// LoopManager 是唯一主循环(阶段0 已合并双循环)。本 facade 提供:
// - setLoop/getLoop:在 main.js 装配期注入唯一 LoopManager 实例,供新积木经 deps.loop 注入。
// - register(fn):把每帧回调注册进唯一循环的 UPDATE 阶段(等价于 ctx.onTick,但走 facade,
//   避免新代码再直接读 ctx.tickers / 再起自己的 requestAnimationFrame —— 即灭双循环的根)。
//
// 注意:LoopManager 暂无公开 .on(phase) 订阅 API(阶段2 防腐层再补);当前 UPDATE 阶段由
// ctx.tickers 承载,register 直接复用之。此文件本身被 main.js 真实使用(注册组合根每帧 tick),非死抽象。
import { ctx } from '../ctx.js';

let _loop = null;

export function setLoop(lm) {
  _loop = lm;
}

export function getLoop() {
  return _loop;
}

// 注册每帧回调(进入唯一循环的 UPDATE 阶段)
export function register(fn) {
  if (!ctx.tickers) ctx.tickers = [];
  ctx.tickers.push(fn);
  return () => {
    const i = ctx.tickers.indexOf(fn);
    if (i >= 0) ctx.tickers.splice(i, 1);
  };
}

export function createLoopSystem() {
  const lm = _loop;
  return {
    name: 'loop',
    layer: 'platform',
    phase: 'bootstrap',
    order: -1000,
    register,
    start: () => lm && lm.start(),
    stop: () => lm && lm.stop(),
    get impl() {
      return lm;
    },
  };
}
