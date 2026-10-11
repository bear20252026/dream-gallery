// scene-manager.js — 多世界场景切换核心(2026-09-05)
// 一个 renderer,多个 THREE.Scene;只切 active scene,不把小世界堆进主世界。
// 内容模块通过 registerWorld 注册,切换时统一保存相机/玩家快照与返回栈。
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { eventBus } from '../event-bus.js';
// 2026-10-04 主人反馈「跳转不要黑屏」:世界切换改走星流过场(shared/warp-fx.js),目的地名在中心浮现
import { runWarp } from '../shared/warp-fx.js';
import { warpDest } from '../shared/warp-labels.mjs';
import { tt } from '../shared/story-text.mjs';

function warpOpts(id) {
  const d = warpDest(id);
  return d ? { label: tt(d.label), color: d.color } : {};
}

let manager = null;

function cloneVec(v) {
  return v ? v.clone() : new THREE.Vector3();
}
function snapshotCamera(cam) {
  return cam
    ? {
        position: cloneVec(cam.position),
        quaternion: cam.quaternion.clone(),
        fov: cam.fov,
        near: cam.near,
        far: cam.far,
      }
    : null;
}
function restoreCamera(cam, snap) {
  if (!cam || !snap) return;
  cam.position.copy(snap.position);
  cam.quaternion.copy(snap.quaternion);
  if (snap.fov !== undefined) cam.fov = snap.fov;
  if (snap.near !== undefined) cam.near = snap.near;
  if (snap.far !== undefined) cam.far = snap.far;
  cam.updateProjectionMatrix();
}
/** 把第三人称角色迁回它切换前的父节点(切换半途失败时用;home 为空则摘干净) */
function reparentAvatar(avatar, home) {
  if (!avatar) return false;
  if (home) {
    if (avatar.parent === home) return false;
    home.add(avatar);
    return true;
  }
  if (!avatar.parent) return false;
  avatar.parent.remove(avatar);
  return true;
}

export class SceneManager {
  constructor({ renderer, camera, mainScene, player }) {
    this.renderer = renderer;
    this.camera = camera;
    this.player = player || null;
    this.worlds = new Map();
    this.activeWorld = 'main';
    this.worldStack = [];
    this.transitioning = false;
    this.registerWorld('main', { scene: mainScene, persistent: true });
    // 后处理管线绑定的是主世界场景;非主世界时置空,让 LoopManager 回退到 rnd.render(activeScene)
    this._mainPost = ctx.scene.renderPostProcessing || null;
    this.syncCtx();
  }

  registerWorld(id, descriptor = {}) {
    if (!id || this.worlds.has(id)) throw new Error('scene-manager: world 已存在「' + id + '」');
    const scene = descriptor.scene || new THREE.Scene();
    const world = {
      id,
      scene,
      root: descriptor.root || scene,
      fog: descriptor.fog === undefined ? scene.fog : descriptor.fog,
      background: descriptor.background === undefined ? scene.background : descriptor.background,
      ground: descriptor.ground || (() => undefined),
      bounds: descriptor.bounds || null,
      enter: descriptor.enter || null,
      leave: descriptor.leave || null,
      dispose: descriptor.dispose || null,
      camera: null,
      player: null,
      meta: descriptor.meta || {},
      loaded: descriptor.loaded !== false,
    };
    this.worlds.set(id, world);
    return world;
  }

  unregisterWorld(id) {
    if (id === 'main' || id === this.activeWorld) return false;
    const world = this.worlds.get(id);
    if (!world) return false;
    if (world.dispose) world.dispose(world);
    this.worlds.delete(id);
    return true;
  }

  getWorld(id = this.activeWorld) {
    return this.worlds.get(id) || null;
  }
  hasWorld(id) {
    return this.worlds.has(id);
  }
  listWorlds() {
    return [...this.worlds.values()].map((w) => ({ id: w.id, loaded: w.loaded, meta: w.meta }));
  }

