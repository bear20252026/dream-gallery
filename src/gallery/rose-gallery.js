// rose-gallery.js — 玫瑰花瓣展馆(旁侧空地 144,-60) — 参考 Tripo 模型3(20260902053436)几何等高线描摹建造
// 数据源: ./rose-gallery-data.json(米制, 原点=建筑中心, 直径 42m, 由 scripts/trace_rose.py 生成)
// 技术路线: 与花瓣画廊 v2 同源(描摹矢量 → 分段挤出 → AABB 碰撞注册)
// 结构: 六瓣花形外墙环(西门洞) + 三档阶梯内墙(t0 3.8m/t1 7.2m/t2 10m,螺旋花瓣迷宫)
//       + 中央圆厅(穹顶灯) + 天花 + 迎宾大道(门→中心每圈墙自动开缺口)
// ⚠️ 本阶段只搭壳体;内部展陈待用户验收后另行施工
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { expose } from '../debug-hooks.js';
import { makeWallBuilder, resampleRing } from '../shared/wall-builder.js';
import DATA from './rose-gallery-data.json';

const { s } = ctx.scene;

// ===================== 常量 =====================
const GX = 144; // 建筑中心(v2 东南 108m,地形扫描 std=5.6cm 全场最平,terrain.js protectMask 已拍平)
const GZ = -60;
const WALL_H = 10; // t2 主墙高(与 v2 一致,自定值可调)
const WALL_TH = 0.5; // 墙厚
const DOOR_HALF = 2.4; // 门洞半宽
const AVENUE_HALF = 1.7; // 迎宾大道半宽(每圈墙在门→中心连线上开缺口)
const CEIL_BASE = WALL_H - 0.32;
const COLORS = {
  groove: 0x6f6b68,
  ceiling: 0xd9d3d0,
  lights: 0xffffff,
};

const g = new THREE.Group();
g.position.set(GX, 0, GZ);
s.add(g);

// ===================== 材质 =====================
const wallMat = new THREE.MeshStandardMaterial({
  color: '#e9e3d8',
  roughness: 0.88,
  metalness: 0.02,
});
const ceilDark = new THREE.MeshStandardMaterial({
  color: COLORS.groove,
  roughness: 0.95,
  side: THREE.DoubleSide,
});
const ceilMat = new THREE.MeshStandardMaterial({
  color: COLORS.ceiling,
  roughness: 0.85,
  side: THREE.DoubleSide,
});
const lightMat = new THREE.MeshBasicMaterial({ color: COLORS.lights, side: THREE.DoubleSide });
const floorMat = new THREE.MeshStandardMaterial({ color: '#ded6c9', roughness: 0.92 });

// ===================== 几何辅助 =====================
function toShape(ring) {
  const pts = ring.map((p) => new THREE.Vector2(p[0], -p[1]));
  return new THREE.Shape(pts);
}
function flatMesh(shape, y, mat) {
  const geo = new THREE.ShapeGeometry(shape);
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  return m;
}
// 弧长重采样(共享工厂)
const resample = resampleRing;
// 点到线段距离
function distToSeg(px, pz, a, b) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const L2 = dx * dx + dz * dz;
  let t = L2 ? ((px - a[0]) * dx + (pz - a[1]) * dz) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz));
}

// ===================== 地板 =====================
g.add(flatMesh(toShape(DATA.silhouette), 0.06, floorMat));

// ===================== 外墙环(西门洞朝 v2 方向) =====================
const bounds = [];
const sil = DATA.silhouette;
// 门洞中心:轮廓上朝向 v2 (60,8) 方向最凸出的点(西北向)
const TO_V2 = Math.atan2(60 - GX, 8 - GZ); // 目标方位角(atan2 形式)
let doorIdx = 0,
  doorBest = -Infinity;
for (let i = 0; i < sil.length; i++) {
  const a = Math.atan2(sil[i][0], sil[i][1]);
  const d = Math.cos(a - TO_V2) * Math.hypot(sil[i][0], sil[i][1]);
  if (d > doorBest) {
    doorBest = d;
    doorIdx = i;
  }
}
const doorC = sil[doorIdx];
// 墙段建造(共享工厂;ox/oz 保证碰撞盒世界坐标——2026-09-02 原点压死事故的修复,
// 现收口进 wall-builder,新模块不再可能漏偏移)
const addWallSeg = makeWallBuilder({
  parent: g,
  mat: wallMat,
  th: WALL_TH,
  defaultH: WALL_H,
  ox: GX,
  oz: GZ,
  bounds,
});
// 缺口判定:段中点或任一端点在迎宾大道(门洞→中心连线)半宽内则开缺口
function isGap(mx, mz, a, b) {
  return (
    distToSeg(mx, mz, doorC, [0, 0]) < AVENUE_HALF ||
    distToSeg(a[0], a[1], doorC, [0, 0]) < AVENUE_HALF * 0.8 ||
    distToSeg(b[0], b[1], doorC, [0, 0]) < AVENUE_HALF * 0.8
  );
}
let segCount = 0,
  doorSegs = 0;
const outerRing = resample(sil, 1.3);
for (let i = 0; i < outerRing.length; i++) {
  const a = outerRing[i],
    b = outerRing[(i + 1) % outerRing.length];
  const mx = (a[0] + b[0]) / 2,
    mz = (a[1] + b[1]) / 2;
  if (Math.hypot(mx - doorC[0], mz - doorC[1]) < DOOR_HALF) {
    doorSegs++;
    continue;
  }
  addWallSeg(a[0], a[1], b[0], b[1], WALL_H);
  segCount++;
}
// 门楣(装饰,无碰撞)
if (doorSegs > 0) {
  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, WALL_H - 7, DOOR_HALF * 2 * 1.05),
    wallMat
  );
  lintel.position.set(doorC[0], 7 + (WALL_H - 7) / 2, doorC[1]);
  lintel.rotation.y = Math.atan2(-doorC[0], -doorC[1]) + Math.PI / 2;
  g.add(lintel);
}

