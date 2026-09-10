// scene3-memory.js — B612 剧本第 3+4 场·回忆层演出(2026-09-07,书页一+书页二)
// 玩家坠入 B612 回忆(幽灵视角):王子在星球上讲述家与日常。
// 顺序引导(2026-09-07 主人定:一次一站,金色光标指引,走完才亮下一站):
//   STEP 0: 三座小火山 → 台词
//   STEP 1: 面包树苗 → 对话 6 句
//   STEP 2: 小椅子 → 日落演出(天幕烧红 6s) → 台词 4 句
//   STEP 3: 玫瑰坛 → 玫瑰花开+离别(10 句) + 字幕
// 完成条件:四站全走完 → 白光收回 → 发 'story:page1done' 回黑夜现实。
// 艺术基调:回忆层整体比现实层暖一度——记忆是发光的。
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { SCENE3, SCENE4, tt, whoSpk } from '../shared/story-text.mjs';

let built = false;
let arrivalDone = false;
let curStep = -1; // -1=到达演出未播;0..3=当前站索引;4=全部完成
let stepMarker = null;
let exitStarted = false;
let smokeSprites = [];
let bgDusk = null;

const VOLCANOES = [
  { x: -4.6, z: -5.2, s: 1.15, active: true },
  { x: -0.8, z: -6.6, s: 0.9, active: true },
  { x: 3.8, z: -5.4, s: 1.0, active: false },
];

// 站位表(顺序引导)
const STEPS = [
  { x: -4.6, z: -5.2, r: 2.4 },  // 0: 火山
  { x: 3.4, z: -2.6, r: 2.2 },   // 1: 面包树苗
  { x: -3.6, z: -0.6, r: 2.2 },  // 2: 小椅子·日落
  { x: 1.23, z: -0.78, r: 2.5 }, // 3: 玫瑰坛
];

function world() {
  return ctx.scene.worldManager ? ctx.scene.worldManager.getWorld('b612') : null;
}

function build() {
  const w = world();
  if (!w) return;
  built = true;
  const s = w.scene;
  const gy = 0.05;

  // —— 三座小火山(两活一熄) ——
  VOLCANOES.forEach(function (v, i) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.55 * v.s, 1.15 * v.s, 7),
      new THREE.MeshStandardMaterial({ color: i === 2 ? '#4a3a30' : '#5a4436', roughness: 0.95, flatShading: true })
    );
    cone.position.set(v.x, gy + (1.15 * v.s) / 2, v.z);
    cone.name = 'scene3Volcano' + i;
    s.add(cone);
    if (v.active) {
      const glow = new THREE.PointLight(0xff8a4a, 0.5, 3.5);
      glow.position.set(v.x, gy + 1.15 * v.s + 0.1, v.z);
      s.add(glow);
    }
  });

  // —— 烟雾(两座活火山,各两缕) ——
  const smokeTex = (function () {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x2 = c.getContext('2d');
    const g = x2.createRadialGradient(32, 32, 4, 32, 32, 30);
    g.addColorStop(0, 'rgba(200,195,190,0.5)');
    g.addColorStop(1, 'rgba(200,195,190,0)');
    x2.fillStyle = g;
    x2.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  VOLCANOES.forEach(function (v, i) {
    if (!v.active) return;
    for (let k = 0; k < 2; k++) {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0.5 })
      );
      sp.position.set(v.x + k * 0.25, gy + 1.2 * v.s, v.z + k * 0.15);
      sp.scale.set(0.4, 0.4, 1);
      sp.userData = { baseX: v.x + k * 0.25, baseZ: v.z + k * 0.15, phase: k * 2.4 + i * 3.1 };
      sp.name = 'scene3Smoke';
      s.add(sp);
      smokeSprites.push(sp);
    }
  });

  // —— 面包树苗 ——
  const sprout = new THREE.Group();
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.03, 0.34, 6),
    new THREE.MeshStandardMaterial({ color: '#5d7a3a', roughness: 0.9 })
  );
  stem.position.y = 0.17;
  sprout.add(stem);
  for (let i = 0; i < 3; i++) {
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshStandardMaterial({ color: '#6d8a42', roughness: 0.85 })
    );
    leaf.scale.set(1, 0.5, 1.6);
    leaf.position.set(Math.sin((i * Math.PI * 2) / 3) * 0.1, 0.36, Math.cos((i * Math.PI * 2) / 3) * 0.1);
    leaf.rotation.y = (i * Math.PI * 2) / 3;
    sprout.add(leaf);
  }
  sprout.position.set(STEPS[1].x, gy, STEPS[1].z);
  sprout.name = 'scene3Baobab';
  s.add(sprout);

  // —— 小椅子(面朝西——日落的方向) ——
  const chair = new THREE.Group();
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.05, 0.42),
    new THREE.MeshStandardMaterial({ color: '#8a4a3a', roughness: 0.85 })
  );
  seat.position.y = 0.34;
  chair.add(seat);
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.4, 0.05),
    new THREE.MeshStandardMaterial({ color: '#8a4a3a', roughness: 0.85 })
  );
  back.position.set(0, 0.55, -0.19);
  chair.add(back);
  for (let i = 0; i < 4; i++) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.34, 0.05),
      new THREE.MeshStandardMaterial({ color: '#6b3a2c', roughness: 0.9 })
    );
    leg.position.set(i & 1 ? 0.17 : -0.17, 0.17, i & 2 ? 0.17 : -0.17);
    chair.add(leg);
  }
  chair.position.set(STEPS[2].x, gy, STEPS[2].z);
  chair.rotation.y = 2.3;
  chair.name = 'scene3Chair';
  s.add(chair);

  // —— 回忆的暖度 ——
  if (w.scene.background && w.scene.background.isColor) {
    const bgDusk = new THREE.Color(0x241532);
    w.scene.background.lerp(bgDusk, 0.9);
  }
  const duskLamp = new THREE.PointLight(0xffc890, 0.55, 16);
  duskLamp.position.set(0, 3.2, -1.5);
  s.add(duskLamp);
}

