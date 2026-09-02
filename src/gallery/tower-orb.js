// tower-orb.js — 塔尖光弧汇聚光球(2026-09-02):6 座 Yazd 穹顶塔的能量汇聚地标
// 效果:每座塔塔尖拉出一条弧形光带(高空汇聚式,管状自发光) → 6 条弧线
//       收束于中心上空 ORB_Y 处的巨大光球(呼吸脉动) → 3 圈弧段光环
//       缓慢反向旋转 + 1 盏暖金 PointLight 照亮中心广场。
// 坐标与 dome-towers.js 保持同源(CX/CZ/RADIUS/COUNT/角度公式),但独立本模块,
// 不依赖 GLB 加载(塔尖位置由同一公式解析计算),出问题可单独摘除。
// 无碰撞(全部悬空元素);材质 fog:false(自发光体不受雾衰减,远眺可见)。
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { hotBegin, hotEnd } from '../hot.js';
import { expose } from '../debug-hooks.js';

const bag = hotBegin('tower-orb');
const sc = ctx.scene;
const { s, OT, OBR } = sc;

// ===================== 常量(与 dome-towers.js 同源) =====================
const CX = 0;
const CZ = (OT + OBR) / 2; // 画廊几何中心 z = 8
const RADIUS = 30 * 10; // 塔环半径 300m
const COUNT = 6;
const TIP_H = 8.5 * 15; // 塔尖高度 127.5m(dome-towers TARGET_H,落地后顶面)

// ===================== 效果参数(可调) =====================
const ORB_Y = 165; // 光球中心高度(比塔尖高 ~38m)
const ORB_R = 22; // 光球半径
const TUBE_R = 2; // 弧形光带管半径
const PULSE_S = 6; // 呼吸脉动周期(秒)
const ARC_COLOR = 0xffb45e;
const CORE_COLOR = 0xffcf7d;
const GLOW_COLOR = 0xffc37a;
const LIGHT_COLOR = 0xffc37a;

const orbCenter = new THREE.Vector3(CX, ORB_Y, CZ);
const group = new THREE.Group();
s.add(group);
bag.objs.push(group);

// ===================== 光晕贴图(径向渐变 canvas) =====================
function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g2 = c.getContext('2d');
  const grad = g2.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,244,220,1)');
  grad.addColorStop(0.25, 'rgba(255,220,160,0.55)');
  grad.addColorStop(0.6, 'rgba(255,200,120,0.16)');
  grad.addColorStop(1, 'rgba(255,190,110,0)');
  g2.fillStyle = grad;
  g2.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const glowTex = makeGlowTexture();

// ===================== 弧形光带 ×6 =====================
// 走向:塔尖 → 先向上拱起(控制点高于光球 ~34m、半径收到 0.62) → 弯入光球表面
const arcMat = new THREE.MeshBasicMaterial({
  color: ARC_COLOR,
  toneMapped: false,
  fog: false,
});
let arcLenTotal = 0;
for (let i = 0; i < COUNT; i++) {
  const ang = (i / COUNT) * Math.PI * 2 + Math.PI / 6; // 与 dome-towers 同角度
  const tx = CX + Math.sin(ang) * RADIUS;
  const tz = CZ + Math.cos(ang) * RADIUS;
  const p0 = new THREE.Vector3(tx, TIP_H, tz);
  const dir = p0.clone().sub(orbCenter).normalize();
  const p2 = orbCenter.clone().add(dir.multiplyScalar(ORB_R * 0.92)); // 略嵌入球面
  const p1 = new THREE.Vector3(CX + (tx - CX) * 0.62, ORB_Y + 34, CZ + (tz - CZ) * 0.62);
  const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
  arcLenTotal += curve.getLength();
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 72, TUBE_R, 10, false), arcMat);
  group.add(tube);
  bag.objs.push(tube);
}

// ===================== 巨大光球 =====================
const coreMat = new THREE.MeshBasicMaterial({ color: CORE_COLOR, toneMapped: false, fog: false });
const core = new THREE.Mesh(new THREE.SphereGeometry(ORB_R, 48, 32), coreMat);
core.position.copy(orbCenter);
group.add(core);
bag.objs.push(core);

const coreInnerMat = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  toneMapped: false,
  fog: false,
});
const coreInner = new THREE.Mesh(new THREE.SphereGeometry(ORB_R * 0.55, 32, 24), coreInnerMat);
coreInner.position.copy(orbCenter);
group.add(coreInner);
bag.objs.push(coreInner);

// 双层光晕 Sprite(内近景/外远眺)
function makeGlowSprite(scale, opacity) {
  const m = new THREE.SpriteMaterial({
    map: glowTex,
    color: GLOW_COLOR,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const sp = new THREE.Sprite(m);
  sp.scale.setScalar(scale);
  sp.position.copy(orbCenter);
  group.add(sp);
  bag.objs.push(sp);
  return sp;
}
const glowIn = makeGlowSprite(120, 0.85);
const glowOut = makeGlowSprite(300, 0.32);

// ===================== 光环涟漪 ×3(弧段,旋转可见) =====================
const rings = [];
const RING_DEFS = [
  { r: ORB_R + 14, tilt: 0.38, speed: 0.16, opacity: 0.55 },
  { r: ORB_R + 26, tilt: -0.26, speed: -0.11, opacity: 0.4 },
  { r: ORB_R + 40, tilt: 0.15, speed: 0.07, opacity: 0.28 },
];
for (const d of RING_DEFS) {
  const holder = new THREE.Group();
  holder.position.copy(orbCenter);
  holder.rotation.x = Math.PI / 2 + d.tilt; // 放平 + 倾斜
  holder.rotation.z = Math.random() * Math.PI;
  // 每圈两段对置弧(弧段旋转才看得出来,整环转了也白转)
  const segMat = new THREE.MeshBasicMaterial({
    color: GLOW_COLOR,
    toneMapped: false,
    transparent: true,
    opacity: Math.min(1, d.opacity + 0.35),
    side: THREE.DoubleSide,
    fog: false,
  });
  for (const start of [0, Math.PI]) {
    const seg = new THREE.Mesh(new THREE.RingGeometry(d.r, d.r + 1.8, 96, 1, start, 2.1), segMat);
    holder.add(seg);
    bag.objs.push(seg);
  }
  group.add(holder);
  bag.objs.push(holder);
  rings.push({ holder, speed: d.speed });
}

// ===================== 地面照明(全场景仅新增这 1 盏灯) =====================
const orbLight = new THREE.PointLight(LIGHT_COLOR, 4, 500, 1.6);
orbLight.position.copy(orbCenter);
group.add(orbLight);
bag.objs.push(orbLight);

// ===================== 逐帧动画:呼吸脉动 + 光环旋转 =====================
const t0 = performance.now();
ctx.onTick(function () {
  const t = (performance.now() - t0) / 1000;
  const k = 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / PULSE_S); // 0..1
  core.scale.setScalar(1 + 0.05 * k);
  coreInner.scale.setScalar(1 + 0.09 * k);
  glowIn.material.opacity = 0.7 + 0.25 * k;
  glowOut.material.opacity = 0.26 + 0.12 * k;
  orbLight.intensity = 3.4 + 1.6 * k;
  for (const r of rings) r.holder.rotation.z += r.speed * (1 / 60);
});

expose('towerOrb', {
  center: { x: orbCenter.x, y: orbCenter.y, z: orbCenter.z },
  orbRadius: ORB_R,
  arcCount: COUNT,
  arcLenAvg: Math.round(arcLenTotal / COUNT),
  ringCount: rings.length,
});

if (import.meta.hot) import.meta.hot.accept();
