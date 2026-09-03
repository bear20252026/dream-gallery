// gallery-v2.js — 花瓣画廊 v2(旁侧空地 60,8) — 按用户验收模板 plan-trace5 1:1 程序化建造
// 数据源: ./gallery-v2-data.json(米制, 原点=建筑中心, 直径 40m, 由 scripts/artifacts/prep-gallery-v2.cjs 生成)
// 技术路线(2026-09-02 用户拍板"所见即所得+直挤出"): 描摹矢量 → 全高直挤出 → AABB 碰撞注册
//   —— v2 外墙本来就是统一高度直挤出,本次仅墙高 10m→50m(与玫瑰馆统一),天花整体上移
// 结构: 外轮廓墙环(带西门洞) + 分层天花(深缝/斜面/亮面) + 白色自发光灯 + 地板
// ⚠️ 本阶段只搭壳体;挂画系统迁移/坐台待用户验收壳体后另行施工
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { expose } from '../debug-hooks.js';
import { makeWallBuilder, resampleRing } from '../shared/wall-builder.js';
import DATA from './gallery-v2-data.json';

const { s } = ctx.scene;

// ===================== 常量 =====================
const GX = 60; // 建筑中心(画廊正东空地,terrain.js protectMask 已拍平)
const GZ = 8;
const WALL_H = 50; // 统一墙高(2026-09-02 用户拍板 50m 直挤出;数据文件里的 10m 已废弃)
const WALL_TH = 0.5; // 墙厚
const DOOR_HALF = 2.2; // 西门洞半宽(朝向旧画廊,通高)
const CEIL_BASE = WALL_H - 0.32; // 天花底板(y=9.68)
const Y = { groove: WALL_H - 0.22, lights: WALL_H - 0.17, bevel: WALL_H - 0.09, ceiling: WALL_H };
const COLORS = {
  groove: 0x8f8d8c,
  bevel: 0xbdb7b4,
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
const ceilMats = {
  groove: new THREE.MeshStandardMaterial({
    color: COLORS.groove,
    roughness: 0.95,
    side: THREE.DoubleSide,
    // 50m 层高:点光源照不匀整片天花,自发光兜底防远处发黑(2026-09-02 探针定位)
    emissive: 0x6a6765,
    emissiveIntensity: 0.5,
  }),
  bevel: new THREE.MeshStandardMaterial({
    color: COLORS.bevel,
    roughness: 0.9,
    side: THREE.DoubleSide,
    emissive: 0x8a827c,
    emissiveIntensity: 0.42,
  }),
  ceiling: new THREE.MeshStandardMaterial({
    color: COLORS.ceiling,
    roughness: 0.85,
    side: THREE.DoubleSide,
    emissive: 0x8a827c,
    emissiveIntensity: 0.42,
  }),
  lights: new THREE.MeshBasicMaterial({ color: COLORS.lights, side: THREE.DoubleSide }),
};
const floorMat = new THREE.MeshStandardMaterial({ color: '#ded6c9', roughness: 0.92 });

// ===================== 几何辅助 =====================
// 数据坐标 [x, z](米);ShapeGeometry 在 XY 平面,rotation.x=-PI/2 后 shape.y → world -z
// 所以 shape 点取 (x, -z) 即可让 world.z = z
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

// ===================== 地板 =====================
const floor = flatMesh(toShape(DATA.silhouette), 0.06, floorMat);
g.add(floor);

// ===================== 外轮廓墙环(碰撞 + 实体) =====================
// 按弧长重采样轮廓成 ~1.3m 的墙段;西门洞(朝旧画廊)跳段
const bounds = [];
const sil = DATA.silhouette;
// 门洞中心:轮廓上 x 最小的点(最西侧)
let doorIdx = 0;
for (let i = 1; i < sil.length; i++) if (sil[i][0] < sil[doorIdx][0]) doorIdx = i;
const doorC = sil[doorIdx];
// 弧长重采样(共享工厂 resampleRing)
const step = 1.3;
const ring = resampleRing(sil, step);
// 墙段建造(共享工厂;ox/oz 修正碰撞盒世界坐标——旧版漏偏移,墙盒错位原点)
const addWallSeg = makeWallBuilder({
  parent: g,
  mat: wallMat,
  th: WALL_TH,
  defaultH: WALL_H,
  ox: GX,
  oz: GZ,
  bounds,
});
let segCount = 0,
  doorSegs = 0;
for (let i = 0; i < ring.length; i++) {
  const a = ring[i],
    b = ring[(i + 1) % ring.length];
  const mx = (a[0] + b[0]) / 2,
    mz = (a[1] + b[1]) / 2;
  // 门洞判定:段中点在西门附近且确实位于西侧
  const nearDoor = Math.hypot(mx - doorC[0], mz - doorC[1]) < DOOR_HALF && mx < 0;
  if (nearDoor) {
    doorSegs++;
    continue;
  }
  addWallSeg(a[0], a[1], b[0], b[1]);
  segCount++;
}
// 门楣(纯装饰,无碰撞——bounds 是 2D AABB 会把整条门堵死)
if (doorSegs > 0) {
  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, WALL_H - 7, DOOR_HALF * 2 * 1.05),
    wallMat
  );
  lintel.position.set(doorC[0], 7 + (WALL_H - 7) / 2, doorC[1]);
  lintel.rotation.y = Math.atan2(-doorC[0], 0) + Math.PI / 2; // 面朝西,沿轮廓切向
  g.add(lintel);
}
ctx.scene.addBounds && ctx.scene.addBounds(bounds);