// —— 金色光标 ——
function placeMarker(x, z) {
  if (!stepMarker) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x2 = c.getContext('2d');
    const g = x2.createRadialGradient(32, 32, 4, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,215,130,0.95)');
    g.addColorStop(0.5, 'rgba(255,200,80,0.4)');
    g.addColorStop(1, 'rgba(255,200,80,0)');
    x2.fillStyle = g;
    x2.fillRect(0, 0, 64, 64);
    stepMarker = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(c),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    stepMarker.scale.set(1.4, 1.4, 1);
    stepMarker.name = 'scene3Marker';
    world().scene.add(stepMarker);
  }
  stepMarker.visible = true;
  stepMarker.position.set(x, 1.2 + Math.sin(Date.now() * 0.002) * 0.15, z);
}
function hideMarker() {
  if (stepMarker) stepMarker.visible = false;
}

// —— 台词播放(独占:一次一条,播完才前进;lock 互斥 + 心跳守护防链断) ——
let chainBusy = false;
let wd = null;
function speakSeq(seq, i, done) {
  if (i >= seq.length) {
    chainBusy = false;
    if (done) done();
    return;
  }
  const item = seq[i];
  chainBusy = true;
  let spent = false; // onDone 与心跳守护只许一个推进(晚到的重复收束吞掉)
  const finish = function () {
    if (spent) return;
    spent = true;
    clearTimeout(wd);
    speakSeq(seq, i + 1, done);
  };
  ctx.openDialog({
    speaker: tt(item.who),
    speakerType: whoSpk(item.who),
    lines: [tt(item)],
    autoHide: 4600,
    lock: true,
    onDone: finish,
  });
  clearTimeout(wd);
  wd = setTimeout(function () {
    if (!ctx.dialogOpen || !ctx.dialogOpen()) finish();
  }, 7200);
}

// —— 到达演出 ——
function arrival() {
  if (arrivalDone) return;
  arrivalDone = true;
  speakSeq(SCENE3.arrival, 0, function () {
    curStep = 0;
    placeMarker(STEPS[0].x, STEPS[0].z);
  });
}

// —— 完成检测 ——
function checkCompletion() {
  if (exitStarted || curStep < 4) return;
  exitStarted = true;
  const veil = document.createElement('div');
  veil.style.cssText =
    'position:fixed;inset:0;z-index:560;background:#f8f1df;opacity:0;transition:opacity 1.6s ease;pointer-events:none';
  document.body.appendChild(veil);
  requestAnimationFrame(function () {
    veil.style.opacity = '1';
  });
  setTimeout(function () {
    try {
      ctx.store.mark('page1');
      ctx.events.emit('story:page1done');
    } catch (e) {}
    ctx.scene.leaveWorld();
    setTimeout(function () {
      veil.style.opacity = '0';
      setTimeout(function () {
        veil.remove();
      }, 1700);
    }, 600);
  }, 1700);
}

// —— 各站触发动作 ——
function doStep(stepIdx) {
  const seqs = [
    [SCENE3.volcanoes],
    SCENE3.baobab,
    SCENE3.sunset,
    SCENE4.arrival.concat(SCENE4.regret, SCENE4.farewell, [SCENE4.farewellCaption]),
  ];
  if (stepIdx >= 0 && stepIdx < seqs.length) {
    speakSeq(seqs[stepIdx], 0, function () {
      // 台词播完 → 下一站
      curStep++;
      if (curStep < STEPS.length) {
        placeMarker(STEPS[curStep].x, STEPS[curStep].z);
      } else {
        hideMarker();
      }
      checkCompletion();
    });
  }
}

// —— 主循环 ——
ctx.onTick(function scene3MemoryTick(dt) {
  if ((ctx.scene.activeWorld || 'b612') !== 'b612') return;
  if (ctx.store.flag('page1')) return;
  if (!built) {
    build();
    return;
  }
  const pl = ctx.player.pl;

  // 到达演出(1.2s 延迟)
  if (curStep < 0) {
    if (!scene3MemoryTick._a) scene3MemoryTick._a = performance.now();
    if (performance.now() - scene3MemoryTick._a > 1200) {
      arrival();
      // 安全兜底:如果 speakSeq 链条断了(autoHide 竞态等),5s 后强制推进
      setTimeout(function () {
        if (arrivalDone && curStep < 0) {
          curStep = 0;
          placeMarker(STEPS[0].x, STEPS[0].z);
        }
      }, 5000);
    }
    return;
  }

  // 对话链播放中 → 不检测新站
  if (chainBusy) return;

  // 顺序引导:检测当前目标站
  if (curStep >= 0 && curStep < STEPS.length) {
    const step = STEPS[curStep];
    const dx = pl.p.x - step.x;
    const dz = pl.p.z - step.z;
    if (dx * dx + dz * dz < step.r * step.r) {
      doStep(curStep);
    }
  }

  // 金色光标呼吸
  if (curStep >= 0 && curStep < STEPS.length) {
    placeMarker(STEPS[curStep].x, STEPS[curStep].z);
  }

  // 烟雾飘动
  for (const sp of smokeSprites) {
    sp.position.y += dt * 0.15;
    if (sp.position.y > sp.userData.baseY + 1.5) sp.position.y = sp.userData.baseY;
  }
});
