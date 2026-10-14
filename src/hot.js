// hot.js — 轻量 HMR 生命周期助手(Vite 热更新红利)
// 用法(模块顶部/底部各一行,零侵入):
//   import {hotBegin,hotEnd} from './hot.js';
//   hotBegin('模块名');
//   ...原有模块代码...
//   hotEnd('模块名');
//   if(import.meta.hot)import.meta.hot.accept();
// Vite 重载该模块时:先按记录销毁旧实例(场景对象/几何/材质/ticker/定时器/DOM/自定义清理),再执行新代码。
// 需要额外清理的(碰撞体/iG 可交互组/全局事件监听等):const bag=hotBegin('x'); bag.custom.push(()=>{...});
// 捕获管不到的(异步回调里创建的资源、非主世界 world.scene 的对象)显式登记(2026-10-11 第 6 节):
//   bag.register(obj[, {scene, shared}])   —— 资源:热替换时从所属 scene 移除并统一释放
//   bag.register(fn)                       —— 等价 bag.custom.push(fn)(自定义清理钩子)
//   const wrapped = bag.async((gltf)=>{})  —— 把 fetch/GLTF/setTimeout 回调包一层:回调体内创建的
//     scene 对象/body DOM/定时器/ticker 照样进 bag(此前这些异步创建的资源全在 bag 之外)
// 只做显式登记,不做运行时插桩自动捕获(风险远超收益)。
// 不适合有玩家状态/物理/长连接的模块(player/desert/media 保持整页刷新)。
import { ctx } from './ctx.js';
import { disposeObject3D } from './shared/dispose-object3d.mjs';

const REG = (window.__HMR__ = window.__HMR__ || {});

// —— 捕获补丁的安装/卸载(2026-10-11 抽成函数:hotEnd 与 bag.async 共用一套口径) ——
// 逐件记录"装之前是什么",卸载时原样交还,嵌套包装也交还正确(内层还原到外层版本)。
//
// ★ 代次守卫(2026-10-14 第六轮审计 M-14 的那一半):`bag.register` 早就有 `REG[name] !== bag` 的
//   晚到检查,但**捕获路径没有** ⇒ 模块被热替换后,迟到的 `bag.async` 回调仍会把这个已 dispose 的
//   旧 bag 的补丁重新装到 s.add / appendChild / onTick 上,回调期间创建的对象全落进
//   `bag.objs`(dispose 时已 `length = 0`,之后再没人读它)= 对象留在场景里、GPU 资源永不释放。
//   现在的口径:不在任就**不装**——这些对象于是由当前世代自己的捕获接管(它包着就归它释放),
//   没有任何世代包着(生产不热替换)时就和改动前一样只是正常加入场景。
//   不装也就不卸:否则 finally 里的 uninstall 会把 `_prevAdd`(记下的是**现任**的包装)再赋回去,
//   看着像还原,实际把现任的捕获悄悄摘掉了 —— 那比漏释放更难查。
function isLiveBag(bag) {
  return !bag.name || REG[bag.name] === bag;
}

// ★ 安装是**一层栈**,不是四个 `bag._prevX` 单槽(2026-10-14 第六轮审计 M-14 顺带抓到的真缺陷):
//   原实现把"装之前是什么"记在 bag._prevAdd / _prevAppend / _prevSetInterval / _prevOnTick 四个单槽里,
//   而 `bag.async()` 回调进出会再装/再卸一层 ⇒ 内层 install 覆盖单槽、内层 uninstall 又把单槽**置 null**
//   ⇒ 轮到最后 `hotEnd()`/`dispose()` 时 `if (bag._prevAdd)` 已经是假的,**外层那层补丁永远卸不掉**:
//   每次热更都在 s.add / appendChild / onTick 上留一层壳,而且被卸干净的那轮之后新加的对象还会落进
//   已经 dispose 完的旧 bag。热更次数越多壳越厚(只有 dev/HMR 路径受影响,线上不二次装配)。
//   现在:每次 install 把这一层的 prev 组压栈,uninstall 弹栈还原,栈空才真的没有补丁。
function installCaptures(bag) {
  if (!isLiveBag(bag)) return false;
  if (!bag._captureStack) bag._captureStack = [];
  const saved = {};
  const s = ctx.scene && ctx.scene.s;
  if (s && typeof s.add === 'function') {
    const prev = s.add.bind(s);
    s.add = (...a) => {
      bag.objs.push(...a);
      return prev(...a);
    };
    saved.prevAdd = prev;
  }
  if (typeof document !== 'undefined' && document.body) {
    const prev = document.body.appendChild.bind(document.body);
    document.body.appendChild = (el) => {
      bag.doms.push(el);
      return prev(el);
    };
    saved.prevAppend = prev;
  }
  if (typeof window !== 'undefined' && window.setInterval) {
    const prev = window.setInterval.bind(window);
    window.setInterval = (fn, t, ...r) => {
      const id = prev(fn, t, ...r);
      bag.intervals.push(id);
      return id;
    };
    saved.prevSetInterval = prev;
  }
  if (typeof ctx.onTick === 'function') {
    const prev = ctx.onTick;
    ctx.onTick = (fn) => {
      bag.tickers.push(fn);
      return prev(fn);
    };
    saved.prevOnTick = prev;
  }
  bag._captureStack.push(saved);
  return true;
}

function uninstallCaptures(bag) {
  const stack = bag._captureStack;
  if (!stack || !stack.length) return; // 没装过(或代次守卫拦了)⇒ 什么都不还原
  const saved = stack.pop();
  const s = ctx.scene && ctx.scene.s;
  if (saved.prevAdd) {
    if (s) s.add = saved.prevAdd;
  }
  if (saved.prevAppend) {
    if (typeof document !== 'undefined' && document.body)
      document.body.appendChild = saved.prevAppend;
  }
  if (saved.prevSetInterval) {
    if (typeof window !== 'undefined') window.setInterval = saved.prevSetInterval;
  }
  if (saved.prevOnTick) {
    ctx.onTick = saved.prevOnTick;
  }
}

