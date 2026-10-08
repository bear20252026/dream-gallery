// core/composition-root.js — 组合根(只做拼接,零业务逻辑,2026-08-27 起)
// 收集所有积木,按 (层 → 相位 → 次序) 确定性地 init/update/dispose。
// 每个积木只经此入口装配,绝不在 main.js 散点 import 副作用。
// 阶段2 起由 DI 容器取代本单例;此处仍作为装配的"唯一真相入口"。
import { eventBus } from './event-bus.js';
import { systemRank } from './system.js';

export function createCompositionRoot() {
  const systems = [];
  // 排序缓存(2026-10-08 审查#8):update 每帧调用 ordered(),原实现每帧 slice+sort
  // (~40 系统 = 每帧两个数组一趟排序)。装配期终局后顺序不变,注册时置 null 惰性重建;
  // 调用方只读遍历,dispose 改倒序下标遍历(不再 .reverse() 原地改缓存)。
  let orderedCache = null;
  const ordered = () => {
    if (!orderedCache) {
      // 每次重排保证"后注册的系统"也能落到正确位置(确定性不依赖注册顺序)
      orderedCache = systems.slice().sort((a, b) => systemRank(a) - systemRank(b));
    }
    return orderedCache;
  };

  return {
    register(system) {
      if (!system || typeof system.name !== 'string') {
        throw new Error('[composition-root] 注册了无名系统');
      }
      systems.push(system);
      orderedCache = null;
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
      const arr = ordered();
      for (let i = arr.length - 1; i >= 0; i--) {
        const s = arr[i];
        try {
          s.dispose && s.dispose();
        } catch (e) {
          console.warn('[composition-root] dispose 失败:', s.name, e.message);
        }
      }
      systems.length = 0;
      orderedCache = null;
    },
    // 调试/可观测:打印当前确定性装配顺序
    list() {
      return ordered().map((s) => `${s.layer}:${s.phase}:${s.order}  ${s.name}`);
    },
    // 调试/探针:按 name 取系统实例(2026-10-03 为 verify-plane.cjs 补)。
    // 只读用途 —— 探针要读系统状态(如飞行物理 state)做断言,走 ctx 命名空间
    // 就得给每个系统都开一个 ctx 属性,那是给探针开的生产后门,不合适。
    get(name) {
      return systems.find((s) => s.name === name) || null;
    },
  };
}

// 全局单例组合根(供 main.js 在阶段2 前装配;阶段2 起由 DI 容器取代)
export const compositionRoot = createCompositionRoot();
