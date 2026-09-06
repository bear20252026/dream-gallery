// atmosphere.js — 大气效果:飞鸟、沙暴、云团、风行粒子、灯塔、罗盘、天空昼夜、HUD
import * as THREE from 'three';
import { ctx } from '../../ctx.js';
import { getH, KX, KZ } from './terrain.js';
const { s } = ctx;

// ===================== 飞鸟 =====================
const BIRDS = 15;
const birdGeo = new THREE.BufferGeometry();
const birdPos = new Float32Array(BIRDS * 3);
const birdData = [];
for (let i = 0; i < BIRDS; i++) {
  birdPos[i * 3] = (Math.random() - 0.5) * 200;
  birdPos[i * 3 + 1] = 25 + Math.random() * 40;
  birdPos[i * 3 + 2] = (Math.random() - 0.5) * 200;
  birdData.push({
    a: Math.random() * Math.PI * 2,
    sp: 2 + Math.random() * 3,
    r: 50 + Math.random() * 150,
    y: birdPos[i * 3 + 1],
    ws: 2 + Math.random() * 3,
  });
}
birdGeo.setAttribute('position', new THREE.BufferAttribute(birdPos, 3));
const birds = new THREE.Points(
  birdGeo,
  new THREE.PointsMaterial({ color: 0x3a2a1a, size: 0.5, sizeAttenuation: true })
);
s.add(birds);

// ===================== 沙暴粒子 =====================
const SAND = 200;
const sandGeo = new THREE.BufferGeometry();
const sandPos = new Float32Array(SAND * 3);
const sandSp = new Float32Array(SAND);
for (let i = 0; i < SAND; i++) {
  sandPos[i * 3] = (Math.random() - 0.5) * 400;
  sandPos[i * 3 + 1] = Math.random() * 20;
  sandPos[i * 3 + 2] = (Math.random() - 0.5) * 400;
  sandSp[i] = 8 + Math.random() * 15;
}
sandGeo.setAttribute('position', new THREE.BufferAttribute(sandPos, 3));
const sandMat = new THREE.PointsMaterial({
  color: 0xd4a574,
  size: 0.25,
  transparent: true,
  opacity: 0.15,
  sizeAttenuation: true,
  depthWrite: false,
});
const sand = new THREE.Points(sandGeo, sandMat);
s.add(sand);

