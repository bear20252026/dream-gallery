// kunlun/ending-journey.js — 结局线:画册页 → 找井 → 告别 → 六年后(2026-10-03「先做结局」)
//
// 为什么先做结局:此前故事停在 327 酒鬼,没有一个玩家能走到告别。《小王子》的力量全在后半本 ——
// 井、告别、会笑的星星。主人 2026-10-03 拍板:328/329/330 与地球五站先用「画册页」接上,
// 结局先做完整;以后逐页换成 3D 场景。
//
// 流程(存档 endingStep,只前进):
//   0 → 327 完成后回到沙漠:屏幕下方出现「翻开书」卡片 → 画册页(书页六/七/八)
//   1 → 读完:夜。罗盘熄灭,小王子跟在身边。没有箭头——只有水声(从哪侧来/多清楚)。
//       站定越久听得越清楚。走到井边 → 唤醒井 → 黎明 → 画嘴套。
//   2 → 「第二天傍晚」。他站在井边旧石墙上,和看不见的谁说话。走到他身边 → 告别 → 夜 → 黄光。
//   3 → 尾声·六年后(全屏星空,字幕 + 是/否 一问)。
//   4 → 全书完。可再看星星 / 保存「我的星星」卡片。
//
// 规矩:角色台词全部来自 shared/story-text.mjs(逐字 Woods);本文件只写界面提示。
//       串台词照抄 scene10-fox.js 的范式:autoHide 按长度 + 心跳守护 + spent 幂等,不传 world/scope。
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { eventBus } from '../core/event-bus.js';
import { Z } from '../shared/z-layers.mjs';
import { tt, scriptLang } from '../shared/story-text.mjs';
import { shiftDayTo } from '../scene/time-shift.js';
import { openBook, sketchSvg } from '../ui/book-pages.js';
import { BOOK_PAGES, SCENE_WELL, SCENE_FAREWELL, ENDING_UI, WHO } from '../shared/story-text.mjs';
import {
  ENDING,
  clampEnding,
  advanceEnding,
  endingReady,
  listenSignal,
  soundSide,
  walkLinesDue,
  WELL_POS,
  WELL_REACH,
} from '../shared/ending-logic.mjs';
import {
  startWater,
  setWater,
  stopWater,
  isWaterActive,
  drip,
  bellOnce,
  bellsOn,
  bellsOff,
} from './ending-audio.js';
import {
  initPrinceRig,
  loadPrince,
  placePrince,
  princeAnim,
  crashPrinceVisible,
  sheepBoxVisible,
  updatePrince,
  getPrinceMode,
  setPrinceMode,
  resetFall,
  disposePrince,
} from './ending-prince.js';
import { initEpilogue, playEpilogue, getStageEntry, stopStarfield } from './ending-epilogue.js';

const OWNER = 'ending-journey';
const PRINCE_MODEL = '/models/b612/chibi-prince-rigged-v2.glb';
const PRINCE_H = 3.2; // 与 crash-site.js 一致
const WALL = { x: WELL_POS.x - 6, z: WELL_POS.z + 2.5 }; // 告别的旧石墙
const WALL_H = 1.3;

