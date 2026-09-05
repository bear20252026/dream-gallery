// scene-manager.js — 多世界场景切换核心(2026-09-05)
// 一个 renderer,多个 THREE.Scene;只切 active scene,不把小世界堆进主世界。
// 内容模块通过 registerWorld 注册,切换时统一保存相机/玩家快照与返回栈。
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { eventBus } from '../event-bus.js';
import { darkTeleport } from '../shared/teleport-fx.js';

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
    ctx.scene.getActiveRoot = () => this.getWorld()?.root;
    ctx.scene.getActiveGround = (x, z) => this.getWorld()?.ground(x, z);
    ctx.scene.getActiveBounds = () => this.getWorld()?.bounds;
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
    this.worldStack.push({ id: source.id, snapshot: sourceSnapshot });
    const commit = async () => {
      if (source.leave) await source.leave({ from: source, to: target, options });
      source.camera = sourceSnapshot.camera;
      source.player = sourceSnapshot.player;
      const avatar = ctx.scene.avatar;
      if (avatar && target.root && avatar.parent !== target.root) target.root.add(avatar);
      this.activeWorld = id;
      this.syncCtx();
      if (target.enter) await target.enter({ from: source, to: target, options });
      if (options.snapshot) this.restore(options.snapshot);
      else if (options.player) this.restore({ player: options.player, camera: options.camera });
      eventBus.emit('world:changed', { from: source.id, to: target.id });
    };
    try {
      await new Promise((resolve) =>
        darkTeleport(() => {
          commit().then(resolve).catch(resolve);
        })
      );
      this.transitioning = false;
      return true;
    } catch (e) {
      this.transitioning = false;
      this.activeWorld = source.id;
      this.syncCtx();
      return false;
    }
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
    const entry = this.worldStack[idx];
    this.worldStack.splice(idx);
    const ok = await this.enterWithoutPush('main', entry.snapshot, options);
    if (!ok) this.worldStack.push(entry);
    return ok;
  }

  async enterWithoutPush(id, snapshot, options = {}) {
    if (this.transitioning || id === this.activeWorld) return false;
    const target = this.getWorld(id);
    const source = this.getWorld();
    if (!target || !target.loaded || ctx.kunlun.flightLock) return false;
    this.transitioning = true;
    const commit = async () => {
      if (source.leave) await source.leave({ from: source, to: target, options });
      this.activeWorld = id;
      this.syncCtx();
      if (target.enter) await target.enter({ from: source, to: target, options });
      this.restore(snapshot);
      eventBus.emit('world:changed', { from: source.id, to: target.id });
    };
    await new Promise((resolve) =>
      darkTeleport(() => {
        commit().then(resolve).catch(resolve);
      })
    );
    this.transitioning = false;
    return true;
  }

  async dispose() {
    for (const world of this.worlds.values())
      if (world.id !== 'main' && world.dispose) world.dispose(world);
    this.worlds.clear();
  }
}

export function initSceneManager(options) {
  if (manager) return manager;
  manager = new SceneManager(options);
  ctx.scene.worldManager = manager;
  ctx.scene.activeWorld = 'main';
  ctx.scene.worldStack = manager.worldStack;
  ctx.scene.enterWorld = (id, opts) => manager.enter(id, opts);
  ctx.scene.leaveWorld = (opts) => manager.back(opts);
  ctx.scene.toMainWorld = (opts) => manager.toMain(opts);
  ctx.scene.worldChanged = (fn) => eventBus.on('world:changed', fn);
  return manager;
}
export function getSceneManager() {
  return manager;
}
