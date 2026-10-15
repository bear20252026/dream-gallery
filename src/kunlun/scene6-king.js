// scene6-king.js — B612 剧本第 6 场·书页四·325 国王(2026-09-20,情节阶段一)
// 流程:进 king325(书页一二三已完成)→ 导语 → 国王台词链 chain1(求日落)→
//   日落敕令演出(金光收束,国王行使"等时机成熟"的敕令)→ chain2(审判自己/
//   老耗子/封大使/退场+羊箱吐槽)→ 星屑拾取(3m)→ 章节完成 planetsChapter=1
//   (回程石环亮起,planets.js setChapter 点亮)→ 走进石环回 B612(本模块判定传送)。
// 台词单一源:story-text SCENE5。章节推进:ctx.kunlun.setChapter(planets.js 注册,
//   同步 store + 门环)。多人房间冻结;旧灵蕴线休眠不受影响。
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { Z } from '../shared/z-layers.mjs';
import { SCENE5, tt, whoSpk } from '../shared/story-text.mjs';
import { ISLAND_R, ISLAND_TOP_K, PICK_RADIUS, DOOR_RADIUS } from '../shared/planet-logic.mjs';
import { kingCheckpoint } from '../shared/journey-guidance.mjs';
import { spawnFloatArrow, tickArrow, removeFloatArrow } from '../scene/guide-arrow.js';
import { createBeaconKeeper, pulseBeacon } from '../shared/beacon-manager.js';

let arrivalDone = false; // 本次进 325 的入梦链已启动
let sceneDone = false; // 全链+拾星完成(章节已推进)
let pickupArmed = false; // 台词全部收束,星屑可拾
let starTaken = false; // 星屑已拾(幂等守卫)
let speakTimer = null; // 心跳守护句柄
let doorArmed = false; // 回程石环已可传送(章节完成后置位;走进石环 3m 即回 B612)
// 悬浮箭(2026-09-27 3D 箭头指引):一信标一箭,星屑/石环上空各一支,同立同撤
let arrowMote = null,
  arrowDoor = null;
let chapterCached = -1; // 章节快照(-1=未读):tick 每帧读 localStorage 太奢,0.5s 粒度足够
let tickN = 0;
let visit = 0;
let sunsetVeil = null;
const OWNER = 'king-memory';
function later(fn, ms) {
  const ticket = visit;
  return setTimeout(() => {
    if (ticket === visit && ctx.scene.activeWorld === 'king325') fn();
  }, ms);
}

// 星屑坐标单一源在 planets.js(网格 name='sproutMote'):armMoteBeacon 时现取,
// 兜底值仅 worldManager 缺失的降级场使用(与 planets.js 默认摆位一致)
const MOTE_X = 0,
  MOTE_Z = 9;
const ISLE_TOP_Y = ISLAND_R * ISLAND_TOP_K; // 岛顶面高度(m)

// —— 台词队列:lock 互斥 + spent 幂等 + 心跳守护(与 scene3-memory 同规) ——
function speakSeq(seq, i, done, ticket = visit) {
  if (ticket !== visit || ctx.scene.activeWorld !== 'king325') return;
  if (i >= seq.length) {
    if (done) done();
    return;
  }
  const item = seq[i];
  let spent = false;
  const finish = function () {
    if (spent) return;
    spent = true;
    clearTimeout(speakTimer);
    speakSeq(seq, i + 1, done, ticket);
  };
  ctx.openDialog({
    speaker: tt(item.who),
    speakerType: whoSpk(item.who),
    lines: [tt(item)],
    autoHide: 0,
    world: 'king325',
    lock: true,
    scope: OWNER,
    onDone: finish,
  });
  clearTimeout(speakTimer);
  const guard = () => {
    if (ticket !== visit || spent) return;
    if (!ctx.ui.dialogOpen || !ctx.ui.dialogOpen()) finish();
    else speakTimer = later(guard, 2600);
  };
  speakTimer = later(guard, Math.max(4600, ((item.en || '').length * 65) | 0) + 2600);
}

