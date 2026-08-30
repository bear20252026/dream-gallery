// 自由飞纯物理核回归测试(终审 TOP1):姿态积分/能量/边界/自动导航
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stepFlight, FLIGHT_PARAMS } from '../kunlun/freeflight-physics.js';

function mkState(over = {}) {
  return {
    pos: new THREE.Vector3(0, 100, 0),
    quat: new THREE.Quaternion(),
    vel: new THREE.Vector3(0, 0, 0),
    pitchRate: 0,
    rollRate: 0,
    energy: 100,
    autoNav: false,
    ...over,
  };
}
const flatInput = {
  pitchIn: 0,
  rollIn: 0,
  boostHold: false,
  boostKey: false,
  autoNavTarget: null,
  groundHeightAt: () => 0,
  centerX: 0,
  centerZ: 0,
};

describe('freeflight-physics.stepFlight', () => {
  it('静止松杆:速度向巡航值趋近,姿态不翻滚', () => {
    const s0 = mkState();
    let st = s0;
    for (let i = 0; i < 300; i++) st = stepFlight(st, flatInput, 1 / 60).state;
    // 30 秒(300 帧×0.1s?不,1/60×300=5s)后应巡航在 CRUISE 附近
    expect(st.vel.length()).toBeCloseTo(FLIGHT_PARAMS.CRUISE, 0);
    // 松杆自动改平:机头应保持朝 +z(俯仰/滚转趋近 0)
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(st.quat);
    expect(Math.abs(fwd.y)).toBeLessThan(0.2);
    expect(fwd.z).toBeGreaterThan(0.9);
  });

  it('冲刺耗能,松冲刺回能到 100 上限', () => {
    let st = mkState({ energy: 100 });
    for (let i = 0; i < 60; i++) st = stepFlight(st, { ...flatInput, boostHold: true }, 1 / 60).state;
    expect(st.energy).toBeLessThan(100);
    for (let i = 0; i < 600; i++) st = stepFlight(st, flatInput, 1 / 60).state;
    expect(st.energy).toBe(100);
  });

  it('撞地钳制:离地不低于 GROUND_CLEAR,vel.y 清零并降速,groundHit 标志', () => {
    const st0 = mkState({ pos: new THREE.Vector3(0, 1, 0), vel: new THREE.Vector3(0, -5, 10) });
    const { state: st, flags } = stepFlight(st0, flatInput, 0.016);
    expect(st.pos.y).toBeGreaterThanOrEqual(FLIGHT_PARAMS.GROUND_CLEAR);
    expect(st.vel.y).toBeGreaterThanOrEqual(0);
    expect(st.vel.length()).toBeLessThan(10);
    expect(flags.groundHit).toBe(true);
  });

  it('疆域钳制:超出 BOUND_R 拉回圆周,boundaryHit 标志', () => {
    const st0 = mkState({ pos: new THREE.Vector3(FLIGHT_PARAMS.BOUND_R + 100, 100, 0) });
    const { state: st, flags } = stepFlight(st0, flatInput, 0.016);
    const r = Math.hypot(st.pos.x - 0, st.pos.z - 0);
    expect(r).toBeCloseTo(FLIGHT_PARAMS.BOUND_R, 1);
    expect(flags.boundaryHit).toBe(true);
  });

  it('天顶钳制:y 不超过 YMAX', () => {
    const st0 = mkState({ pos: new THREE.Vector3(0, FLIGHT_PARAMS.YMAX + 50, 0), vel: new THREE.Vector3(0, 10, 0) });
    const { state: st } = stepFlight(st0, flatInput, 0.016);
    expect(st.pos.y).toBe(FLIGHT_PARAMS.YMAX);
  });

  it('自动导航:距泊位 10m 内返回 dock 标志', () => {
    const st0 = mkState({ pos: new THREE.Vector3(0, 100, 0), autoNav: true });
    const target = new THREE.Vector3(0, 100, 5); // 距离 5 < 10
    const { flags } = stepFlight(st0, { ...flatInput, autoNavTarget: target }, 0.016);
    expect(flags.dock).toBe(true);
  });

  it('俯仰限幅:机头已仰到 P_LIM 以上时,继续拉杆不再抬头', () => {
    // 构造一个已抬到约 70° 的姿态(P_LIM=60°)
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.25);
    const st0 = mkState({ pos: new THREE.Vector3(0, 400, 0), quat: q, vel: new THREE.Vector3(0, 0, 24) });
    const fwd0 = new THREE.Vector3(0, 0, 1).applyQuaternion(st0.quat);
    let st = st0;
    for (let i = 0; i < 30; i++) st = stepFlight(st, { ...flatInput, pitchIn: 1 }, 1 / 60).state;
    const fwd1 = new THREE.Vector3(0, 0, 1).applyQuaternion(st.quat);
    // 仰角不应继续增大
    expect(fwd1.y).toBeLessThanOrEqual(fwd0.y + 1e-6);
  });

  it('纯函数性:输入 state 不被原地修改', () => {
    const st0 = mkState({ pos: new THREE.Vector3(1, 2, 3) });
    const posClone = st0.pos.clone();
    stepFlight(st0, flatInput, 0.016);
    expect(st0.pos.equals(posClone)).toBe(true);
  });
});
