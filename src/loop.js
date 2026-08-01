// ============================================================
// 游戏主循环引擎 — 分阶段执行，支持暂停/恢复/时间缩放
// 2026-08-01 游戏引擎化改造
// ============================================================

/**
 * 游戏主循环。
 *
 * 四个阶段，按顺序执行：
 *   INPUT  — 处理原始输入事件（键盘/鼠标/触摸 → 抽象动作）
 *   UPDATE — 游戏逻辑更新（物理/AI/动画/状态机）
 *   RENDER — GPU 渲染（Three.js renderer）
 *   UI     — DOM 层更新（面板/文字/弹窗）
 *
 * 用法（新代码）：
 *   ctx.loop.on('update', (dt) => { ... });
 *   ctx.loop.on('render', (dt) => { ... });
 *
 * 旧 ctx.onTick(fn) 自动映射到 UPDATE 阶段，完全兼容。
 */
export class GameLoop {
  constructor() {
    /** @type {Object<string, Function[]>} */
    this._phases = { input: [], update: [], render: [], ui: [] };
    this._running = false;
    this._lastTime = 0;
    /** 时间缩放：1.0 = 正常速度，0.0 = 暂停，0.5 = 半速 */
    this.timeScale = 1.0;
    /** deltaTime 上限（ms），防止切标签页回来后瞬间跳帧 */
    this.maxDelta = 100;
  }

  /**
   * 注册函数到指定阶段。返回取消注册的函数。
   * @param {'input'|'update'|'render'|'ui'} phase
   * @param {Function} fn — 接收 (dt: number) 参数，dt 为秒数
   * @returns {Function} 取消注册
   */
  on(phase, fn) {
    if (!this._phases[phase]) throw new Error(`未知阶段: ${phase}`);
    this._phases[phase].push(fn);
    return () => this.off(phase, fn);
  }

  /** 取消注册 */
  off(phase, fn) {
    if (!this._phases[phase]) return;
    this._phases[phase] = this._phases[phase].filter((f) => f !== fn);
  }

  /** 启动主循环 */
  start() {
    if (this._running) return;
    this._running = true;
    this._lastTime = performance.now();
    this._frame();
  }

  /** 暂停 */
  pause() {
    this.timeScale = 0;
  }
  /** 恢复 */
  resume() {
    this.timeScale = 1;
  }

  _frame() {
    if (!this._running) return;
    requestAnimationFrame(() => this._frame());

    const now = performance.now();
    let dt = (now - this._lastTime) / 1000; // 秒
    this._lastTime = now;

    // 防止跳帧：切标签页回来 dt 可能几十秒
    if (dt > this.maxDelta / 1000) dt = this.maxDelta / 1000;
    dt *= this.timeScale;

    // 按阶段顺序执行
    for (const phase of ['input', 'update', 'render', 'ui']) {
      for (const fn of this._phases[phase]) {
        try {
          fn(dt);
        } catch (e) {
          console.warn('[loop:' + phase + ']', e.message);
        }
      }
    }
  }
}
