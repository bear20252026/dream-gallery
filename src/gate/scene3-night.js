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
import { spawnFloatArrow, tickArrow, removeFloatArrow } from '../scene/guide-arrow.js';
import { shiftDayTo } from '../scene/time-shift.js';
import { DAY_HOURS } from '../shared/dayphase-logic.mjs';
import { ENDING_GATE_CHAPTER } from '../shared/ending-logic.mjs'; // 结局线门槛(2026-10-03)

let armed = false;
let boxProp = null;
let gateGlow = null;
let gateGlowTimer = null;
let boxBeacon = null; // 羊箱光柱信标(2026-09-26 主人报「指引不清晰」):夜里找得到箱子
let gateBeacon = null; // 石门光柱信标:黑夜里 14m 外的光晕不够醒目,光柱远看可见
let b612Beacon = null; // 书页一完成后去 B612 的石门信标(2026-09-27 补齐:同一扇门现在通 B612)
// 悬浮箭(2026-09-27 3D 箭头指引):一信标一箭,光柱管远看,箭管精确落点,同立同撤
let arrowBox = null,
  arrowGate = null,
  arrowB612 = null;
let countingShown = false;
let page1Shown = false;
let visit = 0;
const OWNER = 'desert-night';
const phase = (hint) =>
  ctx.ui.journey?.setPhase(OWNER, {
    world: 'main',
    chapter: { zh: '沙漠 · 现实中的夜晚', en: 'Desert · the present night' },
    hint,
    lock: ctx.store.num('planetsChapter') === 0,
  });

const BOX_X = -4.3,
  BOX_Z = 69.6;
const GATE_X = 0.1,
  GATE_Z = 56.4;

function ground(x, z) {
  return ctx.media && ctx.media.desert && ctx.media.desert.getH ? ctx.media.desert.getH(x, z) : 0;
}

// —— 光柱信标(零 PointLight 铁律:全 MeshBasicMaterial,fog:false 夜里远处可见) ——
// name 入参给探针断言用(storyBeaconBox / storyBeaconGate)
function makeBeacon(x, z, h, r, opacity, name) {
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
  m.name = name || 'storyBeacon';
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
  // 台词⇔时间(2026-09-27):旧实现瞬锁 22 点天光"咔"一下变黑 —— 改 5 秒暮→夜快切,
  // 画完羊黄昏落幕、数数时正好入夜,台词与天光对上号
  try {
    shiftDayTo(DAY_HOURS.NIGHT, 5000);
  } catch (e) {
    console.debug('[scene3-night] 转夜快切失败(回退瞬锁):', e);
    try {
      ctx.media.dayTimeSource = function () {
        return DAY_HOURS.NIGHT;
      };
    } catch (e2) {}
  }
  buildBox();
  phase({
    zh: '画羊已完成。走近身旁的羊箱，听听箱里的声音。',
    en: 'Your sheep drawing is complete. Approach the box and listen.',
  });
  ctx.ui.journey?.setGoal(OWNER, {
    world: 'main',
    x: BOX_X,
    z: BOX_Z,
    zh: '走近羊箱，听它数数',
    en: 'Approach the sheep box and listen',
  });
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
  if (!boxBeacon) boxBeacon = makeBeacon(BOX_X, BOX_Z, 2.0, 0.22, 0.22, 'storyBeaconBox');
  // 悬浮箭(2026-09-27):落在光柱顶上空,指精确落点;玩家到箱边同撤
  if (!arrowBox && boxBeacon)
    arrowBox = spawnFloatArrow(ctx.scene.s, BOX_X, boxBeacon.position.y + 1.0 + 0.9, BOX_Z, {
      name: 'guideArrowBox',
    });
  // 余烬暖光:残骸旁一点微光,夜里看得见羊箱与残骸的轮廓
  const ember = new THREE.PointLight(0xffb46a, 0.75, 9);
  ember.position.set(-6.2, ground(-6.2, 71.5) + 0.9, 71.5);
  ctx.scene.s.add(ember);
}

