// perf-monitor.js — 性能监控面板(2026-08-22 大厂标准)
// 实时显示 FPS / draw calls / triangles / textures / JS heap
// 用法: import { initPerfMonitor } from './scene/perf-monitor.js'
//        initPerfMonitor(renderer);
// URL 加 ?perf 显示面板
import { ctx } from '../ctx.js';

let panel = null;
let fpsHistory = [];
const MAX_SAMPLES = 60;

/**
 * 初始化性能监控面板
 * @param {THREE.WebGLRenderer} renderer
 */
export function initPerfMonitor(renderer) {
  // 仅在 ?perf 参数时显示
  if (!location.search.includes('perf') && !location.search.includes('debug')) return;

  panel = document.createElement('div');
  panel.id = 'perf-monitor';
  Object.assign(panel.style, {
    position: 'fixed',
    top: '8px',
    left: '8px',
    background: 'rgba(0,0,0,0.75)',
    color: '#0f0',
    font: '11px monospace',
    padding: '6px 10px',
    borderRadius: '4px',
    zIndex: '10000',
    pointerEvents: 'none',
    lineHeight: '1.5',
    whiteSpace: 'pre',
  });
  document.body.appendChild(panel);

  let lastTime = performance.now();
  let frames = 0;
  let lastUpdate = 0;

  function tick() {
    frames++;
    const now = performance.now();
    const elapsed = now - lastTime;

    if (elapsed >= 1000) {
      const fps = Math.round((frames * 1000) / elapsed);
      frames = 0;
      lastTime = now;

      fpsHistory.push(fps);
      if (fpsHistory.length > MAX_SAMPLES) fpsHistory.shift();

      // 每 500ms 更新一次面板(避免 DOM 操作过频)
      if (now - lastUpdate > 500) {
        lastUpdate = now;
        updatePanel(renderer, fps);
      }
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

function updatePanel(renderer, fps) {
  if (!panel) return;

  const info = renderer.info;
  const mem = info.memory;
  const render = info.render;

  // JS heap
  let heap = 'N/A';
  if (performance.memory) {
    heap = (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1) + 'MB';
  }

  // FPS 颜色
  const fpsColor = fps >= 50 ? '#0f0' : fps >= 30 ? '#ff0' : '#f00';

  // FPS 图表(ASCII sparkline)
  const sparkChars = '▁▂▃▄▅▆▇█';
  const sparkline = fpsHistory
    .slice(-30)
    .map((f) => {
      const idx = Math.min(Math.floor(f / 10), sparkChars.length - 1);
      return sparkChars[idx];
    })
    .join('');

  // draw call 警告
  const dcWarn = render.calls > 100 ? ' ⚠️' : '';

  panel.innerHTML = [
    `<span style="color:${fpsColor}">FPS: ${fps}</span>`,
    `Draw: ${render.calls}${dcWarn} | Tri: ${render.triangles}`,
    `Textures: ${mem.textures} | Geom: ${mem.geometries}`,
    `Heap: ${heap}`,
    `<span style="color:#888">${sparkline}</span>`,
  ].join('\n');
}
