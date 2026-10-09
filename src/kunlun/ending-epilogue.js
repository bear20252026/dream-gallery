// ending-epilogue.js — 尾声·六年后:全屏星空 + 字幕 + 是/否一问 + 落版(2026-10-09 切出,逐字迁移)
// 纯呈现层:演出时序与存档推进经 initEpilogue(controller) 注入 ——
//   controller = { stageEl(getter), getMode, setMode, setStep, hideAction, stopListening, wait }
// trunk 的 onLang 经 getStageEntry() 读当前字幕条目就地换语言;dispose 经 stopStarfield() 收星空。
import { ctx } from '../ctx.js';
import { tt, scriptLang } from '../shared/story-text.mjs';
import { sketchSvg } from '../ui/book-pages.js';
import { epilogueKeepsake, keepsakeIds } from '../shared/portfolio-logic.mjs';
import { shiftDayTo } from '../scene/time-shift.js';
import { SCENE_EPILOGUE, ENDING_UI } from '../shared/story-text.mjs';
import { HILL_TEXT, hillUrl } from '../shared/ending-logic.mjs';
import { bellsOn, bellsOff } from './ending-audio.js';

let CTL = null;
let starRaf = 0;
let stageEntry = null; // 尾声当前字幕的双语条目(trunk 的 script:lang 换字要读)

