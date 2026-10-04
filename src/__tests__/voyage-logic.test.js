import { describe, it, expect } from 'vitest';
import { nextStop, worldOf, kingDone } from '../shared/voyage-logic.mjs';

const P = [
  { num: '325', built: true },
  { num: '326', built: true },
  { num: '327', built: true },
  { num: '328', built: false },
  { num: '329', built: true },
];

describe('voyage nextStop', () => {
  it('no voyage before the home memories are done', () => {
    expect(nextStop({ page1: false, chapter: 0 }, P)).toBe(null);
  });
  it('home done → the King', () => {
    expect(nextStop({ page1: true, chapter: 0 }, P)).toBe('king325');
  });
  it('each finished planet points to the next built one', () => {
    expect(nextStop({ page1: true, chapter: 1 }, P)).toBe('king326');
    expect(nextStop({ page1: true, chapter: 3 }, P)).toBe('king329');
  });
  it('after the last planet → Earth, then nothing', () => {
    expect(nextStop({ page1: true, chapter: 5 }, P)).toBe('earth');
    expect(nextStop({ page1: true, chapter: 5, earthDone: true }, P)).toBe(null);
  });
  it('earth travels to the desert world', () => {
    expect(worldOf('earth')).toBe('main');
    expect(worldOf('king326')).toBe('king326');
  });
  it('kingDone follows the chapter count', () => {
    expect(kingDone('king325', 1, P)).toBe(true);
    expect(kingDone('king326', 1, P)).toBe(false);
    expect(kingDone('b612', 3, P)).toBe(false);
  });
});
