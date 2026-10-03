import { ctx } from '../ctx.js';
import { defineSystem } from '../core/system.js';
import { eventBus } from '../core/event-bus.js';
import { tt } from '../shared/story-text.mjs';
import { Z } from '../shared/z-layers.mjs';
import {
  TASKS,
  MEMORIES,
  JOURNEY_TEXT as TEXT,
  cleanMemories,
  formatMemoryTime,
  isAlmanacTime,
  nearMemoryPoint,
  taskCheckpoint,
} from '../shared/journey-logic.mjs';
import { guideBearing } from '../shared/journey-guidance.mjs';

const STYLE = `
#journeyTask,#journeyNotebook{font-family:"Kaiti SC","STKaiti","KaiTi",serif;color:#eadbbd;box-sizing:border-box}
#journeyTask{position:fixed;right:90px;bottom:116px;width:min(350px,calc(100vw - 120px));z-index:${Z.questBook};padding:20px 22px;
 background:linear-gradient(145deg,rgba(29,30,39,.97),rgba(39,31,35,.97));border:1px solid #a89062;border-radius:4px 20px 4px 20px;box-shadow:0 12px 42px #0006;display:none}
.jt-kicker{font-size:10px;letter-spacing:3px;color:#c4ac7f}.jt-title{font-size:20px;line-height:1.4;margin:7px 0 9px;color:#fff1ce}
.jt-hint,.jt-feedback{font-size:13px;line-height:1.7;margin:7px 0}.jt-hint{color:#c2b8a7}.jt-feedback{color:#f0ce83;min-height:1.7em}
.jt-controls{display:flex;flex-wrap:wrap;gap:8px}.jt-controls button,.jn-close{font:inherit;cursor:pointer;color:#fff0cc;background:#6b5634;border:1px solid #af9361;border-radius:20px;padding:10px 15px;min-height:44px}
.jt-controls button:hover,.jn-close:hover{background:#8a6d3c}.jt-controls button:focus-visible,.jn-close:focus-visible{outline:2px solid #ffe6a0;outline-offset:3px}
.jt-controls button:disabled{opacity:.48;cursor:default}.jt-progress{font:11px/1.5 sans-serif;letter-spacing:2px;color:#aa9878;margin:8px 0}
.jt-sketch{width:100%;height:85px;margin:6px 0;color:#dbbc79}.jt-clock{display:block;font:38px/1.5 Georgia,serif;letter-spacing:5px;text-align:center;color:#ffe5a8;font-variant-numeric:tabular-nums}
.jt-sketch svg{width:100%;height:100%}
.jt-feedback:empty{display:none}.jt-plant-clue{border-left:2px solid #be9959;padding-left:10px;color:#ead7ae}
.jt-travel{display:none!important}
.jt-look{background:transparent!important}.jt-progress{order:-1}
#journeyTransition{position:fixed;inset:0;z-index:${Z.modal};display:none;align-items:center;justify-content:center;padding:20px;background:#0c1021bb;backdrop-filter:blur(5px);box-sizing:border-box;font-family:"KaiTi",serif}
body[data-home-reveal] #questHud,body[data-home-reveal] #worldNav,body[data-home-reveal] #storyCompass,body[data-home-reveal] #j,body[data-home-reveal] #jumpBtn,body[data-home-reveal] #descendBtn{visibility:hidden}
.jr-card{width:min(460px,100%);padding:30px;border:1px solid #ba9861;border-radius:6px 26px;background:#ede2c6;color:#473b30;box-shadow:0 18px 60px #0006;box-sizing:border-box}.jr-card h2{font-size:28px;margin:12px 0}.jr-card p{font-size:16px;line-height:1.8}.jr-card .jt-kicker{color:#866638}.jr-card button{font:inherit;min-height:44px;padding:12px 22px;border:0;border-radius:24px;background:#725c37;color:#fff1d0;cursor:pointer}
body[data-journey-transition] #worldNav,body[data-journey-transition] #storyCompass{visibility:hidden;pointer-events:none}
body[data-journey-walking] #jumpBtnGlide,body[data-journey-walking] #descendBtnSpace{display:none!important}
.jt-dial{width:100%;accent-color:#d2ab66;margin:8px 0 16px;min-height:28px}.jt-dial-label{font-size:11px;color:#c2b8a7}
#journeyNotebook{position:fixed;inset:0;z-index:${Z.modal};display:none;align-items:center;justify-content:center;background:#111621d9;backdrop-filter:blur(8px);padding:24px}
.jn-book{background:#ece1c5;color:#44382e;max-width:820px;width:100%;max-height:85dvh;overflow:auto;border-radius:6px 24px 6px 24px;padding:28px;box-shadow:0 24px 80px #0007;box-sizing:border-box}
.jn-head{display:flex;justify-content:space-between;align-items:center;gap:12px;position:sticky;top:0;background:#ece1c5;z-index:1}.jn-title{font-size:27px;letter-spacing:3px;margin:0}.jn-sub{font-size:13px;line-height:1.8;color:#79674e}
.jn-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:22px}.jn-memory{padding:18px;border:1px solid #b8a587;border-radius:3px 15px;background:#f9f0da}
.jn-memory svg{height:65px;width:100%;color:#967139}.jn-memory h3{font-size:18px;margin:10px 0}.jn-memory p{font-size:14px;line-height:1.8}.jn-memory small{color:#927a5b;font-size:11px}
body[data-journey-task] #worldNav,body[data-dialog-open] #worldNav{visibility:hidden;pointer-events:none}
body[data-dialog-open] #journeyTask{visibility:hidden;pointer-events:none}
@media(max-width:600px){#journeyTask{right:70px;bottom:120px;width:calc(100vw - 88px);padding:14px 16px}.jt-title{font-size:17px}.jt-hint{font-size:12px}.jt-sketch{height:60px}.jn-book{padding:20px}.jn-grid{grid-template-columns:1fr}#journeyNotebook{padding:12px}}
@media(prefers-reduced-motion:reduce){#journeyTask,#journeyNotebook{scroll-behavior:auto}}
`;

