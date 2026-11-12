// light-mood.test.js — 沙漠昼夜氛围增强判据(2026-11-12 光效)
// 钉死:夜里辉光强于正午 / 晨昏辉光峰值 / 正午压曝光(治沙面发白) /
//       夜里雾更浓(空气纵深) / 夜里沙暴更淡(浅沙粒在夜空像噪点) /
//       曲线连续无跳变 / 脏输入不炸 / applyMood 零新增灯光。
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { moodAt, applyMood, smoothstep } from '../scene/desert/light-mood.js';

describe('smoothstep', () => {
  it('端点钳位与中点', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
  });
  it('零宽区间不除零', () => {
    expect(Number.isFinite(smoothstep(1, 1, 1))).toBe(true);
  });
});

describe('moodAt:昼夜曲线', () => {
  const night = moodAt(0);
  const dusk = moodAt(0.5);
  const noon = moodAt(1);

  it('夜里辉光强于正午(灯火与星屑要发光)', () => {
    expect(night.bloom).toBeGreaterThan(noon.bloom);
    expect(night.bloomTh).toBeLessThan(noon.bloomTh);
  });
  it('晨昏是辉光峰值(日落琥珀光)', () => {
    expect(dusk.bloom).toBeGreaterThan(noon.bloom);
    expect(dusk.rimBoost).toBeGreaterThan(noon.rimBoost);
  });
  it('正午压曝光(治浅沙过曝发白),夜里提曝光保可读', () => {
    expect(noon.exposure).toBeLessThan(night.exposure);
    expect(noon.exposure).toBeLessThan(1);
    expect(night.exposure).toBeGreaterThan(1);
  });
  it('夜里雾更浓(远景沉进夜色,有纵深)', () => {
    expect(night.fogDensity).toBeGreaterThan(noon.fogDensity);
  });
  it('夜里沙暴更淡(浅沙粒在夜空里像白噪点)', () => {
    expect(night.sandOpacity).toBeLessThan(noon.sandOpacity);
  });
  it('全区间连续:相邻采样差值有界,无跳变', () => {
    let prev = moodAt(0);
    for (let e = 0.01; e <= 1.0001; e += 0.01) {
      const m = moodAt(e);
      expect(Math.abs(m.bloom - prev.bloom)).toBeLessThan(0.06);
      expect(Math.abs(m.exposure - prev.exposure)).toBeLessThan(0.02);
      expect(Math.abs(m.fogDensity - prev.fogDensity)).toBeLessThan(0.0006);
      prev = m;
    }
  });
  it('所有参数在安全区间(不过曝、不黑到看不见、雾不糊死)', () => {
    for (let e = 0; e <= 1.0001; e += 0.05) {
      const m = moodAt(e);
      expect(m.bloom).toBeGreaterThanOrEqual(0.18);
      expect(m.bloom).toBeLessThanOrEqual(0.8);
      expect(m.bloomTh).toBeGreaterThanOrEqual(0.55);
      expect(m.bloomTh).toBeLessThanOrEqual(0.9);
      expect(m.exposure).toBeGreaterThanOrEqual(0.9);
      expect(m.exposure).toBeLessThanOrEqual(1.12);
      expect(m.fogDensity).toBeGreaterThanOrEqual(0.005);
      expect(m.fogDensity).toBeLessThanOrEqual(0.01);
      expect(m.sandOpacity).toBeGreaterThanOrEqual(0.04);
      expect(m.sandOpacity).toBeLessThanOrEqual(0.2);
    }
  });
  it('脏输入按 0 处理且不抛', () => {
    for (const v of [undefined, null, NaN, 'x', {}, -5, 99]) {
      expect(() => moodAt(v)).not.toThrow();
      const m = moodAt(v);
      expect(Number.isFinite(m.bloom)).toBe(true);
    }
  });
});

