// ============================================================
// 玩家空闲状态 — 站在地上不动
// 2026-08-01
// ============================================================

import { PlayerState } from '../StateMachine.js';
import { ctx } from '../../ctx.js';

export class IdleState extends PlayerState {
  constructor() {
    super('idle');
  }

  enter() {
    ctx.player.pl.gliding = false;
  }

  update(dt) {
    const pl = ctx.player.pl;
    const jD = ctx.player.jD;
    const ks = ctx.player.ks;

    // 检测输入 → 行走
    // 2026-08-30 修复:原 W/S 权重写成 (ks.w ? 0 : 0) 恒为 0 —— 按前/后走时
    // 状态机判定"无输入"停留 idle,走路动画不播(loop-manager 却照常位移)。
    // 轴定义与 loop-manager 对齐:mx=横移(A/D),mz=前后(W/S,摇杆 z 向前为正)。
    const mx = jD.x + (ks.d || ks.arrowright ? 1 : 0) - (ks.a || ks.arrowleft ? 1 : 0);
    const mz = -jD.z + (ks.w || ks.arrowup ? 1 : 0) - (ks.s || ks.arrowdown ? 1 : 0);
    if (Math.abs(mx) > 0.05 || Math.abs(mz) > 0.05) {
      return new WalkingState();
    }

    // 不在地面 → 滞空
    if (!pl.onGround) {
      return new AirborneState();
    }

    return null; // 保持空闲
  }
}

export class WalkingState extends PlayerState {
  constructor() {
    super('walking');
  }

  enter() {
    ctx.player.pl.gliding = false;
  }

  update(dt) {
    const pl = ctx.player.pl;
    const jD = ctx.player.jD;
    const ks = ctx.player.ks;

    // 滑翔判定
    if (!pl.onGround && pl.glideEnergy > 0) {
      return new GlidingState();
    }

    // 离开地面
    if (!pl.onGround) {
      return new AirborneState();
    }

    // 检测输入持续 → 继续行走(轴定义与 loop-manager 对齐,同 IdleState 修复)
    const mx = jD.x + (ks.d || ks.arrowright ? 1 : 0) - (ks.a || ks.arrowleft ? 1 : 0);
    const mz = -jD.z + (ks.w || ks.arrowup ? 1 : 0) - (ks.s || ks.arrowdown ? 1 : 0);
    if (Math.abs(mx) < 0.05 && Math.abs(mz) < 0.05) {
      return new IdleState();
    }

    return null;
  }
}

export class AirborneState extends PlayerState {
  constructor() {
    super('airborne');
  }

  enter() {
    ctx.player.pl.gliding = false;
  }

  update(dt) {
    const pl = ctx.player.pl;

    // 落地 → 行走
    if (pl.onGround) {
      return new WalkingState();
    }

    // 滑翔判断
    if (pl.glideEnergy > 0) {
      // 检测跳跃键是否按住
      if (ctx._jumpHold) {
        return new GlidingState();
      }
    }

    return null;
  }
}

export class GlidingState extends PlayerState {
  constructor() {
    super('gliding');
  }

  enter() {
    ctx.player.pl.gliding = true;
  }

  update(dt) {
    const pl = ctx.player.pl;

    // 落地
    if (pl.onGround) {
      pl.gliding = false;
      return new WalkingState();
    }

    // 能量耗尽
    if (pl.glideEnergy <= 0) {
      pl.gliding = false;
      return new AirborneState();
    }

    // 松开跳跃键
    if (!ctx._jumpHold) {
      pl.gliding = false;
      return new AirborneState();
    }

    return null; // 继续滑翔
  }
}
