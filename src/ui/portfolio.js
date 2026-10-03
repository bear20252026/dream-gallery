// ui/portfolio.js — 「未完成的画」作品集(2026-10-03 测试建议)
// 开场那句「每一幅未完成的画都在等一个人」的回响:玩家在画板上亲手描过的四幅画
// 收在这里——原著线稿淡淡垫底,上面是玩家自己的笔迹。菜单「作品集」与结局落版都能打开。
// 数据与清洗在 shared/portfolio-logic.mjs;存档键 portfolio(由 gate/scene2-draw.js 写入)。
import { ctx } from '../ctx.js';
import { defineSystem } from '../core/system.js';
import { tt } from '../shared/story-text.mjs';
import { Z } from '../shared/z-layers.mjs';
import { TRUTH } from '../gate/film-strokes.mjs';
import { SHEEP_SICK, RAM, BOX } from '../shared/scene2-sketches.mjs';
import {
  ROUND_IDS,
  PORTFOLIO_TITLES,
  cleanPortfolio,
  portfolioCount,
} from '../shared/portfolio-logic.mjs';

const SKETCH = { boa: TRUTH, 'sheep-sick': SHEEP_SICK, ram: RAM, box: BOX };
const SVG_NS = 'http://www.w3.org/2000/svg';
const TEXT = {
  title: { zh: '未完成的画', en: 'Unfinished drawings' },
  sub: {
    zh: '每一幅未完成的画,都在等一个人。这些是你在沙漠里为他画的。',
    en: 'Every unfinished drawing waits for someone. These are the ones you drew for him in the desert.',
  },
  empty: { zh: '还没画 · 在沙漠里等你', en: 'Not drawn yet · waiting in the desert' },
  close: { zh: '合上', en: 'Close' },
  save: { zh: '存为图片', en: 'Save image' },
};

const STYLE = `
#portfolio{position:fixed;inset:0;z-index:${Z.portfolio};display:none;align-items:center;justify-content:center;
 background:#111621d9;backdrop-filter:blur(8px);padding:20px;box-sizing:border-box}
#portfolio .pf-book{background:#ece1c5;color:#44382e;max-width:880px;width:100%;max-height:88dvh;overflow:auto;
 border-radius:6px 24px 6px 24px;padding:26px;box-shadow:0 24px 80px #0007;box-sizing:border-box;font-family:"Kaiti SC","STKaiti","KaiTi",serif}
#portfolio .pf-head{display:flex;justify-content:space-between;align-items:center;gap:12px}
#portfolio h2{font-size:26px;letter-spacing:3px;margin:0;font-family:var(--font-story-zh,inherit)}
body[data-script-lang="en"] #portfolio h2{font-family:var(--font-story-en,inherit)}
#portfolio .pf-sub{font-size:14px;line-height:1.8;color:#79674e;margin:8px 0 18px}
#portfolio .pf-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
#portfolio figure{margin:0;padding:12px 12px 10px;background:#f9f0da;border:1px solid #b8a587;border-radius:3px 15px;box-shadow:0 2px 0 #d8c9a6}
#portfolio svg{width:100%;height:auto;display:block;background:#fbf5e4;border-radius:2px}
#portfolio figcaption{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:14px;margin-top:8px}
#portfolio figcaption small{color:#927a5b;font-size:11px}
#portfolio button{font:inherit;cursor:pointer;color:#fff0cc;background:#6b5634;border:1px solid #af9361;border-radius:20px;padding:8px 15px;min-height:40px}
#portfolio .pf-save{background:transparent;color:#6b5634;padding:4px 10px;min-height:32px;font-size:12px}
@media(max-width:600px){#portfolio .pf-grid{grid-template-columns:1fr}#portfolio .pf-book{padding:18px}#portfolio h2{font-size:22px}}
`;

function pathEl(d, attrs) {
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', d);
  for (const k in attrs) p.setAttribute(k, attrs[k]);
  return p;
}

