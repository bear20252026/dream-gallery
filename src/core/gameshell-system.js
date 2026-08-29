// core/gameshell-system.js — 游戏外壳·手绘风 UI 层(2026-08-29)
// 一次性交付三块,全部接到现有 ctx 状态:
//   1) 对话框(gameDialog) —— 把 ctx.ui.kunlunSpeak 升级为手绘底栏对话框(说话人+打字机+点击推进),
//      并暴露 ctx.openDialog({speaker,lines,choices}) 选项 API;所有已有昆仑台词(序章/答题/上传/换色…)
//      都自动落进手绘框,即"系统交互"的对话框呈现。
//   2) 任务栏(questHud) —— 左上常驻羊皮卷,显示当前主线 + 子进度(灵蕴/挂画/飞舟),由 game-state 驱动。
//   3) 系统菜单(gameMenu) —— 右上毛笔按钮 → 模态卷轴菜单(问昆仑/操作指引/任务册/继续)。
// 纯表现层(presentation/ui),经组合根装配,与 toast/overlay 同通道。无业务逻辑。
import { ctx } from '../ctx.js';
import { eventBus } from './event-bus.js';
import { defineSystem } from './system.js';

// ---------- 手绘样式(一次性注入,羊皮纸 + 抖边 + 楷体笔触) ----------
const STYLE = `
#gameDialog,#questHud,#gameMenu,.gs-menu-card{
  font-family:"Kaiti SC","STKaiti","KaiTi","楷体","Noto Serif SC",cursive !important;
  -webkit-font-smoothing:antialiased;
}
/* ===== 对话框:手绘羊皮卷 ===== */
#gameDialog{
  position:fixed;left:50%;bottom:3.2vh;transform:translateX(-50%) rotate(-.5deg);
  width:min(760px,92vw);z-index:80;display:none;
  pointer-events:auto;cursor:pointer;user-select:none;
  padding:22px 26px 18px;
  color:#3a2a1c;
  background:
    radial-gradient(120% 140% at 20% 0%,rgba(255,250,235,.96),rgba(244,233,208,.96) 60%,rgba(232,217,184,.96));
  border:2.5px solid #4a3526;
  border-radius:255px 14px 225px 16px / 16px 225px 14px 255px;
  box-shadow:0 6px 22px rgba(0,0,0,.35), inset 0 0 0 1.4px #6b4f37, inset 0 0 26px rgba(120,86,40,.18);
}
#gameDialog::before{ /* 第二道铅笔描边,强化手绘感 */
  content:"";position:absolute;inset:5px;pointer-events:none;
  border:1.5px solid rgba(74,53,38,.55);
  border-radius:230px 18px 210px 18px / 18px 210px 16px 230px;
}
.gs-name{
  position:absolute;top:-16px;left:26px;
  padding:3px 16px;font-size:17px;letter-spacing:2px;color:#fff5e0;
  background:linear-gradient(135deg,#b9743a,#8a4f23);
  border:2px solid #4a3526;border-radius:14px 9px 16px 8px / 9px 16px 8px 14px;
  box-shadow:0 3px 8px rgba(0,0,0,.3), inset 0 0 0 1px rgba(255,240,210,.4);
  transform:rotate(-2deg);
}
.gs-text{font-size:19px;line-height:1.85;min-height:1.85em;letter-spacing:.6px;
  text-shadow:0 1px 0 rgba(255,250,235,.6);}
.gs-caret{display:inline-block;width:.5em;color:#a35a1e;animation:gsBlink 1s steps(1) infinite;}
@keyframes gsBlink{50%{opacity:0}}
.gs-choices{margin-top:14px;display:flex;flex-direction:column;gap:10px;}
.gs-choice{
  align-self:flex-start;max-width:88%;text-align:left;cursor:pointer;
  font-family:inherit;font-size:17px;letter-spacing:1px;color:#3a2a1c;
  padding:9px 18px;background:rgba(255,250,235,.7);
  border:2px solid #4a3526;border-radius:18px 10px 20px 9px / 10px 20px 9px 18px;
  box-shadow:inset 0 0 0 1px rgba(74,53,38,.35);transition:all .18s ease;
}
.gs-choice:hover{background:#caa15f;color:#fff5e0;transform:translateX(6px) rotate(-.6deg);}
.gs-hint{margin-top:8px;text-align:right;font-size:12px;color:#8a6a44;opacity:.7;letter-spacing:2px;}

/* ===== 任务栏:手绘羊皮卷(左上) ===== */
#questHud{
  position:fixed;left:16px;top:16px;z-index:70;width:min(248px,70vw);
  pointer-events:none;
  padding:16px 18px 14px;color:#3a2a1c;
  background:
    radial-gradient(130% 150% at 80% 0%,rgba(255,250,235,.94),rgba(244,233,208,.94) 62%,rgba(230,214,180,.94));
  border:2.5px solid #4a3526;
  border-radius:18px 230px 16px 200px / 230px 16px 200px 18px;
  box-shadow:0 5px 18px rgba(0,0,0,.3), inset 0 0 0 1.4px #6b4f37, inset 0 0 22px rgba(120,86,40,.16);
  transform:rotate(-1deg);
}
#questHud .q-title{font-size:15px;letter-spacing:3px;color:#8a4f23;
  border-bottom:2px dashed rgba(74,53,38,.4);padding-bottom:5px;margin-bottom:9px;}
#questHud .q-main{font-size:16px;line-height:1.6;margin-bottom:8px;color:#3a2a1c;}
#questHud .q-row{font-size:14px;line-height:1.7;display:flex;justify-content:space-between;gap:8px;}
#questHud .q-row .q-k{color:#6b4f37;}
#questHud .q-row .q-v{color:#a35a1e;font-weight:700;}

/* ===== 系统菜单按钮(右上毛笔印) ===== */
#gsMenuBtn{
  position:fixed;right:16px;top:16px;z-index:70;width:52px;height:52px;
  display:flex;align-items:center;justify-content:center;cursor:pointer;pointer-events:auto;
  color:#fff5e0;font-size:24px;font-family:inherit;
  background:radial-gradient(circle at 38% 32%,#b9743a,#7c441f);
  border:2.5px solid #4a3526;border-radius:50% 46% 52% 44% / 48% 52% 44% 56%;
  box-shadow:0 4px 14px rgba(0,0,0,.35), inset 0 0 0 1.5px rgba(255,240,210,.35);
  transform:rotate(4deg);transition:transform .2s ease;
}
#gsMenuBtn:hover{transform:rotate(0deg) scale(1.06);}

/* ===== 系统菜单:手绘卷轴弹层 ===== */
#gameMenu{
  position:fixed;inset:0;z-index:200;display:none;align-items:center;justify-content:center;
  background:rgba(20,12,18,.55);backdrop-filter:blur(2px);
}
.gs-menu-card{
  width:min(360px,88vw);padding:26px 28px 22px;color:#3a2a1c;text-align:center;
  background:radial-gradient(130% 150% at 50% 0%,rgba(255,250,235,.97),rgba(244,233,208,.97) 60%,rgba(230,214,180,.97));
  border:2.5px solid #4a3526;border-radius:24px 200px 22px 200px / 200px 22px 200px 24px;
  box-shadow:0 10px 36px rgba(0,0,0,.5), inset 0 0 0 1.4px #6b4f37;
  transform:rotate(-.6deg);
}
.gs-menu-card .m-title{font-size:22px;letter-spacing:6px;color:#8a4f23;margin-bottom:4px;}
.gs-menu-card .m-sub{font-size:12px;letter-spacing:2px;color:#8a6a44;margin-bottom:18px;}
.gs-menu-card .m-btn{
  display:block;width:100%;margin:10px 0;cursor:pointer;font-family:inherit;
  font-size:17px;letter-spacing:2px;color:#3a2a1c;padding:11px 0;
  background:rgba(255,250,235,.7);border:2px solid #4a3526;
  border-radius:16px 10px 18px 9px / 10px 18px 9px 16px;
  box-shadow:inset 0 0 0 1px rgba(74,53,38,.3);transition:all .18s ease;
}
.gs-menu-card .m-btn:hover{background:#caa15f;color:#fff5e0;transform:scale(1.02);}
`;

