// scene-manager-transition.test.js — 世界切换核心的"锁死"与"只滚一次"(第六轮审计 M-05,2026-10-14)
// 合并前 enter() 用 try/catch 包住了过场,enterWithoutPush() 没有(还漏了 warpOpts/capture 也在保护外),
// 于是过场一旦自身抛错:① transitioning 永久为真 ⇒ 7 个拿它当闸门的导航入口与两条切换入口从此一律静默
// 拒绝;② back()/toMain() 的 `if (!ok)` 还原路径走不到,而 4 处星球回程传送点(scene6-king 等)的
// `.catch(() => {})` 会把 reject 吞干净 ⇒ 玩家被困外星、零信号。本文件逐条钉这两件事。
// 合并后的成功/失败逐字行为由同目录 scene-manager-rollback.test.js(8 条)兜着,不重复它的断言。
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

// 过场行为按用例切换:node 里没有夜幕,默认"直接执行 commit"(与 holdWarp 托住时一致)
const ctrl = vi.hoisted(() => ({ impl: null }));
vi.mock('../shared/warp-fx.js', () => ({
  runWarp: (commit, opts) => ctrl.impl(commit, opts),
  holdWarp: async () => {},
  releaseWarp: () => {},
  warpTransition: (mid) => mid && mid(),
  lockWarpLabel: () => {},
  warpState: () => ({ on: false, held: 0, alpha: 0, speed: 0 }),
}));

const passThrough = async (commit) => {
  await commit();
};
const explode = async () => {
  throw new Error('夜幕起不来');
};

const realDocument = globalThis.document;

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

let SceneManager, ctx;

beforeAll(async () => {
  globalThis.document = makeDocumentStub();
  SceneManager = (await import('../core/scene-manager.js')).SceneManager;
  ctx = (await import('../ctx.js')).ctx;
});

afterAll(() => {
  globalThis.document = realDocument;
});

beforeEach(() => {
  ctrl.impl = passThrough;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

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
  ctx.kunlun.flightLock = false;
  return { m, roots, camera, player, avatar, calls };
}

describe('scene-manager 切换核心(M-05)', () => {
  it('过场自身抛错(进入路):按 false 返回、标志复位、历史不留残渣,而且下一次切换仍能成', async () => {
    const { m, roots, avatar } = harness();
    ctrl.impl = explode;
    expect(await m.enter('b')).toBe(false);
    expect(m.transitioning).toBe(false); // ← 旧代码这条永久为真,全站切换就此锁死
    expect(m.activeWorld).toBe('main');
    expect(m.worldStack.length).toBe(0); // 压进去的来源条目被回滚撤掉,没留下"返回一个进不去的世界"
    expect(avatar.parent).toBe(roots.main);
    // 反证:闸门复位了才谈得上"没锁死"——同一台 manager 再切一次必须能成
    ctrl.impl = passThrough;
    expect(await m.enter('b')).toBe(true);
    expect(m.activeWorld).toBe('b');
  });

  it('过场自身抛错(回程路):back() 兑现 false 而不是 reject,调用方的 if(!ok) 才接得到', async () => {
    const { m } = harness();
    await m.enter('b');
    await m.enter('c');
    ctrl.impl = explode;
    // 逐字复刻 scene6-king.js:226 的调用形态:Promise.resolve(wm.back()).then(ok => 重武装)。
    // 合并前这里兑现的是 reject ⇒ 那处的 .catch(() => {}) 把它吞干净,门已 disarm、信标已删,玩家被困外星
    const seen = [];
    await Promise.resolve(m.back()).then(
      (ok) => seen.push(ok),
      (e) => seen.push('rejected:' + e.message)
    );
    expect(seen).toEqual([false]); // 不是 ['rejected:…'] ⇒ 重武装门/信标那段代码真的会跑到
    expect(m.transitioning).toBe(false);
    expect(m.worldStack.map((x) => x.id)).toEqual(['main', 'b']); // 被 pop 的条目原样还回栈
    expect(m.activeWorld).toBe('c');
    ctrl.impl = passThrough;
    expect(await m.back()).toBe(true); // 没锁死
    expect(m.activeWorld).toBe('b');
  });

  it('回滚自身抛错:只滚一次(第二次会多 pop 一层无关的合法历史)', async () => {
    const { m, roots, avatar } = harness();
    await m.enter('b');
    expect(m.worldStack.map((x) => x.id)).toEqual(['main']);
    ctrl.impl = passThrough;
    m.getWorld('c').enter = async () => {
      throw new Error('C 进不去');
    };
    // 回滚要把角色挂回切换前的父节点(b 的 root),那一挂本身就抛
    roots.b.add = () => {
      throw new Error('挂不回去');
    };
    const ok = await m.enter('c');
    expect(ok).toBe(false);
    expect(m.transitioning).toBe(false);
    // 关键:栈里只被撤掉本次压入的 'b',[main] 必须原样留着(合并前这里是 [])
    expect(m.worldStack.map((x) => x.id)).toEqual(['main']);
    expect(avatar.parent).toBe(roots.c); // 挂不回去就是挂不回去,至少没被第二遍回滚搅得更乱
  });

  it('回程成功:恢复条目里的快照,并且不写来源世界的相机缓存(合并前两份实现的差异逐字保留)', async () => {
    const { m, player } = harness();
    expect(m.getWorld('main').camera).toBeFalsy();
    expect(await m.enter('b')).toBe(true);
    expect(m.getWorld('main').camera).toBeTruthy(); // 进入路缓存来源相机,供下次再进入它时还原
    player.pl.p.x = 9;
    ctrl.impl = passThrough;
    expect(await m.back()).toBe(true);
    expect(m.activeWorld).toBe('main');
    expect(player.pl.p.x).toBe(1); // 条目里的切换前快照被恢复
    expect(m.getWorld('b').camera).toBeFalsy(); // 回程路不缓存(旧 enterWithoutPush 就没这段)
  });

  it('过场未落期间 transitioning 仍是闸门:并发第二次切换一律拒绝、且没碰目标钩子', async () => {
    const { m, calls } = harness();
    let release;
    const gate = new Promise((r) => {
      release = r;
    });
    ctrl.impl = async (commit) => {
      await gate;
      await commit();
    };
    const pending = m.enter('b');
    expect(m.transitioning).toBe(true);
    expect(await m.enter('c')).toBe(false);
    expect(m.transitioning).toBe(true); // 被拒的那次不许把标志清掉(那是另一个方向的锁死)
    release();
    expect(await pending).toBe(true);
    expect(m.activeWorld).toBe('b');
    expect(calls.map((c) => c.join(':'))).toEqual(['enter:b:main']);
  });

  it('capture() 抛错(还没压栈就炸):不留 transitioning、更不 pop 别人的历史', async () => {
    const { m } = harness();
    await m.enter('b'); // 栈 [main]
    m.capture = () => {
      throw new Error('相机没了');
    };
    expect(await m.enter('c')).toBe(false);
    expect(m.transitioning).toBe(false);
    expect(m.worldStack.map((x) => x.id)).toEqual(['main']); // pushedSource=false ⇒ 回滚不许 pop
    expect(m.activeWorld).toBe('b');
  });
});
