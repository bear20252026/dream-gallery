// ============================================================
// 循环管理器 — 合并双循环，统一游戏主循环
// 2026-08-22 架构优化
// ============================================================

import { eventBus } from './event-bus.js';
import { EYE_HEIGHT } from './shared/constants.js';
import { ORBIT_DEFAULTS } from './shared/constants.js';

/**
 * 玩家眼睛离地高度(米)——与 scene/player.js 的 `groundY(x,z) + 1.6` 保持一致。
 * pl.p.y 存的是**眼睛**高度,而第三人称角色模型的原点在**脚底**,
 * 所以渲染角色时要减掉这个值才能得到贴地的脚底位置。
 */
// EYE_HEIGHT 已迁至 shared/constants.js(B2 整改,物理眼高单一来源)

// 射线-AABB slab 求交(解析法,零分配,免 THREE 依赖):
// 返回沿 (dx,dy,dz) 方向自 (ox,oy,oz) 起到命中 AABB 的距离;
// 起点在盒内返回 0,未命中返回 Infinity。用于 Spring Arm 相机的遮挡裁决。
function rayAABB(ox, oy, oz, dx, dy, dz, mnX, mxX, mnY, mxY, mnZ, mxZ) {
  let tmin = -Infinity, tmax = Infinity;
  if (dx !== 0) { const t1 = (mnX - ox) / dx, t2 = (mxX - ox) / dx; tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2)); }
  else if (ox < mnX || ox > mxX) return Infinity;
  if (dy !== 0) { const t1 = (mnY - oy) / dy, t2 = (mxY - oy) / dy; tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2)); }
  else if (oy < mnY || oy > mxY) return Infinity;
  if (dz !== 0) { const t1 = (mnZ - oz) / dz, t2 = (mxZ - oz) / dz; tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2)); }
  else if (oz < mnZ || oz > mxZ) return Infinity;
  return tmax >= tmin && tmax >= 0 ? Math.max(tmin, 0) : Infinity;
}
// 角色模型朝向(弧度,heading 语义:-sin/-cos 方向)。第三人称下平滑转向移动方向。
// 用角度插值避免 ±π 边界跳变(如从 179° 转到 -179° 走最短弧而不是绕远路)。
let _modelYaw = 0;
function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

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
    // 低档位 0.75(2026-08-30 按用户要求撤掉 0.5 档):第三人称角色(12 万三角面蒙皮
    // +全场景光照)会把弱 GPU 拖到个位数帧率,需要降档兜底;但 0.5 倍渲染分辨率
    // 画面明显发糊,用户不可接受 —— 0.75 是"略软但可玩"的下限。
    this.PR_STEPS = [Math.min(devicePixelRatio, 2), 1.5, 1.25, 1, 0.75];
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
    // 阈值(2026-08-30 收紧):<25 才降档(此前 35 太激进,流畅时也降糊);
    // >45 即回升(此前 52 太苛刻,升不回去,长期停留在糊档)。
    if (avg < 25 && this.prIdx < this.PR_STEPS.length - 1) {
      this.prIdx++;
      this.ctx.scene.rnd.setPixelRatio(this.PR_STEPS[this.prIdx]);
      this.prLastChange = now;
    } else if (avg > 45 && this.prIdx > 0) {
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
    const { jD, ks, pl, mv, drawMap } = ctx.player;
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
    const { jD, ks, pl, mv, drawMap } = ctx.player;
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
      // 移动基准朝向:第一人称=玩家朝向 pl.y;第三人称=轨道相机朝向(所见即所往)
      const yawSrc = ctx.player.viewMode === 1 && ctx._orbit ? ctx._orbit.yaw : pl.y;
      const fx = -Math.sin(yawSrc), fz = -Math.cos(yawSrc),
            rx = Math.cos(yawSrc), rz = -Math.sin(yawSrc);
      const wx = fx * mz + rx * mx, wz = fz * mz + rz * mx;
      mv(wx, wz, dt);
      // 角色平滑转向实际移动方向(最短弧,≈0.7s 转 90°),消除"横移滑步"观感;
      // 静止时不转向(保持原地朝向,环绕相机可自由看正脸/背影)
      const target = Math.atan2(-wx, -wz);
      _modelYaw = lerpAngle(_modelYaw, target, Math.min(dt * 9, 1));
      // pl.y 跟随角色朝向:切回第一人称视角无缝、滑翔方向计算保持一致
      if (ctx.player.viewMode === 1) pl.y = _modelYaw;
    } else if (ctx.player.viewMode !== 1) {
      _modelYaw = pl.y; // 第一人称:角色朝向即玩家朝向
    }
    
    // 跳跃/滑翔/重力物理(player.js tickPhysics,经 Object.assign 挂 ctx.player)
    // ⚠️ 2026-08-30 B2 收敛:历史上函数被挂到扁平 ctx.tickPhysics 而此处读
    //   ctx.player.tickPhysics,断链导致物理从未运行(角色"贴地飞行")。
    //   现单一入口 ctx.player.tickPhysics;保留 warn 作断链金丝雀。
    const tickPhysics = ctx.player.tickPhysics;
    if (tickPhysics) {
      tickPhysics(dt);
    } else if (!this._warnedNoPhysics) {
      this._warnedNoPhysics = true;
      console.warn('[loop-manager] 未找到 tickPhysics,重力/跳跃/滑翔物理未启用');
    }
    
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
      // 第三人称:轨道相机(2026-08-30 重写)
      // 旧版相机钉死在角色背后 pl.y 反方向、高度固定 —— 看不到正脸、俯仰被钳死。
      // 现在由 player.js 的 orbit {yaw, pitch, dist} 驱动:拖拽环绕、滚轮/双指缩放。
      if (avatar) avatar.visible = true;
      // 第三人称 Spring Arm 弹簧臂(2026-08-30 穿地修复,方案经用户审批):
      // 相机只拥有"臂长 curDist"一个量 —— 碰撞立即收缩,畅通后指数弹回;
      // 用户缩放意图 ob.dist 永不被污染(收缩量不回写,避开 OrbitControls 回写坑)。
      // 时序契约:本段在 UPDATE 阶段执行 —— 玩家移动/tickPhysics 之后、渲染之前。
      const ob = ctx._orbit || { yaw: pl.y, pitch: ORBIT_DEFAULTS.pitch, dist: ORBIT_DEFAULTS.dist };
      const cp = Math.cos(ob.pitch), sp = Math.sin(ob.pitch);
      const footY = pl.p.y - EYE_HEIGHT; // 角色脚底世界高度
      const px = pl.p.x, py = footY + 0.9, pz = pl.p.z; // 射线原点 = 角色胸口(与 lookAt 同轴)

      // -- 1) 理想机位(未收缩) --
      const fx = Math.sin(ob.yaw) * cp, fz = Math.cos(ob.yaw) * cp;
      const ix = px + fx * ob.dist, iy = py + sp * ob.dist, iz = pz + fz * ob.dist;

      // -- 2) 射线碰撞:胸口 → 理想机位,对建筑碰撞盒求交(解析 slab 法,零分配) --
      // bounds 盒只有 XZ 脚印(墙体足够高),Y 覆盖 0~8m 全楼层。
      // 不对 1788 个场景网格做射线(three.js 论坛证实地形网格射线极慢)。
      const rig = ctx._camRig || (ctx._camRig = { curDist: ob.dist });
      let safeDist = ob.dist;
      {
        const vx = ix - px, vy = iy - py, vz = iz - pz;
        const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
        const dx = vx / len, dy = vy / len, dz = vz / len;
        const boxes = ctx.scene.bounds || [];
        for (let i = 0; i < boxes.length; i++) {
          const b = boxes[i];
          const t = rayAABB(px, py, pz, dx, dy, dz, b.mnX, b.mxX, 0, 8, b.mnZ, b.mxZ);
          if (t < safeDist) safeDist = Math.max(t - 0.25, 0.8); // 安全距离 0.25m,最小臂长 0.8m
        }
      }

      // -- 3) 非对称平滑:收缩立即生效(安全第一),恢复指数弹回(k=6,约 0.4s) --
      if (safeDist < rig.curDist) rig.curDist = safeDist;
      else rig.curDist += (safeDist - rig.curDist) * (1 - Math.exp(-6 * dt));
      const dist = rig.curDist;

      const bx = px + fx * dist, bz = pz + fz * dist;

      // -- 4) 地面兜底(解析法,不做地形射线):全局地板 y=0 与室外沙丘取高者 --
      // 展厅室内地板是 y≈0 平板而 desert.getH 返回室外地形(可至 -0.23),
      // 旧版只钳 getH → 相机钻进室内地板下;取 max 后室内外都不会穿。
      let floorY = desert ? desert.getH(bx, bz) : 0;
      if (floorY < 0) floorY = 0;
      let cy = py + sp * dist; // pitch>0:相机升高俯视;pitch<0:压低仰视
      if (cy < floorY + 0.3) cy = floorY + 0.3; // 安全距离 0.3m

      cam.position.set(bx, cy, bz);
      // 视线目标:角色胸口;相机被地面钳制时目标随之抬高 ——
      // 避免旧 bug"相机贴着地板还朝下看,脚印出现在画面上方"。
      const ty = Math.max(footY + 0.85, floorY + 0.5);
      cam.lookAt(px, ty, pz);
      if (avatar) {
        avatar.position.copy(pl.p);
        // 脚底贴地:pl.p.y 是眼睛高度(由 player.js tickPhysics 算出 = groundY + 1.6)
        avatar.position.y = footY;
        // 角色朝向 = 模型朝向(移动时平滑转向移动方向,静止保持,环绕看正脸)
        avatar.rotation.y = _modelYaw + Math.PI;
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
    const { pl, drawMap } = ctx.player;

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
    if (drawMap) drawMap();
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