function createGameShellSystem() {
  let styleEl, dialogEl, questEl, menuBtn, menuEl, menuApi;
  let unsub = null;
  let prevKunlunSpeak = null;
  let acc = 0; // 任务栏刷新节流

  // ---- 对话框状态机 ----
  let dlg = null; // {speaker, lines, idx, choices, onDone, typeTimer, hideTimer, typing}
  function el(id) { return document.getElementById(id); }

  function renderDialog() {
    if (!dlg) return;
    const nameEl = dialogEl.querySelector('.gs-name');
    const textEl = dialogEl.querySelector('.gs-text');
    const chEl = dialogEl.querySelector('.gs-choices');
    const hintEl = dialogEl.querySelector('.gs-hint');
    nameEl.textContent = dlg.speaker || '昆仑';
    chEl.innerHTML = '';
    hintEl.style.display = 'none';
    typeLine(dlg.lines[dlg.idx] || '');
  }
  function typeLine(str) {
    const textEl = dialogEl.querySelector('.gs-text');
    dlg.typing = true;
    let i = 0;
    clearInterval(dlg.typeTimer);
    textEl.innerHTML = '';
    const caret = document.createElement('span');
    caret.className = 'gs-caret';
    caret.textContent = '✎';
    textEl.appendChild(caret);
    dlg.typeTimer = setInterval(() => {
      if (i >= str.length) {
        clearInterval(dlg.typeTimer);
        dlg.typing = false;
        textEl.textContent = str;
        onLineDone();
        return;
      }
      textEl.textContent = str.slice(0, ++i);
      textEl.appendChild(caret);
    }, 38);
  }
  function onLineDone() {
    clearTimeout(dlg.hideTimer);
    const last = dlg.idx >= dlg.lines.length - 1;
    if (last) {
      if (dlg.choices && dlg.choices.length) {
        showChoices();
      } else if (dlg.autoHide) {
        dlg.hideTimer = setTimeout(closeDialog, dlg.autoHide);
      }
    }
  }
  function advance() {
    if (!dlg) return;
    if (dlg.typing) { // 点击=秒显本行
      clearInterval(dlg.typeTimer);
      dlg.typing = false;
      dialogEl.querySelector('.gs-text').textContent = dlg.lines[dlg.idx] || '';
      onLineDone();
      return;
    }
    if (dlg.idx < dlg.lines.length - 1) {
      dlg.idx++;
      renderDialog();
    } else if (dlg.choices && dlg.choices.length) {
      // 已在末行且有选项:不自动关闭
    } else {
      closeDialog();
    }
  }
  function showChoices() {
    const chEl = dialogEl.querySelector('.gs-choices');
    chEl.innerHTML = '';
    dlg.choices.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'gs-choice';
      b.textContent = c.label;
      b.onclick = (e) => {
        e.stopPropagation();
        const cb = c.onClick;
        closeDialog();
        if (cb) cb(c.value);
      };
      chEl.appendChild(b);
    });
  }
  function closeDialog() {
    if (dlg && dlg.typeTimer) clearInterval(dlg.typeTimer);
    if (dlg && dlg.hideTimer) clearTimeout(dlg.hideTimer);
    dlg = null;
    dialogEl.style.display = 'none';
  }
  function openDialog(opts) {
    if (!opts) return;
    const lines = Array.isArray(opts.lines) ? opts.lines : [opts.lines != null ? String(opts.lines) : ''];
    if (!lines.length) lines.push('');
    closeDialog();
    dlg = {
      speaker: opts.speaker || '昆仑',
      lines,
      idx: 0,
      choices: opts.choices || null,
      autoHide: opts.autoHide != null ? opts.autoHide : (opts.choices && opts.choices.length ? 0 : 9000),
      onDone: opts.onDone || null,
      typing: false,
      typeTimer: null,
      hideTimer: null,
    };
    dialogEl.style.display = 'block';
    renderDialog();
  }
  function speakerFor(voice) {
    if (voice === 'ark') return '飞舟';
    if (voice === 'hall') return '展厅';
    if (voice === 'title') return '昆仑';
    return '昆仑';
  }

  // ---- 任务栏进度 ----
  function readProgress() {
    const spirits = (ctx.kunlun && ctx.kunlun.spiritsGot) ? ctx.kunlun.spiritsGot() : (ctx.store.getSpirits ? ctx.store.getSpirits().length : 0);
    const picks = (ctx.store.json('eternalPicks', []) || []).length;
    let ark = '尚未启程';
    if (spirits >= 6) ark = '六灵蕴归位';
    else if (spirits >= 1) ark = '飞舟已现';
    let main;
    if (spirits < 6) main = '集齐六合灵蕴';
    else if (picks < 1) main = '在永恒展厅挂上你的画';
    else main = '昆仑已亮，慢慢逛';
    return { spirits, picks, ark, main };
  }
  function refreshQuest() {
    if (!questEl) return;
    const p = readProgress();
    questEl.querySelector('.q-main').textContent = '◈ ' + p.main;
    const rows = [
      ['灵蕴', p.spirits + ' / 6'],
      ['展厅挂画', p.picks + ' / 20'],
      ['飞舟', p.ark],
    ];
    questEl.querySelector('.q-rows').innerHTML = rows
      .map((r) => `<div class="q-row"><span class="q-k">${r[0]}</span><span class="q-v">${r[1]}</span></div>`)
      .join('');
  }

  // ---- 菜单 ----
  function buildMenu() {
    menuEl = document.createElement('div');
    menuEl.id = 'gameMenu';
    menuEl.setAttribute('role', 'dialog');
    menuEl.setAttribute('aria-modal', 'true');
    menuEl.innerHTML = `
      <div class="gs-menu-card">
        <div class="m-title">昆 仑 灵 鉴</div>
        <div class="m-sub">藏梦人手札</div>
        <button class="m-btn" data-act="ask">问 昆 仑</button>
        <button class="m-btn" data-act="help">操 作 指 引</button>
        <button class="m-btn" data-act="quest">任 务 册</button>
        <button class="m-btn" data-act="close">继 续 游 历</button>
      </div>`;
    document.body.appendChild(menuEl);
    menuEl.querySelector('[data-act="ask"]').onclick = () => {
      menuApi.close();
      ctx.openDialog && ctx.openDialog({
        speaker: '昆仑',
        lines: [
          '凡人一念，可补天缺。你推开这扇门时，昆仑就亮了。',
          '去拾六合灵蕴罢——天、地、风、火、水、心。集齐了，飞舟自会来接你。',
        ],
      });
    };
    menuEl.querySelector('[data-act="help"]').onclick = () => {
      menuApi.close();
      ctx.openDialog && ctx.openDialog({
        speaker: '昆仑',
        lines: [
          'W A S D 行走，鼠标转望，空格起跳。',
          '走近发光的光柱即可拾取灵蕴；登上山巅的飞舟可巡游天穹。',
          '右上那枚朱印，随时唤出这本手札。',
        ],
      });
    };
    menuEl.querySelector('[data-act="quest"]').onclick = () => {
      menuApi.close();
      const p = readProgress();
      ctx.openDialog && ctx.openDialog({
        speaker: '当前任务',
        lines: [
          '主线 · ' + p.main,
          '灵蕴 ' + p.spirits + ' / 6　·　展厅挂画 ' + p.picks + ' / 20　·　飞舟 ' + p.ark,
        ],
      });
    };
    menuEl.querySelector('[data-act="close"]').onclick = () => menuApi.close();
    menuApi = ctx.overlay.register(menuEl, { display: 'flex', escapable: true, closeOnOutside: true });
  }

  // ---- 系统装配 ----
  const system = defineSystem({
    name: 'gameshell',
    layer: 'presentation',
    phase: 'ui',
    order: 6,
    init() {
      styleEl = document.createElement('style');
      styleEl.textContent = STYLE;
      document.head.appendChild(styleEl);

      dialogEl = document.createElement('div');
      dialogEl.id = 'gameDialog';
      dialogEl.setAttribute('role', 'dialog');
      dialogEl.setAttribute('aria-live', 'polite');
      dialogEl.innerHTML = `
        <div class="gs-name">昆仑</div>
        <div class="gs-text"></div>
        <div class="gs-choices"></div>
        <div class="gs-hint">▷ 点击继续</div>`;
      dialogEl.addEventListener('click', advance);
      document.body.appendChild(dialogEl);

      questEl = document.createElement('div');
      questEl.id = 'questHud';
      questEl.innerHTML = `
        <div class="q-title">任 务 册</div>
        <div class="q-main">◈ 集齐六合灵蕴</div>
        <div class="q-rows"></div>`;
      document.body.appendChild(questEl);
      refreshQuest();

      menuBtn = document.createElement('div');
      menuBtn.id = 'gsMenuBtn';
      menuBtn.textContent = '印';
      menuBtn.title = '唤出手札';
      menuBtn.onclick = () => { menuApi ? menuApi.open() : null; };
      document.body.appendChild(menuBtn);
      buildMenu();

      // 对话事件总线:其他模块可 ctx.events.emit('ui:dialog', {...})
      unsub = eventBus.on('ui:dialog', (o) => openDialog(o));

      // 升级昆仑开口:既播 TTS,又落进手绘框(所有现有 kunlunSpeak 调用自动生效)
      prevKunlunSpeak = ctx.ui.kunlunSpeak;
      ctx.ui.kunlunSpeak = (text, voice) => {
        if (prevKunlunSpeak) { try { prevKunlunSpeak(text, voice); } catch (e) {} }
        openDialog({ speaker: speakerFor(voice), lines: [text], autoHide: 9000 });
      };
      ctx.openDialog = openDialog;
    },
    update(dt) {
      acc += dt;
      if (acc >= 0.5) { acc = 0; refreshQuest(); }
    },
    dispose() {
      if (unsub) unsub();
      if (prevKunlunSpeak) ctx.ui.kunlunSpeak = prevKunlunSpeak;
      if (menuApi) menuApi.unregister();
      [styleEl, dialogEl, questEl, menuBtn, menuEl].forEach((n) => n && n.remove());
    },
  });
  return system;
}

export { createGameShellSystem };
