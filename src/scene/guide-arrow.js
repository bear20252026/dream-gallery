// scene/guide-arrow.js — 3D 悬浮箭头指引(2026-09-27)
// 光柱信标负责"远处可见",箭头负责"精确到点":金色下指锥 + 底环,
// 在目标上空浮沉自转,玩家一眼知道"去哪落脚/点哪里"。
// 零 PointLight 铁律:全 MeshBasicMaterial,fog:false;时序数学在
// shared/guide-arrow-logic.mjs(单测钉死)。一个信标配一支箭,同立同撤。
import * as THREE from 'three';
import { arrowBobY, arrowSpin } from '../shared/guide-arrow-logic.mjs';

/**
 * 在 scene 的 (x,y,z) 上空立一支悬浮箭。
 * @returns 句柄 {grp, cone, baseY} —— 每帧调 tickArrow(handle, nowSec) 推进,走时 removeFloatArrow 收走
 */
export function spawnFloatArrow(scene, x, y, z, opts) {
  const o = opts || {};
  const color = o.color || 0xffd76a;
  const s = o.size || 1;
  const grp = new THREE.Group();
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.22 * s, 0.6 * s, 4),
    new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.95, fog: false })
  );
  cone.rotation.x = Math.PI; // 尖端朝下
  grp.add(cone);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.3 * s, 0.38 * s, 24),
    new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.55 * s;
  grp.add(ring);
  grp.position.set(x, y, z);
  grp.name = o.name || 'guideArrow';
  scene.add(grp);
  return { grp: grp, cone: cone, baseY: y };
}

/** 推进一支箭的浮沉+自转(nowSec 秒,与信标呼吸同拍) */
export function tickArrow(h, nowSec) {
  if (!h || !h.grp) return;
  h.grp.position.y = arrowBobY(nowSec, h.baseY);
  h.cone.rotation.y = arrowSpin(nowSec);
}

/** 收走一支箭(几何/材质同步释放,防切图泄漏) */
export function removeFloatArrow(scene, h) {
  if (!h) return;
  try {
    if (scene) scene.remove(h.grp);
  } catch (e) {
    console.debug('[guide-arrow] 移除时场景已不在(不影响):', e);
  }
  try {
    h.grp.traverse(function (o) {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
  } catch (e) {
    console.debug('[guide-arrow] 释放显存失败(不影响本次):', e);
  }
}
