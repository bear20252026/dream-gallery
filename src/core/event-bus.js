// core/event-bus.js — 跨积木通信唯一入口(阶段1,2026-08-27)
// 确立 event-bus 为"积木间唯一通信方式"。旧 ctx.events 与 core 指向同一增强事件总线实现,
// 业务模块统一从 core 引入,杜绝再出现"事件总线已建但零订阅"。
import { eventBus } from '../event-bus.js';

// 单例访问器(供需要惰性取用的 facade / 积木使用,语义与直接 import eventBus 一致)
export function getEventBus() {
  return eventBus;
}

export { eventBus };
