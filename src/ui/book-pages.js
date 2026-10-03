// ui/book-pages.js — 临时「画册页」阅读器(2026-10-03「先做结局」)
// 书页六/七/八(328·329·330·地球之日)暂时以可翻的插画书页呈现,把故事接到结局。
// 呈现:左页铅笔插画(程序化 SVG,逐笔画出),右页台词(当前语言为主,另一语言淡写在下)。
// 操作:翻页按钮 / → / 空格 / E / 左右滑;← 回上一页。读完最后一页才能「合上书」(onDone)。
// 规矩:台词来自 shared/ending-text.mjs(逐字照 Woods 译本),本模块只管呈现,不写一句台词。
import { tt, scriptLang } from '../shared/story-text.mjs';
import { Z } from '../shared/z-layers.mjs';
import { ENDING_UI } from '../shared/ending-text.mjs';

// —— 铅笔插画(viewBox 0 0 300 260,线条风格与开场电影的手绘一致) ——
const SKETCH = {
  businessman: `
    <path d="M40 200 L260 200 M60 200 L60 236 M240 200 L240 236"/>
    <path d="M70 200 L70 168 L130 168 L130 200"/>
    <circle cx="150" cy="122" r="22"/>
    <path d="M150 144 L150 188 M150 160 L118 178 M150 160 L184 176"/>
    <path d="M184 176 L214 182 L210 196 L180 190 Z"/>
    <path d="M200 70 l4 10 l10 2 l-8 7 l2 10 l-8 -5 l-9 5 l2 -10 l-8 -7 l10 -2 Z"/>
    <path d="M240 42 l3 7 l7 1 l-5 5 l1 7 l-6 -3 l-6 3 l1 -7 l-5 -5 l7 -1 Z"/>
    <path d="M60 60 l3 7 l7 1 l-5 5 l1 7 l-6 -3 l-6 3 l1 -7 l-5 -5 l7 -1 Z"/>
    <path class="faint" d="M86 176 h30 M86 184 h22 M86 192 h26"/>`,
  lamplighter: `
    <path d="M30 210 Q150 150 270 210"/>
    <path d="M150 180 L150 70 M136 70 L164 70 L158 52 L142 52 Z"/>
    <path class="gold" d="M150 60 m-14 0 a14 14 0 1 0 28 0 a14 14 0 1 0 -28 0"/>
    <circle cx="104" cy="150" r="10"/>
    <path d="M104 160 L104 192 M104 172 L128 150 M104 172 L88 186 M104 192 L94 208 M104 192 L114 208"/>
    <path class="faint" d="M230 60 a18 18 0 1 1 -10 32 a14 14 0 1 0 10 -32"/>
    <path class="faint" d="M50 70 m-12 0 a12 12 0 1 0 24 0 a12 12 0 1 0 -24 0 M50 50 v-8 M50 98 v-8 M30 70 h-8 M78 70 h-8"/>`,
  geographer: `
    <path d="M40 210 L260 210"/>
    <path d="M80 210 L80 150 L220 150 L220 210"/>
    <path d="M90 150 Q150 128 210 150 M150 136 L150 150"/>
    <path class="faint" d="M100 146 h36 M164 146 h36 M100 140 h30 M168 140 h30"/>
    <circle cx="60" cy="110" r="26"/>
    <path class="faint" d="M34 110 h52 M60 84 Q46 110 60 136 M60 84 Q74 110 60 136"/>
    <circle cx="190" cy="94" r="18"/>
    <path d="M182 90 h6 M194 90 h6 M178 82 Q190 70 202 82"/>
    <path d="M190 112 L190 128 M170 120 L210 120"/>`,
  snake: `
    <path d="M20 210 Q150 190 280 210"/>
    <path class="gold" d="M90 196 Q120 176 150 192 Q180 208 200 188 Q214 172 196 166 Q182 162 186 176"/>
    <circle cx="214" cy="70" r="26"/>
    <path class="faint" d="M226 52 a26 26 0 0 1 0 36"/>
    <circle cx="96" cy="150" r="9"/>
    <path d="M96 159 L96 186 M96 168 L80 178 M96 168 L112 176 M96 186 L88 202 M96 186 L104 202"/>
    <path class="gold" d="M88 141 q8 -10 16 0"/>`,
  echo: `
    <path d="M20 220 L90 90 L130 150 L170 70 L240 200 L280 220"/>
    <path class="faint" d="M150 108 q14 -10 28 0 M146 96 q22 -16 40 0 M142 84 q30 -22 54 0"/>
    <path d="M60 220 L60 196"/>
    <path d="M60 196 q-10 -12 0 -18 q10 6 0 18 M60 196 q-14 -2 -16 -12 q12 -2 16 12 M60 196 q14 -2 16 -12 q-12 -2 -16 12"/>
    <circle cx="200" cy="208" r="6"/>
    <path d="M200 214 L200 230"/>`,
  roses: `
    <path d="M20 226 L280 226"/>
    ${Array.from({ length: 11 }, (_, i) => {
      const x = 34 + i * 23,
        y = 170 + ((i * 37) % 30);
      return `<path d="M${x} 226 L${x} ${y + 10}"/><circle class="rose" cx="${x}" cy="${y}" r="9"/><path class="faint" d="M${x - 4} ${y} q4 -6 8 0"/>`;
    }).join('')}
    <circle cx="150" cy="96" r="10"/>
    <path d="M150 106 L150 132 M150 116 L136 126 M150 116 L164 126 M150 132 L142 146 M150 132 L158 146"/>
    <path class="faint" d="M144 92 q-2 4 0 6"/>`,
  fox: `
    <path d="M20 220 Q150 206 280 220"/>
    ${Array.from({ length: 9 }, (_, i) => `<path class="gold" d="M${30 + i * 30} 220 q4 -26 0 -46 m0 12 l-6 -6 m6 14 l6 -6"/>`).join('')}
    <path d="M200 70 L200 150 M200 92 q-34 -20 -50 6 M200 92 q34 -20 50 6 M200 80 q-20 -30 0 -40 q20 10 0 40"/>
    <path d="M110 190 q-6 -30 18 -38 l-6 -20 l14 14 l12 -14 l-2 22 q22 10 14 36 Z"/>
    <path class="gold" d="M152 190 q34 -6 40 -30 q-18 10 -30 8"/>
    <circle cx="124" cy="168" r="1.6"/><circle cx="138" cy="168" r="1.6"/>`,
  muzzle: `
    <path d="M90 160 q60 -50 120 0 q-60 40 -120 0 Z"/>
    <path d="M110 150 l80 0 M104 162 l92 0 M112 174 l76 0"/>
    <path class="faint" d="M90 160 q-30 -40 -10 -80"/>`,
};

