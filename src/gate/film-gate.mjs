// film-gate.mjs — 开场电影收束状态机(纯逻辑,2026-09-07 场景自动化拆出,vitest 直测)
// 收敛三路 finish(自然播完/skip/WebGL 降级)+ skip 幂等 + dead 守卫:
//   · begin/skip/endRun 维护 running/skipped 两个标志,dead = skipped || !running
//     (play() 的每个 await 后必须查 dead,否则 skip 后摸到已删 DOM——2026-09-06 线上血泪)
//   · schedule(ms) 收束定时器"后来居上":skip 的 1.6s 收束不会被更早挂着的
//     自然收束定时器提前截断;finish 幂等,任何一路只放一次烟花。
// 定时器可注入(setTimeoutFn),vitest 用假时钟跑全路径。

export function createFilmGate(fire, opt = {}) {
  const setTimeoutFn = opt.setTimeoutFn || ((fn, ms) => setTimeout(fn, ms));
  const clearTimeoutFn = opt.clearTimeoutFn || ((id) => clearTimeout(id));
  let running = false;
  let skipped = false;
  let fired = false;
  let timer = null;
  const gate = {
    get running() {
      return running;
    },
    get skipped() {
      return skipped;
    },
    get dead() {
      return skipped || !running;
    },
    get fired() {
      return fired;
    },
    // play() 入口:防重入;已运行时返回 false
    begin() {
      if (running) return false;
      running = true;
      return true;
    },
    // 剧终路径收尾(自然播完最后一步):停 run,让残余 await 全部走 dead 分支
    endRun() {
      running = false;
    },
    // skip:幂等;只在播放中有效
    skip() {
      if (skipped || !running) return false;
      skipped = true;
      running = false;
      return true;
    },
    // 收束调度:后来居上(替换未触发的旧定时器);finish 后不再受理
    schedule(ms) {
      if (fired) return null;
      if (timer !== null) clearTimeoutFn(timer);
      timer = setTimeoutFn(function () {
        timer = null;
        gate.finish();
      }, ms);
      return timer;
    },
    // 收束:幂等,只 fire 一次;顺带取消未触发的定时器
    finish() {
      if (fired) return false;
      fired = true;
      if (timer !== null) {
        clearTimeoutFn(timer);
        timer = null;
      }
      fire();
      return true;
    },
  };
  return gate;
}
