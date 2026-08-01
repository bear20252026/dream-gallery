// ============================================================
// 轻量事件总线 — 发布/订阅模式，解除模块间的直接耦合
// 新增功能只需 ctx.events.on('gallery:ready', myHandler)
// 不需要修改任何现有模块的代码
// 2026-08-01 架构优化
// ============================================================

const listeners = {};

export const events = {
  /**
   * 订阅事件
   * @param {string} event - 事件名，建议用 namespace:action 格式（如 'music:started'）
   * @param {Function} fn - 回调函数
   * @returns {Function} 取消订阅的函数
   */
  on(event, fn) {
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
    if (!listeners[event]) return;
    const fns = listeners[event].slice(); // 复制一份，防止回调中修改数组
    for (const fn of fns) {
      try {
        fn(...args);
      } catch (e) {
        console.warn('[events]', event, e.message);
      }
    }
  },
};