const STYLE = `
#bookPages{position:fixed;inset:0;z-index:${Z.bookPages};display:none;align-items:center;justify-content:center;
  background:radial-gradient(120% 100% at 50% 40%,rgba(20,16,12,.72),rgba(8,6,4,.92));
  font-family:Georgia,"Times New Roman","Kaiti SC","STKaiti","KaiTi",serif;opacity:0;transition:opacity .6s ease}
#bookPages.show{display:flex}
#bookPages.in{opacity:1}
#bookPages .bk{position:relative;width:min(980px,94vw);height:min(600px,86dvh);display:flex;
  background:linear-gradient(90deg,#efe4c8 0%,#f7efda 47%,#d9cba8 50%,#f7efda 53%,#efe4c8 100%);
  border-radius:6px;box-shadow:0 30px 80px rgba(0,0,0,.55),inset 0 0 40px rgba(120,90,50,.18);color:#3a2c1e}
#bookPages .pg{flex:1;position:relative;padding:34px 38px 70px;box-sizing:border-box;overflow:hidden}
#bookPages .pgL{display:flex;flex-direction:column;align-items:center;justify-content:center}
#bookPages .ttl{font-size:13px;letter-spacing:.32em;color:#8a6a4a;text-transform:uppercase;text-align:center}
#bookPages .plc{font-style:italic;color:#6d5a44;margin:6px 0 10px;text-align:center;font-size:15px}
#bookPages svg{width:100%;max-width:340px;height:auto;fill:none;stroke:#4a3a2a;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
#bookPages svg .faint{stroke:#9b8a72;stroke-width:1.4}
#bookPages svg .gold{stroke:#c08a2e}
#bookPages svg .rose{stroke:#b4513f}
#bookPages svg path,#bookPages svg circle{stroke-dasharray:900;stroke-dashoffset:900;animation:bkDraw 2.4s ease forwards}
@keyframes bkDraw{to{stroke-dashoffset:0}}
#bookPages .pgR{display:flex;flex-direction:column;justify-content:center;gap:16px;overflow:auto}
#bookPages .ln{opacity:0;transform:translateY(6px);animation:bkLine .7s ease forwards}
@keyframes bkLine{to{opacity:1;transform:none}}
#bookPages .who{font-size:11px;letter-spacing:.24em;color:#a0502f;text-transform:uppercase;margin-bottom:3px}
#bookPages .tx{font-size:18px;line-height:1.6;white-space:pre-line}
#bookPages .tx2{font-size:13px;line-height:1.55;color:#8c7a62;white-space:pre-line;margin-top:3px}
#bookPages .cap .tx{font-style:italic;color:#5b4a36}
#bookPages .nav{position:absolute;left:0;right:0;bottom:16px;display:flex;align-items:center;justify-content:center;gap:14px}
#bookPages .nav button{font:inherit;font-size:15px;cursor:pointer;color:#fff3da;background:#7a5a36;border:1px solid #b08d5c;
  border-radius:22px;padding:9px 20px;min-height:44px}
#bookPages .nav button.ghost{background:transparent;color:#7a5a36}
#bookPages .nav button:disabled{opacity:.35;cursor:default}
#bookPages .dots{display:flex;gap:6px}
#bookPages .dots i{width:7px;height:7px;border-radius:50%;background:#cbb994;display:block}
#bookPages .dots i.on{background:#7a5a36}
#bookPages .temp{position:absolute;left:38px;right:38px;bottom:66px;font-size:11px;color:#a8977c;text-align:center;font-style:italic}
#bookPages .pgnum{position:absolute;bottom:22px;font-size:12px;color:#a8977c}
#bookPages .pgL .pgnum{left:30px}#bookPages .pgR .pgnum{right:30px}
@media (max-width:720px),(max-height:520px){
  #bookPages .bk{flex-direction:column;height:92dvh;background:#f4ead2}
  #bookPages .pgL{flex:0 0 auto;padding:18px 18px 0}
  #bookPages svg{max-width:220px;max-height:26dvh}
  #bookPages .pgR{padding:12px 22px 84px;justify-content:flex-start}
  #bookPages .tx{font-size:16px}
  #bookPages .temp{bottom:64px}
  #bookPages .pgnum{display:none}
}
@media (prefers-reduced-motion:reduce){#bookPages svg path,#bookPages svg circle{animation:none;stroke-dashoffset:0}#bookPages .ln{animation:none;opacity:1;transform:none}}
`;