  syncCtx() {
    const world = this.getWorld();
    if (!world) return;
    // ctx.scene.s 是既有主循环唯一渲染入口,换引用即可保持旧系统兼容。
    ctx.scene.s = world.scene;
    ctx.scene.activeWorld = world.id;
    // 后处理跟随主世界;其他世界直接渲染,避免 postprocessing 把主场景画回来。
    // _mainPost 正常路径由 main.js 在 initPostProcessing 后 setMainPost() 注入
    //(构造期早于后处理初始化,构造时抓到的恒为 null);此处的兜底补抓只防
    //「未注入就切世界」的边缘序,因为进入过非主世界后 ctx 里的值已被自己置 null。
    if (world.id === 'main') {
      if (!this._mainPost) this._mainPost = ctx.scene.renderPostProcessing || null;
      ctx.scene.renderPostProcessing = this._mainPost;
    } else {
      ctx.scene.renderPostProcessing = null;
    }
    ctx.scene.getActiveRoot = () => this.getWorld()?.root;
    ctx.scene.getActiveGround = (x, z) => this.getWorld()?.ground(x, z);
    ctx.scene.getActiveBounds = () => this.getWorld()?.bounds;
    // 多世界切割(2026-09-07 P3 单轨化):UI 世界归属完全由元素自声明——
    //   创建处标 `data-world-ui="main"`(只主世界显示)或 `"space"`(只太空世界显示);
    //   默认 display 非 block 的再加 `data-world-ui-display="block"`。
    // syncCtx 切世界时统一扫描。此前硬编码 MAIN_ONLY_UI/SPACE_ONLY_UI 清单的旧机制
    // 已删除(12 个元素全部完成自声明迁移;双轨并存会因双重保存把 display:'none'
    // 存进恢复表,导致回主世界后无法还原——2026-09-07 实测)。
    // 清单成员:小地图 #m、任务册 #questHud、操作提示 #hp、AI 配文 #aiPanel、
    // 残镜 #prologueMirror、沙漠昼夜钟/地形/准星/热浪(desert/atmosphere.js)、
    // B612语录 #skyNote(audio-manager.js)、⌂ 回归出生点 #homeBtn、▼ 下降键(glide-hud)。
    // 跳/滑翔钮 #jumpBtnGlide 刻意保留(太空=升空推进)。
    const show = world.id === 'main';
    document.body.dataset.world = world.id;
    if (!this._uiSaved) this._uiSaved = new Map();
    const uiSaved = this._uiSaved;
    const toggleEl = (el, visible, visibleDisplay) => {
      if (visible) {
        el.style.display = uiSaved.has(el) ? uiSaved.get(el) : visibleDisplay || '';
        uiSaved.delete(el);
      } else if (!uiSaved.has(el)) {
        uiSaved.set(el, el.style.display);
        el.style.display = 'none';
      }
    };
    document.querySelectorAll('[data-world-ui]').forEach((el) => {
      const claim = el.getAttribute('data-world-ui');
      if (claim === 'space') {
        // 太空专属:默认隐藏,进太空显式恢复声明的显示态
        const elH = /** @type {HTMLElement} */ (el);
        elH.style.display = show ? 'none' : elH.getAttribute('data-world-ui-display') || 'block';
        return;
      }
      toggleEl(el, claim === 'main' ? show : true, el.getAttribute('data-world-ui-display') || '');
    });
  }

  // main.js 后处理管线就绪后注入(main.js 组合根唯一调用);同步期只认这份引用
  setMainPost(fn) {
    this._mainPost = fn || null;
    if (this.activeWorld === 'main') ctx.scene.renderPostProcessing = this._mainPost;
  }

  capture() {
    const p = this.player && (this.player.pl || this.player);
    return {
      camera: snapshotCamera(this.camera),
      player:
        p && p.p
          ? {
              position: cloneVec(p.p),
              yaw: p.y,
              pitch: p.pi,
              vy: p.vy,
              onGround: p.onGround,
              gliding: p.gliding,
              glideEnergy: p.glideEnergy,
            }
          : null,
    };
  }

