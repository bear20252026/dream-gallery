// scene/collision-resolve.js — 玩家水平移动碰撞解析(纯函数,可单测)
// 2026-08-31 从 player.js 抽出,解决三类问题:
//   ① 隧穿:原实现单步位移只检测终点,低帧率/滑翔加速时单步位移可超过碰撞体厚度 → 穿模
//      → 子步进:把位移拆成 ≤maxSubstep 的小步,每步都检测
//   ② 贴墙滑行:撞墙时沿墙滑行(而非完全停住),斜向输入能沿墙移动
//   ③ 角落:两轴都被挡时停住(不抖动、不弹出)
// 纯函数:不依赖 ctx/three,输入位置+位移+碰撞盒数组,返回解析后位置

/** 每子步最大位移(m)。必须远小于最薄碰撞体的半厚(当前 0.3m),否则仍可能隧穿 */
export const MAX_SUBSTEP = 0.12;
/** 单次移动最大子步数(防极端 dt 导致步数爆炸卡死) */
export const MAX_STEPS = 40;

/**
 * 点(扩展为半径 r 的圆)是否与任一 AABB 碰撞盒相交
 * @param {number} x @param {number} z @param {number} r 玩家半径
 * @param {Array<{mnX,mxX,mnZ,mxZ}>} bounds 轴对齐碰撞盒
 */
export function hitsAny(x, z, r, bounds) {
  for (let i = 0; i < bounds.length; i++) {
    const b = bounds[i];
    const cx = Math.max(b.mnX, Math.min(x, b.mxX));
    const cz = Math.max(b.mnZ, Math.min(z, b.mxZ));
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

/**
 * 单步碰撞滑行:尝试移动到 (tx,tz);若被挡,退化为只走 X 或只走 Z(沿墙滑行)
 * @returns {{x:number,z:number,blocked:boolean}} blocked=完全被挡住(两轴都不通)
 */
export function slideStep(px, pz, tx, tz, r, bounds) {
  if (!hitsAny(tx, tz, r, bounds)) return { x: tx, z: tz, blocked: false };
  const sx = tx - px;
  const sz = tz - pz;
  // 关键(2026-08-31):只有该轴**确实有位移**时才算"可通行"。
  // 否则纯 X 移动撞墙时 sz=0,"只走 Z"等价于原地不动,而 hitsAny(起点) 必然为 false
  // → canZ 被误判 true → 明明撞死了却报 blocked=false(上层据此误判还能走)
  const canX = sx !== 0 && !hitsAny(tx, pz, r, bounds); // 只走 X
  const canZ = sz !== 0 && !hitsAny(px, tz, r, bounds); // 只走 Z
  if (canX && canZ) {
    // 两轴都通:沿位移较大的方向滑(保持贴墙滑行手感,不"粘"在墙上)
    return Math.abs(sx) > Math.abs(sz)
      ? { x: tx, z: pz, blocked: false }
      : { x: px, z: tz, blocked: false };
  }
  if (canX) return { x: tx, z: pz, blocked: false };
  if (canZ) return { x: px, z: tz, blocked: false };
  return { x: px, z: pz, blocked: true }; // 角落/正面撞墙:完全堵死
}

/**
 * 水平移动解析(子步进 + 逐轴滑行)
 * @param {number} px 当前 X @param {number} pz 当前 Z
 * @param {number} dx 本帧期望位移 X @param {number} dz 本帧期望位移 Z
 * @param {number} r 玩家半径 @param {Array} bounds 碰撞盒
 * @param {number} maxSubstep 子步最大位移
 * @returns {{x:number,z:number,blocked:boolean,steps:number}}
 */
export function resolveMove(px, pz, dx, dz, r, bounds, maxSubstep = MAX_SUBSTEP) {
  const dist = Math.hypot(dx, dz);
  if (dist <= 0) return { x: px, z: pz, blocked: false, steps: 0 };
  const steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil(dist / maxSubstep)));
  const sx = dx / steps;
  const sz = dz / steps;
  let x = px;
  let z = pz;
  let blocked = false;
  for (let i = 0; i < steps; i++) {
    const res = slideStep(x, z, x + sx, z + sz, r, bounds);
    x = res.x;
    z = res.z;
    if (res.blocked) {
      blocked = true;
      break; // 撞死角,后续子步无意义
    }
  }
  return { x, z, blocked, steps };
}
