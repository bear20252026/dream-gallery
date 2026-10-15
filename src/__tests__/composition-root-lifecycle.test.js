// composition-root-lifecycle.test.js — 显式生命周期(第六轮审计 M-06 试点,2026-10-15)
//
// 包 A(M-01)把"哪个系统 init 砸了"做成了**可见**,并如实记下当时的边界:
//   init 失败的系统仍在 systems 里,update(dt) 每帧照调 ⇒ 半装配态持续跑 + 每帧一条告警。
// 那条评论当时是"记录,本批不改",因为跳过 failed 系统属于新的生命周期语义。这批就是那条语义:
//   'uninit' 注册了还没装配 · 'ready' init 成功 · 'failed' init 抛过错
//   update 只调 ready;dispose 只拆 ready/failed(半截资源要回收),不拆 uninit。
// 动手前提(量过才敢改):生产里没有任何系统在 init 之后注册 —— main.js 是先 loadWorldModules、
// 再 register 全部 19 个、最后 init。所以"跳过 uninit"改的只是探针/HMR/误用这几条路径。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCompositionRoot } from '../core/composition-root.js';

function makeSys(name, log, opts = {}) {
  const { fail = null, updateFail = false } = opts;
  return {
    name,
    layer: 'gameplay',
    phase: 'simulate',
    order: 0,
    init() {
      log.push('init:' + name);
      if (fail) throw new Error(fail);
    },
    update() {
      log.push('update:' + name);
      if (updateFail) throw new Error('每帧都炸:' + name);
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
function muteWarn() {
  vi.spyOn(console, 'warn').mockImplementation(() => {
    warnCount += 1;
  });
}

describe('composition-root 生命周期状态机(M-06)', () => {
  it('注册即 uninit;init 之后分成 ready / failed 两种,读数点名到每个系统', () => {
    muteWarn();
    const log = [];
    const root = createCompositionRoot();
    root.register(makeSys('ok', log));
    root.register(makeSys('boom', log, { fail: '着色器编不过' }));
    expect(root.systemState('ok')).toBe('uninit');
    const r = root.init();
    expect(r.states).toEqual([
      { name: 'ok', state: 'ready' },
      { name: 'boom', state: 'failed' },
    ]);
    expect(root.systemState('ok')).toBe('ready');
    expect(root.systemState('boom')).toBe('failed');
    expect(root.systemState('nobody')).toBeNull(); // 没注册过的名字 ≠ 某个状态
  });

  it('init 失败的系统不再被每帧调用(这就是包 A 留下的那条半装配态)', () => {
    muteWarn();
    const log = [];
    const root = createCompositionRoot();
    root.register(makeSys('ok', log));
    root.register(makeSys('boom', log, { fail: '炸' }));
    root.init();
    log.length = 0;
    root.update(0.016);
    root.update(0.016);
    expect(log).toEqual(['update:ok', 'update:ok']);
    expect(warnCount).toBe(1); // 只有 init 那一条告警,不再每帧补一条
  });

  it('failed 的系统仍会被 dispose:init 到一半建出的资源也要有人收', () => {
    muteWarn();
    const log = [];
    const root = createCompositionRoot();
    root.register(makeSys('ok', log));
    root.register(makeSys('boom', log, { fail: '建了一半网格就炸' }));
    root.init();
    log.length = 0;
    root.dispose();
    expect(log).toEqual(['dispose:boom', 'dispose:ok']); // 逆序拆,失败的也拆
  });

  it('从没 init 过的系统既不跑也不拆(它的 dispose 是按"init 已完成"写的)', () => {
    muteWarn();
    const log = [];
    const root = createCompositionRoot();
    root.register(makeSys('early', log));
    root.init();
    root.register(makeSys('late', log)); // 迟到 ⇒ 永远停在 uninit
    log.length = 0;
    root.update(0.016);
    root.dispose();
    expect(log).toEqual(['update:early', 'dispose:early']); // 既没有 update:late,也没有 dispose:late
  });

  it('dispose → 重登记 → 再 init:上一轮 failed 的系统这轮成功了,就重新被每帧调用', () => {
    muteWarn();
    const log = [];
    const root = createCompositionRoot();
    let shouldFail = true;
    const flaky = {
      name: 'flaky',
      layer: 'gameplay',
      phase: 'simulate',
      order: 0,
      init() {
        log.push('init:flaky');
        if (shouldFail) throw new Error('第一次装配失败');
      },
      update() {
        log.push('update:flaky');
      },
      dispose() {
        log.push('dispose:flaky');
      },
    };
    root.register(flaky);
    expect(root.init().status).toBe('failed');
    expect(root.systemState('flaky')).toBe('failed');
    root.dispose();
    expect(root.systemState('flaky')).toBeNull(); // 已出账,不是"还停在 failed"
    shouldFail = false;
    root.register(flaky);
    expect(root.init().status).toBe('ready');
    log.length = 0;
    root.update(0.016);
    expect(log).toEqual(['update:flaky']); // 状态跟着新一轮装配重算,不带上次的旧账
  });

  it('update 抛错不降级系统(只有 init 的结果参与生命周期判定)', () => {
    muteWarn();
    const log = [];
    const root = createCompositionRoot();
    root.register(makeSys('noisy', log, { updateFail: true }));
    root.init();
    root.update(0.016);
    root.update(0.016);
    expect(root.systemState('noisy')).toBe('ready');
    expect(log.filter((x) => x === 'update:noisy')).toHaveLength(2); // 每帧仍试、每帧仍告警
    expect(warnCount).toBe(2); // ← 这条钉的是"没顺手把 update 异常也当装配失败":那是另一种静默
  });

  it('states 是副本:外部改状态污染不到内部判定', () => {
    muteWarn();
    const log = [];
    const root = createCompositionRoot();
    root.register(makeSys('a', log));
    const r = root.init();
    r.states[0].state = 'failed'; // 冻结的是数组本身还是元素?元素是逐条新建的对象
    r.states.push({ name: 'ghost', state: 'ready' });
    const st = root.initStatus();
    expect(st.states).toEqual([{ name: 'a', state: 'ready' }]);
    expect(root.systemState('ghost')).toBeNull();
    log.length = 0;
    root.update(0.016);
    expect(log).toEqual(['update:a']); // 被改过的那份副本决定不了下一帧谁跑
  });
});
