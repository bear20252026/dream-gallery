// ============================================================
// ctx.gallery 命名空间模块
// 管理挂画与房屋
// 2026-08-22 架构优化
// ============================================================

import { eventBus } from './event-bus.js';

/**
 * 创建画廊命名空间
 * @param {Object} vault - 共享存储对象
 * @returns {Object} 画廊命名空间代理对象
 */
export function createGalleryNamespace(vault) {
  const properties = [
    'paintGroups',
    'onC3D',
    'zoomOut',
    'zG',
    'hangOne',
    'houseMats',
    'openHouseColor',
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
          eventBus.emitPropertyChange('gallery', prop, newValue, oldValue);
        }
      },
      enumerable: true,
      configurable: true,
    });
  }
  
  return Object.freeze(proxy);
}

/**
 * 画廊命名空间事件定义
 */
export const GALLERY_EVENTS = {
  // 画框组变化
  PAINT_GROUPS_CHANGED: 'gallery:changed:paintGroups',
  // 3D 点击处理变化
  ON_C3D_CHANGED: 'gallery:changed:onC3D',
  // 画框缩回复位变化
  ZOOM_OUT_CHANGED: 'gallery:changed:zoomOut',
  // 当前放大的画框变化
  ZG_CHANGED: 'gallery:changed:zG',
  // 挂画函数变化
  HANG_ONE_CHANGED: 'gallery:changed:hangOne',
  // 房屋材质变化
  HOUSE_MATS_CHANGED: 'gallery:changed:houseMats',
  // 换色面板入口变化
  OPEN_HOUSE_COLOR_CHANGED: 'gallery:changed:openHouseColor',
};
