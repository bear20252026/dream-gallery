// core/composition-root.js — 组合根(只做拼接,零业务逻辑,2026-08-27 起)
// 收集所有积木,按 (层 → 相位 → 次序) 确定性地 init/update/dispose。
// 每个积木只经此入口装配,绝不在 main.js 散点 import 副作用。
// 阶段2 起由 DI 容器取代本单例;此处仍作为装配的"唯一真相入口"。
import { eventBus } from './event-bus.js';
import { systemRank } from './system.js';

export function createCompositionRoot() {
  const systems = [];
  // 每次调用都重排,保证"后注册的系统"也能落到正确位置(确定性不依赖注册顺序)
  const ordered = () => systems.slice().sort((a, b) => systemRank(a) - systemRank(b));

  return {
    register(system) {
      if (!system || typeof system.name !== 'string') {
        throw new Error('[composition-root] 注册了无名系统');
      }
      systems.push(system);
      return system;
    },
    // init 按层/相位正序(下层先建,上层依赖下层已就绪)
    init() {
      for (const s of ordered()) {
        try {
          s.init && s.init();
        } catch (e) {
          console.warn('[composition-root] init 失败:', s.name, e.message);
        }
      }
    },
    // 每帧按层/相位正序(输入→模拟→动画→渲染→UI,确定性)
    update(dt) {
      for (const s of ordered()) {
        try {
          s.update && s.update(dt);
        } catch (e) {
          console.warn('[composition-root] update 失败:', s.name, e.message);
        }
      }
    },
    // dispose 逆序(上层先拆,下层后拆)
    dispose() {
      for (const s of ordered().reverse()) {
        try {
          s.dispose && s.dispose();
        } catch (e) {
          console.warn('[composition-root] dispose 失败:', s.name, e.message);
        }
      }
      systems.length = 0;
    },
    // 调试/可观测:打印当前确定性装配顺序
    list() {
      return ordered().map((s) => `${s.layer}:${s.phase}:${s.order}  ${s.name}`);
    },
  };
}

// 全局单例组合根(供 main.js 在阶段2 前装配;阶段2 起由 DI 容器取代)
export const compositionRoot = createCompositionRoot();