const STYLE = `
#endAction{position:fixed;left:50%;bottom:31vh;transform:translateX(-50%);z-index:${Z.endingAction};
  display:none;align-items:center;gap:12px;padding:10px 12px 10px 20px;border-radius:30px;
  background:rgba(30,24,18,.86);border:1px solid rgba(232,200,140,.55);color:#f6e6c4;
  font-family:Georgia,"Kaiti SC","STKaiti","KaiTi",serif;box-shadow:0 10px 30px rgba(0,0,0,.35);
  animation:endPulse 2.6s ease-in-out infinite}
#endAction.show{display:flex}
#endAction button{font:inherit;font-size:16px;cursor:pointer;color:#2c2014;background:linear-gradient(135deg,#f3d79a,#d7a65a);
  border:none;border-radius:22px;padding:10px 20px;min-height:44px;white-space:nowrap}
#endAction kbd{font:12px/1 sans-serif;opacity:.65;border:1px solid rgba(246,230,196,.5);border-radius:5px;padding:4px 6px}
@keyframes endPulse{0%,100%{box-shadow:0 10px 30px rgba(0,0,0,.35)}50%{box-shadow:0 10px 30px rgba(0,0,0,.35),0 0 0 6px rgba(243,215,154,.14)}}
#endListen{position:fixed;inset:0;z-index:${Z.endingTint};pointer-events:none;display:none}
#endListen.show{display:block}
#endListen .ed{position:absolute;top:0;bottom:0;width:28vw;opacity:0;transition:opacity .35s ease}
#endListen .el{left:0;background:radial-gradient(60% 70% at 0% 50%,rgba(150,205,255,.55),rgba(150,205,255,0) 70%)}
#endListen .er{right:0;background:radial-gradient(60% 70% at 100% 50%,rgba(150,205,255,.55),rgba(150,205,255,0) 70%)}
#endListen .eb{left:0;right:0;bottom:0;top:auto;width:auto;height:26vh;background:radial-gradient(70% 90% at 50% 100%,rgba(150,205,255,.45),rgba(150,205,255,0) 70%)}
#endListen .ring{position:absolute;left:50%;top:50%;width:90px;height:90px;margin:-45px 0 0 -45px;border-radius:50%;
  border:1.5px solid rgba(190,225,255,.8);opacity:0}
#endListen .lab{position:absolute;left:50%;top:22vh;transform:translateX(-50%);font:italic 15px Georgia,serif;
  color:rgba(220,236,255,.9);letter-spacing:.12em;text-shadow:0 1px 6px rgba(0,0,0,.6);opacity:0;transition:opacity .5s}
#endTint{position:fixed;inset:0;z-index:${Z.endingTint};pointer-events:none;opacity:0;transition:opacity 1.2s ease}
#endVeil{position:fixed;inset:0;z-index:${Z.endingStage};display:none;align-items:center;justify-content:center;
  background:#07060a;color:#efe2c6;font:italic clamp(20px,3vw,30px) Georgia,serif;letter-spacing:.14em;opacity:0;transition:opacity 1.4s ease}
#endVeil.show{display:flex}
#endSketch{position:fixed;left:50%;top:44%;transform:translate(-50%,-50%);z-index:${Z.bookPages};display:none;
  width:min(380px,84vw);padding:18px 18px 10px;background:#f6eedb;border-radius:6px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
#endSketch.show{display:block}
#endSketch svg{width:100%;height:auto;fill:none;stroke:#4a3a2a;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
#endSketch svg .faint{stroke:#9b8a72;stroke-width:1.4}
#endSketch svg path{stroke-dasharray:700;stroke-dashoffset:700;animation:endDraw 2.4s ease forwards}
@keyframes endDraw{to{stroke-dashoffset:0}}
#endStage{position:fixed;inset:0;z-index:${Z.endingStage};display:none;overflow:hidden;
  background:radial-gradient(120% 90% at 50% 100%,#1b2140 0%,#0b0d1c 55%,#05060c 100%);
  font-family:Georgia,"Times New Roman","Kaiti SC","STKaiti","KaiTi",serif;color:#f1e6cc;opacity:0;transition:opacity 2s ease}
#endStage.show{display:block}
#endStage.in{opacity:1}
#endStage canvas{position:absolute;inset:0;width:100%;height:100%}
#endStage .cap{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(720px,86vw);text-align:center}
#endStage .kick{font-size:12px;letter-spacing:.4em;color:#c9b07c;text-transform:uppercase;margin-bottom:18px}
#endStage .txt{font-size:clamp(17px,2.2vw,23px);line-height:1.75;white-space:pre-line;opacity:0;transition:opacity 1.4s ease}
#endStage .txt2{font-size:13px;line-height:1.6;color:#a99c86;white-space:pre-line;margin-top:12px;opacity:0;transition:opacity 1.4s ease}
#endStage .txt.on,#endStage .txt2.on{opacity:1}
#endStage .sk{width:min(240px,50vw);margin:0 auto 14px;opacity:.9}
#endStage .sk svg{width:100%;height:auto;fill:none;stroke:#e8d9b6;stroke-width:2.2;stroke-linecap:round}
#endStage .sk svg .faint{stroke:#8f8572}
#endStage .own{width:min(260px,56vw,40dvh);margin:0 auto 14px;padding:8px;background:#f1e7cc;border-radius:3px 14px;transform:rotate(-1.2deg);box-shadow:0 10px 30px #0008}
#endStage .own-note{font-size:13px;line-height:1.5;color:#cdbfa6;text-align:center;margin:0 auto 12px;max-width:min(360px,80vw)}
#endStage .pf-strip{display:flex;justify-content:center;gap:10px;margin:0 auto 14px;flex-wrap:wrap}
#endStage .pf-strip button{width:min(84px,20vw);padding:4px;background:#f1e7cc;border:0;border-radius:3px 10px;cursor:pointer;transform:rotate(-1deg)}
#endStage .pf-strip button:nth-child(even){transform:rotate(1.2deg)}
#endStage .btns{margin-top:28px;display:flex;justify-content:center;gap:12px;flex-wrap:wrap;opacity:0;transition:opacity 1s ease}
#endStage .btns.on{opacity:1}
#endStage button{font:inherit;font-size:16px;cursor:pointer;color:#f6e6c4;background:rgba(255,236,190,.08);
  border:1px solid rgba(240,214,160,.55);border-radius:24px;padding:10px 24px;min-height:44px}
#endStage button:hover{background:rgba(255,236,190,.18)}
#endStage button.hill{color:#2c2014;background:linear-gradient(135deg,#f3d79a,#d7a65a);border-color:#f3d79a;flex-basis:100%;max-width:max-content;margin:0 auto}
#endStage button.hill:hover{background:linear-gradient(135deg,#f7e2b2,#e0b46c)}
#endStage .end{font-size:clamp(34px,6vw,64px);letter-spacing:.3em;font-weight:400;margin:6px 0 4px}
#endStage .hint{position:absolute;left:0;right:0;bottom:22px;text-align:center;font-size:12px;color:#7d7564;letter-spacing:.2em}
@media (hover:none),(max-width:600px){#endAction kbd{display:none}#endAction{padding:8px}}
@media (prefers-reduced-motion:reduce){#endAction{animation:none}#endSketch svg path{animation:none;stroke-dashoffset:0}}
`;

