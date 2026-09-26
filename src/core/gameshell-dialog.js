// core/gameshell-dialog.js — GameShell 对话框状态机(2026-08-30 B5 从 gameshell-system.js 外迁)
// 职责:打字机逐行渲染 / 点击推进 / 选项分支 / 自动隐藏 / 说话人命名 / **台词朗读**(2026-09-24)。
// 纯表现层:不持有场景/物理状态;DOM 容器由 gameshell-system 创建后经 attach() 注入。
import {
  speakLine,
  stopSpeaking,
  installMuteBtn,
  prefetchLine,
  isVoiceOff,
  isVoicePlaying,
  isVoiceStarted,
  onVoiceStart,
  onVoiceEnd,
} from './dialog-voice.mjs';
import { dwellFor } from '../shared/typing-rhythm.mjs';

export function createDialogSystem() {
  let dlg = null; // {speaker, lines, idx, choices, onDone, typeTimer, hideTimer, typing}
  let dialogEl = null;
  let lockQueue = []; // lock 占用时的剧本对话排队(2026-09-10 衔接修复:丢弃=断链)

  function attach(element) {
    dialogEl = element;
    installMuteBtn(element); // 台词朗读开关(会话级,sessionStorage)
  }
  function el(id) {
    return document.getElementById(id);
  }

  function renderDialog() {
    if (!dlg) return;
    const nameEl = dialogEl.querySelector('.gs-name');
    const textEl = dialogEl.querySelector('.gs-text');
    const chEl = dialogEl.querySelector('.gs-choices');
    const hintEl = dialogEl.querySelector('.gs-hint');
    nameEl.textContent = dlg.speaker || 'B612';
    chEl.innerHTML = '';
    hintEl.style.display = 'none';
    typeLine(dlg.lines[dlg.idx] || '');
    // 台词朗读(2026-09-24):每行显示即读;新行顶旧行不排队
    speakLine(dlg.lines[dlg.idx] || '', dlg.speakerType);
    // 预取(2026-09-24 建;2026-09-26 窗口 1→2 行):当前行朗读的同时,把后续两行的
    // 语音预热进浏览器/服务端缓存 —— 推进时声音即刻开口,不再等合成空窗
    if (dlg.idx < dlg.lines.length - 1) prefetchLine(dlg.lines[dlg.idx + 1] || '', dlg.speakerType);
    if (dlg.idx < dlg.lines.length - 2) prefetchLine(dlg.lines[dlg.idx + 2] || '', dlg.speakerType);
  }
  function typeLine(str) {
    const textEl = dialogEl.querySelector('.gs-text');
    dlg.typing = true;
    clearTimeout(dlg.typeTimer);
    textEl.innerHTML = '';
    const caret = document.createElement('span');
    caret.className = 'gs-caret';
    caret.textContent = '✎';
    textEl.appendChild(caret);
    let i = 0;
    // 自适应节奏(2026-09-24 流畅度):普通字恒速,标点驻留(逗号轻顿/句末重顿),
    // 台词打字从"机关枪"变成"说话的呼吸感"。setTimeout 递归取代 setInterval。
    const step = () => {
      // 打字过程中对话可能已被关闭/切换(onDone 链会立刻开下一条)——空手而归
      if (!dlg) return;
      if (i >= str.length) {
        dlg.typing = false;
        textEl.textContent = str;
        onLineDone();
        return;
      }
      const ch = str[i];
      textEl.textContent = str.slice(0, ++i);
      textEl.appendChild(caret);
      dlg.typeTimer = setTimeout(step, dwellFor(ch));
    };
    dlg.typeTimer = setTimeout(step, 0);
  }
  function onLineDone() {
    clearTimeout(dlg.hideTimer);
    const last = dlg.idx >= dlg.lines.length - 1;
    if (last) {
      if (dlg.choices && dlg.choices.length) {
        showChoices();
      } else if (dlg.autoHide) {
        // 语音联动(2026-09-26 主人问「放太快了吗」):对白 autoHide 9s < 长台词朗读时长,
        // 语音会被 closeDialog 掐断。改为:台词语音播完后再起 autoHide 倒计时;
        // 静音/无语音时行为照旧。15s 兜底在 onVoiceEnd 内,关闭不会被无限拖延。
        if (isVoicePlaying()) {
          // 加载提示(2026-09-26 主人报「声音加载过慢」):晚高峰跨境开播 15~21s,
          // 白屏静默像坏了 —— 亮「加载中」提示,首次出声即熄(玩家知道在等什么)
          const hintEl = dialogEl.querySelector('.gs-hint');
          if (hintEl && !isVoiceStarted()) {
            hintEl.textContent = '(♪ 语音加载中…)';
            hintEl.style.display = 'block';
            onVoiceStart(() => {
              const h = dialogEl.querySelector('.gs-hint');
              if (h) {
                h.textContent = '';
                h.style.display = 'none';
              }
            });
          }
          onVoiceEnd(() => {
            if (dlg && dlg.autoHide) dlg.hideTimer = setTimeout(closeDialog, dlg.autoHide);
          });
        } else {
          if (isVoiceOff() && dlg.autoHide > 6000) {
            // 静音状态下提醒一次:防止主人误点过静音钮而不自知(2026-09-26 主人报台词无声)
            const hintEl = dialogEl.querySelector('.gs-hint');
            if (hintEl) {
              hintEl.textContent = '(台词朗读已静音 — 点右上角 🔇 可恢复)';
              hintEl.style.display = 'block';
            }
          }
          dlg.hideTimer = setTimeout(closeDialog, dlg.autoHide);
        }
      }
    }
  }
  function advance() {
    if (!dlg) return;
    if (dlg.typing) {
      // 点击=秒显本行
      clearTimeout(dlg.typeTimer);
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
        // suppressDone(2026-09-26 互动化):点选项=玩家接管剧情推进,旧对话的 onDone
        // (链式收束)必须让位——否则旧链 onDone 与新链 onClick 双线并行,剧情竞态
        closeDialog(true);
        if (cb) cb(c.value);
      };
      chEl.appendChild(b);
    });
  }
  function closeDialog(suppressDone) {
    const d = dlg;
    if (d && d.typeTimer) clearTimeout(d.typeTimer);
    if (d && d.hideTimer) clearTimeout(d.hideTimer);
    dlg = null;
    dialogEl.style.display = 'none';
    delete dialogEl.dataset.spk;
    stopSpeaking(); // 台词朗读随对话框关闭停止(朗读长于阅读时,别让声音拖到下一场)
    // 收束回调(2026-09-07):此前 onDone 只存不调,依赖它的链式对话(剧本第2场)会断链
    if (d && d.onDone && !suppressDone) {
      try {
        d.onDone();
      } catch (e) {
        console.warn('[gameshell] onDone 异常:', e.message);
      }
    }
    // 锁空且有排队的剧本对话 → 补播(2026-09-10 衔接修复)
    // 经 openDialog 重入:若 onDone 链已抢先开新锁,这里会自动回队,不硬抢
    if (!suppressDone && !dlg && lockQueue.length) {
      const next = lockQueue.shift();
      setTimeout(() => openDialog(next), 60); // 小让位:给 onDone 链的开窗留一拍
    }
  }
  function openDialog(opts) {
    if (!opts) return;
    // lock 互斥(2026-09-07 剧本对话容错;2026-09-10 由丢弃改排队):
    // 上一条 lock 对话未收束时,后来的 lock 对话进 FIFO 队尾等锁空补播——
    // 静默丢弃会让该链永远停在这一步(旧档叫醒词吞掉桥段台词/chainBusy 死锁的根因)
    if (opts.lock && dlg && dlg.lock) {
      if (lockQueue.length > 20) lockQueue.shift(); // 封顶防积压
      lockQueue.push(opts);
      return;
    }
    const lines = Array.isArray(opts.lines)
      ? opts.lines
      : [opts.lines != null ? String(opts.lines) : ''];
    if (!lines.length) lines.push('');
    // 打断式换对话(2026-09-09 容错):旧 onDone 延后到新对话装好后再收束——
    // 同步收束会让旧链抢先 openDialog 下一条,再被本次 dlg=... 覆盖,链直接断死
    if (dlg) {
      const prev = dlg.onDone;
      closeDialog(true);
      if (prev)
        setTimeout(() => {
          try {
            prev();
          } catch (e) {
            console.debug('[gameshell-dialog] 被打断的旧 onDone 回调出错(不阻断新链):', e);
          }
        }, 0);
    }
    dlg = {
      speaker: opts.speaker || 'B612',
      speakerType: opts.speakerType || '',
      lines,
      idx: 0,
      choices: opts.choices || null,
      autoHide:
        opts.autoHide != null ? opts.autoHide : opts.choices && opts.choices.length ? 0 : 9000,
      onDone: opts.onDone || null,
      lock: !!opts.lock,
      typing: false,
      typeTimer: null,
      hideTimer: null,
    };
    // 整组预取(2026-09-26 真实取证定案):探针证实剧情链对话条与条间隔小于合成时长,
    // 旧行音频还没开播就被下一条顶掉(AbortError)→ 全程无声。开对话瞬间把**全部行**
    // 丢进合成队列 —— 本条对话的后续行、以及链式下一条的行,到达时缓存已命中、秒出声。
    // 自愈覆盖所有对话源(story-text / crash-site 硬编码 / quiz / 菜单),不再依赖预生成清单。
    for (let pi = 1; pi < lines.length; pi++) prefetchLine(lines[pi] || '', dlg.speakerType);
    dialogEl.style.display = 'block';
    // 说话人视觉类型:prince/pilot/sheep/rose → 不同边框+名字色
    dialogEl.dataset.spk = dlg.speakerType;
    renderDialog();
  }
  function speakerFor(voice) {
    if (voice === 'ark') return '飞舟';
    if (voice === 'hall') return '展厅';
    if (voice === 'title') return 'B612';
    return 'B612';
  }

  return { attach, open: openDialog, close: closeDialog, advance, speakerFor, isOpen: () => !!dlg };
}
