// contact-shadows.js — 植被/地物的廉价接触阴影(2026-11-13 自然表面轮)
//
// 病树/仙人掌/岩石根部没有落地暗影,物体像「贴」在沙上(真实截图目检)。
// 用实例化圆盘 + 径向渐变 alpha 做 blob 阴影:一个 draw call 装下全部,
// 零新增灯光(灯光预算硬约束)、不依赖 shadow map(弱机友好)。
//
// ⚠️ 阴影盘略高于地面(+0.04)防 z-fighting;depthWrite=false 不挡后续透明排序;
//    颜色用深棕而非纯黑,沙地上更自然。
// ⚠️ 无顶层副作用:工厂建网格,调用方(terrain.js)在区块生成时收集落点。

import * as THREE from 'three';

let sharedTex = null;
function blobTexture() {
  if (sharedTex) return sharedTex;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  if (!x) return null;
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(40,30,18,0.55)');
  g.addColorStop(0.6, 'rgba(40,30,18,0.28)');
  g.addColorStop(1, 'rgba(40,30,18,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  sharedTex = new THREE.CanvasTexture(c);
  return sharedTex;
}

const unitGeo = new THREE.CircleGeometry(1, 12);
unitGeo.rotateX(-Math.PI / 2); // 躺平

/**
 * 建一批接触阴影(实例化,单 draw call)。
 * @param {Array<{x: number, y: number, z: number, r: number}>} items 落点与半径
 * @returns {THREE.InstancedMesh|null} 无落点/无 DOM 时返回 null
 */
export function makeContactShadows(items) {
  const tex = blobTexture();
  if (!tex || !items || !items.length) return null;
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const im = new THREE.InstancedMesh(unitGeo, mat, items.length);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    m4.makeScale(it.r, 1, it.r);
    m4.setPosition(it.x, it.y + 0.04, it.z);
    im.setMatrixAt(i, m4);
  }
  im.instanceMatrix.needsUpdate = true;
  im.renderOrder = 1; // 在地形之后、植被之前画
  im.frustumCulled = false;
  return im;
}
