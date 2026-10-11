// dispose-object3d.test.js — 统一资源释放的共享保护契约(2026-10-11 DG-GPU-001)
// 钉死的是**会不会炸画面**这一层:
//   ① 普通 mesh 的 geometry/material/贴图各自只释放一次;
//   ② 声明为 shared 的资源一个都不许碰(画框共享材质 fW/mM 同理);
//   ③ three 的 Sprite 几何是模块级共享单例,第二次释放时也绝不再被调用
//      (对它 dispose 会让全站所有 Sprite 一起消失);
//   ④ 同一 material 被两个 mesh 共用时只 dispose 一次;
//   ⑤ 没有 dispose 方法的对象安全跳过,不抛错。
// 零 three 依赖:实现靠鸭子类型,这里也用手写桩,不需要渲染上下文。
import { describe, it, expect, vi } from 'vitest';
import {
  disposeObject3D,
  isSharedBuiltinGeometry,
  TEXTURE_KEYS,
} from '../shared/dispose-object3d.mjs';

function res(kind) {
  return {
    kind,
    calls: 0,
    dispose() {
      this.calls++;
    },
  };
}

/** 手写 Object3D 桩:只实现本工具用到的 traverse/children/geometry/material 鸭子形状 */
function node(props = {}) {
  const n = Object.assign({ children: [] }, props);
  n.traverse = function (fn) {
    fn(n);
    for (const c of n.children) c.traverse(fn);
  };
  return n;
}

/** three r186 Sprite 内置几何的形状:position/uv 为 InterleavedBufferAttribute、4 顶点、index 6 项 */
function spriteSharedGeometry() {
  const pos = {
    count: 4,
    isInterleavedBufferAttribute: true,
    getX: (i) => (i === 0 ? -0.5 : 0.5),
    dispose() {},
  };
  return {
    calls: 0,
    index: { count: 6 },
    getAttribute: (name) => (name === 'position' ? pos : { count: 4 }),
    dispose() {
      this.calls++;
    },
  };
}

