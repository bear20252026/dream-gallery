// terrain.js — 地形系统:高度函数、地基保护、颜色材质、实例化地物、区块系统、水面
import * as THREE from 'three';
import { ctx } from '../../ctx.js';
const { s } = ctx;

// ===================== 地形参数 =====================
export const KX = 800,
  KZ = 600,
  KR = 200;

// ===================== 高度函数 =====================
const hCache = new Map();
function computeHeight(x, z) {
  let y = 0.5;
  y += Math.sin(x * 0.006) * Math.cos(z * 0.006) * 4;
  y += Math.sin(x * 0.012 + 1.5) * Math.cos(z * 0.01 + 2.0) * 3;
  const plateau = Math.sin(x * 0.008 + 3) * Math.cos(z * 0.007 + 1);
  if (plateau > 0.4) y += (plateau - 0.4) * 15;
  const dune = Math.sin(x * 0.025 + 5) * Math.cos(z * 0.02 + 3);
  if (dune > 0.1) y += Math.pow(dune - 0.1, 1.5) * 8;
  const yardang = Math.sin(x * 0.035 + 8) * Math.cos(z * 0.028 + 6);
  if (yardang > 0.65) y += (yardang - 0.65) * 25;
  const salt = Math.sin(x * 0.015 + 2) * Math.cos(z * 0.012 + 4);
  if (salt > 0.5) y = y * 0.3 - 3;
  const oasis = Math.sin(x * 0.018 + 7) * Math.cos(z * 0.016 + 9);
  if (oasis > 0.75 && y < 2) y -= 1.5;
  const kx = x - KX,
    kz = z - KZ,
    kd = Math.sqrt(kx * kx + kz * kz);
  if (kd < KR) {
    const ka = Math.atan2(kz, kx);
    const kdE = Math.max(kd, 14);
    const t = Math.max(0, 1 - kdE / KR);
    let m = Math.pow(t, 1.2) * 110;
    let spiral = 0;
    for (let arm = 0; arm < 3; arm++) {
      const aa = ka + (arm * Math.PI * 2) / 3;
      const r = Math.sin(aa * 4 + kd * 0.06);
      if (r > 0.3) spiral += (r - 0.3) * t * 18;
    }
    let fold =
      Math.sin(kx * 0.04 + kz * 0.03) * t * 6 + Math.sin(kx * 0.08) * Math.cos(kz * 0.08) * t * 3;
    const calm = Math.min(1, kd / 26);
    spiral *= calm * calm;
    fold *= calm * calm;
    let peak = 0;
    if (kd < 26) {
      const tt = Math.max(0, (kd - 14) / 12);
      peak = 25 * (1 - tt * tt * (3 - 2 * tt));
    }
    const blend = Math.max(0, 1 - kd / (KR + 20));
    y = y * (1 - blend * 0.85) + (m + spiral + fold + peak) * blend;
  }
  return y;
}

