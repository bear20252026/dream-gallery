// vox-core.js — 体素几何构建核心(2026-11-17 B6 从 koi-ship.js 抽出)
// 自包含:随机数(LCG)/颜色缓存/噪声/Vox 顶点色合并网格 builder/solid 工厂。
// 零业务耦合,可被任何体素场景复用(koi-ship 首个消费者)。
//
// ⚠️ 随机序铁律:_seed 是有状态 LCG,**调用顺序决定几何**。全场景共用一个 core 实例,
//    且组装顺序必须与抽取前逐字一致,否则随机序列漂移、体素布局改变。
//    glowVox/sheetVox 是跨分区累积缓冲,由编排层持有并注入 solid,不在此创建。
import * as THREE from 'three';

/**
 * 创建一个体素核心实例(持有 rng 种子/颜色缓存/体素计数等实例状态)。
 * @param {{seed?:number, defaultMat?:THREE.Material}} [opts] seed 默认 90210;defaultMat 为 solid 缺省材质
 */
export function createVoxCore(opts = {}) {
  let _seed = opts.seed ?? 90210;
  const defaultMat = opts.defaultMat || null;
  function rnd() {
    _seed = (_seed * 1664525 + 1013904223) >>> 0;
    return _seed / 4294967296;
  }
  function rr(a, b) {
    return a + (b - a) * rnd();
  }
  function ri(a, b) {
    return Math.floor(rr(a, b + 1));
  }
  function pick(a) {
    return a[Math.floor(rnd() * a.length)];
  }

  function hash2(x, y) {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }
  function vnoise(x, y) {
    const xi = Math.floor(x),
      yi = Math.floor(y),
      xf = x - xi,
      yf = y - yi;
    const u = xf * xf * (3 - 2 * xf),
      v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi),
      b = hash2(xi + 1, yi),
      c = hash2(xi, yi + 1),
      d = hash2(xi + 1, yi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  const clamp = THREE.MathUtils.clamp;
  const lerp = THREE.MathUtils.lerp;

  const _cc = new Map();
  function C(hex) {
    let c = _cc.get(hex);
    if (!c) {
      c = new THREE.Color(hex);
      _cc.set(hex, c);
    }
    return c;
  }
  function shade(hex, f) {
    f = Math.round(f * 48) / 48;
    const k = hex + ':' + f;
    let c = _cc.get(k);
    if (!c) {
      c = C(hex).clone();
      c.multiplyScalar(f);
      c.r = clamp(c.r, 0, 4);
      c.g = clamp(c.g, 0, 4);
      c.b = clamp(c.b, 0, 4);
      _cc.set(k, c);
    }
    return c;
  }

  /* ---- voxel geometry builder : fast, allocation-light ---- */
  const NORMS = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  const UAX = [
    [0, 0, -1],
    [0, 0, 1],
    [1, 0, 0],
    [1, 0, 0],
    [1, 0, 0],
    [-1, 0, 0],
  ];
  const VAX = [
    [0, 1, 0],
    [0, 1, 0],
    [0, 0, -1],
    [0, 0, 1],
    [0, 1, 0],
    [0, 1, 0],
  ];
  const SIG = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  let VOX_TOTAL = 0;

  class Vox {
    constructor() {
      this.p = [];
      this.n = [];
      this.c = [];
      this.i = [];
      this.v = 0;
      this.boxes = 0;
    }
    box(x, y, z, sx, sy, sz, col) {
      const co = typeof col === 'number' ? C(col) : col;
      const hx = sx * 0.5,
        hy = sy * 0.5,
        hz = sz * 0.5;
      const p = this.p,
        n = this.n,
        c = this.c,
        i = this.i;
      for (let f = 0; f < 6; f++) {
        const N = NORMS[f],
          U = UAX[f],
          V = VAX[f];
        for (let k = 0; k < 4; k++) {
          const su = SIG[k][0],
            sv = SIG[k][1];
          p.push(
            x + (U[0] * su + V[0] * sv) * hx,
            y + (U[1] * su + V[1] * sv) * hy,
            z + (U[2] * su + V[2] * sv) * hz
          );
          n.push(N[0], N[1], N[2]);
          c.push(co.r, co.g, co.b);
        }
        const b = this.v;
        i.push(b, b + 1, b + 2, b, b + 2, b + 3);
        this.v += 4;
      }
      this.boxes++;
      VOX_TOTAL++;
    }
    /* axis aligned block loop */
    fill(x0, x1, y0, y1, z0, z1, col, step = 1) {
      for (let x = x0; x <= x1; x += step)
        for (let y = y0; y <= y1; y += step)
          for (let z = z0; z <= z1; z += step) this.box(x, y, z, step, step, step, col);
    }
    empty() {
      return this.boxes === 0;
    }
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.setIndex(this.i);
      g.computeBoundingSphere();
      return g;
    }
  }

  function solid(vx, opt = {}) {
    if (vx.empty()) return new THREE.Object3D(); // safe no-op so add() never throws
    const m = new THREE.Mesh(vx.build(), opt.mat || defaultMat);
    m.castShadow = false;
    m.receiveShadow = false;
    m.frustumCulled = opt.fc !== false;
    if (opt.name) m.name = opt.name;
    return m;
  }
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

  return {
    rnd,
    rr,
    ri,
    pick,
    hash2,
    vnoise,
    clamp,
    lerp,
    C,
    shade,
    Vox,
    solid,
    v3,
    /** 体素累计计数(只读快照,经 getter 取实时值) */
    get voxelTotal() {
      return VOX_TOTAL;
    },
  };
}
