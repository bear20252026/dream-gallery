import { Z } from '../shared/z-layers.mjs';
// ui/kit.js — 界面反馈组件库(2026-08-30 统一四份拷贝:spirits/finale/eternal/ark)
// 中央大字弹窗:全屏居中文字,淡入 → 停留 → 淡出自毁。四模块原实现视觉一致
// (z=389/同款文字阴影),仅 ark 用略小字号与不同默认停留时长,经参数保留差异。
export function bigText(text, opts) {
  const { hold = 1800, after = null, small = false } = opts || {};
  const d = document.createElement('div');
  d.style.cssText =
    'position:fixed;inset:0;z-index:389;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity .5s';
  const inner = document.createElement('div');
  inner.style.cssText =
    (small
      ? 'max-width:86vw;text-align:center;font-size:clamp(19px,4.6vw,30px);'
      : 'max-width:86vw;text-align:center;font-size:clamp(20px,5vw,32px);') +
    'letter-spacing:3px;color:#ffe9c4;text-shadow:0 0 30px rgba(255,200,100,.6),0 2px 12px rgba(0,0,0,.8);line-height:1.9';
  inner.textContent = text;
  d.appendChild(inner);
  document.body.appendChild(d);
  requestAnimationFrame(() => {
    d.style.opacity = '1';
  });
  setTimeout(() => {
    d.style.opacity = '0';
    setTimeout(() => {
      d.remove();
      if (after) after();
    }, 600);
  }, hold);
}

// 顶部状态条(单例):avatar.js 等模块的"加载中/就绪"提示统一入口。
// show 替换文本并重置自动隐藏定时器;hide 立即淡出。
let _sb = null;
export function statusBar() {
  if (_sb) return _sb;
  let el = null, timer = 0;
  const ensure = () => {
    if (el) return;
    el = document.createElement('div');
    el.style.cssText =
      'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:' + Z.kickNotice + ';padding:8px 16px;border-radius:20px;background:rgba(20,10,30,.85);color:#fff;font:13px/1.4 system-ui;border:1px solid rgba(255,255,255,.2);box-shadow:0 4px 12px rgba(0,0,0,.4);pointer-events:none;transition:opacity .4s;white-space:nowrap';
    document.body.appendChild(el);
  };
  _sb = {
    show(msg, color, autoHideMs) {
      ensure();
      el.textContent = msg;
      el.style.borderColor = color || 'rgba(255,255,255,.2)';
      el.style.opacity = '1';
      if (timer) clearTimeout(timer);
      if (autoHideMs) timer = setTimeout(() => { el.style.opacity = '0'; }, autoHideMs);
    },
    hide() {
      if (el) el.style.opacity = '0';
    },
  };
  return _sb;
}
