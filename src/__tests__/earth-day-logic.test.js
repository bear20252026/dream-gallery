import { describe, it, expect } from 'vitest';
import { earthDue, EARTH_STOPS, EARTH_DONE } from '../shared/earth-day-logic.mjs';

describe('earth day', () => {
  it('seven stops in the book order', () => {
    expect(EARTH_STOPS).toEqual([
      'snake',
      'flower',
      'echo',
      'roses',
      'fox',
      'rosesAgain',
      'foxAgain',
    ]);
    expect(EARTH_DONE).toBe(7);
  });
  it('starts only after all six planets', () => {
    expect(earthDue({ page1: true, chapter: 5 })).toBe(false);
    expect(earthDue({ page1: true, chapter: 6 })).toBe(true);
  });
  it('not again once walked, nor after the ending began (old saves)', () => {
    expect(earthDue({ page1: true, chapter: 6, earthDay: true })).toBe(false);
    expect(earthDue({ page1: true, chapter: 6, endingStep: 1 })).toBe(false);
  });
});