// 小插画是手札里的铅笔图，不冒充剧情中的真实物件。
function sketch(symbol) {
  const paths = {
    volcano:
      '<path d="M12 65 35 25 45 33 54 25 80 65M32 25h23M39 19q-7-8 0-13m12 13q-7-8 0-13M72 65l25-38 24 38"/>',
    sprout: '<path d="M65 68V30m0 12Q25 38 30 16q28-4 35 26m0-3q12-30 40-22 3 23-40 26M43 70h45"/>',
    rosebud:
      '<path d="M67 70V32m0 21q-24-19-28-3 14 14 28 3m0-12q17-18 25-5-7 14-25 5M67 32q-17-10-10-25 14 0 20 13-1 11-10 12M46 70h42"/>',
    baobab:
      '<path d="M60 70 59 38h16l-2 32m-6-31Q37 44 23 25q30-9 44 14m0-1Q89 10 111 22q-3 23-44 16m-1-4Q48 18 51 9q21 1 15 25M42 70h52"/>',
    rose: '<path d="M67 68V35m0 18-17-7m17-2 15-7M67 36q-25-3-23-17 7-15 23-6 17-10 24 5 1 16-24 18m-1-22q-13 0-10 10 11 8 20-2-2-8-10-8"/>',
    sunset: '<path d="M15 55h105M44 55a23 23 0 0 1 46 0M67 18V8M31 28l-8-8m80 8 8-8M25 67h84"/>',
    clock:
      '<circle cx="67" cy="38" r="29"/><path d="M67 12v6m26 20h-6M67 64v-6M41 38h6m20 0 17-10m-17 10-12-6"/>',
    rat: '<path d="M36 56q4-18 24-19 4-17 15-9 8-3 16 17l9 9-12 4H47m-11-2q-27 4-20-15M88 41h1"/>',
    star: '<path d="m67 8 9 22 24 2-19 16 6 23-20-13-21 13 6-23-19-16 24-2Z"/>',
  };
  return (
    '<svg viewBox="0 0 134 80" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    (paths[symbol] || paths.star) +
    '</svg>'
  );
}

