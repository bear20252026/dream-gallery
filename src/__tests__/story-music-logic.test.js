// story-music-logic.test.js — 剧情背景音乐编排(2026-10-03)
import { describe, it, expect } from 'vitest';
import { pickCue, CUES, DUCK, FADE_S } from '../shared/story-music-logic.mjs';

describe('story music cues', () => {
  it('五首都在,文件名是 ASCII,音量在 0..0.6', () => {
    expect(Object.keys(CUES).sort()).toEqual([
      'corner',
      'equation',
      'salvation',
      'somewhere',
      'turnaround',
    ]);
    for (const c of Object.values(CUES)) {
      expect(c.file).toMatch(/^[a-z-]+\.mp3$/);
      expect(c.volume).toBeGreaterThan(0);
      expect(c.volume).toBeLessThanOrEqual(0.6);
    }
  });
  it('开场到羊箱之夜:Turnaround', () => {
    expect(pickCue({})).toBe('turnaround');
    expect(pickCue({ scene2: true })).toBe('turnaround');
  });
  it('B612 家:Our Corner;大人们的星球:Equation', () => {
    expect(pickCue({ world: 'b612', scene2: true })).toBe('corner');
    expect(pickCue({ world: 'b612', scene2: true, page1: true })).toBe('corner');
    expect(pickCue({ world: 'king325' })).toBe('equation');
    expect(pickCue({ world: 'king327' })).toBe('equation');
  });
  it('家走完后回沙漠 / 开飞机:Salvation', () => {
    expect(pickCue({ scene2: true, page1: true, chapter: 1 })).toBe('salvation');
    expect(pickCue({ world: 'main', flying: true })).toBe('salvation');
  });
  it('结局:地球之日回到 Turnaround;之后告别放 Somewhere Only We Know,找井静音,尾声也是它', () => {
    const f = { scene2: true, page1: true, chapter: 6, endingReady: true };
    expect(pickCue({ ...f, endingStep: 0 })).toBe('turnaround');
    expect(pickCue({ ...f, endingStep: 0, earthDay: true })).toBe('somewhere');
    expect(pickCue({ ...f, endingStep: 1 })).toBeNull();
    expect(pickCue({ ...f, endingStep: 2 })).toBe('somewhere');
    expect(pickCue({ ...f, endingStep: 4 })).toBe('somewhere');
    expect(pickCue({ world: 'b612', epilogue: true })).toBe('somewhere');
  });
  it('闸门/开场电影永远是 Turnaround(老玩家重进也一样)', () => {
    expect(
      pickCue({ opening: true, scene2: true, page1: true, chapter: 3, endingReady: true })
    ).toBe('turnaround');
  });
  it('闪避与淡入参数合理', () => {
    expect(DUCK).toBeGreaterThan(0);
    expect(DUCK).toBeLessThan(1);
    expect(FADE_S).toBeGreaterThan(0.5);
  });
});