// —— 日落敕令演出:金光漫起又退去(国王"等时机成熟"后,天边果然烧起来) ——
function sunsetShow(done) {
  const veil = document.createElement('div');
  sunsetVeil = veil;
  veil.style.cssText =
    'position:fixed;inset:0;z-index:' +
    Z.sunsetVeil +
    ';pointer-events:none;' +
    'background:radial-gradient(120% 90% at 50% 100%, rgba(255,140,50,.55), rgba(255,90,40,.28) 45%, rgba(40,20,60,.18));' +
    'opacity:0;transition:opacity 1.4s ease';
  document.body.appendChild(veil);
  requestAnimationFrame(function () {
    veil.style.opacity = '1';
  });
  later(function () {
    veil.style.opacity = '0';
  }, 2600);
  later(function () {
    veil.remove();
    sunsetVeil = null;
    ctx.ui.openDialog({
      speaker: 'B612',
      lines: [tt(SCENE5.sunsetVoice)],
      lock: true,
      scope: OWNER,
      world: 'king325',
      autoHide: 0,
      onDone: done,
    });
  }, 4400);
}

// —— 光柱信标:建/拆/呼吸都在 shared/beacon-manager.js(零 PointLight 铁律在那儿唯一表达) ——
// 挂 king325 独立世界场景(岛心原点,星屑在出生点身后偏南,转身才见——光柱远看可见)。
// 信标 name 是给探针断言用的(storyBeaconMote / storyBeaconDoor),留在这里,不进共享模块。
const beacons = createBeaconKeeper(() => kingScene());
function armMoteBeacon() {
  const sc = kingScene();
  if (beacons.has('mote') || !sc) return;
  const mote = sc.getObjectByName('sproutMote'); // 坐标单一源(planets.js 摆位)
  const m = beacons.arm('mote', () => ({
    x: mote ? mote.position.x : MOTE_X,
    z: mote ? mote.position.z : MOTE_Z,
    baseY: ISLE_TOP_Y,
    lift: 0.1,
    h: 3.0,
    r: 0.4,
    opacity: 0.3,
    name: 'storyBeaconMote',
  }));
  // 悬浮箭:星屑正上方,转身即见"去拾起";拾取同撤
  if (!arrowMote)
    arrowMote = spawnFloatArrow(sc, m.position.x, m.position.y + 1.5 + 0.9, m.position.z, {
      name: 'guideArrowMote',
    });
}
function removeMoteBeacon() {
  if (!beacons.remove('mote')) return;
  removeFloatArrow(kingScene(), arrowMote);
  arrowMote = null;
}

