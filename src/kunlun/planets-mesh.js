// kunlun/planets-mesh.js — 六星世界的网格工厂(2026-11-11 巨型文件拆分:从 planets.js 抽离)
// 零 PointLight 口径:顶亮底暗顶点色球 + 体块道具 + 章节号精灵。纯建造器,无模块可变状态。
// planetMesh 的半径 R 改为入参(原先捕获 planets.js 的 ISLAND_R),调用点传 R 即可,几何逐字不变。
import * as THREE from 'three';

// 顶亮底暗顶点色球(半径 r 由调用点传入)
export function planetMesh(topHex, botHex, r) {
  const g = new THREE.SphereGeometry(r, 40, 24);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color(topHex),
    bot = new THREE.Color(botHex),
    c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) / r) * 0.5 + 0.5, 0, 1);
    c.copy(bot).lerp(top, t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true }));
}
export function box(w, h, d, hex) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ color: hex })
  );
}
export function cyl(rt, rb, h, hex) {
  return new THREE.Mesh(
    new THREE.CylinderGeometry(rt, rb, h, 14),
    new THREE.MeshBasicMaterial({ color: hex })
  );
}
export function numSprite(txt, color) {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 64;
  const x = cv.getContext('2d');
  x.font = 'bold 40px Georgia,serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = color;
  x.fillText(txt, 64, 32);
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(cv),
      transparent: true,
      depthWrite: false,
    })
  );
  sp.scale.set(1.8, 0.9, 1); // 章节号留作小标识，不挡住人物和目标
  return sp;
}
