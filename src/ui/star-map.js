// ui/star-map.js — 星图:点一颗星就飞过去(2026-10-04 主人建议)
// 菜单「✦ 星图」打开:夜空里一条虚线航路串起 地球 → B612 → 325 … 330,每颗星一幅手绘小插图
// (王冠、礼帽、酒瓶、账本、路灯、大书……)。走过的星全彩,下一站发光,还没到的星只剩剪影。
// 点亮着的星:图标放大、星图淡出,底下拉起星流过场(shared/warp-fx.js),到了再淡出——全程没有黑屏。
// 解锁规则与章节地图同源(shared/chapter-map-logic.mjs chapterStates),剧情只能往前一页一页走。
import { ctx } from '../ctx.js';
import { defineSystem } from '../core/system.js';
import { tt } from '../shared/story-text.mjs';
import { Z } from '../shared/z-layers.mjs';
import { chapterStates, canTravel } from '../shared/chapter-map-logic.mjs';
import { STAR_STOPS, stopStates, layoutFor } from '../shared/star-map-logic.mjs';
import { travel } from './world-travel.js';

const TEXT = {
  title: { en: "The little prince's sky", zh: '小王子的星空' },
  sub: {
    en: 'Tap a planet to fly there. Pages you have not reached yet stay in shadow.',
    zh: '点一颗星,就飞过去。还没读到的那几页,星星还在影子里。',
  },
  here: { en: 'You are here', zh: '你在这里' },
  next: { en: 'Next', zh: '下一站' },
  locked: { en: 'Not yet', zh: '还没到' },
  lockedToast: {
    en: 'That page is not written yet — the glowing planet is next.',
    zh: '那一页还没写到——先去发光的那颗星。',
  },
  hereToast: { en: 'You are already here.', zh: '你已经在这里了。' },
  busy: {
    en: 'Finish what is on screen first, then fly.',
    zh: '先把眼前这段对话或动作完成,再出发。',
  },
  saves: { en: 'Chapters & saves', zh: '章节与存档' },
  close: { en: 'Close', zh: '合上' },
};

/** 高光色:把底色往奶油白拉 55% */
function hi(hex) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c, w) => Math.round(c + (w - c) * 0.55);
  const r = mix((n >> 16) & 255, 255),
    g = mix((n >> 8) & 255, 246),
    b = mix(n & 255, 222);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}