// —— 回程石环(2026-09-27 点亮死代码):拾星后 planets.js setChapter 点亮石环,
// 这里立光柱 + toast 直说「怎么回去」,走进石环 3m 即传送回 B612 ——
function kingScene() {
  const w = ctx.scene.worldManager ? ctx.scene.worldManager.getWorld('king325') : null;
  return w ? w.scene : null;
}
function armDoorBeacon() {
  const sc = kingScene();
  if (beacons.has('door') || !sc) return;
  const d = sc.getObjectByName('sproutDoor'); // 坐标单一源(planets.js 摆位)
  ctx.ui.journey?.setGoal(OWNER, {
    world: 'king325',
    x: d ? d.position.x : 0,
    z: d ? d.position.z : -3.4,
    zh: '走进石环，回到 B612',
    en: 'Step into the ring, back to B612',
  });
  const m = beacons.arm('door', () => ({
    x: d ? d.position.x : 0,
    z: d ? d.position.z : -3.4,
    baseY: ISLE_TOP_Y,
    lift: 0.1,
    h: 3.4,
    r: 0.42,
    opacity: 0.26,
    name: 'storyBeaconDoor',
  }));
  // 悬浮箭:石环正上方,"走进去回 B612";进门同撤
  if (!arrowDoor)
    arrowDoor = spawnFloatArrow(sc, m.position.x, m.position.y + 1.7 + 0.9, m.position.z, {
      name: 'guideArrowDoor',
    });
}
function removeDoorBeacon() {
  if (!beacons.remove('door')) return;
  removeFloatArrow(kingScene(), arrowDoor);
  arrowDoor = null;
}
function tryDoorTeleport(pl) {
  const sc = kingScene();
  const d = sc && sc.getObjectByName('sproutDoor');
  const dx = pl.p.x - (d ? d.position.x : 0),
    dz = pl.p.z - (d ? d.position.z : -3.4);
  if (dx * dx + dz * dz >= DOOR_RADIUS * DOOR_RADIUS) return false;
  doorArmed = false;
  removeDoorBeacon(); // 玩家已到:信标完成使命
  const wm = ctx.scene.worldManager;
  if (!wm) return true;
  // back() 是 async:失败(切换中/飞行锁/目标未加载)静默返回 false,原 try/catch 包不住,
  // 且门已 disarm+信标已删 —— 不恢复的话玩家被困本星(2026-10-09 空 catch 治理)
  Promise.resolve(wm.back())
    .then((ok) => {
      if (!ok) {
        doorArmed = true;
        armDoorBeacon();
        console.warn('[scene6-king] 回程传送未成,石环已重置');
      }
    })
    .catch(() => {});
  return true;
}

// —— 星屑拾取:3m 判定(planets.js 的 hideSproutMote 负责藏网格) ——
function motePos() {
  // 判定坐标单一源:星屑网格现取(隐藏后 position 仍在);worldManager 缺失才退兜底常量
  const w = ctx.scene.worldManager ? ctx.scene.worldManager.getWorld('king325') : null;
  const mote = w && w.scene.getObjectByName('sproutMote');
  return mote ? { x: mote.position.x, z: mote.position.z } : { x: MOTE_X, z: MOTE_Z };
}
function tryPickup(pl, onPick) {
  const m = motePos();
  const dx = pl.p.x - m.x,
    dz = pl.p.z - m.z;
  if (dx * dx + dz * dz < PICK_RADIUS * PICK_RADIUS) {
    starTaken = true;
    removeMoteBeacon(); // 玩家已到:信标完成使命
    ctx.kunlun.hideSproutMote && ctx.kunlun.hideSproutMote();
    try {
      ctx.ui.modeToast && ctx.ui.modeToast(tt(SCENE5.pickedToast));
    } catch (e) {}
    onPick();
  }
}

let prevWorld = '';
ctx.events.on('world:changed', ({ from, to }) => {
  if (from !== 'king325' || to === 'king325') return;
  visit++;
  clearTimeout(speakTimer);
  ctx.ui.cancelDialogScope?.(OWNER);
  ctx.ui.journey?.cancel(OWNER);
  sunsetVeil?.remove();
  sunsetVeil = null;
  removeObservationBeacon();
  if (!sceneDone) {
    arrivalDone = false;
    pickupArmed = false;
    removeMoteBeacon();
  }
  removeDoorBeacon();
});

function removeObservationBeacon() {
  beacons.remove('observation');
}
function runObservation(id, done) {
  const ticket = visit;
  window.__scene6.stage = id === 'rat' ? 'listen' : 'almanac';
  if (!ctx.ui.journey) {
    done();
    return;
  }
  ctx.ui.journey
    .beginTask(OWNER, id, {
      onTarget(point) {
        beacons.remove('observation'); // 观察点是换一个目标就挪一根,不复用旧的
        const sc = kingScene();
        if (!sc) return;
        beacons.arm('observation', () => ({
          x: point.x,
          z: point.z,
          baseY: ISLE_TOP_Y,
          lift: 0.1,
          h: 1.5,
          r: 0.3,
          opacity: 0.3,
          name: 'kingObservationBeacon',
        }));
      },
    })
    .then((result) => {
      removeObservationBeacon();
      if (result && ticket === visit && ctx.scene.activeWorld === 'king325') done();
    });
}

