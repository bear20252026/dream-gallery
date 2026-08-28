// ============================================================
// ctx.player 命名空间模块
// 管理玩家与门禁状态
// 2026-08-22 架构优化
// ============================================================

import { eventBus } from './event-bus.js';
import { getGameState } from './core/game-state.js';

/**
 * 创建玩家命名空间
 * @param {Object} vault - 共享存储对象
 * @returns {Object} 玩家命名空间代理对象
 */
export function createPlayerNamespace(vault) {
  const properties = ['pl', 'jD', 'ks', 'mv', 'drM', 'viewMode', 'quizPassed', 'quizPassScore'];
  const proxy = {};
  const gs = getGameState();

  for (const prop of properties) {
    Object.defineProperty(proxy, prop, {
      get() {
        return vault[prop];
      },
      set(newValue) {
        // Stage 4 冻结:已绑运行期状态 prop(viewMode/quizPassed)的直写收归 gameState.set 单入口。
        if (gs.isBound(prop)) {
          gs.set(prop, newValue);
          return;
        }
        const oldValue = vault[prop];
        if (oldValue !== newValue) {
          vault[prop] = newValue;
          eventBus.emitPropertyChange('player', prop, newValue, oldValue);
        }
      },
      enumerable: true,
      configurable: true,
    });
  }
  
  return Object.freeze(proxy);
}

/**
 * 玩家命名空间事件定义
 */
export const PLAYER_EVENTS = {
  // 玩家状态变化
  PLAYER_STATE_CHANGED: 'player:changed:pl',
  // 摇杆输入变化
  JOYSTICK_CHANGED: 'player:changed:jD',
  // 键盘状态变化
  KEYBOARD_CHANGED: 'player:changed:ks',
  // 视角模式变化
  VIEW_MODE_CHANGED: 'player:changed:viewMode',
  // 答题通过状态变化
  QUIZ_PASSED_CHANGED: 'player:changed:quizPassed',
  // 分数线变化
  QUIZ_PASS_SCORE_CHANGED: 'player:changed:quizPassScore',
};
