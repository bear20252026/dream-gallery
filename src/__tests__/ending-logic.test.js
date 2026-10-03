// ending-logic.test.js — 结局线纯逻辑契约(2026-10-03「先做结局」)
import { describe, it, expect } from 'vitest';
import {
  ENDING,
  clampEnding,
  advanceEnding,
  endingReady,
  pagesFromEnding,
  endingBeat,
  endingNext,
  listenSignal,
  soundSide,
  walkLinesDue,
  WELL_POS,
  LISTEN_RANGE,
} from '../shared/ending-logic.mjs';
import { BOOK_PAGES, SCENE_WELL, SCENE_FAREWELL, SCENE_EPILOGUE } from '../shared/ending-text.mjs';

describe('结局线进度', () => {
  it('只前进不回退,钳在 0..4', () => {
    expect(advanceEnding(2, 1)).toBe(2);
    expect(advanceEnding(1, 3)).toBe(3);
    expect(clampEnding(99)).toBe(4);
    expect(clampEnding(-3)).toBe(0);
    expect(clampEnding('x')).toBe(0);
  });
  it('327 完成且书页一已读才开始', () => {
    expect(endingReady({ page1: true, chapter: 3 })).toBe(true);
    expect(endingReady({ page1: true, chapter: 2 })).toBe(false);
    expect(endingReady({ page1: false, chapter: 3 })).toBe(false);
    expect(endingReady()).toBe(false);
  });
  it('书页换算单调不减,告别后满 9 页', () => {
    let prev = 0;
    for (let s = 0; s <= ENDING.DONE; s++) {
      const n = pagesFromEnding(s);
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
    expect(pagesFromEnding(ENDING.BOOK)).toBe(8);
    expect(pagesFromEnding(ENDING.FAREWELL)).toBe(9);
  });
  it('每一步都有中英双语的节拍和下一步', () => {
    for (let s = 0; s <= ENDING.DONE; s++) {
      const b = endingBeat(s);
      const n = endingNext(s, 'main');
      expect(b.en.length).toBeGreaterThan(3);
      expect(b.zh.length).toBeGreaterThan(1);
      expect(n.en.length).toBeGreaterThan(3);
      expect(n.zh.length).toBeGreaterThan(1);
    }
    expect(endingBeat(ENDING.DONE).code).toBe('finale');
  });
  it('还在星球里时,先指回沙漠', () => {
    expect(endingNext(0, 'b612').code).toBe('next-book-return');
    expect(endingNext(0, 'main').code).toBe('next-book');
  });
});

describe('找井:用耳朵导航', () => {
  it('越近水声越大,超出范围听不见', () => {
    const far = listenSignal(LISTEN_RANGE + 10, 0).level;
    const mid = listenSignal(80, 0).level;
    const near = listenSignal(5, 0).level;
    expect(far).toBe(0);
    expect(mid).toBeGreaterThan(0);
    expect(near).toBeGreaterThan(mid);
    expect(near).toBeLessThanOrEqual(1);
  });
  it('站定越久听得越清楚,封顶 1', () => {
    expect(listenSignal(50, 0).clarity).toBe(0);
    expect(listenSignal(50, 1).clarity).toBeGreaterThan(0);
    expect(listenSignal(50, 99).clarity).toBe(1);
  });
  it('声像:正前方居中,左边为负,右边为正,背后标记 behind', () => {
    // yaw=0 面朝 -z
    const ahead = soundSide(0, 0, 0, 0, -10);
    expect(Math.abs(ahead.pan)).toBeLessThan(0.01);
    expect(ahead.behind).toBe(false);
    // yaw 增大 = 逆时针转向 -x;所以 -x 方向在 yaw=0 时是左边
    expect(soundSide(0, 0, 0, -10, 0).pan).toBeLessThan(-0.9);
    expect(soundSide(0, 0, 0, 10, 0).pan).toBeGreaterThan(0.9);
    expect(soundSide(0, 0, 0, 0, 10).behind).toBe(true);
  });
  it('路上的台词按走过的路程逐句解锁,不会一次全放', () => {
    expect(walkLinesDue(100, 100, 5)).toBe(0);
    expect(walkLinesDue(100, 85, 5)).toBe(1);
    expect(walkLinesDue(100, 50, 5)).toBeGreaterThan(1);
    expect(walkLinesDue(100, 50, 5)).toBeLessThan(5);
    expect(walkLinesDue(100, 0, 5)).toBe(5);
  });
  it('井的位置在坠机点附近的空地(70m 左右,不在出生点脚下)', () => {
    const d = Math.hypot(WELL_POS.x - -9, WELL_POS.z - 76);
    expect(d).toBeGreaterThan(40);
    expect(d).toBeLessThan(LISTEN_RANGE);
  });
});

describe('结局台词(逐字照 Woods 译本)', () => {
  const all = [];
  BOOK_PAGES.forEach((p) => p.spreads.forEach((s) => all.push(...s.lines)));
  all.push(...SCENE_WELL.start, ...SCENE_WELL.walk, ...SCENE_WELL.found, ...SCENE_WELL.muzzle);
  all.push(
    ...SCENE_FAREWELL.wall,
    ...SCENE_FAREWELL.near,
    ...SCENE_FAREWELL.gift,
    ...SCENE_FAREWELL.last
  );
  const en = all.map((l) => l.en).join('\n') + SCENE_EPILOGUE.captions.map((c) => c.en).join('\n');
  it('每一句都有中英双语与说话人', () => {
    for (const l of all) {
      expect(l.en.length).toBeGreaterThan(0);
      expect(l.zh.length).toBeGreaterThan(0);
      expect(l.who).toBeDefined();
    }
  });
  it('画册页是书页六、七、八', () => {
    expect(BOOK_PAGES.map((p) => p.page)).toEqual([6, 7, 8]);
  });
  for (const q of [
    'Nothing. I own them.',
    'Those are the orders.',
    '...it was blest every day with 1440 sunsets!',
    'We do not record flowers. We do not record them because they are ephemeral.',
    'It is only with the heart that one can see rightly; what is essential is invisible to the eye.',
    'What makes the desert beautiful is that somewhere it hides a well...',
    'Do you hear? We have wakened the well, and it is singing...',
    'you-- only you-- will have stars that can laugh!',
    'Here it is. Let me go on by myself.',
    'And now six years have already gone by...',
  ]) {
    it('原句在场:' + q.slice(0, 40), () => {
      expect(en).toContain(q);
    });
  }
  it('尾声:是/否两种回答各有一句,外加共用收尾与献词', () => {
    expect(SCENE_EPILOGUE.no.en).toContain('sweetness');
    expect(SCENE_EPILOGUE.yes.en).toContain('tears');
    expect(SCENE_EPILOGUE.dedication.en).toContain('All grownups were once children');
  });
});