// ===================== 地基保护 =====================
function rectDist(x, z, x0, x1, z0, z1) {
  const dx = Math.max(x0 - x, 0, x - x1),
    dz = Math.max(z0 - z, 0, z - z1);
  return Math.hypot(dx, dz);
}
function padF(d, flatR, blendR) {
  if (d < flatR) return 0;
  if (d > flatR + blendR) return 1;
  const t = (d - flatR) / blendR;
  return t * t * (3 - 2 * t);
}
export function protectMask(x, z) {
  let m = 1;
  m = Math.min(m, padF(rectDist(x, z, -19, 19, -13, 29), 10, 25));
  m = Math.min(m, padF(rectDist(x, z, -8, 8, 36, 52), 6, 14));
  m = Math.min(m, padF(Math.hypot(x - 39, z - 14), 8, 10));
  m = Math.min(m, padF(rectDist(x, z, -86, 86, 97, 103), 0, 10));
  m = Math.min(m, padF(rectDist(x, z, -32, 33, -103, -97), 0, 10));
  // 2026-08-31 修复大堂中央楼梯前被卡:大堂/房间 worldBox 不在保护区,沙漠地形
  // 会在 (-132,-194) 等大堂内部生成岩石(1.3×1.3 AABB),玩家朝中央楼梯走时被
  // 这些"误生成岩石"挡住。补登记大堂 + 两个房间为保护区,与 HALL/ROOMS 配置
  // 保持一致(留 5m 抗锯齿过渡)。
  // 2026-09-01 大堂整体西移 160m(X=-300,挪离 Yazd 穹顶塔),保护区同步平移:
  // 大堂 HALL.X=-300 HALL.Z=-190 WALK hx=60 hz=17 → 内圈 X∈[-360,-240] Z∈[-207,-173]
  m = Math.min(m, padF(rectDist(x, z, -360, -240, -207, -173), 0, 5));
  // picture_gallery: X=-255 Z=-300 hx=5.5 hz=11
  m = Math.min(m, padF(rectDist(x, z, -261, -249, -311, -289), 0, 5));
  // upper_vestibule: X=-390 Z=-300 hx=8 hz=6
  m = Math.min(m, padF(rectDist(x, z, -398, -382, -306, -294), 0, 5));
  // 花瓣画廊 v2(2026-09-02):中心 (60,8) 直径 40m,保护区 50×50(拍平+抗锯齿过渡)
  m = Math.min(m, padF(rectDist(x, z, 35, 85, -17, 33), 10, 25));
  return m;
}
export const getH = function (x, z) {
  const k = Math.round(x * 2) + ',' + Math.round(z * 2);
  const c = hCache.get(k);
  if (c !== undefined) return c;
  const m = protectMask(x, z);
  let h = computeHeight(x, z) * m - 0.05 * (1 - m);
  if (h < -2.2 && rectDist(x, z, -19, 19, -13, 29) < 150) h = -2.2;
  if (hCache.size > 80000) hCache.delete(hCache.keys().next().value);
  hCache.set(k, h);
  return h;
};

// ===================== 实心山铁律 =====================
export function assertAboveGround(x, y, z, tag) {
  const g = getH(x, z);
  if (y < g - 0.3) {
    const msg =
      '[实心山铁律] ' +
      (tag || '物体') +
      ' 埋入地形:(x=' +
      x.toFixed(1) +
      ',y=' +
      y.toFixed(1) +
      ',z=' +
      z.toFixed(1) +
      ') 地表=' +
      g.toFixed(1);
    console.error(msg);
    try {
      ctx.ui.modeToast &&
        ctx.ui.modeToast('摆放校验失败：' + (tag || '物体') + ' 埋进山心，已拦截');
    } catch (e) {}
    return false;
  }
  return true;
}

// ===================== 颜色 =====================
function getColor(h) {
  const r = Math.random() * 0.03;
  if (h < -2) return { r: 0.85 + r, g: 0.82 + r, b: 0.78 + r };
  if (h < 0.5) return { r: 0.75 + r, g: 0.65 + r, b: 0.45 + r };
  if (h < 3) return { r: 0.82 + r, g: 0.72 + r, b: 0.5 + r };
  if (h < 7) return { r: 0.7 + r, g: 0.6 + r, b: 0.42 + r };
  if (h < 12) return { r: 0.55 + r, g: 0.45 + r, b: 0.35 + r };
  if (h < 20) return { r: 0.45 + r, g: 0.4 + r, b: 0.38 + r };
  if (h < 35) return { r: 0.55 + r, g: 0.52 + r, b: 0.48 + r };
  if (h < 60) return { r: 0.65 + r, g: 0.62 + r, b: 0.58 + r };
  if (h < 90) return { r: 0.75 + r, g: 0.73 + r, b: 0.7 + r };
  return { r: 0.95 + r, g: 0.97 + r, b: 0.98 + r };
}

// ===================== 共享材质与几何体 =====================
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.95 });
const branchMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.95 });
const leafMat = new THREE.MeshStandardMaterial({ color: 0xdaa520, roughness: 0.8 });
const tamTrunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4c3a, roughness: 0.95 });
const tamLeafMat = new THREE.MeshStandardMaterial({ color: 0xcd5c5c, roughness: 0.8 });
const cactusMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.8 });
const deadMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1.0 });
const rockMat = new THREE.MeshStandardMaterial({
  color: 0x8b7355,
  roughness: 0.95,
  flatShading: true,
});
const saltMat = new THREE.MeshStandardMaterial({
  color: 0xeeeeee,
  roughness: 0.5,
  transparent: true,
  opacity: 0.7,
});
const grassMat = new THREE.MeshStandardMaterial({ color: 0xbdb76b, roughness: 0.9 });

