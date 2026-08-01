// ============================================================
// 玩家移动状态机 — 基于层次状态机模式
// 状态对象只写自己的逻辑，通用行为（碰撞、地面检测）由父状态继承
// 2026-08-01 架构重构
// ============================================================

/**
 * 状态基类。每个具体状态继承它，重写 enter/update/exit。
 * 状态通过 ctx.player 访问玩家数据（pl, jD, ks 等）。
 */
export class PlayerState {
  /**
   * @param {string} name - 状态名（调试用）
   */
  constructor(name) {
    this.name = name;
  }

  /** 进入状态 */
  enter() {}

  /**
   * 每帧更新。返回下一个状态（如果要切换），或 undefined/null 保持当前。
   * @param {number} dt - 帧间隔秒数
   * @returns {PlayerState|undefined|null}
   */
  update(dt) {
    return null;
  }

  /** 离开状态 */
  exit() {}
}

/**
 * 状态机引擎。持有当前状态，驱动 enter→update→exit 循环。
 */
export class StateMachine {
  constructor() {
    this.current = null;
  }

  /**
   * 切换到新状态（自动调旧状态的 exit 和新状态的 enter）
   * @param {PlayerState} state
   */
  change(state) {
    if (this.current && this.current !== state) {
      this.current.exit();
    }
    this.current = state;
    state.enter();
  }

  /** 每帧更新 */
  tick(dt) {
    if (!this.current) return;
    const next = this.current.update(dt);
    if (next && next !== this.current) {
      this.change(next);
    }
  }
}
