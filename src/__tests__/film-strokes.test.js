// film-strokes.test.js — 开场电影笔画数据契约(2026-09-18 审计 P1 补测)
// 纯数据模块,守:①每笔形状合法(SVG 路径,起点 M,数字在纸面坐标邻域);
// ②节奏合法(t/w 正数);③scene2-draw 消费的 TRUTH 至少包含蛇身+苹果轮廓两组主笔。
import { describe, it, expect } from 'vitest';
import { HAT, TRUTH } from '../gate/film-strokes.mjs';

// 720x460 纸面;允许少量软辅助线越界到边缘装饰位置,取宽松界 [-40, 760]x[-40, 500]
const NUM = /-?\d+(?:\.\d+)?/g;
function coords(d) {
  const n = (d.match(NUM) || []).map(Number);
  const pts = [];
  for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]);
  return pts;
}
function expectStrokeOk(st, name) {
  expect(typeof st.d, name + '.d').toBe('string');
  expect(st.d.trim()[0], name + ' 起笔必须是 M').toBe('M');
  expect(st.t, name + '.t>0').toBeGreaterThan(0);
  if (st.w !== undefined) expect(st.w, name + '.w>0').toBeGreaterThan(0);
  for (const [x, y] of coords(st.d)) {
    expect(x, name + ' x=' + x).toBeGreaterThan(-40);
    expect(x, name + ' x=' + x).toBeLessThan(760);
    expect(y, name + ' y=' + y).toBeGreaterThan(-40);
    expect(y, name + ' y=' + y).toBeLessThan(500);
  }
}

describe('film-strokes 笔画数据', () => {
  it('HAT:≥5 笔,全部形状合法', () => {
    expect(HAT.length).toBeGreaterThanOrEqual(5);
    HAT.forEach((st, i) => expectStrokeOk(st, 'HAT[' + i + ']'));
  });
  it('TRUTH:≥15 笔(蟒蛇吞象主画+苹果),全部形状合法', () => {
    expect(TRUTH.length).toBeGreaterThanOrEqual(15);
    TRUTH.forEach((st, i) => expectStrokeOk(st, 'TRUTH[' + i + ']'));
    expect(TRUTH.some((s) => s.fill), '有点墨填充笔').toBe(true);
    expect(TRUTH.some((s) => s.soft), '有淡色辅助笔').toBe(true);
  });
  it('fill 笔是闭合圆点写法(a 圆弧),总时长落在可编排区间', () => {
    for (const s of TRUTH.filter((x) => x.fill)) expect(s.d).toMatch(/^M[\d.,]+ a/);
    const total = TRUTH.reduce((a, s) => a + s.t, 0);
    expect(total).toBeGreaterThan(3000);
    expect(total).toBeLessThan(20000); // 电影节奏护栏
  });
});
