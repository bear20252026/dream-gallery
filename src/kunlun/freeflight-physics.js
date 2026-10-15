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
// 模块级 scratch(2026-10-08 审查#8):stepFlightInto 每帧调用,原实现每帧 new 约 10 个
// Vector3/Quaternion/Euler(60fps ≈ 600 分配/秒)。改共享复用;单线程无重入
// (groundHeightAt 走 desert.getH,不回调本模块),安全。
const _toT = new THREE.Vector3();
const _fwd0 = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _cruise = new THREE.Vector3();
const _euler = new THREE.Euler();
const _qTmp = new THREE.Quaternion();

/**
 * 飞行**状态包**里由本模块读写的七个字段。持有者是 ark.js:422 的 `freeFlight`
 * (它还带 `on`/`lastT`/`boostHold` 这些本模块不碰的字段,传变量进来不触发多余属性检查)。
 * 单测的 `mkState` 逐字段同形(2026-10-15 第六刀回读核实)。
 * @typedef {{ pos:THREE.Vector3, quat:THREE.Quaternion, vel:THREE.Vector3,
 *   pitchRate:number, rollRate:number, energy:number, autoNav:boolean }} FlightState
 */
/**
 * 输入包。`autoNavTarget` **不是** Vector3:唯一生产写入方 ark.js:563 传的是 `DOCK`(字面量
 * `{x,y,z}`),而本模块只把它交给 `Vector3.copy()` —— 那个 API 收的就是 `{x,y,z}` 结构。
 * 旧注释写 `Vector3|null` 会让生产调用点变成假错,所以这里按写入方的真实形状声明。
 * `groundHeightAt` 可选:函数体 `input.groundHeightAt ? … : 0` 写明了可省。
 * @typedef {{ pitchIn:number, rollIn:number, boostHold:boolean, boostKey:boolean,
 *   autoNavTarget?:{x:number, y:number, z:number}|null,
 *   groundHeightAt?:(x:number, z:number)=>number, centerX:number, centerZ:number }} FlightInput
 */
/**
 * 事件标志(经 flags 回传给游戏流程,状态包之外唯一出口)。
 * @typedef {{ dock:boolean, groundHit:boolean, boundaryHit:boolean }} FlightFlags
 */

/**
 * 单步飞行积分·原地变异核(生产路径,零分配)。
 * 直接改写传入 state 的 pos/quat/vel/pitchRate/rollRate/energy/autoNav,返回事件标志。
 * 调用方在两次调用之间不得持有对 pos/quat/vel 的旧引用(ark.js 每帧覆写,满足)。
 * @param {FlightState} s
 * @param {FlightInput} input
 * @param {number} dt
 * @returns {FlightFlags} flags
 */
export function stepFlightInto(s, input, dt) {
  const P = FLIGHT_PARAMS;
  const flags = { dock: false, groundHit: false, boundaryHit: false };
  let pitchIn = clampN(input.pitchIn);
  let rollIn = clampN(input.rollIn);

  // 自动导航:朝目标柔和转向,接近泊位交还游戏流程,任何手动输入立即接管
  if (s.autoNav && input.autoNavTarget) {
    const toT = _toT.copy(input.autoNavTarget).sub(s.pos);
    if (toT.length() < P.DOCK_DIST) {
      flags.dock = true;
      return flags;
    }
    toT.normalize();
    const fwd0 = _fwd0.set(0, 0, 1).applyQuaternion(s.quat);
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
  const fwd = _fwd.set(0, 0, 1).applyQuaternion(s.quat);
  const pitchCur = Math.asin(clampN(fwd.y));
  const right = _right.set(1, 0, 0).applyQuaternion(s.quat);
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
  _qTmp.setFromEuler(_euler.set(-s.pitchRate * dt, yawRate * dt, s.rollRate * dt, 'YXZ'));
  s.quat.multiply(_qTmp).normalize();

  // 灵蕴驱动·自动油门:速度向往巡航值
  const boosting = (input.boostHold || input.boostKey) && s.energy > 0;
  if (boosting) s.energy = Math.max(0, s.energy - P.BOOST_DRAIN * dt);
  else s.energy = Math.min(100, s.energy + P.REGEN * dt);
  const cruise = _cruise
    .set(0, 0, 1)
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
  return flags;
}

/**
 * 单步飞行积分(纯函数,契约与 2026-08-30 版逐位一致)。
 * 克隆输入状态 → 原地核(stepFlightInto) → 返回全新对象;输入 state 不被修改
 * (freeflight-physics.test.js 的「纯函数性」用例钉死此语义)。
 * @param {FlightState} state { pos, quat, vel, pitchRate, rollRate, energy, autoNav }
 * @param {FlightInput} input { pitchIn, rollIn, boostHold, boostKey, autoNavTarget, groundHeightAt(x,z), centerX, centerZ }
 * @param {number} dt 秒(已钳制)
 * @returns {{ state: FlightState, flags: FlightFlags }} 新状态(全新对象)与事件标志
 */
export function stepFlight(state, input, dt) {
  const s = {
    pos: state.pos.clone(),
    quat: state.quat.clone(),
    vel: state.vel.clone(),
    pitchRate: state.pitchRate,
    rollRate: state.rollRate,
    energy: state.energy,
    autoNav: state.autoNav,
  };
  const flags = stepFlightInto(s, input, dt);
  return { state: s, flags };
}