// ===================== 状态 =====================
let step = 0; // 存档里的结局进度
let mode = 'idle'; // idle | book | well | wake | muzzle | farewell-wait | farewell | epilogue | done
let mainScene = null;
let styleEl, actionEl, listenEl, tintEl, veilEl, sketchEl, stageEl;
let actionFn = null;
let unsub = [];
// 找井
let startDist = 0;
let walkSaid = 0;
let stillSec = 0;
let lastPos = null;
let lastDrip = 0;
// 3D
let wellGroup = null;
let waterMesh = null;
let wallMesh = null;
let prince = null; // { wrap, mixer, acts, cur }
let princeMode = 'hidden'; // hidden | follow | well | wall | falling
let speakTimer = null;
let speakGen = 0;

// ===================== 小工具 =====================
function readStep() {
  try {
    return clampEnding(ctx.store.num('endingStep'));
  } catch (e) {
    return 0;
  }
}
function setStep(n) {
  const v = advanceEnding(readStep(), n);
  try {
    ctx.store.setNum('endingStep', v);
  } catch (e) {
    console.warn('[ending] 存档写入失败:', e.message);
  }
  step = v;
  eventBus.emit('ending:step', { step: v });
}
function flags() {
  return {
    page1: !!ctx.store.flag('page1'),
    chapter: ctx.store.num('planetsChapter'),
  };
}
function inMain() {
  return (ctx.scene.activeWorld || 'main') === 'main';
}
function busy() {
  return !!(
    (ctx.ui.dialogOpen && ctx.ui.dialogOpen()) ||
    (ctx.overlay && ctx.overlay.anyOpen && ctx.overlay.anyOpen()) ||
    (ctx.kunlun && ctx.kunlun.flightLock)
  );
}
function groundH(x, z) {
  try {
    return ctx.media && ctx.media.desert ? ctx.media.desert.getH(x, z) : 0;
  } catch (e) {
    return 0;
  }
}
function playerPos() {
  const pl = ctx.player && ctx.player.pl;
  return pl && pl.p ? pl.p : null;
}
function distToWell() {
  const p = playerPos();
  return p ? Math.hypot(p.x - WELL_POS.x, p.z - WELL_POS.z) : Infinity;
}
function distToWall() {
  const p = playerPos();
  return p ? Math.hypot(p.x - WALL.x, p.z - WALL.z) : Infinity;
}
function toast(entry, ms) {
  try {
    ctx.ui.modeToast && ctx.ui.modeToast(tt(entry), ms || 4200);
  } catch (e) {}
}
function setPhase(chapter, hint) {
  try {
    ctx.ui.journey?.setPhase?.(
      OWNER,
      chapter ? { world: 'main', chapter: tt(chapter), hint: tt(hint) } : null
    );
  } catch (e) {}
}
function setGoal(goal) {
  try {
    if (goal) ctx.ui.journey?.setGoal?.(OWNER, { world: 'main', ...goal });
    else ctx.ui.journey?.clearGoal?.(OWNER);
  } catch (e) {}
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ===================== 台词(照 scene10-fox.js 范式) =====================
function speakSeq(seq, then) {
  const gen = ++speakGen;
  let i = 0;
  const next = () => {
    if (gen !== speakGen) return;
    if (i >= seq.length) {
      clearTimeout(speakTimer);
      then && then();
      return;
    }
    const item = seq[i++];
    let spent = false;
    const finish = function () {
      if (spent) return;
      spent = true;
      clearTimeout(speakTimer);
      next();
    };
    const dur = Math.max(4600, ((item.en || '').length * 65) | 0);
    try {
      ctx.openDialog({
        speaker: tt(item.who) || tt(WHO.pilot),
        speakerType: (item.who && item.who.spk) || 'pilot',
        lines: [tt(item)],
        autoHide: dur,
        lock: true,
        onDone: finish,
      });
    } catch (e) {
      finish();
      return;
    }
    clearTimeout(speakTimer);
    speakTimer = setTimeout(function () {
      if (!ctx.ui.dialogOpen || !ctx.ui.dialogOpen()) finish();
    }, dur + 2600);
  };
  next();
}

// ===================== DOM =====================
function buildDom() {
  styleEl = document.createElement('style');
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);
  actionEl = document.createElement('div');
  actionEl.id = 'endAction';
  actionEl.innerHTML = '<button type="button"></button><kbd>E</kbd>';
  actionEl.querySelector('button').onclick = () => runAction();
  document.body.appendChild(actionEl);
  listenEl = document.createElement('div');
  listenEl.id = 'endListen';
  listenEl.innerHTML =
    '<div class="ed el"></div><div class="ed er"></div><div class="ed eb"></div><div class="ring"></div><div class="lab"></div>';
  document.body.appendChild(listenEl);
  tintEl = document.createElement('div');
  tintEl.id = 'endTint';
  document.body.appendChild(tintEl);
  veilEl = document.createElement('div');
  veilEl.id = 'endVeil';
  document.body.appendChild(veilEl);
  sketchEl = document.createElement('div');
  sketchEl.id = 'endSketch';
  document.body.appendChild(sketchEl);
  stageEl = document.createElement('div');
  stageEl.id = 'endStage';
  document.body.appendChild(stageEl);
}
let actionLabel = null; // 当前行动卡的双语条目(切换语言时就地换字)
let stageEntry = null; // 尾声当前字幕的双语条目
function showAction(label, fn) {
  actionFn = fn;
  actionLabel = label;
  const b = actionEl.querySelector('button');
  const t = tt(label);
  if (b.textContent !== t) b.textContent = t;
  actionEl.classList.add('show');
}
function hideAction() {
  actionFn = null;
  actionEl && actionEl.classList.remove('show');
}
function runAction() {
  if (!actionFn) return false;
  if (ctx.ui.dialogOpen && ctx.ui.dialogOpen()) return false;
  const fn = actionFn;
  hideAction();
  fn();
  return true;
}
async function veil(entry, ms) {
  veilEl.textContent = tt(entry);
  veilEl.classList.add('show');
  await wait(30);
  veilEl.style.opacity = '1';
  await wait(1500 + (ms || 1600));
  veilEl.style.opacity = '0';
  await wait(1400);
  veilEl.classList.remove('show');
}
function flashTint(color, ms) {
  tintEl.style.background = color;
  tintEl.style.opacity = '1';
  setTimeout(() => {
    tintEl.style.opacity = '0';
  }, ms || 900);
}

