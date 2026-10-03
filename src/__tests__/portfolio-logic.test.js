// portfolio-logic.test.js — 作品集「未完成的画」(2026-10-03)
import { describe, it, expect } from 'vitest';
import {
  ROUND_IDS,
  PORTFOLIO_TITLES,
  smoothPath,
  cleanPortfolio,
  addDrawing,
  portfolioCount,
  MAX_STROKES,
  MAX_D_CHARS,
} from '../shared/portfolio-logic.mjs';

describe('portfolio', () => {
  it('四幅画按画板顺序,标题中英齐全', () => {
    expect(ROUND_IDS).toEqual(['boa', 'sheep-sick', 'ram', 'box']);
    for (const id of ROUND_IDS) {
      expect(PORTFOLIO_TITLES[id].zh).toBeTruthy();
      expect(PORTFOLIO_TITLES[id].en).toBeTruthy();
    }
  });
  it('smoothPath:单点/两点/多点都给出合法路径,多点用二次曲线', () => {
    expect(smoothPath([])).toBe('');
    expect(smoothPath([[1, 2]])).toMatch(/^M1,2/);
    expect(
      smoothPath([
        [0, 0],
        [10, 0],
      ])
    ).toBe('M0,0 L10,0');
    const d = smoothPath([
      [0, 0],
      [10, 0],
      [20, 10],
      [30, 10],
    ]);
    expect(d.startsWith('M0,0 Q10,0 15,5')).toBe(true);
    expect(d.endsWith('L30,10')).toBe(true);
  });
  it('清洗:未知 id / 非路径字符串丢弃,笔数与长度封顶', () => {
    const long = 'M0,0' + ' L1,1'.repeat(1000);
    const raw = {
      hack: { strokes: ['M0,0'] },
      boa: { strokes: ['M1,1 L2,2', '<script>', 42, long], at: 5 },
      ram: { strokes: Array.from({ length: 200 }, () => 'M0,0 L1,1') },
    };
    const c = cleanPortfolio(raw);
    expect(Object.keys(c).sort()).toEqual(['boa', 'ram']);
    expect(c.boa.strokes.length).toBe(2);
    expect(c.boa.strokes[1].length).toBeLessThanOrEqual(MAX_D_CHARS);
    expect(c.ram.strokes.length).toBe(MAX_STROKES);
    expect(cleanPortfolio(null)).toEqual({});
    expect(cleanPortfolio('x')).toEqual({});
  });
  it('收进一幅;重画以最新为准;不认识的 id 不收', () => {
    let b = addDrawing({}, 'box', ['M0,0 L1,1'], 100);
    expect(portfolioCount(b)).toBe(1);
    b = addDrawing(b, 'box', ['M5,5 L6,6'], 200);
    expect(b.box.strokes).toEqual(['M5,5 L6,6']);
    expect(b.box.at).toBe(200);
    b = addDrawing(b, 'nope', ['M0,0'], 1);
    expect(portfolioCount(b)).toBe(1);
  });
  it('没画也收(只看着线稿点了「画好了」)——作品集里仍有这一页', () => {
    const b = addDrawing({}, 'boa', [], 1);
    expect(b.boa.strokes).toEqual([]);
    expect(portfolioCount(b)).toBe(1);
  });
});
