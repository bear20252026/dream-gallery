// ui/voyage.js — 旅途卡:一夜接一夜(2026-10-04 主人反馈「换星球时衔接很乱,一点都不顺」)
// 每段回忆结束(家的回忆 / 每颗星拾起星屑)后,翻出一张夜色书页卡:
//   沙漠的早晨 · 飞行员修着发动机 / 第几夜 / 书页几 · 谁 / 原著里的一句
//   [继续]  在这里再待一会儿
// 点「继续」:卡片保持不透明,底下完成世界切换(沙漠→B612→下一颗星,或回沙漠过地球的一天),
// 到了再淡出——玩家看到的是「翻一页」,不再是黑幕、回 B612、找按钮、再黑幕。
// 「再待一会儿」:先不走;星球底部导航会留「下一夜 →」,随时接上(planets.js 调 open())。
// 下一站算法在 shared/voyage-logic.mjs(单测钉死);台词在 shared/story-text-late.mjs VOYAGE。
import { ctx } from '../ctx.js';
import { defineSystem } from '../core/system.js';
import { tt } from '../shared/story-text.mjs';
import { VOYAGE } from '../shared/story-text-late.mjs';
import { Z } from '../shared/z-layers.mjs';
import { nextStop, worldOf } from '../shared/voyage-logic.mjs';
import { travel } from './world-travel.js';

const CSS = `
#voyage{position:fixed;inset:0;z-index:${Z.voyage};display:flex;align-items:center;justify-content:center;
 background:radial-gradient(ellipse at 50% 35%,#1d2a48 0%,#0c1222 70%,#070a14 100%);opacity:0;transition:opacity 1.1s ease;
 padding:24px;box-sizing:border-box;color:#f1e6c8;font-family:"Kaiti SC","STKaiti","KaiTi",Georgia,serif;text-align:center}
#voyage.show{opacity:1}
#voyage .vy-stars{position:absolute;inset:0;pointer-events:none;background-image:
 radial-gradient(1.5px 1.5px at 12% 22%,#fff8 50%,transparent 51%),radial-gradient(1px 1px at 28% 68%,#fff6 50%,transparent 51%),
 radial-gradient(1.5px 1.5px at 46% 14%,#fffa 50%,transparent 51%),radial-gradient(1px 1px at 63% 82%,#fff7 50%,transparent 51%),
 radial-gradient(2px 2px at 78% 30%,#ffe9b0 50%,transparent 51%),radial-gradient(1px 1px at 88% 60%,#fff6 50%,transparent 51%),
 radial-gradient(1px 1px at 8% 86%,#fff5 50%,transparent 51%),radial-gradient(1.5px 1.5px at 54% 48%,#fff4 50%,transparent 51%)}
#voyage .vy-card{position:relative;max-width:560px;width:100%}
#voyage .vy-kicker{font:12px/1.6 Georgia,serif;letter-spacing:2px;color:#b9a77f;text-transform:uppercase}
#voyage .vy-night{margin-top:22px;font-size:15px;letter-spacing:4px;color:#e8c98a}
#voyage .vy-title{margin:8px 0 0;font-size:28px;letter-spacing:3px;font-weight:normal}
#voyage .vy-rule{width:60px;margin:20px auto;border-top:1px solid #e8c98a66}
#voyage .vy-line{font-size:17px;line-height:1.9;white-space:pre-line;color:#efe4c9;font-style:italic}
#voyage .vy-row{margin-top:30px;display:flex;flex-direction:column;align-items:center;gap:12px;min-height:96px}
#voyage button{font:inherit;cursor:pointer;border-radius:24px;min-height:46px}
#voyage .vy-go{padding:10px 34px;font-size:17px;letter-spacing:3px;color:#2a2116;background:#e8c98a;border:0;box-shadow:0 0 24px #e8c98a55}
#voyage .vy-stay{padding:6px 14px;font-size:14px;color:#b9a77f;background:none;border:0;text-decoration:underline;text-underline-offset:4px}
#voyage .vy-travel{font-size:14px;letter-spacing:3px;color:#b9a77f}
@media(max-width:600px){#voyage .vy-title{font-size:23px}#voyage .vy-line{font-size:15.5px}}
`;

const NAV_HINT = {
  en: 'Whenever you are ready, tap “Travel on” at the bottom of the screen.',
  zh: '准备好了,点屏幕下方的「继续旅途」。',
};
const STUCK = {
  en: 'Could not travel just now — try the button at the bottom.',
  zh: '这会儿没走成——用屏幕下方的按钮再试一次。',
};

