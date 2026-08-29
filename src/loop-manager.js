// ============================================================
// 循环管理器 — 合并双循环，统一游戏主循环
// 2026-08-22 架构优化
// ============================================================

import { eventBus } from './event-bus.js';

/**
 * 循环管理器
 * 合并旧的 an() 循环和新的 ctx.loop，统一游戏主循环
 */
export class LoopManager {
  constructor(ctx) {
    this.ctx = ctx;
    this._running = false;
    this._lastTime = 0;
    this._lastPosT = 0;
    this._lastDayT = 0;
    this._lastPlsT = 0;
    
    // 自适应画质
    this.PR_STEPS = [Math.min(devicePixelRatio, 2), 1.5, 1.25, 1];
    this.prIdx = 0;
    this.prLastChange = 0;
    this.fpsAcc = 0;
    this.fpsCnt = 0;
    this.lowQuality = false;
    
    // 性能监控
    this.frameCount = 0;
    this.fps = 0;
    this.fpsUpdateInterval = 1000; // 每秒更新一次 FPS
    this.lastFpsUpdate = 0;
  }

  /**
   * 启动统一循环
   */
  start() {
    if (this._running) return;
    this._running = true;
    this._lastTime = performance.now();
    this._frame();
    
    // 触发循环启动事件
    eventBus.emit('loop:started');
  }

  /**
   * 暂停循环
   */
  pause() {
    this.ctx.loop.timeScale = 0;
    eventBus.emit('loop:paused');
  }

  /**
   * 恢复循环
   */
  resume() {
    this.ctx.loop.timeScale = 1;
    eventBus.emit('loop:resumed');
  }

  /**
   * 设置低画质模式
   * @param {boolean} on - 是否开启低画质
   */
  setLowQuality(on) {
    this.lowQuality = !!on;
    try {
      this.ctx.store.setJson('lowQuality', this.lowQuality);
    } catch (e) {}
    this.prIdx = this.lowQuality ? this.PR_STEPS.length - 1 : 0;
    this.ctx.scene.rnd.setPixelRatio(this.PR_STEPS[this.prIdx]);
    if (this.ctx.ui.modeToast) {
      this.ctx.ui.modeToast(
        this.lowQuality ? '已切到「低画质·流畅」(PixelRatio=1)' : '已恢复「高画质·自动」'
      );
    }
    eventBus.emit('loop:qualityChanged', this.lowQuality);
  }

  /**
   * 自适应画质
   * @param {number} now - 当前时间
   * @param {number} dt - 帧间隔（秒）
   */
  adaptiveQuality(now, dt) {
    if (this.lowQuality) {
      // 手动低画质:钉死最低档,不再自适应回升
      if (this.prIdx !== this.PR_STEPS.length - 1) {
        this.prIdx = this.PR_STEPS.length - 1;
        this.ctx.scene.rnd.setPixelRatio(this.PR_STEPS[this.prIdx]);
      }
      return;
    }
    
    this.fpsAcc += dt;
    this.fpsCnt++;
    if (this.fpsAcc < 2) return; // 每 2 秒评估一次
    
    const avg = this.fpsCnt / this.fpsAcc;
    this.fpsAcc = 0;
    this.fpsCnt = 0;
    
    if (now - this.prLastChange < 3000) return;
    if (avg < 35 && this.prIdx < this.PR_STEPS.length - 1) {
      this.prIdx++;
      this.ctx.scene.rnd.setPixelRatio(this.PR_STEPS[this.prIdx]);
      this.prLastChange = now;
    } else if (avg > 52 && this.prIdx > 0) {
      this.prIdx--;
      this.ctx.scene.rnd.setPixelRatio(this.PR_STEPS[this.prIdx]);
      this.prLastChange = now;
    }
  }

