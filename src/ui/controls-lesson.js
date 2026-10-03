// ui/controls-lesson.js — 首次操作小课 + 「?」重看(2026-10-03 测试反馈:第一次来的人不知道怎么操作)
// 画完羊、第一次需要自己走路时出现;三步(走动 → 转视角 → 跟着指引)逐步打勾,
// 玩家真做到了才前进。键盘与触屏两套说明。对白/弹层/画板出现时自动让位,结束后接着上。
// 判定逻辑在 shared/controls-lesson-logic.mjs(单测钉死);存档键 controlsLesson。
import { ctx } from '../ctx.js';
import { defineSystem } from '../core/system.js';
import { tt } from '../shared/story-text.mjs';
import {
  LESSON_STEPS,
  LESSON_TEXT as T,
  advanceLesson,
  shouldStartLesson,
} from '../shared/controls-lesson-logic.mjs';

const STYLE = `
#ctlLesson{position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:71;width:min(340px,calc(100vw - 32px));
 box-sizing:border-box;padding:16px 18px 14px;border-radius:6px 20px 6px 20px;background:rgba(27,28,37,.94);
 border:1px solid #ae9263;color:#f4e7c8;box-shadow:0 10px 32px #0006;font-family:"Kaiti SC","STKaiti","KaiTi",serif;display:none}
#ctlLesson .cl-title{font-size:12px;letter-spacing:3px;color:#c2aa7d;margin-bottom:8px}
#ctlLesson ol{list-style:none;margin:0;padding:0}
#ctlLesson li{display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.6;padding:5px 0;opacity:.45}
#ctlLesson li.on{opacity:1;font-size:15px;color:#fff1ce}
#ctlLesson li.ok{opacity:.7}
#ctlLesson .cl-mark{flex:none;width:20px;height:20px;border-radius:50%;border:1px solid #c2aa7d;font:12px/18px sans-serif;text-align:center}
#ctlLesson li.on .cl-mark{background:#d8b56f;color:#2a2018;border-color:#d8b56f}
#ctlLesson li.ok .cl-mark{background:#5f7b4a;border-color:#7f9d68;color:#fff}
#ctlLesson .cl-chips{display:flex;gap:6px;margin-bottom:8px}
#ctlLesson .cl-chips span{font-size:11px;letter-spacing:1px;padding:2px 9px;border-radius:10px;border:1px solid #6d5d45;color:#9f8f74}
#ctlLesson .cl-chips span.on{border-color:#d8b56f;color:#2a2018;background:#d8b56f}
#ctlLesson .cl-chips span.ok{border-color:#7f9d68;color:#cfe3bd}
#ctlLesson .cl-now{margin:0;font-size:16px;line-height:1.6;color:#fff1ce}
#ctlLesson .cl-row{display:flex;justify-content:flex-end;gap:10px;margin-top:4px}
#ctlLesson button{font:inherit;cursor:pointer;min-height:40px;padding:6px 16px;border-radius:20px}
#ctlLesson .cl-skip{background:transparent;border:1px solid transparent;color:#bba98a;text-decoration:underline}
#ctlLesson .cl-done{background:#6b5634;border:1px solid #af9361;color:#fff0cc}
#ctlHelpBtn{position:fixed;right:184px;top:22px;z-index:70;width:36px;height:36px;border-radius:50%;cursor:pointer;
 border:1px solid rgba(255,214,170,.5);background:rgba(30,22,26,.78);color:#ffe2c4;font:600 17px/34px Georgia,serif;padding:0;display:none}
body[data-dialog-open] #ctlLesson,body.scene2BoardActive #ctlLesson,body[data-flying] #ctlLesson{visibility:hidden}
body.scene2BoardActive #ctlHelpBtn{display:none!important}
@media(max-width:600px){#ctlLesson{top:176px}#ctlLesson li{font-size:13px}#ctlLesson li.on{font-size:14px}#ctlHelpBtn{right:178px;top:20px}}
`;

