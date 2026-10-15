// beacon-manager.test.js — 第六轮审计 M-07 的钉子(2026-10-15)
// 这根「走到光柱里收下它」的导引光柱,原来在 7 个文件里各写一遍(scene6-king / scene7-vanity /
// scene7-tippler / scene3-night / late-planets / earth-day 内联 / story-guides)。
// 收拢之后要钉的是那一条**契约**:零 PointLight 的自发光材质、底面高度算法、探针用的 name、
// 同格只立一根、拆必 dispose —— 这五条任何一条被某章顺手改回去,这里要红。
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import {
  BEACON_COLOR,
  createBeacon,
  disposeBeacon,
  pulseBeacon,
  createBeaconKeeper,
} from '../shared/beacon-manager.js';

const ROOT = path.resolve(__dirname, '..', '..');

// 325~330 各章收星屑那根的真实参数(scene7-vanity armMoteBeacon)
const SPEC = { x: 3, z: -7, baseY: 1.5, h: 3.0, r: 0.42, opacity: 0.3, name: 'storyBeaconMote' };

describe('createBeacon:一根光柱的几何与材质', () => {
  it('缩口开口圆柱:顶口 = 半径×0.55、10 段、高即 h —— 七份旧实现逐字相同的那几个数', () => {
    const p = createBeacon(SPEC).geometry.parameters;
    expect(p.radiusTop).toBeCloseTo(0.42 * 0.55, 10);
    expect(p.radiusBottom).toBe(0.42);
    expect(p.height).toBe(3.0);
    expect(p.radialSegments).toBe(10);
    expect(p.openEnded).toBe(true);
  });

  it('底面落在 baseY 上(圆柱中心下移 h/2),lift 只往上抬不沉进地里', () => {
    const m = createBeacon(SPEC);
    expect(m.position.x).toBe(3);
    expect(m.position.z).toBe(-7);
    expect(m.position.y).toBeCloseTo(1.5 + 1.5, 10);
    expect(createBeacon({ ...SPEC, lift: 0.2 }).position.y).toBeCloseTo(1.5 + 1.5 + 0.2, 10);
  });

  it('零 PointLight 铁律:自发光 MeshBasicMaterial + fog:false + depthWrite:false', () => {
    const mat = createBeacon(SPEC).material;
    expect(mat.isMeshBasicMaterial).toBe(true);
    expect(mat.color.getHex()).toBe(BEACON_COLOR);
    expect(BEACON_COLOR).toBe(0xffd9a0);
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBe(0.3);
    expect(mat.depthWrite).toBe(false);
    expect(mat.fog).toBe(false); // 夜里远处也得看得见
    expect(mat.side).toBe(THREE.DoubleSide);
  });

  it('挂进场景树也扫不出点光源(core/light-budget.js 兜底的那条判据)', () => {
    const g = new THREE.Group();
    g.add(createBeacon(SPEC));
    let lights = 0;
    g.traverse((o) => {
      if (o.isPointLight) lights++;
    });
    expect(lights).toBe(0);
  });

  it('name 是给探针断言用的;不传则回落 storyBeacon', () => {
    expect(createBeacon(SPEC).name).toBe('storyBeaconMote');
    expect(createBeacon({ ...SPEC, name: undefined }).name).toBe('storyBeacon');
    expect(createBeacon(SPEC).userData.baseOpacity).toBe(0.3);
  });
});

describe('pulseBeacon / disposeBeacon', () => {
  it('呼吸 = 缓慢自转 + 透明度按 baseOpacity 起伏(与各章 tick 里那份同式)', () => {
    const m = createBeacon(SPEC);
    const t = 1.234;
    pulseBeacon(m, t);
    expect(m.rotation.y).toBeCloseTo(0.004, 10);
    expect(m.material.opacity).toBeCloseTo(0.3 * (0.8 + Math.sin(t * 1.9) * 0.25), 10);
    pulseBeacon(m, t);
    expect(m.rotation.y).toBeCloseTo(0.008, 10);
  });

  it('喂 null 不炸;没有 baseOpacity 的网格不写 NaN 进材质', () => {
    expect(() => pulseBeacon(null, 1)).not.toThrow();
    const m = createBeacon(SPEC);
    delete m.userData.baseOpacity;
    m.material.opacity = 0.77;
    pulseBeacon(m, 2.5);
    expect(m.material.opacity).toBe(0.77);
    expect(m.rotation.y).toBeCloseTo(0.004, 10);
  });

  it('拆:从**它自己所在的**父节点摘掉,几何与材质各 dispose 一次', () => {
    const outer = new THREE.Scene();
    const island = new THREE.Group(); // 星屑挂在岛组下,不是场景根
    island.add(createBeacon(SPEC));
    outer.add(island);
    const m = island.children[0];
    const geo = vi.spyOn(m.geometry, 'dispose');
    const mat = vi.spyOn(m.material, 'dispose');
    expect(disposeBeacon(m)).toBe(true);
    expect(island.children).toHaveLength(0); // 旧写法按场景根 remove,这里会留一个已 dispose 的尾巴
    expect(outer.getObjectByName('storyBeaconMote')).toBeUndefined();
    expect(geo).toHaveBeenCalledTimes(1);
    expect(mat).toHaveBeenCalledTimes(1);
  });

  it('拆一个不存在的句柄 ⇒ false(调用方据此知道是白拆了一回)', () => {
    expect(disposeBeacon(null)).toBe(false);
    expect(disposeBeacon(undefined)).toBe(false);
  });
});

