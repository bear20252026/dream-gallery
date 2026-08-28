// core/perf-monitor-system.js — 性能监控积木(阶段3 切片,2026-08-28)
// 替代旧 src/scene/perf-monitor.js:
//   - 经 deps 注入 renderer,绝不直接读/写 ctx(原文件死导入 ctx 已删)
//   - 每帧 update(dt) 由唯一组合根循环驱动,消灭原文件在 ?perf 下自起的第二条 requestAnimationFrame
//   - 单测可孤立 init/dispose,不依赖全局总线
import { defineSystem, LAYERS, PHASES } from './system.js';

export function createPerfMonitorSystem(deps = {}) {
  const renderer = deps.renderer;
  let panel = null;
  let enabled = false;
  let frames = 0;
  let elapsedMs = 0;
  let lastPanelUpdate = 0;
  const fpsHistory = [];
  const MAX_SAMPLES = 60;

  function buildPanel() {
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
  }

  function updatePanel(fps) {
    if (!panel || !renderer) return;
    const info = renderer.info;
    const mem = info.memory;
    const render = info.render;
    let heap = 'N/A';
    if (performance.memory) {
      heap = (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1) + 'MB';
    }
    const fpsColor = fps >= 50 ? '#0f0' : fps >= 30 ? '#ff0' : '#f00';
    const sparkChars = '▁▂▃▄▅▆▇█';
    const sparkline = fpsHistory
      .slice(-30)
      .map((f) => sparkChars[Math.min(Math.floor(f / 10), sparkChars.length - 1)])
      .join('');
    const dcWarn = render.calls > 100 ? ' ⚠️' : '';
    panel.innerHTML = [
      `<span style="color:${fpsColor}">FPS: ${fps}</span>`,
      `Draw: ${render.calls}${dcWarn} | Tri: ${render.triangles}`,
      `Textures: ${mem.textures} | Geom: ${mem.geometries}`,
      `Heap: ${heap}`,
      `<span style="color:#888">${sparkline}</span>`,
    ].join('\n');
  }

  const system = defineSystem({
    name: 'perf-monitor',
    layer: LAYERS.engine,
    phase: PHASES.ui,
    order: 0,
    init() {
      // 仅在 ?perf / ?debug 参数时显示面板
      enabled = location.search.includes('perf') || location.search.includes('debug');
      if (!enabled) return;
      buildPanel();
    },
    update(dt) {
      if (!enabled || !renderer) return;
      frames++;
      elapsedMs += dt * 1000;
      const now = performance.now();
      if (elapsedMs >= 1000) {
        const fps = Math.round((frames * 1000) / elapsedMs);
        frames = 0;
        elapsedMs = 0;
        fpsHistory.push(fps);
        if (fpsHistory.length > MAX_SAMPLES) fpsHistory.shift();
        if (now - lastPanelUpdate > 500) {
          lastPanelUpdate = now;
          updatePanel(fps);
        }
      }
    },
    dispose() {
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
      panel = null;
      enabled = false;
    },
  });

  return system;
}
