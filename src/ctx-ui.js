// ============================================================
// ctx.ui 命名空间模块
// 管理反馈与冷核心深模块
// 2026-08-22 架构优化
// ============================================================

import { eventBus } from './event-bus.js';

/**
 * 创建 UI 命名空间
 * @param {Object} vault - 共享存储对象
 * @returns {Object} UI 命名空间代理对象
 */
export function createUINamespace(vault) {
  const properties = ['modeToast', 'kunlunSpeak', 'overlay', 'store'];
  const proxy = {};
  
  for (const prop of properties) {
    Object.defineProperty(proxy, prop, {
      get() {
        return vault[prop];
      },
      set(newValue) {
        const oldValue = vault[prop];
        if (oldValue !== newValue) {
          vault[prop] = newValue;
          eventBus.emitPropertyChange('ui', prop, newValue, oldValue);
        }
      },
      enumerable: true,
      configurable: true,
    });
  }
  
  return Object.freeze(proxy);
}

/**
 * UI 命名空间事件定义
 */
export const UI_EVENTS = {
  // 模式提示
  MODE_TOAST: 'ui:modeToast',
  // 昆仑语音
  KUNLUN_SPEAK: 'ui:kunlunSpeak',
  // 弹层状态变化
  OVERLAY_CHANGED: 'ui:changed:overlay',
  // 存档状态变化
  STORE_CHANGED: 'ui:changed:store',
};