let root = null,
  offerTimer = null,
  justArrived = null,
  busy = false;

function flags() {
  return {
    page1: !!ctx.store.flag('page1'),
    chapter: ctx.store.num('planetsChapter'),
    earthDone: !!ctx.store.flag('earthDay') || ctx.store.num('endingStep') > 0,
  };
}
function blocked() {
  return (
    !!ctx.ui.dialogOpen?.() ||
    !!ctx.scene.worldManager?.transitioning ||
    !!document.getElementById('scene2Board') ||
    !!document.querySelector('#endStage.show')
  );
}
function el(tag, cls, text, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}
function close(fadeMs = 1100) {
  if (!root) return;
  const r = root;
  root = null;
  delete document.body.dataset.voyage;
  r.classList.remove('show');
  setTimeout(() => r.remove(), fadeMs);
}
async function go(stop, row) {
  if (busy) return;
  busy = true;
  row.replaceChildren();
  el('div', 'vy-travel', tt(VOYAGE.ui.travelling), row);
  const world = worldOf(stop);
  let ok = false;
  for (let i = 0; i < 8 && !ok; i++) {
    if (i) await new Promise((r) => setTimeout(r, 500));
    try {
      ok = (await travel(world)) !== false;
    } catch (e) {
      ok = false;
    }
  }
  busy = false;
  if (!ok) {
    close(400);
    ctx.ui.modeToast?.(tt(STUCK), 5000);
    return;
  }
  justArrived = world;
  if (stop === 'earth') ctx.events?.emit?.('story:earthday');
  setTimeout(() => close(), 900);
}
/** 立刻翻出下一站的卡(没有下一站就什么也不做) */
function open(stopArg) {
  const stop = stopArg || nextStop(flags());
  if (!stop || root || !VOYAGE[stop]) return false;
  clearTimeout(offerTimer);
  const v = VOYAGE[stop];
  root = el('div', '', null, document.body);
  root.id = 'voyage';
  root.dataset.stop = stop;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  document.body.dataset.voyage = stop;
  el('div', 'vy-stars', null, root);
  const card = el('div', 'vy-card', null, root);
  el('div', 'vy-kicker', tt(VOYAGE.ui.kicker), card);
  el('div', 'vy-night', tt(v.night), card);
  el('h2', 'vy-title', tt(v.title), card);
  el('div', 'vy-rule', null, card);
  el('div', 'vy-line', tt(v.line), card);
  const row = el('div', 'vy-row', null, card);
  const goBtn = el('button', 'vy-go', tt(VOYAGE.ui.go), row);
  goBtn.type = 'button';
  goBtn.onclick = () => go(stop, row);
  const stay = el('button', 'vy-stay', tt(VOYAGE.ui.stay), row);
  stay.type = 'button';
  stay.onclick = () => {
    close(700);
    ctx.ui.modeToast?.(tt(NAV_HINT), 6000);
  };
  requestAnimationFrame(() => requestAnimationFrame(() => root && root.classList.add('show')));
  setTimeout(() => goBtn.focus?.(), 400);
  return true;
}
/** 回忆结束时调用:等眼前的对白/切换结束,再隔 delayMs 翻卡;玩家先走开(换了世界)就作罢 */
function offer(delayMs = 2600, stopArg) {
  clearTimeout(offerTimer);
  const fromWorld = ctx.scene.activeWorld || 'main';
  const started = Date.now();
  const poll = () => {
    if ((ctx.scene.activeWorld || 'main') !== fromWorld) return;
    if (Date.now() - started < delayMs || blocked()) {
      offerTimer = setTimeout(poll, 300);
      return;
    }
    open(stopArg);
  };
  offerTimer = setTimeout(poll, 300);
}

export function createVoyage() {
  let style;
  return defineSystem({
    name: 'voyage',
    layer: 'presentation',
    phase: 'ui',
    order: 13,
    init() {
      style = el('style', '', CSS, document.head);
      style.id = 'voyageCss';
      ctx.ui.voyage = {
        offer,
        open,
        next: () => nextStop(flags()),
        isOpen: () => !!root,
        /** 刚经旅途卡到达该世界?(一次性:各场开场的「过渡卡」见到 true 就不再重复弹) */
        arrived(world) {
          if (justArrived && justArrived === world) {
            justArrived = null;
            return true;
          }
          return false;
        },
      };
    },
    dispose() {
      clearTimeout(offerTimer);
      close(0);
      style?.remove();
      ctx.ui.voyage = null;
    },
  });
}
