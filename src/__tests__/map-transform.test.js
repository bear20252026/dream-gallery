// map-transform.test.js — 罗盘坐标变换契约(2026-09-24 大文件抽缝批)
// 回归锚点:点图传送 = bUnmap(点击像素);绘制 = bMap(玩家坐标)。两侧若各写一份
// 或比例不一致,传送落点静默漂移 —— round-trip 契约在此钉死。
import { describe, it, expect } from 'vitest';
import { ZONE_CZ, bMap, bUnmap } from '../scene/map-transform.mjs';

describe('bMap/bUnmap round-trip', () => {
  it('任意坐标 round-trip 严格还原(bUnmap∘bMap = id)', () => {
    for (const w of [150, 260, 512]) {
      for (const [x, z] of [
        [0, 0],
        [10, 33.5],
        [-34, -13],
        [34, 60],
        [-12.5, 55.5],
      ]) {
        const [px, py] = bMap(w, x, z);
        const [rx, rz] = bUnmap(w, px, py);
        expect(rx).toBeCloseTo(x, 10);
        expect(rz).toBeCloseTo(z, 10);
      }
    }
  });
  it('zone 中心 (0, 23.5) 映射到画布正中心', () => {
    const [px, py] = bMap(260, 0, ZONE_CZ);
    expect(px).toBe(130);
    expect(py).toBe(130);
  });
  it('比例 S=w/100:图上 100px = 世界 100m', () => {
    const [px1] = bMap(100, 1, ZONE_CZ);
    const [px2] = bMap(100, 2, ZONE_CZ);
    expect(px2 - px1).toBeCloseTo(1, 10);
  });
  it('zone 中心常量 23.5(与建筑布局契约绑定,改动必须同步 minimap/player)', () => {
    expect(ZONE_CZ).toBe(23.5);
  });
});
