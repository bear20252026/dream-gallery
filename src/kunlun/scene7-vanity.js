// scene7-vanity.js — B612 剧本第 7 场上半·书页五·326 虚荣的人(2026-09-27,情节阶段二)
// 流程:进 king326(chapter>=1)→ 导语 → chainA(登场四句) → 拍手蒙太奇(4s) →
//   chainB(帽子六句) → 星屑拾取(3m)→ 章节推进 planetsChapter=2
//   (回程石环亮起,planets.js setChapter 点亮)→ 走进石环回 B612(本模块判定传送)。
// 台词单一源:story-text SCENE7_VANITY。326 无专属 GLB(程序化高镜 idx1 已够),
//   回忆是幽灵旁观,拍手只做蒙太奇不做互动(定稿规则一)。
// 多人房间冻结;旧灵蕴线休眠不受影响。
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { SCENE7_VANITY, SCENE5, tt, whoSpk } from '../shared/story-text.mjs';
import { PLANETS, ISLAND_R, ISLAND_TOP_K } from '../shared/planet-logic.mjs';

let arrivalDone = false; // 本次进 326 的入梦链已启动
let sceneDone = false; // 全链+拾星完成(章节已推进)
let pickupArmed = false; // 台词全部收束,星屑可拾
let starTaken = false; // 星屑已拾(幂等守卫)
let speakTimer = null; // 心跳守护句柄
let moteBeacon = null; // 星屑光柱信标:台词链收束后立起,拾取即撤
let doorArmed = false; // 回程石环已可传送(章节完成后置位;走进石环 3m 即回 B612)
let doorBeacon = null; // 回程石环光柱信标:拾星后立起,进门即撤
let chapterCached = -1; // 章节快照(-1=未读):tick 每帧读 localStorage 太奢,0.5s 粒度足够
let tickN = 0;

const ISLE_TOP_Y = ISLAND_R * ISLAND_TOP_K; // 岛顶面高度(m)

// —— 台词队列:lock 互斥 + spent 幂等 + 心跳守护(与 scene6-king 同规) ——
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

// —— 光柱信标(零 PointLight 铁律:全 MeshBasicMaterial,fog:false;同 scene6 规制) ——
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
function vanityScene() {
  const w = ctx.scene.worldManager ? ctx.scene.worldManager.getWorld('king326') : null;
  return w ? w.scene : null;
}
function armMoteBeacon() {
  if (moteBeacon) return;
  const sc = vanityScene();
  if (!sc) return;
  const mote = sc.getObjectByName('sproutMote'); // 坐标单一源(planets.js 摆位)
  moteBeacon = makeBeacon(
    mote ? mote.position.x : 0,
    mote ? mote.position.z : 9,
    3.0,
    0.4,
    0.3,
    'storyBeaconMote'
  );
  sc.add(moteBeacon);
}
function removeMoteBeacon() {
  if (!moteBeacon) return;
  const sc = vanityScene();
  if (sc) sc.remove(moteBeacon);
  moteBeacon.geometry.dispose();
  moteBeacon.material.dispose();
  moteBeacon = null;
}
function armDoorBeacon() {
  if (doorBeacon) return;
  const sc = vanityScene();
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
}
function removeDoorBeacon() {
  if (!doorBeacon) return;
  const sc = vanityScene();
  if (sc) sc.remove(doorBeacon);
  doorBeacon.geometry.dispose();
  doorBeacon.material.dispose();
  doorBeacon = null;
}
function tryDoorTeleport(pl) {
  const sc = vanityScene();
  const d = sc && sc.getObjectByName('sproutDoor');
  const dx = pl.p.x - (d ? d.position.x : 0),
    dz = pl.p.z - (d ? d.position.z : -3.4);
  if (dx * dx + dz * dz >= 9) return false;
  doorArmed = false;
  removeDoorBeacon(); // 玩家已到:信标完成使命
  const wm = ctx.scene.worldManager;
  if (!wm) return true;
  // back() 是 async:失败静默返回 false,原 try/catch 包不住,不恢复门/信标玩家被困本星
  // (2026-10-09 空 catch 治理,scene6-king 同批)
  Promise.resolve(wm.back())
    .then((ok) => {
      if (!ok) {
        doorArmed = true;
        armDoorBeacon();
        console.warn('[scene7-vanity] 回程传送未成,石环已重置');
      }
    })
    .catch(() => {});
  return true;
}

// —— 星屑拾取:3m 判定(行星通用 hidePlanetMote 负责藏网格) ——
function motePos() {
  const sc = vanityScene();
  const mote = sc && sc.getObjectByName('sproutMote');
  return mote ? { x: mote.position.x, z: mote.position.z } : { x: 0, z: 9 };
}
function tryPickup(pl, onPick) {
  const m = motePos();
  const dx = pl.p.x - m.x,
    dz = pl.p.z - m.z;
  if (dx * dx + dz * dz < 9) {
    starTaken = true;
    removeMoteBeacon(); // 玩家已到:信标完成使命
    ctx.kunlun.hidePlanetMote && ctx.kunlun.hidePlanetMote('flame');
    try {
      ctx.ui.modeToast && ctx.ui.modeToast(tt(SCENE7_VANITY.pickedToast));
    } catch (e) {}
    onPick();
  }
}