export function initEpilogue(controller) {
  CTL = controller;
}
export function getStageEntry() {
  return stageEntry;
}
export function stopStarfield() {
  cancelAnimationFrame(starRaf);
}
function starfield(canvas) {
  const cx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let W = 0,
    H = 0,
    stars = [];
  function resize() {
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({ length: Math.round((W * H) / 2600) }, () => ({
      x: Math.random() * W,
      y: Math.random() * H * 0.92,
      r: Math.random() * 1.3 + 0.3,
      p: Math.random() * Math.PI * 2,
      s: 0.6 + Math.random() * 1.8,
    }));
  }
  resize();
  const onResize = () => resize();
  window.addEventListener('resize', onResize);
  let laughUntil = 0;
  const draw = (now) => {
    cx.clearRect(0, 0, W, H);
    const t = now / 1000;
    const laugh = now < laughUntil ? 1 : 0;
    for (const s of stars) {
      const tw = 0.55 + 0.45 * Math.sin(t * s.s + s.p) * (laugh ? 1.6 : 1);
      cx.globalAlpha = Math.max(0.08, Math.min(1, tw));
      cx.fillStyle = '#fff6dc';
      cx.beginPath();
      cx.arc(s.x, s.y, s.r * (laugh ? 1.25 : 1), 0, Math.PI * 2);
      cx.fill();
    }
    cx.globalAlpha = 1;
    starRaf = requestAnimationFrame(draw);
  };
  starRaf = requestAnimationFrame(draw);
  return {
    laugh(ms) {
      laughUntil = performance.now() + (ms || 4000);
    },
    stop() {
      cancelAnimationFrame(starRaf);
      window.removeEventListener('resize', onResize);
    },
  };
}
function stageCaption(entry, opts = {}) {
  return new Promise((resolve) => {
    const stageEl = CTL.stageEl;
    const cap = stageEl.querySelector('.cap');
    const other = (e) => (tt(e) === e.en ? e.zh : e.en);
    stageEntry = entry;
    cap.innerHTML = `${opts.kick ? `<div class="kick">${esc(tt(opts.kick))}</div>` : ''}${
      opts.sketch ? `<div class="sk">${sketchSvg(opts.sketch)}</div>` : ''
    }${opts.own ? '<div class="own"></div>' : ''}${
      opts.own ? `<div class="own-note">${esc(tt(opts.own.note))}</div>` : ''
    }<div class="txt">${esc(tt(entry))}</div><div class="txt2">${esc(other(entry) || '')}</div><div class="btns"></div>`;
    if (opts.own) {
      // The player's own drawing; if it cannot be drawn, drop the frame and its note rather than show an empty one.
      const frame = cap.querySelector('.own');
      const thumb = ctx.ui.portfolio?.thumb?.(opts.own.id);
      if (thumb) frame.appendChild(thumb);
      else {
        frame.remove();
        cap.querySelector('.own-note')?.remove();
      }
    }
    requestAnimationFrame(() => {
      cap.querySelector('.txt').classList.add('on');
      setTimeout(() => cap.querySelector('.txt2').classList.add('on'), 700);
    });
    const btns = cap.querySelector('.btns');
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      stageEl.onclick = null;
      document.removeEventListener('keydown', onKey, true);
      clearTimeout(auto);
      const t = cap.querySelector('.txt'),
        t2 = cap.querySelector('.txt2');
      t.classList.remove('on');
      t2.classList.remove('on');
      btns.classList.remove('on');
      setTimeout(() => resolve(v), 1100);
    };
    const onKey = (e) => {
      const k = (e.key || '').toLowerCase();
      if (!opts.choices && (k === ' ' || k === 'enter' || k === 'e' || k === 'arrowright')) {
        e.preventDefault();
        e.stopPropagation();
        finish();
      }
    };
    let auto = 0;
    if (opts.choices) {
      opts.choices.forEach((c) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = tt(c.label);
        b.onclick = (ev) => {
          ev.stopPropagation();
          finish(c.value);
        };
        btns.appendChild(b);
      });
      setTimeout(() => btns.classList.add('on'), 1600);
    } else {
      // 点任意处继续;长句给足阅读时间后自动前进
      setTimeout(() => {
        stageEl.onclick = () => finish();
        document.addEventListener('keydown', onKey, true);
      }, 1200);
      auto = setTimeout(
        () => finish(),
        opts.hold || Math.max(6500, (entry.en || '').length * 75 + 3500)
      );
    }
  });
}
export async function playEpilogue() {
  const stageEl = CTL.stageEl;
  if (CTL.getMode() === 'epilogue') return;
  CTL.setMode('epilogue');
  CTL.hideAction();
  CTL.stopListening();
  bellsOff();
  stageEl.innerHTML = '<canvas></canvas><div class="cap"></div><div class="hint"></div>';
  stageEl.querySelector('.hint').textContent = tt({ en: 'tap to continue', zh: '点击继续' });
  stageEl.classList.add('show');
  await CTL.wait(40);
  stageEl.classList.add('in');
  const sky = starfield(stageEl.querySelector('canvas'));
  await CTL.wait(2200);
  const E = SCENE_EPILOGUE;
  await stageCaption(E.captions[0], { kick: ENDING_UI.sixYears, hold: 5200 });
  sky.laugh(5000);
  bellsOn(900, 0.02);
  await stageCaption(E.captions[1]);
  bellsOff();
  await stageCaption(E.captions[2], { sketch: 'muzzle' });
  const keepsake = epilogueKeepsake(ctx.store.json('portfolio', {}));
  const ans = await stageCaption(E.question, {
    own: keepsake,
    choices: [
      { label: ENDING_UI.answerNo, value: 'no' },
      { label: ENDING_UI.answerYes, value: 'yes' },
    ],
  });
  try {
    ctx.store.setStr('endingAnswer', ans === 'yes' ? 'yes' : 'no');
  } catch (e) {}
  if (ans === 'yes') {
    await stageCaption(E.yes, { hold: 6500 });
  } else {
    sky.laugh(6000);
    bellsOn(700, 0.022);
    await stageCaption(E.no, { hold: 6500 });
    bellsOff();
  }
  await stageCaption(E.close);
  await stageCaption(E.captions[3]);
  CTL.setStep(8 /* ENDING.DONE */);
  await stageCaption(E.dedication, { hold: 6000 });
  // 落版
  const cap = stageEl.querySelector('.cap');
  stageEl.querySelector('.hint').textContent = '';
  cap.innerHTML = `<div class="kick">B612</div><div class="end txt on">${esc(tt(ENDING_UI.theEnd))}</div>
    <div class="btns on"><button type="button" class="hill" data-e="hill">${esc(tt(HILL_TEXT.go))}</button>
    <button type="button" data-e="again">${esc(tt(ENDING_UI.again))}</button>
    <button type="button" data-e="share">${esc(tt(ENDING_UI.share))}</button>
    <button type="button" data-e="portfolio">${esc(tt({ zh: '翻开我的作品集', en: 'Open my portfolio' }))}</button></div>
    <div class="txt on pf-note">${esc(tt(HILL_TEXT.note))}</div>
    <div class="txt on pf-note">${esc(
      tt({
        zh: '每一幅未完成的画,都在等一个人。你画给他的画,收在作品集里。',
        en: 'Every unfinished drawing waits for someone. The drawings you made for him are in your portfolio.',
      })
    )}</div>`;
  sky.laugh(8000);
  // Keepsakes: small copies of the drawings the player actually made, each opening the portfolio.
  const kept = keepsakeIds(ctx.store.json('portfolio', {}));
  if (kept.length) {
    const strip = document.createElement('div');
    strip.className = 'pf-strip';
    for (const id of kept) {
      const thumb = ctx.ui.portfolio?.thumb?.(id);
      if (!thumb) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.appendChild(thumb);
      b.onclick = (ev) => {
        ev.stopPropagation();
        ctx.ui.portfolio?.open();
      };
      strip.appendChild(b);
    }
    if (strip.childElementCount) cap.querySelector('.btns').before(strip);
  }
  /** @type {HTMLElement} */ (cap.querySelector('[data-e="portfolio"]')).onclick = (ev) => {
    ev.stopPropagation();
    ctx.ui.portfolio?.open();
  };
  cap.querySelector('[data-e="hill"]').onclick = (ev) => {
    ev.stopPropagation();
    goToHill();
  };
  cap.querySelector('[data-e="share"]').onclick = (ev) => {
    ev.stopPropagation();
    saveStarCard();
  };
  cap.querySelector('[data-e="again"]').onclick = (ev) => {
    ev.stopPropagation();
    stageEl.classList.remove('in');
    setTimeout(() => {
      sky.stop();
      stageEl.classList.remove('show');
      stageEl.innerHTML = '';
      CTL.setMode('done');
      shiftDayTo(22.5, 300); // 回到沙漠的夜里,抬头就是星星
    }, 2000);
  };
}
/** 故事之后:淡出,走向远方山丘(独立页面 /hill/,带上剧情语言) */
export function goToHill() {
  CTL.stageEl.classList.remove('in');
  setTimeout(() => {
    location.href = hillUrl(scriptLang());
  }, 1600);
}
export function saveStarCard() {
  try {
    const c = document.createElement('canvas');
    c.width = 1080;
    c.height = 1350;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(540, 1500, 100, 540, 900, 1500);
    grad.addColorStop(0, '#1d2448');
    grad.addColorStop(0.55, '#0b0d1c');
    grad.addColorStop(1, '#04050b');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1080, 1350);
    for (let i = 0; i < 520; i++) {
      g.globalAlpha = 0.2 + Math.random() * 0.8;
      g.fillStyle = '#fff6dc';
      g.beginPath();
      g.arc(Math.random() * 1080, Math.random() * 1100, Math.random() * 1.8 + 0.4, 0, Math.PI * 2);
      g.fill();
    }
    // 他的那一颗
    g.globalAlpha = 1;
    const sx = 700,
      sy = 360;
    const halo = g.createRadialGradient(sx, sy, 2, sx, sy, 90);
    halo.addColorStop(0, 'rgba(255,226,150,.95)');
    halo.addColorStop(1, 'rgba(255,226,150,0)');
    g.fillStyle = halo;
    g.beginPath();
    g.arc(sx, sy, 90, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff3cf';
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 9 : 24,
        a = (k * Math.PI) / 5 - Math.PI / 2;
      g.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    g.textAlign = 'center';
    g.fillStyle = '#f1e6cc';
    g.font = 'italic 54px Georgia, serif';
    g.fillText(tt(ENDING_UI.shareLine), 540, 980);
    g.font = '28px Georgia, serif';
    g.fillStyle = '#c9b07c';
    g.fillText('B 6 1 2', 540, 1060);
    g.font = '22px Georgia, serif';
    g.fillStyle = '#8f8572';
    g.fillText('“' + SCENE_EPILOGUE.no.en + '”', 540, 1230);
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = 'b612-my-star.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (e) {
    console.warn('[ending] 星星卡片生成失败:', e.message);
  }
}
function esc(s) {
  return String(s == null ? '' : s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );
}