  restore(snapshot) {
    if (!snapshot) return;
    restoreCamera(this.camera, snapshot.camera);
    const p = this.player && (this.player.pl || this.player);
    if (p && p.p && snapshot.player) {
      p.p.copy(snapshot.player.position);
      if (snapshot.player.yaw !== undefined) p.y = snapshot.player.yaw;
      if (snapshot.player.pitch !== undefined) p.pi = snapshot.player.pitch;
      if (snapshot.player.vy !== undefined) p.vy = snapshot.player.vy;
      if (snapshot.player.onGround !== undefined) p.onGround = snapshot.player.onGround;
      if (snapshot.player.gliding !== undefined) p.gliding = snapshot.player.gliding;
      if (snapshot.player.glideEnergy !== undefined) p.glideEnergy = snapshot.player.glideEnergy;
    }
  }

  async enter(id, options = {}) {
    if (this.transitioning || id === this.activeWorld) return false;
    const target = this.getWorld(id);
    const source = this.getWorld();
    if (!target || !target.loaded) return false;
    if (ctx.kunlun.flightLock) return false;
    this.transitioning = true;
    const sourceSnapshot = this.capture();
    const avatarHome = ctx.scene.avatar ? ctx.scene.avatar.parent : null;
    this.worldStack.push({ id: source.id, snapshot: sourceSnapshot });
    let enteredTarget = false;
    const commit = async () => {
      if (source.leave) await source.leave({ from: source, to: target, options });
      source.camera = sourceSnapshot.camera;
      source.player = sourceSnapshot.player;
      const avatar = ctx.scene.avatar;
      if (avatar && target.root && avatar.parent !== target.root) target.root.add(avatar);
      this.activeWorld = id;
      this.syncCtx();
      if (target.enter) await target.enter({ from: source, to: target, options });
      enteredTarget = true;
      if (options.snapshot) this.restore(options.snapshot);
      else if (options.player) this.restore({ player: options.player, camera: options.camera });
      eventBus.emit('world:changed', { from: source.id, to: target.id });
    };
    try {
      let commitError = null;
      await runWarp(
        () =>
          commit().catch((e) => {
            commitError = e;
          }),
        warpOpts(id)
      );
      this.transitioning = false;
      if (commitError) {
        console.error('[scene-manager] world enter failed:', source.id, '→', id, commitError);
        await this.rollbackEnter({
          source,
          target,
          snapshot: sourceSnapshot,
          avatarHome,
          enteredTarget,
          dropStackEntry: true,
        });
        return false;
      }
      return true;
    } catch (e) {
      this.transitioning = false;
      console.error('[scene-manager] world enter failed(过场):', source.id, '→', id, e);
      await this.rollbackEnter({
        source,
        target,
        snapshot: sourceSnapshot,
        avatarHome,
        enteredTarget,
        dropStackEntry: true,
      });
      return false;
    }
  }

  /**
   * 切换半途失败的回滚(2026-10-11 DG-WORLD-001)。
   * 旧实现只 pop 栈 + 改世界指针:角色可能仍挂在别的 Scene 的 root 上、进场前的快照也没还原,
   * 于是出现「activeWorld=main 但 avatar 在 B612」的半回滚态。
   * 现:撤销本次压栈 → 指针与 syncCtx → 角色迁回切换前的父节点 → 恢复切换前快照;
   * target.enter 已跑完时才对称调 target.leave 撤它的进场副作用。
   * 刻意不新造半套生命周期:enter 未跑完(钩子缺失或自身抛错)就不碰 target,
   * 也不替 source 补调 enter —— 当前所有世界都没注册 enter/leave 钩子,补了反而无账可核。
   */
  async rollbackEnter({
    source,
    target,
    snapshot = null,
    avatarHome = null,
    enteredTarget = false,
    dropStackEntry = false,
    options = {},
  }) {
    if (!source) return;
    if (dropStackEntry && this.worldStack.length) this.worldStack.pop();
    this.activeWorld = source.id;
    // 优先回到切换前的确切父节点;切换前没父节点则按"角色住在活动世界 root"的约定挂回 source.root
    reparentAvatar(ctx.scene.avatar, avatarHome || source.root);
    this.syncCtx();
    if (enteredTarget && target && target.leave) {
      try {
        await target.leave({ from: target, to: source, options });
      } catch (e) {
        console.warn('[scene-manager] 回滚时 target.leave 失败:', target.id, e);
      }
    }
    this.restore(snapshot);
  }

