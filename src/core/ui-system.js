// core/ui-system.js — UI 域生命周期收口(阶段3 切片:platform/bootstrap)
// ctx.ui 命名空间(modeToast/kunlunSpeak/overlay/store)由各自模块在导入时写入,本身是服务引用,
// 无逐帧逻辑。本 System 的"收口"价值在于生命周期归属:
//   · overlay.js 的全局 Esc 监听必须在 main.js 最先 import 以保证栈优先级,故不能延迟到本 System.init;
//   · 但应用此前没有任何干净关闭全部弹层/移除全局 Esc 监听的出口——本 System.dispose 正式拥有该收口,
//     使 ui 域成为组合根可管理的生命周期单元(与 effects/audio/media/state 同一登记册)。
import { defineSystem } from './system.js';

export function createUiSystem(deps = {}) {
  const { ctx } = deps;
  if (!ctx || !ctx.ui) {
    throw new Error('[ui-system] 缺少 ctx.ui 依赖');
  }

  return defineSystem({
    name: 'ui',
    layer: 'platform',
    phase: 'bootstrap',
    order: 1,
    deps: { ctx },
    init() {
      // 服务在导入时已注入(overlay.js 最先 import);此处仅断言并持有引用,供 dispose 收口。
      if (!ctx.ui.overlay || typeof ctx.ui.overlay.destroy !== 'function') {
        console.warn('[ui-system] ctx.ui.overlay 未就绪(overlay.js 应最先 import)');
      }
    },
    update() {
      // UI 域无逐帧逻辑;状态变更走事件总线(已由 state-system 镜像进 game-state)
    },
    dispose() {
      // 应用卸载/HMR 收口:关闭全部弹层并移除全局 Esc 监听,避免泄漏。
      const overlay = ctx.ui && ctx.ui.overlay;
      if (overlay && typeof overlay.destroy === 'function') {
        try { overlay.destroy(); } catch (e) { console.warn('[ui-system] dispose 失败:', e.message); }
      }
    },
  });
}
