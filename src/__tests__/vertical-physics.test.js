// 玩家垂直运动纯物理核回归测试(终审 TOP1):跳跃/重力/滑翔/能量/贴地
import { describe, it, expect } from 'vitest';
import { stepVertical, VERTICAL_PARAMS } from '../scene/player-physics.js';

const P = VERTICAL_PARAMS;
function mkState(over = {}) {
  return { y: 10, vy: 0, onGround: false, glideEnergy: 5, ...over };
}
const baseInput = { jumpPressed: false, jumpHold: false, pitch: 0, updraft: 0, gy: 1.6 };
const dt = 1 / 60;

describe('player-physics.stepVertical', () => {
  it('起跳:落地瞬间 jumpPressed 给 9.5 初速并离地', () => {
    const s = stepVertical(mkState({ onGround: true }), { ...baseInput, jumpPressed: true }, dt);
    // 原版语义:同帧先赋起跳初速再施加重力
    expect(s.vy).toBeCloseTo(P.JUMP_V - P.FULL_GRAVITY * dt, 5);
    expect(s.onGround).toBe(false);
  });

  it('空中排队的跳跃被丢弃(无跳跃缓冲)', () => {
    const s0 = mkState({ onGround: false, vy: -3 });
    const s = stepVertical(s0, { ...baseInput, jumpPressed: true }, dt);
    expect(s.vy).toBeLessThan(0); // 只受重力,没有起跳初速
  });

  it('常规重力 26/s:下落速度递减(更负)', () => {
    const s0 = mkState({ onGround: false, vy: -1 });
    const s = stepVertical(s0, baseInput, dt);
    expect(s.vy).toBeCloseTo(-1 - P.FULL_GRAVITY * dt, 5);
  });

  it('滑翔判定:空中按住跳跃+有余量 → gliding,重力 3.5,耗能 0.35/s', () => {
    const s = stepVertical(mkState({ vy: -2 }), { ...baseInput, jumpHold: true }, dt);
    expect(s.gliding).toBe(true);
    expect(s.vy).toBeCloseTo(-2 - P.GLIDE_GRAVITY * dt, 5);
    expect(s.glideEnergy).toBeCloseTo(5 - P.GLIDE_DRAIN * dt, 5);
  });

  it('能量耗尽:不再滑翔,回到全重力', () => {
    const s = stepVertical(mkState({ vy: -2, glideEnergy: 0 }), { ...baseInput, jumpHold: true }, dt);
    expect(s.gliding).toBe(false);
    expect(s.vy).toBeCloseTo(-2 - P.FULL_GRAVITY * dt, 5);
  });

  it('落地回能,封顶 GLIDE_MAX', () => {
    const s = stepVertical(mkState({ onGround: true, glideEnergy: 4.9 }), baseInput, dt);
    expect(s.gliding).toBe(false);
    expect(s.glideEnergy).toBeCloseTo(Math.min(P.GLIDE_MAX, 4.9 + P.GLIDE_REGEN * dt), 5);
  });

  it('滑翔限速:滑翔中 vy 越过 -12 被钳住(非滑翔不受此钳)', () => {
    const g = stepVertical(mkState({ vy: -11.99, glideEnergy: 5 }), { ...baseInput, jumpHold: true }, dt);
    expect(g.vy).toBe(P.VY_MIN);
    // 非滑翔:不受 -12 钳制(原版钳制只在滑翔分支内)
    const f = stepVertical(mkState({ vy: -11.99 }), baseInput, dt);
    expect(f.vy).toBeCloseTo(-11.99 - P.FULL_GRAVITY * dt, 5);
  });

  it('贴地吸附:y <= gy 时吸附地表,vy 清零,onGround=true', () => {
    const s = stepVertical(mkState({ y: 1.63, vy: -5 }), { ...baseInput, gy: 1.6 }, dt);
    expect(s.y).toBe(1.6);
    expect(s.vy).toBe(0);
    expect(s.onGround).toBe(true);
  });

  it('上升气流:滑翔中加 vy 并回充能量', () => {
    const s = stepVertical(mkState({ vy: -2 }), { ...baseInput, jumpHold: true, updraft: 4 }, dt);
    // 上升气流先于限速生效:vy = -2 - 3.5dt + 4dt,再钳制
    const expectVy = Math.max(P.VY_MIN, Math.min(P.VY_MAX, -2 - P.GLIDE_GRAVITY * dt + 4 * dt));
    expect(s.vy).toBeCloseTo(expectVy, 5);
    expect(s.glideEnergy).toBe(P.GLIDE_MAX); // Math.min(GLIDE_MAX, ...) 封顶
  });

  it('纯函数性:输入 state 不被原地修改', () => {
    const st0 = mkState({ y: 10, vy: -1 });
    stepVertical(st0, baseInput, dt);
    expect(st0).toEqual({ y: 10, vy: -1, onGround: false, glideEnergy: 5 });
  });
});
