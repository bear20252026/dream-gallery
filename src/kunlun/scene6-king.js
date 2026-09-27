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
import { PLANETS, ISLAND_R, ISLAND_TOP_K } from '../shared/planet-logic.mjs';
import { spawnFloatArrow, tickArrow, removeFloatArrow } from '../scene/guide-arrow.js';

let arrivalDone = false; // 本次进 325 的入梦链已启动
let sceneDone = false; // 全链+拾星完成(章节已推进)
let pickupArmed = false; // 台词全部收束,星屑可拾
let starTaken = false; // 星屑已拾(幂等守卫)
let speakTimer = null; // 心跳守护句柄
let moteBeacon = null; // 星屑光柱信标(2026-09-26 指引三件套②③):台词链收束后立起,拾取即撤
let doorArmed = false; // 回程石环已可传送(章节完成后置位;走进石环 3m 即回 B612)
let doorBeacon = null; // 回程石环光柱信标(storyBeaconDoor):拾星后立起,进门即撤
// 悬浮箭(2026-09-27 3D 箭头指引):一信标一箭,星屑/石环上空各一支,同立同撤
let arrowMote = null,
  arrowDoor = null;
let chapterCached = -1; // 章节快照(-1=未读):tick 每帧读 localStorage 太奢,0.5s 粒度足够
let tickN = 0;

// 星屑坐标单一源在 planets.js(网格 name='sproutMote'):armMoteBeacon 时现取,
// 兜底值仅 worldManager 缺失的降级场使用(与 planets.js 默认摆位一致)
const MOTE_X = 0,
  MOTE_Z = 9;
const ISLE_TOP_Y = ISLAND_R * ISLAND_TOP_K; // 岛顶面高度(m)

// —— 台词队列:lock 互斥 + spent 幂等 + 心跳守护(与 scene3-memory 同规) ——
function speakSeq(seq, i, done) {
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
    speakSeq(seq, i + 1, done);
  };
  ctx.openDialog({
    speaker: tt(item.who),
    speakerType: whoSpk(item.who),
    lines: [tt(item)],
    autoHide: Math.max(4600, ((item.en || '').length * 65) | 0),
    lock: true,
    onDone: finish,
  });
  clearTimeout(speakTimer);
  speakTimer = setTimeout(
    function () {
      if (!ctx.ui.dialogOpen || !ctx.ui.dialogOpen()) finish();
    },
    Math.max(4600, ((item.en || '').length * 65) | 0) + 2600
  );
}

// —— 日落敕令演出:金光漫起又退去(国王"等时机成熟"后,天边果然烧起来) ——
function sunsetShow(done) {
  const veil = document.createElement('div');
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
  setTimeout(function () {
    veil.style.opacity = '0';
  }, 2600);
  setTimeout(function () {
    veil.remove();
    try {
      ctx.ui.kunlunSpeak && ctx.kunlunSpeak(tt(SCENE5.sunsetVoice));
    } catch (e) {}
    done();
  }, 4400);
}

// —— 光柱信标(零 PointLight 铁律:全 MeshBasicMaterial,fog:false;同 scene3-night 规制) ——
// 挂 king325 独立世界场景(岛心原点,星屑在出生点身后偏南,转身才见——光柱远看可见)。
// name 入参给探针断言用(storyBeaconMote)。
function makeBeacon(x, z, h, r, opacity, name) {
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
  m.position.set(x, ISLE_TOP_Y + h / 2 + 0.1, z);
  m.userData.baseOpacity = opacity;
  m.name = name || 'storyBeacon';
  return m;
}
function armMoteBeacon() {
  if (moteBeacon) return;
  const w = ctx.scene.worldManager ? ctx.scene.worldManager.getWorld('king325') : null;
  if (!w) return;
  const mote = w.scene.getObjectByName('sproutMote'); // 坐标单一源(planets.js 摆位)
  moteBeacon = makeBeacon(
    mote ? mote.position.x : MOTE_X,
    mote ? mote.position.z : MOTE_Z,
    3.0,
    0.4,
    0.3,
    'storyBeaconMote'
  );
  w.scene.add(moteBeacon);
  // 悬浮箭:星屑正上方,转身即见"去拾起";拾取同撤
  if (!arrowMote)
    arrowMote = spawnFloatArrow(
      w.scene,
      moteBeacon.position.x,
      moteBeacon.position.y + 1.5 + 0.9,
      moteBeacon.position.z,
      { name: 'guideArrowMote' }
    );
}
function removeMoteBeacon() {
  if (!moteBeacon) return;
  const w = ctx.scene.worldManager ? ctx.scene.worldManager.getWorld('king325') : null;
  if (w) w.scene.remove(moteBeacon);
  moteBeacon.geometry.dispose();
  moteBeacon.material.dispose();
  moteBeacon = null;
  removeFloatArrow(w ? w.scene : null, arrowMote);
  arrowMote = null;
}

