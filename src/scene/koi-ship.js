// koi-ship.js — 锦鲤飞船「云海之鲤」(2026-11-15)
// 主人提供 voxel-koi-garden-animation.zip(自包含 Three.js 体素场景:巨鲤背驮日式庭园)。
// 本模块把其中的**模型构建**提取为游戏模块,作为可驾驶飞船的默认坐骑,
// 复用 plane-flight 的飞行物理/输入/相机/HUD(不另造第二套飞行)。
// 已剥离原场景自带的渲染器/天空/太阳/环境灯/相机 rig —— 复用游戏的渲染与灯光,
// 不新增灯光预算外的灯(石灯笼点光改为自发光体素),不写阴影(游戏未开 shadowMap)。
// 体素几何为顶点色合并网格,单次 draw call 一类,性能友好。
import * as THREE from 'three';
import { createVoxCore } from '../shared/vox-core.js'; // 体素核心(rng/颜色/Vox/solid),2026-11-17 B6 抽出

export const KOI_SHIP_NAME = { zh: '云海之鲤', en: 'Koi of the Cloud Sea' };

export function createKoiShip(opts = {}) {
  const scale = opts.scale ?? 0.55;
  const root = new THREE.Group();
  root.name = 'koiShip';
  const envGroup = new THREE.Group();
  envGroup.visible = false;
  root.add(envGroup);
  // 原作品 env 函数按 THREE.Scene 形状访问(写 fog 等);这里桥接到环境组,
  // 运行时行为不变,类型上如实声明这层桥接,避免逐处窄化。
  const scene = /** @type {THREE.Scene} */ (/** @type {unknown} */ (envGroup));
  // 原作品 setSun 会写 scene.fog.color;Group 默认无 fog,预置同参数雾避免空引用
  const envFog = new THREE.Fog(0xe08a5a, 260, 1750);
  scene.fog = envFog;
  const koiGroup = new THREE.Group();
  root.add(koiGroup);
  const gardenGroup = new THREE.Group();
  koiGroup.add(gardenGroup);
  const finGroup = new THREE.Group();
  koiGroup.add(finGroup);
  const streamsGroup = new THREE.Group();
  koiGroup.add(streamsGroup);
  const cloudGroup = new THREE.Group();
  root.add(cloudGroup);
  const craneGroup = new THREE.Group();
  root.add(craneGroup);
  const updaters = [];
  const streams = [];
  let waterMat = null,
    waterMesh = null,
    petals = null;
  const matBody = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
    metalness: 0,
  });
  const matSoft = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
  });
  const matGlow = new THREE.MeshBasicMaterial({ vertexColors: true });
  const matSheet = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.15,
    metalness: 0,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    emissive: 0x2d7f9c,
    emissiveIntensity: 0.5,
  });
  const matStream = new THREE.MeshStandardMaterial({
    roughness: 0.12,
    metalness: 0,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    emissive: 0x1d5f7d,
    emissiveIntensity: 0.85,
  });
  const matPetal = new THREE.MeshStandardMaterial({
    roughness: 0.68,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  // 2026-11-17 B6:体素核心(rng/颜色缓存/噪声/Vox/solid/v3)抽到 shared/vox-core.js。
  // 工厂持有实例状态(_seed LCG / _cc 颜色缓存 / VOX_TOTAL 计数),解构同名绑定 ⇒ 下游调用点零改动。
  // ⚠️ 全船共用一个 core 实例,组装顺序逐字不变,否则随机序列漂移、体素布局改变。
  const voxCore = createVoxCore({ seed: 90210, defaultMat: matBody });
  const { rnd, rr, ri, pick, hash2, vnoise, clamp, lerp, C, shade, Vox, solid, v3 } = voxCore;
  // glowVox/sheetVox 是跨分区累积缓冲(茶室写 glowVox、buildWater 写 sheetVox,编排层汇总),留编排层。
  // Vox 实例化必须在类定义之后(类不提升,提前 new 会触发 TDZ ReferenceError)
  const glowVox = new Vox();
  const sheetVox = new Vox();
  const ZH = -34,
    ZT = 34,
    ZLEN = ZT - ZH;
  const KW = [
    [0, 4.0],
    [0.05, 6.6],
    [0.12, 9.4],
    [0.22, 10.8],
    [0.38, 11.2],
    [0.55, 10.95],
    [0.7, 9.9],
    [0.82, 7.6],
    [0.9, 5.2],
    [0.96, 3.4],
    [1, 2.4],
  ];
  const KT = [
    [0, 0.6],
    [0.04, 2.0],
    [0.09, 4.4],
    [0.15, 6.6],
    [0.22, 7.8],
    [0.3, 8.3],
    [0.5, 8.5],
    [0.7, 8.3],
    [0.78, 7.8],
    [0.86, 6.4],
    [0.92, 4.2],
    [0.97, 2.2],
    [1, 1.2],
  ];
  const KB = [
    [0, -2.0],
    [0.05, -4.0],
    [0.12, -6.0],
    [0.25, -7.2],
    [0.45, -7.5],
    [0.62, -7.0],
    [0.78, -5.6],
    [0.88, -3.6],
    [0.96, -1.8],
    [1, -0.9],
  ];
  function kv(k, t) {
    t = clamp(t, 0, 1);
    for (let i = 0; i < k.length - 1; i++) {
      if (t <= k[i + 1][0]) {
        const a = k[i],
          b = k[i + 1];
        const u = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
        const s = u * u * (3 - 2 * u);
        return a[1] + (b[1] - a[1]) * s;
      }
    }
    return k[k.length - 1][1];
  }
  const Tz = (z) => (z - ZH) / ZLEN;
  const hwAt = (z) => kv(KW, Tz(z));
  const topAt = (z) => kv(KT, Tz(z));
  const botAt = (z) => kv(KB, Tz(z));
  function hullTopAt(x, z) {
    const yt = topAt(z),
      yb = botAt(z),
      yc = (yt + yb) / 2,
      hy = (yt - yb) / 2,
      hw = hwAt(z);
    const ax = Math.min(1, Math.abs(x) / Math.max(0.001, hw));
    return yc + hy * Math.sqrt(Math.max(0, 1 - Math.pow(ax, 2.4)));
  }
  function halfWidthAt(z, y) {
    const yt = topAt(z),
      yb = botAt(z),
      yc = (yt + yb) / 2,
      hy = (yt - yb) / 2;
    const yr = clamp((y - yc) / hy, -1, 1),
      b = y > yc ? 2.0 : 1.7;
    return hwAt(z) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(yr), b)), 1 / 2.4);
  }
  function deckTop(z) {
    return Math.min(9.4, topAt(z) + 2.2);
  }
  function plateauHW(z) {
    return Math.max(0, Math.min(hwAt(z) - 1.35, 8.7));
  }
  function groundAt(x, z) {
    const d = deckTop(z),
      a = Math.abs(x);
    let g = d - Math.pow(Math.max(0, (a - 4.9) / 3.9), 1.35) * 4.6;
    g = Math.max(g, hullTopAt(x, z) + 0.5);
    return Math.round(g * 2) / 2;
  }
  /* gravel path polyline */
  const PATH = [
    [-1, -26],
    [-1, -21],
    [-2, -17],
    [-2.5, -13],
    [-2.5, -9],
    [-2, -6],
    [-1.5, -3],
    [-1.5, 1],
    [-1.5, 5],
    [-1.5, 9],
    [-1.5, 13],
    [-1, 16],
    [1, 18.5],
    [3.5, 20],
    [5.5, 20],
  ];
  function distPoly(P, x, z) {
    let m = 1e9;
    for (let i = 0; i < P.length - 1; i++) {
      const ax = P[i][0],
        az = P[i][1],
        bx = P[i + 1][0],
        bz = P[i + 1][1];
      const dx = bx - ax,
        dz = bz - az,
        l2 = dx * dx + dz * dz;
      let u = l2 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
      u = clamp(u, 0, 1);
      const px = ax + u * dx - x,
        pz = az + u * dz - z;
      m = Math.min(m, px * px + pz * pz);
    }
    return Math.sqrt(m);
  }
  const distPath = (x, z) => distPoly(PATH, x, z);
  /* the little rill that carries pond water to the west edge */
  const RILL = [
    [-3.5, 10.5],
    [-4.6, 11.4],
    [-5.7, 11.9],
    [-6.8, 12.4],
    [-7.9, 12.9],
  ];
  const distRill = (x, z) => distPoly(RILL, x, z);
  const POND = { cx: 1.0, cz: 8.0, rx: 5.0, rz: 4.6, floorOff: 2.5, waterY: 8.55 };
  function pondD(x, z) {
    const a = (x - POND.cx) / POND.rx,
      b = (z - POND.cz) / POND.rz;
    return Math.sqrt(a * a + b * b) + (vnoise(x * 0.42, z * 0.42) - 0.5) * 0.09;
  }
  let patches = [];
  function makePatches() {
    const specs = [
      [0.055, 1.45, 4.2, 3.0, 4.6],
      [0.13, 0.42, 4.6, 4.2, 6.0],
      [0.19, -0.62, 4.2, 4.0, 6.4],
      [0.31, 0.95, 5.2, 4.6, 7.0],
      [0.4, -0.25, 4.8, 5.0, 7.4],
      [0.52, 0.55, 4.4, 4.4, 6.6],
      [0.62, -0.85, 4.0, 4.0, 6.0],
      [0.72, 0.3, 3.8, 3.6, 5.4],
      [0.82, -0.45, 3.2, 3.0, 4.4],
      [0.46, 2.6, 3.0, 2.4, 4.0],
      [0.66, 3.4, 2.6, 2.2, 3.6],
    ];
    patches = specs.map((s) => {
      const t = s[0],
        ang = s[1];
      const z = ZH + t * ZLEN,
        hw = hwAt(z),
        yt = topAt(z),
        yb = botAt(z),
        yc = (yt + yb) / 2,
        hy = (yt - yb) / 2;
      return {
        x: hw * Math.cos(ang) * 0.86,
        y: yc + hy * Math.sin(ang) * 0.84,
        z,
        rx: s[2],
        ry: s[3],
        rz: s[4],
      };
    });
  }
  const RED = 0xd3402c,
    RED_D = 0xa82c1c,
    RED_L = 0xe8644c;
  const W_TOP = 0xf8f2e8,
    W_MID = 0xf0e6d8,
    W_BEL = 0xe3d3bf;
  function hullColor(x, y, z) {
    const yt = topAt(z),
      yb = botAt(z);
    const v = clamp((y - yb) / Math.max(0.5, yt - yb), 0, 1);
    let base = v > 0.66 ? W_TOP : v > 0.3 ? W_MID : W_BEL;
    const n = vnoise(x * 0.31 + z * 0.17, y * 0.35);
    let c = shade(base, 0.955 + n * 0.085);
    for (const p of patches) {
      const dx = (x - p.x) / p.rx,
        dy = (y - p.y) / p.ry,
        dz = (z - p.z) / p.rz;
      let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      d += (vnoise(x * 0.26, y * 0.26 + z * 0.21) - 0.5) * 0.62;
      if (d < 0.98) {
        c = d > 0.78 ? shade(RED_D, 1.0) : n > 0.62 ? shade(RED_L, 1.0) : shade(RED, 1.0);
        break;
      }
    }
    return c;
  }
  function buildKoi() {
    makePatches();
    const occ = new Map();
    const key = (x, y, z) => x + 64 + ((y + 64) << 8) + ((z + 72) << 16);
    // --- fill the hull ---
    for (let z = ZH; z <= ZT; z++) {
      const hw = hwAt(z),
        yt = topAt(z),
        yb = botAt(z),
        yc = (yt + yb) / 2,
        hy = (yt - yb) / 2;
      const xr = Math.ceil(hw);
      for (let x = -xr; x <= xr; x++) {
        const ax = Math.abs(x) / hw;
        if (ax > 1) continue;
        const s = Math.pow(Math.max(0, 1 - Math.pow(ax, 2.4)), 1 / 2);
        const top = yc + hy * s,
          bot = yc - hy * Math.pow(Math.max(0, 1 - Math.pow(ax, 2.4)), 1 / 1.7);
        const y1 = Math.round(bot),
          y2 = Math.round(top);
        for (let y = y1; y <= y2; y++) occ.set(key(x, y, z), 1);
      }
    }
    // head shaping : round off the snout tip, notch the mouth
    const snoutF = [0.52, 0.76, 0.93];
    for (let z = ZH; z <= ZH + 2; z++) {
      const f = snoutF[z - ZH],
        lim = hwAt(z) * f;
      for (let x = -8; x <= 8; x++)
        for (let y = -7; y <= 7; y++) if (Math.abs(x) > lim) occ.delete(key(x, y, z));
    }
    for (let z = ZH + 1; z <= ZH + 3; z++)
      for (let x = -3; x <= 3; x++)
        for (let y = -4; y <= -1; y++) {
          if (Math.abs(x) < 2.7 - (z - ZH) * 0.5) occ.delete(key(x, y, z));
        }
    // --- shell cull + run-length emit ---
    const vx = new Vox();
    const get = (x, y, z) => occ.has(key(x, y, z));
    const isShell = (x, y, z) =>
      !(
        get(x + 1, y, z) &&
        get(x - 1, y, z) &&
        get(x, y + 1, z) &&
        get(x, y - 1, z) &&
        get(x, y, z + 1) &&
        get(x, y, z - 1)
      );
    for (let z = ZH; z <= ZT; z++) {
      for (let y = -11; y <= 12; y++) {
        let run = null;
        for (let x = -14; x <= 15; x++) {
          const on = get(x, y, z) && isShell(x, y, z);
          let col = null;
          if (on) {
            col = hullColor(x, y, z);
          }
          if (run && on && col === run.col) {
            run.x1 = x;
          } else {
            if (run) {
              const w = run.x1 - run.x0 + 1;
              vx.box((run.x0 + run.x1) / 2, y, z, w, 1, 1, run.col);
            }
            run = on ? { x0: x, x1: x, col } : null;
          }
        }
        if (run) {
          const w = run.x1 - run.x0 + 1;
          vx.box((run.x0 + run.x1) / 2, y, z, w, 1, 1, run.col);
        }
      }
    }
    // --- mouth interior, gills, lateral sheen ---
    vx.box(0, -2.1, ZH + 1.7, 4.4, 1.9, 1.7, 0x7a4a44);
    vx.box(0, -2.9, ZH + 1.5, 3.2, 0.85, 1.3, 0x5e3630);
    for (const s of [-1, 1]) {
      // gill plate
      for (let z = -25; z <= -21; z++) {
        const hw = halfWidthAt(z, 1.2);
        vx.box(s * (hw - 0.15), 1.2, z, 0.9, 5.0, 1, shade(0xd9c9b6, 0.9));
      }
      // barbels trailing from the jaw
      for (let i = 0; i < 6; i++) {
        vx.box(
          s * (2.6 + i * 0.42),
          -3.5 - i * 0.62,
          ZH + 1.4 + i * 0.9,
          0.75,
          0.75,
          0.95,
          i > 3 ? 0xf6ead9 : 0xe8d8c4
        );
      }
    }
    // --- golden eyes ---
    const eyeGlow = new Vox();
    for (const s of [-1, 1]) {
      const z = -27.5,
        hw = hwAt(z),
        y = 2.2;
      vx.box(s * (hw + 0.15), y, z, 1.1, 3.4, 3.6, shade(0x2c2226, 1));
      vx.box(s * (hw + 0.55), y, z, 0.7, 2.7, 2.9, 0xf3b73c);
      vx.box(s * (hw + 0.85), y, z + 0.15, 0.45, 1.5, 1.5, 0x241a18);
      eyeGlow.box(
        s * (hw + 0.95),
        y + 0.85,
        z - 0.75,
        0.3,
        0.85,
        0.85,
        new THREE.Color().setRGB(3.2, 2.4, 1.0)
      );
      vx.box(s * (hw + 0.35), y - 1.7, z, 1.0, 0.7, 3.2, 0xe9d9c2);
    }
    koiGroup.add(solid(vx, { name: 'koi-hull' }));
    const eg = solid(eyeGlow, { mat: matGlow, cast: false, recv: false });
    if (eg) koiGroup.add(eg);

    // --- red cap on the head ---
    const cap = new Vox();
    for (let z = -33.4; z <= -22.6; z += 1) {
      const t = topAt(z) + 0.55,
        hw = halfWidthAt(z, topAt(z) - 0.7) * 1.02;
      if (hw < 1) continue;
      cap.box(0, t, z, hw * 2, 1.05, 1.02, shade(0xc8341f, 1));
      cap.box(0, t + 0.95, z, hw * 1.74, 0.8, 1.0, shade(0xdc452c, 1));
      if (z > -32 && z < -24) cap.box(0, t - 0.55, z, hw * 2.06, 0.34, 1.02, shade(0x8f2418, 1));
    }
    for (let z = -30.5; z <= -25.5; z += 1) {
      const t = topAt(z) + 1.72,
        hw = halfWidthAt(z, topAt(z) - 1.0) * 0.62;
      if (hw < 0.8) continue;
      cap.box(0, t, z, hw * 2, 0.8, 1, shade(0xe8543a, 1));
    }
    cap.box(0, topAt(-28) + 2.35, -28, 2.4, 0.9, 3.0, shade(0xf06444, 1));
    cap.box(0, topAt(-28) + 2.95, -28, 1.4, 0.8, 1.8, 0xe7b96b);
    // brim over the snout + gold band
    for (let x = -3; x <= 3; x++) {
      const z = -33.1 - Math.abs(x) * 0.13;
      cap.box(x, topAt(z) - 0.1, z - 0.55, 1, 0.5, 1.7, shade(0xa82b1a, 1));
    }
    for (let z = -32; z <= -30; z++)
      cap.box(0, topAt(z) + 0.15, z, halfWidthAt(z, topAt(z) - 0.9) * 2.2, 0.34, 1.0, 0xe7b96b);
    koiGroup.add(solid(cap, { name: 'cap' }));

    buildFins();
    buildTail();
  }

  /* ---- fins : nested pivot chains ---- */
  function finSegment(len, rootW, tipW, thick, side, colA, colB, taperBack) {
    const vx = new Vox();
    const steps = Math.max(2, Math.round(len));
    for (let i = 0; i < steps; i++) {
      const u0 = i / steps,
        u1 = (i + 1) / steps;
      const w = lerp(rootW, tipW, (u0 + u1) / 2);
      const x = side * lerp(0, len, (u0 + u1) / 2);
      const y = -u1 * u1 * 1.5;
      const z = taperBack * u1;
      const c = i % 2 === 0 ? colA : colB;
      vx.box(x, y, z, Math.max(0.8, len / steps + 0.06), thick * (1 - u1 * 0.45), w, c);
      // trailing fringe
      if (u1 > 0.45)
        vx.box(
          x,
          y - thick * 0.5,
          z + w * 0.42,
          Math.max(0.8, len / steps),
          thick * 0.5,
          0.7,
          shade(colB, 0.92)
        );
    }
    return vx;
  }
  function buildFinChain(rootPos, side, segs, anim) {
    let parent = finGroup;
    const nodes = [];
    const pivot = new THREE.Object3D();
    pivot.position.copy(rootPos);
    parent.add(pivot);
    nodes.push(pivot);
    let cur = pivot;
    segs.forEach((s, i) => {
      const vx = finSegment(s.len, s.w0, s.w1, s.th, side, s.c1, s.c2, s.back || 0);
      const m = solid(vx, { cast: i < 2, recv: false });
      cur.add(m);
      const nxt = new THREE.Object3D();
      nxt.position.set(side * s.len, -s.len * 0.06, (s.back || 0) * 0.9);
      cur.add(nxt);
      nodes.push(nxt);
      cur = nxt;
    });
    updaters.push((dt, t) => {
      for (let i = 1; i < nodes.length; i++) anim(nodes[i], t, i - 1, side);
    });
    return nodes;
  }
  function buildFins() {
    const W1 = 0xf6efe4,
      W2 = 0xe9dccb,
      P1 = 0xf3c9cf,
      P2 = 0xe8a9b6;
    const finAnim = (n, t, i, side) => {
      n.rotation.y = side * Math.sin(t * 1.15 - i * 0.62) * (0.1 + i * 0.045);
      n.rotation.z = side * (-0.07 + Math.sin(t * 1.15 - i * 0.62 + 1.1) * (0.07 + i * 0.03));
      n.rotation.x = Math.sin(t * 0.8 - i * 0.5) * 0.035;
    };
    const yr = -2.2,
      zr = -24.5;
    buildFinChain(
      v3(8.6, yr, zr),
      1,
      [
        { len: 5.5, w0: 7.5, w1: 6.6, th: 1.05, c1: W1, c2: W2, back: 1.2 },
        { len: 5.0, w0: 6.4, w1: 4.6, th: 0.85, c1: P1, c2: W1, back: 1.4 },
        { len: 4.2, w0: 4.2, w1: 1.8, th: 0.6, c1: P2, c2: P1, back: 1.1 },
      ],
      finAnim
    );
    buildFinChain(
      v3(-8.6, yr, zr),
      -1,
      [
        { len: 5.5, w0: 7.5, w1: 6.6, th: 1.05, c1: W1, c2: W2, back: 1.2 },
        { len: 5.0, w0: 6.4, w1: 4.6, th: 0.85, c1: W1, c2: P1, back: 1.4 },
        { len: 4.2, w0: 4.2, w1: 1.8, th: 0.6, c1: P1, c2: P2, back: 1.1 },
      ],
      finAnim
    );

    // dorsal fin (behind the garden) — rides the curve of the back
    const dn = [];
    const dY = (z) => topAt(Math.min(z, 33.6)) + 0.25;
    const droot = new THREE.Object3D();
    droot.position.set(0, dY(21), 21);
    finGroup.add(droot);
    dn.push(droot);
    let dpar = droot;
    const dH = [5.2, 6.4, 5.4, 3.8, 2.4];
    for (let i = 0; i < 5; i++) {
      const z = 21 + i * 2.5,
        h = dH[i];
      const seg = new Vox();
      for (let k = 0; k < Math.ceil(h); k++) {
        const u = k / h;
        seg.box(
          0,
          k * 0.9 + 0.5,
          1.25,
          1.05 - 0.3 * u,
          1.0,
          2.8 - 1.4 * u,
          k > h - 2.2 ? P1 : k % 2 ? W1 : W2
        );
        if (u > 0.35 && u < 0.9)
          seg.box(0, k * 0.9 + 0.95, 1.25, 0.5, 0.5, 2.2 - 1.2 * u, shade(P1, 1.02));
      }
      dpar.add(solid(seg, { cast: false, recv: false }));
      const nx = new THREE.Object3D();
      nx.position.set(0, dY(z + 2.5) - dY(z), 2.5);
      dpar.add(nx);
      dpar = nx;
      dn.push(nx);
    }
    updaters.push((dt, t) => {
      for (let i = 1; i < dn.length; i++) {
        dn[i].rotation.y = Math.sin(t * 1.5 - i * 0.55) * (0.05 + i * 0.035);
        dn[i].rotation.z = Math.sin(t * 1.1 - i * 0.5) * 0.03;
      }
    });

    // pelvic + anal fins
    const small = (pos, side, sc) => {
      const p = new THREE.Object3D();
      p.position.copy(pos);
      finGroup.add(p);
      const vx = finSegment(4.2 * sc, 3.4 * sc, 1.2 * sc, 0.55 * sc, side, W1, P1, 0.6);
      p.add(solid(vx, { cast: false, recv: false }));
      updaters.push((dt, t) => {
        p.rotation.y = side * Math.sin(t * 1.3 + pos.z * 0.2) * 0.16;
        p.rotation.z = side * (-0.1 + Math.sin(t * 1.3 + pos.z * 0.2) * 0.09);
      });
    };
    small(v3(6.3, -5.6, -2), 1, 0.85);
    small(v3(-6.3, -5.6, -2), -1, 0.85);
    small(v3(5.0, -4.4, 17), 1, 0.7);
    small(v3(-5.0, -4.4, 17), -1, 0.7);
  }

  /* ---- butterfly tail ---- */
  function buildTail() {
    const W1 = 0xf8f2e8,
      W2 = 0xead9c6,
      P1 = 0xf6cdd4,
      P2 = 0xefa6b6,
      R1 = 0xe2705c;
    const widths = [6.5, 10.5, 14.5, 16.5, 14.5, 10.5, 6.5, 3.6];
    const nodes = [];
    /** @type {THREE.Object3D} */
    let cur = finGroup;
    const root = new THREE.Object3D();
    root.position.set(0, -0.2, 32);
    finGroup.add(root);
    cur = root;
    nodes.push(root);
    for (let i = 0; i < widths.length; i++) {
      const w = widths[i],
        L = 3.6;
      const vx = new Vox();
      const steps = Math.ceil(w);
      for (let s = 1; s <= steps; s++) {
        const u = s / steps;
        const th = 1.15 * (1 - u * 0.55);
        const drop = -Math.pow(u, 2.1) * 4.4 + Math.pow(u, 4) * 2.2;
        const col = u > 0.86 ? (i % 2 ? P2 : P1) : u > 0.6 ? (i % 2 ? W1 : P1) : i % 2 ? W1 : W2;
        for (const side of [-1, 1]) {
          vx.box(side * (s - 0.5), drop, i * 0.14, 1, th, L + 0.12, shade(col, 1 - u * 0.06));
          if (u > 0.55)
            vx.box(
              side * (s - 0.5),
              drop - th * 0.8,
              i * 0.14 + 0.5,
              1,
              th * 0.55,
              L * 0.6,
              shade(P1, 1.02)
            );
        }
      }
      // central fork
      vx.box(0, 0.3 - i * 0.12, 0, 2.2, 1.5 - i * 0.1, L, shade(i > 3 ? P1 : W2, 1));
      if (i === 2 || i === 3) {
        vx.box(0, 1.4, 0, 1.2, 1.4, 2.6, shade(R1, 1));
      }
      const m = solid(vx, { cast: i < 3, recv: false });
      cur.add(m);
      const nx = new THREE.Object3D();
      nx.position.set(0, -0.35 - i * 0.16, L);
      cur.add(nx);
      cur = nx;
      nodes.push(nx);
    }
    // long trailing ribbons (butterfly streamers)
    const ribbons = [];
    [2, 3, 4].forEach((attach, k) => {
      for (const side of [-1, 1]) {
        let p = nodes[attach];
        const anchor = new THREE.Object3D();
        anchor.position.set(side * (widths[attach] - 1.4 - k * 1.6), -1.4 - k * 0.5, 1.2);
        p.add(anchor);
        const chain = [anchor];
        let c2 = anchor;
        const segs = 9;
        for (let i = 0; i < segs; i++) {
          const u = i / segs;
          const vx = new Vox();
          const w = lerp(3.2, 0.7, u),
            th = lerp(0.55, 0.28, u);
          vx.box(0, -u * u * 2.2, 1.6, w, th, 3.4, shade(u > 0.72 ? P2 : i % 2 ? W1 : P1, 1));
          vx.box(0, -u * u * 2.2 - th * 0.5, 1.6, w * 0.5, th * 0.5, 3.2, shade(P2, 0.96));
          const m = solid(vx, { cast: false, recv: false });
          c2.add(m);
          const nx = new THREE.Object3D();
          nx.position.set(side * (0.25 + u * 0.5), -u * 1.05, 3.2);
          c2.add(nx);
          c2 = nx;
          chain.push(nx);
        }
        ribbons.push({ chain, side, phase: k * 0.7 + attach * 0.2 });
      }
    });
    updaters.push((dt, t) => {
      for (let i = 1; i < nodes.length; i++) {
        const k = i / nodes.length;
        nodes[i].rotation.y = Math.sin(t * 1.45 - i * 0.62) * (0.055 + k * 0.19);
        nodes[i].rotation.z = Math.sin(t * 1.05 - i * 0.5) * (0.02 + k * 0.05);
        nodes[i].rotation.x = Math.sin(t * 0.9 - i * 0.42) * 0.035 * k;
      }
      for (const r of ribbons) {
        for (let i = 1; i < r.chain.length; i++) {
          const k = i / r.chain.length;
          r.chain[i].rotation.y = r.side * Math.sin(t * 1.7 - i * 0.55 - r.phase) * (0.1 + k * 0.2);
          r.chain[i].rotation.z =
            r.side * Math.sin(t * 1.25 - i * 0.42 - r.phase) * (0.06 + k * 0.1);
          r.chain[i].rotation.x = Math.sin(t * 1.5 - i * 0.5 - r.phase) * 0.07;
        }
      }
    });
  }
  const GZ0 = -27.5,
    GZ1 = 27.5;
  const COL = {
    grass: 0x7fa352,
    grass2: 0x8fb45c,
    grass3: 0x6b8f45,
    moss: 0x6f9a4a,
    gravel: 0xd2c9b6,
    gravel2: 0xc3b9a4,
    stone: 0x918b81,
    stone2: 0x7d776e,
    soil: 0x6d5541,
    rock: 0x7b6a5c,
    mud: 0x40534c,
  };

  function buildTerrain() {
    const vx = new Vox();
    for (let z = Math.round(GZ0); z <= Math.round(GZ1); z++) {
      const maxHW = plateauHW(z);
      if (maxHW < 2.2 || topAt(z) < 4.4) continue;
      let run = null;
      const flush = () => {
        if (!run) return;
        const w = run.x1 - run.x0 + 1,
          cx = (run.x0 + run.x1) / 2;
        vx.box(cx, run.top - 0.24, z, w, 0.5, 1, run.cap);
        const h = run.top - 0.5 - run.bot;
        if (h > 0.05) vx.box(cx, run.bot + h / 2, z, w, h, 1, run.sub);
        if (run.rim) vx.box(cx, run.top + 0.34, z, w, 0.7, 1, run.rim);
        run = null;
      };
      for (let x = -10; x <= 10; x++) {
        let cell = null;
        if (Math.abs(x) <= maxHW) {
          const pd = pondD(x, z);
          const d = deckTop(z);
          if (pd < 0.985) {
            cell = {
              top: d - POND.floorOff,
              bot: hullTopAt(x, z),
              cap: COL.mud,
              sub: 0x4d5f58,
              rim: null,
            };
            if (pd > 0.8 && hash2(x * 3.1, z * 2.7) > 0.55) cell.cap = 0x556b52;
          } else if (pd < 1.16 && distRill(x, z) > 0.95) {
            const weir = Math.abs(z - POND.cz) < 1.6 && x > POND.cx;
            cell = {
              top: weir ? d - 0.95 : d + 0.22,
              bot: hullTopAt(x, z),
              cap: weir ? 0x6f8a80 : COL.stone,
              sub: COL.rock,
              rim: null,
            };
          } else if (distRill(x, z) < 1.05) {
            const g = groundAt(x, z),
              wet = distRill(x, z) < 0.62;
            cell = {
              top: g - (wet ? 1.0 : 0.42),
              bot: hullTopAt(x, z) - 0.2,
              cap: wet ? 0x4d6b64 : COL.stone2,
              sub: COL.rock,
              rim: null,
            };
          } else {
            const g = groundAt(x, z);
            const onPath = distPath(x, z) < 1.15;
            const n = hash2(x * 1.7, z * 2.3);
            let cap = onPath
              ? n > 0.5
                ? COL.gravel
                : COL.gravel2
              : n > 0.72
                ? COL.grass2
                : n > 0.34
                  ? COL.grass
                  : COL.grass3;
            if (pd < 1.55 && !onPath) cap = n > 0.5 ? COL.moss : COL.grass3;
            const edge = Math.abs(x) > maxHW - 1.1;
            cell = {
              top: g,
              bot: hullTopAt(x, z) - 0.2,
              cap,
              sub: edge ? COL.rock : COL.soil,
              rim: edge ? (n > 0.5 ? COL.stone2 : COL.stone) : null,
            };
          }
        }
        if (
          run &&
          cell &&
          cell.top === run.top &&
          cell.cap === run.cap &&
          cell.sub === run.sub &&
          cell.rim === run.rim &&
          Math.abs(cell.bot - run.bot) < 0.6
        ) {
          run.x1 = x;
          run.bot = Math.min(run.bot, cell.bot);
        } else {
          flush();
          if (cell)
            run = {
              x0: x,
              x1: x,
              top: cell.top,
              bot: cell.bot,
              cap: cell.cap,
              sub: cell.sub,
              rim: cell.rim,
            };
        }
      }
      flush();
    }
    // pebbles, moss tufts, small stones
    for (let i = 0; i < 230; i++) {
      const z = rr(GZ0 + 2, GZ1 - 2),
        x = rr(-7.6, 7.6);
      if (Math.abs(x) > plateauHW(z) - 0.8) continue;
      if (pondD(x, z) < 1.2) continue;
      const g = groundAt(Math.round(x), Math.round(z));
      const onP = distPath(x, z) < 1.3;
      if (onP && rnd() > 0.4) continue;
      const s = rr(0.3, 0.75);
      vx.box(
        x,
        g + 0.18,
        z,
        s,
        rr(0.25, 0.55),
        s,
        onP ? (rnd() > 0.5 ? COL.stone2 : COL.gravel2) : pick([COL.moss, COL.grass3, COL.stone2])
      );
    }
    gardenGroup.add(solid(vx, { name: 'terrain' }));

    // rocks around pond edge
    const rv = new Vox();
    for (let i = 0; i < 16; i++) {
      const a = rnd() * Math.PI * 2,
        rx = POND.rx * rr(0.95, 1.2),
        rz = POND.rz * rr(0.95, 1.2);
      const x = POND.cx + Math.cos(a) * rx,
        z = POND.cz + Math.sin(a) * rz;
      if (Math.abs(x) > plateauHW(z) - 0.6) continue;
      const g = groundAt(Math.round(x), Math.round(z));
      const s = rr(0.7, 1.7);
      rv.box(
        x,
        g + s * 0.4,
        z,
        s,
        s * rr(0.7, 1.3),
        s * rr(0.8, 1.2),
        rnd() > 0.5 ? COL.stone : COL.stone2
      );
      if (rnd() > 0.5)
        rv.box(x + s * 0.3, g + s * 0.9, z - s * 0.2, s * 0.5, s * 0.45, s * 0.5, COL.stone2);
      if (rnd() > 0.45)
        rv.box(x - s * 0.35, g + s * 0.75, z + s * 0.3, s * 0.4, 0.3, s * 0.4, COL.moss);
    }
    gardenGroup.add(solid(rv, {}));
  }

  function buildTeaHouse() {
    const vx = new Vox();
    const WOOD = 0x6d4a34,
      WOOD2 = 0x82593c,
      WOOD_D = 0x4a3122,
      PLASTER = 0xe8dcc6,
      TILE = 0x3b4759,
      TILE2 = 0x2e3949,
      TILE3 = 0x4c5a6d;
    const x0 = -7,
      x1 = 2,
      z0 = -15,
      z1 = -5;
    const gy = groundAt(-2.5, -10);
    const deck = gy + 1.35;
    // stone footing + posts
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        if ((x + z) % 3 === 0) vx.box(x, gy + 0.25, z, 1, 0.5, 1, COL.stone2);
      }
    vx.box((x0 + x1) / 2, gy + 0.85, (z0 + z1) / 2, x1 - x0 + 1, 1.1, z1 - z0 + 1, WOOD_D);
    const posts = [];
    for (const px of [x0, x0 + (x1 - x0) / 2, x1])
      for (const pz of [z0, z1]) {
        posts.push([px, pz]);
      }
    posts.push([x0, -10], [x1, -10], [(x0 + x1) / 2, z0], [(x0 + x1) / 2, z1]);
    posts.forEach(([px, pz]) => {
      vx.box(px, deck + 1.6, pz, 0.62, 3.4, 0.62, WOOD);
    });
    // floor
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) vx.box(x, deck, z, 0.98, 0.32, 0.98, x % 2 ? WOOD2 : WOOD);
    // veranda + steps
    for (let x = x0 - 0.6; x <= x1 + 0.6; x++)
      for (let z = z1; z <= z1 + 1.6; z++) vx.box(x, deck - 0.28, z, 0.98, 0.26, 0.98, WOOD2);
    vx.box(-2.5, gy + 0.6, z1 + 2.2, 3, 0.5, 1.2, COL.stone);
    vx.box(-2.5, gy + 1.0, z1 + 1.7, 3, 0.5, 0.9, COL.stone2);
    // walls : plaster + shoji (glow) + lattice
    const SHOJI = new THREE.Color().setRGB(2.05, 1.22, 0.58);
    const wall = (xs, xe, zs, ze, horiz) => {
      for (let i = xs; i <= xe; i++)
        for (let j = zs; j <= ze; j++) {
          const x = horiz ? i : xs,
            z = horiz ? zs : j;
          const edge = horiz ? i === xs || i === xe : j === zs || j === ze;
          if (edge || (horiz ? z === z1 && i === -2 : false)) {
            vx.box(x, deck + 1.7, z, 0.94, 3.4, 0.94, edge ? WOOD : 0x2c1e1a);
            continue;
          }
          // paper panel glowing from within, framed by lattice
          glowVox.box(x, deck + 1.62, z, 0.78, 2.45, 0.78, SHOJI);
          vx.box(x, deck + 3.05, z, 1.0, 0.52, 1.0, WOOD);
          vx.box(x, deck + 0.34, z, 1.0, 0.56, 1.0, WOOD_D);
          for (let k = -1; k <= 1; k++)
            vx.box(x, deck + 1.62 + k * 0.82, z, 1.02, 0.13, 1.02, WOOD_D);
          if (horiz) vx.box(x, deck + 1.62, z, 0.14, 2.5, 1.02, WOOD_D);
          else vx.box(x, deck + 1.62, z, 1.02, 2.5, 0.14, WOOD_D);
          if ((i + j) % 4 === 0) vx.box(x, deck + 2.9, z - 0.0, 1.0, 0.3, 1.0, PLASTER);
        }
    };
    wall(x0, x1, z0, z0, true);
    wall(x0, x1, z1, z1, true);
    wall(x0, x0, z0, z1, false);
    wall(x1, x1, z0, z1, false);
    // threshold stone at the entrance
    vx.box(-2, deck - 0.1, z1 + 1.0, 2.2, 0.3, 1.1, COL.stone);
    // roof
    const rx0 = x0 - 2.0,
      rx1 = x1 + 2.0,
      rz0 = z0 - 2.1,
      rz1 = z1 + 2.1;
    const cxr = (x0 + x1) / 2,
      hwR = (rx1 - rx0) / 2,
      hdR = (rz1 - rz0) / 2;
    const baseY = deck + 3.25,
      H = 5.1;
    for (let ix = Math.round(rx0); ix <= Math.round(rx1); ix++) {
      const u = Math.abs(ix - cxr) / hwR;
      for (let iz = Math.round(rz0); iz <= Math.round(rz1); iz++) {
        const uz = Math.abs(iz - (z0 + z1) / 2) / hdR;
        let y =
          baseY +
          H * Math.pow(1 - Math.min(1, u), 1.85) +
          1.5 * Math.pow(Math.max(0, u - 0.8) / 0.2, 2.0) +
          1.2 * Math.pow(Math.max(0, uz - 0.82) / 0.18, 2.0);
        const yq = Math.round(y * 2) / 2;
        const c = (ix + iz) % 2 ? TILE : TILE2;
        vx.box(ix, yq, iz, 1.02, 0.62, 1.02, c);
        vx.box(ix, yq - 0.6, iz, 0.96, 0.5, 0.96, TILE2);
        if (u > 0.9 || uz > 0.9) vx.box(ix, yq - 0.9, iz, 0.4, 1.0, 0.4, WOOD_D);
      }
    }
    // ridge
    for (let iz = Math.round(rz0); iz <= Math.round(rz1); iz++) {
      vx.box(cxr, baseY + H + 0.45, iz, 1.5, 0.85, 1.02, TILE3);
      vx.box(cxr, baseY + H + 0.95, iz, 1.0, 0.4, 0.9, TILE2);
    }
    for (const zz of [rz0, rz1]) {
      vx.box(cxr, baseY + H + 1.5, zz, 1.5, 1.6, 0.9, TILE3);
      vx.box(cxr, baseY + H + 2.2, zz, 0.7, 0.7, 0.7, 0xe7b96b);
    }
    // eave fascia
    for (const ix of [Math.round(rx0), Math.round(rx1)]) {
      const u = Math.abs(ix - cxr) / hwR;
      const y = baseY + 1.5 * Math.pow(Math.max(0, u - 0.8) / 0.2, 2.0);
      for (let iz = Math.round(rz0); iz <= Math.round(rz1); iz++)
        vx.box(ix, y - 0.5, iz, 0.55, 1.2, 1.0, WOOD_D);
    }
    gardenGroup.add(solid(vx, { name: 'teahouse' }));

    // hanging paper lanterns
    const lantern = (x, y, z, col, scale, hdr) => {
      const p = new THREE.Object3D();
      p.position.set(x, y, z);
      gardenGroup.add(p);
      const lx = new Vox(),
        lg = new Vox();
      lx.box(0, 0.9 * scale, 0, 0.14, 1.8 * scale, 0.14, 0x3a2a20);
      lx.box(0, 0.05 * scale, 0, 1.05 * scale, 0.32, 1.05 * scale, 0x2e2119);
      lx.box(0, -1.55 * scale, 0, 1.05 * scale, 0.32, 1.05 * scale, 0x2e2119);
      for (let i = 0; i < 6; i++) {
        const u = i / 5,
          w = (1.05 - Math.pow(Math.abs(u - 0.5) * 2, 2) * 0.42) * scale;
        lx.box(
          0,
          (0 - i * 0.5) * scale - 0.1 * scale,
          0,
          w * 1.05,
          0.52 * scale,
          w * 1.05,
          i % 2 ? col : shade(col, 0.92)
        );
        lg.box(0, (0 - i * 0.5) * scale - 0.1 * scale, 0, w * 0.82, 0.48 * scale, w * 0.82, hdr);
      }
      lx.box(0, -1.95 * scale, 0, 0.2, 0.42 * scale, 0.2, 0x3a2a20);
      p.add(solid(lx, { cast: false, recv: false }));
      p.add(solid(lg, { mat: matGlow, cast: false, recv: false }));
      updaters.push((dt, t) => {
        p.rotation.z = Math.sin(t * 0.85 + x) * 0.07;
        p.rotation.x = Math.cos(t * 0.7 + z) * 0.05;
      });
      return p;
    };
    const warm = new THREE.Color().setRGB(2.6, 1.5, 0.7);
    lantern(
      rx0 + 0.9,
      baseY + 0.2,
      z0 + 2.6,
      0xd8452f,
      0.95,
      new THREE.Color().setRGB(2.4, 0.95, 0.5)
    );
    lantern(rx1 - 0.9, baseY + 0.2, z1 - 2.6, 0xf0e2c8, 0.88, warm);
    lantern(-2.5, deck + 2.4, z1 + 1.5, 0xd8452f, 0.72, new THREE.Color().setRGB(2.5, 1.0, 0.5));
  }

  /* ---- torii gate ---- */
  function buildTorii() {
    const vx = new Vox();
    const R = 0xc8362a,
      R2 = 0xa72a1e,
      K = 0x2f2622,
      G = 0xe7b96b;
    const cz = -22,
      cx = -1;
    const g = groundAt(cx, cz);
    const H = 11.2,
      span = 5.4;
    for (const s of [-1, 1]) {
      const x = cx + (s * span) / 2;
      const gg = groundAt(Math.round(x), cz);
      vx.box(x, gg + 0.35, 0 + cz, 2.3, 0.7, 2.3, COL.stone2);
      for (let i = 0; i < Math.round(H); i++) {
        const u = i / H;
        const w = 1.35 - u * 0.34;
        vx.box(x - s * u * 0.5, gg + 0.7 + i, cz, w, 1.02, w, i < 1 ? K : R);
      }
      vx.box(x - s * 0.55, g + H + 0.4, cz, 1.5, 0.8, 1.5, R2);
    }
    // nuki (lower beam)
    const nb = g + H * 0.58;
    vx.box(cx, nb, cz, span + 3.2, 1.05, 1.15, R2);
    vx.box(cx, nb, cz, span + 3.4, 0.3, 1.3, R);
    // kusabi wedges
    for (const s of [-1, 1]) vx.box(cx + (s * span) / 2, nb + 0.75, cz, 0.45, 0.7, 0.5, K);
    // gakuzuka + plaque
    vx.box(cx, nb + 1.4, cz, 0.8, 1.9, 0.8, R);
    vx.box(cx, nb + 1.5, cz - 0.55, 1.7, 1.3, 0.22, G);
    vx.box(cx, nb + 1.5, cz - 0.7, 1.2, 0.8, 0.1, 0x2f2622);
    // kasagi (curved top lintel)
    const topY = g + H + 1.1;
    for (let i = -9; i <= 9; i++) {
      const u = Math.abs(i) / 9;
      const y = topY + Math.pow(u, 2.4) * 1.9;
      vx.box(cx + i * 0.86, y, cz, 0.92, 0.95, 2.5, K);
      vx.box(cx + i * 0.86, y + 0.68, cz, 0.92, 0.55, 2.1, i % 2 ? R2 : R);
      if (u > 0.88) vx.box(cx + i * 0.86, y + 1.2, cz, 0.9, 0.7, 1.7, K);
    }
    vx.box(cx, topY + 0.35, cz, 16.6, 0.5, 1.5, R);
    gardenGroup.add(solid(vx, { name: 'torii' }));
  }

  /* ---- red arched bridge ---- */
  function buildBridge() {
    const vx = new Vox();
    const R = 0xc8362a,
      R2 = 0xa82a1e,
      G = 0xe7b96b,
      K = 0x33282a;
    const bx = -1.5,
      z0 = 1.4,
      z1 = 14.6,
      rise = 2.5;
    const archY = (u) =>
      groundAt(Math.round(bx), Math.round(lerp(z0, z1, u))) +
      0.25 +
      rise * Math.sin(Math.PI * Math.pow(u, 0.92));
    const steps = Math.round(z1 - z0);
    for (let i = 0; i <= steps; i++) {
      const u = i / steps,
        z = lerp(z0, z1, u),
        y = Math.round(archY(u) * 2) / 2;
      vx.box(bx, y, z, 3.5, 0.42, 1.06, i % 2 ? R : R2);
      vx.box(bx, y - 0.42, z, 3.2, 0.42, 1.0, R2);
      // railings
      if (i % 2 === 0) {
        for (const s of [-1, 1]) {
          vx.box(bx + s * 1.75, y + 0.85, z, 0.34, 1.5, 0.34, R);
          vx.box(bx + s * 1.75, y + 1.7, z, 0.5, 0.28, 1.1, R2);
        }
      }
      if (i === 0 || i === steps) {
        for (const s of [-1, 1]) {
          vx.box(bx + s * 1.75, y + 2.4, z, 0.62, 2.6, 0.62, R);
          vx.box(bx + s * 1.75, y + 3.85, z, 0.5, 0.7, 0.5, G);
          vx.box(bx + s * 1.75, y + 4.35, z, 0.3, 0.4, 0.3, G);
        }
      }
    }
    // under-arch beams
    for (let i = 1; i < steps; i += 3) {
      const u = i / steps,
        z = lerp(z0, z1, u),
        y = archY(u);
      for (const s of [-1, 1]) vx.box(bx + s * 1.4, y - 0.95, z, 0.4, 0.5, 2.6, K);
    }
    gardenGroup.add(solid(vx, { name: 'bridge' }));
  }

  /* ---- cherry trees ---- */
  const blossomEmitters = [];
  function buildTree(x, z, scale, lean) {
    const vx = new Vox();
    const g = groundAt(Math.round(x), Math.round(z));
    const BARK = 0x5a4034,
      BARK2 = 0x6d4f3e;
    const BH = 4.6 * scale;
    // trunk
    let tx = x,
      tz = z;
    for (let i = 0; i < Math.round(BH); i++) {
      const u = i / BH;
      tx += lean * 0.16 * scale;
      tz += lean * 0.05 * scale;
      vx.box(
        tx,
        g + i,
        tz,
        (1.5 - u * 0.8) * scale,
        1.05,
        (1.5 - u * 0.8) * scale,
        i % 2 ? BARK : BARK2
      );
      if (i > 1 && i % 3 === 0)
        vx.box(
          tx + (i % 2 ? 1 : -1) * 0.7 * scale,
          g + i - 0.3,
          tz,
          0.7 * scale,
          0.6,
          0.7 * scale,
          BARK2
        );
    }
    const topY = g + BH;
    // branches
    const nb = ri(4, 6);
    const blobs = [];
    for (let b = 0; b < nb; b++) {
      const a = (b / nb) * Math.PI * 2 + rr(-0.4, 0.4);
      const len = rr(2.4, 4.4) * scale;
      let px = tx,
        py = topY - rr(0, 1.6) * scale,
        pz = tz;
      const dy = rr(-0.15, 0.42);
      for (let i = 0; i < Math.round(len * 2); i++) {
        px += Math.cos(a) * 0.5;
        pz += Math.sin(a) * 0.5;
        py += dy * 0.5;
        vx.box(px, py, pz, 0.62 * scale, 0.6, 0.62 * scale, i % 2 ? BARK : BARK2);
      }
      blobs.push([px, py + rr(0.2, 0.9) * scale, pz, rr(2.3, 3.5) * scale]);
    }
    blobs.push([tx + lean * 0.5, topY + 1.1 * scale, tz, rr(2.8, 3.8) * scale]);
    // canopy
    const PINK = [0xf7c8d6, 0xf2aec2, 0xfbdce6, 0xe893ad, 0xfff0f4, 0xf5bccd];
    blobs.forEach(([bx, by, bz, r]) => {
      const nb2 = Math.round(r * 27);
      for (let i = 0; i < nb2; i++) {
        const dx = rr(-r, r),
          dy = rr(-r * 0.72, r * 0.78),
          dz = rr(-r, r);
        const d = Math.sqrt(dx * dx + dy * dy * 1.7 + dz * dz);
        if (d > r) continue;
        if (rnd() < 0.16) continue;
        const s = rr(0.8, 1.25);
        vx.box(bx + dx, by + dy, bz + dz, s, s * 0.85, s, shade(pick(PINK), rr(0.93, 1.08)));
      }
      // hanging blossom strands
      for (let i = 0; i < 5; i++) {
        const dx = rr(-r * 0.8, r * 0.8),
          dz = rr(-r * 0.8, r * 0.8);
        for (let k = 0; k < ri(1, 3); k++)
          vx.box(
            bx + dx,
            by - r * 0.6 - k,
            bz + dz,
            0.7,
            0.85,
            0.7,
            shade(0xf2aec2, rr(0.9, 1.05))
          );
      }
    });
    blossomEmitters.push(v3(x + lean * 0.4, topY + 1.2 * scale, z));
    gardenGroup.add(solid(vx, { name: 'tree' }));
  }
  function buildTrees() {
    buildTree(6.0, -19.5, 1.05, 0.45); // sentinel sakura beside the torii
    buildTree(3.4, -1.6, 0.86, -0.3); // between the tea house and the bridge
    buildTree(-4.8, 17.5, 1.0, -0.4);
    buildTree(5.7, 16.0, 0.8, 0.3);
    buildTree(-5.4, 5.6, 0.6, -0.5);
  }

  /* ---- bamboo ---- */
  function buildBamboo() {
    const vx = new Vox();
    const clusters = [
      [-6.3, -19.5, 5],
      [6.7, 10.5, 4],
      [-6.6, 15.5, 4],
      [6.9, -3.0, 3],
    ];
    clusters.forEach(([cx, cz, n]) => {
      for (let i = 0; i < n; i++) {
        const x = cx + rr(-1.1, 1.1),
          z = cz + rr(-1.1, 1.1);
        if (Math.abs(x) > plateauHW(z) - 0.5) continue;
        const g = groundAt(Math.round(x), Math.round(z));
        const h = rr(6, 11),
          lean = rr(-0.12, 0.12);
        let px = x,
          pz = z;
        for (let k = 0; k < Math.round(h); k++) {
          px += lean;
          pz += lean * 0.4;
          const c = k % 3 === 0 ? 0x7d9c4c : 0x93b25c;
          vx.box(px, g + k + 0.5, pz, 0.62, 1.0, 0.62, c);
          if (k % 3 === 2) vx.box(px, g + k + 1.0, pz, 0.78, 0.24, 0.78, 0x6b8a41);
          if (k > h * 0.5 && k % 2 === 0) {
            for (let l = 0; l < 3; l++) {
              const a = rnd() * 6.28;
              vx.box(
                px + Math.cos(a) * 0.9,
                g + k + 0.6,
                pz + Math.sin(a) * 0.9,
                1.5,
                0.16,
                0.5,
                l % 2 ? 0x8fae5c : 0xa6c26a
              );
            }
          }
        }
        for (let l = 0; l < 5; l++) {
          const a = rnd() * 6.28;
          vx.box(
            px + Math.cos(a) * 1.2,
            g + h + 0.3,
            pz + Math.sin(a) * 1.2,
            1.8,
            0.18,
            0.6,
            0xa6c26a
          );
        }
      }
    });
    gardenGroup.add(solid(vx, { name: 'bamboo' }));
  }

  /* ---- stone lanterns ---- */
  function buildIshidoro(x, z, scale) {
    const vx = new Vox(),
      lg = new Vox();
    const g = groundAt(Math.round(x), Math.round(z));
    const S = scale,
      G1 = 0x9a948a,
      G2 = 0x837d74,
      G3 = 0xb0aa9e,
      MS = 0x6f9a4a;
    let y = g;
    vx.box(x, y + 0.2 * S, z, 2.0 * S, 0.42 * S, 2.0 * S, G2);
    vx.box(x, y + 0.6 * S, z, 1.5 * S, 0.4 * S, 1.5 * S, G1);
    y += 0.8 * S;
    vx.box(x, y + 1.05 * S, z, 0.8 * S, 2.1 * S, 0.8 * S, G1);
    vx.box(x, y + 1.05 * S, z, 0.95 * S, 0.3 * S, 0.95 * S, G3);
    y += 2.1 * S;
    vx.box(x, y + 0.28 * S, z, 1.7 * S, 0.55 * S, 1.7 * S, G2);
    y += 0.55 * S;
    // hibukuro (fire box)
    vx.box(x, y + 0.75 * S, z, 1.45 * S, 1.5 * S, 1.45 * S, G1);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      lg.box(
        x + Math.cos(a) * 0.66 * S,
        y + 0.75 * S,
        z + Math.sin(a) * 0.66 * S,
        0.55 * S,
        0.85 * S,
        0.55 * S,
        new THREE.Color().setRGB(2.5, 1.45, 0.66)
      );
    }
    y += 1.5 * S;
    vx.box(x, y + 0.2 * S, z, 1.8 * S, 0.4 * S, 1.8 * S, G2);
    // kasa roof
    for (let i = 0; i < 4; i++) {
      const w = (2.9 - i * 0.62) * S;
      vx.box(x, y + 0.45 * S + i * 0.42 * S, z, w, 0.45 * S, w, i % 2 ? G1 : G3);
    }
    vx.box(x, y + 2.2 * S, z, 0.6 * S, 0.5 * S, 0.6 * S, G2);
    vx.box(x, y + 2.55 * S, z, 0.42 * S, 0.42 * S, 0.42 * S, G3);
    if (rnd() > 0.4) vx.box(x + 0.9 * S, y + 1.0 * S, z - 0.9 * S, 0.7 * S, 0.3 * S, 0.7 * S, MS);
    gardenGroup.add(solid(vx, {}));
    gardenGroup.add(solid(lg, { mat: matGlow, cast: false, recv: false }));
    // 石灯笼点光改为自发光体素(不新增灯光预算)
  }

  function buildDetails() {
    const vx = new Vox();
    // stepping stones off the path
    const stones = [
      [-4.2, -1.5],
      [-5.0, 1.2],
      [3.6, -6.5],
      [4.4, -4.6],
      [2.8, 17.5],
      [-2.6, 20.5],
    ];
    stones.forEach(([x, z]) => {
      if (Math.abs(x) > plateauHW(z) - 0.8) return;
      const g = groundAt(Math.round(x), Math.round(z));
      vx.box(x, g + 0.28, z, rr(1.2, 1.8), 0.5, rr(1.1, 1.6), rnd() > 0.5 ? COL.stone : COL.stone2);
    });
    // tsukubai (water basin) near the tea house
    const bx = -5.4,
      bz = -6.2,
      bg = groundAt(Math.round(bx), Math.round(bz));
    vx.box(bx, bg + 0.55, bz, 1.9, 1.1, 1.9, COL.stone2);
    vx.box(bx, bg + 1.05, bz, 1.4, 0.3, 1.4, 0x3f5a55);
    vx.box(bx, bg + 1.02, bz - 0.9, 0.5, 0.5, 0.5, COL.stone);
    vx.box(bx + 0.1, bg + 2.4, bz - 0.9, 0.28, 2.4, 0.28, 0x6d4f3e);
    vx.box(bx + 0.1, bg + 3.5, bz - 0.2, 1.5, 0.24, 0.34, 0x6d4f3e);
    gardenGroup.add(solid(vx, {}));

    buildIshidoro(-4.7, -2.0, 1.0);
    buildIshidoro(4.6, 20.5, 0.62);

    // small shrine stones & moss mounds
    const mv = new Vox();
    for (let i = 0; i < 26; i++) {
      const z = rr(GZ0 + 3, GZ1 - 3),
        x = rr(-7, 7);
      if (Math.abs(x) > plateauHW(z) - 1.2 || pondD(x, z) < 1.4) continue;
      if (distPath(x, z) < 1.5) continue;
      const g = groundAt(Math.round(x), Math.round(z));
      mv.box(x, g + 0.2, z, rr(0.8, 1.6), 0.35, rr(0.8, 1.6), rnd() > 0.5 ? COL.moss : COL.grass3);
    }
    gardenGroup.add(solid(mv, { cast: false }));
  }
  function buildPond() {
    const vx = new Vox();
    // basin stones ring
    for (let a = 0; a < Math.PI * 2; a += 0.11) {
      const x = POND.cx + Math.cos(a) * POND.rx * 1.02,
        z = POND.cz + Math.sin(a) * POND.rz * 1.02;
      const g = groundAt(Math.round(x), Math.round(z));
      if (rnd() > 0.35)
        vx.box(
          x,
          g + 0.45,
          z,
          rr(0.7, 1.3),
          rr(0.4, 0.8),
          rr(0.7, 1.3),
          rnd() > 0.5 ? COL.stone : COL.stone2
        );
    }
    // weir stones
    for (let i = 0; i < 5; i++)
      vx.box(
        POND.cx + POND.rx * 0.9 + i * 0.35,
        POND.waterY - 0.35,
        POND.cz + rr(-1.2, 1.2),
        0.8,
        0.5,
        0.9,
        COL.stone2
      );
    gardenGroup.add(solid(vx, {}));

    // water surface
    const g = new THREE.CircleGeometry(1, 52);
    g.scale(POND.rx * 0.985, POND.rz * 0.985, 1);
    waterMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color(0x14454f) },
        uShallow: { value: new THREE.Color(0x63c4c6) },
        uSky: { value: new THREE.Color(0xffab6e) },
        uSunDir: { value: sunDir },
      },
      vertexShader: `uniform float uTime; varying vec3 vW; varying vec2 vUv;
      void main(){ vUv=uv; vec3 p=position;
        p.z += sin(p.x*2.1+uTime*1.7)*.055 + cos(p.y*2.6-uTime*1.35)*.05
             + sin((p.x+p.y)*4.0+uTime*2.6)*.022;
        vec4 w=modelMatrix*vec4(p,1.0); vW=w.xyz;
        gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uTime; uniform vec3 uDeep,uShallow,uSky,uSunDir;
      varying vec3 vW; varying vec2 vUv;
      void main(){
        vec3 V=normalize(cameraPosition-vW);
        float fres=pow(1.0-clamp(V.y,0.0,1.0),3.0);
        float r1=sin(vUv.x*46.0+uTime*1.9)*sin(vUv.y*38.0-uTime*1.5);
        float r2=sin((vUv.x+vUv.y)*82.0-uTime*3.1);
        vec3 col=mix(uDeep,uShallow,.30+.22*r1);
        col=mix(col,uSky,fres*.72);
        col+=vec3(1.0,.86,.68)*smoothstep(.88,1.0,r2)*.30;
        vec3 N=normalize(vec3(r1*.22,1.0,r2*.22));
        float gl=pow(max(dot(reflect(-V,N),normalize(uSunDir)),0.0),28.0);
        col+=vec3(1.0,.80,.50)*gl*1.1;
        gl_FragColor=vec4(col,.90);
      }`,
    });
    waterMesh = new THREE.Mesh(g, waterMat);
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.set(POND.cx, POND.waterY, POND.cz);
    waterMesh.renderOrder = 2;
    gardenGroup.add(waterMesh);

    // lily pads + lotus
    const lv = new Vox(),
      fl = new Vox();
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2,
        r = rr(0.25, 0.82);
      const x = POND.cx + Math.cos(a) * POND.rx * r,
        z = POND.cz + Math.sin(a) * POND.rz * r;
      if (Math.abs(x + 1.5) < 2.0 && Math.abs(z - 8) < 3.0) continue; // keep clear under the bridge
      const s = rr(0.85, 1.5);
      for (let k = 0; k < 10; k++) {
        const aa = (k / 10) * Math.PI * 2;
        if (k === 3 || k === 4) continue;
        fl.box(
          x + Math.cos(aa) * s * 0.62,
          POND.waterY + 0.09,
          z + Math.sin(aa) * s * 0.62,
          s * 0.62,
          0.14,
          s * 0.62,
          k % 2 ? 0x4e8a3c : 0x5fa04a
        );
      }
      fl.box(x, POND.waterY + 0.06, z, s * 1.05, 0.13, s * 1.05, 0x4a8139);
      if (rnd() > 0.45) {
        for (let k = 0; k < 7; k++) {
          const aa = (k / 7) * Math.PI * 2;
          fl.box(
            x + Math.cos(aa) * 0.34,
            POND.waterY + 0.32,
            z + Math.sin(aa) * 0.34,
            0.42,
            0.34,
            0.24,
            0xf6c3d4
          );
          fl.box(
            x + Math.cos(aa) * 0.17,
            POND.waterY + 0.5,
            z + Math.sin(aa) * 0.17,
            0.3,
            0.3,
            0.2,
            0xfff0f4
          );
        }
        fl.box(x, POND.waterY + 0.55, z, 0.3, 0.28, 0.3, 0xf0c25a);
        lv.box(x, POND.waterY + 0.72, z, 0.16, 0.3, 0.16, new THREE.Color().setRGB(1.9, 1.5, 0.6));
      }
    }
    gardenGroup.add(solid(fl, { cast: false, recv: false }));
    gardenGroup.add(solid(lv, { mat: matGlow, cast: false, recv: false }));

    // tiny pond fish
    const fish = [];
    for (let i = 0; i < 5; i++) {
      const p = new THREE.Object3D();
      p.position.set(POND.cx, POND.waterY - 0.55, POND.cz);
      gardenGroup.add(p);
      const fx = new Vox();
      const col = i % 2 ? 0xe8703a : 0xf6efe2;
      fx.box(0, 0, 0, 1.05, 0.7, 2.0, col);
      fx.box(0, 0.05, 0.95, 0.55, 0.5, 0.9, shade(col, 0.92));
      fx.box(0, 0.05, -1.25, 0.4, 0.42, 0.7, i % 2 ? 0xf6efe2 : 0xe8703a);
      fx.box(0, 0.32, -0.1, 0.42, 0.3, 0.9, shade(col, 0.96));
      const m = solid(fx, { cast: false, recv: false });
      m.position.z = 1.0;
      p.add(m);
      fish.push({
        p,
        r: rr(1.3, 3.2),
        sp: rr(0.35, 0.75) * (rnd() > 0.5 ? 1 : -1),
        ph: rnd() * 6.28,
        y: POND.waterY - rr(0.35, 0.9),
      });
    }
    updaters.push((dt, t) => {
      for (const f of fish) {
        const a = t * f.sp + f.ph;
        f.p.rotation.y = -a;
        f.p.position.set(
          POND.cx + Math.cos(a) * f.r * 1.05,
          f.y + Math.sin(t * 1.4 + f.ph) * 0.14,
          POND.cz + Math.sin(a) * f.r * 0.88
        );
      }
    });
  }

  const UP = new THREE.Vector3(0, 1, 0);
  class Stream {
    constructor(pts, o = {}) {
      this.cum = [0];
      this.segs = [];
      let L = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const d = new THREE.Vector3().subVectors(pts[i + 1], pts[i]);
        const l = Math.max(0.001, d.length());
        d.divideScalar(l);
        const q = new THREE.Quaternion().setFromUnitVectors(UP, d);
        this.segs.push({ p0: pts[i], d, l, q });
        L += l;
        this.cum.push(L);
      }
      this.len = L;
      const count = o.count || Math.round(clamp(L * 1.05, 70, 240));
      this.speed = o.speed || 16;
      this.spread = o.spread ?? 0.4;
      this.grow = o.grow ?? 1;
      this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 1, 0.5), matStream, count);
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = 3;
      this.items = [];
      const c = new THREE.Color();
      for (let i = 0; i < count; i++) {
        this.items.push({
          s: rnd() * L,
          jx: (rnd() * 2 - 1) * this.spread,
          jz: (rnd() * 2 - 1) * this.spread,
          sy: rr(0.9, 2.6),
          w: rr(0.55, 1.05),
          ph: rnd() * 6.28,
        });
        c.setHSL(0.52 + rnd() * 0.06, 0.42, rr(0.7, 0.93));
        this.mesh.setColorAt(i, c);
      }
      this.mesh.instanceColor.needsUpdate = true;
      this.d = new THREE.Object3D();
      this.acc = 0;
    }
    sampleAt(s, out) {
      let lo = 0,
        hi = this.segs.length - 1;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (this.cum[m + 1] < s) lo = m + 1;
        else hi = m;
      }
      const seg = this.segs[lo],
        f = s - this.cum[lo];
      out.copy(seg.p0).addScaledVector(seg.d, f);
      return seg;
    }
    update(dt, t) {
      this.acc += dt * this.speed;
      const d = this.d,
        p = _tmp;
      for (let i = 0; i < this.items.length; i++) {
        const it = this.items[i];
        let s = (it.s + this.acc) % this.len;
        const seg = this.sampleAt(s, p);
        const k = s / this.len,
          sp = 1 + k * this.grow * 2.6;
        d.position.set(
          p.x + it.jx * sp + Math.sin(t * 3.1 + it.ph) * 0.13,
          p.y,
          p.z + it.jz * sp + Math.cos(t * 2.7 + it.ph) * 0.13
        );
        d.quaternion.copy(seg.q);
        d.scale.set(it.w * (1 + k * 0.85), it.sy * (1 + k * 1.7), it.w * (1 + k * 0.85));
        d.updateMatrix();
        this.mesh.setMatrixAt(i, d.matrix);
      }
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  const _tmp = new THREE.Vector3();

  function descendAndFall(zStart, yStart, sideSign, xStart) {
    const pts = [v3(xStart, yStart, zStart)];
    let y = yStart,
      x = xStart,
      z = zStart;
    while (y > botAt(z) + 1.0) {
      y -= 1.5;
      const hw = halfWidthAt(z, Math.max(y, botAt(z) + 0.6));
      x = sideSign * (Math.max(hw, 3.0) + 0.55);
      z += sideSign * 0.05;
      pts.push(v3(x, y, z));
    }
    const yb = y;
    for (let i = 1; i <= 15; i++) pts.push(v3(x + sideSign * i * 0.3, yb - i * 13, z + i * 1.05));
    return pts;
  }
  function buildWater() {
    // decorative wet sheets down the hull
    const sv = sheetVox;
    const sheetSide = (z0, side, y0) => {
      for (let y = y0; y > botAt(z0) + 0.8; y -= 1.05) {
        const hw = halfWidthAt(z0, y);
        if (hw < 1.2) break;
        sv.box(side * (hw + 0.2), y - 0.45, z0, 0.34, 1.35, 3.6, 0x9fdcea);
      }
    };
    sheetSide(8.4, 1, 7.1);
    sheetSide(12.6, -1, 7.4);

    // pond east spill over the weir, down the terraces, off the flank
    const pE = [
      v3(4.4, 8.5, 8.0),
      v3(5.6, 8.48, 8.05),
      v3(6.4, 8.42, 8.1),
      v3(7.1, 7.8, 8.2),
      v3(7.9, 6.9, 8.3),
      v3(8.5, 6.2, 8.4),
    ];
    pE.push(...descendAndFall(8.4, 6.2, 1, 8.5).slice(1));
    streams.push(new Stream(pE, { speed: 15, spread: 0.45, grow: 1.1 }));

    // west rill : a carved channel running to the port flank
    const pW = [
      v3(-3.6, 8.52, 10.7),
      v3(-4.6, 8.5, 11.4),
      v3(-5.6, 8.0, 11.9),
      v3(-6.7, 7.0, 12.4),
      v3(-7.8, 5.6, 12.85),
    ];
    pW.push(...descendAndFall(12.85, 5.6, -1, -7.8).slice(1));
    streams.push(new Stream(pW, { speed: 14, spread: 0.4, grow: 1.1 }));

    // pours off the pectoral fins
    for (const side of [-1, 1]) {
      const p = [
        v3(side * 9.2, -2.4, -24.4),
        v3(side * 14.0, -4.0, -23.3),
        v3(side * 19.0, -5.8, -22.2),
        v3(side * 23.2, -7.6, -21.1),
      ];
      for (let i = 1; i <= 16; i++)
        p.push(v3(side * (23.4 + i * 0.18), -7.6 - i * 12.4, -20.9 + i * 0.4));
      streams.push(new Stream(p, { speed: 20, spread: 0.32, grow: 1.4 }));
    }
    // overflow lip sheeting over the weir stone
    const pL = [
      v3(5.2, 8.62, 7.2),
      v3(5.9, 8.5, 7.9),
      v3(6.2, 8.45, 8.6),
      v3(5.9, 8.5, 9.3),
      v3(5.2, 8.6, 9.9),
    ];
    streams.push(new Stream(pL, { speed: 5, spread: 0.18, grow: 0.15, count: 70 }));

    streams.forEach((s) => streamsGroup.add(s.mesh));
    updaters.push((dt, t) => {
      for (const s of streams) s.update(dt, t);
    });

    // mist where the falls meet the cloud sea
    const mv = new Vox();
    const mists = [
      [10, -70, 10],
      [-10, -70, 13],
      [26, -72, -15],
      [-26, -72, -15],
      [8, -71, 22],
    ];
    mists.forEach(([x, y, z]) => {
      for (let i = 0; i < 26; i++) {
        const s = rr(3, 9);
        mv.box(
          x + rr(-7, 7),
          y + rr(-4, 5),
          z + rr(-7, 7),
          s,
          s * 0.6,
          s,
          new THREE.Color(0xffe6d8).multiplyScalar(rr(0.55, 0.9))
        );
      }
    });
    const mist = solid(mv, {
      mat: new THREE.MeshStandardMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        roughness: 1,
      }),
      cast: false,
      recv: false,
      fc: false,
    });
    mist.renderOrder = 1;
    root.add(mist);
    updaters.push((dt, t) => {
      mist.position.y = Math.sin(t * 0.35) * 1.6;
    });

    // sheets
    const sm = solid(sv, { mat: matSheet, cast: false, recv: false });
    if (sm) {
      sm.renderOrder = 2;
      koiGroup.add(sm);
    }
  }
  function buildPetals() {
    const N = 400;
    const geo = new THREE.BoxGeometry(0.46, 0.07, 0.36);
    petals = new THREE.InstancedMesh(geo, matPetal, N);
    petals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    petals.frustumCulled = false;
    const cols = [0xf7c8d6, 0xf2aec2, 0xfbdce6, 0xfff0f4, 0xe893ad];
    const c = new THREE.Color();
    petals.items = [];
    for (let i = 0; i < N; i++) {
      petals.items.push({
        p: new THREE.Vector3(),
        v: new THREE.Vector3(),
        r: new THREE.Euler(),
        rs: v3(rr(-2, 2), rr(-2, 2), rr(-2, 2)),
        ph: rnd() * 6.28,
        sc: rr(0.7, 1.35),
      });
      c.set(pick(cols));
      c.multiplyScalar(rr(0.9, 1.12));
      petals.setColorAt(i, c);
      respawnPetal(petals.items[i], true);
    }
    petals.instanceColor.needsUpdate = true;
    root.add(petals);
    updaters.push((dt, t) => {
      const d = _dummy,
        items = petals.items;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        it.p.addScaledVector(it.v, dt);
        it.v.x += Math.sin(t * 0.9 + it.ph) * 0.55 * dt;
        it.v.y += (Math.sin(t * 1.4 + it.ph) * 0.35 - 0.3) * dt;
        it.v.z += Math.cos(t * 0.7 + it.ph) * 0.4 * dt;
        it.v.multiplyScalar(1 - 0.26 * dt);
        it.r.x += it.rs.x * dt;
        it.r.y += it.rs.y * dt;
        it.r.z += it.rs.z * dt;
        if (it.p.z > 140 || it.p.y < -48 || Math.abs(it.p.x) > 85) respawnPetal(it, false);
        d.position.copy(it.p);
        d.rotation.copy(it.r);
        d.scale.setScalar(it.sc);
        d.updateMatrix();
        petals.setMatrixAt(i, d.matrix);
      }
      petals.instanceMatrix.needsUpdate = true;
    });
  }
  function respawnPetal(it, scatter) {
    const e = pick(blossomEmitters.length ? blossomEmitters : [v3(0, 15, 0)]);
    it.p.set(e.x + rr(-4, 4), e.y + rr(-3, 3), e.z + rr(-4, 4));
    if (scatter) it.p.z += rr(0, 90);
    it.v.set(rr(-1.2, 1.4), rr(-0.6, 0.5), rr(2.2, 5.4));
  }
  const _dummy = new THREE.Object3D();
  const cranes = [];
  function makeCrane(scale) {
    const g = new THREE.Group();
    const body = new Vox(),
      dark = new Vox();
    const W = 0xf6f2ea,
      W2 = 0xe2dbd0,
      BK = 0x2b2830,
      RD = 0xd13b2c;
    // body
    for (let z = -2.6; z <= 2.6; z += 0.9) {
      const u = 1 - Math.abs(z) / 3.0;
      body.box(0, 0, z, 1.5 + u * 0.9, 1.3 + u * 0.85, 1.0, z < 0 ? W2 : W);
    }
    body.box(0, 0.2, -3.2, 1.0, 0.8, 1.2, W);
    dark.box(0, 0.1, -4.3, 1.5, 0.55, 1.6, BK);
    dark.box(0, 0.35, -4.9, 1.0, 0.4, 1.0, BK);
    // legs trailing
    for (const s of [-1, 1]) {
      dark.box(s * 0.34, -0.5, -4.2, 0.16, 0.16, 3.0, 0x3a3630);
      dark.box(s * 0.34, -0.55, -5.6, 0.16, 0.16, 0.7, 0x3a3630);
    }
    // neck + head
    const nk = new Vox();
    const neck = [
      [0.55, 1.55],
      [1.5, 1.45],
      [2.4, 1.35],
      [3.2, 1.3],
      [3.9, 1.35],
      [4.5, 1.5],
    ];
    neck.forEach(([z, y], i) => {
      nk.box(0, y, z, 0.52 - i * 0.02, 0.52 - i * 0.02, 1.0, i < 2 ? BK : W);
    });
    nk.box(0, 1.62, 5.0, 0.72, 0.62, 1.0, W);
    nk.box(0, 1.98, 5.0, 0.5, 0.22, 0.6, RD);
    nk.box(0, 1.6, 5.75, 0.24, 0.24, 1.0, 0x4a4640);
    nk.box(0, 1.75, 4.85, 0.14, 0.14, 0.14, 0x241f22);
    nk.box(0.3, 1.75, 4.85, 0.14, 0.14, 0.14, 0x241f22);
    g.add(solid(body, {}));
    g.add(solid(dark, { cast: false }));
    const neckPivot = new THREE.Object3D();
    neckPivot.position.set(0, 0, 1.9);
    g.add(neckPivot);
    neckPivot.add(solid(nk, { cast: false }));
    // wings
    const wings = [];
    for (const side of [-1, 1]) {
      const root = new THREE.Object3D();
      root.position.set(side * 0.7, 0.5, -0.2);
      g.add(root);
      const chain = [root];
      let cur = root;
      const segs = [
        [4.6, 2.4, 1.9],
        [3.6, 1.6, 1.1],
      ];
      segs.forEach((s, i) => {
        const wv = new Vox();
        const steps = Math.round(s[0]);
        for (let k = 0; k < steps; k++) {
          const u = k / steps;
          const col = u > 0.72 ? BK : k % 2 ? W : W2;
          wv.box(
            side * (k + 0.5) * 1.0,
            -u * u * 0.7,
            0.2 * u,
            1.02,
            0.34 - i * 0.08,
            s[1] * (1 - u * 0.45),
            col
          );
          if (u > 0.4)
            wv.box(
              side * (k + 0.5),
              -u * u * 0.7 - 0.3,
              0.2 * u + s[1] * 0.4,
              1.0,
              0.2,
              s[2] * 0.4,
              shade(BK, 1.4)
            );
        }
        const m = solid(wv, { cast: false });
        cur.add(m);
        const nx = new THREE.Object3D();
        nx.position.set(side * s[0], -0.5, 0);
        cur.add(nx);
        cur = nx;
        chain.push(nx);
      });
      wings.push(chain);
    }
    g.scale.setScalar(scale);
    return { g, wings, neck: neckPivot };
  }
  function buildCranes() {
    const specs = [
      { r: 62, y: 16, sp: 0.13, ph: 0, sc: 1.0, cy: 0 },
      { r: 78, y: 6, sp: -0.1, ph: 2.1, sc: 0.88, cy: -4 },
      { r: 52, y: 27, sp: 0.16, ph: 4.0, sc: 0.95, cy: 2 },
      { r: 112, y: -2, sp: 0.075, ph: 1.1, sc: 1.12, cy: -8 },
      { r: 70, y: 36, sp: -0.14, ph: 5.2, sc: 0.8, cy: 4 },
    ];
    specs.forEach((s) => {
      const c = makeCrane(s.sc);
      craneGroup.add(c.g);
      cranes.push({ ...c, ...s, t: s.ph });
    });
    // 2026-11-17 A2 每帧向量复用:此前每只鹤每帧 new 2 个 Vector3(dir + position.clone()),
    // 5 只 ×60fps ≈ 600 个/秒 GC 压力。改用闭包内两个临时向量,语义不变。
    const _dir = new THREE.Vector3();
    const _look = new THREE.Vector3();
    updaters.push((dt, t) => {
      for (const c of cranes) {
        c.t += dt * c.sp;
        const R = c.r + Math.sin(c.t * 0.6 + c.ph) * 9;
        const y = c.y + Math.sin(c.t * 0.9 + c.ph) * 4.5 + c.cy + Math.sin(t * 0.5 + c.ph) * 1.2;
        const px = Math.cos(c.t) * R,
          pz = Math.sin(c.t) * R;
        const nx = Math.cos(c.t + 0.06) * R,
          nz = Math.sin(c.t + 0.06) * R;
        c.g.position.set(px, y, pz);
        const dir = _dir.set(nx - px, Math.cos(c.t * 0.9 + c.ph) * 4.5 * 0.06, nz - pz).normalize();
        c.g.lookAt(_look.copy(c.g.position).add(dir.multiplyScalar(c.sp > 0 ? 1 : -1)));
        c.g.rotation.z += Math.sin(c.t * 1.6) * 0.16 * (c.sp > 0 ? 1 : -1);
        const flap = Math.sin(t * 3.4 + c.ph * 2);
        c.wings.forEach((ch, i) => {
          const side = i ? -1 : 1;
          ch[0].rotation.z = side * (-flap * 0.62 - 0.1);
          ch[0].rotation.x = Math.sin(t * 3.4 + c.ph * 2 + 0.6) * 0.1;
          if (ch[1]) ch[1].rotation.z = side * (-Math.max(0, flap) * 0.5 - 0.05);
        });
        c.neck.rotation.y = Math.sin(t * 0.9 + c.ph) * 0.1;
        c.neck.rotation.x = Math.sin(t * 1.3 + c.ph) * 0.06;
      }
    });
  }
  const sunDir = new THREE.Vector3();
  let sunLight, hemi, fillLight, ambLight, skyMat, sunDisc, sunGlow, sunHalo;

  function setSun(elev) {
    sunDir.set(-0.62, elev, -0.745).normalize();
    const t = clamp((elev - 0.015) / 0.5, 0, 1);
    const lc = new THREE.Color(0xff5f22).lerp(new THREE.Color(0xffd7a6), t);
    const fc = new THREE.Color(0xd2603a).lerp(new THREE.Color(0xf6bb8c), t);
    if (sunLight) {
      sunLight.position.copy(sunDir).multiplyScalar(420);
      sunLight.color.copy(lc);
      sunLight.intensity = lerp(2.5, 3.6, t);
      fillLight.color.copy(new THREE.Color(0x4d6ea8).lerp(new THREE.Color(0x8fb0dd), t));
      fillLight.intensity = lerp(0.85, 0.55, t);
      hemi.color.copy(fc);
      hemi.intensity = lerp(0.55, 0.85, t);
      scene.fog.color.copy(new THREE.Color(0xc9522f).lerp(new THREE.Color(0xf0ae80), t));
      skyMat.uniforms.uSunDir.value.copy(sunDir);
      skyMat.uniforms.uHorizon.value.copy(
        new THREE.Color(0xff6a2e).lerp(new THREE.Color(0xffc795), t)
      );
      skyMat.uniforms.uSunCol.value.copy(
        new THREE.Color(0xffb055).lerp(new THREE.Color(0xfff0c8), t)
      );
      skyMat.uniforms.uZenith.value.copy(
        new THREE.Color(0x1d2c4d).lerp(new THREE.Color(0x3d6ea5), t)
      );
      sunDisc.position.copy(sunDir).multiplyScalar(2400);
      sunGlow.position.copy(sunDir).multiplyScalar(2380);
      sunHalo.position.copy(sunDir).multiplyScalar(2360);
    }
  }

  /* ════════════════════════════════════════════════════════════
   2 · KOI PROFILE
   ════════════════════════════════════════════════════════════ */
  function radialTexture(stops) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    stops.forEach((s) => grd.addColorStop(s[0], s[1]));
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function buildSky() {
    // 半径须小于游戏相机 far(2000),否则天穹被远裁剪面切掉→天空发黑(原作品相机 far=7000)
    const geo = new THREE.SphereGeometry(1500, 48, 32);
    skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenith: { value: new THREE.Color(0x2b4a76) },
        uHorizon: { value: new THREE.Color(0xff8c46) },
        uGround: { value: new THREE.Color(0x6d3b4a) },
        uSunCol: { value: new THREE.Color(0xffc070) },
        uSunDir: { value: new THREE.Vector3(-0.6, 0.2, -0.75) },
      },
      vertexShader: `varying vec3 vD;
      void main(){ vec4 w=modelMatrix*vec4(position,1.0); vD=w.xyz-cameraPosition;
        gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `varying vec3 vD;
      uniform vec3 uZenith,uHorizon,uGround,uSunCol,uSunDir;
      void main(){
        vec3 d=normalize(vD); float h=d.y;
        vec3 col;
        if(h>0.0){ float k=pow(1.0-h,3.1); col=mix(uZenith,uHorizon,k); }
        else { col=mix(uHorizon,uGround,pow(min(1.0,-h*2.4),0.75)); }
        float sd=max(dot(d,normalize(uSunDir)),0.0);
        col += uSunCol*pow(sd,420.0)*4.0;
        col += uSunCol*pow(sd,26.0)*0.75;
        col += uSunCol*pow(sd,5.0)*0.30;
        col += uSunCol*pow(sd,1.6)*0.10;
        float band=smoothstep(-0.02,0.10,h)*(1.0-smoothstep(0.10,0.42,h));
        col *= 1.0 + band*0.16*sin(d.x*4.0+d.z*3.0);
        gl_FragColor=vec4(col,1.0);
      }`,
    });
    const skyMesh = new THREE.Mesh(geo, skyMat);
    // 必须先于一切几何绘制(同沙漠天穹):否则体素先写深度,天穹 depthWrite:false 会被深度测试挡掉→天空发黑
    skyMesh.renderOrder = -1;
    skyMesh.frustumCulled = false;
    scene.add(skyMesh);

    // sun disc + glows
    const discMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(6.5, 4.6, 3.0),
      fog: false,
      transparent: true,
    });
    sunDisc = new THREE.Mesh(new THREE.CircleGeometry(96, 40), discMat);
    sunDisc.lookAt(0, 0, 0);
    scene.add(sunDisc);

    const glowTex = radialTexture([
      [0, 'rgba(255,225,175,1)'],
      [0.22, 'rgba(255,170,90,.72)'],
      [0.55, 'rgba(255,120,60,.20)'],
      [1, 'rgba(255,90,50,0)'],
    ]);
    sunGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        opacity: 0.95,
      })
    );
    sunGlow.scale.setScalar(1500);
    scene.add(sunGlow);
    const haloTex = radialTexture([
      [0, 'rgba(255,190,140,.55)'],
      [0.35, 'rgba(255,140,90,.18)'],
      [1, 'rgba(120,60,90,0)'],
    ]);
    sunHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: haloTex,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        opacity: 0.8,
      })
    );
    sunHalo.scale.setScalar(3400);
    scene.add(sunHalo);

    // far haze bands near the horizon
    const bandVox = new Vox();
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2,
        r = rr(1500, 2600);
      const w = rr(220, 620),
        y = rr(-30, 150);
      bandVox.box(
        Math.cos(a) * r,
        y,
        Math.sin(a) * r,
        w,
        rr(9, 26),
        rr(60, 180),
        new THREE.Color(0xff9a5a).multiplyScalar(rr(0.35, 0.75))
      );
    }
    const bands = solid(bandVox, {
      mat: new THREE.MeshBasicMaterial({
        vertexColors: true,
        fog: true,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
      cast: false,
      recv: false,
      fc: false,
    });
    bands.renderOrder = -2;
    scene.add(bands);
  }
  function buildLights() {
    sunLight = new THREE.DirectionalLight(0xffb070, 3.1);
    sunLight.castShadow = false;
    sunLight.shadow.mapSize.set(2048, 2048);
    const c = sunLight.shadow.camera;
    c.left = -115;
    c.right = 115;
    c.top = 115;
    c.bottom = -115;
    c.near = 90;
    c.far = 780;
    sunLight.shadow.bias = -0.0006;
    sunLight.shadow.normalBias = 0.55;
    sunLight.shadow.radius = 2.2;
    scene.add(sunLight);
    scene.add(sunLight.target);

    hemi = new THREE.HemisphereLight(0xffb27a, 0x6a4a72, 0.72);
    scene.add(hemi);
    fillLight = new THREE.DirectionalLight(0x6f8fc8, 0.62);
    fillLight.position.set(320, 120, 420);
    scene.add(fillLight);
    ambLight = new THREE.AmbientLight(0x4a3348, 0.42);
    scene.add(ambLight);

    setSun(0.2);

    // warm practical lights for the garden
    const L1 = new THREE.PointLight(0xffb066, 26, 34, 2);
    L1.position.set(-2.5, 12.6, -10);
    koiGroup.add(L1);
    const L2 = new THREE.PointLight(0xffb873, 16, 26, 2);
    L2.position.set(-4.5, 11.6, -1.5);
    koiGroup.add(L2);
    const L3 = new THREE.PointLight(0xffc98a, 13, 22, 2);
    L3.position.set(4.6, 11.4, 15.5);
    koiGroup.add(L3);
  }
  const clouds = [];
  function cloudCluster(size, flat, puff) {
    const vx = new Vox();
    const n = Math.round(clamp(puff * size * 0.62, 22, 78));
    const litTop = new THREE.Color(0xfff2e2),
      litSide = new THREE.Color(0xf8c39c),
      shadow = new THREE.Color(0x9c7d99),
      deep = new THREE.Color(0x6b5878);
    for (let i = 0; i < n; i++) {
      const u = rnd() * Math.PI * 2,
        v = Math.acos(rr(-1, 1));
      const rx = size * rr(0.2, 1),
        ry = size * flat * rr(0.15, 0.85),
        rz = size * rr(0.2, 1);
      const x = Math.sin(v) * Math.cos(u) * rx,
        y = Math.cos(v) * ry - size * flat * 0.15,
        z = Math.sin(v) * Math.sin(u) * rz;
      const s = size * rr(0.2, 0.46);
      const h = clamp(0.5 + y / (size * flat) + rr(-0.15, 0.15), 0, 1);
      const c = deep
        .clone()
        .lerp(shadow, clamp(h * 1.6, 0, 1))
        .lerp(litSide, clamp(h * 1.25 - 0.25, 0, 1))
        .lerp(litTop, clamp(h * 1.5 - 0.72, 0, 1));
      c.multiplyScalar(rr(0.88, 1.12));
      vx.box(x, y, z, s * rr(1.1, 2.1), s * rr(0.5, 0.85), s * rr(1.1, 2.1), c);
    }
    return solid(vx, { mat: matSoft, cast: false, recv: false });
  }
  function buildClouds() {
    const layers = [
      {
        n: 16,
        rMin: 70,
        rMax: 300,
        y: [-96, -62],
        size: [16, 34],
        flat: [0.22, 0.34],
        spd: [7, 13],
      },
      {
        n: 20,
        rMin: 280,
        rMax: 640,
        y: [-104, -58],
        size: [26, 58],
        flat: [0.16, 0.26],
        spd: [3.5, 8],
      },
      {
        n: 12,
        rMin: 620,
        rMax: 1250,
        y: [-112, -52],
        size: [60, 130],
        flat: [0.1, 0.18],
        spd: [1.4, 3.4],
      },
    ];
    layers.forEach((L, li) => {
      for (let i = 0; i < L.n; i++) {
        const size = rr(L.size[0], L.size[1]);
        const m = cloudCluster(size, rr(L.flat[0], L.flat[1]), rr(0.7, 1.5));
        if (!m) continue;
        const a = rnd() * Math.PI * 2,
          r = rr(L.rMin, L.rMax);
        m.position.set(Math.cos(a) * r, rr(L.y[0], L.y[1]), Math.sin(a) * r);
        m.rotation.y = rnd() * Math.PI;
        cloudGroup.add(m);
        clouds.push({
          m,
          vz: rr(L.spd[0], L.spd[1]),
          vx: rr(-2, 2) * (1 + li * 0.3),
          ph: rnd() * 6.28,
          y0: m.position.y,
          amp: rr(0.6, 2.4),
          lim: 1300,
        });
      }
    });
    // high wisps
    const w = new Vox();
    for (let i = 0; i < 22; i++) {
      const a = rnd() * Math.PI * 2,
        r = rr(400, 1100);
      w.box(
        Math.cos(a) * r,
        rr(40, 130),
        Math.sin(a) * r,
        rr(60, 190),
        rr(3, 7),
        rr(16, 46),
        new THREE.Color(0xffb98a).multiplyScalar(rr(0.2, 0.42))
      );
    }
    const wisps = solid(w, {
      mat: new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        fog: true,
      }),
      cast: false,
      recv: false,
      fc: false,
    });
    wisps.renderOrder = -1;
    cloudGroup.add(wisps);
    clouds.push({ m: wisps, vz: 1.2, vx: 0, ph: 0, y0: 0, amp: 0, lim: 1e9 });
  }
  updaters.push((dt, t) => {
    for (const c of clouds) {
      c.m.position.z += c.vz * dt;
      c.m.position.x += c.vx * dt;
      c.m.position.y = c.y0 + Math.sin(t * 0.22 + c.ph) * c.amp;
      if (c.m.position.z > c.lim) {
        c.m.position.z -= c.lim * 2;
        c.m.position.x = rr(-c.lim, c.lim) * 0.8;
      }
      if (c.m.position.x > c.lim) c.m.position.x -= c.lim * 2;
      if (c.m.position.x < -c.lim) c.m.position.x += c.lim * 2;
    }
  });
  // —— 组装(顺序同原场景,保证依赖) ——
  buildSky();
  buildLights();
  buildClouds();
  buildKoi();
  buildTerrain();
  buildDetails();
  buildTeaHouse();
  buildTorii();
  buildBridge();
  buildTrees();
  buildBamboo();
  buildPond();
  buildWater();
  buildCranes();
  buildPetals();
  const gm = solid(glowVox, { mat: matGlow, cast: false, recv: false });
  if (gm) gardenGroup.add(gm);
  root.scale.setScalar(scale);

  let _t = 0;
  function update(dt) {
    _t += dt;
    const t = _t;
    // 游动起伏(相对 root,飞行姿态由 plane-flight 叠加在 root 上)
    koiGroup.position.y = Math.sin(t * 0.42) * 1.9;
    koiGroup.position.x = Math.sin(t * 0.24) * 1.2;
    koiGroup.rotation.z = Math.sin(t * 0.37) * 0.022;
    koiGroup.rotation.x = Math.sin(t * 0.29) * 0.014;
    koiGroup.rotation.y = Math.sin(t * 0.31) * 0.028;
    if (waterMat) waterMat.uniforms.uTime.value = t;
    for (const u of updaters) u(dt, t);
  }
  function dispose() {
    // 审计2修 P2:贴图也要释放(太阳辉光/光晕等 CanvasTexture 挂在 material.map 上),
    // 共享材质/贴图去重,避免反复热重载泄显存。
    const seenMat = new Set();
    const seenTex = new Set();
    const TEX_SLOTS = [
      'map',
      'normalMap',
      'roughnessMap',
      'metalnessMap',
      'aoMap',
      'emissiveMap',
      'alphaMap',
      'envMap',
    ];
    root.traverse((o) => {
      const m = /** @type {THREE.Mesh} */ (o); // 资源释放遍历:非网格无 geometry/material,守卫短路
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => {
          if (!x || seenMat.has(x)) return;
          seenMat.add(x);
          for (const s of TEX_SLOTS) {
            const t = x[s];
            if (t && t.isTexture && !seenTex.has(t)) {
              seenTex.add(t);
              t.dispose();
            }
          }
          x.dispose();
        });
      }
    });
  }
  // —— 飞行氛围:登机接管 / 下机还原(复用游戏渲染器,视觉与原作品一致) ——
  // 原作品是「云海上的锦鲤」:云在船体下方 y≈-60~-112,没有地面。游戏沙漠地形/天穹/灯光
  // 必须整体让位,否则露出沙地、天空被沙漠天穹盖住。主循环已在 flightLock 时停沙漠昼夜,
  // 这里再把沙漠可见物隐藏、把船抬到云海之上,下机逐一还原。
  const CRUISE_LIFT = 120; // 巡航抬升:让原作品云海(船下 -60~-112)落到沙漠地面之上
  const saved = {};
  // 审计2修 P1:applyEnv 是异步的(动态 import 地形),登机后立刻下机(E→Esc)会让
  // else 分支先跑(saved 还是空 ⇒ background/fog 被置 undefined),挂起的 true 分支随后
  // 保存脏值并隐藏沙漠,再无人还原 ⇒ 沙漠永久消失。用世代闸:每次调用领一个序号,
  // await 回来后若世代已变(期间有过别的调用)就放弃本次生效;else 分支只在真存过值时还原。
  let envGen = 0;
  let envApplied = false; // true 分支是否真正生效过(else 据此判断要不要还原)
  // 地形模块顶层取 ctx.s,静态导入会与本模块形成循环依赖(ctx.s 未就绪即 s.add 崩)。
  // 改为登机时动态导入(此时 ctx 早已装配完毕),打断模块图回环。
  let desertRefs = null;
  async function applyEnv(on, ctxRef) {
    const gen = ++envGen;
    envGroup.visible = on;
    const sc = ctxRef && ctxRef.scene;
    if (!sc || !sc.s) return;
    if (on) {
      if (!desertRefs) {
        try {
          desertRefs = await import('./desert/terrain.js');
        } catch (e) {
          desertRefs = {};
        }
      }
      if (gen !== envGen) return; // await 期间已有新调用(如下机)⇒ 本次登机作废,不再生效
      const terrainMat = desertRefs.terrainMat,
        water = desertRefs.water;
      saved.bg = sc.s.background;
      saved.fog = sc.s.fog;
      // 隐藏沙漠:地形/植被(共享 terrainMat 的网格)、实例化植被岩石、水面、天穹、星点、沙漠灯光。
      // 锦鲤自带天穹/云/太阳,沙漠可见物必须整体让位,否则浮在云海里穿帮。
      // (巡航抬升由 plane-flight.syncMesh 统一加,这里不动 root.position,避免双重偏移)
      saved.hidden = [];
      const isKoiDescendant = (o) => {
        let n = o;
        while (n) {
          if (n === root) return true;
          n = n.parent;
        }
        return false;
      };
      sc.s.traverse((o) => {
        if (!o.visible) return;
        if (isKoiDescendant(o)) return; // 不碰锦鲤自身(含 envGroup 深处的天穹/云/太阳)
        const isTerrain = o.isMesh && terrainMat && o.material === terrainMat;
        const isWater = water && o === water;
        const isDome =
          o.isMesh &&
          o.geometry &&
          o.geometry.type === 'SphereGeometry' &&
          o.geometry.parameters &&
          o.geometry.parameters.radius > 1000;
        const isDesertLight =
          o === sc.ambL || o === sc.hemiL || (o.isDirectionalLight && o !== sunLight);
        const isInst = o.isInstancedMesh; // 沙漠树木/岩石/草丛实例化网格
        const isStars = o.isPoints; // 沙漠夜空星点
        if (isTerrain || isWater || isDome || isDesertLight || isInst || isStars) {
          saved.hidden.push(o);
          o.visible = false;
        }
      });
      sc.s.fog = envFog; // 复用同一 Fog 实例,setSun 改色即同步到游戏场景
      sc.setAtmosphere &&
        sc.setAtmosphere({ bloomStrength: 0.62, bloomThreshold: 0.78, exposure: 1.04 });
      setSun(0.2); // 原作品默认日落高度
      envApplied = true;
    } else {
      // 审计2修 P1:只在 true 分支真正生效过时还原;saved.bg/fog 未存过(undefined)就不碰,
      // 避免把背景/雾置成 undefined(快速上下机时 else 先于 true 的 await 到达)。
      if (envApplied) {
        if (saved.bg !== undefined) sc.s.background = saved.bg;
        if (saved.fog !== undefined) sc.s.fog = saved.fog;
        if (saved.hidden)
          saved.hidden.forEach((o) => {
            o.visible = true;
          });
        envApplied = false;
      }
    }
  }
  return {
    root,
    update,
    dispose,
    applyEnv,
    setSun,
    envGroup,
    cruiseLift: CRUISE_LIFT,
    voxelCount: voxCore.voxelTotal,
  };
}
