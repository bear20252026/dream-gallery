// ============================================================
// ctx.scene 命名空间模块
// 管理场景内核（场景/相机/渲染器/拾取/边界/灯光）
// 2026-08-22 架构优化
// ============================================================

import { eventBus } from './event-bus.js';

/**
 * 创建场景命名空间
 * @param {Object} vault - 共享存储对象
 * @returns {Object} 场景命名空间代理对象
 */
export function createSceneNamespace(vault) {
  const properties = [
    's',
    'cam',
    'rnd',
    'ray',
    'mP2',
    'iG',
    'tL',
    'loadTexCapped',
    'bounds',
    'WH',
    'OL',
    'OR',
    'OT',
    'OBE',
    'OBR',
    'IL',
    'IR',
    'IRT',
    'IRB',
    'floorW',
    'floorD',
    'bW',
    'bD',
    'pyrHeight',
    'groundUniforms',
    'skyUniforms',
    'pls',
    'ambL',
    'hemiL',
    'L',
    'jT',
    'jB',
    'aB',
    'avatar',
    'kintsugiOn',
    'renderPostProcessing',
    'resizePostProcessing',
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
          eventBus.emitPropertyChange('scene', prop, newValue, oldValue);
        }
      },
      enumerable: true,
      configurable: true,
    });
  }
  
  return Object.freeze(proxy);
}

/**
 * 场景命名空间事件定义
 */
export const SCENE_EVENTS = {
  // 场景变化
  SCENE_CHANGED: 'scene:changed:s',
  // 相机变化
  CAMERA_CHANGED: 'scene:changed:cam',
  // 渲染器变化
  RENDERER_CHANGED: 'scene:changed:rnd',
  // 射线拾取器变化
  RAYCASTER_CHANGED: 'scene:changed:ray',
  // 鼠标位置变化
  MOUSE_POSITION_CHANGED: 'scene:changed:mP2',
  // 可交互对象变化
  INTERACTIVE_OBJECTS_CHANGED: 'scene:changed:iG',
  // 纹理加载器变化
  TEXTURE_LOADER_CHANGED: 'scene:changed:tL',
  // 边界变化
  BOUNDS_CHANGED: 'scene:changed:bounds',
  // 墙高变化
  WALL_HEIGHT_CHANGED: 'scene:changed:WH',
  // 灯光变化
  LIGHTS_CHANGED: 'scene:changed:pls',
  // 环境光变化
  AMBIENT_LIGHT_CHANGED: 'scene:changed:ambL',
  // 半球光变化
  HEMISPHERE_LIGHT_CHANGED: 'scene:changed:hemiL',
  // 加载遮罩变化
  LOADING_OVERLAY_CHANGED: 'scene:changed:L',
};