const popTrunkGeo = new THREE.CylinderGeometry(0.1, 0.25, 3.5, 5);
const popBranchGeo = new THREE.CylinderGeometry(0.04, 0.08, 1.5, 4);
const popLeafGeo = new THREE.DodecahedronGeometry(1, 0);
const tamTrunkGeo = new THREE.CylinderGeometry(0.05, 0.1, 1.2, 4);
const tamLeafGeo = new THREE.SphereGeometry(1, 4, 4);
const cactusGeo = new THREE.CylinderGeometry(0.15, 0.18, 1.8, 8);
const cactusArmGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.8, 6);
const deadGeo = new THREE.CylinderGeometry(0.08, 0.15, 2.0, 5);
const rockGeo = new THREE.DodecahedronGeometry(1, 0);
const saltGeo = new THREE.PlaneGeometry(1, 1);
const grassGeo = new THREE.ConeGeometry(0.03, 1, 3);
const sharedGeos = new Set([
  popTrunkGeo,
  popBranchGeo,
  popLeafGeo,
  tamTrunkGeo,
  tamLeafGeo,
  cactusGeo,
  cactusArmGeo,
  deadGeo,
  rockGeo,
  saltGeo,
  grassGeo,
]);

const _im4 = new THREE.Matrix4(),
  _imq = new THREE.Quaternion(),
  _ime = new THREE.Euler(),
  _imv = new THREE.Vector3(),
  _ims = new THREE.Vector3();
function makeInstanced(geo, mat, items) {
  if (!items.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, items.length);
  for (let i = 0; i < items.length; i++) {
    const t = items[i];
    _ime.set(t.rx || 0, t.ry || 0, t.rz || 0);
    _imq.setFromEuler(_ime);
    _im4.compose(_imv.set(t.x, t.y, t.z), _imq, _ims.set(t.sx, t.sy, t.sz));
    im.setMatrixAt(i, _im4);
  }
  im.instanceMatrix.needsUpdate = true;
  return im;
}

// ===================== 区块系统 =====================
const CHUNK = 24,
  DIST = 4;
const chunks = new Map();
const terrainMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.98,
  metalness: 0,
  side: THREE.DoubleSide,
});

