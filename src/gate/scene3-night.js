// scene3-night.js — B612 剧本第 3 场·转夜与入梦仪式(2026-09-07)
// 画羊四笔完成(scene2 标记)后:现实锁入黑夜 → 羊箱道具落在坠机点 →
// 羊在箱里数数("One... two... three...") → 石门夜里亮起(暖光呼吸) →
// 玩家走进石门(既有自动传送)坠入回忆;回忆层完成书页一(page1 标记)回到
// 黑夜现实时,王子叫醒(kunlun/scene3-memory.js 发 'story:page1done')。
// 艺术处理:余烬暖光/羊箱静立/门光呼吸——夜是安静的,不堆特效。
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { SCENE3, tt, whoSpk } from '../shared/story-text.mjs';
import { replyChoices } from '../shared/dialog-replies.mjs';

let armed = false;
let boxProp = null;
let gateGlow = null;
let gateGlowTimer = null;
let boxBeacon = null; // 羊箱光柱信标(2026-09-26 主人报「指引不清晰」):夜里找得到箱子
let gateBeacon = null; // 石门光柱信标:黑夜里 14m 外的光晕不够醒目,光柱远看可见
let countingShown = false;
let page1Shown = false;

const BOX_X = -4.3,
  BOX_Z = 69.6;
const GATE_X = 0.1,
  GATE_Z = 56.4;

function ground(x, z) {
  return ctx.media && ctx.media.desert && ctx.media.desert.getH ? ctx.media.desert.getH(x, z) : 0;
}

// —— 光柱信标(零 PointLight 铁律:全 MeshBasicMaterial,fog:false 夜里远处可见) ——
function makeBeacon(x, z, h, r, opacity) {
  const gy = ground(x, z);
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.55, r, h, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd9a0,
      transparent: true,
      opacity: opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    })
  );
  m.position.set(x, gy + h / 2 + 0.2, z);
  m.userData.baseOpacity = opacity;
  ctx.scene.s.add(m);
  return m;
}
function removeBeacon(b) {
  if (!b) return;
  ctx.scene.s.remove(b);
  b.geometry.dispose();
  b.material.dispose();
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
  const bx = BOX_X,
    bz = BOX_Z;
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
  // 信标:光柱指箱子(夜里/远处的「去听听」视觉锚点;玩家开口后即撤)
  if (!boxBeacon) boxBeacon = makeBeacon(BOX_X, BOX_Z, 2.0, 0.22, 0.22);
  // 余烬暖光:残骸旁一点微光,夜里看得见羊箱与残骸的轮廓
  const ember = new THREE.PointLight(0xffb46a, 0.75, 9);
  ember.position.set(-6.2, ground(-6.2, 71.5) + 0.9, 71.5);
  ctx.scene.s.add(ember);
}

// —— 石门夜光(呼吸脉动) ——
function armGateGlow() {
  if (gateGlow) return;
  gateGlow = new THREE.PointLight(0xffd9a0, 0.4, 14);
  gateGlow.position.set(GATE_X, ground(GATE_X, GATE_Z) + 2.2, GATE_Z);
  ctx.scene.s.add(gateGlow);
  gateGlowTimer = setInterval(function () {
    if (!gateGlow) return;
    const t = Date.now() * 0.001;
    gateGlow.intensity = 1.1 + Math.sin(t * 1.7) * 0.45;
  }, 80);
  // 行动指引(2026-09-26 主人报「指引不清晰」):台词只说「亮了」,玩家不知道下一步
  // 是走进去 —— toast 直说 + 光柱信标从远处就能看到门在哪
  gateBeacon = makeBeacon(GATE_X, GATE_Z, 3.4, 0.42, 0.26);
  if (ctx.ui && ctx.ui.modeToast) ctx.ui.modeToast(tt(SCENE3.gotoGate), 6000);
}

function speakSeq(seq, i, done) {
  if (i >= seq.length) return done && done();
  const item = seq[i];
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
    autoHide: 4200,
    lock: true,
    onDone: finish,
  });
  clearTimeout(wd);
  wd = setTimeout(function () {
    if (!ctx.dialogOpen || !ctx.dialogOpen()) finish();
  }, 6800);
}
let wd = null;

// —— 主循环 ——
// 画羊四笔收束(scene2-draw 广播 story:scene2done)后,现实才转入黑夜;
// 画板未收束就转夜,计数对话会打断羊初声(时序竞态,2026-09-07 修复)
ctx.events.on('story:scene2done', armNight);
ctx.onTick(function scene3NightTick() {
  if ((ctx.scene.activeWorld || 'main') !== 'main') return;
  // 信标呼吸(光柱缓慢旋绕+透明度起伏;夜里远看也像「活的」)
  const bt = Date.now() * 0.001;
  for (const b of [boxBeacon, gateBeacon]) {
    if (!b) continue;
    b.rotation.y += 0.004;
    b.material.opacity = b.userData.baseOpacity * (0.8 + Math.sin(bt * 1.9) * 0.25);
  }
  if (!armed) {
    // 旧档兜底:标记已有但本次会话未经历收束事件,直接转夜
    if (ctx.store.flag('scene2')) armNight();
    return;
  }
  // 书页一完成:回到黑夜现实,王子叫醒 —— 必须先于计数仪式(2026-09-26 指引整改时序):
  // 计数对话带 choices 永不自动关闭,若它先开,exitBridge 会被 lock 队列压到玩家点选后,
  // 旧档玩家不点选项就永远听不到「你刚才走了好远」。先欢迎回来,再听羊数数。
  if (!page1Shown && ctx.store.flag('page1')) {
    page1Shown = true;
    if (gateGlow) {
      ctx.scene.s.remove(gateGlow);
      gateGlow = null;
      clearInterval(gateGlowTimer);
    }
    removeBeacon(gateBeacon); // 书页一完成:石门指引同样收束
    gateBeacon = null;
    speakSeq([SCENE3.exitBridge], 0, null);
  }
  // 计数仪式:玩家走近羊箱,箱里传出数数声,石门亮起
  if (!countingShown && boxProp) {
    const pl = ctx.player.pl;
    const d = Math.hypot(pl.p.x - boxProp.position.x, pl.p.z - boxProp.position.z);
    if (d < 5.5) {
      countingShown = true;
      removeBeacon(boxBeacon); // 玩家已到箱边:信标完成使命
      boxBeacon = null;
      // 数数行 + 轮到玩家开口(REPLIES.night,2026-09-26 主人令「不仅仅是在放台词」):
      // 羊数完数,选项出现;玩家发问(pilot 朗读)→ 王子答 → 石门提示 → 亮起
      const countingLine = {
        who: SCENE3.countingWho,
        en: SCENE3.counting.en,
        zh: SCENE3.counting.zh,
      };
      ctx.openDialog({
        speaker: tt(countingLine.who),
        speakerType: whoSpk(countingLine.who),
        lines: [tt(countingLine)],
        autoHide: 4200,
        lock: true,
        choices: replyChoices(ctx, 'night', function () {
          speakSeq(
            [
              {
                who: { en: 'B612', zh: 'B612' },
                en: SCENE3.doorGlowHint.en,
                zh: SCENE3.doorGlowHint.zh,
              },
            ],
            0,
            armGateGlow
          );
        }),
      });
    }
  }
});
