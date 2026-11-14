// detail-quality.test.js — 画质档联动 + 角色微动作的回归锁(2026-11-13)
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  detailScaleFor,
  LOW_DETAIL_SCALE,
  registerScaled,
  registerRecompile,
  applyDetailQuality,
  currentDetailLow,
} from '../scene/desert/detail-quality.js';
import { blinkPulse, gaitPose, createGaitState } from '../shared/avatar-gait.mjs';

describe('detailScaleFor — 档位系数', () => {
  it('高档 1、低档 LOW_DETAIL_SCALE(不是 0:全关会让地面重回塑料)', () => {
    expect(detailScaleFor(false)).toBe(1);
    expect(detailScaleFor(true)).toBe(LOW_DETAIL_SCALE);
    expect(LOW_DETAIL_SCALE).toBeGreaterThan(0);
    expect(LOW_DETAIL_SCALE).toBeLessThan(1);
  });
});

describe('applyDetailQuality — uniform 缩放与 define 切换', () => {
  beforeEach(() => applyDetailQuality(false)); // 每条用例从高档起跑,避免串档

  it('按档缩放已登记 uniform,并可回到满强度', () => {
    const u = { value: 1 };
    registerScaled(u, 0.8);
    expect(u.value).toBeCloseTo(0.8, 6); // 登记即套当前档(高档)
    applyDetailQuality(true);
    expect(u.value).toBeCloseTo(0.8 * LOW_DETAIL_SCALE, 6);
    applyDetailQuality(false);
    expect(u.value).toBeCloseTo(0.8, 6);
  });

  it('登记时立刻套当前档(读档进游戏这一路不能漏)', () => {
    applyDetailQuality(true);
    const u = { value: 1 };
    registerScaled(u, 1);
    expect(u.value).toBeCloseTo(LOW_DETAIL_SCALE, 6);
    const m = new THREE.MeshStandardMaterial();
    registerRecompile(m);
    expect(m.defines.DETAIL_LOW).toBe(1);
  });

  it('低档打 DETAIL_LOW、高档删除;只在变化时重编译', () => {
    const m = new THREE.MeshStandardMaterial();
    registerRecompile(m);
    applyDetailQuality(true);
    expect(m.defines.DETAIL_LOW).toBe(1);
    m.needsUpdate = false; // 模拟已编译
    const r = applyDetailQuality(true); // 同档再调一次
    expect(r.materials).toBe(0); // 不该再触发重编译(每帧重编译会卡死)
    applyDetailQuality(false);
    expect(m.defines.DETAIL_LOW).toBeUndefined();
  });

  it('登记幂等:同一 uniform/材质不重复计数', () => {
    const u = { value: 1 };
    registerScaled(u, 1);
    registerScaled(u, 1);
    const m = new THREE.MeshStandardMaterial();
    registerRecompile(m);
    registerRecompile(m);
    const r = applyDetailQuality(true);
    const again = applyDetailQuality(false);
    expect(again.uniforms).toBe(r.uniforms);
  });

  it('脏输入不抛', () => {
    expect(() => registerScaled(null, 1)).not.toThrow();
    expect(() => registerScaled({ value: 0 }, 'x')).not.toThrow();
    expect(() => registerRecompile(null)).not.toThrow();
    expect(() => applyDetailQuality(undefined)).not.toThrow();
    expect(typeof currentDetailLow()).toBe('boolean');
  });
});

describe('blinkPulse — 眨眼是「眨」不是「闭眼」', () => {
  it('绝大部分时间睁眼(0),窗口内才有闭合', () => {
    let closed = 0,
      total = 0;
    for (let t = 0; t < 20; t += 0.01) {
      total++;
      if (blinkPulse(t) > 0.01) closed++;
    }
    expect(closed / total).toBeLessThan(0.06); // 闭合占比 <6%
  });
  it('峰值接近 1 且值域合法', () => {
    let max = 0;
    for (let t = 0; t < 8; t += 0.005) {
      const v = blinkPulse(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      if (v > max) max = v;
    }
    expect(max).toBeGreaterThan(0.9);
  });
  it('周期性:相隔一个周期的读数相同;负数/脏值不产生 NaN', () => {
    expect(blinkPulse(3.66)).toBeCloseTo(blinkPulse(3.66 + 3.7), 6);
    for (const v of [-5, NaN, undefined, 'x']) expect(Number.isFinite(blinkPulse(v))).toBe(true);
  });
});

describe('gaitPose — 围巾随速度与滑翔飘动', () => {
  const pose = (walk, gliding) =>
    gaitPose({ phase: 1, walk, lean: 0, time: 2 }, { airborne: false, gliding });
  it('静止时围巾基本垂下,走动/滑翔时向后抬起(负 X)', () => {
    expect(pose(0, false).scarfX).toBeGreaterThan(pose(1, false).scarfX);
    expect(pose(1, true).scarfX).toBeLessThan(pose(1, false).scarfX);
  });
  it('尾段与根段不同相位(两段才有布料感)', () => {
    const p = pose(1, false);
    expect(p.scarfTipX).not.toBeCloseTo(p.scarfX, 3);
  });
  it('新字段全为有限值', () => {
    const p = pose(0.5, false);
    for (const k of ['blink', 'scarfX', 'scarfZ', 'scarfTipX']) {
      expect(Number.isFinite(p[k])).toBe(true);
    }
  });
  it('createGaitState 初值可驱动(首帧不 NaN)', () => {
    const p = gaitPose(createGaitState(), { airborne: false, gliding: false });
    expect(Number.isFinite(p.blink)).toBe(true);
  });
});