// ===================== 3D:井、墙、小王子 =====================
function buildWell() {
  if (wellGroup || !mainScene) return;
  const gy = groundH(WELL_POS.x, WELL_POS.z);
  wellGroup = new THREE.Group();
  wellGroup.name = 'endingWell';
  wellGroup.position.set(WELL_POS.x, gy, WELL_POS.z);
  const stone = new THREE.MeshStandardMaterial({ color: 0xb59a74, roughness: 0.95 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.9 });
  // 井台:开口圆环(LatheGeometry 截面 = 一圈石沿)
  const profile = [
    new THREE.Vector2(1.05, -0.6),
    new THREE.Vector2(1.45, -0.6),
    new THREE.Vector2(1.45, 0.85),
    new THREE.Vector2(1.32, 0.95),
    new THREE.Vector2(1.05, 0.9),
    new THREE.Vector2(1.05, -0.6),
  ];
  const ring = new THREE.Mesh(new THREE.LatheGeometry(profile, 28), stone);
  wellGroup.add(ring);
  // 水面(井里的星光)
  waterMesh = new THREE.Mesh(
    new THREE.CircleGeometry(1.04, 24),
    new THREE.MeshBasicMaterial({ color: 0x3d6e93, transparent: true, opacity: 0.85 })
  );
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.y = 0.35;
  wellGroup.add(waterMesh);
  // 辘轳:两根立柱 + 横梁 + 绳 + 桶
  for (const sx of [-1.25, 1.25]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.6, 0.16), wood);
    post.position.set(sx, 1.3, 0);
    wellGroup.add(post);
  }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 2.7, 10), wood);
  beam.rotation.z = Math.PI / 2;
  beam.position.y = 2.45;
  wellGroup.add(beam);
  const rope = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 1.3, 6),
    new THREE.MeshStandardMaterial({ color: 0xd8c39a })
  );
  rope.position.set(0, 1.8, 0);
  wellGroup.add(rope);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.19, 0.34, 12), wood);
  bucket.position.set(0, 1.0, 0);
  bucket.name = 'endingBucket';
  wellGroup.add(bucket);
  mainScene.add(wellGroup);
}
function buildWall() {
  if (wallMesh || !mainScene) return;
  const gy = groundH(WALL.x, WALL.z);
  wallMesh = new THREE.Mesh(
    new THREE.BoxGeometry(5.2, WALL_H, 0.9),
    new THREE.MeshStandardMaterial({ color: 0xa88d68, roughness: 1 })
  );
  wallMesh.name = 'endingWall';
  wallMesh.position.set(WALL.x, gy + WALL_H / 2 - 0.05, WALL.z);
  wallMesh.rotation.y = 0.35;
  mainScene.add(wallMesh);
}

