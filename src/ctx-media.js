// ============================================================
// ctx.media 命名空间模块
// 管理媒体与户外（视频/音频/沙漠/特效）
// 2026-08-22 架构优化
// ============================================================

import { eventBus } from './event-bus.js';

/**
 * 创建媒体命名空间
 * @param {Object} vault - 共享存储对象
 * @returns {Object} 媒体命名空间代理对象
 */
export function createMediaNamespace(vault) {
  const properties = [
    'vidEl',
    'v45El',
    'vidTex',
    'v45Tex',
    'vidMesh',
    'v45Mesh',
    'drawMusicCanvas',
    'bigScreenHold',
    'desert',
    'dayHour',
    'dayTimeSource',
    'updateFireworks',
    'pG',
    'pC',
    'signMesh',
    'signMat',
    'mpMesh',
    'mpMat',
    'guideMesh',
    'ytHeart',
    'scrollLink',
    'mA',
    'audioManager',
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
          eventBus.emitPropertyChange('media', prop, newValue, oldValue);
        }
      },
      enumerable: true,
      configurable: true,
    });
  }

  return Object.freeze(proxy);
}

/**
 * 媒体命名空间事件定义
 */
export const MEDIA_EVENTS = {
  // 视频元素变化
  VIDEO_ELEMENT_CHANGED: 'media:changed:vidEl',
  // 4·5号视频元素变化
  V45_ELEMENT_CHANGED: 'media:changed:v45El',
  // 视频纹理变化
  VIDEO_TEXTURE_CHANGED: 'media:changed:vidTex',
  // 4·5号视频纹理变化
  V45_TEXTURE_CHANGED: 'media:changed:v45Tex',
  // 视频墙网格变化
  VIDEO_MESH_CHANGED: 'media:changed:vidMesh',
  // 4·5号视频墙网格变化
  V45_MESH_CHANGED: 'media:changed:v45Mesh',
  // 音乐画布绘制函数变化
  MUSIC_CANVAS_CHANGED: 'media:changed:drawMusicCanvas',
  // 大屏轮播闸口变化
  BIG_SCREEN_HOLD_CHANGED: 'media:changed:bigScreenHold',
  // 沙漠地形变化
  DESERT_CHANGED: 'media:changed:desert',
  // 昼夜时刻变化
  DAY_HOUR_CHANGED: 'media:changed:dayHour',
  // 烟花更新函数变化
  FIREWORKS_CHANGED: 'media:changed:updateFireworks',
  // 漂浮粒子变化
  PARTICLES_CHANGED: 'media:changed:pG',
  // 音频管理器变化
  AUDIO_MANAGER_CHANGED: 'media:changed:audioManager',
};