// —— 手绘小插图(viewBox 0 0 100 100;星球在下半,标志物在上) ——
function planet(fill, shade, r = 28) {
  return `<defs><radialGradient id="g_${fill.slice(1)}" cx="38%" cy="32%" r="75%">
    <stop offset="0" stop-color="${hi(fill)}"/><stop offset=".45" stop-color="${fill}"/><stop offset="1" stop-color="${shade}"/></radialGradient></defs>
    <circle cx="50" cy="64" r="${r}" fill="url(#g_${fill.slice(1)})" stroke="#2b2218" stroke-width="1.6"/>`;
}
const ART = {
  earth:
    planet('#e8c98a', '#9c7a45', 30) +
    `<path d="M24 66 q10 -8 20 0 t20 0 t16 -2" fill="none" stroke="#b08a52" stroke-width="2"/>
     <path d="M30 78 q8 -6 16 0 t18 0" fill="none" stroke="#b08a52" stroke-width="1.6"/>
     <g transform="translate(50 30) rotate(-12)"><path d="M-16 0 h32 M-4 -2 l-3 -7 h6 z M10 0 l3 -5" stroke="#2b2218" stroke-width="2" fill="#c0392b" stroke-linejoin="round"/>
     <rect x="-6" y="-3" width="14" height="5" rx="2" fill="#c0392b" stroke="#2b2218" stroke-width="1.4"/></g>`,
  b612:
    planet('#d98a6a', '#8a4a34', 26) +
    `<path d="M30 44 l6 -10 l6 10 z" fill="#6b4a3a" stroke="#2b2218" stroke-width="1.4"/><path d="M33 36 q3 -6 6 -2" stroke="#e86a3a" stroke-width="1.6" fill="none"/>
     <path d="M58 44 l5 -8 l5 8 z" fill="#6b4a3a" stroke="#2b2218" stroke-width="1.4"/>
     <path d="M48 44 v-10" stroke="#4f6f3a" stroke-width="2"/><circle cx="48" cy="31" r="4" fill="#d04a5a" stroke="#2b2218" stroke-width="1.2"/>
     <path d="M41 44 v-9 a7 7 0 0 1 14 0 v9" fill="#dff2ff" fill-opacity=".35" stroke="#7aa0b8" stroke-width="1.2"/>`,
  king325:
    planet('#d9a441', '#8a6420') +
    `<path d="M34 36 l4 -14 l7 9 l5 -12 l5 12 l7 -9 l4 14 z" fill="#f2c94c" stroke="#2b2218" stroke-width="1.6" stroke-linejoin="round"/>
     <circle cx="50" cy="13" r="2.4" fill="#c0392b"/><circle cx="38" cy="21" r="2" fill="#c0392b"/><circle cx="62" cy="21" r="2" fill="#c0392b"/>`,
  king326:
    planet('#e8b8c8', '#9a6276') +
    `<g transform="rotate(-10 50 30)"><rect x="40" y="12" width="20" height="22" rx="2" fill="#3b3f4a" stroke="#2b2218" stroke-width="1.6"/>
     <rect x="31" y="32" width="38" height="5" rx="2.5" fill="#3b3f4a" stroke="#2b2218" stroke-width="1.6"/>
     <rect x="40" y="26" width="20" height="4" fill="#d04a5a"/></g>
     <path d="M70 18 l2 4 l4 1 l-4 2 l-2 4 l-2 -4 l-4 -2 l4 -1 z" fill="#ffe9a0"/>`,
  king327:
    planet('#9ab87a', '#55703f') +
    `<path d="M40 38 v-12 q0 -4 3 -6 v-6 h4 v6 q3 2 3 6 v12 z" fill="#3f6b3a" stroke="#2b2218" stroke-width="1.5"/>
     <g transform="rotate(28 60 34)"><path d="M55 40 v-11 q0 -3 2.5 -5 v-5 h4 v5 q2.5 2 2.5 5 v11 z" fill="#7a4a2a" stroke="#2b2218" stroke-width="1.5"/></g>`,
  king328:
    planet('#c8a86a', '#7f6638') +
    `<rect x="34" y="24" width="32" height="14" rx="1.5" fill="#f7efdc" stroke="#2b2218" stroke-width="1.5"/>
     <path d="M38 29 h16 M38 33 h22" stroke="#8c7a5c" stroke-width="1.4"/>
     <path d="M36 14 l1.6 3.2 l3.4 .5 l-2.5 2.3 l.6 3.4 l-3.1 -1.6 l-3.1 1.6 l.6 -3.4 l-2.5 -2.3 l3.4 -.5 z" fill="#ffe9a0"/>
     <path d="M58 9 l1.3 2.6 l2.8 .4 l-2 1.9 l.5 2.8 l-2.6 -1.3 l-2.6 1.3 l.5 -2.8 l-2 -1.9 l2.8 -.4 z" fill="#ffe9a0"/>
     <path d="M70 18 l1 2 l2.2 .3 l-1.6 1.5 l.4 2.2 l-2 -1 l-2 1 l.4 -2.2 l-1.6 -1.5 l2.2 -.3 z" fill="#ffe9a0"/>`,
  king329:
    planet('#a8c8e0', '#5d7f99', 22) +
    `<circle cx="50" cy="18" r="11" fill="#ffe9b0" opacity=".35"/>
     <path d="M50 46 v-24" stroke="#3a3a44" stroke-width="2.4"/><path d="M45 22 h10 l-2 -7 h-6 z" fill="#ffe9b0" stroke="#2b2218" stroke-width="1.4"/>
     <path d="M47 15 l3 -4 l3 4" fill="none" stroke="#2b2218" stroke-width="1.4"/>`,
  king330:
    planet('#b08a64', '#6a4e34', 30) +
    `<path d="M30 34 q10 -6 20 0 q10 -6 20 0 v-16 q-10 -6 -20 0 q-10 -6 -20 0 z" fill="#f7efdc" stroke="#2b2218" stroke-width="1.5" stroke-linejoin="round"/>
     <path d="M50 18 v16" stroke="#2b2218" stroke-width="1.2"/><path d="M35 22 h10 M35 26 h10 M55 22 h10 M55 26 h8" stroke="#8c7a5c" stroke-width="1.2"/>
     <circle cx="74" cy="22" r="6" fill="#7aa8c8" stroke="#2b2218" stroke-width="1.3"/><path d="M68 22 h12 M74 16 q-4 6 0 12" stroke="#2b2218" stroke-width=".9" fill="none"/>`,
};

