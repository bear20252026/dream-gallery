// layout.test.js — 建筑布局常量契约(2026-09-18 审计 P1 补测;P4 唯一尺寸源)
// 守:外墙矩形包住内厅;E 厅分界在北墙与南墙之间;天花板高度为正。
import { describe, it, expect } from 'vitest';
import { LAYOUT } from '../scene/layout.mjs';

describe('layout.mjs 布局常量', () => {
  const L = LAYOUT;
  it('外墙四向有序:west<east,north<southEx<south', () => {
    expect(L.outerWest).toBeLessThan(L.outerEast);
    expect(L.outerNorth).toBeLessThan(L.outerSouthEx);
    expect(L.outerSouthEx).toBeLessThan(L.outerSouth);
  });
  it('回字内墙被外墙包住且有序', () => {
    expect(L.outerWest).toBeLessThanOrEqual(L.innerWest);
    expect(L.innerWest).toBeLessThan(L.innerEast);
    expect(L.innerEast).toBeLessThanOrEqual(L.outerEast);
    expect(L.outerNorth).toBeLessThan(L.innerNorth);
    expect(L.innerNorth).toBeLessThan(L.innerSouth);
    expect(L.innerSouth).toBeLessThanOrEqual(L.outerSouth);
  });
  it('内厅门洞缺口(±2)落在内墙范围内', () => {
    expect(L.innerWest).toBeLessThan(-2);
    expect(2).toBeLessThan(L.innerEast);
  });
  it('天花板高度为正', () => {
    expect(L.ceilingHeight).toBeGreaterThan(2);
  });
});