  /**
   * 主循环帧
   */
  _frame() {
    if (!this._running) return;
    requestAnimationFrame(() => this._frame());

    const now = performance.now();
    let dt = Math.min((now - this._lastTime) / 1000, 0.1);
    this._lastTime = now;
    // 兼容暂停:timeScale 由 LoopManager.pause/resume 写入 ctx.loop.timeScale
    dt *= this.ctx.loop.timeScale ?? 1;
    
    // 更新 FPS 计数
    this.frameCount++;
    if (now - this.lastFpsUpdate > this.fpsUpdateInterval) {
      this.fps = Math.round(this.frameCount * 1000 / (now - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = now;
      eventBus.emit('loop:fps', this.fps);
    }
    
    // 自适应画质
    this.adaptiveQuality(now, dt);

    // 执行游戏循环阶段
    this._executePhases(dt, now);
    
    // 触发帧完成事件
    eventBus.emit('loop:frame', { dt, now, fps: this.fps });
  }

  /**
   * 执行游戏循环阶段
   * @param {number} dt - 帧间隔（秒）
   * @param {number} now - 当前时间
   */
  _executePhases(dt, now) {
    const { ctx } = this;
    const { jD, ks, pl, mv, drM } = ctx.player;
    const { cam, rnd, pls, WH, skyUniforms, groundUniforms } = ctx.scene;
    const { desert, dayHour } = ctx.media;

    // 1. INPUT 阶段 - 处理输入
    this._executeInputPhase(dt, now);
    
    // 2. UPDATE 阶段 - 游戏逻辑更新
    this._executeUpdatePhase(dt, now);
    
    // 3. RENDER 阶段 - GPU 渲染
    this._executeRenderPhase(dt, now);
    
    // 4. UI 阶段 - DOM 层更新
    this._executeUIPhase(dt, now);
  }

  /**
   * 执行输入阶段
   * @param {number} dt - 帧间隔（秒）
   * @param {number} now - 当前时间
   */
  _executeInputPhase(dt, now) {
    // 统一输入阶段:由 InputManager 触发已绑定动作回调并复位鼠标增量
    if (this.ctx.input && this.ctx.input.tick) {
      this.ctx.input.tick(dt);
    }
  }

  /**
   * 执行更新阶段
   * @param {number} dt - 帧间隔（秒）
   * @param {number} now - 当前时间
   */
  _executeUpdatePhase(dt, now) {
    const { ctx } = this;
    const { jD, ks, pl, mv, drM } = ctx.player;
    const { cam, pls, WH, skyUniforms, groundUniforms } = ctx.scene;
    const { desert, dayHour } = ctx.media;

    // 画廊移动逻辑
    let mx = jD.x, mz = jD.z;
    if (ks.w || ks.arrowup) mz += 1;
    if (ks.s || ks.arrowdown) mz -= 1;
    if (ks.a || ks.arrowleft) mx -= 1;
    if (ks.d || ks.arrowright) mx += 1;
    const mg = Math.sqrt(mx * mx + mz * mz);
    if (mg > 0.1) {
      mx /= mg;
      mz /= mg;
      const fx = -Math.sin(pl.y), fz = -Math.cos(pl.y),
            rx = Math.cos(pl.y), rz = -Math.sin(pl.y);
      mv(fx * mz + rx * mx, fz * mz + rz * mx, dt);
    }
    
    // 跳跃/滑翔物理
    if (ctx.player.tickPhysics) ctx.player.tickPhysics(dt);
    
    // 相机每帧同步
    this._updateCamera(dt, now);
    
    // 沙漠区块/水面/飞鸟/沙暴逐帧更新
    if (desert) desert.update(dt, now * 0.001);
    
    // 统一昼夜
    const hour = (12 + now / 2500) % 24;
    ctx.media.dayHour = hour;
    if (desert && now - this._lastDayT > 100) {
      this._lastDayT = now;
      desert.dayNight(hour);
    }
    
    // 滑翔时视野拉宽
    const tFov = pl.gliding ? 82 : ctx.player.viewMode === 1 ? 50 : 75;
    if (Math.abs(cam.fov - tFov) > 0.01) {
      cam.fov += (tFov - cam.fov) * dt * 4;
      cam.updateProjectionMatrix();
    }
    
    // 吊灯闪烁 10Hz 节流
    if (now - this._lastPlsT > 100) {
      this._lastPlsT = now;
      pls.forEach((p, i) => {
        p.l.intensity = p.base * (1 + Math.sin(now * 0.002 + i * 1.3) * 0.06);
      });
    }
    
    // 更新天空 uniform
    skyUniforms.uTime.value = performance.now() * 0.001;
    groundUniforms.uTime.value = performance.now() * 0.001;
    skyUniforms.uCameraPos.value.copy(pl.p);
    groundUniforms.uCameraPos.value.copy(pl.p);

    // 注:烟花(updateFireworks)/漂浮粒子已迁出到 EffectsSystem(engine/animate),
    // 音乐画布(drawMusicCanvas)/视频墙纹理已迁出到 MediaSystem(presentation/render),
    // 二者均经组合根唯一单循环经 ctx.tickers 驱动,不再在此上帝渲染器散点读取。

    // 执行旧的 tickers（向后兼容）
    for (const fn of ctx.tickers) {
      try {
        fn(dt);
      } catch (e) {
        console.warn('[loop:tickers]', e.message);
      }
    }
  }

  /**
   * 更新相机
   * @param {number} dt - 帧间隔（秒）
   * @param {number} now - 当前时间
   */
  _updateCamera(dt, now) {
    const { ctx } = this;
    const { pl } = ctx.player;
    const { cam, avatar, desert } = ctx.scene;

    if (ctx.player.viewMode === 1) {
      // 第三人称
      const fx = -Math.sin(pl.y), fz = -Math.cos(pl.y);
      const back = 1.3;
      const up = 1.0;
      const bx = pl.p.x - fx * back;
      const bz = pl.p.z - fz * back;
      if (avatar) avatar.visible = true;
      let cy = pl.p.y + up;
      if (desert) {
        const gy = desert.getH(bx, bz);
        if (cy < gy + 0.35) cy = gy + 0.35;
      }
      cam.position.set(bx, cy, bz);
      cam.lookAt(pl.p.x, pl.p.y + 1.0, pl.p.z);
      cam.fov = 50;
      cam.updateProjectionMatrix();
      if (avatar) {
        avatar.position.copy(pl.p);
        avatar.position.y = 0.1;
        avatar.rotation.y = pl.y + Math.PI;
      }
    } else {
      // 第一人称
      if (avatar) avatar.visible = false;
      cam.position.copy(pl.p);
      cam.rotation.y = pl.y;
      cam.rotation.x = pl.pi;
      if (pl.gliding) {
        cam.position.y += Math.sin(now * 0.008) * 0.04 + Math.sin(now * 0.013) * 0.02;
        cam.position.x += Math.sin(now * 0.005) * 0.02;
      }
    }
  }

  /**
   * 执行渲染阶段
   * @param {number} dt - 帧间隔（秒）
   * @param {number} now - 当前时间
   */
  _executeRenderPhase(dt, now) {
    const { ctx } = this;
    const { renderPostProcessing, rnd, s, cam } = ctx.scene;

    // 注:视频墙纹理 needsUpdate 已迁出到 MediaSystem(presentation/render),由组合根单循环驱动。
    // 后处理渲染(优先,composer 渲染整场景);若后处理未接入则退回直接渲染,避免场景空白。
    if (renderPostProcessing) {
      renderPostProcessing();
    } else if (rnd && s && cam) {
      rnd.render(s, cam);
    }
  }

  /**
   * 执行 UI 阶段
   * @param {number} dt - 帧间隔（秒）
   * @param {number} now - 当前时间
   */
  _executeUIPhase(dt, now) {
    const { ctx } = this;
    const { pl, drM } = ctx.player;

    // 更新坐标显示（降频到每 200ms）
    if (now - this._lastPosT > 200) {
      this._lastPosT = now;
      const posEl = document.getElementById('posD');
      if (posEl) {
        posEl.textContent =
          'X:' + pl.p.x.toFixed(2) + ' | Y:' + pl.p.y.toFixed(2) + ' | Z:' + pl.p.z.toFixed(2);
      }
    }
    
    // 小地图重绘
    if (drM) drM();
  }

  /**
   * 获取当前 FPS
   * @returns {number}
   */
  getFPS() {
    return this.fps;
  }

  /**
   * 获取性能信息
   * @returns {Object}
   */
  getPerformanceInfo() {
    return {
      fps: this.fps,
      lowQuality: this.lowQuality,
      pixelRatio: this.ctx.scene.rnd.getPixelRatio(),
      timeScale: this.ctx.loop.timeScale,
    };
  }
}