function genChunk(cx, cz) {
  const g = new THREE.Group();
  const ccx = cx * CHUNK + CHUNK / 2,
    ccz = cz * CHUNK + CHUNK / 2;
  g.position.set(ccx, 0, ccz);
  const p = ctx.player.pl ? ctx.player.pl.p : { x: 0, z: 0 };
  const pd = Math.hypot(ccx - p.x, ccz - p.z);
  let seg, detail;
  if (pd < CHUNK * 1.5) {
    seg = 24;
    detail = 2;
  } else if (pd < CHUNK * 3.5) {
    seg = 12;
    detail = 1;
  } else {
    seg = 6;
    detail = 0;
  }
  const geo = new THREE.PlaneGeometry(CHUNK, CHUNK, seg, seg);
  const pos = geo.attributes.position.array;
  const colors = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const wx = ccx + pos[i],
      wz = ccz - pos[i + 1];
    const h = getH(wx, wz);
    pos[i + 2] = h;
    const c = getColor(h);
    colors[i] = c.r;
    colors[i + 1] = c.g;
    colors[i + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, terrainMat);
  terrain.rotation.x = -Math.PI / 2;
  g.add(terrain);

  const colliders = [];
  const B = {
    popT: [],
    popB: [],
    popL: [],
    tamT: [],
    tamL: [],
    cac: [],
    cacA: [],
    dead: [],
    rock: [],
    salt: [],
    grass: [],
  };
  const place = (count, cond, cb) => {
    for (let i = 0; i < count; i++) {
      const lx = (Math.random() - 0.5) * (CHUNK - 3),
        lz = (Math.random() - 0.5) * (CHUNK - 3);
      const wx = ccx + lx,
        wz = ccz + lz,
        h = getH(wx, wz);
      if (protectMask(wx, wz) < 0.5) continue;
      if (cond(h)) cb(lx, h, lz, wx, wz);
    }
  };
  const bind = (cr, wx, wz, sc) => {
    if (!cr || !ctx.scene.bounds) return;
    const box = {
      mnX: wx - cr * sc,
      mxX: wx + cr * sc,
      mnZ: wz - cr * sc,
      mxZ: wz + cr * sc,
      _desert: true,
    };
    if (ctx.scene.addBounds) ctx.scene.addBounds([box]);
    colliders.push(box);
  };
  const d2 = detail === 2,
    d1 = detail >= 1;
  place(
    d2 ? 3 : d1 ? 2 : 1,
    (h) => h > -1 && h < 5,
    (lx, h, lz, wx, wz) => {
      const sc = 0.7 + Math.random() * 0.6,
        ry = Math.random() * Math.PI * 2;
      B.popT.push({ x: lx, y: h + 1.75 * sc, z: lz, ry, sx: sc, sy: sc, sz: sc });
      for (let i = 0; i < 3; i++)
        B.popB.push({
          x: lx + Math.sin(i * 2) * 0.6 * sc,
          y: h + (2.5 + i * 0.8) * sc,
          z: lz + Math.cos(i * 2) * 0.6 * sc,
          rx: Math.cos(i) * 0.3,
          rz: Math.sin(i) * 0.5,
          sx: sc,
          sy: sc,
          sz: sc,
        });
      for (let i = 0; i < 5; i++) {
        const ls = (0.4 + Math.random() * 0.3) * sc;
        B.popL.push({
          x: lx + (Math.random() - 0.5) * 1.5 * sc,
          y: h + (3 + Math.random() * 1.5) * sc,
          z: lz + (Math.random() - 0.5) * 1.5 * sc,
          ry: Math.random() * Math.PI,
          sx: ls,
          sy: ls,
          sz: ls,
        });
      }
      bind(0.4, wx, wz, sc);
    }
  );
  place(
    d2 ? 6 : d1 ? 3 : 1,
    (h) => h > 2 && h < 8,
    (lx, h, lz) => {
      const sc = 0.7 + Math.random() * 0.5,
        ry = Math.random() * Math.PI * 2;
      B.tamT.push({ x: lx, y: h + 0.6 * sc, z: lz, ry, sx: sc, sy: sc, sz: sc });
      for (let i = 0; i < 8; i++) {
        const ls = (0.15 + Math.random() * 0.1) * sc;
        B.tamL.push({
          x: lx + (Math.random() - 0.5) * 0.8 * sc,
          y: h + (0.8 + Math.random() * 0.6) * sc,
          z: lz + (Math.random() - 0.5) * 0.8 * sc,
          sx: ls,
          sy: ls,
          sz: ls,
        });
      }
    }
  );
  place(
    d2 ? 3 : d1 ? 2 : 1,
    (h) => h > 1 && h < 4,
    (lx, h, lz, wx, wz) => {
      const sc = 0.7 + Math.random() * 0.6,
        ry = Math.random() * Math.PI * 2;
      B.cac.push({ x: lx, y: h + 0.9 * sc, z: lz, ry, sx: sc, sy: sc, sz: sc });
      if (Math.random() > 0.5)
        B.cacA.push({ x: lx + 0.2 * sc, y: h + 1.2 * sc, z: lz, rz: -0.6, sx: sc, sy: sc, sz: sc });
      bind(0.2, wx, wz, sc);
    }
  );
  place(
    d2 ? 3 : d1 ? 2 : 1,
    (h) => h > 0 && h < 6,
    (lx, h, lz) => {
      const sc = 0.7 + Math.random() * 0.6;
      B.dead.push({
        x: lx,
        y: h + 1.0 * sc,
        z: lz,
        ry: Math.random() * Math.PI * 2,
        rz: (Math.random() - 0.5) * 0.4,
        sx: sc,
        sy: sc,
        sz: sc,
      });
    }
  );
  place(
    d2 ? 8 : d1 ? 5 : 2,
    (h) => h > 5,
    (lx, h, lz, wx, wz) => {
      const r = 0.6 + Math.random() * 1.5,
        sc = 0.7 + Math.random() * 0.6;
      B.rock.push({
        x: lx,
        y: h,
        z: lz,
        rx: Math.random(),
        ry: Math.random(),
        rz: Math.random(),
        sx: r * (1 + Math.random() * 0.8) * sc,
        sy: r * (0.6 + Math.random() * 0.6) * sc,
        sz: r * (1 + Math.random() * 0.8) * sc,
      });
      bind(0.8, wx, wz, sc);
    }
  );
  place(
    3,
    (h) => h < -0.5,
    (lx, h, lz) => {
      const sc = 0.7 + Math.random() * 0.6;
      B.salt.push({
        x: lx,
        y: h + 0.02,
        z: lz,
        rx: -Math.PI / 2 + (Math.random() - 0.5) * 0.2,
        rz: Math.random() * Math.PI,
        sx: (2 + Math.random() * 3) * sc,
        sy: 1,
        sz: (2 + Math.random() * 3) * sc,
      });
    }
  );
  place(
    d2 ? 30 : d1 ? 15 : 5,
    (h) => h > 0.5 && h < 5,
    (lx, h, lz) => {
      const sc = 0.7 + Math.random() * 0.6,
        gh = (0.15 + Math.random() * 0.2) * sc;
      B.grass.push({
        x: lx,
        y: h + gh * 0.5,
        z: lz,
        ry: Math.random() * Math.PI * 2,
        sx: sc,
        sy: gh,
        sz: sc,
      });
    }
  );
  [
    [B.popT, popTrunkGeo, trunkMat],
    [B.popB, popBranchGeo, branchMat],
    [B.popL, popLeafGeo, leafMat],
    [B.tamT, tamTrunkGeo, tamTrunkMat],
    [B.tamL, tamLeafGeo, tamLeafMat],
    [B.cac, cactusGeo, cactusMat],
    [B.cacA, cactusArmGeo, cactusMat],
    [B.dead, deadGeo, deadMat],
    [B.rock, rockGeo, rockMat],
    [B.salt, saltGeo, saltMat],
    [B.grass, grassGeo, grassMat],
  ].forEach(([items, geo, mat]) => {
    const im = makeInstanced(geo, mat, items);
    if (im) g.add(im);
  });
  s.add(g);
  return { g, colliders };
}

