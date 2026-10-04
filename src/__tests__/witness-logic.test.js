// witness-logic.test.js — witness cards for the 325 / 326 / 327 memories (2026-10-04)
import { describe, it, expect } from 'vitest';
import {
  WITNESS,
  WITNESS_IDS,
  tapStep,
  cleanWitness,
  recordWitness,
} from '../shared/witness-logic.mjs';

describe('witness', () => {
  it('every card has bilingual text', () => {
    for (const id of WITNESS_IDS) {
      const w = WITNESS[id];
      for (const t of [w.title, w.hint, w.done]) {
        expect(t.en).toBeTruthy();
        expect(t.zh).toBeTruthy();
      }
    }
    for (const o of WITNESS.king325.options) {
      expect(o.label.en && o.label.zh).toBeTruthy();
    }
  });
  it('tapStep stops at the target and reports done', () => {
    expect(tapStep(0, 3)).toEqual({ taps: 1, done: false });
    expect(tapStep(2, 3)).toEqual({ taps: 3, done: true });
    expect(tapStep(3, 3)).toEqual({ taps: 3, done: true });
    expect(tapStep('x', 0)).toEqual({ taps: 1, done: true });
  });
  it('cleanWitness drops junk and keeps valid answers', () => {
    expect(cleanWitness(null)).toEqual({});
    expect(
      cleanWitness({
        king325: { value: 'refuse' },
        vain326: { taps: 12 },
        tippler327: { taps: 400 },
        other: { taps: 1 },
      })
    ).toEqual({ king325: { value: 'refuse' }, vain326: { taps: 12 } });
    expect(cleanWitness({ king325: { value: 'fly' } })).toEqual({});
  });
  it('recordWitness keeps earlier answers and lets a replay overwrite', () => {
    let b = recordWitness({}, 'king325', 'obey');
    b = recordWitness(b, 'tippler327', 3);
    expect(b).toEqual({ king325: { value: 'obey' }, tippler327: { taps: 3 } });
    b = recordWitness(b, 'king325', 'ask');
    expect(b.king325.value).toBe('ask');
    expect(recordWitness(b, 'nope', 1)).toEqual(b);
    expect(recordWitness(b, 'king325', 'fly').king325).toBeUndefined();
  });
});