describe('disposeObject3D 资源释放与共享保护', () => {
  it('普通 mesh:geometry + material + 各贴图都被 dispose,且各只一次', () => {
    const geo = res('geometry');
    const parentGeo = res('parent-geometry');
    const mat = res('material');
    const texs = {};
    for (const k of TEXTURE_KEYS) texs[k] = res('texture:' + k);
    for (const [k, t] of Object.entries(texs)) mat[k] = t;
    const g = node({ geometry: parentGeo, children: [node({ geometry: geo, material: mat })] });
    const stats = disposeObject3D(g);
    expect(geo.calls).toBe(1);
    expect(parentGeo.calls).toBe(1);
    expect(stats.geometries).toBe(2); // 父节点与子 mesh 的几何各一次
    expect(mat.calls).toBe(1);
    for (const t of Object.values(texs)) expect(t.calls).toBe(1);
    expect(stats.textures).toBe(TEXTURE_KEYS.length);
  });

  it('声明为 shared 的 geometry/material/贴图一个都不许碰', () => {
    const sharedGeo = res('geometry');
    const sharedMat = res('material');
    const sharedTex = res('texture');
    sharedMat.map = sharedTex;
    const ownGeo = res('own-geometry');
    const tree = node({
      children: [
        node({ geometry: sharedGeo, material: sharedMat }),
        node({ geometry: ownGeo, material: res('own-material') }),
      ],
    });
    const stats = disposeObject3D(tree, { shared: new Set([sharedGeo, sharedMat, sharedTex]) });
    expect(sharedGeo.calls).toBe(0);
    expect(sharedMat.calls).toBe(0); // 共享材质整件不动
    expect(sharedTex.calls).toBe(0); // 连它的贴图一起跳过(材质活着而贴图被释放=闪黑)
    expect(ownGeo.calls).toBe(1);
    expect(stats.skipped).toBeGreaterThan(0);
  });

  it('shared 也接受数组与谓词两种写法', () => {
    const a = res('geometry');
    const b = res('geometry');
    const tree = node({ children: [node({ geometry: a }), node({ geometry: b })] });
    disposeObject3D(tree, { shared: [a] });
    expect(a.calls).toBe(0);
    expect(b.calls).toBe(1);
    disposeObject3D(node({ geometry: a }), { shared: (r) => r === a });
    expect(a.calls).toBe(0);
  });

  it('three 的 Sprite 共享几何:第二次释放(另一棵树里另一只 Sprite)仍不被调用', () => {
    const shared = spriteSharedGeometry();
    const spriteA = node({ isSprite: true, geometry: shared, material: res('spriteMaterial') });
    const spriteB = node({ isSprite: true, geometry: shared, material: res('spriteMaterial') });
    expect(isSharedBuiltinGeometry(shared)).toBe(true);
    disposeObject3D(spriteA); // isSprite 保护
    expect(shared.calls).toBe(0);
    disposeObject3D(spriteB); // 第二次释放:依旧不碰
    expect(shared.calls).toBe(0);
    // 即便对象没标 isSprite,内置单例的形状识别也拦住
    const loose = node({ geometry: shared, material: res('m') });
    disposeObject3D(loose);
    expect(shared.calls).toBe(0);
  });

  it('同一 material 被两个 mesh 共用时只 dispose 一次(其贴图同样只一次)', () => {
    const mat = res('material');
    const tex = res('texture');
    mat.map = tex;
    const tree = node({
      children: [
        node({ geometry: res('g1'), material: mat }),
        node({ geometry: res('g2'), material: mat }),
      ],
    });
    const stats = disposeObject3D(tree);
    expect(mat.calls).toBe(1);
    expect(tex.calls).toBe(1);
    expect(stats.materials).toBe(1);
    expect(stats.textures).toBe(1);
  });

  it('无 dispose 方法的对象安全跳过;material 数组也逐个处理', () => {
    const bare = { note: '我不是 GPU 资源' };
    const ok = res('material');
    const tree = node({ geometry: bare, material: [{ nope: 1 }, ok] });
    expect(() => disposeObject3D(tree)).not.toThrow();
    expect(ok.calls).toBe(1);
    expect(tree.geometry).toBe(bare); // 没被误改
  });

  it('dispose 抛错不中断整棵树,并经 onWarn 留痕', () => {
    const boom = {
      calls: 0,
      dispose() {
        this.calls++;
        throw new Error('GPU 忙');
      },
    };
    const warn = vi.fn();
    const good = res('material');
    const tree = node({ children: [node({ geometry: boom, material: good })] });
    expect(() => disposeObject3D(tree, { onWarn: warn })).not.toThrow();
    expect(good.calls).toBe(1);
    expect(warn).toHaveBeenCalled();
  });

  it('InstancedMesh 先自 dispose(实例缓冲),再释放几何与材质', () => {
    const obj = { self: 0, geometry: res('g'), material: res('m') };
    obj.isInstancedMesh = true;
    obj.dispose = function () {
      this.self++;
    };
    obj.traverse = (fn) => fn(obj);
    disposeObject3D(obj);
    expect(obj.self).toBe(1);
    expect(obj.geometry.calls).toBe(1);
    expect(obj.material.calls).toBe(1);
  });

  it('可传数组根;null/undefined 根不抛', () => {
    const a = node({ geometry: res('g1') });
    const b = node({ geometry: res('g2') });
    disposeObject3D([a, b]);
    expect(a.geometry.calls).toBe(1);
    expect(b.geometry.calls).toBe(1);
    expect(disposeObject3D(null).objects).toBe(0);
    expect(disposeObject3D(undefined).objects).toBe(0);
  });

  it('skipGeometry/skipMaterial/skipTextures 三个开关各自生效', () => {
    const mk = () => {
      const mat = res('m');
      mat.map = res('t');
      return node({ geometry: res('g'), material: mat, mat });
    };
    const t1 = mk();
    disposeObject3D(t1, { skipGeometry: true });
    expect(t1.geometry.calls).toBe(0);
    const t2 = mk();
    disposeObject3D(t2, { skipMaterial: true });
    expect(t2.mat.calls).toBe(0);
    expect(t2.geometry.calls).toBe(1);
    const t3 = mk();
    disposeObject3D(t3, { skipTextures: true });
    expect(t3.mat.calls).toBe(1);
    expect(t3.mat.map.calls).toBe(0);
  });
});