  async back(options = {}) {
    const entry = this.worldStack.pop();
    if (!entry) return false;
    const ok = await this.enterWithoutPush(entry.id, entry.snapshot, options);
    if (!ok) this.worldStack.push(entry);
    return ok;
  }

  async toMain(options = {}) {
    const idx = this.worldStack.map((x) => x.id).lastIndexOf('main');
    if (idx < 0) return false;
    // 成功时把"回主世界之后的历史"压平(丢掉 idx 及以上)是有意设计;失败必须整段还原,
    // 否则中间历史(如 [B612, king])被 splice 掉就永久丢了(2026-10-11 DG-WORLD-001)。
    const removed = this.worldStack.splice(idx);
    const entry = removed[0];
    const ok = await this.enterWithoutPush('main', entry.snapshot, options);
    if (!ok) this.worldStack.splice(idx, 0, ...removed);
    return ok;
  }

  async enterWithoutPush(id, snapshot, options = {}) {
    if (this.transitioning || id === this.activeWorld) return false;
    const target = this.getWorld(id);
    const source = this.getWorld();
    if (!target || !target.loaded || ctx.kunlun.flightLock) return false;
    this.transitioning = true;
    const sourceSnapshot = this.capture();
    const avatarHome = ctx.scene.avatar ? ctx.scene.avatar.parent : null;
    let enteredTarget = false;
    const commit = async () => {
      if (source.leave) await source.leave({ from: source, to: target, options });
      // 第三人称角色随世界走:enter() 有这段,enterWithoutPush(返回主世界走此路)此前漏了,
      // 角色会遗留在原世界场景里,返回后第三人称视角看不到自己(2026-09-06 修复)
      const avatar = ctx.scene.avatar;
      if (avatar && target.root && avatar.parent !== target.root) target.root.add(avatar);
      this.activeWorld = id;
      this.syncCtx();
      if (target.enter) await target.enter({ from: source, to: target, options });
      enteredTarget = true;
      this.restore(snapshot);
      eventBus.emit('world:changed', { from: source.id, to: target.id });
    };
    // 提交半程失败(leave/enter/restore 抛错)原被 .catch(() => {}) 吞掉:指针可能停在
    // 半装配状态且调用方(back/toMain)拿到 true 以为成功。现回滚并按 false 返回,
    // 调用方的"未成"恢复路径(重武装门/信标)才接得到信号(2026-10-09 空 catch 治理)
    let commitOk = true;
    await runWarp(
      () =>
        commit().catch(async (e) => {
          commitOk = false;
          console.warn('[scene-manager] 世界切换提交失败:', source.id, '→', id, e);
          await this.rollbackEnter({
            source,
            target,
            snapshot: sourceSnapshot,
            avatarHome,
            enteredTarget,
            options,
          });
        }),
      warpOpts(id)
    );
    this.transitioning = false;
    return commitOk;
  }

  async dispose() {
    for (const world of this.worlds.values())
      if (world.id !== 'main' && world.dispose) world.dispose(world);
    this.worlds.clear();
    this.worldStack.length = 0;
    this.transitioning = false;
    // 模块级单例必须随之归零:否则再次 initSceneManager() 拿到的是连 main 都清空的旧 manager
    // (2026-10-11 DG-WORLD-001)。worldStack 就地清空,ctx.scene.worldStack 的引用仍然有效。
    if (manager === this) manager = null;
  }
}

export function initSceneManager(options) {
  if (manager) return manager;
  manager = new SceneManager(options);
  ctx.scene.worldManager = manager;
  ctx.scene.activeWorld = 'main';
  ctx.scene.worldStack = manager.worldStack;
  ctx.scene.enterWorld = (id, opts) => (manager ? manager.enter(id, opts) : false);
  ctx.scene.leaveWorld = (opts) => (manager ? manager.back(opts) : false);
  ctx.scene.toMainWorld = (opts) => (manager ? manager.toMain(opts) : false);
  ctx.scene.worldChanged = (fn) => eventBus.on('world:changed', fn);
  return manager;
}
export function getSceneManager() {
  return manager;
}