function runKingStep(step) {
  const ticket = visit;
  if (ctx.scene.activeWorld !== 'king325') return;
  ctx.ui.journey?.setPhase(OWNER, {
    world: 'king325',
    chapter: { zh: '325 · 国王的回忆', en: '325 · memory of the King' },
    step: step + 1,
    total: 6,
    hint:
      step >= 5
        ? {
            zh: '在心里答一句，或者跳过，然后去拾起星屑。',
            en: 'Answer in your head, or skip, then go and pick up the stardust.',
          }
        : {
            zh: '按「继续」读完当前对白，再完成这一段观察。',
            en: 'Continue the current dialogue, then complete this observation.',
          },
  });
  const next = () => {
    if (ticket !== visit || ctx.scene.activeWorld !== 'king325') return;
    ctx.store.setNum('kingMemoryStep', step + 1);
    runKingStep(step + 1);
  };
  if (step === 0) {
    window.__scene6.stage = 'chain1';
    speakSeq(SCENE5.chain1, 0, next);
  } else if (step === 1) runObservation('almanac', next);
  else if (step === 2) {
    window.__scene6.stage = 'sunset';
    sunsetShow(() => {
      window.__scene6.stage = 'chain2';
      speakSeq(SCENE5.chain2.slice(0, 2), 0, next);
    });
  } else if (step === 3) runObservation('rat', next);
  else if (step === 4) {
    window.__scene6.stage = 'departure';
    speakSeq(SCENE5.chain2.slice(2), 0, next);
  } else {
    // Private witness card: the player answers in their own head; the King never reacts (ghost rule).
    window.__scene6.stage = 'witness';
    const armPickup = () => {
      if (ticket !== visit || ctx.scene.activeWorld !== 'king325') return;
      window.__scene6.stage = 'pickup';
      pickupArmed = true;
      armMoteBeacon();
      const m = motePos();
      ctx.ui.journey?.setGoal(OWNER, {
        world: 'king325',
        x: m.x,
        z: m.z,
        zh: '拾起国王之星的星屑',
        en: 'Pick up the King’s stardust',
      });
    };
    if (ctx.ui.witness) ctx.ui.witness.ask('king325').then(armPickup, armPickup);
    else armPickup();
  }
}

