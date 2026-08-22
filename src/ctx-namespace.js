// ============================================================
// ctx 命名空间基础模块
// 提供命名空间管理和属性代理功能
// 2026-08-22 架构优化
// ============================================================

import { eventBus } from './event-bus.js';

/**
 * 创建命名空间代理
 * @param {string} namespace - 命名空间名称
 * @param {string[]} properties - 属性列表
 * @param {Object} vault - 共享存储对象
 * @returns {Object} 命名空间代理对象
 */
export function createNamespace(namespace, properties, vault) {
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
          // 触发属性变化事件
          eventBus.emitPropertyChange(namespace, prop, newValue, oldValue);
        }
      },
      enumerable: true,
      configurable: true,
    });
  }
  
  return Object.freeze(proxy);
}

/**
 * 创建向后兼容的扁平访问器
 * @param {string} name - 属性名
 * @param {Object} vault - 共享存储对象
 * @param {Object} ctx - 上下文对象
 * @param {Set} devWarned - 已警告集合（开发环境）
 * @param {boolean} DEV - 是否开发环境
 */
export function createFlatAccessor(name, vault, ctx, devWarned, DEV) {
  Object.defineProperty(ctx, name, {
    enumerable: true,
    configurable: true,
    get() {
      return vault[name];
    },
    set(v) {
      if (DEV && !devWarned.has(name)) {
        devWarned.add(name);
        console.warn(
          '[ctx软冻结] ctx.' +
            name +
            ' 扁平写已废弃,请改用命名空间(ctx.ui/kunlun/player/scene/media/gallery/mode)'
        );
      }
      const oldValue = vault[name];
      if (oldValue !== v) {
        vault[name] = v;
        // 从属性名推断命名空间并触发事件
        const namespace = inferNamespace(name);
        if (namespace) {
          eventBus.emitPropertyChange(namespace, name, v, oldValue);
        }
      }
    },
  });
}

/**
 * 根据属性名推断命名空间
 * @param {string} propertyName - 属性名
 * @returns {string|null} 命名空间名称
 */
function inferNamespace(propertyName) {
  // 这里可以根据属性名前缀或已知映射来推断
  // 简单实现：返回 null，让具体命名空间模块处理
  return null;
}

/**
 * 创建命名空间管理器
 * @param {Object} vault - 共享存储对象
 * @param {Object} ctx - 上下文对象
 * @returns {Object} 命名空间管理器
 */
export function createNamespaceManager(vault, ctx) {
  const devWarned = new Set();
  const DEV =
    typeof location !== 'undefined' &&
    (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || /ctxdebug/.test(location.search));

  return {
    /**
     * 注册命名空间
     * @param {string} namespace - 命名空间名称
     * @param {string[]} properties - 属性列表
     * @returns {Object} 命名空间代理对象
     */
    register(namespace, properties) {
      // 为每个属性创建扁平访问器
      for (const prop of properties) {
        createFlatAccessor(prop, vault, ctx, devWarned, DEV);
      }
      
      // 创建命名空间代理
      return createNamespace(namespace, properties, vault);
    },

    /**
     * 获取开发环境状态
     * @returns {boolean}
     */
    isDev() {
      return DEV;
    },

    /**
     * 获取已警告集合（调试用）
     * @returns {Set}
     */
    getDevWarned() {
      return devWarned;
    },
  };
}
