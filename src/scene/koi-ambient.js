// koi-ambient.js — 锦鲤氛围装饰:樱花花瓣粒子 + 鹤群(2026-11-18 H2 从 koi-ship.js 抽出)
// 两个纯装饰动画子系统:花瓣 InstancedMesh(400粒,respawn 自花树发射点)+ 五只体素鹤绕飞。
// 构建顺序与 rng 调用序列与拆分前逐字一致(cranes→petals,编排层调用序不变),外观零变化。
// blossomEmitters 由 buildTrees 填充、buildPetals 消费——注入同一数组引用,时序语义不变。
import * as THREE from 'three';

/**
 * @param {object} deps
 * @param {object} deps.voxCore createVoxCore 实例(rnd/rr/pick/shade/v3/Vox/solid,共享 rng 保序)
 * @param {THREE.Group} deps.root 花瓣 InstancedMesh 挂 root(随飞行姿态)
 * @param {THREE.Group} deps.craneGroup 鹤群容器
 * @param {THREE.MeshStandardMaterial} deps.matPetal 花瓣共享材质
 * @param {Array} deps.blossomEmitters 花树发射点(buildTrees 填,respawnPetal 读)
 * @param {Array<Function>} deps.updaters 每帧回调注册表
 */
export function createKoiAmbient({
  voxCore,
  root,
  craneGroup,
  matPetal,
  blossomEmitters,
  updaters,
}) {
  const { rnd, rr, pick, shade, v3, Vox, solid } = voxCore;
  // 花瓣 InstancedMesh(原编排层 let petals,区内独占;dispose 走 root.traverse 释放,无需外层持有)
  let petals = null;
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

  return { buildPetals, buildCranes };
}
