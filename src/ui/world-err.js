// world-err.js — 世界启动失败兜底 UI(2026-09-18 自 main.js 外迁,结构审计 P3a)
// 模块加载失败多为网络抖动,重载即愈;缺项详情留在 console(__bootCheck/__worldPhase)。
import { Z } from '../shared/z-layers.mjs';

export function showWorldLoadError() {
  if (document.getElementById('worldErr')) return;
  const d = document.createElement('div');
  d.id = 'worldErr';
  d.style.cssText =
    'position:fixed;inset:0;z-index:' +
    (Z.loading + 1) +
    ';display:flex;flex-direction:column;gap:20px;align-items:center;justify-content:center;' +
    'background:#f3ead2;color:#4e4237;font-family:Georgia,serif;text-align:center;padding:24px';
  const t = document.createElement('div');
  t.style.cssText = 'font-size:19px;letter-spacing:3px';
  t.textContent = '世界没能落进画里';
  const s = document.createElement('div');
  s.style.cssText = 'font-size:13px;opacity:.75;letter-spacing:1px;line-height:1.9';
  s.textContent = '大概是网络抖了一下。检查连接后,重新开始这段旅程。';
  const b = document.createElement('button');
  b.textContent = '重 新 加 载';
  b.style.cssText =
    'padding:12px 34px;border:1px solid rgba(90,72,50,.45);border-radius:24px;background:transparent;' +
    'color:#4e4237;font-size:15px;letter-spacing:4px;cursor:pointer;font-family:inherit';
  b.onclick = function () {
    location.reload();
  };
  d.appendChild(t);
  d.appendChild(s);
  d.appendChild(b);
  document.body.appendChild(d);
}
