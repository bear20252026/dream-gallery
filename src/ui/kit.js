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
