// teleport-fx.js — 传送过渡遮罩(金色光环版本,永恒展厅/飞舟共用)
// 用法:import {goldenTeleport} from '../shared/teleport-fx.js';
//      goldenTeleport(()=>{ /* 执行位移 */ },()=>{ /* 淡出完成回调 */ });

export function goldenTeleport(onMid, onDone) {
  const ov = document.createElement('div');
  ov.style.cssText =
    'position:fixed;inset:0;z-index:390;background:radial-gradient(circle,#fff3d0,#e8b860);opacity:0;transition:opacity .45s;pointer-events:none';
  document.body.appendChild(ov);
  requestAnimationFrame(() => {
    ov.style.opacity = '1';
  });
  setTimeout(() => {
    if (onMid) onMid();
    ov.style.opacity = '0';
    setTimeout(() => {
      ov.remove();
      if (onDone) onDone();
    }, 500);
  }, 480);
}