describe('applyMood:只改既有对象,零新增灯光', () => {
  function mockSc() {
    return {
      setAtmosphere: vi.fn(),
      s: { fog: { density: 0.006 }, add: vi.fn() },
    };
  }
  it('把 Bloom/曝光/雾密度写到既有对象上', () => {
    const sc = mockSc();
    const m = applyMood(sc, 0.5, {});
    expect(sc.setAtmosphere).toHaveBeenCalledWith({
      bloomStrength: m.bloom,
      bloomThreshold: m.bloomTh,
      exposure: m.exposure,
    });
    expect(sc.s.fog.density).toBeCloseTo(m.fogDensity, 8);
  });
  it('沙暴与轮廓光按 refs 写入(轮廓光=基准+加成,不新增灯)', () => {
    const sc = mockSc();
    const sandMat = { opacity: 0 };
    const rimL = { intensity: 0 };
    const m = applyMood(sc, 0.5, { sandMat, rimL, baseRim: 0.3 });
    expect(sandMat.opacity).toBeCloseTo(m.sandOpacity, 8);
    expect(rimL.intensity).toBeCloseTo(0.3 + m.rimBoost, 8);
  });
  it('**绝不往场景加灯**(灯光预算硬约束)', () => {
    const sc = mockSc();
    applyMood(sc, 0, {});
    applyMood(sc, 1, {});
    expect(sc.s.add).not.toHaveBeenCalled();
  });
  it('后处理未挂载/缺件时静默跳过,不抛(装配顺序容错)', () => {
    expect(() => applyMood(null, 0.5)).not.toThrow();
    expect(() => applyMood({}, 0.5)).not.toThrow();
    expect(() => applyMood({ s: {} }, 0.5)).not.toThrow();
    const sc = { s: { fog: {} } }; // 非 FogExp2(无 density)
    expect(() => applyMood(sc, 0.5)).not.toThrow();
  });
});

// 2026-11-12:水面是自定义 ShaderMaterial,不吃场景灯 ⇒ 必须由氛围层显式喂光照。
// 不喂的话夜里天空全黑、水面仍是白天亮度,画面里出现一片自发光的青绿"地面"。
describe('水面昼夜光照(治夜里水面自发光)', () => {
  const mockSc = () => ({ setAtmosphere: vi.fn(), s: { fog: { density: 0.006 } } });
  // ⚠️ 用**真实 THREE.Color**,不要手写带 setRGB 的替身:
  // 首轮实机报 "setRGB is not a function"(当时 uLight 误建成 Vector3),
  // 而手写替身恰好实现了 setRGB ⇒ 单测全绿却掩盖了真 bug。真实类型才能挡住这类错。
  const mockWater = () => ({ uLight: { value: new THREE.Color(1, 1, 1) } });

  it('白天恰好是 (1,1,1) ⇒ 水面外观与改动前完全一致', () => {
    const m = moodAt(1);
    expect(m.waterR).toBeCloseTo(1, 6);
    expect(m.waterG).toBeCloseTo(1, 6);
    expect(m.waterB).toBeCloseTo(1, 6);
  });
  it('夜里显著压暗(否则水面在夜空里自发光)', () => {
    const night = moodAt(0);
    const noon = moodAt(1);
    expect(night.waterG).toBeLessThan(noon.waterG * 0.35);
    expect(night.waterR).toBeGreaterThan(0); // 不能压成纯黑,要留月光
  });
  it('夜里偏冷(蓝>红,月光感);晨昏偏暖(红>蓝)', () => {
    const night = moodAt(0);
    expect(night.waterB).toBeGreaterThan(night.waterR);
    const dusk = moodAt(0.5);
    expect(dusk.waterR).toBeGreaterThan(dusk.waterB);
  });
  it('写入水面 uniform;缺件时静默跳过不抛', () => {
    const waterU = mockWater();
    const m = applyMood(mockSc(), 0, { waterU });
    expect(waterU.uLight.value.g).toBeCloseTo(m.waterG, 8);
    expect(() => applyMood(mockSc(), 0, {})).not.toThrow();
    expect(() => applyMood(mockSc(), 0, { waterU: {} })).not.toThrow();
  });
  it('全时段不产生 NaN 或负值(负值会让水面出现反相色)', () => {
    for (let e = 0; e <= 1.0001; e += 0.05) {
      const m = moodAt(e);
      for (const k of ['waterR', 'waterG', 'waterB']) {
        expect(Number.isFinite(m[k])).toBe(true);
        expect(m[k]).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
