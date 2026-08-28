// ============================================================
// 时间缩放容器 — 仅持有 timeScale(暂停/恢复),供 LoopManager 读写
// 2026-08-29 死代码清理:移除从未被调用的 _phases/on/off/start/_frame 等阶段调度
// (阶段调度已由 loop-manager._executePhases 统一实现,此处的旧实现是冗余死代码)
// ============================================================

/**
 * GameLoop(历史命名,实为 timeScale 容器)
 *
 * 唯一真实职责:持有 timeScale,供 LoopManager 的 pause/resume/_frame 读写:
 *   - LoopManager.pause()  写 ctx.loop.timeScale = 0
 *   - LoopManager.resume() 写 ctx.loop.timeScale = 1
 *   - LoopManager._frame() 读 ctx.loop.timeScale 缩放 dt
 *
 * 旧的阶段注册(on/off)/start/rAF 主循环逻辑从未被调用
 * (主循环由 LoopManager 唯一驱动),已于 2026-08-29 删除。
 * pause/resume 作为 timeScale 的语义封装保留。
 */
export class GameLoop {
  constructor() {
    /** 时间缩放:1.0 = 正常速度,0.0 = 暂停,0.5 = 半速。由 LoopManager 读写。 */
    this.timeScale = 1.0;
  }

  /** 暂停(语义封装,等价于 timeScale=0) */
  pause() {
    this.timeScale = 0;
  }

  /** 恢复(语义封装,等价于 timeScale=1) */
  resume() {
    this.timeScale = 1;
  }
}