/** 一幅画:原著线稿淡底 + 玩家笔迹 */
function drawingSvg(id, entry) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  // 取景:蟒蛇横跨整张纸,其余三幅集中在中部(比例都约 1.62:1)
  svg.setAttribute('viewBox', id === 'boa' ? '40 120 640 300' : '170 195 390 241');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', tt(PORTFOLIO_TITLES[id]));
  const guide = document.createElementNS(SVG_NS, 'g');
  for (const st of SKETCH[id] || []) {
    if (st.glow) continue;
    guide.appendChild(
      st.fill
        ? pathEl(st.d, { fill: st.hl ? '#fbf5e4' : '#cdbfa6' })
        : pathEl(st.d, {
            fill: 'none',
            stroke: '#cdbfa6',
            'stroke-width': (st.w || 3) * 0.8,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            opacity: entry ? 0.55 : 0.35,
          })
    );
  }
  svg.appendChild(guide);
  if (entry) {
    const ink = document.createElementNS(SVG_NS, 'g');
    for (const d of entry.strokes)
      ink.appendChild(
        pathEl(d, {
          fill: 'none',
          stroke: '#3f342b',
          'stroke-width': 2.6,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        })
      );
    svg.appendChild(ink);
  }
  return svg;
}

function saveImage(svg, id) {
  try {
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 1260;
      c.height = 780;
      const g = c.getContext('2d');
      g.fillStyle = '#fbf5e4';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      const a = document.createElement('a');
      a.href = c.toDataURL('image/png');
      a.download = 'b612-' + id + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
    img.src =
      'data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent(xml.replace('<svg', '<svg width="1260" height="780"'));
  } catch (e) {
    console.debug('[portfolio] 存图失败:', e);
  }
}

export function createPortfolio() {
  let style, root, api;
  function render() {
    const book = cleanPortfolio(ctx.store.json('portfolio', {}));
    root.replaceChildren();
    const wrap = document.createElement('div');
    wrap.className = 'pf-book';
    const head = document.createElement('div');
    head.className = 'pf-head';
    const h = document.createElement('h2');
    h.textContent = tt(TEXT.title);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'pf-close';
    close.textContent = tt(TEXT.close);
    head.append(h, close);
    const sub = document.createElement('p');
    sub.className = 'pf-sub';
    sub.textContent = tt(TEXT.sub);
    const grid = document.createElement('div');
    grid.className = 'pf-grid';
    for (const id of ROUND_IDS) {
      const entry = book[id] || null;
      const fig = document.createElement('figure');
      fig.dataset.drawing = id;
      const svg = drawingSvg(id, entry);
      const cap = document.createElement('figcaption');
      const name = document.createElement('span');
      name.textContent = tt(PORTFOLIO_TITLES[id]);
      cap.appendChild(name);
      if (entry) {
        const save = document.createElement('button');
        save.type = 'button';
        save.className = 'pf-save';
        save.textContent = tt(TEXT.save);
        save.onclick = () => saveImage(svg, id);
        cap.appendChild(save);
      } else {
        const small = document.createElement('small');
        small.textContent = tt(TEXT.empty);
        cap.appendChild(small);
      }
      fig.append(svg, cap);
      grid.appendChild(fig);
    }
    wrap.append(head, sub, grid);
    root.appendChild(wrap);
  }
  const facade = {
    open() {
      render();
      api.open();
      if (document.pointerLockElement) document.exitPointerLock();
      /** @type {HTMLElement|null} */ (root.querySelector('.pf-close'))?.focus();
    },
    count: () => portfolioCount(ctx.store.json('portfolio', {})),
  };
  const onLang = () => {
    if (api?.isOpen()) render();
  };
  return defineSystem({
    name: 'portfolio',
    layer: 'presentation',
    phase: 'ui',
    order: 10,
    init() {
      style = document.createElement('style');
      style.textContent = STYLE;
      document.head.appendChild(style);
      root = document.createElement('div');
      root.id = 'portfolio';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      document.body.appendChild(root);
      api = ctx.overlay.register(root, { display: 'flex', x: '.pf-close' });
      ctx.ui.portfolio = facade;
      window.addEventListener('script:lang', onLang);
    },
    dispose() {
      window.removeEventListener('script:lang', onLang);
      api?.unregister();
      style?.remove();
      root?.remove();
      ctx.ui.portfolio = null;
    },
  });
}