// 把这轮 bag 还压着的补丁全部吐干净(dispose 用;正常情况下栈里只剩 hotBegin 那一层或空)
function drainCaptures(bag) {
  while (bag._captureStack && bag._captureStack.length) uninstallCaptures(bag);
}

export function hotBegin(name) {
  // 销毁上一个实例(热替换时)
  if (REG[name]) {
    try {
      REG[name].dispose();
    } catch (e) {
      console.warn('[hot] 销毁旧实例失败:', name, e);
    }
    delete REG[name];
  }
  const bag = {
    name,
    objs: [],
    doms: [],
    intervals: [],
    tickers: [],
    custom: [],
    tracked: [],
    _captureStack: [], // 捕获补丁的安装栈(见 installCaptures 上方那段)
  };
  REG[name] = bag;
  bag.dispose = () => {
    drainCaptures(bag);
    // 统一释放走 shared/dispose-object3d.mjs(站内唯一实现,与 mode.js/paintings.js 同口径):
    // 内置"three 的 Sprite 共享几何不释放"保护——早先内联 traverse 会对 Sprite 几何调 dispose,
    // 一旦命中就是全站 Sprite 一起消失的事故面。
    for (const o of bag.objs) {
      ctx.scene.s && ctx.scene.s.remove(o);
      disposeObject3D(o);
    }
    bag.objs.length = 0;
    // 显式登记的异步/非主场景资源(2026-10-11):从各自所属场景摘除后释放
    for (const t of bag.tracked) {
      try {
        (t.scene || (ctx.scene && ctx.scene.s))?.remove(t.obj);
        disposeObject3D(t.obj, t.shared ? { shared: t.shared } : undefined);
      } catch (e) {
        console.warn('[hot] 登记资源清理失败:', name, e);
      }
    }
    bag.tracked.length = 0;
    // ticker 逐个按引用移除(2026-07-25 修复:曾按注册刻度截断,热更新靠前的模块
    // 会把其后所有模块的 ticker 一起杀掉——现在只杀自己注册的)
    for (const fn of bag.tickers) {
      const i = ctx.tickers.indexOf(fn);
      if (i >= 0) ctx.tickers.splice(i, 1);
    }
    bag.tickers.length = 0;
    for (const id of bag.intervals) clearInterval(id);
    for (const el of bag.doms) el.remove();
    for (const f of bag.custom) {
      try {
        f();
      } catch (e) {
        console.warn('[hot] 自定义清理失败:', name, e);
      }
    }
  };
  /**
   * 显式登记一条本轮资源(捕获管不到的场景才需要用它:异步回调里 s.add 的对象、
   * 非主世界的 world.scene.add、DOM/定时器之外的任意副作用)。
   * @param {object|(()=>void)} obj 场景对象;传函数则等价 bag.custom.push(清理钩子)
   * @param {{scene?:object, shared?:Set|Array}} [opts] scene=对象所属场景(默认主场景);
   *   shared=本棵子树里不许释放的共享资源集
   * @returns {object} 原样返回 obj,便于链式使用
   */
  bag.register = (obj, opts) => {
    if (!obj) return obj;
    if (typeof obj === 'function') {
      bag.custom.push(obj);
      return obj;
    }
    const scene = (opts && opts.scene) || null;
    const mainScene = ctx.scene && ctx.scene.s;
    // 主场景对象在捕获窗口里已被 s.add 收进 bag.objs —— 不重复登记(避免同一棵树 dispose 两遍)
    if ((!scene || scene === mainScene) && bag.objs.includes(obj)) return obj;
    if (REG[bag.name] !== bag) {
      // 本轮已被热替换:晚到的资源当场摘除并释放,绝不留给下个世代(照 sheep-companion 的口径)
      try {
        (scene || mainScene)?.remove(obj);
        disposeObject3D(obj, opts && opts.shared ? { shared: opts.shared } : undefined);
      } catch (e) {
        console.warn('[hot] 晚到资源释放失败:', name, e);
      }
      return obj;
    }
    bag.tracked.push({
      obj,
      scene,
      shared: (opts && opts.shared) || null,
    });
    return obj;
  };
  /**
   * 包装一个异步创建回调(fetch().then / GLTF onLoad / setTimeout),让回调体内创建的
   * 场景对象/DOM/定时器/ticker 照样进 bag —— **不做运行时插桩,只做显式登记**(风险边界见 AGENTS HMR 条)。
   * @param {Function} fn 回调体
   * @returns {Function} 包装后的回调(返回值与 this 透传)
   */
  bag.async = (fn) => {
    if (typeof fn !== 'function') return fn;
    return function (...args) {
      // 代次守卫:不在任就什么都不装(见文件头 installCaptures 上方那段)。
      // 关键是**不装就不卸** —— 卸载会把 _prevAdd(此刻记的是现任 bag 的包装)赋回去,
      // 等于把现任的捕获悄悄摘掉,那比这次泄漏更难查。
      const installed = installCaptures(bag);
      try {
        return fn.apply(this, args);
      } finally {
        if (installed) uninstallCaptures(bag);
      }
    };
  };
  // 捕获期间创建的:场景对象(s.add)/body DOM/定时器/每帧 ticker
  installCaptures(bag);
  return bag;
}

export function hotEnd(name) {
  const bag = REG[name];
  if (!bag) return;
  uninstallCaptures(bag);
}
