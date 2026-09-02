// wall-builder.js — 墙段建造单一工厂(合并三胞胎:scene.js:188 / gallery-v2.js / rose-gallery.js)
// 语义与原三份实现逐位一致:
//   段长 <0.25 跳过;ang=atan2(dx,dz);碰撞盒半厚 t=th/2+0.1,再外扩 0.1
// ⚠️ bounds 一律输出【世界坐标】:mesh 靠 group 偏移(ox/oz)视觉正确,但
//    resolveMove/hitsAny 直接读世界 x/z。本地坐标漏偏移 = 墙错位到原点
//    (2026-09-02 rose 1337 盒压死出生点事故;v2 旧代码同样漏偏移,本次一并修复)。
import * as THREE from 'three';

export const WALL_MIN_LEN = 0.25; // 短于此的段不建(噪声)
export const BOUNDS_EXPAND = 0.1; // 碰撞盒四向外扩(防穿缝)

// 单段 AABB(世界坐标)。cx/cz 为段中心(本地坐标),ox/oz 为建筑世界偏移。
export function wallSegBounds(cx, cz, ang, len, th, ox = 0, oz = 0) {
  const sA = Math.abs(Math.sin(ang)),
    cA = Math.abs(Math.cos(ang)),
    t = th / 2 + 0.1;
  const wx = ox + cx,
    wz = oz + cz;
  return {
    mnX: wx - ((sA * len) / 2 + cA * t) - BOUNDS_EXPAND,
    mxX: wx + ((sA * len) / 2 + cA * t) + BOUNDS_EXPAND,
    mnZ: wz - ((cA * len) / 2 + sA * t) - BOUNDS_EXPAND,
    mxZ: wz + ((cA * len) / 2 + sA * t) + BOUNDS_EXPAND,
  };
}

// 造一个 addWallSeg(x1, z1, x2, z2, h?) 函数:
//   parent — mesh 挂载容器(通常为带 position 偏移的 THREE.Group)
//   mat/th — 墙材质与厚度   defaultH — 省略 h 参数时的默认墙高
//   ox/oz  — 建筑世界偏移(只用于碰撞盒;mesh 保持本地坐标由 group 偏移)
//   bounds — 收集碰撞盒的数组(可省略=纯装饰墙)
export function makeWallBuilder({ parent, mat, th, defaultH, ox = 0, oz = 0, bounds }) {
  return function addWallSeg(x1, z1, x2, z2, h = defaultH) {
    const dx = x2 - x1,
      dz = z2 - z1,
      len = Math.hypot(dx, dz);
    if (len < WALL_MIN_LEN) return;
    const cx = (x1 + x2) / 2,
      cz = (z1 + z2) / 2,
      ang = Math.atan2(dx, dz);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(th, h, len), mat);
    wall.position.set(cx, h / 2, cz);
    wall.rotation.y = ang;
    parent.add(wall);
    if (bounds) bounds.push(wallSegBounds(cx, cz, ang, len, th, ox, oz));
  };
}

// 闭环弧长重采样(原 v2 内联版与 rose resample() 合并;步长 step 米)
export function resampleRing(ring, step) {
  const out = [ring[0]];
  for (let i = 1; i <= ring.length; i++) {
    const p = ring[i % ring.length];
    const q = out[out.length - 1];
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= step) out.push(p);
  }
  return out;
}
