// SpatialIndex 单元测试
import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialIndex, hitTestFast, resolveSlideFast } from '../shared/spatial-index.js';

describe('SpatialIndex', () => {
  let idx;

  beforeEach(() => {
    idx = new SpatialIndex(8);
  });

  it('初始状态为空', () => {
    expect(idx.count).toBe(0);
    expect(idx.query(0, 0)).toEqual([]);
  });

  it('insert + query 返回碰撞盒', () => {
    const box = { mnX: 0, mxX: 5, mnZ: 0, mxZ: 5 };
    idx.insert(box);
    expect(idx.count).toBe(1);
    expect(idx.query(2, 2)).toContain(box);
  });

  it('查询远处格子返回空', () => {
    idx.insert({ mnX: 0, mxX: 5, mnZ: 0, mxZ: 5 });
    expect(idx.query(50, 50)).toEqual([]);
  });

  it('跨格子的碰撞盒插入多个格子', () => {
    // cellSize=8, box 跨越 [0,16] 即 3 个格子
    const box = { mnX: -1, mxX: 16, mnZ: -1, mxZ: 16 };
    idx.insert(box);
    // 查询不同位置都应返回
    expect(idx.query(0, 0)).toContain(box);
    expect(idx.query(10, 10)).toContain(box);
  });

  it('bulkInsert 批量导入', () => {
    const boxes = [
      { mnX: 0, mxX: 3, mnZ: 0, mxZ: 3 },
      { mnX: 10, mxX: 13, mnZ: 10, mxZ: 13 },
    ];
    idx.bulkInsert(boxes);
    expect(idx.count).toBe(2);
    expect(idx.query(1, 1).length).toBe(1);
    expect(idx.query(11, 11).length).toBe(1);
  });

  it('clear 清空', () => {
    idx.insert({ mnX: 0, mxX: 5, mnZ: 0, mxZ: 5 });
    idx.clear();
    expect(idx.count).toBe(0);
    expect(idx.query(2, 2)).toEqual([]);
  });
});

describe('hitTestFast (空间索引碰撞检测)', () => {
  const box = { mnX: 0, mxX: 10, mnZ: 0, mxZ: 10 };
  const r = 0.35;
  let idx;

  beforeEach(() => {
    idx = new SpatialIndex(8);
    idx.insert(box);
  });

  it('远离盒子时不碰撞', () => {
    expect(hitTestFast(20, 20, idx, r)).toBe(false);
  });

  it('盒子内部碰撞', () => {
    expect(hitTestFast(5, 5, idx, r)).toBe(true);
  });

  it('边缘附近碰撞', () => {
    // 点在盒子边缘内侧(r 范围内)
    expect(hitTestFast(0.1, 5, idx, r)).toBe(true);
  });

  it('边缘外不碰撞', () => {
    expect(hitTestFast(-1, 5, idx, r)).toBe(false);
  });
});

describe('resolveSlideFast (空间索引滑动碰撞)', () => {
  const box = { mnX: 0, mxX: 10, mnZ: 0, mxZ: 10 };
  const r = 0.35;
  let idx;

  beforeEach(() => {
    idx = new SpatialIndex(8);
    idx.insert(box);
  });

  it('无碰撞返回新位置', () => {
    const result = resolveSlideFast(20, 20, 15, 15, idx, r);
    expect(result).toEqual({ x: 20, z: 20 });
  });

  it('碰撞时弹回原位', () => {
    const result = resolveSlideFast(5, 9.5, 5, 12, idx, r);
    expect(result.z).toBe(12);
  });
});
