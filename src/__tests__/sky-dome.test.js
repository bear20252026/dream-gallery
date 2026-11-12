// sky-dome.test.js — 沙漠渐变天穹与粒子圆点的回归锁(2026-11-12 画质)
//
// 锁的是本轮两个「肉眼可见」的修复,防止以后被改回去:
//   ① 天空不再是一整块纯色 —— 天顶色必须与地平线色不同,且日落辉光强于正午;
//   ② 粒子不再是方块 —— 材质必须挂上 map。
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createDesertSky,
  skyGlowStrength,
  ZENITH_NIGHT,
  ZENITH_SUNSET,
  ZENITH_DAY,
} from '../scene/desert/sky-dome.js';
import { softenPoints, softDotTexture } from '../scene/desert/particle-sprite.js';

const W_NIGHT = { wNight: 1, wDusk: 0, wDay: 0 };
const W_DUSK = { wNight: 0, wDusk: 1, wDay: 0 };
const W_DAY = { wNight: 0, wDusk: 0, wDay: 1 };

describe('skyGlowStrength — 辉光随时段', () => {
  it('日落辉光最强(琥珀光集中在太阳方位)', () => {
    expect(skyGlowStrength(W_DUSK)).toBeGreaterThan(skyGlowStrength(W_DAY));
  });
  it('夜里只留一点月华,远弱于日落', () => {
    expect(skyGlowStrength(W_NIGHT)).toBeLessThan(skyGlowStrength(W_DUSK));
    expect(skyGlowStrength(W_NIGHT)).toBeGreaterThan(0);
  });
  it('缺参/脏值不产生 NaN(首帧权重可能还没算好)', () => {
    expect(Number.isFinite(skyGlowStrength({}))).toBe(true);
    expect(Number.isFinite(skyGlowStrength(null))).toBe(true);
    expect(Number.isFinite(skyGlowStrength({ wDusk: 'x' }))).toBe(true);
  });
});

describe('天穹三档天顶色 — 必须彼此不同', () => {
  it('夜/日落/白昼是三种不同的天顶色(否则天空又变回纯色)', () => {
    expect(ZENITH_NIGHT).not.toBe(ZENITH_SUNSET);
    expect(ZENITH_SUNSET).not.toBe(ZENITH_DAY);
    expect(ZENITH_NIGHT).not.toBe(ZENITH_DAY);
  });
});

describe('createDesertSky — 网格与逐帧驱动', () => {
  it('天穹用 BackSide 且不写深度(从内侧看,不遮挡场景)', () => {
    const s = new THREE.Scene();
    const sky = createDesertSky(s);
    expect(sky.mesh.material.side).toBe(THREE.BackSide);
    expect(sky.mesh.material.depthWrite).toBe(false);
    // 天穹自己就是远景,不能再被雾吃一遍
    expect(sky.mesh.material.fog).toBe(false);
    sky.dispose();
  });

  it('半径小于相机 far 2000,否则天穹会被裁掉', () => {
    const s = new THREE.Scene();
    const sky = createDesertSky(s);
    const r = sky.mesh.geometry.parameters.radius;
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(2000);
    sky.dispose();
  });

  it('地平线色跟随雾色 ⇒ 远景与天空无缝', () => {
    const s = new THREE.Scene();
    const sky = createDesertSky(s);
    const fogColor = new THREE.Color(0xd48860);
    sky.update({ fogColor, sunDir: new THREE.Vector3(1, 0, 0), weights: W_DUSK });
    expect(sky.mesh.material.uniforms.uHorizon.value).toBe(fogColor);
    sky.dispose();
  });

  it('天顶色 ≠ 地平线色 ⇒ 天空真的有垂直渐变', () => {
    const s = new THREE.Scene();
    const sky = createDesertSky(s);
    const fogColor = new THREE.Color(0xd48860);
    sky.update({ fogColor, sunDir: new THREE.Vector3(1, 0, 0), weights: W_DUSK });
    const zen = sky.mesh.material.uniforms.uZenith.value;
    expect(zen.equals(fogColor)).toBe(false);
    sky.dispose();
  });

  it('天穹跟随相机位置 ⇒ 走动时永不穿帮', () => {
    const s = new THREE.Scene();
    const sky = createDesertSky(s);
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(120, 8, -60);
    sky.update({
      fogColor: new THREE.Color(0xc8b88a),
      sunDir: new THREE.Vector3(0, 1, 0),
      weights: W_DAY,
      camera: cam,
    });
    expect(sky.mesh.position.x).toBe(120);
    expect(sky.mesh.position.z).toBe(-60);
    sky.dispose();
  });

  it('太阳方向被归一;零向量不污染 uniform', () => {
    const s = new THREE.Scene();
    const sky = createDesertSky(s);
    const u = sky.mesh.material.uniforms;
    sky.update({
      fogColor: new THREE.Color(0xc8b88a),
      sunDir: new THREE.Vector3(30, 40, 0),
      weights: W_DAY,
    });
    expect(u.uSunDir.value.length()).toBeCloseTo(1, 5);
    const before = u.uSunDir.value.clone();
    sky.update({
      fogColor: new THREE.Color(0xc8b88a),
      sunDir: new THREE.Vector3(0, 0, 0),
      weights: W_DAY,
    });
    expect(u.uSunDir.value.equals(before)).toBe(true);
    sky.dispose();
  });

  it('dispose 后从场景移除(切场景不泄漏显存)', () => {
    const s = new THREE.Scene();
    const sky = createDesertSky(s);
    expect(s.children.length).toBe(1);
    sky.dispose();
    expect(s.children.length).toBe(0);
  });
});

