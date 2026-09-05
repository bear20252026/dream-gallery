// ============================================================
// ctx.kunlun 命名空间模块
// 管理昆仑神话层（天穹/灵蕴/永恒展厅/飞舟）
// 2026-08-22 架构优化
// ============================================================

import { eventBus } from './event-bus.js';
import { getGameState } from './core/game-state.js';

/**
 * 创建昆仑命名空间
 * @param {Object} vault - 共享存储对象
 * @returns {Object} 昆仑命名空间代理对象
 */
export function createKunlunNamespace(vault) {
  const properties = [
    'flightLock',
    'eternalHandlers',
    'eternalClick',
    'eternalTeleport',
    'eternalWelcome',
    'eternalKeepOut',
    'groundOverride',
    'arkTeleportToPeak',
    'letgoRecall',
    'peakVidEl',
    'flyAudio',
    'spiritsGot',
    'isDone',
    'spiritMark',
    'spiritsTTS',
    'spiritsState',
    'spiritsCollectExternal', // planets.js 星球岛星屑拾取入口(2026-09-05)
    'spiritsNextKey', // 当前未收集星屑 key
    'planetsMode', // B612 星球章节模式(spirits 沙漠系统休眠开关)
    'planetsMark', // 星门/当前岛小地图标记
    'checkSkyMs',
    'fadeTeleport',
    'rebuildEternalPicks',
  ];

  const proxy = {};
  const gs = getGameState();

  for (const prop of properties) {
    Object.defineProperty(proxy, prop, {
      get() {
        return vault[prop];
      },
      set(newValue) {
        // Stage 4 冻结:已绑运行期状态 prop(flightLock)的直写收归 gameState.set 单入口。
        if (gs.isBound(prop)) {
          gs.set(prop, newValue);
          return;
        }
        const oldValue = vault[prop];
        if (oldValue !== newValue) {
          vault[prop] = newValue;
          eventBus.emitPropertyChange('kunlun', prop, newValue, oldValue);
        }
      },
      enumerable: true,
      configurable: true,
    });
  }

  return Object.freeze(proxy);
}

/**
 * 昆仑命名空间事件定义
 */
export const KUNLUN_EVENTS = {
  // 飞行锁状态变化
  FLIGHT_LOCK_CHANGED: 'kunlun:changed:flightLock',
  // 灵蕴收集数变化
  SPIRITS_GOT_CHANGED: 'kunlun:changed:spiritsGot',
  // 灵蕴完成状态变化
  IS_DONE_CHANGED: 'kunlun:changed:isDone',
  // 永恒展厅处理器变化
  ETERNAL_HANDLERS_CHANGED: 'kunlun:changed:eternalHandlers',
  // 飞舟传送点变化
  ARK_TELEPORT_CHANGED: 'kunlun:changed:arkTeleportToPeak',
  // 飞行音效变化
  FLY_AUDIO_CHANGED: 'kunlun:changed:flyAudio',
  // 灵蕴文案变化
  SPIRITS_TTS_CHANGED: 'kunlun:changed:spiritsTTS',
  // 灵蕴状态表变化
  SPIRITS_STATE_CHANGED: 'kunlun:changed:spiritsState',
  // 天穹里程碑检测变化
  CHECK_SKY_MS_CHANGED: 'kunlun:changed:checkSkyMs',
  // 传送过渡遮罩变化
  FADE_TELEPORT_CHANGED: 'kunlun:changed:fadeTeleport',
};
