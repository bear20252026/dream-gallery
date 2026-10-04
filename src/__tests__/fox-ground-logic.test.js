// fox-ground-logic.test.js — the fox diorama rests on the sand (2026-10-04)
import { describe, it, expect } from 'vitest';
import {
  groundShift,
  lowestGround,
  meadowDisc,
  STANDING,
  STAGE,
  HIDDEN_PARTS,
} from '../shared/fox-ground-logic.mjs';

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
    expect(HIDDEN_PARTS).toContain('Nubes_2');
    expect(HIDDEN_PARTS).not.toContain('Object_9'); // trunks stay
    expect(HIDDEN_PARTS).not.toContain('Object_13'); // leaves stay
    expect(STANDING).toEqual(['Zorro_5', 'Principito_4', 'Pasto_8', 'Trigo_9']);
  });
  it('meadowDisc: solid in the middle, fading to nothing at the rim, valid triangles', () => {
    const { verts, index } = meadowDisc(5, 6, 20, 0.5);
    expect(verts[0]).toEqual({ x: 0, z: 0, a: 1, t: 0 });
    const rim = verts.filter((v) => v.t === 1);
    expect(rim.length).toBe(20);
    expect(rim.every((v) => v.a === 0)).toBe(true);
    expect(rim.every((v) => Math.abs(Math.hypot(v.x, v.z) - 5) < 1e-9)).toBe(true);
    expect(verts.filter((v) => v.t <= 0.5).every((v) => v.a === 1)).toBe(true);
    expect(index.length % 3).toBe(0);
    expect(Math.max(...index)).toBe(verts.length - 1);
    expect(Math.min(...index)).toBe(0);
    expect(index.length / 3).toBe(20 + 2 * 20 * 5); // centre fan + two triangles per quad
  });
});
