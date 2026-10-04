// fox-ground-logic.test.js — the fox diorama rests on the sand (2026-10-04)
import { describe, it, expect } from 'vitest';
import { groundShift, lowestGround, STANDING, STAGE, CLOUDS } from '../shared/fox-ground-logic.mjs';

describe('fox ground', () => {
  it('groundShift moves the lowest point onto the ground plus clearance', () => {
    expect(groundShift(1.39, 0.23)).toBeCloseTo(-1.16);
    expect(groundShift(4.34, 0.63, 0.3)).toBeCloseTo(-3.41);
    expect(groundShift(0, 0)).toBe(0);
  });
  it('groundShift ignores non-finite input instead of flinging the model away', () => {
    expect(groundShift(NaN, 1)).toBe(0);
    expect(groundShift(1, undefined)).toBe(0);
  });
  it('lowestGround finds the lowest sample on a slope', () => {
    const box = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
    expect(lowestGround((x, z) => 1 + x * 0.1 + z * 0.05, box)).toBeCloseTo(1);
    expect(lowestGround(() => NaN, box)).toBe(0);
  });
  it('names the parts it grounds', () => {
    expect(STAGE).toBe('Escenario_0');
    expect(CLOUDS).toBe('Nubes_2');
    expect(STANDING).toEqual(['Zorro_5', 'Principito_4', 'Pasto_8', 'Trigo_9']);
  });
});
