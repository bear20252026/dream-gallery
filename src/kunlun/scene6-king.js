// scene6-king.js — B612 剧本第 6 场·书页四·325 国王(2026-09-20,情节阶段一)
// 流程:进 king325(书页一二三已完成)→ 导语 → 国王台词链 chain1(求日落)→
//   日落敕令演出(金光收束,国王行使"等时机成熟"的敕令)→ chain2(审判自己/
//   老耗子/封大使/退场+羊箱吐槽)→ 星屑拾取(3m)→ 章节完成 planetsChapter=1,
//   门环换色指向 326。台词单一源:story-text SCENE5。章节推进:ctx.kunlun.setChapter
//   (planets.js 注册,同步 store + 门环)。多人房间冻结;旧灵蕴线休眠不受影响。
import { ctx } from '../ctx.js';
import { SCENE5, tt, whoSpk } from '../shared/story-text.mjs';
import { PLANETS } from '../shared/planet-logic.mjs';

let arrivalDone = false; // 本次进 325 的入梦链已启动
let sceneDone = false;   // 全链+拾星完成(章节已推进)
let pickupArmed = false; // 台词全部收束,星屑可拾
let starTaken = false;   // 星屑已拾(幂等守卫)
let speakTimer = null;   // 心跳守护句柄

// —— 台词队列:lock 互斥 + spent 幂等 + 心跳守护(与 scene3-memory 同规) ——
function speakSeq(seq, i, done) {
  if (i >= seq.length) { if (done) done(); return; }
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
  speakTimer = setTimeout(function () {
    if (!ctx.dialogOpen || !ctx.dialogOpen()) finish();
  }, Math.max(4600, ((item.en || '').length * 65) | 0) + 2600);
}

// —— 日落敕令演出:金光漫起又退去(国王"等时机成熟"后,天边果然烧起来) ——
function sunsetShow(done) {
  const veil = document.createElement('div');
  veil.style.cssText =
    'position:fixed;inset:0;z-index:520;pointer-events:none;' +
    'background:radial-gradient(120% 90% at 50% 100%, rgba(255,140,50,.55), rgba(255,90,40,.28) 45%, rgba(40,20,60,.18));' +
    'opacity:0;transition:opacity 1.4s ease';
  document.body.appendChild(veil);
  requestAnimationFrame(function () { veil.style.opacity = '1'; });
  setTimeout(function () { veil.style.opacity = '0'; }, 2600);
  setTimeout(function () {
    veil.remove();
    try { ctx.ui.kunlunSpeak && ctx.kunlunSpeak('七点四十分。天边烧起来了。国王抱着手臂,纹丝不动。'); } catch (e) {}
    done();
  }, 4400);
}

// —— 星屑拾取:3m 判定(planets.js 的 hideSproutMote 负责藏网格) ——
function tryPickup(pl, onPick) {
  const dx = pl.p.x - 0,
    dz = pl.p.z - 2.6;
  if (dx * dx + dz * dz < 9) {
    starTaken = true;
    ctx.kunlun.hideSproutMote && ctx.kunlun.hideSproutMote();
    try { ctx.ui.modeToast && ctx.ui.modeToast('拾获星屑 · 国王之星'); } catch (e) {}
    onPick();
  }
}

let prevWorld = '';
ctx.onTick(function scene6Tick() {
  const active = ctx.scene.activeWorld || '';
  // 离开 325:复位入梦标记——同会话内再进可重新触发(2026-09-20「没对话」修复②)
  if (prevWorld === 'king325' && active !== 'king325' && !sceneDone) {
    arrivalDone = false;
    pickupArmed = false;
  }
  prevWorld = active;
  if (active !== 'king325') return;
  if (sceneDone) return;
  // 章节已推进过(重访):纯观赏。?storyreset 会把章节清回 0,可完整重走
  if (ctx.store.num('planetsChapter') !== 0) { sceneDone = true; return; }

  if (pickupArmed) {
    if (!starTaken) tryPickup(ctx.player.pl, function () {
      ctx.kunlun.setChapter && ctx.kunlun.setChapter(1);
      sceneDone = true;
      try { ctx.ui.modeToast && ctx.ui.modeToast('书页四,写完了。门环换了颜色。'); } catch (e) {}
    });
    return;
  }

  if (arrivalDone) return;
  arrivalDone = true;
  setTimeout(function () {
    // 入梦导语(planet-logic 为 325 写好的星球导语,首次接线)
    const cfg = PLANETS.find(function (p) { return p.num === '325'; });
    try { ctx.ui.kunlunSpeak && ctx.kunlunSpeak(tt({ en: 'The King', zh: cfg.tts })); } catch (e) {}
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
            try { ctx.ui.modeToast && ctx.ui.modeToast('岛上有一颗星屑亮了起来——去拾起它'); } catch (e) {}
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
      stage: window.__scene6 && window.__scene6.stage,
    };
  },
});
