// light-budget.test.js — 灯光限额选择器(防手机"整片隐形"血泪回归)
// 根因链:灯多 → 着色器超手机 uniform 上限 → 链接失败 → 标准材质全灭。
// 此处钉死选择算法:手机更狠(每3留1/射灯留4)、吊顶保留、钻石灯/远方信标豁免。
import { describe, it, expect } from 'vitest';
import { selectLightsToRemove } from '../core/light-budget.js';

// 造一个可遍历的"假场景":traverse 按深度优先展开
function makeScene(objects) {
  return { traverse(cb) { objects.forEach(cb); } };
}
function point(y, x = 0) {
  return { isPointLight: true, position: { y, x } };
}
function spot(withTarget = false) {
  return {
    isSpotLight: true,
    position: { y: 4, x: 0 },
    target: withTarget ? { parent: {} } : null,
  };
}

describe('桌面端预算(keepEvery=2, 射灯留 10)', () => {
  it('吊顶灯每 2 留 1,其余点光全删', () => {
    const pls = Array.from({ length: 8 }, (_, i) => ({ l: point(3) }));
    const { remove, ceil, keepEvery } = selectLightsToRemove(
      (cb) => makeScene(pls.map((p) => p.l)).traverse(cb),
      pls,
      { isMobile: false }
    );
    expect(keepEvery).toBe(2);
    expect(ceil.size).toBe(4); // 索引 0/2/4/6 保留
    // 8 盏同位置点光:4 盏吊顶保留,4 盏进删除名单
    expect(remove.filter((o) => o.isPointLight)).toHaveLength(4);
  });
  it('高空钻石灯(y>30)与远方信标(|x|>500)豁免', () => {
    // pls 顺序决定吊顶保留名单(偶数索引):普通灯必须放奇数位,否则会先被吊顶豁免截走
    const pad = point(3);
    const diamond = point(40);
    const beacon = point(3, 600);
    const ordinary = point(3);
    const objs = [pad, diamond, beacon, ordinary];
    const pls = objs.map((l) => ({ l })); // ceil = {pad, beacon}(偶数索引)
    const { remove } = selectLightsToRemove(
      (cb) => makeScene(objs).traverse(cb),
      pls,
      { isMobile: false }
    );
    expect(remove).toContain(ordinary);
    expect(remove).not.toContain(diamond); // 奇数位但 y>30 → 豁免
    expect(remove).not.toContain(beacon); // 偶数位本来就在吊顶名单
    expect(remove).not.toContain(pad);
  });
  it('射灯只保留前 10 盏,其余连同目标点一起删', () => {
    const spots = Array.from({ length: 13 }, () => spot(true));
    const { remove } = selectLightsToRemove(
      (cb) => makeScene(spots).traverse(cb),
      [],
      { isMobile: false }
    );
    const spotRm = remove.filter((o) => o.isSpotLight);
    expect(spotRm).toHaveLength(3);
    expect(remove.filter((o) => !o.isSpotLight && !o.isPointLight)).toHaveLength(3); // 3 个 target
  });
  it('非光源对象不进删除名单', () => {
    const mesh = { isMesh: true, position: { y: 0, x: 0 } };
    const { remove } = selectLightsToRemove((cb) => makeScene([mesh]).traverse(cb), [], {});
    expect(remove).toHaveLength(0);
  });
});

describe('手机端预算更紧(keepEvery=3, 射灯留 4)', () => {
  it('吊顶每 3 留 1、射灯只留 4', () => {
    const pls = Array.from({ length: 9 }, () => ({ l: point(3) }));
    const spots = Array.from({ length: 8 }, () => spot(false));
    const { remove, keepEvery, spotKeep } = selectLightsToRemove(
      (cb) => makeScene([...pls.map((p) => p.l), ...spots]).traverse(cb),
      pls,
      { isMobile: true }
    );
    expect(keepEvery).toBe(3);
    expect(spotKeep).toBe(4);
    // 9 盏同位点光:3 盏吊顶(0/3/6)保留,6 盏删
    expect(remove.filter((o) => o.isPointLight)).toHaveLength(6);
    expect(remove.filter((o) => o.isSpotLight)).toHaveLength(4);
  });
});

describe('ceil 集合与 pls 清单一致(main.js 用它收缩 pls 数组)', () => {
  it('ceil 恰好包含被保留的吊顶灯对象引用', () => {
    const lights = Array.from({ length: 6 }, () => point(3));
    const pls = lights.map((l) => ({ l }));
    const { remove, ceil } = selectLightsToRemove(
      (cb) => makeScene(lights).traverse(cb),
      pls,
      { isMobile: false }
    );
    const kept = lights.filter((l) => !remove.includes(l));
    expect(kept).toHaveLength(3);
    for (const l of kept) expect(ceil.has(l)).toBe(true);
    for (const l of remove) expect(ceil.has(l)).toBe(false);
  });
});