// ===================== 0 · 画册页 =====================
function openTheBook() {
  mode = 'book';
  hideAction();
  openBook(BOOK_PAGES, {
    onDone() {
      setStep(ENDING.BOOK);
      mode = 'idle';
      setTimeout(() => startWell(false), 900);
    },
    onClose() {
      mode = 'idle';
    },
  });
}

// ===================== 1 · 找井 =====================
function startWell(resumed) {
  if (!mainScene) return;
  mode = 'well';
  buildWell();
  loadPrince(() => {
    const p = playerPos();
    if (p) placePrince(p.x + 2.5, p.z + 1, null);
    setPrinceMode('follow');
  });
  crashPrinceVisible(false);
  shiftDayTo(21.8, resumed ? 1200 : 5000);
  setPhase(ENDING_UI.listenTitle, ENDING_UI.listenHint);
  setGoal({
    x: WELL_POS.x,
    z: WELL_POS.z,
    hidden: true,
    en: 'Listen for the well',
    zh: '听,井在哪里',
  });
  listenEl.classList.add('show');
  startWater();
  startDist = Math.max(30, distToWell());
  walkSaid = resumed ? SCENE_WELL.walk.length : 0;
  stillSec = 0;
  lastPos = null;
  if (!resumed) speakSeq(SCENE_WELL.start, () => toast(ENDING_UI.listenHint, 6500));
  else toast(ENDING_UI.listenHint, 6500);
}
function tickWell(dt) {
  const p = playerPos();
  if (!p) return;
  // 静止计时(水平速度 < 0.5 m/s 视作站定;按 dt 归一,低帧率设备也成立)
  const moved = lastPos ? Math.hypot(p.x - lastPos.x, p.z - lastPos.z) : 0;
  if (lastPos && moved < Math.max(0.01, 0.5 * dt)) stillSec += dt;
  else stillSec = 0;
  lastPos = { x: p.x, z: p.z };
  const dist = distToWell();
  const sig = listenSignal(dist, stillSec);
  const side = soundSide(p.x, p.z, ctx.player.pl.y || 0, WELL_POS.x, WELL_POS.z);
  setWater(sig.level, sig.clarity, side.pan);
  // 画面:左右/背后边缘的水色微光,亮度 = 水声大小 × (静止带来的清晰度)
  const vis = Math.min(1, sig.level * (0.35 + 0.65 * sig.clarity) * 1.6);
  const [el, er, eb] = listenEl.querySelectorAll('.ed');
  const lw = side.behind ? 0.25 : Math.max(0, -side.pan);
  const rw = side.behind ? 0.25 : Math.max(0, side.pan);
  el.style.opacity = (vis * (0.25 + lw)).toFixed(3);
  er.style.opacity = (vis * (0.25 + rw)).toFixed(3);
  eb.style.opacity = (side.behind ? vis * 0.9 : 0).toFixed(3);
  const ring = listenEl.querySelector('.ring');
  const t = performance.now() / 1000;
  const period = 2.6 - sig.level * 1.6;
  const ph = (t % period) / period;
  ring.style.opacity = (sig.clarity * sig.level * (1 - ph) * 0.9).toFixed(3);
  ring.style.transform = `scale(${0.6 + ph * 1.6})`;
  const lab = listenEl.querySelector('.lab');
  lab.textContent = tt(ENDING_UI.listenStill);
  lab.style.opacity = stillSec > 0.6 ? '1' : '0';
  // 水滴声:静下来、离得不太远时偶尔一滴
  if (sig.clarity > 0.6 && sig.level > 0.08 && t - lastDrip > 1.4 + Math.random() * 1.6) {
    lastDrip = t;
    drip(sig.level, side.pan);
  }
  // 路上的台词:按走过的路程逐句解锁
  // 已经走到井附近就不再补念路上的话(免得到了井边还在一句句念)
  if (dist < 25) walkSaid = SCENE_WELL.walk.length;
  if (!busy() && walkSaid < SCENE_WELL.walk.length) {
    const due = walkLinesDue(startDist, dist, SCENE_WELL.walk.length);
    if (walkSaid < due) {
      const line = SCENE_WELL.walk[walkSaid++];
      speakSeq([line]);
    }
  }
  if (dist <= WELL_REACH) {
    if (!actionFn && !busy()) showAction(ENDING_UI.wellNear, wakeWell);
  } else if (actionFn === wakeWell) hideAction();
}
function stopListening() {
  listenEl.classList.remove('show');
  stopWater();
}
function wakeWell() {
  mode = 'wake';
  stopListening();
  setGoal(null);
  // 唤醒:井在唱歌 —— 一串清亮的水音
  [0, 180, 420, 700].forEach((ms, i) => setTimeout(() => bellOnce(0.03 - i * 0.004), ms));
  shiftDayTo(6.2, 7000); // 黎明
  setPrinceMode('well');
  placePrince(WELL_POS.x + 2.1, WELL_POS.z + 0.6, null, WELL_POS.x, WELL_POS.z);
  princeAnim('idle');
  if (waterMesh) waterMesh.material.color.set(0x7fb2d6);
  speakSeq(SCENE_WELL.found, () => {
    mode = 'muzzle';
    showAction(ENDING_UI.drawMuzzle, drawMuzzle);
  });
}
async function drawMuzzle() {
  mode = 'busy';
  sketchEl.innerHTML = sketchSvg('muzzle');
  sketchEl.classList.add('show');
  await wait(3200);
  sketchEl.classList.remove('show');
  speakSeq(SCENE_WELL.muzzle, async () => {
    setStep(ENDING.WELL);
    await veil(ENDING_UI.nextEvening, 1800);
    startFarewell(true);
  });
}