describe('createBeaconKeeper:一格只立一根', () => {
  it('同格重复 arm 返回同一根,场景里也只有一个网格', () => {
    const sc = new THREE.Scene();
    const k = createBeaconKeeper(() => sc);
    const a = k.arm('mote', SPEC);
    const b = k.arm('mote', SPEC);
    expect(b).toBe(a);
    expect(sc.children).toHaveLength(1);
    expect(k.count()).toBe(1);
    expect(k.has('mote')).toBe(true);
    expect(k.get('mote')).toBe(a);
  });

  it('不同格各自独立,keys() 如实记账', () => {
    const sc = new THREE.Scene();
    const k = createBeaconKeeper(() => sc);
    k.arm('mote', SPEC);
    k.arm('door', { ...SPEC, name: 'storyBeaconDoor', h: 3.4, opacity: 0.26 });
    expect(k.keys()).toEqual(['mote', 'door']);
    expect(sc.children).toHaveLength(2);
    expect(k.get('box')).toBeNull();
    expect(k.has('box')).toBe(false);
  });

  it('场景取不到 ⇒ 不立也不记账;场景回来后同格仍能立', () => {
    let sc = null;
    const k = createBeaconKeeper(() => sc);
    expect(k.arm('mote', SPEC)).toBeNull();
    expect(k.count()).toBe(0);
    expect(k.has('mote')).toBe(false);
    sc = new THREE.Scene();
    expect(k.arm('mote', SPEC)).toBeInstanceOf(THREE.Mesh); // 没被上一次的空手挡掉
    expect(sc.children).toHaveLength(1);
  });

  it('spec 可以是函数:坐标按当下场景现算(各章的岛顶/地面高度都这么来)', () => {
    const sc = new THREE.Scene();
    sc.position.set(10, 0, 0);
    const k = createBeaconKeeper(() => sc);
    const m = k.arm('door', (s) => ({ ...SPEC, x: s.position.x + SPEC.x }));
    expect(m.position.x).toBe(13);
  });

  it('remove:没有该格 ⇒ false;有 ⇒ 摘干净并从账上消失,之后再 arm 会重立', () => {
    const sc = new THREE.Scene();
    const k = createBeaconKeeper(() => sc);
    expect(k.remove('mote')).toBe(false);
    const first = k.arm('mote', SPEC);
    const spy = vi.spyOn(first.material, 'dispose');
    expect(k.remove('mote')).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(k.count()).toBe(0);
    expect(sc.children).toHaveLength(0);
    const second = k.arm('mote', SPEC);
    expect(second).not.toBe(first);
    expect(sc.children).toHaveLength(1);
  });

  it('removeAll 一根不留(离开岛屿/换世界时的收尾自检)', () => {
    const sc = new THREE.Scene();
    const k = createBeaconKeeper(() => sc);
    k.arm('mote', SPEC);
    k.arm('door', SPEC);
    expect(k.removeAll()).toBe(2);
    expect(k.count()).toBe(0);
    expect(sc.children).toHaveLength(0);
    expect(k.removeAll()).toBe(0);
  });
});

describe('回归钉子:光柱的材质判据全项目只此一份', () => {
  it('没有第八份 makeBeacon 溜在外面(0xffd9a0 + 开口圆柱 + fog:false 三件套)', () => {
    const files = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== '__tests__') walk(p); // 测试里的桩不算
          continue;
        }
        if (!/\.(js|mjs)$/.test(e.name)) continue;
        const t = fs.readFileSync(p, 'utf8');
        if (
          /0xffd9a0/.test(t) &&
          /CylinderGeometry/.test(t) &&
          /fog:\s*false/.test(t) &&
          /depthWrite:\s*false/.test(t)
        )
          files.push(path.relative(ROOT, p).split(path.sep).join('/'));
      }
    };
    walk(path.join(ROOT, 'src'));
    // 只许命中单一源本身:哪章又内联一根,这条就红(实测 2026-10-15:七份收拢为一份)
    expect(files).toEqual(['src/shared/beacon-manager.js']);
  });
});