// ===================== 远方高地灯塔 + 环绕光尘 =====================
const peakY = getH(KX, KZ);
const beacon = new THREE.Mesh(
  new THREE.SphereGeometry(2.5, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xffdd88, fog: false })
);
beacon.position.set(KX, peakY + 8, KZ);
s.add(beacon);
const beaconLight = new THREE.PointLight('#ffaa55', 4, 400);
beaconLight.position.set(KX, peakY + 8, KZ);
s.add(beaconLight);
const DUST = 40;
const dustGeo = new THREE.BufferGeometry();
const dustPos = new Float32Array(DUST * 3);
const dustAngle = [];
for (let i = 0; i < DUST; i++) {
  dustAngle.push(Math.random() * Math.PI * 2);
  dustPos[i * 3] = KX + Math.cos(dustAngle[i]) * 6;
  dustPos[i * 3 + 1] = peakY + 6 + Math.random() * 4;
  dustPos[i * 3 + 2] = KZ + Math.sin(dustAngle[i]) * 6;
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dustMat = new THREE.PointsMaterial({
  color: 0xffeebb,
  size: 0.5,
  transparent: true,
  opacity: 0.7,
  sizeAttenuation: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const dust = new THREE.Points(dustGeo, dustMat);
s.add(dust);

// ===================== 远方高地罗盘 =====================
const compass = document.createElement('div');
compass.id = 'kunlunCompass';
compass.title = '远方高地罗盘(点击打开设置)';
compass.style.cssText =
  'position:fixed;top:16px;left:16px;width:64px;height:64px;z-index:10;pointer-events:auto;cursor:pointer';
compass.innerHTML =
  '<div style="position:absolute;inset:0;border-radius:50%;border:2.5px solid rgba(160,120,60,0.55);background:radial-gradient(circle at 50% 50%,rgba(30,22,12,0.85) 0%,rgba(18,12,6,0.95) 100%);box-shadow:0 2px 12px rgba(0,0,0,0.6)"></div>' +
  '<div style="position:absolute;left:6px;top:6px;right:6px;bottom:6px;border-radius:50%;border:1px solid rgba(160,120,60,0.25)"></div>' +
  '<div class="cp-needle" style="position:absolute;left:50%;top:50%;width:3px;height:22px;margin-left:-1.5px;margin-top:-22px;background:linear-gradient(to bottom,rgba(230,200,130,0.95) 0%,rgba(180,140,70,0.85) 55%,rgba(160,60,40,0.9) 100%);border-radius:40% 40% 50% 50%;transform-origin:50% 22px;box-shadow:0 0 8px rgba(200,160,90,0.25)"></div>' +
  '<div style="position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:radial-gradient(circle at 35% 35%,rgba(220,190,130,0.9),rgba(140,100,50,0.9))"></div>' +
  '<div style="position:absolute;left:50%;bottom:-16px;transform:translateX(-50%);color:rgba(200,170,120,0.5);font-size:9px;letter-spacing:3px;white-space:nowrap">远方高地</div>';
document.body.appendChild(compass);
const cpNeedle = compass.querySelector('.cp-needle');

// ===================== 天空昼夜 =====================
const skyBg = new THREE.Color(0xd4c8a0);
s.background = skyBg;
const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(2.0, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xfff0d0, fog: false })
);
s.add(sunMesh);
const moonMesh = new THREE.Mesh(
  new THREE.SphereGeometry(1.0, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xf5f0e8, fog: false })
);
s.add(moonMesh);
const STARS = 600;
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(STARS * 3);
for (let i = 0; i < STARS; i++) {
  const th = Math.random() * Math.PI * 2,
    ph = Math.acos(1 - 2 * Math.random()),
    r = 100 + Math.random() * 50;
  starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
  starPos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
  starPos[i * 3 + 2] = r * Math.cos(ph);
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({
  color: 0xfff8e0,
  size: 0.4,
  transparent: true,
  opacity: 0,
  sizeAttenuation: true,
  fog: false,
});
const stars = new THREE.Points(starGeo, starMat);
s.add(stars);
const rimL = new THREE.DirectionalLight(0xcc9977, 0.4);
rimL.position.set(-20, 10, -20);
s.add(rimL);

const skyColorDay = new THREE.Color(0xd4c8a0),
  skyColorSunset = new THREE.Color(0xe8a070),
  skyColorNight = new THREE.Color(0x0a0806);
const fogDay = new THREE.Color(0xc8b88a),
  fogSunset = new THREE.Color(0xd48860),
  fogNight = new THREE.Color(0x0a0806);
const sunColorDay = new THREE.Color(0xfff8e7),
  sunColorSunset = new THREE.Color(0xff8844),
  sunColorNight = new THREE.Color(0x1a1510);
const ambDay = new THREE.Color(0xfff0d0),
  ambSunset = new THREE.Color(0xffaa77),
  ambNight = new THREE.Color(0x1a1510);
const _c1 = new THREE.Color();
export let lastElev = 1;

// ===================== 沙漠日光 =====================
const sunL = new THREE.DirectionalLight('#fff8e7', 1.8);
sunL.position.set(40, 80, 20);
s.add(sunL);

export function dayNight(hour) {
  const sunAngle = ((hour - 6) / 24) * Math.PI * 2;
  const sunY = Math.sin(sunAngle),
    sunX = Math.cos(sunAngle);
  const elev = (sunY + 1) / 2;
  lastElev = elev;
  const orbitR = 60;
  sunMesh.position.set(sunX * orbitR, sunY * orbitR, -10);
  moonMesh.position.set(-sunX * orbitR, -sunY * orbitR, -10);
  sunMesh.visible = sunY > -0.1;
  moonMesh.visible = sunY < 0.1;
  let ambInt, sunInt;
  if (elev < 0.25) {
    const t = elev / 0.25;
    skyBg.copy(_c1.copy(skyColorNight).lerp(skyColorSunset, t));
    s.fog.color.copy(_c1.copy(fogNight).lerp(fogSunset, t));
    sunL.color.copy(_c1.copy(sunColorNight).lerp(sunColorSunset, t));
    ctx.scene.ambL.color.copy(_c1.copy(ambNight).lerp(ambSunset, t));
    ambInt = 0.3 + t * 0.09;
    sunInt = 0.05 + t * 0.95;
  } else if (elev < 0.75) {
    const t = (elev - 0.25) / 0.5;
    skyBg.copy(_c1.copy(skyColorSunset).lerp(skyColorDay, t));
    s.fog.color.copy(_c1.copy(fogSunset).lerp(fogDay, t));
    sunL.color.copy(_c1.copy(sunColorSunset).lerp(sunColorDay, t));
    ctx.scene.ambL.color.copy(_c1.copy(ambSunset).lerp(ambDay, t));
    ambInt = 0.39 + t * 0.06;
    sunInt = 1.0;
  } else {
    skyBg.copy(skyColorDay);
    s.fog.color.copy(fogDay);
    sunL.color.copy(sunColorDay);
    ctx.scene.ambL.color.copy(ambDay);
    ambInt = 0.45;
    sunInt = 1.0;
  }
  ctx.scene.ambL.intensity = ambInt;
  ctx.scene.hemiL.intensity = 0.15 + 0.3 * elev;
  sunL.intensity = sunInt * 1.6;
  sunL.position
    .set(sunX * orbitR, sunY * orbitR, -10)
    .normalize()
    .multiplyScalar(60);
  rimL.intensity = elev < 0.3 ? 0.5 : 0.3;
  rimL.color.setHex(elev < 0.3 ? 0x664433 : 0x886655);
  let so = 0;
  if (elev < 0.15) so = 1;
  else if (elev < 0.35) so = 1 - (elev - 0.15) / 0.2;
  starMat.opacity = so;
}

// ===================== 漂移云团 =====================
const CLOUDS = 40;
const cloudGeo = new THREE.BufferGeometry();
const cloudPos = new Float32Array(CLOUDS * 3);
const cloudVel = [];
for (let i = 0; i < CLOUDS; i++) {
  cloudPos[i * 3] = (Math.random() - 0.5) * 500;
  cloudPos[i * 3 + 1] = 35 + Math.random() * 30;
  cloudPos[i * 3 + 2] = (Math.random() - 0.5) * 500;
  cloudVel.push({ x: (Math.random() - 0.5) * 3, z: (Math.random() - 0.5) * 3 });
}
cloudGeo.setAttribute('position', new THREE.BufferAttribute(cloudPos, 3));
const clouds = new THREE.Points(
  cloudGeo,
  new THREE.PointsMaterial({
    color: 0xffeedd,
    size: 6.5,
    transparent: true,
    opacity: 0.1,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  })
);
s.add(clouds);
let cloudAcc = 0;

// ===================== 风行粒子 =====================
const WIND = 40;
const windGeo = new THREE.BufferGeometry();
const windPos = new Float32Array(WIND * 3);
const windVel = new Float32Array(WIND * 3);
const windLife = new Float32Array(WIND);
for (let i = 0; i < WIND; i++) windLife[i] = Math.random();
windGeo.setAttribute('position', new THREE.BufferAttribute(windPos, 3));
const windMat = new THREE.PointsMaterial({
  color: 0xffddaa,
  size: 0.15,
  transparent: true,
  opacity: 0.5,
  sizeAttenuation: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const wind = new THREE.Points(windGeo, windMat);
s.add(wind);

// ===================== 滑翔迎风粒子 =====================
const HWIND = 60;
const hwindGeo = new THREE.BufferGeometry();
const hwindPos = new Float32Array(HWIND * 3);
hwindGeo.setAttribute('position', new THREE.BufferAttribute(hwindPos, 3));
const hwindMat = new THREE.PointsMaterial({
  color: 0xffeebb,
  size: 0.08,
  transparent: true,
  opacity: 0,
  sizeAttenuation: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const hwind = new THREE.Points(hwindGeo, hwindMat);
s.add(hwind);

// ===================== HUD =====================
const hudStyle = document.createElement('style');
hudStyle.textContent = `
#desertTimeHud{position:fixed;top:92px;left:16px;z-index:10;pointer-events:none;display:flex;flex-direction:column;gap:4px}
#desertTimeHud .tt{color:rgba(255,240,200,0.9);font-size:13px;font-weight:700;letter-spacing:1px;text-shadow:0 1px 4px rgba(0,0,0,0.9)}
#desertTimeHud .tp{color:rgba(255,200,150,0.5);font-size:10px;letter-spacing:2px;text-transform:uppercase;text-shadow:0 1px 4px rgba(0,0,0,0.9)}
#desertTimeHud .tb{width:100px;height:3px;background:rgba(255,220,150,0.1);border-radius:2px;overflow:hidden;margin-top:2px}
#desertTimeHud .tbf{height:100%;width:0%;background:rgba(255,220,150,0.8);border-radius:2px;transition:width 0.1s linear,background 0.3s}
#desertTerrainHud{position:fixed;top:170px;right:16px;z-index:10;pointer-events:none;text-align:right;display:flex;flex-direction:column;gap:2px}
#desertTerrainHud .tn{color:rgba(255,240,200,0.85);font-size:14px;font-weight:700;letter-spacing:2px;text-shadow:0 1px 4px rgba(0,0,0,0.9)}
#desertTerrainHud .te{color:rgba(255,200,150,0.5);font-size:11px;letter-spacing:1px;text-shadow:0 1px 4px rgba(0,0,0,0.9)}
#desertCross{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:20px;height:20px;z-index:5;pointer-events:none;opacity:0.5}
#desertCross::before{content:'';position:absolute;width:1px;height:20px;left:9.5px;top:0;background:rgba(255,240,200,0.5)}
#desertCross::after{content:'';position:absolute;width:20px;height:1px;left:0;top:9.5px;background:rgba(255,240,200,0.5)}
#desertCross .cd{position:absolute;width:3px;height:3px;background:#ffe4b5;border-radius:50%;left:8.5px;top:8.5px}
#heatShimmer{position:fixed;inset:0;z-index:3;pointer-events:none;background:radial-gradient(ellipse at 50% 80%,transparent 40%,rgba(255,160,60,0.03) 100%);animation:heatWave 3s ease-in-out infinite alternate}
@keyframes heatWave{from{opacity:0.3;transform:scaleY(1)}to{opacity:0.6;transform:scaleY(1.02)}}
.glide-pip{width:4px!important;height:14px!important;border-radius:2px!important;background:rgba(255,220,150,0.12)!important;transition:background 0.3s,box-shadow 0.3s}
.glide-pip.active{background:rgba(255,220,150,0.95)!important;box-shadow:0 0 8px rgba(255,200,100,0.4)!important}
.glide-pip.recharge{animation:pipPulse 0.8s ease-in-out infinite alternate}
@keyframes pipPulse{from{background:rgba(255,220,150,0.3)!important}to{background:rgba(255,220,150,0.7)!important}}
#jumpBtnGlide.gliding{background:rgba(255,248,220,0.95)!important;color:#4a3010!important;border-color:rgba(255,230,180,0.9)!important;box-shadow:0 0 20px rgba(255,200,100,0.35)!important}
`;
document.head.appendChild(hudStyle);
const timeHud = document.createElement('div');
timeHud.id = 'desertTimeHud';
timeHud.dataset.worldUi = 'main'; // 自声明:只主世界显示(scene-manager 扫 data-world-ui)
timeHud.innerHTML =
  '<div class="tt" id="dtText">12:00</div><div class="tp" id="dtPhase">DAY</div><div class="tb"><div class="tbf" id="dtBar"></div></div>';
document.body.appendChild(timeHud);
const terrainHud = document.createElement('div');
terrainHud.id = 'desertTerrainHud';
terrainHud.dataset.worldUi = 'main'; // 自声明:只主世界显示(scene-manager 扫 data-world-ui)
terrainHud.innerHTML =
  '<div class="tn" id="dtName">戈壁</div><div class="te" id="dtElev">海拔 0m</div>';
document.body.appendChild(terrainHud);
const cross = document.createElement('div');
cross.id = 'desertCross';
cross.dataset.worldUi = 'main'; // 自声明:只主世界显示(scene-manager 扫 data-world-ui)
cross.innerHTML = '<div class="cd"></div>';
document.body.appendChild(cross);
const shimmer = document.createElement('div');
shimmer.id = 'heatShimmer';
shimmer.dataset.worldUi = 'main'; // 自声明:只主世界显示(scene-manager 扫 data-world-ui)
document.body.appendChild(shimmer);
const dtText = timeHud.querySelector('#dtText'),
  dtPhase = timeHud.querySelector('#dtPhase'),
  dtBar = timeHud.querySelector('#dtBar');
const dtName = terrainHud.querySelector('#dtName'),
  dtElev = terrainHud.querySelector('#dtElev');

function terrainType(h) {
  if (h < -1) return '盐沼';
  if (h < 0.5) return '湿沙';
  if (h < 3) return '沙丘';
  if (h < 7) return '戈壁';
  if (h < 12) return '雅丹';
  if (h < 20) return '岩崖';
  if (h < 35) return '碎石坡';
  if (h < 60) return '远方高地岩';
  if (h < 90) return '雪线';
  return '远方高地巅';
}

// ===================== 大气更新函数 =====================
let lastPX = 0,
  lastPZ = 0,
  lastHudT = 0;

// ===================== 大气更新(2026-08-30 B5:151 行编排器拆为八特征函数,行为逐行等价) =====================
// 飞鸟盘旋
function updateBirds(dt, time) {
  // 飞鸟
  const bp = birdGeo.attributes.position.array;
  for (let i = 0; i < BIRDS; i++) {
    const d = birdData[i];
    d.a += d.sp * dt * 0.02;
    bp[i * 3] = Math.cos(d.a) * d.r;
    bp[i * 3 + 1] = d.y + Math.sin(time * d.ws) * 1.5;
    bp[i * 3 + 2] = Math.sin(d.a) * d.r;
  }
  birdGeo.attributes.position.needsUpdate = true;
}

// 沙暴(跟随玩家前方循环)
function updateSandstorm(dt) {
  // 沙暴
  if (ctx.player.pl) {
    const sp = sandGeo.attributes.position.array;
    for (let i = 0; i < SAND; i++) {
      sp[i * 3] += sandSp[i] * dt;
      sp[i * 3 + 1] += Math.sin(sp[i * 3] * 0.1) * 0.5 * dt;
      if (sp[i * 3] > ctx.player.pl.p.x + 200) {
        sp[i * 3] = ctx.player.pl.p.x - 200;
        sp[i * 3 + 1] = Math.random() * 15;
        sp[i * 3 + 2] = ctx.player.pl.p.z + (Math.random() - 0.5) * 400;
      }
    }
    sandGeo.attributes.position.needsUpdate = true;
    sandMat.opacity = getH(ctx.player.pl.p.x, ctx.player.pl.p.z) < 8 ? 0.2 : 0.08;
  }
}

// 漂移云团(30Hz 节流)
function updateClouds(dt) {
  // 漂移云团(30Hz 节流)
  cloudAcc += dt;
  if (cloudAcc > 0.033) {
    const cp = cloudGeo.attributes.position.array;
    for (let i = 0; i < CLOUDS; i++) {
      cp[i * 3] += cloudVel[i].x * cloudAcc;
      cp[i * 3 + 2] += cloudVel[i].z * cloudAcc;
      if (Math.abs(cp[i * 3]) > 250) cloudVel[i].x *= -1;
      if (Math.abs(cp[i * 3 + 2]) > 250) cloudVel[i].z *= -1;
    }
    cloudGeo.attributes.position.needsUpdate = true;
    cloudAcc = 0;
  }
}

// 风行粒子 + 滑翔迎风粒子 + 远方高地导向变色(尾部记录 lastPX/lastPZ 供下一帧差分)
function updateWind(dt) {
  // 风行粒子
  if (ctx.player.pl) {
    const mvx = (ctx.player.pl.p.x - lastPX) / Math.max(dt, 1e-4),
      mvz = (ctx.player.pl.p.z - lastPZ) / Math.max(dt, 1e-4);
    const spd = Math.hypot(mvx, mvz);
    const ratio = Math.min(spd / 3.2, 1);
    const mdx = spd > 0.01 ? mvx / spd : 0,
      mdz = spd > 0.01 ? mvz / spd : 0;
    const wp = windGeo.attributes.position.array;
    const wv = windVel;
    for (let i = 0; i < WIND; i++) {
      windLife[i] -= dt * (0.5 + ratio * 0.8);
      if (windLife[i] <= 0) {
        windLife[i] = 1;
        const a = Math.random() * Math.PI * 2,
          ds = 2 + Math.random() * 8;
        wp[i * 3] = ctx.player.pl.p.x + Math.cos(a) * ds;
        wp[i * 3 + 1] = ctx.player.pl.p.y + (Math.random() - 0.5) * 3;
        wp[i * 3 + 2] = ctx.player.pl.p.z + Math.sin(a) * ds;
        const ws = 4 + ratio * 15;
        wv[i * 3] = -mdx * ws + (Math.random() - 0.5) * 3;
        wv[i * 3 + 1] = (Math.random() - 0.5) * 1.5;
        wv[i * 3 + 2] = -mdz * ws + (Math.random() - 0.5) * 3;
      } else {
        wp[i * 3] += wv[i * 3] * dt;
        wp[i * 3 + 1] += wv[i * 3 + 1] * dt;
        wp[i * 3 + 2] += wv[i * 3 + 2] * dt;
      }
    }
    windGeo.attributes.position.needsUpdate = true;
    const gdx = KX - ctx.player.pl.p.x,
      gdz = KZ - ctx.player.pl.p.z,
      gdl = Math.hypot(gdx, gdz) || 1;
    const dot = -Math.sin(ctx.player.pl.y) * (gdx / gdl) + -Math.cos(ctx.player.pl.y) * (gdz / gdl);
    if (dot > 0.6 && ctx.player.pl.gliding) {
      windMat.color.setHex(0xffee55);
      hwindMat.color.setHex(0xffee55);
      windMat.opacity = Math.min(ratio * 0.6 + dot * 0.2, 0.8);
    } else {
      windMat.color.setHex(0xffddaa);
      hwindMat.color.setHex(0xffeebb);
      windMat.opacity = Math.min(ratio * 0.5, 0.5);
    }
    // 滑翔迎风粒子
    if (ctx.player.pl.gliding && ctx.scene.cam) {
      hwindMat.opacity = Math.min(hwindMat.opacity + dt * 2, 0.35);
      const hp = hwindGeo.attributes.position.array;
      const yaw = ctx.player.pl.y,
        pitch = ctx.player.pl.pi;
      const fx = -Math.sin(yaw) * Math.cos(pitch),
        fy = Math.sin(pitch),
        fz = -Math.cos(yaw) * Math.cos(pitch);
      for (let i = 0; i < HWIND; i++) {
        const ds = 3 + Math.random() * 12;
        hp[i * 3] = ctx.scene.cam.position.x + fx * ds + (Math.random() - 0.5) * 6;
        hp[i * 3 + 1] = ctx.scene.cam.position.y + fy * ds + (Math.random() - 0.5) * 6;
        hp[i * 3 + 2] = ctx.scene.cam.position.z + fz * ds + (Math.random() - 0.5) * 6;
      }
      hwindGeo.attributes.position.needsUpdate = true;
    } else {
      hwindMat.opacity *= 0.9;
    }
  }
  if (ctx.player.pl) {
    lastPX = ctx.player.pl.p.x;
    lastPZ = ctx.player.pl.p.z;
  }
}

// 灯塔脉动 + 环绕光尘
function updateBeacon(dt, time) {
  // 灯塔脉动
  beaconLight.intensity = 3.5 + Math.sin(time * 2);
  const dp = dustGeo.attributes.position.array;
  for (let i = 0; i < DUST; i++) {
    dustAngle[i] += dt * 0.5;
    dp[i * 3] = KX + Math.cos(dustAngle[i]) * (5 + Math.sin(time + i));
    dp[i * 3 + 1] = peakY + 6 + Math.sin(time * 1.5 + i) * 2;
    dp[i * 3 + 2] = KZ + Math.sin(dustAngle[i]) * (5 + Math.cos(time + i));
  }
  dustGeo.attributes.position.needsUpdate = true;
  dustMat.opacity = 0.5 + Math.sin(time * 2) * 0.2;
}

// 罗盘指针(指向远方高地)
function updateCompass() {
  // 罗盘指针
  if (ctx.player.pl) {
    const dx = KX - ctx.player.pl.p.x,
      dz = KZ - ctx.player.pl.p.z;
    const front = -(dx * Math.sin(ctx.player.pl.y) + dz * Math.cos(ctx.player.pl.y));
    const right = dx * Math.cos(ctx.player.pl.y) - dz * Math.sin(ctx.player.pl.y);
    cpNeedle.style.transform = 'rotate(' + (Math.atan2(right, front) + Math.PI) + 'rad)';
  }
}

// HUD(200ms 降频):昼夜时刻/相位条/海拔地名
function updateHud(time) {
  // HUD(200ms 降频)
  if (time - lastHudT > 0.2) {
    lastHudT = time;
    const hour = ctx.media.dayHour !== undefined ? ctx.media.dayHour : 12;
    const hh = Math.floor(hour),
      mm = Math.floor((hour - hh) * 60);
    dtText.textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    let ph = 'NIGHT';
    if (lastElev > 0.65) ph = 'DAY';
    else if (lastElev > 0.45) ph = 'DAWN';
    else if (lastElev > 0.25) ph = 'SUNSET';
    dtPhase.textContent = ph;
    dtBar.style.width = (hour / 24) * 100 + '%';
    dtBar.style.background =
      lastElev > 0.6
        ? 'rgba(255,240,200,0.8)'
        : lastElev > 0.35
          ? 'rgba(255,140,80,0.9)'
          : 'rgba(100,80,150,0.8)';
    if (ctx.player.pl) {
      const ev = Math.round(ctx.player.pl.p.y - 1.6);
      dtElev.textContent = '海拔 ' + ev + 'm';
      dtName.textContent = terrainType(ev);
    }
  }
}

// 编排器:保持原执行顺序
export function updateAtmosphere(dt, time) {
  updateBirds(dt, time);
  updateSandstorm(dt);
  updateClouds(dt);
  updateWind(dt);
  updateBeacon(dt, time);
  updateCompass();
  updateHud(time);
}