// ===================== 天花底板(填 1px 级缝隙) =====================
const baseCeil = flatMesh(
  toShape(DATA.silhouette),
  CEIL_BASE,
  new THREE.MeshStandardMaterial({
    color: 0x6f6b68,
    roughness: 0.95,
    side: THREE.DoubleSide,
    emissive: 0x55504c,
    emissiveIntensity: 0.55,
  })
);
g.add(baseCeil);

// ===================== 分层天花(深缝→灯→斜面→亮面,由低到高) =====================
let polyCount = 0;
for (const name of ['groove', 'lights', 'bevel', 'ceiling']) {
  const layer = DATA.layers[name];
  for (const grp of layer.groups) {
    const shape = toShape(grp.o);
    for (const h of grp.h)
      shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], -p[1]))));
    g.add(flatMesh(shape, Y[name], ceilMats[name]));
    polyCount++;
  }
}

// ===================== 灯光(自发光面 + 限量点光源) =====================
// 灯位:中央大灯(area 最大) + 6 条弯月;点光源只给中央+3 条弯月(灯光预算)
// 50m 净高:吊灯位贴近天花,强度/距离按层高放大(decay 1.4,地面照度≈0.2~0.4)
const lightsSorted = [...DATA.lightsMeta].sort((a, b) => b.area - a.area);
lightsSorted.forEach((L, i) => {
  if (i < 4) {
    const pl = new THREE.PointLight('#fff5e8', 40, 130, 1.4);
    pl.position.set(L.x, WALL_H - 0.9, L.z);
    g.add(pl);
  }
});
g.userData.lights = lightsSorted; // 探针/后续挂画系统读取

// ===================== 注册与导出 =====================
// ctx.gallery 被软冻结(aliasNS)不可加属性 → 挂诊断钩子(探针契约 window.__galleryV2)
expose('galleryV2', {
  group: g,
  center: { x: GX, z: GZ },
  wallHeight: WALL_H,
  diameter: DATA.meta.diameter,
  segCount,
  polyCount,
  boundsCount: bounds.length,
  door: { x: doorC[0] + GX, z: doorC[1] + GZ },
});
console.log(
  `[gallery-v2] built @(${GX},${GZ}) dia=${DATA.meta.diameter}m walls=${segCount} polys=${polyCount} bounds=${bounds.length} doorSegs=${doorSegs}`
);