async function beginKingMemory() {
  const ticket = visit,
    saved = kingCheckpoint(ctx.store.num('kingMemoryStep'), ctx.store.json('journeyMemories', []));
  // 经旅途卡「第四夜 · 国王」到达:那张卡就是开场,不再叠一张过渡卡(2026-10-04)
  if (!saved && ctx.ui.voyage?.arrived('king325')) {
    runKingStep(saved);
    return;
  }
  const ready = await ctx.ui.journey?.transition(OWNER, {
    world: 'king325',
    chapter: { zh: '回忆二 · 国王的星球', en: 'Memory II · the King’s planet' },
    title: {
      zh: saved ? '继续拜访国王' : '小王子的第一站',
      en: saved ? 'Continue visiting the King' : 'His first stop',
    },
    hint: {
      zh: '家的回忆结束后，小王子开始拜访别的星球。你将见证他与国王的对话，读历书，再留意王座后的声音。每段由你点「继续」推进。',
      en: 'After leaving home, he visits other planets. Witness his conversation with the King, read the almanac and listen behind the throne. Continue each part at your own pace.',
    },
    action: {
      zh: saved ? '从上次完成的段落继续' : '开始拜访国王',
      en: saved ? 'Resume the visit' : 'Begin the visit',
    },
  });
  if (ready === false || ticket !== visit) return;
  runKingStep(saved);
}
ctx.onTick(function scene6Tick() {
  const active = ctx.scene.activeWorld || '';
  // 离开 325:复位入梦标记——同会话内再进可重新触发(2026-09-20「没对话」修复②)
  if (prevWorld === 'king325' && active !== 'king325') {
    if (!sceneDone) {
      arrivalDone = false;
      pickupArmed = false;
      removeMoteBeacon(); // 中途离开:信标一并收走,下次进再立
    }
    removeDoorBeacon(); // 离岛收回程光柱(重访返程走导航钮/岛心传送垫,不再唠叨)
  }
  prevWorld = active;
  if (active !== 'king325') return;
  // 回程石环传送:章节完成后常驻(含重访),走到环 3m 内即回 B612
  if (doorArmed && tryDoorTeleport(ctx.player.pl)) return;
  // 回程信标呼吸(存活期在 sceneDone 之后,须放在早退之前)+ 悬浮箭同拍
  const nowSec = Date.now() * 0.001;
  pulseBeacon(beacons.get('door'), nowSec);
  if (arrowDoor) tickArrow(arrowDoor, nowSec);
  if (sceneDone) return;
  // 信标呼吸(光柱缓慢旋绕+透明度起伏,与 scene3-night 同律)
  pulseBeacon(beacons.get('mote'), nowSec);
  if (arrowMote) tickArrow(arrowMote, nowSec);
  // 章节快照:首帧读一次,之后每 30 帧兜底刷新(?storyreset 重开会话=页面重载,自愈)
  tickN = (tickN + 1) % 30;
  if (chapterCached < 0 || tickN === 0) chapterCached = ctx.store.num('planetsChapter');
  // 章节已推进过(重访):纯观赏;回程石环已亮(planets 启动按进度还原),传送静默就位
  // 重访也立回程光柱+悬浮箭(2026-09-27):否则老玩家回来找不到回去的门
  if (chapterCached !== 0) {
    sceneDone = true;
    doorArmed = true;
    armDoorBeacon();
    return;
  }

  if (pickupArmed) {
    if (!starTaken)
      tryPickup(ctx.player.pl, function () {
        ctx.kunlun.setChapter && ctx.kunlun.setChapter(1); // planets:点亮回程石环
        ctx.ui.journey?.remember('king', null, false);
        sceneDone = true;
        doorArmed = true;
        // 完成toast 延一拍:单元素 toast 会互相顶替,先让「拾获星屑」独立亮一拍
        later(function () {
          try {
            ctx.ui.modeToast && ctx.ui.modeToast(tt(SCENE5.doneToast));
          } catch (e) {}
          armDoorBeacon(); // 指引三件套:回程光柱立起,进门即撤
        }, 1600);
        // 下一站(2026-10-04 衔接整改):不再让玩家自己找门回 B612、再找按钮——
        // toast 亮完翻出旅途卡「下一夜」,点继续直达下一颗星;没有旅途卡时退回老指引
        if (ctx.ui.voyage) ctx.ui.voyage.offer(3600);
        else
          later(function () {
            try {
              ctx.ui.modeToast && ctx.ui.modeToast(tt(SCENE5.gotoDoor), 6000);
            } catch (e) {}
          }, 4800);
      });
    return;
  }

  if (arrivalDone) return;
  arrivalDone = true;
  ctx.ui.journey?.setGoal(OWNER, {
    world: 'king325',
    x: 0,
    z: 0,
    zh: '聆听国王与小王子的对话',
    en: 'Listen to the King and the little prince',
  });
  later(beginKingMemory, 700);
});

// 探针钩子
window.__scene6 = window.__scene6 || {};
Object.defineProperty(window.__scene6, 'state', {
  get: function () {
    return {
      arrivalDone: arrivalDone,
      pickupArmed: pickupArmed,
      starTaken: starTaken,
      sceneDone: sceneDone,
      doorArmed: doorArmed,
      stage: window.__scene6 && window.__scene6.stage,
    };
  },
});
