// core/composition-root.js — 组合根(只做拼接,零业务逻辑,2026-08-27 起)
// 收集所有积木,按 (层 → 相位 → 次序) 确定性地 init/update/dispose。
// 每个积木只经此入口装配,绝不在 main.js 散点 import 副作用。
// 阶段2 起由 DI 容器取代本单例;此处仍作为装配的"唯一真相入口"。
import { eventBus } from './event-bus.js';
import { compareSystems } from './system.js';

export function createCompositionRoot() {
  const systems = [];
  // 排序缓存(2026-10-08 审查#8):update 每帧调用 ordered(),原实现每帧 slice+sort
  // (~40 系统 = 每帧两个数组一趟排序)。装配期终局后顺序不变,注册时置 null 惰性重建;
  // 调用方只读遍历,dispose 改倒序下标遍历(不再 .reverse() 原地改缓存)。
  let orderedCache = null;
  // 可重装配防护(2026-10-11 第 6 节):此前 init 二次调用会**静默**把全部系统再装配一遍
  // (两套 ticker/两套事件订阅/两套 DOM)。main.js 靠 preloadPromise 记忆化只装配一次,
  // 但探针与 HMR 二次 init 是真实路径 → 明确告警并拒绝,不再留"静默双份"这种最难查的形态。
  let initialized = false;
  let disposed = false;
  // 装配结论(M-01,2026-10-14)。此前"哪个系统 init 砸了"只有 console.warn 一处,main.js 把
  // init() 的返回值丢掉 ⇒ 外面读不出装了几个、少装了谁,而 initialized 已在循环前置真,
  // 一次失败后连"上次砸了哪几个"都无处可查。形状对齐 core/world-chain.mjs 的 M-13 契约
  // (ready|degraded|failed + 名单),两套装配闸门口径一致,探针只认一种形状。
  const assembly = { status: 'ready', loaded: [], failed: [], skipped: [] };
  let assembledOnce = false;
  // 生命周期状态(M-06 试点,2026-10-15)。此前"这个系统到底装配上了没有"没有读数,只有两条间接证据
  // (在不在 loaded 名单里、有没有 console.warn)——后果是包 A 记下的那条:①init 抛错 failed 的系统
  // ②init 之后才注册、从没 init 过的系统,两者都仍被 update(dt) 每帧调用,半装配态一边跑一边刷告警。
  // 状态存在 WeakMap 而不是系统对象上:19 个系统模块不必为此改一行,也不污染它们的可序列化状态。
  // 'uninit' 注册了还没装配 · 'ready' init 成功 · 'failed' init 抛过错(资源可能只建了一半)
  const lifecycle = new WeakMap();
  const stateOf = (s) => lifecycle.get(s) || 'uninit';
  const lifecycleRows = () => ordered().map((s) => ({ name: s.name, state: stateOf(s) }));
  const refreshStatus = () => {
    const bad = assembly.failed.length + assembly.skipped.length;
    assembly.status = bad === 0 ? 'ready' : assembly.loaded.length > 0 ? 'degraded' : 'failed';
  };
  // 出去的都是副本并冻住:调用方(探针/调试界面)改不动内部账
  const assemblySnapshot = () =>
    assembledOnce
      ? Object.freeze({
          status: assembly.status,
          loaded: assembly.loaded.slice(),
          failed: assembly.failed.map((f) => ({ ...f })),
          skipped: assembly.skipped.slice(),
          states: lifecycleRows(),
        })
      : null;
  const ordered = () => {
    if (!orderedCache) {
      // 每次重排保证"后注册的系统"也能落到正确位置(确定性不依赖注册顺序)
      orderedCache = systems.slice().sort(compareSystems);
    }
    return orderedCache;
  };

  return {
    register(system) {
      if (!system || typeof system.name !== 'string') {
        throw new Error('[composition-root] 注册了无名系统');
      }
      if (initialized) {
        // 已 init 后才注册的系统不会被装配(init 已过)——留痕,避免"注册了却从未运行"的静默故障
        console.warn('[composition-root] init 之后注册系统,它不会被装配:', system.name);
        // M-01:告警之外再记一笔账,否则这条"静默故障"只有开着控制台的人才看得见
        if (!assembly.skipped.includes(system.name)) assembly.skipped.push(system.name);
        refreshStatus();
      }
      systems.push(system);
      lifecycle.set(system, 'uninit');
      orderedCache = null;
      disposed = false; // 重新有内容可拆,不再是"已销毁"态
      return system;
    },
    // init 按层/相位正序(下层先建,上层依赖下层已就绪)。
    // 单个系统 init 抛错不阻断其余装配(有意:一个玩法模块炸了不该把整个世界带走),
    // 但结论如实标 degraded 并点名 —— "继续装后面的"从今往后是看得见的决定,不是静默。
    init() {
      if (initialized) {
        console.warn(
          '[composition-root] init 二次调用被拒绝(重复装配会产出两套系统)。要先 dispose()。'
        );
        return assemblySnapshot();
      }
      // 在循环前置真:装配期间的重入(某系统 init 里又调 init)必须被挡住,这层防护是有意为之。
      initialized = true;
      disposed = false;
      assembledOnce = true;
      assembly.loaded.length = 0;
      assembly.failed.length = 0;
      for (const s of ordered()) {
        try {
          s.init && s.init();
          lifecycle.set(s, 'ready');
          assembly.loaded.push(s.name);
        } catch (e) {
          lifecycle.set(s, 'failed');
          assembly.failed.push({ name: s.name, message: (e && e.message) || String(e) });
          console.warn('[composition-root] init 失败:', s.name, e.message);
        }
      }
      refreshStatus();
      return assemblySnapshot();
    },
    // 每帧按层/相位正序(输入→模拟→动画→渲染→UI,确定性)。
    // M-06:**只调 ready 的系统**。init 抛过错的(状态 failed)与 init 之后才注册的(状态 uninit)
    // 都没走完装配,让它们每帧被调就是"半装配态持续跑 + 每帧一条告警"——那正是包 A 记下、当时没动的一条。
    // 不跳过的代价是看得见却不动手;这里动手的前提是:**生产里没有任何系统在 init 之后注册**
    // (main.js 的顺序是先 loadWorldModules、再 register 全部、最后 init;19 个 defineSystem 全在这条链上)。
    update(dt) {
      for (const s of ordered()) {
        if (stateOf(s) !== 'ready') continue;
        try {
          s.update && s.update(dt);
        } catch (e) {
          console.warn('[composition-root] update 失败:', s.name, e.message);
        }
      }
    },
    // dispose 逆序(上层先拆,下层后拆);幂等:二次调用不再拆第二遍。
    // 只拆真正 init 过的:ready 正常拆,failed 尽力拆(它可能只建了一半资源,清理比不清理好),
    // uninit 不拆——它的 dispose 是按"init 已完成"写的,没 init 就拆反而可能造出新异常。
    dispose() {
      if (disposed && systems.length === 0) return;
      const arr = ordered();
      for (let i = arr.length - 1; i >= 0; i--) {
        const s = arr[i];
        const st = stateOf(s);
        if (st === 'uninit') continue;
        try {
          s.dispose && s.dispose();
        } catch (e) {
          console.warn('[composition-root] dispose 失败:', s.name, e.message);
        }
      }
      systems.length = 0;
      orderedCache = null;
      initialized = false; // 拆干净了 → 允许重新 init(可重装配)
      disposed = true;
      // 装配结论随之作废:拆完之后"上次装砸了谁"不再适用,skipped 也一样(再注册再 init 就会被装配)
      assembledOnce = false;
      assembly.status = 'ready';
      assembly.loaded.length = 0;
      assembly.failed.length = 0;
      assembly.skipped.length = 0;
    },
    // 是否已 dispose(供调用方判断要不要重装配;探针自检用)
    isDisposed() {
      return disposed && systems.length === 0;
    },
    // 是否已 init(二次 init 防护的读出口)
    isInitialized() {
      return initialized;
    },
    // 装配结论(M-01):{status, loaded[], failed[{name,message}], skipped[], states[]};从未 init 过 ⇒ null。
    // 与 core/world-chain.mjs 的 chainHealthy 同一套口径:只有 status==='ready' 才算真装配完。
    initStatus() {
      return assemblySnapshot();
    },
    // 单个系统此刻的生命周期(M-06):'uninit' | 'ready' | 'failed';没注册过 ⇒ null。
    // 探针/调试用它回答"这个系统到底跑不跑",不再靠翻控制台。
    systemState(name) {
      const s = systems.find((x) => x.name === name);
      return s ? stateOf(s) : null;
    },
    // 调试/可观测:打印当前确定性装配顺序
    list() {
      return ordered().map((s) => `${s.layer}:${s.phase}:${s.order}  ${s.name}`);
    },
    // 调试/探针:按 name 取系统实例(2026-10-03 为 verify-plane.cjs 补)。
    // 只读用途 —— 探针要读系统状态(如飞行物理 state)做断言,走 ctx 命名空间
    // 就得给每个系统都开一个 ctx 属性,那是给探针开的生产后门,不合适。
    get(name) {
      return systems.find((s) => s.name === name) || null;
    },
  };
}

// 全局单例组合根(供 main.js 在阶段2 前装配;阶段2 起由 DI 容器取代)
export const compositionRoot = createCompositionRoot();
