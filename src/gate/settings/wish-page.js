// wish-page.js — 一念(写下你的一句话,化作灵蕴归入天穹 + 心愿墙;2026-09-04 新增)
// 设计:把「凡人一念,可补天缺」做成零门槛参与——不用传照片、不用答题,一句话即 +5 天穹。
import { ctx } from '../../ctx.js';
import { expose } from '../../debug-hooks.js';

const wOv = document.createElement('div');
wOv.id = 'wishOv';
wOv.style.cssText =
  'position:fixed;inset:0;z-index:380;display:none;align-items:center;justify-content:center;background:rgba(12,6,12,0.62);font-family:inherit';
const wCard = document.createElement('div');
wCard.style.cssText =
  'width:min(460px,92vw);max-height:84vh;overflow-y:auto;background:linear-gradient(160deg,rgba(38,22,34,0.98),rgba(24,14,26,0.98));border:1px solid rgba(255,214,170,.3);border-radius:18px;padding:18px;color:#fff;box-shadow:0 24px 80px rgba(0,0,0,.55)';
wOv.appendChild(wCard);
document.body.appendChild(wOv);
export const wishApi = ctx.overlay.register(wOv, { x: '#wishX' });

function wishDust() {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;overflow:hidden';
  document.body.appendChild(box);
  for (let i = 0; i < 22; i++) {
    const p = document.createElement('div');
    const sz = 3 + Math.random() * 5;
    p.style.cssText = `position:absolute;left:${Math.random() * 100}%;top:${55 + Math.random() * 40}%;width:${sz}px;height:${sz}px;border-radius:50%;background:radial-gradient(circle,#ffe9a8,#e8b13c);box-shadow:0 0 ${4 + sz}px rgba(255,210,120,0.9);opacity:0`;
    box.appendChild(p);
    const dx = (Math.random() - 0.5) * 120,
      dy = -(140 + Math.random() * 260);
    p.animate(
      [
        { transform: 'translate(0,0)', opacity: 0 },
        { opacity: 1, offset: 0.2 },
        { transform: `translate(${dx}px,${dy}px)`, opacity: 0 },
      ],
      { duration: 1400 + Math.random() * 800, easing: 'ease-out', delay: Math.random() * 300 }
    );
  }
  setTimeout(() => box.remove(), 2600);
}

function renderWall(list) {
  const wall = document.getElementById('wishWall');
  if (!wall) return;
  wall.textContent = '';
  if (!list.length) {
    const empty = document.createElement('div');
    empty.style.cssText =
      'padding:14px 4px;font-size:11px;color:rgba(255,217,168,.55);line-height:1.8';
    empty.textContent = '墙还空着——第一念,由你来写。';
    wall.appendChild(empty);
    return;
  }
  for (const w of list) {
    const item = document.createElement('div');
    item.style.cssText =
      'padding:8px 10px;margin-top:6px;border:1px solid rgba(255,214,170,.14);border-radius:10px;font-size:12px;line-height:1.7';
    if (w.me) item.style.borderColor = 'rgba(255,214,170,.45)';
    const txt = document.createElement('div');
    txt.style.cssText = 'color:#ffe9c4;word-break:break-all';
    txt.textContent = w.t; // 访客内容一律 textContent,防 XSS(与聊天室同规)
    const meta = document.createElement('div');
    meta.style.cssText = 'margin-top:3px;font-size:10px;color:rgba(255,255,255,.4)';
    meta.textContent = w.n + ' · ' + new Date(w.ts).toLocaleDateString();
    item.appendChild(txt);
    item.appendChild(meta);
    wall.appendChild(item);
  }
}

async function loadWall() {
  try {
    const r = await fetch('/api/wishes');
    const d = await r.json();
    if (r.ok) renderWall(d.msgs || []);
  } catch (e) {
    /* 静默 */
  }
}

