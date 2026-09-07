// scene3-night.js — B612 剧本第 3 场·转夜与入梦仪式(2026-09-07)
// 画羊四笔完成(scene2 标记)后:现实锁入黑夜 → 羊箱道具落在坠机点 →
// 羊在箱里数数("One... two... three...") → 石门夜里亮起(暖光呼吸) →
// 玩家走进石门(既有自动传送)坠入回忆;回忆层完成书页一(page1 标记)回到
// 黑夜现实时,王子叫醒(kunlun/scene3-memory.js 发 'story:page1done')。
// 艺术处理:余烬暖光/羊箱静立/门光呼吸——夜是安静的,不堆特效。
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { SCENE3, tt } from '../shared/story-text.mjs';

let armed = false;
let boxProp = null;
let gateGlow = null;
let gateGlowTimer = null;
let countingShown = false;
let page1Shown = false;

function ground(x, z) {
  return ctx.media && ctx.media.desert && ctx.media.desert.getH ? ctx.media.desert.getH(x, z) : 0;
}

function armNight() {
  if (armed) return;
  armed = true;
  try {
    ctx.media.dayTimeSource = function () {
      return 22; // 夜(0-24),现实锁入黑夜直到后续场次解锁
    };
  } catch (e) {}
  buildBox();
}

// —— 羊箱:玩家画的箱子同款(矮箱+顶面气孔),落在出生点旁的沙地上 ——
function buildBox() {
  const bx = -4.3,
    bz = 69.6;
  const gy = ground(bx, bz);
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.42, 0.5),
    new THREE.MeshStandardMaterial({ color: '#9a7b52', roughness: 0.85 })
  );
  box.position.set(bx, gy + 0.21, bz);
  box.name = 'sheepBox';
  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(0.66, 0.08, 0.54),
    new THREE.MeshStandardMaterial({ color: '#7c5f3e', roughness: 0.9 })
  );
  lid.position.set(bx, gy + 0.45, bz);
  lid.name = 'sheepBoxLid';
  ctx.scene.s.add(box, lid);
  for (let i = 0; i < 2; i++) {
    const hole = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.02, 0.09),
      new THREE.MeshStandardMaterial({ color: '#2b2118' })
    );
    hole.position.set(bx - 0.12 + i * 0.2, gy + 0.465, bz + 0.05);
    ctx.scene.s.add(hole);
  }
  boxProp = box;
  // 余烬暖光:残骸旁一点微光,夜里看得见羊箱与残骸的轮廓
  const ember = new THREE.PointLight(0xffb46a, 0.75, 9);
  ember.position.set(-6.2, ground(-6.2, 71.5) + 0.9, 71.5);
  ctx.scene.s.add(ember);
}

// —— 石门夜光(呼吸脉动) ——
function armGateGlow() {
  if (gateGlow) return;
  gateGlow = new THREE.PointLight(0xffd9a0, 0.4, 14);
  gateGlow.position.set(0.1, ground(0.1, 56) + 2.2, 56.4);
  ctx.scene.s.add(gateGlow);
  gateGlowTimer = setInterval(function () {
    if (!gateGlow) return;
    const t = Date.now() * 0.001;
    gateGlow.intensity = 1.1 + Math.sin(t * 1.7) * 0.45;
  }, 80);
}

function speakSeq(seq, i, done) {
  if (i >= seq.length) return done && done();
  const item = seq[i];
  ctx.openDialog({
    speaker: tt(item.who),
    lines: [tt(item)],
    autoHide: 4200,
    onDone: function () {
      speakSeq(seq, i + 1, done);
    },
  });
}

// —— 主循环 ——
// 画羊四笔收束(scene2-draw 广播 story:scene2done)后,现实才转入黑夜;
// 画板未收束就转夜,计数对话会打断羊初声(时序竞态,2026-09-07 修复)
ctx.events.on('story:scene2done', armNight);
ctx.onTick(function scene3NightTick() {
  if ((ctx.scene.activeWorld || 'main') !== 'main') return;
  if (!armed) {
    // 旧档兜底:标记已有但本次会话未经历收束事件,直接转夜
    if (ctx.store.flag('scene2')) armNight();
    return;
  }
  // 计数仪式:玩家走近羊箱,箱里传出数数声,石门亮起
  if (!countingShown && boxProp) {
    const pl = ctx.player.pl;
    const d = Math.hypot(pl.p.x - boxProp.position.x, pl.p.z - boxProp.position.z);
    if (d < 5.5) {
      countingShown = true;
      speakSeq(
        [
          { who: SCENE3.countingWho, en: SCENE3.counting.en, zh: SCENE3.counting.zh },
          { who: { en: 'B612', zh: 'B612' }, en: SCENE3.doorGlowHint.en, zh: SCENE3.doorGlowHint.zh },
        ],
        0,
        armGateGlow
      );
    }
  }
  // 书页一完成:回到黑夜现实,王子叫醒
  if (!page1Shown && ctx.store.flag('page1')) {
    page1Shown = true;
    if (gateGlow) {
      ctx.scene.s.remove(gateGlow);
      gateGlow = null;
      clearInterval(gateGlowTimer);
    }
    speakSeq([SCENE3.exitBridge], 0, null);
  }
});
