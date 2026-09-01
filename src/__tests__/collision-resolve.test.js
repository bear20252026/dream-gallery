// 水平移动碰撞解析回归测试(2026-08-31 碰撞修复)
// 覆盖:隧穿(高速/低帧率)、贴墙滑行、角落卡死、长时间持续移动
import { describe, it, expect } from 'vitest';
import {
  resolveMove,
  slideStep,
  hitsAny,
  MAX_SUBSTEP,
  MAX_STEPS,
} from '../scene/collision-resolve.js';

const R = 0.35; // 玩家半径(与 player.js pl.r 一致)
// 一面薄墙:中心 (0,0),X 跨度 -1~1(厚 0.6m),Z 跨度 -10~10
const WALL = [{ mnX: -0.3, mxX: 0.3, mnZ: -10, mxZ: 10 }];

describe('collision-resolve.hitsAny', () => {
  it('圆心在盒内 → 碰撞', () => {
    expect(hitsAny(0, 0, R, WALL)).toBe(true);
  });
  it('圆心在盒外但距离 < r → 碰撞(圆扩展)', () => {
    expect(hitsAny(0.5, 0, R, WALL)).toBe(true); // 距墙面 0.2 < 0.35
  });
  it('圆心远离 → 不碰撞', () => {
    expect(hitsAny(2, 0, R, WALL)).toBe(false);
  });
  it('空碰撞盒数组 → 永不碰撞', () => {
    expect(hitsAny(0, 0, R, [])).toBe(false);
  });
});

// 高度感知护栏(2026-09-01 楼梯掉落修复):墙可带可选垂直区间 [mnY,mxY](脚底坐标系),
// 玩家身体 [footY, footY+1.8] 与墙区间不重叠时该墙"不存在"——
// 典型场景:二层回廊护栏只挡二楼的人,一楼的人从护栏下方自由通行
describe('collision-resolve 高度感知护栏(mnY/mxY)', () => {
  // 模拟二层回廊内缘护栏:XY 上横在 z=0,垂直区间 30.4~38
  const RAIL = [{ mnX: -10, mxX: 10, mnZ: -0.3, mxZ: 0.3, mnY: 30.4, mxY: 38 }];

  it('二楼的人(footY=30.45)撞护栏 → 被挡', () => {
    expect(hitsAny(0, 0, R, RAIL, 30.45)).toBe(true);
    const r = resolveMove(0, 2, 0, -1, R, RAIL, undefined, 30.45);
    expect(r.z).toBeGreaterThan(0.6); // 到不了护栏另一侧
  });
  it('一楼的人(footY=20.8)从护栏下方通过 → 不挡', () => {
    expect(hitsAny(0, 0, R, RAIL, 20.8)).toBe(false);
    const r = resolveMove(0, 2, 0, -4, R, RAIL, undefined, 20.8);
    expect(r.z).toBeLessThan(-1); // 穿行无阻
  });
  it('不传 footY(旧行为)→ 护栏当作全高墙挡住所有人(兼容旧世界)', () => {
    expect(hitsAny(0, 0, R, RAIL)).toBe(true);
  });
  it('无 mnY/mxY 的普通墙 + footY → 行为不变(全高墙)', () => {
    expect(hitsAny(0, 0, R, WALL, 30.45)).toBe(true);
    expect(hitsAny(0, 0, R, WALL, 20.8)).toBe(true);
  });
  it('footY 高于墙顶(footY>=mxY)→ 不碰撞(可从墙上越过)', () => {
    expect(hitsAny(0, 0, R, [{ mnX: -1, mxX: 1, mnZ: -1, mxZ: 1, mnY: 0, mxY: 30.3 }], 30.45)).toBe(
      false
    );
  });
  it('脚底恰在墙顶 → 不碰撞(站上墙顶不被墙卡住)', () => {
    expect(
      hitsAny(0, 0, R, [{ mnX: -1, mxX: 1, mnZ: -1, mxZ: 1, mnY: 20.5, mxY: 30.3 }], 30.3)
    ).toBe(false);
  });
  it('滑行行为:二楼沿护栏滑行不会被弹飞', () => {
    const r = resolveMove(-3, 0.5, 5, -1, R, RAIL, undefined, 30.45);
    expect(r.blocked || r.z >= 0.6 - 1e-9 || r.x > -3).toBe(true);
  });
});

describe('collision-resolve 隧穿防护(子步进)', () => {
  it('单帧高速冲刺(远超墙厚)不穿墙', () => {
    // 从 x=-3 以单帧位移 +5 冲向墙(墙在 x=0,半厚 0.3 + r 0.35)
    // 无子步进时:终点 x=2 在墙另一侧 → 直接穿过去
    const r = resolveMove(-3, 0, 5, 0, R, WALL);
    expect(r.x).toBeLessThan(0); // 必须停在墙的近侧(x < 0)
    expect(r.blocked).toBe(true);
  });

  it('极低帧率(dt=0.5s,位移 1.6m)不穿墙', () => {
    const r = resolveMove(-2, 0, 1.6, 0, R, WALL);
    expect(r.x).toBeLessThan(0);
  });

  it('滑翔加速(3.2*1.6*dt,dt=0.2 → 1.02m)不穿墙', () => {
    const r = resolveMove(-2, 0, 1.02, 0, R, WALL);
    expect(r.x).toBeLessThan(0);
  });

  it('子步数随位移增长,但有上限(防极端 dt 卡死)', () => {
    const small = resolveMove(0, 20, 0.05, 0, R, WALL); // 远离墙
    const huge = resolveMove(0, 20, 999, 0, R, WALL); // 极端位移
    expect(small.steps).toBe(1);
    expect(huge.steps).toBeLessThanOrEqual(MAX_STEPS);
  });

  it('MAX_SUBSTEP 远小于最薄碰撞体半厚(0.3m)', () => {
    expect(MAX_SUBSTEP).toBeLessThan(0.3);
  });
});