// ===================== 2 · 告别 =====================
function startFarewell(arrive) {
  if (!mainScene) return;
  mode = 'farewell-wait';
  if (arrive) {
    // 「第二天傍晚,按约回到井边」:把玩家放在离墙 11m、面朝墙的地方(远远看见他坐在墙头)
    const pl = ctx.player && ctx.player.pl;
    if (pl && pl.p) {
      const ax = WALL.x + 7,
        az = WALL.z + 8.5;
      pl.p.x = ax;
      pl.p.z = az;
      pl.y = Math.atan2(-(WALL.x - ax), -(WALL.z - az));
      if (ctx.player.orbit) ctx.player.orbit.yaw = pl.y;
    }
  }
  buildWell();
  buildWall();
  crashPrinceVisible(false);
  shiftDayTo(18.4, 900); // 黄昏
  loadPrince(() => {
    setPrinceMode('wall');
    const gy = groundH(WALL.x, WALL.z) + WALL_H - 0.05;
    placePrince(WALL.x, WALL.z, gy, WALL.x - 4, WALL.z + 3); // 背对玩家,和看不见的谁说话
    princeAnim('idle');
  });
  setPhase(ENDING_UI.farewellTitle, ENDING_UI.farewellHint);
  setGoal({ x: WALL.x, z: WALL.z, en: 'The old stone wall', zh: '旧石墙' });
}
let wallSpoken = false;
function tickFarewellWait() {
  const d = distToWall();
  if (!wallSpoken && d < 16 && !busy()) {
    wallSpoken = true;
    speakSeq(SCENE_FAREWELL.wall, () => {});
    return;
  }
  if (wallSpoken && d < 14 && !busy()) {
    if (!actionFn) showAction(ENDING_UI.approach, farewellNear);
  } else if (actionFn === farewellNear && d >= 14) hideAction();
}
function farewellNear() {
  mode = 'farewell';
  setGoal(null);
  // 黄光一闪,溜进石缝;他栽进你怀里 —— 从墙上下来,站到你面前
  flashTint('radial-gradient(40% 30% at 50% 85%,rgba(255,206,90,.55),rgba(255,206,90,0) 70%)', 500);
  const p = playerPos();
  if (p) {
    const yaw = ctx.player.pl.y || 0;
    const fx = p.x - Math.sin(yaw) * 2.6,
      fz = p.z - Math.cos(yaw) * 2.6;
    placePrince(fx, fz, null, p.x, p.z);
  }
  setPrinceMode('still');
  speakSeq(SCENE_FAREWELL.near, () => {
    sheepBoxVisible(false); // 羊跟他回家了
    shiftDayTo(22.6, 6500); // 天暗透
    setTimeout(() => bellsOn(1600, 0.022), 4000); // 礼物:会笑的小铃铛
    speakSeq(SCENE_FAREWELL.gift, () => {
      bellsOff();
      speakSeq(SCENE_FAREWELL.last, () => fall());
    });
  });
}
function fall() {
  // 一瞬黄光,贴着他的脚踝。他站着,没有喊。
  flashTint(
    'radial-gradient(30% 22% at 50% 80%,rgba(255,214,110,.75),rgba(255,214,110,0) 70%)',
    380
  );
  setTimeout(() => {
    setPrinceMode('falling');
    resetFall();
  }, 700);
  setTimeout(() => {
    speakSeq([{ who: WHO.caption, en: SCENE_FAREWELL.fall.en, zh: SCENE_FAREWELL.fall.zh }], () => {
      setStep(ENDING.FAREWELL);
      setPhase(null);
      setTimeout(() => playEpilogue(), 1800);
    });
  }, 2600);
}

