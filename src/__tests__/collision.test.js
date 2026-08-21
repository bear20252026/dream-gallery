// 碰撞检测 + 相机公式单元测试
// 测试 player.js 中的 hT (hitTest) 和 rs (resolveSlide) 纯逻辑
import { describe, it, expect } from 'vitest';

// 从 player.js 提取的碰撞检测逻辑（纯函数，无 DOM/Three 依赖）
// hT: 检测点 (x,z) 是否与任何 AABB bounds 碰撞
function hitTest(x, z, bounds, radius) {
  for (const b of bounds) {
    const cx = Math.max(b.mnX, Math.min(x, b.mxX));
    const cz = Math.max(b.mnZ, Math.min(z, b.mxZ));
    if ((x - cx) ** 2 + (z - cz) ** 2 < radius ** 2) return true;
  }
  return false;
}

// rs: 滑动碰撞解决
function resolveSlide(nx, nz, px, pz, bounds, radius) {
  if (!hitTest(nx, nz, bounds, radius)) return { x: nx, z: nz };
  const mx = !hitTest(nx, pz, bounds, radius);
  const mz = !hitTest(px, nz, bounds, radius);
  if (mx && mz) return Math.abs(nx - px) > Math.abs(nz - pz) ? { x: nx, z: pz } : { x: px, z: nz };
  if (mx) return { x: nx, z: pz };
  if (mz) return { x: px, z: nz };
  return { x: px, z: pz };
}

describe('hitTest (碰撞检测)', () => {
  const bounds = [{ mnX: 0, mxX: 10, mnZ: 0, mxZ: 10 }];
  const r = 0.35;

  it('远离盒子时不碰撞', () => {
    expect(hitTest(20, 20, bounds, r)).toBe(false);
  });

  it('盒子内部碰撞', () => {
    expect(hitTest(5, 5, bounds, r)).toBe(true);
  });

  it('盒子边缘附近碰撞（半径内）', () => {
    expect(hitTest(-0.2, 5, bounds, r)).toBe(true);
  });

  it('盒子边缘外不碰撞', () => {
    expect(hitTest(-1, 5, bounds, r)).toBe(false);
  });

  it('多个盒子', () => {
    const multiBounds = [
      { mnX: 0, mxX: 5, mnZ: 0, mxZ: 5 },
      { mnX: 20, mxX: 25, mnZ: 20, mxZ: 25 },
    ];
    expect(hitTest(3, 3, multiBounds, r)).toBe(true);
    expect(hitTest(22, 22, multiBounds, r)).toBe(true);
    expect(hitTest(10, 10, multiBounds, r)).toBe(false);
  });
});

describe('resolveSlide (滑动碰撞)', () => {
  const bounds = [{ mnX: 0, mxX: 10, mnZ: 0, mxZ: 10 }];
  const r = 0.35;

  it('无碰撞时返回新位置', () => {
    const result = resolveSlide(20, 20, 15, 15, bounds, r);
    expect(result).toEqual({ x: 20, z: 20 });
  });

  it('碰撞时沿自由轴滑动: X 自由，Z 被弹回', () => {
    // bounds: [0,10] x [0,10]，半径 0.35
    // 从 (5, 15) 向 (5, -5) 移动：新位置 (5,-5) 碰撞
    // hitTest(5, -5) = true（cz=0, dist=5 > 0.35? 不对，cz=max(0,min(-5,10))=0, (5-5)^2+(-5-0)^2=25 > 0.35^2）
    // 实际上 (5,-5) 不碰撞！因为离盒子太远。用更近的坐标
    // 从 (5, 12) 向 (5, 9.5) 移动：新位置 (5,9.5) 接近碰撞
    // hitTest(5, 9.5) = cz=max(0,min(9.5,10))=9.5, dist=(5-5)^2+(9.5-9.5)^2=0 < 0.35^2 → 碰撞
    const result = resolveSlide(5, 9.5, 5, 12, bounds, r);
    // Z 被弹回原位
    expect(result.z).toBe(12);
    expect(result.x).toBe(5);
  });

  it('碰撞时沿自由轴滑动: Z 自由，X 被弹回', () => {
    // 从 (12, 5) 向 (9.5, 5) 移动：新位置 (9.5,5) 接近碰撞
    // hitTest(9.5, 5) = cx=max(0,min(9.5,10))=9.5, dist=0 < 0.35^2 → 碰撞
    const result = resolveSlide(9.5, 5, 12, 5, bounds, r);
    expect(result.x).toBe(12);
    expect(result.z).toBe(5);
  });

  it('无碰撞直接通过', () => {
    // 从 (20, 20) 向 (25, 25) 移动：远离盒子
    const result = resolveSlide(25, 25, 20, 20, bounds, r);
    expect(result).toEqual({ x: 25, z: 25 });
  });

  it('完全卡死时返回原位', () => {
    // 四面都被堵住
    const tightBounds = [{ mnX: -1, mxX: 1, mnZ: -1, mxZ: 1 }];
    const result = resolveSlide(0, 0, 0, 0, tightBounds, r);
    expect(result).toEqual({ x: 0, z: 0 });
  });
});

describe('相机公式（第三人称）', () => {
  // 从 main.js 提取的第三人称相机计算逻辑
  function calcThirdPersonCamera(px, pz, yaw, back, up, lookAtY) {
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const camX = px - fx * back;
    const camZ = pz - fz * back;
    const camY = 1.6 + up; // player height + up offset
    return {
      position: { x: camX, y: camY, z: camZ },
      lookAt: { x: px, y: lookAtY, z: pz },
    };
  }

  it('面朝南时相机在北侧', () => {
    const cam = calcThirdPersonCamera(0, 0, 0, 1.6, 1.0, 0.8);
    // yaw=0 面朝南，相机在北侧（Z 正方向）
    expect(cam.position.z).toBeGreaterThan(0);
  });

  it('面朝东时相机在西侧', () => {
    const cam = calcThirdPersonCamera(0, 0, -Math.PI / 2, 1.6, 1.0, 0.8);
    expect(cam.position.x).toBeLessThan(0);
  });

  it('lookAt 的 y 值指向 avatar 胸口', () => {
    const cam = calcThirdPersonCamera(10, 10, 0, 1.6, 1.0, 0.8);
    expect(cam.lookAt.y).toBe(0.8);
  });

  it('后撤距离正确', () => {
    const back = 1.6;
    const cam = calcThirdPersonCamera(0, 0, 0, back, 1.0, 0.8);
    const dist = Math.hypot(cam.position.x - 0, cam.position.z - 0);
    expect(dist).toBeCloseTo(back, 5);
  });
});
