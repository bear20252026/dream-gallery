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
function installCaptures(bag) {
  const s = ctx.scene && ctx.scene.s;
  if (s && typeof s.add === 'function') {
    const prev = s.add.bind(s);
    s.add = (...a) => {
      bag.objs.push(...a);
      return prev(...a);
    };
    bag._prevAdd = prev;
  }
  if (typeof document !== 'undefined' && document.body) {
    const prev = document.body.appendChild.bind(document.body);
    document.body.appendChild = (el) => {
      bag.doms.push(el);
      return prev(el);
    };
    bag._prevAppend = prev;
  }
  if (typeof window !== 'undefined' && window.setInterval) {
    const prev = window.setInterval.bind(window);
    window.setInterval = (fn, t, ...r) => {
      const id = prev(fn, t, ...r);
      bag.intervals.push(id);
      return id;
    };
    bag._prevSetInterval = prev;
  }
  if (typeof ctx.onTick === 'function') {
    const prev = ctx.onTick;
    ctx.onTick = (fn) => {
      bag.tickers.push(fn);
      return prev(fn);
    };
    bag._prevOnTick = prev;
  }
}

function uninstallCaptures(bag) {
  const s = ctx.scene && ctx.scene.s;
  if (bag._prevAdd) {
    if (s) s.add = bag._prevAdd;
    bag._prevAdd = null;
  }
  if (bag._prevAppend) {
    if (typeof document !== 'undefined' && document.body)
      document.body.appendChild = bag._prevAppend;
    bag._prevAppend = null;
  }
  if (bag._prevSetInterval) {
    if (typeof window !== 'undefined') window.setInterval = bag._prevSetInterval;
    bag._prevSetInterval = null;
  }
  if (bag._prevOnTick) {
    ctx.onTick = bag._prevOnTick;
    bag._prevOnTick = null;
  }
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
  const bag = { objs: [], doms: [], intervals: [], tickers: [], custom: [], tracked: [] };
  REG[name] = bag;
  bag.dispose = () => {
    uninstallCaptures(bag);
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
    if (REG[name] !== bag) {
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
      installCaptures(bag);
      try {
        return fn.apply(this, args);
      } finally {
        uninstallCaptures(bag);
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