const STYLE = `
#starMap{position:fixed;inset:0;z-index:${Z.starMap};display:none;overflow:auto;-webkit-overflow-scrolling:touch;
 background:radial-gradient(ellipse at 50% 30%,#1d2a48 0%,#0c1222 65%,#070a14 100%);color:#f1e6c8;
 font-family:"Kaiti SC","STKaiti","KaiTi",Georgia,serif;transition:opacity .6s ease,transform .7s cubic-bezier(.5,0,.75,0)}
#starMap.show{display:block}
#starMap.leaving{opacity:0}
#starMap .sm-dust{position:fixed;inset:0;pointer-events:none;background-image:
 radial-gradient(1.4px 1.4px at 7% 12%,#fff9 50%,transparent 51%),radial-gradient(1px 1px at 18% 44%,#fff6 50%,transparent 51%),
 radial-gradient(1.6px 1.6px at 33% 9%,#ffeab0 50%,transparent 51%),radial-gradient(1px 1px at 47% 52%,#fff5 50%,transparent 51%),
 radial-gradient(1.2px 1.2px at 61% 18%,#fff8 50%,transparent 51%),radial-gradient(1px 1px at 72% 76%,#fff6 50%,transparent 51%),
 radial-gradient(1.8px 1.8px at 86% 14%,#ffeab0 50%,transparent 51%),radial-gradient(1px 1px at 93% 46%,#fff5 50%,transparent 51%),
 radial-gradient(1.2px 1.2px at 12% 88%,#fff7 50%,transparent 51%),radial-gradient(1px 1px at 52% 92%,#fff5 50%,transparent 51%)}
#starMap .sm-head{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;
 padding:18px 22px 6px;background:linear-gradient(#0c1222f0,#0c122200)}
#starMap h2{margin:0;font-size:26px;letter-spacing:3px;font-weight:normal;color:#f4e8c8}
#starMap .sm-sub{margin:6px 0 0;font-size:14px;line-height:1.6;color:#b9a77f;max-width:520px}
#starMap button{font:inherit;cursor:pointer}
#starMap .sm-x{flex:none;color:#e8c98a;background:none;border:1px solid #e8c98a66;border-radius:22px;padding:8px 16px;min-height:42px}
#starMap .sm-sky{position:relative;margin:0 auto;width:min(1180px,100%);height:calc(100dvh - 150px);min-height:420px}
#starMap .sm-path{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
#starMap .sm-stop{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:2px;
 background:none;border:0;color:inherit;padding:4px;width:clamp(92px,11vw,132px)}
#starMap .sm-stop svg{width:100%;height:auto;overflow:visible;transition:transform .35s ease,filter .35s ease}
#starMap .sm-stop:hover svg,#starMap .sm-stop:focus-visible svg{transform:scale(1.08) translateY(-3px)}
#starMap .sm-stop[data-state="locked"] svg{filter:grayscale(1) brightness(.45) contrast(.8)}
#starMap .sm-stop[data-state="locked"]{opacity:.62;cursor:default}
#starMap .sm-stop[data-state="current"] svg{filter:drop-shadow(0 0 14px #ffd88acc)}
#starMap .sm-stop[data-state="current"] svg{animation:smPulse 2.4s ease-in-out infinite}
@keyframes smPulse{0%,100%{filter:drop-shadow(0 0 8px #ffd88a88)}50%{filter:drop-shadow(0 0 20px #ffd88aee)}}
#starMap .sm-n{font:13px/1.2 Georgia,serif;letter-spacing:2px;color:#e8c98a}
#starMap .sm-t{font-size:15px;line-height:1.3;text-align:center;color:#f1e6c8}
#starMap .sm-s{font-size:11.5px;letter-spacing:1px;color:#b9a77f;min-height:1.2em}
#starMap .sm-stop[data-here] .sm-s{color:#ffd88a}
#starMap .sm-stop[data-here]::before{content:"";position:absolute;left:50%;top:34%;width:78%;aspect-ratio:1;transform:translate(-50%,-50%);
 border:1.5px dashed #ffd88a99;border-radius:50%;animation:smSpin 18s linear infinite;pointer-events:none}
@keyframes smSpin{to{transform:translate(-50%,-50%) rotate(360deg)}}
#starMap .sm-stop.fly svg{transform:scale(1.6)!important;transition:transform .7s cubic-bezier(.5,0,.75,0)}
#starMap .sm-stop.shake{animation:smShake .4s}
@keyframes smShake{25%{margin-left:-6px}75%{margin-left:6px}}
#starMap .sm-foot{text-align:center;padding:4px 0 26px}
#starMap .sm-saves{color:#b9a77f;background:none;border:0;text-decoration:underline;text-underline-offset:4px;font-size:14px;min-height:40px}
@media (max-aspect-ratio:1/1){
 #starMap .sm-sky{height:auto;min-height:${STAR_STOPS.length * 132}px;width:100%}
 #starMap .sm-stop{width:min(32vw,128px)}
}
@media (max-width:600px){#starMap h2{font-size:20px;letter-spacing:2px}#starMap .sm-sub{font-size:13px}#starMap .sm-head{padding:14px 14px 4px}}
`;

