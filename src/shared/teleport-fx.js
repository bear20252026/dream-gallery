import { Z } from './z-layers.mjs';
// teleport-fx.js — 传送过渡遮罩(金色光环版本,永恒展厅/飞舟共用)
// 用法:import {goldenTeleport} from '../shared/teleport-fx.js';
//      goldenTeleport(()=>{ /* 执行位移 */ },()=>{ /* 淡出完成回调 */ });

export function goldenTeleport(onMid, onDone) {
  const ov = document.createElement('div');
  ov.style.cssText =
    'position:fixed;inset:0;z-index:' + Z.veilFx + ';background:radial-gradient(circle,#fff3d0,#e8b860);opacity:0;transition:opacity .45s;pointer-events:none';
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

// darkTeleport — 深色遮罩版传送过渡(2026-08-30 从 scene/player.js 下沉统一)
// 与 goldenTeleport 并列:小地图点图传送/回家键共用;其他模块经 ctx.kunlun.fadeTeleport 复用
export function darkTeleport(onMid) {
  const ov = document.createElement('div');
  ov.style.cssText =
    'position:fixed;inset:0;z-index:' + Z.teleport + ';background:#0a0510;opacity:0;pointer-events:none;transition:opacity .18s ease';
  document.body.appendChild(ov);
  ov.style.opacity = '1';
  setTimeout(() => {
    if (onMid) onMid();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ov.style.opacity = '0';
        setTimeout(() => ov.remove(), 260);
      });
    });
  }, 180);
}
