// scene-manager-rollback.test.js — 世界切换的失败回滚(2026-10-11 DG-WORLD-001)
// 用最小假 world/scene(不实例化真的 Three 场景)钉死:半途失败后世界指针、avatar 归属、
// 切换前快照、返回栈还原,以及 dispose 后单例归零可重新 init。
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// 过场动画要真 DOM/canvas,node 里直接执行 commit(时序与 holdWarp 托住时一致)
vi.mock('../shared/warp-fx.js', () => ({
  runWarp: async (commit) => {
    await commit();
  },
  holdWarp: async () => {},
  releaseWarp: () => {},
  warpTransition: (mid) => mid && mid(),
  lockWarpLabel: () => {},
  warpState: () => ({ on: false, held: 0, alpha: 0, speed: 0 }),
}));

const realDocument = globalThis.document;

/**
 * node 环境没有 DOM:scene-manager 经 ctx.js 会拉起 InputManager(绑 document 监听)、
 * syncCtx(扫 [data-world-ui])。给一个只记录不行为的最小 document。
 */
function makeDocumentStub() {
  const el = () => ({
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    attributes: {},
    setAttribute() {},
    getAttribute() {
      return null;
    },
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    querySelectorAll: () => [],
    textContent: '',
  });
  return {
    body: Object.assign(el(), { dataset: {} }),
    documentElement: el(),
    head: el(),
    addEventListener() {},
    removeEventListener() {},
    createElement: el,
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

/** 够用的向量替身:capture/restore 只用 clone/copy */
function v3(x = 0, y = 0, z = 0) {
  return {
    x,
    y,
    z,
    clone() {
      return v3(this.x, this.y, this.z);
    },
    copy(o) {
      this.x = o.x;
      this.y = o.y;
      this.z = o.z;
      return this;
    },
  };
}

/** 假 Object3D 容器:add/remove 维护 parent(scene 与 root 同一个) */
function makeNode(name) {
  const node = {
    name,
    children: [],
    add(o) {
      if (o.parent && o.parent !== node) o.parent.remove(o);
      o.parent = node;
      node.children.push(o);
      return node;
    },
    remove(o) {
      const i = node.children.indexOf(o);
      if (i >= 0) node.children.splice(i, 1);
      if (o.parent === node) o.parent = null;
      return node;
    },
  };
  return node;
}

function makeCamera() {
  return {
    position: v3(0, 1.6, 0),
    quaternion: v3(0, 0, 0),
    fov: 60,
    near: 0.1,
    far: 1000,
    updateProjectionMatrix() {},
  };
}

let SceneManager, initSceneManager, getSceneManager, ctx;

beforeAll(async () => {
  globalThis.document = makeDocumentStub();
  const mod = await import('../core/scene-manager.js');
  SceneManager = mod.SceneManager;
  initSceneManager = mod.initSceneManager;
  getSceneManager = mod.getSceneManager;
  ctx = (await import('../ctx.js')).ctx;
});

afterAll(() => {
  globalThis.document = realDocument;
});

/** 搭一套 main + b + c 三个世界;avatar 起初挂在 main 上 */
function harness() {
  const roots = { main: makeNode('mainRoot'), b: makeNode('bRoot'), c: makeNode('cRoot') };
  const camera = makeCamera();
  const player = { pl: { p: v3(1, 2, 3), y: 0.5, pi: 0.1, vy: 0, onGround: true } };
  const avatar = { name: 'avatarHolder', parent: null };
  const calls = [];
  const mkWorld = (id) => ({
    enter: async (info) => {
      calls.push(['enter', id, info.from.id]);
    },
    leave: async (info) => {
      calls.push(['leave', id, info.to.id]);
    },
  });
  const m = new SceneManager({ renderer: {}, camera, mainScene: roots.main, player });
  m.registerWorld('b', { scene: makeNode('bScene'), root: roots.b, ...mkWorld('b') });
  m.registerWorld('c', { scene: makeNode('cScene'), root: roots.c, ...mkWorld('c') });
  roots.main.add(avatar);
  ctx.scene.avatar = avatar;
  return { m, roots, camera, player, avatar, calls };
}

describe('scene-manager 失败回滚', () => {
  it('enter 半途失败:世界指针、avatar、快照、返回栈全部回到切换前', async () => {
    const { m, roots, player, avatar, calls } = harness();
    const world = m.getWorld('b');
    world.enter = async () => {
      throw new Error('B612 资产加载失败');
    };
    const ok = await m.enter('b');
    expect(ok).toBe(false);
    expect(m.activeWorld).toBe('main');
    expect(ctx.scene.activeWorld).toBe('main');
    expect(avatar.parent).toBe(roots.main); // 关键:不留「指针在 main、角色在 b」
    expect(roots.b.children).not.toContain(avatar);
    expect(m.worldStack.length).toBe(0);
    expect(m.transitioning).toBe(false);
    expect(player.pl.p.x).toBe(1);
    expect(calls).toEqual([]); // b.enter 抛错 → 不补调半套 leave
  });

  it('enter 在 target.enter 之后才失败:对称撤销 target.leave,并还原切换前玩家位置', async () => {
    const { m, roots, player, avatar, calls } = harness();
    const world = m.getWorld('b');
    world.enter = async (info) => {
      calls.push(['enter', 'b', info.from.id]);
    };
    player.pl.p.x = 7; // capture 之前先挪一下,回滚应恢复到这个值
    const before = { ...player.pl.p };
    // options.player 给了但没有 position → commit 在 enter 之后的 restore 里抛
    const ok = await m.enter('b', { player: {} });
    expect(ok).toBe(false);
    expect(m.activeWorld).toBe('main');
    expect(avatar.parent).toBe(roots.main);
    expect(player.pl.p.x).toBe(before.x);
    expect(m.getWorld('main').camera).toBeTruthy(); // source 的相机快照已缓存,供下次进入还原
    expect(calls.map((c) => c[0])).toEqual(['enter', 'leave']); // 撤掉已完成的进场
    expect(calls[1][1]).toBe('b');
  });

  it('成功的 enter 正常压栈并把 avatar 迁到目标 root(回滚不得改动成功路径)', async () => {
    const { m, roots, avatar, calls } = harness();
    expect(await m.enter('b')).toBe(true);
    expect(m.activeWorld).toBe('b');
    expect(avatar.parent).toBe(roots.b);
    expect(m.worldStack.map((x) => x.id)).toEqual(['main']);
    expect(calls.map((c) => c[0])).toEqual(['enter']); // main 由构造函数注册,没有 leave 钩子
    expect(await m.enter('c')).toBe(true);
    expect(calls.map((c) => c.join(':'))).toEqual(['enter:b:main', 'leave:b:c', 'enter:c:b']);
    expect(m.worldStack.map((x) => x.id)).toEqual(['main', 'b']);
    expect(avatar.parent).toBe(roots.c);
  });

  it('toMain 失败:被 splice 掉的中间历史整段逐字还原', async () => {
    const { m, roots, avatar } = harness();
    await m.enter('b');
    await m.enter('c');
    const before = m.worldStack.slice();
    expect(before.map((x) => x.id)).toEqual(['main', 'b']);
    m.getWorld('main').enter = async () => {
      throw new Error('主世界进不去');
    };
    const ok = await m.toMain();
    expect(ok).toBe(false);
    expect(m.activeWorld).toBe('c');
    expect(m.worldStack).toEqual(before);
    expect(m.worldStack[0]).toBe(before[0]); // 条目本体也是原样还回去,不是重建
    expect(m.worldStack[1]).toBe(before[1]);
    expect(m.worldStack.map((x) => x.id)).toEqual(['main', 'b']);
    expect(avatar.parent).toBe(roots.c);
    expect(ctx.scene.activeWorld).toBe('c');
  });

  it('toMain 成功:回主世界之后的历史被压平(有意设计)', async () => {
    const { m } = harness();
    await m.enter('b');
    await m.enter('c');
    m.getWorld('main').enter = null; // 成功路径
    const ok = await m.toMain();
    expect(ok).toBe(true);
    expect(m.activeWorld).toBe('main');
    expect(m.worldStack.length).toBe(0);
  });

  it('back 失败同样还原栈', async () => {
    const { m } = harness();
    await m.enter('b');
    await m.enter('c');
    m.getWorld('b').enter = async () => {
      throw new Error('回不去');
    };
    expect(await m.back()).toBe(false);
    expect(m.activeWorld).toBe('c');
    expect(m.worldStack.map((x) => x.id)).toEqual(['main', 'b']);
  });

  it('dispose 归零模块级单例,再次 init 得到连 main 都齐的新 manager', async () => {
    const opts = {
      renderer: {},
      camera: makeCamera(),
      mainScene: makeNode('sceneA'),
      player: { pl: { p: v3(), y: 0 } },
    };
    const m1 = initSceneManager(opts);
    m1.registerWorld('temp', { scene: makeNode('sceneTemp') });
    expect(getSceneManager()).toBe(m1);
    await m1.dispose();
    expect(getSceneManager()).toBeNull();
    expect(m1.getWorld('temp')).toBeNull();
    const m2 = initSceneManager(opts);
    expect(m2).not.toBe(m1);
    expect(m2.getWorld('main')).toBeTruthy();
    expect(m2.worldStack.length).toBe(0);
    expect(getSceneManager()).toBe(m2);
    await m2.dispose();
    expect(getSceneManager()).toBeNull();
  });

  it('单例已 dispose 后,总线上的 enterWorld/leaveWorld 不再抛错', async () => {
    const m = initSceneManager({
      renderer: {},
      camera: makeCamera(),
      mainScene: makeNode('sceneB'),
    });
    await m.dispose();
    expect(ctx.scene.enterWorld('nope')).toBe(false);
    expect(await ctx.scene.leaveWorld()).toBe(false);
    expect(await ctx.scene.toMainWorld()).toBe(false);
  });
});
