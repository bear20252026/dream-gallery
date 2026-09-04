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

// ===== 奕彤爱心标记（半透明闪烁）=====
function addYiTongHeart() {
  // 画布样板统一在 shared/canvas-texture.js(B1 整改)
  const texture = canvasTexture(512, 512, (ctx) => {
    // 绘制爱心轮廓（正爱心，尖端朝上）
    ctx.save();
    ctx.translate(256, 256);
    ctx.beginPath();
    ctx.moveTo(0, 120);
    ctx.bezierCurveTo(-140, 20, -220, 60, -220, -40);
    ctx.bezierCurveTo(-220, -160, -80, -220, 0, -280);
    ctx.bezierCurveTo(80, -220, 220, -160, 220, -40);
    ctx.bezierCurveTo(220, 60, 140, 20, 0, 120);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 100, 150, 0.4)';
    ctx.fill();
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(255, 150, 200, 0.7)';
    ctx.stroke();
    ctx.restore();
    // 文字"奕彤"
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 80px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('奕彤', 256, 240);
  });
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    emissive: '#ff6090',
    emissiveIntensity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), mat);
  mesh.position.set(0, 2.5, 13); // 回字中央偏走廊方向
  s.add(mesh);
  window.__ctx.ytHeart = mesh; // 奕彤爱心:普通模式隐藏,特殊模式展现(mode.js 控制;注意此函数内 ctx 被 2D 上下文遮蔽)
  // 闪烁动画（淡入淡出）
  let t = 0;
  function pulse() {
    t += 0.02;
    mat.opacity = 0.4 + Math.sin(t) * 0.3; // 0.1~0.7 淡入淡出
    mat.emissiveIntensity = 0.3 + Math.sin(t) * 0.25;
  }
  onTick(pulse);
}
addYiTongHeart();

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

// ===== 出生点地板照片（女孩抱膝，面朝视频墙/北）=====
(function () {
  const ft = loadTexCapped('photos/1000001707(1).jpg');
  const fm = new THREE.MeshStandardMaterial({ map: ft, roughness: 0.4, side: THREE.DoubleSide });
  const fh = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.6), fm);
  fh.name = 'spawnFloorPhoto'; // 2026-09-03 出生点 z=17→28.5:玩家在 z=27 朝南(182°),正前方 1.5m 平铺,
  // 玩家低头看到照片正面(rotation.z=π 让图片正面朝北,玩家从北看向南即正面)
  fh.rotation.x = -Math.PI / 2;
  fh.position.set(0, 0.02, 28.5);
  fh.rotation.z = Math.PI;
  s.add(fh);
  const fb = new THREE.MeshStandardMaterial({ color: '#5a3020', roughness: 0.7 });
  const fborder = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.05, 1.9), fb);
  fborder.name = 'spawnFloorPhotoBorder';
  fborder.position.set(0, 0.01, 28.5);
  s.add(fborder);
})();

hotEnd('markers');
if (import.meta.hot) import.meta.hot.accept();