// 叶子注入(2026-10-09 三叶拆):主场景 getter/地面函数/字幕 DOM 与状态机由主干供给。
// getter 惰性取值(mainScene/stageEl 在组件 init() 时才赋值);函数声明已提升,顶层调用安全。
initPrinceRig({
  scene: () => mainScene,
  groundH,
});
initEpilogue({
  get stageEl() {
    return stageEl;
  },
  getMode: () => mode,
  setMode: (m) => {
    mode = m;
  },
  setStep,
  hideAction,
  stopListening,
  wait,
});

// ===================== 主循环:按存档进度把玩家接上 =====================
function tick(dt) {
  if (mode === 'epilogue' || mode === 'book') return;
  const main = inMain();
  if (!main) {
    // 离开沙漠(进石门等):收起提示与水声,回来再接上
    if (listenEl.classList.contains('show')) listenEl.classList.remove('show');
    if (isWaterActive()) setWater(0, 0, 0);
    if (actionFn) hideAction();
    return;
  }
  if (step >= ENDING.FAREWELL) {
    crashPrinceVisible(false);
    sheepBoxVisible(false);
  }
  switch (mode) {
    case 'idle': {
      if (busy()) return;
      if (step === ENDING.NONE) {
        if (!endingReady(flags())) return;
        // 2026-10-04:书页六~八不再是临时画册页——328~330 已是 3D 星球,书页八是沙漠里的「地球之日」
        // (earth-day.js)。地球之日走完(earthDay)才接「今夜,去找井」。画册页仍可由 endingApi.openBook 翻看。
        if (!ctx.store.flag('earthDay')) return;
        setStep(ENDING.BOOK);
        setTimeout(() => startWell(false), 2400);
        mode = 'wait';
      } else if (step === ENDING.BOOK) startWell(true);
      else if (step === ENDING.WELL) startFarewell();
      else if (step === ENDING.FAREWELL) {
        if (!actionFn) showAction(ENDING_UI.again, playEpilogue);
      }
      return;
    }
    case 'well':
      if (!listenEl.classList.contains('show')) listenEl.classList.add('show');
      tickWell(dt);
      return;
    case 'farewell-wait':
      tickFarewellWait();
      return;
    default:
  }
}

