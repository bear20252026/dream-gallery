import { describe, it, expect } from 'vitest';
import { STAR_STOPS, stopStates, layoutFor } from '../shared/star-map-logic.mjs';
import { chapterStates } from '../shared/chapter-map-logic.mjs';

describe('star map', () => {
  it('eight stops: Earth, B612, then 325..330 in book order', () => {
    expect(STAR_STOPS.map((s) => s.id)).toEqual([
      'earth',
      'b612',
      'king325',
      'king326',
      'king327',
      'king328',
      'king329',
      'king330',
    ]);
  });
  it('new save: Earth is current, everything else in shadow', () => {
    const s = stopStates(chapterStates({}));
    expect(s.earth).toBe('current');
    expect(s.b612).toBe('locked');
    expect(s.king325).toBe('locked');
  });
  it('after 326: 325/326 done, 327 glows, Earth always reachable', () => {
    const s = stopStates(chapterStates({ scene2: true, page1: true, chapter: 2 }));
    expect(s.earth).toBe('done');
    expect(s.b612).toBe('done');
    expect(s.king326).toBe('done');
    expect(s.king327).toBe('current');
    expect(s.king328).toBe('locked');
  });
  it('layouts stay inside the sky', () => {
    for (const p of [true, false])
      for (const [x, y] of layoutFor(p)) {
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(100);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(100);
      }
  });
});
