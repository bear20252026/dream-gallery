// core/game-state.js — 单向游戏状态 store(阶段1 骨架,2026-08-27)
// 目标:集中散落在 ctx 上的可变标志(如 siteMode/quizPassed/viewMode/flightLock 等),
// 改为单向 setState + 订阅通知,不再允许任意模块直接 ctx.xxx = 写全局。
// 本步仅立骨架,暂不直接迁移旧数据;阶段3 逐积木迁移时把对应标志迁此。
export function createGameState(initial) {
  let state = Object.assign({}, initial || {});
  const listeners = new Set();
  // Stage 4 写回登记表: prop -> { ns, apply }。gameState.set 写完自身 state 后,
  // 若 prop 已绑定命名空间,经 apply(prop,value) 写回 ctx.<ns>.<prop>,触发命名空间 set 陷阱
  // 发 `${ns}:changed:${prop}` / `${ns}:changed` 事件——使 gameState.set 成为唯一写入口,
  // 旧读 ctx.<ns>.<prop> 仍经 vault 拿到新值(零回归)。每个命名空间在 state-system.init 里 bindNamespace 注册。
  const nsBindings = {};
  // M-02 欠账表:prop -> 尚未成功写回的值。apply 抛过错就必须留痕,否则这次写永久丢掉(见 set)。
  const pendingWrite = new Map();

  function notify(key, value, old) {
    listeners.forEach((fn) => {
      try {
        fn(key, value, old);
      } catch (e) {
        console.warn('[game-state] subscriber 失败:', key, e.message);
      }
    });
  }

  // 写回命名空间(单入口真正"落到 ctx"的那一步)。失败不抛给调用方,但要记欠账等下一次补写。
  function writeThrough(key, value) {
    const b = nsBindings[key];
    if (!b) return true;
    try {
      b.apply(key, value);
      pendingWrite.delete(key);
      return true;
    } catch (e) {
      pendingWrite.set(key, value);
      console.warn('[game-state] write-through 失败:', key, e.message);
      return false;
    }
  }

  return {
    get(key) {
      return state[key];
    },
    set(key, value) {
      // 同值也要补写欠账。这句早返回不能拆(state-system.js 的镜像回写靠它防回环),
      // 但 M-02 之前的写法让它顺带把失败的写回也钉死了:state[key] 已是新值 ⇒ 同值重设永不再试,
      // 于是 gameState 说新值、ctx 说旧值,两边各读各的,直到页面刷新。
      if (state[key] === value) {
        if (pendingWrite.has(key)) writeThrough(key, value);
        return;
      }
      const old = state[key];
      state[key] = value;
      // 先写回 ctx 再通知:通知期间订阅者里读 ctx.<ns>.<prop> 的旧代码必须已经看得到新值。
      // 原先 notify 在前,同一次变更给出两个答案(gameState 新、ctx 还旧),订阅方按 ctx 判定就错。
      writeThrough(key, value);
      notify(key, value, old);
    },
    patch(obj) {
      if (!obj) return;
      for (const k of Object.keys(obj)) this.set(k, obj[k]);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    snapshot() {
      return Object.assign({}, state);
    },
    // Stage 4:把一组 prop 的写回绑定到命名空间 setter。apply(prop,value) 负责写 ctx.<ns>.<prop>。
    bindNamespace(ns, props, apply) {
      if (!ns || !props || !apply) return;
      for (const p of props) nsBindings[p] = { ns, apply };
    },
    // Stage 4 冻结:查询某 prop 是否已绑(供命名空间 set 陷阱判断是否委托单入口)。
    isBound(prop) {
      return !!nsBindings[prop];
    },
  };
}

// 单例:全站唯一的单向状态库(阶段3 store 真正化)。
// 经 core/state-system.js 订阅事件总线属性变更,自动镜像命名空间状态,
// 成为系统可读/可订阅的统一状态源(读模型);Stage 4 可将写路径也收归此处,关闭 ctx 直写。
const gameState = createGameState();
export function getGameState() {
  return gameState;
}