// —— 石门夜光(呼吸脉动) ——
function armGateGlow() {
  if (ctx.scene.activeWorld !== 'main') return;
  if (gateGlow) {
    guideGate();
    return;
  }
  gateGlow = new THREE.PointLight(0xffd9a0, 0.4, 14);
  gateGlow.position.set(GATE_X, ground(GATE_X, GATE_Z) + 2.2, GATE_Z);
  ctx.scene.s.add(gateGlow);
  gateGlowTimer = setInterval(function () {
    if (!gateGlow) return;
    const t = Date.now() * 0.001;
    gateGlow.intensity = 1.1 + Math.sin(t * 1.7) * 0.45;
  }, 80);
  // 石门现身(2026-09-27 按剧情出场):门实体此刻才出现,之前走近看不见摸不着
  try {
    ctx.kunlun.revealStarGate && ctx.kunlun.revealStarGate();
  } catch (e) {
    console.debug('[scene3-night] 石门现身失败(信标指引照常):', e);
  }
  // 行动指引(2026-09-26 主人报「指引不清晰」):台词只说「亮了」,玩家不知道下一步
  // 是走进去 —— toast 直说 + 光柱信标从远处就能看到门在哪
  gateBeacon = makeBeacon(GATE_X, GATE_Z, 3.4, 0.42, 0.26, 'storyBeaconGate');
  // 悬浮箭(2026-09-27):门洞正上方,走进去即撤
  if (!arrowGate && gateBeacon)
    arrowGate = spawnFloatArrow(ctx.scene.s, GATE_X, gateBeacon.position.y + 1.7 + 0.9, GATE_Z, {
      name: 'guideArrowGate',
    });
  guideGate();
}
function guideGate() {
  phase({
    zh: '羊箱的声音让石门亮起。走向门光，进入小王子的家的回忆。',
    en: 'The counting has lit the stone gate. Follow its light into memories of his home.',
  });
  ctx.ui.journey?.setGoal(OWNER, {
    world: 'main',
    x: GATE_X,
    z: GATE_Z,
    zh: '走进石门 · B612 家的回忆',
    en: 'Cross the gate · memories of B612',
  });
}

// 书页一完成后去 B612(2026-09-27「剧情发展指引不清」补齐):
// 同一扇石门现在通 B612 —— 信标复立 + toast 直说,进门即撤(portal 传送后由 tick 收走)
function armB612() {
  if (ctx.scene.activeWorld !== 'main') return;
  // 327 完成后故事转入结局线(画册页→井→告别),石门不再是「下一步」(2026-10-03)
  if (ctx.store.num('planetsChapter') >= ENDING_GATE_CHAPTER) {
    removeB612();
    ctx.ui.journey?.clearGoal?.(OWNER);
    return;
  }
  if (b612Beacon) {
    guideB612();
    return;
  }
  // 石门现身(2026-09-27 按剧情出场):同一扇门现在通 B612,先现身再指
  try {
    ctx.kunlun.revealStarGate && ctx.kunlun.revealStarGate();
  } catch (e) {
    console.debug('[scene3-night] 石门现身失败(信标指引照常):', e);
  }
  b612Beacon = makeBeacon(GATE_X, GATE_Z, 3.4, 0.42, 0.26, 'storyBeaconB612');
  if (!arrowB612 && b612Beacon)
    arrowB612 = spawnFloatArrow(ctx.scene.s, GATE_X, b612Beacon.position.y + 1.7 + 0.9, GATE_Z, {
      name: 'guideArrowB612',
    });
  guideB612();
}
function guideB612() {
  phase({
    zh: '家的回忆已经结束。这次穿过同一扇门，在 B612 选择前往国王星，继续小王子的旅途。',
    en: 'Memories of home are complete. Cross the same gate, then choose the King on B612 to continue his journey.',
  });
  ctx.ui.journey?.setGoal(OWNER, {
    world: 'main',
    x: GATE_X,
    z: GATE_Z,
    zh: '再次穿门 · 准备拜访国王',
    en: 'Cross again · next, the King',
  });
}
function removeB612() {
  if (!b612Beacon) return;
  removeBeacon(b612Beacon);
  b612Beacon = null;
  removeFloatArrow(ctx.scene.s, arrowB612);
  arrowB612 = null;
}

