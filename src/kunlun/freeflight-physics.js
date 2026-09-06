// kunlun/freeflight-physics.js — 自由飞纯物理核(2026-08-30 终审 TOP1:姿态积分可单测化)
// 从 ark.js freeTick 抽出的单步积分:输入状态+输入,返回新状态+事件标志。
// 纯函数:不触碰 DOM/场景/ctx,便于 vitest 回归测试姿态积分数学。
import * as THREE from 'three';

/** 飞行参数(与原 freeTick 逐字一致) */
export const FLIGHT_PARAMS = {
  CRUISE: 24, // 巡航速度 m/s
  YMAX: 480, // 天顶
  BOUND_R: 720, // 疆域半径(远方托底)
  GROUND_CLEAR: 3, // 撞地钳制离地间隙
  P_LIM: 1.05, // 俯仰限幅 ±60°
  R_LIM: 1.3, // 滚转限幅 ±75°
  AUTH_MIN: 0.35, // 低速控制权限下限
  AUTH_SPD: 12, // 满权限速度
  BOOST_MULT: 1.9, // 冲刺速度倍率
  BOOST_DRAIN: 14, // 冲刺耗能 /s
  REGEN: 10, // 回能 /s
  RATE_K: 6, // 角速率趋近平滑
  DOCK_DIST: 10, // 自动导航到泊位距离
};

const clampN = (v) => Math.max(-1, Math.min(1, v));

/**
 * 单步飞行积分(纯函数)。
 * @param {object} state { pos, quat, vel, pitchRate, rollRate, energy, autoNav }
 * @param {object} input { pitchIn, rollIn, boostHold, boostKey, autoNavTarget(Vector3|null), groundHeightAt(x,z), centerX, centerZ }
 * @param {number} dt 秒(已钳制)
 * @returns {{ state, flags: { dock, groundHit, boundaryHit } }} 新状态(全新对象)与事件标志
 */
export function stepFlight(state, input, dt) {
  const P = FLIGHT_PARAMS;
  const s = {
    pos: state.pos.clone(),
    quat: state.quat.clone(),
    vel: state.vel.clone(),
    pitchRate: state.pitchRate,
    rollRate: state.rollRate,
    energy: state.energy,
    autoNav: state.autoNav,
  };
  const flags = { dock: false, groundHit: false, boundaryHit: false };
  let pitchIn = clampN(input.pitchIn);
  let rollIn = clampN(input.rollIn);

  // 自动导航:朝目标柔和转向,接近泊位交还游戏流程,任何手动输入立即接管
  if (s.autoNav && input.autoNavTarget) {
    const toT = input.autoNavTarget.clone().sub(s.pos);
    if (toT.length() < P.DOCK_DIST) {
      flags.dock = true;
      return { state: s, flags };
    }
    toT.normalize();
    const fwd0 = new THREE.Vector3(0, 0, 1).applyQuaternion(s.quat);
    const crossY = fwd0.z * toT.x - fwd0.x * toT.z; // >0 目标在右侧
    if (Math.abs(pitchIn) > 0.15 || Math.abs(rollIn) > 0.15 || input.boostHold || input.boostKey) {
      s.autoNav = false;
    } else {
      rollIn = -clampN(crossY * 3);
      pitchIn = Math.max(-0.6, Math.min(0.6, (toT.y - fwd0.y) * 4));
    }
  }
  if (pitchIn > 1) pitchIn = 1;
  if (pitchIn < -1) pitchIn = -1;
  if (rollIn > 1) rollIn = 1;
  if (rollIn < -1) rollIn = -1;

  // 控制权限随速度(低速不灵活;无失速)
  const spd = s.vel.length();
  const auth = Math.max(P.AUTH_MIN, Math.min(1, spd / P.AUTH_SPD));

  // 姿态角提取(限幅+松杆自动改平:纯角速度积分按住 2 秒会翻 183° 倒扣)
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(s.quat);
  const pitchCur = Math.asin(clampN(fwd.y));
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(s.quat);
  const rollCur = Math.asin(clampN(right.y));
  if (pitchCur > P.P_LIM && pitchIn > 0) pitchIn = 0;
  if (pitchCur < -P.P_LIM && pitchIn < 0) pitchIn = 0;
  if (rollCur > P.R_LIM && rollIn > 0) rollIn = 0;
  if (rollCur < -P.R_LIM && rollIn < 0) rollIn = 0;
  const k = Math.min(1, dt * P.RATE_K);
  let tPitch = pitchIn * 1.6 * auth,
    tRoll = rollIn * 2.2 * auth;
  if (Math.abs(pitchIn) < 0.1) tPitch += -pitchCur * 1.2 * auth;
  if (Math.abs(rollIn) < 0.1) tRoll += -rollCur * 1.5 * auth;
  s.pitchRate += (tPitch - s.pitchRate) * k;
  s.rollRate += (tRoll - s.rollRate) * k;
  const yawRate = -s.rollRate * 0.5; // 协调转弯:倾斜自动带转向
  const qTmp = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(-s.pitchRate * dt, yawRate * dt, s.rollRate * dt, 'YXZ')
  );
  s.quat.multiply(qTmp).normalize();

  // 灵蕴驱动·自动油门:速度向往巡航值
  const boosting = (input.boostHold || input.boostKey) && s.energy > 0;
  if (boosting) s.energy = Math.max(0, s.energy - P.BOOST_DRAIN * dt);
  else s.energy = Math.min(100, s.energy + P.REGEN * dt);
  const cruise = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(s.quat)
    .multiplyScalar(P.CRUISE * (boosting ? P.BOOST_MULT : 1));
  s.vel.lerp(cruise, Math.min(1, dt * 2.2));
  s.pos.addScaledVector(s.vel, dt);

  // 实心山铁律:撞地钳制(灵蕴护体,不死)
  const gh = input.groundHeightAt ? input.groundHeightAt(s.pos.x, s.pos.z) : 0;
  if (s.pos.y < gh + P.GROUND_CLEAR) {
    s.pos.y = gh + P.GROUND_CLEAR;
    if (s.vel.y < 0) s.vel.y = 0;
    s.vel.multiplyScalar(0.94);
    flags.groundHit = true;
  }
  // 天顶
  if (s.pos.y > P.YMAX) {
    s.pos.y = P.YMAX;
    if (s.vel.y > 0) s.vel.y = 0;
  }
  // 疆域(远方托底)
  const dx = s.pos.x - input.centerX,
    dz = s.pos.z - input.centerZ,
    r = Math.hypot(dx, dz);
  if (r > P.BOUND_R) {
    s.pos.x = input.centerX + (dx / r) * P.BOUND_R;
    s.pos.z = input.centerZ + (dz / r) * P.BOUND_R;
    s.vel.multiplyScalar(0.9);
    flags.boundaryHit = true;
  }
  return { state: s, flags };
}
