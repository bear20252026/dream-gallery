// scene3-memory.js — B612 剧本第 3 场·回忆层演出(2026-09-07,书页一·家与日常)
// 玩家坠入 B612 回忆(幽灵视角):王子在星球上讲述家与日常。
// 散点互动(文学译本 S3 形态):
//   · 到达:王子三连问(开场演出,一次)
//   · 三座小火山:靠近 → 火山台词(其中一座有烟)
//   · 面包树苗:靠近 → 羊与面包树的对话(6 句)
//   · 小椅子:靠近 → 日落演出——天幕由夜紫烧成橙红(6s),台词 4 句,再归于黄昏
// 完成条件:面包树 + 日落都体验过 → 白光收回 → 发 'story:page1done' 回黑夜现实。
// 艺术基调:回忆层整体比现实层暖一度——记忆是发光的。
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { SCENE3, tt } from '../shared/story-text.mjs';

let built = false;
let arrivalDone = false;
let baobabDone = false;
let sunsetDone = false;
let sunsetPlaying = false;
let volDone = false;
let exitStarted = false;
let smokeSprites = [];
let bgDusk = null;
let bgBase = null;

const VOLCANOES = [
  { x: -4.6, z: -5.2, s: 1.15, active: true },
  { x: -0.8, z: -6.6, s: 0.9, active: true },
  { x: 3.8, z: -5.4, s: 1.0, active: false },
];
const BAOBAB = { x: 3.4, z: -2.6 };
const CHAIR = { x: -3.6, z: -0.6 };

function world() {
  return ctx.scene.worldManager ? ctx.scene.worldManager.getWorld('b612') : null;
}

function build() {
  const w = world();
  if (!w) return;
  built = true;
  const s = w.scene;
  const gy = 0.05; // 星球顶与地面齐平(b612 groundOverride=0)

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
      // 活火山:火山口一点暖光
      const glow = new THREE.PointLight(0xff8a4a, 0.5, 3.5);
      glow.position.set(v.x, gy + 1.15 * v.s + 0.1, v.z);
      s.add(glow);
    }
  });
  // 烟雾(两座活火山,各两缕,缓慢上升循环)
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

  // —— 面包树苗(三片小叶的一株苗) ——
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
  sprout.position.set(BAOBAB.x, gy, BAOBAB.z);
  sprout.name = 'scene3Baobab';
  s.add(sprout);

  // —— 小椅子(书里追日落的那把,面朝西) ——
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
  chair.position.set(CHAIR.x, gy, CHAIR.z);
  chair.rotation.y = 2.3; // 面朝西——日落的方向
  chair.name = 'scene3Chair';
  s.add(chair);

  // —— 回忆的暖度:背景从夜紫调成暖黄昏,并铺一层暮色光 ——
  bgBase = w.scene.background ? '' + w.scene.background.getHexString() : '';
  if (w.scene.background && w.scene.background.isColor) {
    bgDusk = new THREE.Color(0x241532); // 暮色紫(比夜的 0x05050f 暖)
    w.scene.background.lerp(bgDusk, 0.9);
  }
  const duskLamp = new THREE.PointLight(0xffc890, 0.55, 16);
  duskLamp.position.set(0, 3.2, -1.5);
  s.add(duskLamp);
}

// —— 到达演出:王子三连问 + 箱子当房子 ——
function arrival() {
  if (arrivalDone) return;
  arrivalDone = true;
  speakSeq(SCENE3.arrival, 0, null);
}

function speakSeq(seq, i, done) {
  if (!active() || i >= seq.length) return done && done();
  const item = seq[i];
  ctx.openDialog({
    speaker: tt(item.who),
    lines: [tt(item)],
    autoHide: 5200,
    onDone: function () {
      speakSeq(seq, i + 1, done);
    },
  });
}
function active() {
  return (ctx.scene.activeWorld || 'main') === 'b612' && !ctx.store.flag('page1');
}

// —— 交互接近检测 ——
ctx.onTick(function scene3MemoryTick(dt) {
  if ((ctx.scene.activeWorld || 'b612') !== 'b612') return;
  if (ctx.store.flag('page1')) return;
  if (!built) {
    build();
    return;
  }
  const pl = ctx.player.pl;
  const d = (x, z) => Math.hypot(pl.p.x - x, pl.p.z - z);

  if (!arrivalDone) {
    // 到达:落点在出生区,王子台词延迟 1.2s 展开
    if (!scene3MemoryTick._a) scene3MemoryTick._a = performance.now();
    if (performance.now() - scene3MemoryTick._a > 1200) arrival();
    return;
  }

  // 火山(任一座)
  if (!volDone) {
    for (const v of VOLCANOES) {
      if (d(v.x, v.z) < 2.4) {
        volDone = true;
        speakSeq([SCENE3.volcanoes], 0, null);
        break;
      }
    }
  }
  // 面包树苗
  if (!baobabDone && d(BAOBAB.x, BAOBAB.z) < 2.2) {
    baobabDone = true;
    speakSeq(SCENE3.baobab, 0, null);
  }
  // 小椅子·日落演出
  if (!sunsetDone && !sunsetPlaying && d(CHAIR.x, CHAIR.z) < 2.2) {
    sunsetPlaying = true;
    runSunset(function () {
      sunsetDone = true;
      sunsetPlaying = false;
      speakSeq(SCENE3.sunset, 0, null);
      setTimeout(checkCompletion, 1200);
    });
  }
  checkCompletion();
});

// —— 日落演出:天幕由夜紫烧成橙红,6s 后归于黄昏 ——
function runSunset(done) {
  const w = world();
  if (!w || !w.scene.background || !w.scene.background.isColor) return done && done();
  const bg = w.scene.background;
  const from = bg.clone();
  const peak = new THREE.Color(0x8a4020); // 烧红的橙
  const t0 = performance.now();
  const DUR = 3000;
  function ramp() {
    const k = Math.min(1, (performance.now() - t0) / DUR);
    bg.copy(from).lerp(peak, k * k); // 加速烧起来
    if (k < 1) requestAnimationFrame(ramp);
    else {
      setTimeout(function () {
        const t1 = performance.now();
        const back = function () {
          const k2 = Math.min(1, (performance.now() - t1) / DUR);
          bg.copy(peak).lerp(bgDusk || from, k2);
          if (k2 < 1) requestAnimationFrame(back);
        };
        back();
        done && done();
      }, 2200);
    }
  }
  ramp();
  // 台词在烧起来的过程中铺开
  speakSeq(SCENE3.sunset, 0, null);
}

function checkCompletion() {
  if (exitStarted || !baobabDone || !sunsetDone) return;
  exitStarted = true;
  // 白光收回:回忆淡出到纯白,交棒回黑夜现实
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
