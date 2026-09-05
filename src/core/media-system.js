// core/media-system.js — 媒体逐帧逻辑(阶段3 切片:presentation/render)
// 原 scene/media.js 的逐帧产物(音乐画布 drawMusicCanvas + 视频墙纹理 needsUpdate)
// 原本散落在 LoopManager._executeUpdatePhase / _executeRenderPhase 里直接读 ctx.media.* ——
// 属于上帝渲染器的散点读取。现抽成独立 System:
//   · 经 deps 注入 media(冻结命名空间引用),调用其既有方法,绝不直接写 ctx;
//   · update() 由组合根唯一单循环驱动(与 toast/audio/effects/perf 同一通道);
//   · 视频纹理 30Hz 节流状态自管,dispose 无资源需释放(画布/视频元素归 media 所有)。
import { defineSystem } from './system.js';

export function createMediaSystem(deps = {}) {
  const { media } = deps;
  if (!media) {
    throw new Error('[media-system] 缺少 media 依赖(ctx.media 冻结命名空间)');
  }
  let lastVidT = 0;

  return defineSystem({
    name: 'media',
    layer: 'presentation',
    phase: 'render',
    order: 0,
    deps: { media },
    init() {
      // 无独立初始化:画布与视频元素由 media.js 负责创建,本系统仅驱动其逐帧更新
    },
    update() {
      // 多世界切割(2026-09-06):音乐画布重绘/视频纹理上传只属主世界(小世界省 CPU/带宽)
      if ((ctx.scene.activeWorld || 'main') !== 'main') return;
      // 音乐画布(2D 可视化,每帧重绘)
      if (typeof media.drawMusicCanvas === 'function') media.drawMusicCanvas();
      // 视频墙纹理更新(30Hz 节流,标记 needsUpdate 供下一帧渲染上传)
      const now = performance.now();
      if (now - lastVidT > 33) {
        lastVidT = now;
        const { vidTex, vidEl, v45Tex, v45El } = media;
        if (vidTex && vidEl && vidEl.readyState >= 2 && !vidEl.paused) vidTex.needsUpdate = true;
        if (v45Tex && v45El && v45El.readyState >= 2 && !v45El.paused) v45Tex.needsUpdate = true;
      }
    },
    dispose() {
      lastVidT = 0;
    },
  });
}