describe('collision-resolve 贴墙滑行', () => {
  it('斜向撞墙:沿墙滑行而非完全停住', () => {
    // 玩家贴着墙左侧(x≈-0.65),斜向输入(+X 撞墙, +Z 沿墙)
    const px = -0.65;
    const r = resolveMove(px, 0, 0.5, 0.5, R, WALL);
    // X 被挡(保持),Z 前进 → 沿墙滑行
    expect(r.x).toBeCloseTo(px, 5); // X 不动
    expect(r.z).toBeGreaterThan(0); // Z 前进了
    expect(r.blocked).toBe(false);
  });

  it('正面垂直撞墙:停住(blocked)', () => {
    const px = -0.65;
    const r = resolveMove(px, 5, 0.5, 0, R, WALL);
    expect(r.blocked).toBe(true);
    expect(r.x).toBeCloseTo(px, 5);
  });

  it('未接触墙:自由移动', () => {
    const r = resolveMove(-5, 20, 0.3, 0.3, R, WALL);
    expect(r.x).toBeCloseTo(-4.7, 5);
    expect(r.z).toBeCloseTo(20.3, 5);
    expect(r.blocked).toBe(false);
  });
});

describe('collision-resolve 角落', () => {
  it('内直角:两轴都被挡 → 停住不抖动、不弹出', () => {
    // 两面墙组成内直角:竖墙在 x=0,横墙在 z=0
    const corner = [
      { mnX: -0.3, mxX: 0.3, mnZ: -10, mxZ: 10 }, // 竖墙
      { mnX: -10, mxX: 10, mnZ: -0.3, mxZ: 0.3 }, // 横墙
    ];
    // 玩家在 (-0.65,-0.65) 角落,朝 (+X,+Z) 猛冲(两轴都撞墙)
    const r = resolveMove(-0.65, -0.65, 1, 1, R, corner);
    expect(r.blocked).toBe(true);
    expect(r.x).toBeCloseTo(-0.65, 5); // 不弹出
    expect(r.z).toBeCloseTo(-0.65, 5);
  });
});

describe('collision-resolve 边界情况', () => {
  it('零位移:直接返回原位置', () => {
    const r = resolveMove(1, 2, 0, 0, R, WALL);
    expect(r.x).toBe(1);
    expect(r.z).toBe(2);
    expect(r.steps).toBe(0);
  });

  it('长时间持续移动(600 帧)始终不穿墙、不卡 NaN', () => {
    // 长墙(Z 范围 ±1000):避免玩家从墙的端点绕过去(绕行是正确行为,不是 bug)
    const longWall = [{ mnX: -0.3, mxX: 0.3, mnZ: -1000, mxZ: 1000 }];
    let x = -3;
    let z = 0;
    for (let i = 0; i < 600; i++) {
      const r = resolveMove(x, z, 0.12, 0.03, R, longWall); // 一直朝 +X 推
      x = r.x;
      z = r.z;
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(z)).toBe(true);
      expect(x).toBeLessThan(0); // 永远不穿到墙另一侧
    }
    // 600 帧后应停在墙前(贴墙),而非穿过去
    expect(x).toBeLessThan(-0.6);
  });

  it('沿墙长时间贴行:能持续沿墙前进(不粘住)', () => {
    const longWall = [{ mnX: -0.3, mxX: 0.3, mnZ: -1000, mxZ: 1000 }];
    let x = -0.65;
    let z = -5;
    for (let i = 0; i < 200; i++) {
      const r = resolveMove(x, z, 0.1, 0.1, R, longWall); // 斜向推墙
      x = r.x;
      z = r.z;
    }
    expect(z).toBeGreaterThan(-5); // 沿墙滑行推进了
    expect(x).toBeLessThan(0); // 但没穿墙
  });

  it('slideStep 两轴被挡返回 blocked(单步小位移)', () => {
    // 注意:slideStep 是"单步"解析,目标是 px+单步位移(不是最终目标点)
    const res = slideStep(-0.65, -0.65, -0.57, -0.57, R, [
      { mnX: -0.3, mxX: 0.3, mnZ: -10, mxZ: 10 }, // 竖墙
      { mnX: -10, mxX: 10, mnZ: -0.3, mxZ: 0.3 }, // 横墙
    ]);
    expect(res.blocked).toBe(true);
    expect(res.x).toBeCloseTo(-0.65, 5); // 不弹出
    expect(res.z).toBeCloseTo(-0.65, 5);
  });
});
