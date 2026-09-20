// markers.js — YES标记 + 奕彤爱心 + Adorable + 出生点地板照片
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { hotBegin, hotEnd } from '../hot.js';
import { canvasTexture } from '../shared/canvas-texture.js';
hotBegin('markers');
const { s, iG, tL, loadTexCapped, OR, OT, OBR, onTick } = ctx;

// ===== 用户指定墙 - YES标记（回字内北墙z=11）=====
function addYesMarker(x, z) {
  // 画布样板统一在 shared/canvas-texture.js(B1 整改)
  const texture = canvasTexture(256, 128, (ctx) => {
    ctx.fillStyle = 'rgba(255, 100, 150, 0.8)';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 80px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('YES', 128, 64);
  });
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    emissive: '#ff80a0',
    emissiveIntensity: 0.3,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), mat);
  mesh.position.set(x, 2.5, z + 0.2);
  s.add(mesh);
}
// 在内北墙各段添加YES
addYesMarker(-5.25, 11);
addYesMarker(-3, 11);
addYesMarker(3.25, 11);
addYesMarker(5.75, 11);


// ===== Adorable（E厅南墙z=6，用户正前方）=====
function addAdorable() {
  // 画布样板统一在 shared/canvas-texture.js(B1 整改)
  const texture = canvasTexture(512, 512, (ctx) => {
    // 爱心轮廓（正爱心，同奕彤）
    ctx.save();
    ctx.translate(256, 256);
    ctx.beginPath();
    ctx.moveTo(0, 120);
    ctx.bezierCurveTo(-140, 20, -220, 60, -220, -40);
    ctx.bezierCurveTo(-220, -160, -80, -220, 0, -280);
    ctx.bezierCurveTo(80, -220, 220, -160, 220, -40);
    ctx.bezierCurveTo(220, 60, 140, 20, 0, 120);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 120, 160, 0.35)';
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(255, 170, 200, 0.6)';
    ctx.stroke();
    ctx.restore();
    // 文字 "Adorable"
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 56px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Adorable', 256, 250);
  });
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    emissive: '#ff70a0',
    emissiveIntensity: 0.45,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5), mat);
  mesh.position.set(0, 2.5, 5.7); // E厅南墙z=6内侧，微微凸出
  mesh.rotation.y = Math.PI; // 面朝北方（E厅内部），面向用户
  s.add(mesh);
  // 闪烁动画
  let t = 0;
  function pulseA() {
    t += 0.018;
    mat.opacity = 0.35 + Math.sin(t) * 0.25;
    mat.emissiveIntensity = 0.3 + Math.sin(t) * 0.2;
  }
  onTick(pulseA);
}
addAdorable();

// ===== 出生点突出地板退役(2026-09-05) =====
// 原 spawnFloorPhoto + spawnFloorPhotoBorder 已移除:照片文件线上 404,只剩深棕底座突兀露出。
// 原位由 B612 苔藓古石门接替,见 src/kunlun/planets.js。

hotEnd('markers');
if (import.meta.hot) import.meta.hot.accept();
