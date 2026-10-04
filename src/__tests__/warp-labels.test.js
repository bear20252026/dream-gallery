import { describe, it, expect } from 'vitest';
import { warpDest } from '../shared/warp-labels.mjs';

describe('warp destination labels', () => {
  it('names every world the player can fly to', () => {
    expect(warpDest('main').label.en).toBe('Earth · the desert');
    expect(warpDest('b612').label.zh).toBe('B612 号小行星');
    expect(warpDest('king329').label.en).toBe('329 · The Lamplighter');
    expect(warpDest('king329').color).toBe('#a8c8e0');
    expect(warpDest('nowhere')).toBe(null);
  });
});