export function createStarMap() {
  let root,
    style,
    sky,
    open_ = false;
  function el(tag, cls, text, parent) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function flags() {
    return {
      scene2: !!ctx.store.flag('scene2'),
      page1: !!ctx.store.flag('page1'),
      chapter: ctx.store.num('planetsChapter'),
      endingStep: ctx.store.num('endingStep'),
      earthDay: !!ctx.store.flag('earthDay'),
    };
  }
  function render() {
    root.replaceChildren();
    el('div', 'sm-dust', null, root);
    const head = el('div', 'sm-head', null, root);
    const tx = el('div', '', null, head);
    el('h2', '', tt(TEXT.title), tx);
    el('p', 'sm-sub', tt(TEXT.sub), tx);
    const x = el('button', 'sm-x', tt(TEXT.close), head);
    x.type = 'button';
    x.onclick = () => api.close();
    sky = el('div', 'sm-sky', null, root);
    const portrait = window.innerWidth <= window.innerHeight;
    const pts = layoutFor(portrait);
    // 航路虚线(穿过每颗星的平滑折线)
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'sm-path');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    const path = document.createElementNS(NS, 'path');
    let d = 'M' + pts[0][0] + ' ' + pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1],
        [x1, y1] = pts[i];
      const mx = (x0 + x1) / 2;
      d += portrait
        ? ` C${x0} ${(y0 + y1) / 2} ${x1} ${(y0 + y1) / 2} ${x1} ${y1}`
        : ` C${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`;
    }
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#e8c98a');
    path.setAttribute('stroke-opacity', '.45');
    path.setAttribute('stroke-width', '1.6');
    path.setAttribute('stroke-dasharray', '2 7');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(path);
    sky.appendChild(svg);
    const states = stopStates(chapterStates(flags()));
    const world = ctx.scene.activeWorld || 'main';
    STAR_STOPS.forEach((s, i) => {
      const st = states[s.id] || 'locked';
      const b = el('button', 'sm-stop', null, sky);
      b.type = 'button';
      b.dataset.stop = s.id;
      b.dataset.state = st;
      b.style.left = pts[i][0] + '%';
      b.style.top = pts[i][1] + '%';
      if (s.world === world) b.dataset.here = '1';
      b.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">${ART[s.id]}</svg>`;
      el('span', 'sm-n', s.num || '', b);
      el('span', 'sm-t', st === 'locked' ? '· · ·' : tt(s.title), b);
      el(
        'span',
        'sm-s',
        s.world === world
          ? tt(TEXT.here)
          : st === 'current'
            ? tt(TEXT.next)
            : st === 'locked'
              ? tt(TEXT.locked)
              : '',
        b
      );
      b.setAttribute(
        'aria-label',
        (s.num ? s.num + ' ' : '') + (st === 'locked' ? tt(TEXT.locked) : tt(s.title))
      );
      b.onclick = () => pick(s, st, b);
    });
    const foot = el('div', 'sm-foot', null, root);
    const saves = el('button', 'sm-saves', tt(TEXT.saves), foot);
    saves.type = 'button';
    saves.onclick = () => {
      api.close();
      ctx.ui.chapterMap?.open();
    };
    // 竖屏:把「你在这里」滚到视野中间
    if (portrait)
      requestAnimationFrame(() => {
        const here =
          sky.querySelector('[data-here]') || sky.querySelector('[data-state="current"]');
        here && here.scrollIntoView({ block: 'center' });
      });
  }
  function pick(s, st, btn) {
    if (!canTravel(st)) {
      btn.classList.remove('shake');
      void btn.offsetWidth;
      btn.classList.add('shake');
      ctx.ui.modeToast?.(tt(TEXT.lockedToast), 3200);
      return;
    }
    const world = ctx.scene.activeWorld || 'main';
    if (s.world === world) {
      api.close();
      ctx.ui.modeToast?.(tt(TEXT.hereToast), 2200);
      return;
    }
    if (ctx.ui.dialogOpen?.() || ctx.scene.worldManager?.transitioning) {
      ctx.ui.modeToast?.(tt(TEXT.busy), 2600);
      return;
    }
    // 飞进去:图标放大,整张星图朝它推近并淡出;星流在底下拉起(travel 内 holdWarp)
    btn.classList.add('fly');
    const r = btn.getBoundingClientRect();
    root.style.transformOrigin = r.left + r.width / 2 + 'px ' + (r.top + r.height / 3) + 'px';
    root.style.transform = 'scale(1.9)';
    root.classList.add('leaving');
    travel(s.world).then((ok) => {
      if (ok === false) ctx.ui.modeToast?.(tt(TEXT.busy), 2600);
    });
    setTimeout(() => api.close(), 720);
  }
  const api = {
    open() {
      if (open_) return;
      open_ = true;
      root.classList.remove('leaving');
      root.style.transform = '';
      render();
      root.classList.add('show');
      document.body.dataset.starMap = '1';
    },
    close() {
      if (!open_) return;
      open_ = false;
      root.classList.remove('show', 'leaving');
      root.style.transform = '';
      delete document.body.dataset.starMap;
    },
    isOpen: () => open_,
  };
  return defineSystem({
    name: 'starMap',
    layer: 'presentation',
    phase: 'ui',
    order: 14,
    init() {
      style = el('style', '', STYLE, document.head);
      style.id = 'starMapCss';
      root = el('div', '', null, document.body);
      root.id = 'starMap';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      const onKey = (e) => {
        if (open_ && e.key === 'Escape') api.close();
      };
      window.addEventListener('keydown', onKey);
      window.addEventListener('script:lang', () => open_ && render());
      window.addEventListener('resize', () => open_ && render());
      api._off = () => window.removeEventListener('keydown', onKey);
      ctx.ui.starMap = api;
    },
    dispose() {
      api._off && api._off();
      root?.remove();
      style?.remove();
      ctx.ui.starMap = null;
    },
  });
}
