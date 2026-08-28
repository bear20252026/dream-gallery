// ============================================================
// ctx.mode 命名空间模块
// 管理展示区模式（模式/名单/纹理门禁/链接系统）
// 2026-08-22 架构优化
// ============================================================

import { eventBus } from './event-bus.js';
import { getGameState } from './core/game-state.js';

/**
 * 创建模式命名空间
 * @param {Object} vault - 共享存储对象
 * @returns {Object} 模式命名空间代理对象
 */
export function createModeNamespace(vault) {
  const properties = [
    'siteMode',
    'demoPhotos',
    'myUploads',
    'myLinks',
    'customLinks',
    'myUploadTokens',
    'myCaptions',
    'applyPaintMode',
    'applyMode',
    'refreshMode',
    'texAllowed',
    'linkGuard',
    'spawnLinkModel',
    'trackClick',
    'LINK_MODEL_TYPES',
    'MOUNTABLE_ICONS',
    'openUpload',
  ];
  
  const proxy = {};
  
  const gs = getGameState();
  for (const prop of properties) {
    Object.defineProperty(proxy, prop, {
      get() {
        return vault[prop];
      },
      set(newValue) {
        // Stage 4 冻结:已绑运行期状态 prop 的直写也收归 gameState.set 单入口(legacy 直写不再绕过)。
        if (gs.isBound(prop)) {
          gs.set(prop, newValue);
          return;
        }
        const oldValue = vault[prop];
        if (oldValue !== newValue) {
          vault[prop] = newValue;
          eventBus.emitPropertyChange('mode', prop, newValue, oldValue);
        }
      },
      enumerable: true,
      configurable: true,
    });
  }
  
  return Object.freeze(proxy);
}

/**
 * 模式命名空间事件定义
 */
export const MODE_EVENTS = {
  // 展示模式变化
  SITE_MODE_CHANGED: 'mode:changed:siteMode',
  // 演示照片变化
  DEMO_PHOTOS_CHANGED: 'mode:changed:demoPhotos',
  // 我的上传变化
  MY_UPLOADS_CHANGED: 'mode:changed:myUploads',
  // 我的链接变化
  MY_LINKS_CHANGED: 'mode:changed:myLinks',
  // 自定义链接变化
  CUSTOM_LINKS_CHANGED: 'mode:changed:customLinks',
  // 上传令牌变化
  UPLOAD_TOKENS_CHANGED: 'mode:changed:myUploadTokens',
  // AI 配文变化
  CAPTIONS_CHANGED: 'mode:changed:myCaptions',
  // 纹理门禁变化
  TEX_ALLOWED_CHANGED: 'mode:changed:texAllowed',
  // 链接守卫变化
  LINK_GUARD_CHANGED: 'mode:changed:linkGuard',
  // 链接模型类型变化
  LINK_MODEL_TYPES_CHANGED: 'mode:changed:LINK_MODEL_TYPES',
  // 可挂载图标变化
  MOUNTABLE_ICONS_CHANGED: 'mode:changed:MOUNTABLE_ICONS',
};
