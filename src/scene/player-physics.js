// scene/player-physics.js — 玩家垂直运动纯物理核(2026-08-30 终审 TOP1:滑翔/跳跃可单测化)
// 从 player.js tickPhysics 抽出的单步积分:重力/跳跃/滑翔/能量/贴地吸附。
// 纯函数:输入状态+输入,返回全新状态;地面高度 gy 由调用方按地形函数算好传入。

/** 物理参数(与原 tickPhysics 逐字一致) */
export const VERTICAL_PARAMS = {
  JUMP_V: 9.5, // 起跳初速
  FULL_GRAVITY: 26, // 常规重力
  GLIDE_GRAVITY: 3.5, // 滑翔重力(大幅减缓)
  GLIDE_MAX: 5, // 能量上限
  GLIDE_DRAIN: 0.35, // 滑翔耗能 /s
  GLIDE_REGEN: 1.2, // 落地回能 /s
  UPDRAFT_REGEN: 0.6, // 上升气流回能 /s
  VY_MIN: -12, // 下坠限速
  VY_MAX: 6, // 上升限速
  PITCH_DIVE: 6, // 抬头俯冲系数
  PITCH_LIFT: 1.5, // 低头升力
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// 下坡/下台阶吸附容差(m):大于此高度差视为真的踩空(该掉落就掉落)
const STEP_DOWN = 0.45;

/**
 * 垂直运动单步积分(纯函数)。
 * @param {object} state { y, vy, onGround, glideEnergy }
 * @param {object} input { jumpPressed(本帧消耗), jumpHold, pitch(俯仰,滑翔气动), updraft(上升气流强度), gy(地表+眼高) }
 * @param {number} dt 秒
 * @returns {object} 新状态 { y, vy, onGround, glideEnergy, gliding }
 */
export function stepVertical(state, input, dt) {
  const P = VERTICAL_PARAMS;
  const s = {
    y: state.y,
    vy: state.vy,
    onGround: state.onGround,
    glideEnergy: state.glideEnergy,
    gliding: false,
  };
  // 起跳(落地瞬间触发一次;空中排队的跳跃直接丢弃)
  if (s.onGround && input.jumpPressed) {
    s.vy = P.JUMP_V;
    s.onGround = false;
  }
  // 滑翔判定:空中按住跳跃键且有余量
  if (!s.onGround && input.jumpHold && s.glideEnergy > 0) {
    s.gliding = true;
    s.glideEnergy -= dt * P.GLIDE_DRAIN;
    if (s.glideEnergy < 0) s.glideEnergy = 0;
  } else {
    s.gliding = false;
    if (s.onGround) s.glideEnergy = Math.min(P.GLIDE_MAX, s.glideEnergy + dt * P.GLIDE_REGEN);
  }
  // 重力:滑翔时大幅减缓(西域原版手感)
  s.vy -= (s.gliding ? P.GLIDE_GRAVITY : P.FULL_GRAVITY) * dt;
  if (s.gliding) {
    // 抬头:乘风速冲,高度换速度;低头:获得升力
    if (input.pitch > 0.15) s.vy -= input.pitch * P.PITCH_DIVE * dt;
    if (input.pitch < -0.15) s.vy += P.PITCH_LIFT * dt;
    // 上升气流托举并回充能量
    const ud = input.updraft || 0;
    if (ud > 0) {
      s.vy += ud * dt;
      s.glideEnergy = Math.min(P.GLIDE_MAX, s.glideEnergy + dt * P.UPDRAFT_REGEN);
    }
    // 上升/下坠限速(原版 clamp:-12~6)
    s.vy = clamp(s.vy, P.VY_MIN, P.VY_MAX);
  }
  s.y += s.vy * dt;
  // 落地/贴地判定(2026-08-31 修复抖动与下坡悬空):
  //   ① 常规落地:s.y <= gy → 硬吸附地表(高速落地也不穿透)
  //   ② 下坡容差(STEP_DOWN):原先下坡/下台阶时 gy 突降,s.y > gy 会判为离地 →
  //      玩家短暂"飘"起、无法起跳(因为 onGround=false)。
  //      现在:前一帧在地面 + 正在下落(vy<=0) + 离地高度 ≤ 容差 → 主动吸附下去,
  //      保持贴地连续(下坡/下台阶不再弹跳,也不卡在台阶边缘)
  const landed = s.y <= input.gy;
  const stepDown = state.onGround && s.vy <= 0 && s.y - input.gy <= STEP_DOWN;
  if (landed || stepDown) {
    // 落地/贴地:直接吸附地表(高速落地也不会穿透或卡落)
    s.y = input.gy;
    s.vy = 0;
    s.onGround = true;
  } else {
    s.onGround = false;
  }
  return s;
}
