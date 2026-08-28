// core/state-system.js — 单向状态库(阶段3 store 真正化,bootstrap 相位)
// 现状:运行时状态散落在 ctx.<namespace>.<flag>(siteMode/quizPassed/viewMode/flightLock…),
// 命名空间 set 陷阱已在变更时经事件总线 emitPropertyChange 发出 `${ns}:changed:${prop}` 与 `${ns}:changed`。
// 本 System 把事件总线上的属性变更镜像进 game-state(单例,getGameState()),使 game-state 成为:
//   · 统一可读源 —— 系统用 gameState.get/snapshot 取代散点读 ctx;
//   · 统一可订阅源 —— 系统用 gameState.subscribe 取代散点 eventBus 监听(读模型/CQRS 投影)。
// 写者/读者零改动(命名空间 set/get 陷阱不动),故零回归风险。Stage 4 可进一步把写路径收归 gameState.set,关闭 ctx 直写。
import { defineSystem } from './system.js';

// 需要镜像的命名空间(与 ctx.js 中 allNamespaces 一致)
const NAMESPACES = ['mode', 'player', 'kunlun', 'scene', 'media', 'gallery', 'ui', 'ctx'];

export function createStateSystem(deps = {}) {
  const { eventBus, gameState, ctx } = deps;
  if (!eventBus) throw new Error('[state-system] 缺少 eventBus 依赖');
  if (!gameState) throw new Error('[state-system] 缺少 gameState 依赖');

  const unsubs = [];

  return defineSystem({
    name: 'state',
    layer: 'platform',
    phase: 'bootstrap',
    order: 0,
    deps: { eventBus, gameState },
    init() {
      // 订阅每个命名空间的 `${ns}:changed` 通类事件,把属性变更镜像进 game-state
      for (const ns of NAMESPACES) {
        unsubs.push(
          eventBus.on(`${ns}:changed`, (prop, newVal) => {
            try {
              gameState.set(prop, newVal);
            } catch (e) {
              console.warn('[state-system] mirror 失败:', ns, prop, e.message);
            }
          })
        );
      }
      // 种子:把当前命名空间初始值灌入 game-state,使 snapshot() 立即可用
      if (ctx) {
        const seeds = {
          siteMode: ctx.mode && ctx.mode.siteMode,
          viewMode: ctx.player && ctx.player.viewMode,
          quizPassed: ctx.player && ctx.player.quizPassed,
          flightLock: ctx.kunlun && ctx.kunlun.flightLock,
        };
        for (const k of Object.keys(seeds)) {
          if (seeds[k] !== undefined) gameState.set(k, seeds[k]);
        }
      }
      // 注意:命名空间运行期状态 prop 的 bindNamespace 注册已迁至 ctx.js 命名空间创建处(Stage 4 冻结,2026-08-29),
      // 早注册使导入期直写也经游戏状态单入口。此处仅保留读模型镜像订阅(${ns}:changed → gameState.set),
      // 与写路径 write-through 形成闭环;幂等守卫(gameState.set 内 state[key]===value 早返回)防回环。
    },
    update() {
      // 状态由事件驱动,无需逐帧轮询
    },
    dispose() {
      unsubs.forEach((u) => u());
      unsubs.length = 0;
    },
  });
}