let root = null;
let styleEl = null;

export function sketchSvg(key) {
  return `<svg viewBox="0 0 300 260" aria-hidden="true">${SKETCH[key] || ''}</svg>`;
}

function ensureDom() {
  if (root) return root;
  styleEl = document.createElement('style');
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);
  root = document.createElement('div');
  root.id = 'bookPages';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  document.body.appendChild(root);
  return root;
}

function otherLang(entry) {
  const cur = scriptLang ? scriptLang() : 'en';
  return cur === 'zh' ? entry.en : entry.zh;
}

/**
 * 打开画册。
 * @param {Array} pages BOOK_PAGES
 * @param {{onDone?:Function, onClose?:Function, startAt?:number}} opts
 * @returns {{close:Function, next:Function, prev:Function, state:Function}}
 */
export function openBook(pages, opts = {}) {
  const el = ensureDom();
  // 拍平成「对开页」序列
  const spreads = [];
  pages.forEach((p) =>
    p.spreads.forEach((s, i) => spreads.push({ page: p, spread: s, first: i === 0 }))
  );
  let idx = Math.max(0, Math.min(spreads.length - 1, opts.startAt || 0));
  let closed = false;
  let touchX = null;

  function render() {
    const { page, spread } = spreads[idx];
    const last = idx === spreads.length - 1;
    const lines = spread.lines
      .map((l, i) => {
        const cap = !tt(l.who);
        return `<div class="ln${cap ? ' cap' : ''}" style="animation-delay:${0.35 + i * 0.45}s">
          ${cap ? '' : `<div class="who">${esc(tt(l.who))}</div>`}
          <div class="tx">${esc(tt(l))}</div>
          <div class="tx2">${esc(otherLang(l) || '')}</div></div>`;
      })
      .join('');
    const dots = spreads.map((_, i) => `<i class="${i <= idx ? 'on' : ''}"></i>`).join('');
    el.innerHTML = `<div class="bk">
      <div class="pg pgL"><div class="ttl">${esc(tt(page.title))}</div>
        <div class="plc">${esc(tt(page.place))}</div>${sketchSvg(spread.art)}
        <div class="pgnum">${idx * 2 + 1}</div></div>
      <div class="pg pgR">${lines}<div class="pgnum">${idx * 2 + 2}</div></div>
      <div class="temp">${esc(tt(ENDING_UI.temp))}</div>
      <div class="nav">
        <button type="button" class="ghost" data-bk="prev" ${idx === 0 ? 'disabled' : ''}>‹ ${esc(tt(ENDING_UI.back))}</button>
        <div class="dots">${dots}</div>
        <button type="button" data-bk="next">${esc(tt(last ? ENDING_UI.close : ENDING_UI.turn))} ›</button>
      </div></div>`;
    el.querySelector('[data-bk="prev"]').onclick = prev;
    el.querySelector('[data-bk="next"]').onclick = next;
  }
  function next() {
    if (closed) return;
    if (idx >= spreads.length - 1) {
      close(true);
      return;
    }
    idx++;
    render();
  }
  function prev() {
    if (closed || idx === 0) return;
    idx--;
    render();
  }
  function onKey(e) {
    if (closed) return;
    const k = (e.key || '').toLowerCase();
    if (k === 'arrowright' || k === ' ' || k === 'e' || k === 'enter') {
      e.preventDefault();
      e.stopPropagation();
      next();
    } else if (k === 'arrowleft') {
      e.preventDefault();
      e.stopPropagation();
      prev();
    }
  }
  function onTouchStart(e) {
    touchX = e.touches && e.touches[0] ? e.touches[0].clientX : null;
  }
  function onTouchEnd(e) {
    if (touchX == null) return;
    const x = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : touchX;
    const dx = x - touchX;
    touchX = null;
    if (Math.abs(dx) < 50) return;
    if (dx < 0) next();
    else prev();
  }
  function onLang() {
    if (!closed) render();
  }
  function close(done) {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    el.removeEventListener('touchstart', onTouchStart);
    el.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('script:lang', onLang);
    el.classList.remove('in');
    setTimeout(() => {
      el.classList.remove('show');
      el.innerHTML = '';
    }, 600);
    if (done) opts.onDone && opts.onDone();
    else opts.onClose && opts.onClose(idx);
  }

  document.addEventListener('keydown', onKey, true);
  el.addEventListener('touchstart', onTouchStart, { passive: true });
  el.addEventListener('touchend', onTouchEnd);
  window.addEventListener('script:lang', onLang);
  render();
  el.classList.add('show');
  requestAnimationFrame(() => el.classList.add('in'));
  return {
    close: () => close(false),
    next,
    prev,
    state: () => ({ idx, total: spreads.length, closed }),
  };
}

function esc(s) {
  return String(s == null ? '' : s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );
}
