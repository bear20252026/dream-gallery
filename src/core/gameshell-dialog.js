// core/gameshell-dialog.js — GameShell 对话框状态机(2026-08-30 B5 从 gameshell-system.js 外迁)
// 职责:打字机逐行渲染 / 点击推进 / 选项分支 / 自动隐藏 / 说话人命名。
// 纯表现层:不持有场景/物理状态;DOM 容器由 gameshell-system 创建后经 attach() 注入。
export function createDialogSystem() {
  let dlg = null; // {speaker, lines, idx, choices, onDone, typeTimer, hideTimer, typing}
  let dialogEl = null;

  function attach(element) {
    dialogEl = element;
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
    const timerId = setInterval(() => {
      // 打字过程中对话可能已被关闭/切换(onDone 链会立刻开下一条)——空手而归
      if (!dlg) {
        clearInterval(timerId);
        return;
      }
      if (i >= str.length) {
        clearInterval(timerId);
        dlg.typing = false;
        textEl.textContent = str;
        onLineDone();
        return;
      }
      textEl.textContent = str.slice(0, ++i);
      textEl.appendChild(caret);
    }, 38);
    dlg.typeTimer = timerId;
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
  function closeDialog(suppressDone) {
    const d = dlg;
    if (d && d.typeTimer) clearInterval(d.typeTimer);
    if (d && d.hideTimer) clearTimeout(d.hideTimer);
    dlg = null;
    dialogEl.style.display = 'none';
    delete dialogEl.dataset.spk;
    // 收束回调(2026-09-07):此前 onDone 只存不调,依赖它的链式对话(剧本第2场)会断链
    if (d && d.onDone && !suppressDone) {
      try {
        d.onDone();
      } catch (e) {
        console.warn('[gameshell] onDone 异常:', e.message);
      }
    }
  }
  function openDialog(opts) {
    if (!opts) return;
    // lock 互斥(2026-09-07 剧本对话容错):带 lock 的 openDialog 在上一条 lock 对话
    // 尚未关闭时静默忽略,防止多系统 speakSeq 互相覆盖导致对话链断裂
    if (opts.lock && dlg && dlg.lock) return;
    const lines = Array.isArray(opts.lines) ? opts.lines : [opts.lines != null ? String(opts.lines) : ''];
    if (!lines.length) lines.push('');
    // 打断式换对话(2026-09-09 容错):旧 onDone 延后到新对话装好后再收束——
    // 同步收束会让旧链抢先 openDialog 下一条,再被本次 dlg=... 覆盖,链直接断死
    if (dlg) {
      const prev = dlg.onDone;
      closeDialog(true);
      if (prev) setTimeout(() => { try { prev(); } catch (e) {} }, 0);
    }
    dlg = {
      speaker: opts.speaker || 'B612',
      speakerType: opts.speakerType || '',
      lines,
      idx: 0,
      choices: opts.choices || null,
      autoHide: opts.autoHide != null ? opts.autoHide : (opts.choices && opts.choices.length ? 0 : 9000),
      onDone: opts.onDone || null,
      lock: !!opts.lock,
      typing: false,
      typeTimer: null,
      hideTimer: null,
    };
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
