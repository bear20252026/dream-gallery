// resource-manager.js — 资源生命周期管理(2026-08-22 大厂标准)
// 引用计数 + 自动 dispose,防止 WebGL 内存泄漏
// 用法: import { resourceManager } from './shared/resource-manager.js'

/**
 * 资源管理器。按 key 管理 Three.js 资源的引用计数。
 * 引用归零时自动 dispose(纹理/材质/几何体)。
 */
class ResourceManager {
  constructor() {
    /** @type {Map<string, {resource: Object, refCount: number, type: string}>} */
    this._pool = new Map();
  }

  /**
   * 获取或创建资源(引用计数 +1)
   * @param {string} key - 唯一标识
   * @param {Function} factory - 创建函数,返回 Three.js 资源
   * @param {string} [type='unknown'] - 资源类型(texture/material/geometry)
   * @returns {Object} 资源实例
   */
  acquire(key, factory, type = 'unknown') {
    const entry = this._pool.get(key);
    if (entry) {
      entry.refCount++;
      return entry.resource;
    }
    const resource = factory();
    this._pool.set(key, { resource, refCount: 1, type });
    return resource;
  }

  /**
   * 释放资源(引用计数 -1)
   * @param {string} key
   */
  release(key) {
    const entry = this._pool.get(key);
    if (!entry) return;
    entry.refCount--;
    if (entry.refCount <= 0) {
      this._dispose(key, entry);
    }
  }

  /**
   * 强制释放资源(不管引用计数)
   * @param {string} key
   */
  forceRelease(key) {
    const entry = this._pool.get(key);
    if (!entry) return;
    this._dispose(key, entry);
  }

  _dispose(key, entry) {
    const r = entry.resource;
    try {
      if (r && typeof r.dispose === 'function') {
        r.dispose();
      }
    } catch (e) {
      console.warn('[ResourceManager] dispose 失败:', key, e.message);
    }
    this._pool.delete(key);
  }

  /**
   * 释放所有资源
   */
  disposeAll() {
    for (const [key, entry] of this._pool) {
      this._dispose(key, entry);
    }
  }

  /**
   * 获取资源统计
   * @returns {{total: number, byType: Object<string, number>}}
   */
  stats() {
    const byType = {};
    for (const [, entry] of this._pool) {
      byType[entry.type] = (byType[entry.type] || 0) + 1;
    }
    return { total: this._pool.size, byType };
  }
}

/** 全局资源管理器单例 */
export const resourceManager = new ResourceManager();

/**
 * 清理 Three.js 对象的深度 dispose(遍历子树)
 * @param {THREE.Object3D} obj
 */
export function deepDispose(obj) {
  if (!obj) return;
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => disposeMaterial(m));
      } else {
        disposeMaterial(child.material);
      }
    }
  });
}

function disposeMaterial(mat) {
  if (!mat) return;
  // 释放纹理
  for (const key of Object.keys(mat)) {
    const value = mat[key];
    if (value && typeof value.dispose === 'function') {
      value.dispose();
    }
  }
  mat.dispose();
}
