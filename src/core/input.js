// core/input.js — 统一输入 facade(阶段1·P1-3 防腐层,2026-08-28)
//
// 设计立场(与阶段3 划界):
// - 本 facade 包裹既有 InputManager(ctx.input,它拥有全部 document 监听),作为「新积木唯一输入源」。
// - 新积木经 deps.input 注入,绝不直接 document.addEventListener 或读 ctx.input 全局。
// - 每帧 update() 把语义输入镜像到事件总线(input:axis / input:pointer),供订阅式积木使用,
//   从而逐步替代各模块各自挂监听的「输入双线」(scene/player.js 的 ks 并行键状态属阶段3 最后迁移)。
// - 本文件不新增任何 DOM 监听,不修改既有输入行为 —— 纯防腐转发。
import { getEventBus } from './event-bus.js';

/**
 * 创建统一输入 facade。
 * @param {object} input 既有 InputManager 实例(通常传 ctx.input)
 */
export function createInputSystem(input) {
  const bus = getEventBus();

  // 移动轴(WASD/方向键 → 已绑定动作)
  function axis() {
    let x = 0,
      y = 0;
    if (input.isDown('left')) x -= 1;
    if (input.isDown('right')) x += 1;
    if (input.isDown('forward')) y += 1;
    if (input.isDown('back')) y -= 1;
    return { x, y };
  }

  function pointer() {
    return input.pointer;
  }

  function isDown(action) {
    return input.isDown(action);
  }

  function isKeyDown(key) {
    return input.isKeyDown(key);
  }

  // 注册每帧动作回调(转交 InputManager,保持既有语义)
  function on(action, fn) {
    return input.on(action, fn);
  }

  let _prevAxis = { x: 0, y: 0 };

  // 每帧由组合根驱动:把语义输入镜像到事件总线。仅在有变化时广播,避免轰总线。
  function update() {
    const a = axis();
    if (a.x !== _prevAxis.x || a.y !== _prevAxis.y) {
      bus.emit('input:axis', a);
      _prevAxis = a;
    }
    const p = input.pointer;
    if (p.dx || p.dy) {
      bus.emit('input:pointer', { dx: p.dx, dy: p.dy, x: p.x, y: p.y, down: p.down });
    }
  }

  return {
    name: 'input',
    layer: 'platform',
    phase: 'input',
    order: 0,
    axis,
    pointer,
    isDown,
    isKeyDown,
    on,
    update,
    get impl() {
      return input;
    },
  };
}
