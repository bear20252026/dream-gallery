// world-chain.test.js — 加载链必须能区分"全成功 / 少了一批 / 直接炸"(第六轮审计 M-13,2026-10-14)
// 起因:旧实现里失败只是把 __worldPhase 临时写成「后台:失败:x」,链尾再无条件覆盖成「后台:完成」
// ⇒ 部分失败与全成功共用同一个读数。这批测试钉的就是"不许再拿一个字符串当结论"。
import { describe, it, expect } from 'vitest';
import { runChain, chainHealthy } from '../core/world-chain.mjs';

// 条目形状 2026-10-15 起为 `{ id, label, load }`(M-10):id 是身份键,label 是显示文字。
// 下面 7 条断言的**判据一字未动**,只是把 `entry[0]` 换成 `entry.label`、把 isShelved 的取样从标签换成 id。
const LIST = [
  { id: 'a', label: 'a', load: () => {} },
  { id: 'b', label: 'b', load: () => {} },
  { id: 'c', label: 'c', load: () => {} },
  { id: 'd', label: 'd', load: () => {} },
];

describe('runChain 的结构化结论', () => {
  it('全成功:status=ready,loaded 按声明顺序,failed/skipped 空', async () => {
    const seen = [];
    const res = await runChain(LIST, {
      tag: '后台',
      load: async (entry) => {
        seen.push(entry.label);
      },
    });
    expect(res).toMatchObject({ tag: '后台', status: 'ready' });
    expect(res.loaded).toEqual(['a', 'b', 'c', 'd']);
    expect(res.failed).toEqual([]);
    expect(res.skipped).toEqual([]);
    expect(seen).toEqual(['a', 'b', 'c', 'd']); // 串行且顺序即依赖,不许并发乱序
    expect(chainHealthy(res)).toBe(true);
  });

  it('后台链少一个模块 ⇒ degraded,并且点名是谁、后面的照常加载', async () => {
    const seen = [];
    const fails = [];
    const res = await runChain(LIST, {
      tag: '后台',
      load: async (entry) => {
        seen.push(entry.label);
        if (entry.label === 'b') throw new Error('404 ' + entry.label);
      },
      onFail: (label, e) => fails.push([label, e.message]),
    });
    expect(res.status).toBe('degraded');
    expect(res.failed).toEqual(['b']);
    expect(res.loaded).toEqual(['a', 'c', 'd']);
    expect(seen).toEqual(['a', 'b', 'c', 'd']); // 一个失败不吞掉后面的模块
    expect(fails).toEqual([['b', '404 b']]);
    expect(chainHealthy(res)).toBe(false); // ← M-13 的要点:部分失败不算健康
  });

  it('核心链(fatal)失败:如实抛出、当场停手,并把已到的相位告诉调用方', async () => {
    const seen = [];
    const phases = [];
    await expect(
      runChain(LIST, {
        tag: '核心',
        fatal: true,
        load: async (entry) => {
          seen.push(entry.label);
          if (entry.label === 'a') throw new Error('网络抖了一下');
        },
        onPhase: (p) => phases.push(p),
      })
    ).rejects.toThrow('网络抖了一下');
    expect(seen).toEqual(['a']); // 核心链失败不再往下装(否则会产出半套世界)
    expect(phases).toEqual(['核心:a', '核心:失败:a']);
  });

  it('被搁置的旧玩法进 skipped 名单,且绝不被加载', async () => {
    const seen = [];
    const res = await runChain(LIST, {
      tag: '后台',
      load: async (entry) => {
        seen.push(entry.label);
      },
      isShelved: (entry) => entry.id === 'c',
    });
    expect(seen).toEqual(['a', 'b', 'd']);
    expect(res.skipped).toEqual(['c']);
    expect(res.loaded).toEqual(['a', 'b', 'd']);
    expect(res.status).toBe('ready'); // 主动搁置 ≠ 降级
  });

  it('空链不等于"成功加载了一切"(名单要如实为空)', async () => {
    const res = await runChain([], { tag: '后台', load: async () => {} });
    expect(res).toMatchObject({ status: 'ready', loaded: [], failed: [], skipped: [] });
  });

  it('没给 load 就报错,而不是"什么都没加载然后报 ready"(假绿的源头)', async () => {
    await expect(runChain(LIST, { tag: '后台' })).rejects.toThrow('缺少 load');
  });

  it('chainHealthy 对 undefined / failed 都判不健康(读不到就是没有结论)', () => {
    expect(chainHealthy(undefined)).toBe(false);
    expect(chainHealthy(null)).toBe(false);
    expect(chainHealthy({ status: 'failed', failed: ['x'] })).toBe(false);
    expect(chainHealthy({ status: 'ready', failed: ['x'] })).toBe(false); // 状态与名单对不上时按不健康算
  });
});