// 本套件跑在 node 环境(vitest.config.js: environment:'node',项目未装 jsdom)。
// 贴图要 document.createElement('canvas'),所以这里用一份最小 canvas 替身把
// 「有 DOM」的分支也覆盖到 —— 不新增依赖,也不假装 node 里能真画像素。
// 真实像素效果由实机截图验证(.tmp/mood-shots),这里锁的是**接口契约**。
const hasDom = typeof document !== 'undefined';

/** 装一份最小 canvas 替身,返回还原函数 */
function stubCanvas() {
  const calls = [];
  const grad = { addColorStop: (o, c) => calls.push([o, c]) };
  const ctx2d = {
    createRadialGradient: (...a) => {
      calls.push(['grad', ...a]);
      return grad;
    },
    fillRect: () => calls.push(['fill']),
    set fillStyle(v) {
      calls.push(['fillStyle', v]);
    },
  };
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }),
  };
  return {
    calls,
    restore: () => {
      delete globalThis.document;
    },
  };
}

describe('softenPoints — 粒子不再是方块', () => {
  it('有 DOM 时挂上 map ⇒ 粒子是柔和圆点而不是实心方块', () => {
    if (hasDom) return; // 真有 DOM 的环境由下面那条共享用例覆盖
    const stub = stubCanvas();
    try {
      const mat = new THREE.PointsMaterial({ color: 0xd4a574, size: 0.25 });
      expect(mat.map).toBeNull(); // 前提:原本确实没贴图(这就是方块的成因)
      softenPoints(mat);
      expect(mat.map).not.toBeNull();
      expect(mat.alphaTest).toBeGreaterThan(0);
      // 边缘 alpha 必须归零,否则圆点外缘仍是硬边
      const stops = stub.calls.filter((c) => typeof c[0] === 'number');
      expect(stops.length).toBeGreaterThanOrEqual(2);
      expect(stops[stops.length - 1][1]).toMatch(/,0\)$/);
    } finally {
      stub.restore();
    }
  });

  it('无 DOM 时优雅降级:不抛错、不改材质(不会把画面搞崩)', () => {
    if (hasDom) return;
    // 注意:贴图是**全站共享缓存**,上一条用例已经把它建好了,所以这里不能再断言
    // softDotTexture() 为 null(那是「首次且无 DOM」才成立的)。这里锁的是真正的
    // 降级契约:无论缓存有没有,softenPoints 都不许抛错、不许动颜色尺寸。
    const mat = new THREE.PointsMaterial({ color: 0xd4a574, size: 0.25 });
    expect(() => softenPoints(mat)).not.toThrow();
    expect(mat.color.getHex()).toBe(0xd4a574);
    expect(mat.size).toBe(0.25);
    // 且多次调用返回同一张(共享,不是每次新建)
    expect(softDotTexture()).toBe(softDotTexture());
  });

  it('保留原有颜色与尺寸 ⇒ 只改外观,不动粒子规模', () => {
    const mat = new THREE.PointsMaterial({ color: 0xffdd88, size: 0.5, opacity: 0.7 });
    softenPoints(mat);
    expect(mat.color.getHex()).toBe(0xffdd88);
    expect(mat.size).toBe(0.5);
    expect(mat.opacity).toBe(0.7);
  });

  it('null 材质不抛错(材质可能还没建好)', () => {
    expect(() => softenPoints(null)).not.toThrow();
  });
});
