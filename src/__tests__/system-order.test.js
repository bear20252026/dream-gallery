// system-order.test.js — 装配顺序的唯一判据必须是"层→相位→次序"字典序(第六轮审计 M-12,2026-10-14)
// 为什么值得单独一批:旧实现把三个数**加权成一个数**(`l*1000 + p*10 + order`),这等于假设 order 永远落在
// (-10,10) 里 —— 而实扫 src/ 得到 |order|>=10 的系统 9 条、core/loop.js 还是 order:-1000。
// 那条假设一破,"相位"就让位给"次序",装配顺序就会静默变化(每帧执行顺序 = 游戏手感),而 CI 不会响。
// 这批测试就是让"再有人用加权思维改这里"当场变红。
import { describe, it, expect } from 'vitest';
import { defineSystem, compareSystems, systemKey, LAYERS, PHASES } from '../core/system.js';

const sys = (name, layer, phase, order) => defineSystem({ name, layer, phase, order });
const sorted = (list) =>
  list
    .slice()
    .sort(compareSystems)
    .map((s) => s.name);

describe('compareSystems:层→相位→次序 字典序', () => {
  it('同层内 order 再大也不能越过相位(审计给的那条反例)', () => {
    // 旧权重:input(1)*10+20=30 vs simulate(2)*10+0=20 ⇒ simulate 反而排前面,相位被 order 推翻
    const a = sys('late-input', 'gameplay', 'input', 20);
    const b = sys('early-simulate', 'gameplay', 'simulate', 0);
    expect(sorted([b, a])).toEqual(['late-input', 'early-simulate']);
    expect(compareSystems(a, b)).toBeLessThan(0);
  });

  it('order 再负也不能把系统搬进别的层', () => {
    // 旧权重:gameplay(2)*1000+bootstrap 0+(-1000)=1000 < engine(1)*1000+ui(5)*10=1050 ⇒ 跨层了
    const g = sys('negative-order', 'gameplay', 'bootstrap', -1000);
    const e = sys('engine-ui', 'engine', 'ui', 0);
    expect(sorted([g, e])).toEqual(['engine-ui', 'negative-order']);
  });

  it('三层三相的完整序列就是声明的层级,而不是注册先后', () => {
    const list = [
      sys('p1', 'presentation', 'ui', 0),
      sys('g1', 'gameplay', 'animate', 3),
      sys('e1', 'engine', 'simulate', 0),
      sys('pl', 'platform', 'bootstrap', -1000),
      sys('g2', 'gameplay', 'input', 14),
      sys('p2', 'presentation', 'render', 0),
    ];
    expect(sorted(list)).toEqual(['pl', 'e1', 'g2', 'g1', 'p2', 'p1']);
    // 打乱注册顺序结果不变(确定性不依赖注册先后)
    expect(sorted([...list].reverse())).toEqual(['pl', 'e1', 'g2', 'g1', 'p2', 'p1']);
  });

  it('数值层/相在 defineSystem 里归一成字符串键,比较结果一致', () => {
    const byString = sys('s', 'engine', 'animate', 1);
    const byNumber = sys('n', LAYERS.engine, PHASES.animate, 1);
    expect([byString.layer, byString.phase]).toEqual([byNumber.layer, byNumber.phase]);
    expect(compareSystems(byString, byNumber)).toBe(0);
  });

  it('非法层/相归到默认(engine / simulate),不产生 NaN 排序', () => {
    const bad = defineSystem({ name: 'bad', layer: 'nonsense', phase: 'nonsense' });
    expect(bad.layer).toBe('nonsense'); // 字符串原样保留
    expect(systemKey(bad)).toBe('1/2/0'); // 但排序按默认档走
    const ok = sys('ok', 'engine', 'simulate', 0);
    expect(compareSystems(bad, ok)).toBe(0); // 与默认档等价 ⇒ 没有"排到数组尽头/开头"的随机性
  });

  it('缺 order 当作 0;同层同相同 order 时保持注册先后(V8 sort 稳定)', () => {
    const a = sys('a', 'gameplay', 'simulate');
    const b = sys('b', 'gameplay', 'simulate', 0);
    expect(compareSystems(a, b)).toBe(0);
    expect(sorted([a, b])).toEqual(['a', 'b']);
    expect(sorted([b, a])).toEqual(['b', 'a']);
  });

  it('比较器对全序是传递的(排出来的顺序与两两判定一致,不会出现"a>b>c>a")', () => {
    const pool = [];
    for (const layer of Object.keys(LAYERS)) {
      for (const phase of Object.keys(PHASES)) {
        pool.push(sys(layer + '/' + phase, layer, phase, (pool.length % 30) - 15));
      }
    }
    const out = sorted(pool);
    for (let i = 1; i < out.length; i++) {
      const x = pool.find((s) => s.name === out[i - 1]);
      const y = pool.find((s) => s.name === out[i]);
      expect(compareSystems(x, y)).toBeLessThanOrEqual(0);
    }
  });
});
