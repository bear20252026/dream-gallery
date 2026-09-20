// kintsugi.js — 金缮天花板(2026-07-28 C1,补天 100% 奖励;2026-09-20 自 scene.js 拆分)
// 天穹 100% 后:天花板换为半透明金缮纹理——天空透过,淡金色愈合纹路如瓷器金缮;
// 玩家抬头注视时纹路微微发亮(0.55→0.95 缓动)。零 PointLight(MeshBasicMaterial),手机灯光账户不动。
// 触发:settings.js checkSkyMs 100 档 或 启动时进度已 100 → ctx.scene.kintsugiOn()
// 依赖注入:roof/roofThick 由调用方传入
import { ctx } from '../ctx.js';
import * as THREE from 'three';

export function setupKintsugi(roof, roofThick) {
const kintsugiTex = (function () {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  let seed = 42;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let v = 0; v < 9; v++) {
    // 9 条主纹,随机游走+断枝,如金缮修补痕
    let px = rnd() * 512,
      py = rnd() * 512,
      a = rnd() * Math.PI * 2;
    x.strokeStyle = 'rgba(212,168,75,0.85)';
    x.lineWidth = 1.6 + rnd() * 1.4;
    x.beginPath();
    x.moveTo(px, py);
    for (let k = 0; k < 14; k++) {
      a += (rnd() - 0.5) * 1.1;
      px += Math.cos(a) * (18 + rnd() * 30);
      py += Math.sin(a) * (18 + rnd() * 30);
      x.lineTo(px, py);
      if (rnd() < 0.22) x.moveTo(px, py);
    }
    x.stroke();
  }
  return new THREE.CanvasTexture(c);
})();
let kintsugiOn = false,
  kintsugiMat = null;
function enableKintsugi() {
  if (kintsugiOn) return;
  kintsugiOn = true;
  kintsugiMat = new THREE.MeshBasicMaterial({
    map: kintsugiTex,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  roof.material = kintsugiMat; // 天花板半透明:天空透出+纹路浮光
  roofThick.visible = false; // 厚层挡光,金缮态关掉
}
// 注视发亮:仰头(pi>0.55)纹路增亮,视线移开渐复
ctx.onTick(function () {
  if (!kintsugiOn || !kintsugiMat) return;
  const pi = ctx.player && ctx.player.pl ? ctx.player.pl.pi : 0;
  kintsugiMat.opacity += ((pi > 0.55 ? 0.95 : 0.55) - kintsugiMat.opacity) * 0.06;
});
return enableKintsugi;
}