const isTouch = () =>
  (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ||
  'ontouchstart' in window;

export function createControlsLesson() {
  let style, card, helpBtn, cardApi, helpApi;
  let running = false,
    replay = false,
    state = { step: 0, origin: null, turned: 0 },
    prevYaw = null,
    acc = 0,
    idle = 0;

  function render() {
    if (!card) return;
    const set = isTouch() ? T.touch : T.keyboard;
    card.replaceChildren();
    const title = document.createElement('div');
    title.className = 'cl-title';
    title.textContent = tt(T.title);
    card.appendChild(title);
    if (replay) {
      // 「?」重看:三步全文一次列出
      const list = document.createElement('ol');
      LESSON_STEPS.forEach((key, i) => {
        const li = document.createElement('li');
        li.style.opacity = '1';
        const mark = document.createElement('span');
        mark.className = 'cl-mark';
        mark.textContent = String(i + 1);
        const text = document.createElement('span');
        text.textContent = tt(set[key]);
        li.append(mark, text);
        list.appendChild(li);
      });
      card.appendChild(list);
    } else {
      // 首次小课:一次只讲一步(小屏也不挡路),上方三枚小签显示进度
      const chips = document.createElement('div');
      chips.className = 'cl-chips';
      LESSON_STEPS.forEach((key, i) => {
        const c = document.createElement('span');
        c.className = i < state.step ? 'ok' : i === state.step ? 'on' : '';
        c.textContent = (i < state.step ? '✓ ' : '') + tt(T.short[key]);
        chips.appendChild(c);
      });
      const now = document.createElement('p');
      now.className = 'cl-now';
      now.dataset.step = LESSON_STEPS[state.step];
      now.textContent = tt(set[LESSON_STEPS[state.step]]);
      card.append(chips, now);
    }
    const row = document.createElement('div');
    row.className = 'cl-row';
    if (!replay && state.step < 2) {
      const skip = document.createElement('button');
      skip.type = 'button';
      skip.className = 'cl-skip';
      skip.textContent = tt(T.skip);
      skip.onclick = finish;
      row.appendChild(skip);
    }
    if (replay || state.step >= 2) {
      const done = document.createElement('button');
      done.type = 'button';
      done.className = 'cl-done';
      done.dataset.lessonAction = 'done';
      done.textContent = tt(T.done);
      done.onclick = finish;
      row.appendChild(done);
    }
    card.appendChild(row);
    helpBtn.textContent = '?';
    helpBtn.setAttribute('aria-label', tt(T.help));
    helpBtn.title = tt(T.help);
  }
  function start(asReplay) {
    replay = !!asReplay;
    running = true;
    state = { step: 0, origin: null, turned: 0 };
    prevYaw = null;
    render();
    card.style.display = 'block';
  }
  function finish() {
    running = false;
    if (!replay) ctx.store.mark('controlsLesson');
    replay = false;
    card.style.display = 'none';
  }

  return defineSystem({
    name: 'controlsLesson',
    layer: 'presentation',
    phase: 'ui',
    order: 9,
    init() {
      style = document.createElement('style');
      style.textContent = STYLE;
      document.head.appendChild(style);
      card = document.createElement('section');
      card.id = 'ctlLesson';
      card.setAttribute('role', 'status');
      card.setAttribute('aria-live', 'polite');
      document.body.appendChild(card);
      // touchOnly:只进触摸白名单(按钮可点、不触发转视角);不是模态,不进 Esc 栈 —— 玩家要能边看边走。
      // touchOnly 层的开关由本模块自己设 display(overlay 的 open/close 对它无效)
      cardApi = ctx.overlay.register(card, { touchOnly: true, closeOnOutside: false });
      helpBtn = document.createElement('button');
      helpBtn.type = 'button';
      helpBtn.id = 'ctlHelpBtn';
      helpBtn.onclick = () => (running && replay ? finish() : start(true));
      document.body.appendChild(helpBtn);
      helpApi = ctx.overlay.register(helpBtn, { touchOnly: true, closeOnOutside: false });
      render();
      window.addEventListener('script:lang', render);
    },
    update(dt) {
      acc += dt;
      if (acc < 0.1) return;
      const step = acc;
      acc = 0;
      const pl = ctx.player.pl;
      const scene2 = !!ctx.store.flag('scene2');
      // 「?」只在玩家能自由行动后出现(开场电影/画板期间没有意义)
      helpBtn.style.display = scene2 && pl ? 'block' : 'none';
      if (!running) {
        const ready = shouldStartLesson({
          done: ctx.store.flag('controlsLesson'),
          scene2,
          dialog: !!ctx.ui.dialogOpen?.(),
          overlay: ctx.overlay.anyOpen(),
          board: document.body.classList.contains('scene2BoardActive'),
          hasPlayer: !!pl,
        });
        // 空出 1.5 秒再开课,别在两段对白的缝隙里一闪而过
        idle = ready ? idle + step : 0;
        if (idle >= 1.5) start(false);
        return;
      }
      if (replay || !pl || ctx.ui.dialogOpen?.()) {
        prevYaw = pl ? pl.y : null;
        return;
      }
      const before = state.step;
      state = advanceLesson(state, { x: pl.p.x, z: pl.p.z, yaw: pl.y, prevYaw });
      prevYaw = pl.y;
      if (state.step !== before) render();
    },
    dispose() {
      window.removeEventListener('script:lang', render);
      cardApi?.unregister();
      helpApi?.unregister();
      style?.remove();
      card?.remove();
      helpBtn?.remove();
    },
  });
}
