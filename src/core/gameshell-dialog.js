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
      speaker: opts.speaker || 'B612',
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
    if (voice === 'title') return 'B612';
    return 'B612';
  }

  return { attach, open: openDialog, close: closeDialog, advance, speakerFor };
}
