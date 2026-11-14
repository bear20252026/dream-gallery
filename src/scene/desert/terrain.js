// terrain.js — 地形系统:高度函数、地基保护、颜色材质、实例化地物、区块系统、水面
import * as THREE from 'three';
import { ctx } from '../../ctx.js';
import { attachSandDetail } from './sand-detail.js'; // 2026-11-12 画质:沙地程序化细节(去塑料感)
import { attachFoliageLife } from './foliage-life.js'; // 2026-11-13 自然表面:植被风摆+斑驳
import { makeContactShadows } from './contact-shadows.js'; // 2026-11-13:植被落地接触阴影
import { registerRecompile } from './detail-quality.js'; // 2026-11-13:水面低画质档降涟漪
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
  // 玫瑰花瓣展馆(2026-09-02):中心 (144,-60) 直径 42m,保护区 50×50(同 v2 规格)
  m = Math.min(m, padF(rectDist(x, z, 119, 169, -85, -35), 10, 25));
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

// 2026-11-13 自然表面:植被风摆+斑驳。base≈实例原点离地偏移-几何半高(≈地面),
// 权重随高度平方 ⇒ 根部不动梢部摆;树冠摆幅大、树干微颤、草整株摇。
attachFoliageLife(leafMat, { sway: 0.12, base: 1.9, height: 2.6, mottle: 0.28 });
attachFoliageLife(tamLeafMat, { sway: 0.05, base: 0.55, height: 1.0, mottle: 0.26 });
attachFoliageLife(grassMat, { sway: 0.12, base: 0.0, height: 0.45, mottle: 0.22 });
attachFoliageLife(trunkMat, { sway: 0.02, base: 0.0, height: 3.5, mottle: 0.12 });
attachFoliageLife(tamTrunkMat, { sway: 0.015, base: 0.0, height: 1.2, mottle: 0.12 });
attachFoliageLife(cactusMat, { sway: 0.008, base: 0.0, height: 1.8, mottle: 0.15 });

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
// 2026-11-12 光效:导出供昼夜染色(desert/light-mood.js 的 applyMood 改它的 color)。
// ⚠️ 为什么改材质 color 而不是顶点色:顶点色(getColor)里盐滩是 0.85/0.82/0.78 近白,
// 叠上 1.6 强度日光后**过曝成一片白**(主人报「画面发白、光照平」的真病根)。
// 顶点色写死在几何体里,改它要重建全部区块;而材质 color 是与顶点色相乘的全局染色因子,
// 改一个 uniform 即可让整片地表随昼夜压暗/染色,零重建、零新增 draw call。
export const terrainMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.98,
  metalness: 0,
  side: THREE.DoubleSide,
});
// 沙地细节(波痕/沙粒/云影):去掉「一整片光滑塑料」的观感。
// 程序化注入,零外部资产;区块共享此材质,不增加 draw call。
attachSandDetail(terrainMat);

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
  // 接触阴影落点(局部坐标,与区块网格同系)
  const shadowItems = [];
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
      shadowItems.push({ x: lx, y: h, z: lz, r: 1.1 * sc });
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
      shadowItems.push({ x: lx, y: h, z: lz, r: 0.5 * sc });
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
      shadowItems.push({ x: lx, y: h, z: lz, r: r * 1.15 });
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
  // 接触阴影:落点收集完后建实例化圆盘(单 draw call),随区块一起卸载
  const cShadows = makeContactShadows(shadowItems);
  if (cShadows) g.add(cShadows);
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
  // 2026-11-12 画质:水面是自定义 ShaderMaterial,**不走 Three 的光照管线**,
  // 所以昼夜怎么变它都不动 —— 夜里天空全黑了,水面仍是白天亮度,看着像一片
  // 自发光的青绿地面(主人夜里看到的那片诡异青色就是它)。
  // 这里加一个光照因子,由 dayNight 逐帧写:夜里压暗并偏冷,晨昏染暖,白天原样。
  // ⚠️ 必须是 Color 而不是 Vector3:氛围层用 setRGB() 写它,Vector3 没有这个方法
  //    (实机首轮就报 "setRGB is not a function";单测替身掩盖了,故此处注明)。
  //    Color 默认在**线性**工作空间,setRGB 直接写线性分量,正是着色器要的。
  uLight: { value: new THREE.Color(1, 1, 1) },
  // 2026-11-13 自然表面轮:太阳方向/天空色/日光色,由 dayNight 逐帧写,
  // 供水面做菲涅尔天空反射与太阳高光(原先水面是纯平涂色,没有「水」的光学特征)。
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSky: { value: new THREE.Color(0xd4c8a0) },
  uSunCol: { value: new THREE.Color(0xfff0d0) },
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
      varying vec3 vWPos;
      varying vec3 vNrm;
      void main(){
        vec3 pos=position;
        float worldX=pos.x+uOffset.x;
        float worldZ=-pos.y+uOffset.y;
        float a1=worldX*0.3+uTime*1.2;
        float a2=worldZ*0.25+uTime*0.9;
        float a3=(worldX+worldZ)*0.15+uTime*0.6;
        float wave=sin(a1)*0.08+cos(a2)*0.08+sin(a3)*0.05;
        // 解析法线:对波形求导(局部系),转世界系供片元做反射/高光
        float dx=cos(a1)*0.024+cos(a3)*0.0075;
        float dy=-sin(a2)*0.02+cos(a3)*0.0075;
        vNrm=normalize(vec3(-dx,dy,1.0)); // 局部 z 向上,旋转后对应世界 +y
        pos.z+=wave;
        vElevation=wave;
        vWPos=(modelMatrix*vec4(pos,1.0)).xyz;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform vec3 uLight; // 昼夜光照因子(白天 1,1,1)
      uniform vec3 uSunDir;
      uniform vec3 uSky;
      uniform vec3 uSunCol;
      uniform float uTime;
      varying float vElevation;
      varying vec3 vWPos;
      varying vec3 vNrm;
      void main(){
        // 局部法线( z  up )→ 世界( y up ):mesh 绕 X -90°
        vec3 N=normalize(vec3(vNrm.x,vNrm.z,-vNrm.y));
        // 细碎涟漪:两层小波扰动法线,高光才会「碎」成粼粼而不是一个光斑
        float r1=sin(vWPos.x*2.1+uTime*2.2)*sin(vWPos.z*1.7-uTime*1.8);
        // 低画质档:编译期去掉第二层涟漪(4 sin → 2 sin),粼光仍在
        #ifdef DETAIL_LOW
          N=normalize(N+vec3(r1*0.06,0.0,r1*0.05));
        #else
          float r2=sin(vWPos.x*4.3-uTime*3.1)*sin(vWPos.z*3.9+uTime*2.6);
          N=normalize(N+vec3(r1*0.06+r2*0.03,0.0,r1*0.05-r2*0.04));
        #endif
        vec3 V=normalize(cameraPosition-vWPos);
        vec3 L=normalize(uSunDir);
        // 菲涅尔:掠射角反射天空,正视看水体 ⇒ 水面有「反光」的真实感
        float fres=pow(1.0-max(dot(N,V),0.0),3.0);
        vec3 base=(uColor+vElevation*0.15)*uLight;
        vec3 col=mix(base,uSky*max(uLight,vec3(0.15)),fres*0.65);
        // 太阳高光:窄瓣镜面 + 宽瓣粼光
        vec3 H=normalize(L+V);
        float spec=pow(max(dot(N,H),0.0),120.0)*1.2+pow(max(dot(N,H),0.0),24.0)*0.25;
        col+=uSunCol*spec*max(uLight,vec3(0.0));
        float alpha=uOpacity+vElevation*0.06+fres*0.15;
        gl_FragColor=vec4(col,alpha);
      }`,
  })
);
water.rotation.x = -Math.PI / 2;
water.position.y = -2.5;
s.add(water);
// 水面接画质档:低档走上面 DETAIL_LOW 的单层涟漪分支
registerRecompile(water.material);