function renderWish() {
  wCard.textContent = '';
  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;margin-bottom:8px';
  const title = document.createElement('b');
  title.style.cssText = 'letter-spacing:2px;font-size:15px';
  title.textContent = '一 念';
  const x = document.createElement('span');
  x.id = 'wishX';
  x.style.cssText = 'margin-left:auto;cursor:pointer;color:rgba(255,255,255,.55);padding:2px 8px';
  x.textContent = '✕';
  head.appendChild(title);
  head.appendChild(x);
  wCard.appendChild(head);

  const intro = document.createElement('div');
  intro.style.cssText = 'font-size:12px;line-height:1.9;color:rgba(255,233,196,.85)';
  intro.textContent =
    '凡人一念，可补天缺。写下你此刻最想留给昆仑的一句话——它将化作一粒光，飞向天穹。';
  wCard.appendChild(intro);

  const ta = document.createElement('textarea');
  ta.id = 'wishText';
  ta.maxLength = 60;
  ta.rows = 3;
  ta.placeholder = '最多 60 字。不写链接,只写心事。';
  ta.style.cssText =
    'width:100%;box-sizing:border-box;margin-top:10px;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);color:#fff;font-size:14px;line-height:1.7;resize:none;outline:none;font-family:inherit';
  wCard.appendChild(ta);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;margin-top:8px;gap:8px';
  const counter = document.createElement('span');
  counter.id = 'wishCnt';
  counter.style.cssText = 'font-size:10px;color:rgba(255,255,255,.4)';
  counter.textContent = '0 / 60 · 每天可写三念';
  const btn = document.createElement('button');
  btn.id = 'wishGo';
  btn.style.cssText =
    'margin-left:auto;padding:9px 22px;border:none;border-radius:10px;background:linear-gradient(135deg,#c98a4b,#8a5a2a);color:#fff;font-size:13px;letter-spacing:3px;cursor:pointer';
  btn.textContent = '落 念';
  row.appendChild(counter);
  row.appendChild(btn);
  wCard.appendChild(row);

  const wallTitle = document.createElement('div');
  wallTitle.style.cssText =
    'margin-top:14px;padding-top:10px;border-top:1px solid rgba(255,255,255,.1);font-size:11px;letter-spacing:2px;color:rgba(255,217,168,.6)';
  wallTitle.textContent = '心 愿 墙 · 人间的一念';
  wCard.appendChild(wallTitle);

  const wall = document.createElement('div');
  wall.id = 'wishWall';
  wCard.appendChild(wall);

  ta.oninput = () => (counter.textContent = ta.value.length + ' / 60 · 每天可写三念');
  btn.onclick = async () => {
    const text = ta.value.trim();
    if (!text) {
      ctx.ui.modeToast && ctx.ui.modeToast('写下你想说的那句话');
      return;
    }
    btn.disabled = true;
    try {
      const r = await fetch('/api/wish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || '没送出去,稍后再试');
      wishDust();
      if (!ctx.store.flag('wishTts')) {
        ctx.store.mark('wishTts');
        ctx.ui.kunlunSpeak && ctx.ui.kunlunSpeak('凡人一念，可补天缺。昆仑听见了。');
      }
      const skyBefore = Math.min(
        ctx.store.num('quiz') + ctx.store.num('up') * 5 + ctx.store.num('wishN') * 5,
        100
      );
      const n = ctx.store.num('wishN') + 1;
      ctx.store.setNum('wishN', n);
      const skyAfter = Math.min(ctx.store.num('quiz') + ctx.store.num('up') * 5 + n * 5, 100);
      if (skyAfter > skyBefore) {
        ctx.ui.modeToast && ctx.ui.modeToast('灵蕴 +5。你的念想已飞上天穹。');
        ctx.kunlun.checkSkyMs && ctx.kunlun.checkSkyMs();
      } else {
        ctx.ui.modeToast && ctx.ui.modeToast('天穹已合。昆仑仍收下了这一念。');
      }
      ta.value = '';
      counter.textContent = '0 / 60 · 每天可写三念';
      loadWall();
    } catch (e) {
      ctx.ui.modeToast && ctx.ui.modeToast(e.message || '没送出去,稍后再试');
    }
    btn.disabled = false;
  };
  loadWall();
}

export function openWish() {
  renderWish();
  wishApi.open();
}

expose('refreshWish', function () {
  if (wishApi.isOpen()) loadWall();
});