export function updateChunks() {
  if (!ctx.player.pl) return;
  const pcx = Math.floor(ctx.player.pl.p.x / CHUNK),
    pcz = Math.floor(ctx.player.pl.p.z / CHUNK);
  const need = new Set();
  let created = 0;
  for (let x = pcx - DIST; x <= pcx + DIST; x++)
    for (let z = pcz - DIST; z <= pcz + DIST; z++) {
      const k = x + ',' + z;
      need.add(k);
      if (!chunks.has(k) && created < 3) {
        chunks.set(k, genChunk(x, z));
        created++;
      }
    }
  for (const [k, c] of chunks) {
    if (!need.has(k)) {
      s.remove(c.g);
      c.g.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
        if (o.geometry && !sharedGeos.has(o.geometry)) o.geometry.dispose();
        if (
          o.material &&
          o.material !== terrainMat &&
          o.material !== trunkMat &&
          o.material !== branchMat &&
          o.material !== leafMat &&
          o.material !== tamTrunkMat &&
          o.material !== tamLeafMat &&
          o.material !== cactusMat &&
          o.material !== deadMat &&
          o.material !== rockMat &&
          o.material !== saltMat &&
          o.material !== grassMat
        )
          o.material.dispose();
      });
      if (ctx.scene.removeBounds) ctx.scene.removeBounds(c.colliders);
      chunks.delete(k);
    }
  }
}

// ===================== 水面 =====================
export const waterU = {
  uTime: { value: 0 },
  uColor: { value: new THREE.Color(0x5a7a6a) },
  uOpacity: { value: 0.75 },
  uOffset: { value: new THREE.Vector2(0, 0) },
};
export const water = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400, 60, 60),
  new THREE.ShaderMaterial({
    uniforms: waterU,
    transparent: true,
    side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime;
      uniform vec2 uOffset;
      varying float vElevation;
      void main(){
        vec3 pos=position;
        float worldX=pos.x+uOffset.x;
        float worldZ=-pos.y+uOffset.y;
        float wave=sin(worldX*0.3+uTime*1.2)*0.08
                 +cos(worldZ*0.25+uTime*0.9)*0.08
                 +sin((worldX+worldZ)*0.15+uTime*0.6)*0.05;
        pos.z+=wave;
        vElevation=wave;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vElevation;
      void main(){
        vec3 color=uColor+vElevation*0.15;
        float alpha=uOpacity+vElevation*0.06;
        gl_FragColor=vec4(color,alpha);
      }`,
  })
);
water.rotation.x = -Math.PI / 2;
water.position.y = -2.5;
s.add(water);