// ===================== 三档阶梯内墙(螺旋花瓣迷宫 + 迎宾大道缺口) =====================
const tierHeights = { t0: 3.8, t1: 7.2, t2: WALL_H };
let innerSegs = 0,
  avenueGaps = 0;
const ringStats = [];
for (const ring of DATA.rings) {
  const h = tierHeights[ring.level] ?? WALL_H;
  let cnt = 0;
  for (const contour of ring.contours) {
    // 过滤微小碎片(噪声/装饰屑)
    let mnx = Infinity,
      mxx = -Infinity,
      mnz = Infinity,
      mxz = -Infinity;
    for (const p of contour) {
      mnx = Math.min(mnx, p[0]);
      mxx = Math.max(mxx, p[0]);
      mnz = Math.min(mnz, p[1]);
      mxz = Math.max(mxz, p[1]);
    }
    if (Math.hypot(mxx - mnx, mxz - mnz) < 1.5) continue;
    const r = resample(contour, 1.5);
    for (let i = 0; i < r.length; i++) {
      const a = r[i],
        b = r[(i + 1) % r.length];
      const mx = (a[0] + b[0]) / 2,
        mz = (a[1] + b[1]) / 2;
      if (isGap(mx, mz, a, b)) {
        avenueGaps++;
        continue;
      }
      addWallSeg(a[0], a[1], b[0], b[1], h);
      cnt++;
      innerSegs++;
    }
  }
  ringStats.push(`${ring.level}:${cnt}`);
}
ctx.scene.addBounds && ctx.scene.addBounds(bounds);

// ===================== 天花(暗缝底板 + 亮面板) =====================
g.add(flatMesh(toShape(DATA.silhouette), CEIL_BASE, ceilDark));
g.add(flatMesh(toShape(DATA.silhouette), WALL_H, ceilMat));

// ===================== 灯光(中央圆厅穹灯 + 4 盏花瓣灯) =====================
// 中央灯位:取 t2 轮廓中形心最靠近原点(建筑中心)的一个 = 中央圆厅
let coreC = [0, 0],
  coreBest = Infinity;
for (const contour of DATA.rings[DATA.rings.length - 1].contours) {
  let A = 0,
    cx = 0,
    cz = 0;
  for (let i = 0; i < contour.length; i++) {
    const p = contour[i],
      q = contour[(i + 1) % contour.length];
    const cr = p[0] * q[1] - q[0] * p[1];
    A += cr;
    cx += (p[0] + q[0]) * cr;
    cz += (p[1] + q[1]) * cr;
  }
  A /= 2;
  const area = Math.abs(A);
  if (area < 2) continue;
  const px = cx / (6 * A),
    pz = cz / (6 * A);
  const d = Math.hypot(px, pz);
  if (d < coreBest) {
    coreBest = d;
    coreC = [px, pz];
  }
}
const domeGeo = new THREE.CircleGeometry(2.2, 32);
const dome = new THREE.Mesh(domeGeo, lightMat);
dome.rotation.x = Math.PI / 2;
dome.position.set(coreC[0], WALL_H - 0.05, coreC[1]);
g.add(dome);
const mainLight = new THREE.PointLight('#fff5e8', 5.5, 30, 1.6);
mainLight.position.set(coreC[0], WALL_H - 1.0, coreC[1]);
g.add(mainLight);
// 花瓣灯:4 盏,t1 轮廓中面积最大的 4 个形心
const petalLights = [];
for (const contour of DATA.rings[1].contours) {
  let A = 0,
    cx = 0,
    cz = 0;
  for (let i = 0; i < contour.length; i++) {
    const p = contour[i],
      q = contour[(i + 1) % contour.length];
    const cr = p[0] * q[1] - q[0] * p[1];
    A += cr;
    cx += (p[0] + q[0]) * cr;
    cz += (p[1] + q[1]) * cr;
  }
  A /= 2;
  petalLights.push({ area: Math.abs(A), x: cx / (6 * A), z: cz / (6 * A) });
}
petalLights.sort((a, b) => b.area - a.area);
petalLights.slice(0, 4).forEach((L) => {
  const pl = new THREE.PointLight('#fff5e8', 4, 22, 1.6);
  pl.position.set(L.x, tierHeights.t1 - 0.8, L.z);
  g.add(pl);
});
g.userData.lights = { core: coreC, petals: petalLights.slice(0, 4) };

// ===================== 注册与导出 =====================
expose('roseGallery', {
  group: g,
  center: { x: GX, z: GZ },
  wallHeight: WALL_H,
  diameter: DATA.meta.diameter,
  segCount,
  innerSegs,
  boundsCount: bounds.length,
  avenueGaps,
  door: { x: doorC[0] + GX, z: doorC[1] + GZ },
  core: { x: coreC[0] + GX, z: coreC[1] + GZ },
});
console.log(
  `[rose-gallery] built @(${GX},${GZ}) dia=${DATA.meta.diameter}m walls=${segCount}+${innerSegs}(${ringStats.join(',')}) bounds=${bounds.length} doorSegs=${doorSegs} avenueGaps=${avenueGaps}`
);
