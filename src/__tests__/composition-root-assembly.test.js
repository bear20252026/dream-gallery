// composition-root-assembly.test.js — 组合根的装配结论(第六轮审计 M-01,2026-10-14)
// 钉住四件事:
//   ① init 的成败要能读出来(以前只有 console.warn,main.js 把返回值丢掉 ⇒ 外面一无所知);
//   ② "单个系统 init 抛错不阻断其余装配"这条**有意的既有语义**不许被顺手改掉(所以既断言结论,
//      也断言其余系统照装);
//   ③ init 之后注册的系统「不会被装配」这条静默故障要进账(它仍会被每帧 update,正是最难受的形态);
//   ④ 出去的是副本:探针改不动内部账。
// 结论形状与 core/world-chain.mjs 的 M-13 契约一致(ready|degraded|failed + 名单)。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCompositionRoot } from '../core/composition-root.js';

function makeSys(name, log, opts = {}) {
  const { layer = 'gameplay', phase = 'simulate', order = 0, fail = null } = opts;
  return {
    name,
    layer,
    phase,
    order,
    init() {
      log.push('init:' + name);
      if (fail) throw new Error(fail);
    },
    update() {
      log.push('update:' + name);
    },
    dispose() {
      log.push('dispose:' + name);
    },
  };
}

let warnCount = 0;
afterEach(() => {
  vi.restoreAllMocks();
  warnCount = 0;
});

// 告警本身也是契约的一部分(控制台留痕),但不允许它把测试输出刷满屏
function muteWarn() {
  vi.spyOn(console, 'warn').mockImplementation(() => {
    warnCount += 1;
  });
}

