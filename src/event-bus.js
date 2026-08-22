// ============================================================
// 增强事件总线 — 支持命名空间和属性变化事件
// 替代直接属性读写，减少模块间耦合
// 2026-08-22 架构优化
// ============================================================

const listeners = {};
const wildcardListeners = {};

export const eventBus = {
  /**
   * 订阅事件
   * @param {string} event - 事件名，建议用 namespace:action 格式（如 'music:started'）
   * @param {Function} fn - 回调函数
   * @returns {Function} 取消订阅的函数
   */
  on(event, fn) {
    if (event.endsWith(':*')) {
      // 通配符订阅：namespace:* 匹配该命名空间下所有事件
      const namespace = event.slice(0, -2);
      if (!wildcardListeners[namespace]) wildcardListeners[namespace] = [];
      wildcardListeners[namespace].push(fn);
      return () => this.off(event, fn);
    }
    
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
    return () => this.off(event, fn);
  },

  /**
   * 订阅一次性事件
   * @param {string} event
   * @param {Function} fn
   */
  once(event, fn) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      fn(...args);
    };
    return this.on(event, wrapper);
  },

  /**
   * 取消订阅
   * @param {string} event
   * @param {Function} fn - 不传则取消该事件全部订阅
   */
  off(event, fn) {
    if (event.endsWith(':*')) {
      const namespace = event.slice(0, -2);
      if (!wildcardListeners[namespace]) return;
      if (fn) {
        wildcardListeners[namespace] = wildcardListeners[namespace].filter((f) => f !== fn);
      } else {
        delete wildcardListeners[namespace];
      }
      return;
    }
    
    if (!listeners[event]) return;
    if (fn) {
      listeners[event] = listeners[event].filter((f) => f !== fn);
    } else {
      delete listeners[event];
    }
  },

  /**
   * 触发事件
   * @param {string} event
   * @param {...*} args - 传递给回调的参数
   */
  emit(event, ...args) {
    // 触发精确匹配的监听器
    if (listeners[event]) {
      const fns = listeners[event].slice(); // 复制一份，防止回调中修改数组
      for (const fn of fns) {
        try {
          fn(...args);
        } catch (e) {
          console.warn('[eventBus]', event, e.message);
        }
      }
    }
    
    // 触发通配符监听器
    const colonIndex = event.indexOf(':');
    if (colonIndex > 0) {
      const namespace = event.substring(0, colonIndex);
      if (wildcardListeners[namespace]) {
        const fns = wildcardListeners[namespace].slice();
        for (const fn of fns) {
          try {
            fn(event, ...args);
          } catch (e) {
            console.warn('[eventBus]', event, e.message);
          }
        }
      }
    }
  },

  /**
   * 订阅属性变化事件
   * @param {string} namespace - 命名空间（如 'scene', 'player'）
   * @param {string} property - 属性名
   * @param {Function} fn - 回调函数，参数为 (newValue, oldValue)
   * @returns {Function} 取消订阅的函数
   */
  onPropertyChange(namespace, property, fn) {
    const event = `${namespace}:changed:${property}`;
    return this.on(event, fn);
  },

  /**
   * 触发属性变化事件
   * @param {string} namespace - 命名空间
   * @param {string} property - 属性名
   * @param {*} newValue - 新值
   * @param {*} oldValue - 旧值
   */
  emitPropertyChange(namespace, property, newValue, oldValue) {
    const event = `${namespace}:changed:${property}`;
    this.emit(event, newValue, oldValue);
    // 同时触发命名空间级别的变化事件
    this.emit(`${namespace}:changed`, property, newValue, oldValue);
  },

  /**
   * 创建属性代理，自动触发变化事件
   * @param {string} namespace - 命名空间
   * @param {Object} target - 目标对象
   * @param {string[]} properties - 需要代理的属性列表
   * @returns {Object} 代理对象
   */
  createPropertyProxy(namespace, target, properties) {
    const proxy = {};
    for (const prop of properties) {
      Object.defineProperty(proxy, prop, {
        get() {
          return target[prop];
        },
        set(newValue) {
          const oldValue = target[prop];
          if (oldValue !== newValue) {
            target[prop] = newValue;
            eventBus.emitPropertyChange(namespace, prop, newValue, oldValue);
          }
        },
        enumerable: true,
        configurable: true,
      });
    }
    return proxy;
  },

  /**
   * 获取所有事件名称（调试用）
   * @returns {string[]}
   */
  getEventNames() {
    return [
      ...Object.keys(listeners),
      ...Object.entries(wildcardListeners).map(([ns, fns]) => `${ns}:* (${fns.length} listeners)`),
    ];
  },

  /**
   * 清除所有监听器（测试用）
   */
  clear() {
    for (const key of Object.keys(listeners)) {
      delete listeners[key];
    }
    for (const key of Object.keys(wildcardListeners)) {
      delete wildcardListeners[key];
    }
  },
};
