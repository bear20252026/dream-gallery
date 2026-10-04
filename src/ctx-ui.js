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
  // storyTarget(2026-09-30):剧情罗盘目标注册位(ui/story-compass.js 挂载后写入)
  const properties = [
    'modeToast',
    'kunlunSpeak',
    'overlay',
    'store',
    'openDialog',
    'dialogOpen',
    'showGuideCard',
    'stopAgreementMusic',
    'storyTarget',
    'journey',
    'cancelDialogScope',
    'advanceDialog',
    // 2026-10-03:作品集(ui/portfolio.js)与章节地图(ui/chapter-map.js)的打开入口
    'portfolio',
    'chapterMap',
    'witness', // witness cards for 325/326/327 (ui/witness-card.js)
    'storyMusic',
    // 2026-10-04:旅途卡(ui/voyage.js),每段回忆结束后接下一站
    'voyage',
    // 2026-10-04:星图(ui/star-map.js)
    'starMap',
  ];
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