let prevWorld = '';
ctx.onTick(function scene7VanityTick() {
  const active = ctx.scene.activeWorld || '';
  // 离开 326:复位入梦标记——同会话内再进可重新触发
  if (prevWorld === 'king326' && active !== 'king326') {
    if (!sceneDone) {
      arrivalDone = false;
      pickupArmed = false;
      removeMoteBeacon(); // 中途离开:信标一并收走,下次进再立
    }
    removeDoorBeacon(); // 离岛收回程光柱(重访返程走导航钮/岛心传送垫,不再唠叨)
  }
  prevWorld = active;
  if (active !== 'king326') return;
  // 回程石环传送:章节完成后常驻(含重访),走到环 3m 内即回 B612
  if (doorArmed && tryDoorTeleport(ctx.player.pl)) return;
  // 回程信标呼吸(存活期在 sceneDone 之后,须放在早退之前)
  if (doorBeacon) {
    doorBeacon.rotation.y += 0.004;
    doorBeacon.material.opacity =
      doorBeacon.userData.baseOpacity * (0.8 + Math.sin(Date.now() * 0.0019) * 0.25);
  }
  if (sceneDone) return;
  // 信标呼吸(光柱缓慢旋绕+透明度起伏,与 scene6 同律)
  if (moteBeacon) {
    moteBeacon.rotation.y += 0.004;
    moteBeacon.material.opacity =
      moteBeacon.userData.baseOpacity * (0.8 + Math.sin(Date.now() * 0.0019) * 0.25);
  }
  // 章节快照:首帧读一次,之后每 30 帧兜底刷新
  tickN = (tickN + 1) % 30;
  if (chapterCached < 0 || tickN === 0) chapterCached = ctx.store.num('planetsChapter');
  // 章节已推进过(重访):纯观赏;回程石环已亮(planets 启动按进度还原),传送静默就位
  // 326 槽位是 index1:chapter>=2 即本章完成;重访也立回程光柱(老玩家回来找得到门)
  if (chapterCached >= 2) {
    sceneDone = true;
    doorArmed = true;
    armDoorBeacon();
    return;
  }
  // 325 未完成:此处无事可做(导航不会送人来,双保险)
  if (chapterCached >= 0 && chapterCached < 1) return;

  if (pickupArmed) {
    if (!starTaken)
      tryPickup(ctx.player.pl, function () {
        ctx.kunlun.setChapter && ctx.kunlun.setChapter(2); // 326 完成,今晚还有 327
        sceneDone = true;
        doorArmed = true;
        // 完成toast 延一拍:单元素 toast 会互相顶替,先让「拾获星屑」独立亮一拍
        setTimeout(function () {
          try {
            ctx.ui.modeToast && ctx.ui.modeToast(tt(SCENE7_VANITY.doneToast));
          } catch (e) {}
          armDoorBeacon(); // 指引三件套:回程光柱立起,进门即撤
        }, 1600);
        // 下一站(2026-10-04 衔接整改):不再让玩家自己找门回 B612、再找按钮——
        // toast 亮完翻出旅途卡「下一夜」,点继续直达下一颗星;没有旅途卡时退回老指引
        if (ctx.ui.voyage) ctx.ui.voyage.offer(3600);
        else
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
    // 入梦导语(planet-logic 为 326 写好的星球导语,首次接线)
    const cfg = PLANETS.find(function (p) {
      return p.num === '326';
    });
    try {
      ctx.ui.kunlunSpeak && ctx.kunlunSpeak(tt({ en: 'The Conceited Man', zh: cfg.tts }));
    } catch (e) {}
    setTimeout(function () {
      window.__scene7a = window.__scene7a || {};
      window.__scene7a.stage = 'chainA';
      speakSeq(SCENE7_VANITY.chainA, 0, function () {
        // 拍手蒙太奇(定稿:拍了五分钟)——toast 三声啪 + 4s 停顿,不上锁不阻塞
        window.__scene7a.stage = 'clap';
        try {
          ctx.ui.modeToast && ctx.ui.modeToast(tt(SCENE7_VANITY.clapToast), 4500);
        } catch (e) {}
        // The montage lasts 4 s on its own; with the witness card the player may clap along, or skip.
        const afterClap = function () {
          if (ctx.scene.activeWorld !== 'king326') return;
          window.__scene7a.stage = 'chainB';
          speakSeq(SCENE7_VANITY.chainB, 0, function () {
            window.__scene7a.stage = 'pickup';
            pickupArmed = true;
            // 行动指引三件套:台词只讲戏,「去哪」由 toast 直说 + 光柱信标指——拾取即撤
            armMoteBeacon();
            try {
              ctx.ui.modeToast && ctx.ui.modeToast(tt(SCENE7_VANITY.pickupToast), 6000);
            } catch (e) {}
          });
        };
        if (ctx.ui.witness) {
          ctx.ui.witness.ask('vain326').then(afterClap, afterClap);
        } else setTimeout(afterClap, 4000);
      });
    }, 1400);
  }, 1200);
});

// 探针钩子
window.__scene7a = window.__scene7a || {};
Object.defineProperty(window.__scene7a, 'state', {
  get: function () {
    return {
      arrivalDone: arrivalDone,
      pickupArmed: pickupArmed,
      starTaken: starTaken,
      sceneDone: sceneDone,
      doorArmed: doorArmed,
      stage: window.__scene7a && window.__scene7a.stage,
    };
  },
});