function speakSeq(seq, i, done, ticket = visit) {
  if (ticket !== visit || ctx.scene.activeWorld !== 'main') return;
  if (i >= seq.length) return done && done();
  const item = seq[i];
  let spent = false; // onDone 与心跳守护只许一个推进(晚到的重复收束吞掉)
  const finish = function () {
    if (spent) return;
    spent = true;
    clearTimeout(wd);
    speakSeq(seq, i + 1, done, ticket);
  };
  ctx.openDialog({
    speaker: tt(item.who),
    speakerType: whoSpk(item.who),
    lines: [tt(item)],
    autoHide: 0,
    lock: true,
    scope: OWNER,
    world: 'main',
    onDone: finish,
  });
  clearTimeout(wd);
  const guard = () => {
    if (ticket !== visit || spent) return;
    if (!ctx.ui.dialogOpen || !ctx.ui.dialogOpen()) finish();
    else wd = setTimeout(guard, 2600);
  };
  wd = setTimeout(guard, 6800);
}
let wd = null;

// —— 主循环 ——
// 画羊四笔收束(scene2-draw 广播 story:scene2done)后,现实才转入黑夜;
// 画板未收束就转夜,计数对话会打断羊初声(时序竞态,2026-09-07 修复)
ctx.events.on('story:scene2done', armNight);
ctx.events.on('world:changed', ({ from, to }) => {
  if (to === 'main' && from !== 'main' && armed) {
    if (ctx.store.flag('page1') && page1Shown) armB612();
    else if (!ctx.store.flag('page1') && countingShown) armGateGlow();
  }
  if (from !== 'main' || to === 'main') return;
  visit++;
  clearTimeout(wd);
  ctx.ui.cancelDialogScope?.(OWNER);
  ctx.ui.journey?.cancel(OWNER);
});
ctx.onTick(function scene3NightTick() {
  if ((ctx.scene.activeWorld || 'main') !== 'main') return;
  // 信标呼吸(光柱缓慢旋绕+透明度起伏;夜里远看也像「活的」)+ 悬浮箭浮沉自转(同拍)
  const bt = Date.now() * 0.001;
  for (const b of [boxBeacon, gateBeacon, b612Beacon]) {
    if (!b) continue;
    b.rotation.y += 0.004;
    b.material.opacity = b.userData.baseOpacity * (0.8 + Math.sin(bt * 1.9) * 0.25);
  }
  for (const a of [arrowBox, arrowGate, arrowB612]) {
    if (!a) continue;
    tickArrow(a, bt);
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
    removeFloatArrow(ctx.scene.s, arrowGate);
    arrowGate = null;
    // exitBridge 说完 → 立 B612 去向指引(同一扇门现在通 B612)
    speakSeq([SCENE3.exitBridge], 0, armB612);
  }
  // 已在去 B612 路上:走进石门 4m 即传送,信标完成使命(portal 也会传,此处只清信标)
  if (b612Beacon) {
    try {
      const pl = ctx.player.pl;
      const dx = pl.p.x - GATE_X,
        dz = pl.p.z - GATE_Z;
      if (dx * dx + dz * dz < 16) removeB612();
    } catch (e) {}
  }
  // 回忆完成后不再重播第一次入梦的数数与门光对白。
  if (ctx.store.flag('page1')) return;
  if (ctx.ui.dialogOpen?.() || ctx.overlay.anyOpen() || document.getElementById('scene2Board'))
    return;
  // 计数仪式:玩家走近羊箱,箱里传出数数声,石门亮起
  if (!countingShown && boxProp) {
    const pl = ctx.player.pl;
    const d = Math.hypot(pl.p.x - boxProp.position.x, pl.p.z - boxProp.position.z);
    if (d < 5.5) {
      countingShown = true;
      removeBeacon(boxBeacon); // 玩家已到箱边:信标完成使命
      boxBeacon = null;
      removeFloatArrow(ctx.scene.s, arrowBox);
      arrowBox = null;
      // 数数行 + 轮到玩家开口(REPLIES.night,2026-09-26 主人令「不仅仅是在放台词」):
      // 羊数完数,选项出现;玩家发问(pilot 朗读)→ 王子答 → 石门提示 → 亮起
      const countingLine = {
        who: SCENE3.countingWho,
        en: SCENE3.counting.en,
        zh: SCENE3.counting.zh,
      };
      ctx.openDialog({
        scope: OWNER,
        world: 'main',
        speaker: tt(countingLine.who),
        speakerType: whoSpk(countingLine.who),
        lines: [tt(countingLine)],
        autoHide: 0,
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