// —— 回程石环(2026-09-27 点亮死代码):拾星后 planets.js setChapter 点亮石环,
// 这里立光柱 + toast 直说「怎么回去」,走进石环 3m 即传送回 B612 ——
function kingScene() {
  const w = ctx.scene.worldManager ? ctx.scene.worldManager.getWorld('king325') : null;
  return w ? w.scene : null;
}
function armDoorBeacon() {
  if (doorBeacon) return;
  const sc = kingScene();
  if (!sc) return;
  const d = sc.getObjectByName('sproutDoor'); // 坐标单一源(planets.js 摆位)
  doorBeacon = makeBeacon(
    d ? d.position.x : 0,
    d ? d.position.z : -3.4,
    3.4,
    0.42,
    0.26,
    'storyBeaconDoor'
  );
  sc.add(doorBeacon);
  // 悬浮箭:石环正上方,"走进去回 B612";进门同撤
  if (!arrowDoor)
    arrowDoor = spawnFloatArrow(
      sc,
      doorBeacon.position.x,
      doorBeacon.position.y + 1.7 + 0.9,
      doorBeacon.position.z,
      { name: 'guideArrowDoor' }
    );
}
function removeDoorBeacon() {
  if (!doorBeacon) return;
  const sc = kingScene();
  if (sc) sc.remove(doorBeacon);
  doorBeacon.geometry.dispose();
  doorBeacon.material.dispose();
  doorBeacon = null;
  removeFloatArrow(sc, arrowDoor);
  arrowDoor = null;
}
function tryDoorTeleport(pl) {
  const sc = kingScene();
  const d = sc && sc.getObjectByName('sproutDoor');
  const dx = pl.p.x - (d ? d.position.x : 0),
    dz = pl.p.z - (d ? d.position.z : -3.4);
  if (dx * dx + dz * dz >= 9) return false;
  doorArmed = false;
  removeDoorBeacon(); // 玩家已到:信标完成使命
  try {
    ctx.scene.worldManager && ctx.scene.worldManager.back(); // 同 goB612Back
  } catch (e) {}
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
  if (dx * dx + dz * dz < 9) {
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
  if (doorBeacon) {
    doorBeacon.rotation.y += 0.004;
    doorBeacon.material.opacity =
      doorBeacon.userData.baseOpacity * (0.8 + Math.sin(nowSec * 1.9) * 0.25);
  }
  if (arrowDoor) tickArrow(arrowDoor, nowSec);
  if (sceneDone) return;
  // 信标呼吸(光柱缓慢旋绕+透明度起伏,与 scene3-night 同律)
  if (moteBeacon) {
    moteBeacon.rotation.y += 0.004;
    moteBeacon.material.opacity =
      moteBeacon.userData.baseOpacity * (0.8 + Math.sin(nowSec * 1.9) * 0.25);
  }
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
        sceneDone = true;
        doorArmed = true;
        // 完成toast 延一拍:单元素 toast 会互相顶替,先让「拾获星屑」独立亮一拍
        setTimeout(function () {
          try {
            ctx.ui.modeToast && ctx.ui.modeToast(tt(SCENE5.doneToast));
          } catch (e) {}
          armDoorBeacon(); // 指引三件套:回程光柱立起,进门即撤
        }, 1600);
        // 「怎么回去」再晚一拍:与前两条 toast 错峰,不互顶
        setTimeout(function () {
          try {
            ctx.ui.modeToast && ctx.ui.modeToast(tt(SCENE5.gotoDoor), 6000);
          } catch (e) {}
        }, 4800);
      });
    return;
  }

  if (arrivalDone) return;
  arrivalDone = true;
  setTimeout(function () {
    // 入梦导语(planet-logic 为 325 写好的星球导语,首次接线)
    const cfg = PLANETS.find(function (p) {
      return p.num === '325';
    });
    try {
      ctx.ui.kunlunSpeak && ctx.kunlunSpeak(tt({ en: 'The King', zh: cfg.tts }));
    } catch (e) {}
    setTimeout(function () {
      window.__scene6 = window.__scene6 || {};
      window.__scene6.stage = 'chain1';
      speakSeq(SCENE5.chain1, 0, function () {
        window.__scene6.stage = 'sunset';
        sunsetShow(function () {
          window.__scene6.stage = 'chain2';
          speakSeq(SCENE5.chain2, 0, function () {
            window.__scene6.stage = 'pickup';
            pickupArmed = true;
            // 行动指引三件套(2026-09-26 规矩②③ 扩展到 325 章):台词只讲戏,
            // 「去哪」由 toast 直说 + 光柱信标指(星屑在出生点身后,转身才见)——拾取即撤
            armMoteBeacon();
            try {
              ctx.ui.modeToast && ctx.ui.modeToast(tt(SCENE5.pickupToast), 6000);
            } catch (e) {}
          });
        });
      });
    }, 1400);
  }, 1200);
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