export function createJourneySystem({ input }) {
  let panel,
    notebook,
    style,
    taskApi,
    notebookApi,
    transitionEl,
    transitionApi,
    pendingTransition = null,
    mission = null,
    active = null,
    objective = null,
    acc = 0;
  let unsubscribe, langListener;
  let keySubscriptions = [];
  const make = (tag, cls, content, parent) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (content != null) el.textContent = content;
    if (parent) parent.appendChild(el);
    return el;
  };
  function remember(id, choice = null, notify = true) {
    if (!Object.hasOwn(MEMORIES, id)) return;
    const entries = cleanMemories(ctx.store.json('journeyMemories', []));
    if (entries.some((e) => e.id === id)) return;
    ctx.store.setJson('journeyMemories', entries.concat({ id, choice }));
    eventBus.emit('journey:remembered', { id, world: ctx.scene.activeWorld });
    if (notify) ctx.ui.modeToast && ctx.ui.modeToast(tt(TEXT.saved), 2600);
  }
  function setGoal(owner, value) {
    objective = value ? { ...value, owner } : null;
  }
  function clearGoal(owner) {
    if (objective && objective.owner === owner) objective = null;
  }
  function setPhase(owner, value) {
    if (value) mission = { ...value, owner };
    else if (mission?.owner === owner) mission = null;
  }
  function activateGoal() {
    if (
      !objective?.onActivate ||
      !nearMemoryPoint(
        objective,
        ctx.player.pl?.p,
        ctx.scene.activeWorld,
        objective.world,
        ctx.kunlun.flightLock
      ) ||
      ctx.overlay.anyOpen() ||
      ctx.ui.dialogOpen?.()
    )
      return false;
    objective.onActivate();
    return true;
  }
  function saveTask() {
    if (active)
      ctx.store.setJson('journeyTaskCheckpoint', {
        id: active.id,
        world: active.spec.world,
        step: active.step,
        minutes: active.minutes,
      });
  }
  function lookAtGoal() {
    if (!objective || objective.world !== ctx.scene.activeWorld || ctx.overlay.anyOpen()) return;
    const pl = ctx.player.pl,
      bearing = guideBearing(pl, objective);
    if (!bearing) return;
    pl.y += bearing.angle;
    const ground = ctx.scene.worldManager
      ?.getWorld(objective.world)
      ?.ground(objective.x, objective.z);
    const targetHeight = typeof ground === 'number' ? ground + 0.8 : pl.p.y - 1.2;
    pl.pi = Math.max(
      -0.65,
      Math.min(0.4, Math.atan2(targetHeight - pl.p.y, Math.max(1, bearing.distance)))
    );
    if (ctx.player.viewMode === 1 && ctx.player.orbit) ctx.player.orbit.yaw = pl.y;
  }
  function finishTransition(result) {
    const current = pendingTransition;
    if (!current) return;
    pendingTransition = null;
    transitionApi.close();
    delete document.body.dataset.journeyTransition;
    current.resolve(result);
  }
  function transition(owner, value) {
    if (value.world !== ctx.scene.activeWorld) return Promise.resolve(false);
    finishTransition(false);
    return new Promise((resolve) => {
      pendingTransition = { owner, world: value.world, resolve };
      transitionEl.replaceChildren();
      const card = make('div', 'jr-card', null, transitionEl);
      make('div', 'jt-kicker', tt(value.chapter), card);
      make('h2', '', tt(value.title), card);
      make('p', '', tt(value.hint), card);
      const b = make('button', '', tt(value.action), card);
      b.type = 'button';
      b.dataset.journeyAction = 'continue';
      b.onclick = () => finishTransition(true);
      document.body.dataset.journeyTransition = owner;
      transitionApi.open();
      b.focus();
    });
  }
  function finish(result) {
    const current = active;
    if (!current) return;
    active = null;
    panel.style.display = 'none';
    delete document.body.dataset.journeyTask;
    clearGoal(current.owner);
    if (result) remember(current.id, current.choice);
    if (result) ctx.store.setJson('journeyTaskCheckpoint', null);
    current.resolve(result);
  }
  function cancel(owner) {
    if (active && (!owner || active.owner === owner)) finish(null);
    if (!owner || (objective && objective.owner === owner)) objective = null;
    if (pendingTransition && (!owner || pendingTransition.owner === owner)) finishTransition(false);
  }
  function targetPoint() {
    if (!active || !active.spec.points) return null;
    if (active.spec.kind === 'survey') return active.spec.points[active.visited.length];
    return active.spec.points[active.step];
  }
  function updateGoal() {
    const point = targetPoint();
    if (!point) {
      if (active) clearGoal(active.owner);
      return;
    }
    setGoal(active.owner, { world: active.spec.world, x: point.x, z: point.z, ...point.label });
    if (active.onTarget) active.onTarget(point, active.step);
  }
  function near() {
    return (
      !!active &&
      nearMemoryPoint(
        targetPoint(),
        ctx.player.pl && ctx.player.pl.p,
        ctx.scene.activeWorld,
        active.spec.world,
        ctx.kunlun.flightLock
      )
    );
  }
  function feedback(value) {
    if (active) active.feedback = value;
    const el = panel.querySelector('.jt-feedback');
    if (el) el.textContent = typeof value === 'string' ? value : tt(value);
  }
  function observe() {
    if (!active || !near() || ctx.ui.dialogOpen?.() || notebookApi.isOpen()) return;
    if (active.preview) return;
    const point = targetPoint();
    active.onObserve?.(point, active.step);
    eventBus.emit('journey:observed', {
      id: active.id,
      world: active.spec.world,
      step: active.step,
    });
    if (active.spec.kind === 'trail') {
      active.preview = point.detail;
      renderTask();
      return;
    }
    if (active.spec.kind === 'survey') {
      active.visited.push(active.visited.length);
      active.step++;
      active.feedback = point.detail;
      saveTask();
      updateGoal();
      renderTask();
    } else if (active.spec.kind === 'listen') {
      if (active.step === active.spec.answer) finish({ id: active.id });
      else {
        active.step++;
        active.feedback = point.detail;
        saveTask();
        updateGoal();
        renderTask();
      }
    } else {
      active.step++;
      if (active.step >= active.spec.points.length) finish({ id: active.id });
      else {
        active.feedback = point.detail;
        saveTask();
        updateGoal();
        renderTask();
      }
    }
  }
  function renderTask() {
    if (!active) return;
    panel.replaceChildren();
    const s = active.spec;
    make('div', 'jt-kicker', tt(TEXT.memory), panel);
    const point = targetPoint();
    make('h2', 'jt-title', point ? tt(point.label) : tt(s.title), panel);
    make('p', 'jt-hint', tt(s.hint), panel);
    const sketchEl = make('div', 'jt-sketch', null, panel);
    const controls = make('div', 'jt-controls', null, panel);
    const button = (label, action, data) => {
      const b = make('button', '', tt(label), controls);
      b.type = 'button';
      b.onclick = action;
      if (data) b.dataset.journeyAction = data;
      return b;
    };
    if (active.preview) {
      sketchEl.innerHTML = sketch('sunset');
      make('p', 'jt-feedback', tt(active.preview), panel);
      button(
        { zh: '记下这一幕', en: 'Keep this view' },
        () => {
          active.feedback = active.preview;
          active.preview = null;
          active.step++;
          if (active.step === s.points.length) finish({ id: active.id });
          else {
            saveTask();
            updateGoal();
            renderTask();
          }
        },
        'record-view'
      );
      panel.style.display = 'block';
      panel.classList.remove('jt-travel');
      return;
    }
    if (point) {
      const b = button({ zh: '看向目标', en: 'Face the target' }, lookAtGoal, 'look');
      b.className = 'jt-look';
    }
    if (s.kind === 'clock') {
      sketchEl.innerHTML = sketch('clock');
      const time = make('output', 'jt-clock', formatMemoryTime(active.minutes), panel);
      const label = make('label', 'jt-dial-label', tt(TEXT.dialLabel), panel);
      label.htmlFor = 'journeyClock';
      const dial = make('input', 'jt-dial', null, panel);
      dial.id = 'journeyClock';
      dial.type = 'range';
      dial.min = '1080';
      dial.max = '1230';
      dial.step = '5';
      dial.value = active.minutes;
      dial.setAttribute('aria-label', tt(s.title));
      dial.setAttribute('aria-valuetext', formatMemoryTime(active.minutes));
      dial.oninput = () => {
        active.minutes = Number(dial.value);
        saveTask();
        time.textContent = formatMemoryTime(active.minutes);
        dial.setAttribute('aria-valuetext', time.textContent);
      };
      panel.insertBefore(time, controls);
      panel.insertBefore(label, controls);
      panel.insertBefore(dial, controls);
      button(
        TEXT.confirmClock,
        () =>
          isAlmanacTime(active.minutes) ? finish({ id: active.id }) : feedback(TEXT.wrongClock),
        'confirm-time'
      );
    } else if (s.kind === 'sort') {
      sketchEl.innerHTML = sketch(s.plants[active.step] === 'rose' ? 'rosebud' : 'baobab');
      make(
        'p',
        'jt-hint jt-plant-clue',
        tt(
          s.plants[active.step] === 'rose'
            ? { zh: '细细的茎，顶端有一颗花苞。', en: 'A slender stem carries a flower bud.' }
            : {
                zh: '粗壮的嫩茎，叶片向两侧展开，没有花苞。',
                en: 'A thick young stem spreads its leaves; there is no flower bud.',
              }
        ),
        panel
      );
      make('div', 'jt-progress', active.step + 1 + ' / 2', panel);
      for (const [value, label] of [
        ['keep', TEXT.keep],
        ['mark', TEXT.mark],
      ])
        button(
          label,
          () => {
            const correct = s.plants[active.step] === 'rose' ? 'keep' : 'mark';
            if (value !== correct) {
              feedback(TEXT.wrongPlant);
              return;
            }
            active.step++;
            if (active.step === s.plants.length) finish({ id: active.id });
            else {
              saveTask();
              renderTask();
            }
          },
          value
        );
    } else if (s.kind === 'keepsake') {
      sketchEl.innerHTML = sketch('rose');
      s.choices.forEach((label, index) =>
        button(
          label,
          () => {
            active.choice = index;
            finish({ id: active.id, choice: index });
          },
          'keep-' + index
        )
      );
    } else {
      sketchEl.innerHTML = sketch(
        s.kind === 'survey' ? 'volcano' : s.kind === 'listen' ? 'rat' : 'sunset'
      );
      make(
        'div',
        'jt-progress',
        Math.min(active.step, s.points.length) + ' / ' + s.points.length,
        panel
      );
      if (s.kind === 'survey' && active.visited.length === s.points.length) {
        make('p', 'jt-hint', tt(TEXT.pickCold), panel);
        s.points.forEach((point, index) =>
          button(
            point.label,
            () => {
              if (index === s.answer) finish({ id: active.id });
              else feedback(TEXT.wrongCold);
            },
            'volcano-' + index
          )
        );
      } else {
        const b = button(TEXT.observe, observe, 'observe');
        b.disabled = !near();
        make('p', 'jt-distance jt-hint', tt(TEXT.approach), panel);
      }
    }
    make('p', 'jt-feedback', '', panel);
    if (active.feedback) feedback(active.feedback);
    panel.style.display = 'block';
    panel.classList.toggle('jt-travel', !!point && !near());
  }
  function beginTask(owner, id, options = {}) {
    if (!Object.hasOwn(TASKS, id) || ctx.scene.activeWorld !== TASKS[id].world)
      return Promise.resolve(null);
    cancel();
    return new Promise((resolve) => {
      active = {
        owner,
        id,
        spec: TASKS[id],
        resolve,
        step: 0,
        visited: [],
        minutes: 1110,
        choice: null,
        onTarget: options.onTarget,
        onObserve: options.onObserve,
        ...taskCheckpoint(id, ctx.store.json('journeyTaskCheckpoint', null)),
      };
      saveTask();
      document.body.dataset.journeyTask = id;
      updateGoal();
      renderTask();
    });
  }
  function renderNotebook() {
    notebook.replaceChildren();
    const book = make('div', 'jn-book', null, notebook);
    const head = make('div', 'jn-head', null, book);
    make('h2', 'jn-title', tt(TEXT.heading), head);
    const close = make('button', 'jn-close', tt(TEXT.close), head);
    close.type = 'button';
    close.onclick = () => notebookApi.close();
    make('p', 'jn-sub', tt(TEXT.rule), book);
    const entries = cleanMemories(ctx.store.json('journeyMemories', []));
    make(
      'p',
      'jn-sub',
      entries.length ? entries.length + ' / ' + Object.keys(MEMORIES).length : tt(TEXT.empty),
      book
    );
    const grid = make('div', 'jn-grid', null, book);
    entries.forEach((entry) => {
      const m = MEMORIES[entry.id];
      const card = make('article', 'jn-memory', null, grid);
      card.dataset.memory = entry.id;
      make('div', '', null, card).innerHTML = sketch(m.symbol);
      make('h3', '', tt(m.title), card);
      make('p', '', tt(m.note), card);
      if (entry.id === 'rose' && entry.choice != null)
        make('p', '', '“' + tt(TASKS.rose.choices[entry.choice]) + '”', card);
      make('small', '', m.source, card);
    });
  }
  function openHelp() {
    notebook.replaceChildren();
    const book = make('div', 'jn-book', null, notebook),
      head = make('div', 'jn-head', null, book);
    make('h2', 'jn-title', tt({ zh: '跟着光，慢慢走', en: 'Follow the light' }), head);
    const close = make('button', 'jn-close', tt(TEXT.close), head);
    close.type = 'button';
    close.onclick = () => notebookApi.close();
    for (const line of [
      {
        zh: '先看左上角：那里只告诉你当前这一段。',
        en: 'Read the top left: it tells you the current part.',
      },
      {
        zh: '找不到方向时，点「看向目标」，再按 W 或推摇杆向前走。回忆期间沿地面探索，不需要飞行。',
        en: 'Lost? Tap Face target, then use W or the stick to walk forward. Memories are explored on foot.',
      },
      {
        zh: '走近金色光点后，按 E 或点「观察这里」。下一处只在当前观察完成后亮起。',
        en: 'At a golden light, press E or tap Observe. Finish this observation before the next opens.',
      },
      {
        zh: '对白不会自己跳走。点「继续」或按 E；出现选项时，选一句回应。',
        en: 'Dialogue waits for you. Tap Continue or press E. Choose a reply when options appear.',
      },
      TEXT.rule,
      {
        zh: '入梦后，小羊是只有你看得见的想象伙伴。靠近时可以摸摸它；它不会改变回忆中的故事。',
        en: 'In a memory, the sheep is an imagined companion only you can see. Pet it nearby; it cannot change the past.',
      },
    ])
      make('p', 'jn-sub', tt(line), book);
    const sheepCredit = make('p', 'jn-sub', null, book);
    const modelCredit = make('a', '', 'Sheep · Kinga Kroliczek', sheepCredit);
    modelCredit.href = 'https://sketchfab.com/3d-models/sheep-fb30303a25dc4badad445217600206e5';
    modelCredit.target = '_blank';
    modelCredit.rel = 'noopener noreferrer';
    sheepCredit.append(' · ');
    const licenseCredit = make('a', '', 'CC BY 4.0', sheepCredit);
    licenseCredit.href = 'https://creativecommons.org/licenses/by/4.0/';
    licenseCredit.target = '_blank';
    licenseCredit.rel = 'noopener noreferrer';
    sheepCredit.append(tt({ zh: ' · 游戏添加动作', en: ' · Animated for this game' }));
    notebookApi.open();
    close.focus();
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function openNotebook() {
    renderNotebook();
    notebookApi.open();
    if (document.pointerLockElement) document.exitPointerLock();
    notebook.querySelector('.jn-close')?.focus();
  }
  function onKeyPress(key, e) {
    if (
      e.defaultPrevented ||
      document.activeElement?.closest('input,textarea,[contenteditable="true"]') ||
      ctx.overlay.anyOpen()
    )
      return;
    if (key === 'j' && !ctx.ui.dialogOpen?.()) {
      e.preventDefault();
      openNotebook();
    }
    if (key !== 'e') return;
    if (ctx.ui.dialogOpen?.()) {
      e.preventDefault();
      ctx.ui.advanceDialog?.();
    } else if (active?.preview) {
      e.preventDefault();
      panel.querySelector('[data-journey-action="record-view"]')?.click();
    } else if (active && near()) {
      e.preventDefault();
      observe();
    } else if (activateGoal()) e.preventDefault();
  }
  const api = {
    beginTask,
    setGoal,
    clearGoal,
    cancel,
    remember,
    openNotebook,
    openHelp,
    setPhase,
    transition,
    lookAtGoal,
    activateGoal,
    phase: () => mission,
    busy: () =>
      !!(
        active ||
        pendingTransition ||
        (mission && mission.world === ctx.scene.activeWorld && mission.lock !== false)
      ),
    goal: () => objective,
    state: () =>
      active
        ? {
            id: active.id,
            world: active.spec.world,
            step: active.step,
            visited: active.visited.slice(),
            minutes: active.minutes,
            feedback: active.feedback,
            preview: !!active.preview,
          }
        : null,
  };
  return defineSystem({
    name: 'journey',
    layer: 'presentation',
    phase: 'ui',
    order: 7,
    init() {
      style = make('style', '', STYLE, document.head);
      panel = make('section', '', null, document.body);
      panel.id = 'journeyTask';
      panel.setAttribute('aria-label', tt(TEXT.action));
      taskApi = ctx.overlay.register(panel, { touchOnly: true });
      transitionEl = make('div', '', null, document.body);
      transitionEl.id = 'journeyTransition';
      transitionEl.setAttribute('role', 'dialog');
      transitionEl.setAttribute('aria-modal', 'true');
      transitionApi = ctx.overlay.register(transitionEl, {
        display: 'flex',
        escapable: false,
        closeOnOutside: false,
      });
      notebook = make('div', '', null, document.body);
      notebook.id = 'journeyNotebook';
      notebook.setAttribute('role', 'dialog');
      notebook.setAttribute('aria-modal', 'true');
      notebook.setAttribute('aria-label', tt(TEXT.heading));
      notebookApi = ctx.overlay.register(notebook, {
        display: 'flex',
        onClose: () => document.getElementById('gsMenuBtn')?.focus(),
      });
      ctx.ui.journey = api;
      keySubscriptions = ['e', 'j'].map((key) => input.onKeyPress(key, (e) => onKeyPress(key, e)));
      unsubscribe = eventBus.on('world:changed', ({ to }) => {
        if (active && active.spec.world !== to) cancel(active.owner);
        if (objective && objective.world !== to) objective = null;
        if (mission && mission.world !== to) mission = null;
        if (pendingTransition && pendingTransition.world !== to) finishTransition(false);
        notebookApi.close();
      });
      langListener = () => {
        renderTask();
        notebook.setAttribute('aria-label', tt(TEXT.heading));
        if (notebookApi.isOpen()) renderNotebook();
      };
      window.addEventListener('script:lang', langListener);
    },
    update(dt) {
      acc += dt;
      if (acc < 0.1) return;
      acc = 0;
      if (!active) return;
      if (ctx.scene.activeWorld !== active.spec.world) {
        cancel(active.owner);
        return;
      }
      const b = panel.querySelector('[data-journey-action="observe"]');
      if (b) b.disabled = !near() || !!ctx.ui.dialogOpen?.() || notebookApi.isOpen();
      const d = panel.querySelector('.jt-distance');
      const p = ctx.player.pl && ctx.player.pl.p,
        point = targetPoint();
      if (d && p && point)
        d.textContent = near()
          ? tt(TEXT.observe) + ' · E'
          : tt(point.label) + ' · ' + Math.round(Math.hypot(p.x - point.x, p.z - point.z)) + ' m';
      panel.classList.toggle('jt-travel', !!point && !near() && !active.preview);
    },
    dispose() {
      cancel();
      unsubscribe?.();
      keySubscriptions.forEach((unsubscribeKey) => unsubscribeKey());
      window.removeEventListener('script:lang', langListener);
      taskApi.unregister();
      notebookApi.unregister();
      transitionApi.unregister();
      style.remove();
      panel.remove();
      notebook.remove();
      transitionEl.remove();
      ctx.ui.journey = null;
    },
  });
}