describe('composition-root 装配结论(M-01)', () => {
  it('全部成功:status=ready,loaded 按层→相→序点名,二次 init 返回同一份结论且不再重装', () => {
    muteWarn();
    const log = [];
    const root = createCompositionRoot();
    root.register(makeSys('late-ui', log, { layer: 'presentation', phase: 'ui' }));
    root.register(
      makeSys('core-loop', log, { layer: 'platform', phase: 'bootstrap', order: -1000 })
    );
    root.register(makeSys('mid-game', log));
    const r = root.init();
    expect(r).toMatchObject({ status: 'ready', failed: [], skipped: [] });
    expect(r.loaded).toEqual(['core-loop', 'mid-game', 'late-ui']); // 确定性:与注册先后无关
    expect(log.filter((x) => x.startsWith('init:')).length).toBe(3);
    expect(root.initStatus()).toEqual(r);
    const again = root.init(); // 二次 init 被拒绝
    expect(again).toMatchObject({ status: 'ready' });
    expect(again.loaded).toEqual(['core-loop', 'mid-game', 'late-ui']);
    expect(log.filter((x) => x.startsWith('init:')).length).toBe(3); // 一个都没重装
    expect(warnCount).toBe(1); // 拒绝那一条告警照旧
  });

  it('一个系统 init 抛错:其余照装(既有语义),但结论是 degraded 且点名带原因', () => {
    muteWarn();
    const log = [];
    const root = createCompositionRoot();
    root.register(makeSys('a', log));
    root.register(makeSys('boom', log, { fail: '网格加载失败' }));
    root.register(makeSys('c', log));
    const r = root.init();
    expect(r.status).toBe('degraded');
    expect(r.loaded).toEqual(['a', 'c']); // ← 审计说的"仍继续装后面的",今天仍是,但不再无人知晓
    expect(r.failed).toEqual([{ name: 'boom', message: '网格加载失败' }]);
    expect(log).toContain('init:c');
  });

  it('全部系统 init 抛错:failed 一个不落、status=failed(不写成 degraded 更不写成 ready)', () => {
    muteWarn();
    const log = [];
    const root = createCompositionRoot();
    root.register(makeSys('x', log, { fail: 'X 炸' }));
    root.register(makeSys('y', log, { fail: 'Y 炸' }));
    const r = root.init();
    expect(r.status).toBe('failed');
    expect(r.loaded).toEqual([]);
    expect(r.failed.map((f) => f.name)).toEqual(['x', 'y']);
    expect(r.failed[1].message).toBe('Y 炸');
  });

  it('没注册任何系统就 init:ready(没东西可装 ≠ 装砸了)', () => {
    muteWarn();
    const root = createCompositionRoot();
    expect(root.init()).toMatchObject({ status: 'ready', loaded: [], failed: [], skipped: [] });
  });

  it('init 之后注册:进账 skipped,并且它**不再**被每帧 update(从没 init 就不该跑)', () => {
    muteWarn();
    const log = [];
    const root = createCompositionRoot();
    root.register(makeSys('a', log));
    root.init();
    log.length = 0;
    root.register(makeSys('late', log));
    const st = root.initStatus();
    expect(st.status).toBe('degraded');
    expect(st.skipped).toEqual(['late']);
    root.update(0.016);
    // ⚠️2026-10-15 契约变更(M-06):包 A 当时钉的是 `['update:a','update:late']`
    // —— 那是"半装配态还在跑"的现场记录,不是意愿。生命周期显式化之后,uninit 的系统不再被调。
    expect(log).toEqual(['update:a']);
    expect(log).not.toContain('init:late');
    expect(root.systemState('late')).toBe('uninit'); // 为什么不跑:读数现成可得
    root.register(makeSys('late', log)); // 同名重复登记,账上也只记一次名字
    expect(root.initStatus().skipped).toEqual(['late']);
    expect(warnCount).toBe(2); // 两次注册两条告警,账与告警同时留
  });

  it('dispose 后结论作废;重新登记再 init 时,上次 skipped 的系统这次真的被装配', () => {
    muteWarn();
    const log = [];
    const root = createCompositionRoot();
    root.register(makeSys('a', log));
    root.init();
    root.register(makeSys('late', log)); // 迟到 ⇒ 只进 skipped,不会被 init
    expect(root.initStatus().skipped).toEqual(['late']);
    root.dispose(); // 拆干净 = systems 清空、结论作废、允许重装配
    expect(root.initStatus()).toBeNull();
    expect(root.isInitialized()).toBe(false);
    root.register(makeSys('a', log));
    root.register(makeSys('late', log)); // 这一回在 init 之前
    const r = root.init();
    expect(r.status).toBe('ready');
    expect(r.skipped).toEqual([]);
    expect(r.loaded).toEqual(['a', 'late']);
    expect(log).toContain('init:late');
  });

  it('系统在自己的 init 里再调 init:被重入防护当场挡下(标志在循环前置真是有意的,不是笔误)', () => {
    muteWarn();
    const log = [];
    const root = createCompositionRoot();
    let inner = null;
    root.register(makeSys('a', log));
    root.register({
      name: 'recursive',
      layer: 'gameplay',
      phase: 'simulate',
      order: 1,
      init() {
        log.push('init:recursive');
        inner = root.init(); // 装配期间的重入
      },
    });
    const outer = root.init();
    expect(inner).not.toBeNull(); // 拿到的是同一份结论,而不是"再装一遍"
    expect(outer.status).toBe('ready');
    expect(log).toEqual(['init:a', 'init:recursive']); // 一个系统只 init 一次
    expect(warnCount).toBe(1);
  });

  it('结论是副本:外部改 status 会抛、往 loaded 里塞名字也污染不到内部账', () => {
    muteWarn();
    const log = [];
    const root = createCompositionRoot();
    root.register(makeSys('a', log));
    const r = root.init();
    expect(() => {
      r.status = 'failed';
    }).toThrow(); // ESM 严格模式:冻结对象赋值直接抛,不声不响地"改成功了"更糟
    r.loaded.push('nobody');
    r.failed.push({ name: 'nobody', message: '编的' });
    const st = root.initStatus();
    expect(st.status).toBe('ready');
    expect(st.loaded).toEqual(['a']);
    expect(st.failed).toEqual([]);
  });
});