export function createEndingJourney() {
  let acc = 0;
  return {
    name: 'endingJourney',
    layer: 'gameplay',
    phase: 'simulate',
    order: 10,
    init() {
      mainScene = ctx.scene.worldManager
        ? ctx.scene.worldManager.getWorld('main').scene
        : ctx.scene.s;
      buildDom();
      // 切换语言:行动卡与尾声字幕就地换成另一种语言(2026-10-03 测试反馈)
      const onLang = () => {
        if (actionFn && actionLabel) actionEl.querySelector('button').textContent = tt(actionLabel);
        const cap = stageEl && stageEl.querySelector('.cap');
        const se = getStageEntry();
        if (cap && se && cap.querySelector('.txt')) {
          cap.querySelector('.txt').textContent = tt(se);
          const o = tt(se) === se.en ? se.zh : se.en;
          if (cap.querySelector('.txt2')) cap.querySelector('.txt2').textContent = o || '';
        }
        const hint = stageEl && stageEl.querySelector('.hint');
        if (hint && hint.textContent)
          hint.textContent = tt({ en: 'tap to continue', zh: '点击继续' });
      };
      window.addEventListener('script:lang', onLang);
      unsub.push(() => window.removeEventListener('script:lang', onLang));
      step = readStep();
      if (step >= ENDING.DONE) mode = 'done';
      // E = 当前行动(捕获阶段先拿到,避免同一下 E 又去登机/开别的面板)
      const onKey = (e) => {
        if (!e || (e.key || '').toLowerCase() !== 'e' || e.repeat) return;
        if (!actionEl.classList.contains('show')) return;
        if (runAction()) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      };
      window.addEventListener('keydown', onKey, true);
      unsub.push(() => window.removeEventListener('keydown', onKey, true));
      ctx.scene.endingApi = {
        state: () => ({
          step,
          mode,
          princeMode: getPrinceMode(),
          dist: Math.round(distToWell() * 10) / 10,
          action: !!actionFn,
          still: Math.round(stillSec * 10) / 10,
        }),
        openBook: openTheBook,
        act: runAction,
        epilogue: playEpilogue,
        /** 探针/调试:跳到某一步(只前进) */
        skipTo(n) {
          setStep(n);
          mode = 'idle';
          hideAction();
        },
        wellPos: () => ({ ...WELL_POS }),
        wallPos: () => ({ ...WALL }),
      };
    },
    update(dt) {
      updatePrince(dt);
      if (waterMesh && mode === 'wake') {
        waterMesh.material.opacity = 0.75 + Math.sin(performance.now() * 0.004) * 0.15;
      }
      acc += dt;
      // 找井要逐帧采样静止;其余状态 10Hz 足够
      if (mode === 'well') {
        tick(dt);
        return;
      }
      if (acc < 0.1) return;
      tick(acc);
      acc = 0;
    },
    dispose() {
      speakGen++;
      clearTimeout(speakTimer);
      bellsOff();
      stopWater();
      unsub.forEach((f) => f && f());
      unsub = [];
      [styleEl, actionEl, listenEl, tintEl, veilEl, sketchEl, stageEl].forEach(
        (n) => n && n.remove()
      );
      stopStarfield();
      disposePrince();
      [wellGroup, wallMesh].forEach((o) => o && o.removeFromParent());
      wellGroup = wallMesh = waterMesh = null;
      ctx.scene.endingApi = null;
    },
  };
}
