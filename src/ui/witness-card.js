// ui/witness-card.js — private "witness card" for the 325 / 326 / 327 memories (2026-10-04).
// The player is a ghost in these memories, so the characters never react. After the dialogue a small
// paper card lets the player answer in their own head (choice), clap along, or count bottles.
// Every card can be skipped, and nothing branches on the answer: it is only recorded
// (store key `witness`, rules in shared/witness-logic.mjs).
// API: ctx.ui.witness.ask(id, {target?}) -> Promise<{skipped, value?, taps?}>; cancel().
import { ctx } from '../ctx.js';
import { defineSystem } from '../core/system.js';
import { tt } from '../shared/story-text.mjs';
import { Z } from '../shared/z-layers.mjs';
import { WITNESS, WITNESS_SKIP, tapStep, recordWitness } from '../shared/witness-logic.mjs';

const STYLE = `
#witnessCard{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:${Z.witness};display:none;
 width:min(440px,calc(100vw - 24px));box-sizing:border-box;background:#ece1c5f2;color:#44382e;
 border-radius:6px 22px 6px 22px;padding:16px 18px 14px;box-shadow:0 18px 60px #0007;font-family:"Kaiti SC","STKaiti","KaiTi",serif}
body[data-dialog-open] #witnessCard{visibility:hidden}
#witnessCard h3{margin:0;font-size:19px;letter-spacing:2px;font-weight:normal;font-family:var(--font-story-zh,inherit)}
body[data-script-lang="en"] #witnessCard h3{font-family:var(--font-story-en,inherit)}
#witnessCard .wc-hint{font-size:13.5px;line-height:1.6;color:#79674e;margin:6px 0 10px}
#witnessCard .wc-meter{display:flex;gap:5px;margin:4px 0 10px}
#witnessCard .wc-meter i{flex:1;height:8px;border-radius:4px;background:#d6c8a5;transition:background .2s}
#witnessCard .wc-meter i.on{background:#b9893f}
#witnessCard .wc-row{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
#witnessCard button{font:inherit;cursor:pointer;color:#fff0cc;background:#6b5634;border:1px solid #af9361;border-radius:22px;
 padding:9px 18px;min-height:44px;font-size:15px;letter-spacing:1px}
#witnessCard button.wc-skip{background:transparent;color:#6b5634;border-color:#b8a587;min-height:36px;font-size:13px;padding:4px 14px}
#witnessCard .wc-done{text-align:center;font-size:15px;color:#5f7b4a;padding:6px 0}
@media (prefers-reduced-motion:no-preference){#witnessCard.wc-show{animation:wcIn .35s ease}}
@keyframes wcIn{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
`;

export function createWitnessCard() {
  let style, root, api, offWorld;
  /** @type {{id:string, opts:any, taps:number, resolve:Function, finished:boolean}|null} */
  let cur = null;

  function finish(result) {
    if (!cur || cur.finished) return;
    const c = cur;
    c.finished = true;
    if (!result.skipped) {
      try {
        const answer = c.id === 'king325' ? result.value : result.taps;
        ctx.store.setJson('witness', recordWitness(ctx.store.json('witness', {}), c.id, answer));
      } catch (e) {
        console.debug('[witness] could not save the answer:', e);
      }
    }
    const spec = WITNESS[c.id];
    if (!result.skipped && root) {
      root.replaceChildren();
      const d = document.createElement('div');
      d.className = 'wc-done';
      d.textContent = tt(spec.done);
      root.appendChild(d);
      setTimeout(() => close(c), 1400);
    } else close(c);
    c.resolve(result);
  }
  function close(c) {
    if (cur === c) {
      cur = null;
      document.body.removeAttribute('data-witness');
    }
    if (!cur && root) {
      root.style.display = 'none';
      root.replaceChildren();
    }
  }

  function render() {
    if (!cur || cur.finished) return;
    const spec = WITNESS[cur.id];
    const target = cur.opts.target || spec.target || 1;
    root.replaceChildren();
    const h = document.createElement('h3');
    h.textContent = tt(spec.title);
    const hint = document.createElement('div');
    hint.className = 'wc-hint';
    hint.textContent = tt(spec.hint);
    root.append(h, hint);
    const row = document.createElement('div');
    row.className = 'wc-row';
    if (spec.kind === 'choice') {
      for (const o of spec.options) {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.value = o.value;
        b.textContent = tt(o.label);
        b.onclick = () => finish({ skipped: false, value: o.value });
        row.appendChild(b);
      }
    } else {
      const meter = document.createElement('div');
      meter.className = 'wc-meter';
      for (let i = 0; i < target; i++) {
        const dot = document.createElement('i');
        if (i < cur.taps) dot.className = 'on';
        meter.appendChild(dot);
      }
      root.appendChild(meter);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'wc-tap';
      b.textContent = tt(spec.action);
      b.onclick = () => {
        const r = tapStep(cur.taps, target);
        cur.taps = r.taps;
        if (r.done) finish({ skipped: false, taps: r.taps });
        else render();
      };
      row.appendChild(b);
    }
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'wc-skip';
    skip.textContent = tt(WITNESS_SKIP);
    skip.onclick = () => finish({ skipped: true });
    row.appendChild(skip);
    root.appendChild(row);
  }

  const facade = {
    ask(id, opts = {}) {
      if (!WITNESS[id]) return Promise.resolve({ skipped: true });
      if (cur) finish({ skipped: true }); // a new card replaces an unanswered one
      return new Promise((resolve) => {
        cur = { id, opts, taps: 0, resolve, finished: false };
        document.body.setAttribute('data-witness', id);
        root.style.display = 'block';
        root.classList.remove('wc-show');
        void root.offsetWidth;
        root.classList.add('wc-show');
        render();
      });
    },
    cancel() {
      if (cur) finish({ skipped: true });
    },
  };
  const onLang = () => render();
  const onWorld = () => facade.cancel();

  return defineSystem({
    name: 'witness-card',
    layer: 'presentation',
    phase: 'ui',
    order: 12,
    init() {
      style = document.createElement('style');
      style.textContent = STYLE;
      document.head.appendChild(style);
      root = document.createElement('div');
      root.id = 'witnessCard';
      root.setAttribute('role', 'group');
      document.body.appendChild(root);
      // Touch-only: buttons stay usable on phones, but the overlay stack never closes it.
      api = ctx.overlay.register(root, { touchOnly: true, closeOnOutside: false });
      ctx.ui.witness = facade;
      window.addEventListener('script:lang', onLang);
      offWorld = ctx.events.on('world:changed', onWorld);
    },
    dispose() {
      facade.cancel();
      window.removeEventListener('script:lang', onLang);
      offWorld?.();
      api?.unregister();
      style?.remove();
      root?.remove();
      ctx.ui.witness = null;
    },
  });
}
