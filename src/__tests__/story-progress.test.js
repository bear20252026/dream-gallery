// story-progress.test.js — B612 剧情进度纯逻辑契约(2026-09-24 批3 抽取)
// 回归锚点:章节推进若允许回退,玩家重进旧星球会"倒退"全书进度;
// 书页映射若被"优化"成线性式,任务册显示立刻错位(文案契约不是数学)。
// 2026-10-03:书页表缺 5/6 行导致倒退,故加"单调不减"专项断言;新增 readPages 单一真相。
import { describe, it, expect } from 'vitest';
import {
  CHAPTER_MAX,
  PAGES_TOTAL,
  clampChapter,
  advanceChapter,
  pagesBonusForChapter,
  pagesFromHomeStep,
  readPages,
  decorateSpiritsState,
  storyBeat,
  storyNext,
} from '../shared/story-progress.mjs';

describe('进程节拍 storyBeat(2026-09-26「情节推进理解困难」单一权威)', () => {
  it('开场:无任何标志 = 坠机·画一只羊', () => {
    expect(storyBeat({})).toEqual({
      code: 'crash',
      en: 'The crash — draw me a sheep',
      zh: '坠机 · 画一只羊',
    });
    expect(storyBeat()).toEqual(storyBeat({}));
  });
  it('画羊完成后(page1 前)= 书页一·夜、羊箱与石门', () => {
    expect(storyBeat({ scene2: true }).code).toBe('night');
    expect(storyBeat({ scene2: true }).zh).toContain('书页一');
  });
  it('书页一完成后 chapter=0 = 当前章 325 国王(chapter=已完成星数,当前=下一颗)', () => {
    const b = storyBeat({ scene2: true, page1: true, chapter: 0 });
    expect(b.code).toBe('planet0');
    expect(b.zh).toBe('325 · 国王之星');
    expect(b.en).toBe('325 · The King');
  });
  it('chapter 递进:1=326 虚荣,2=327 酒鬼(328 起暂由画册页接上,见结局线)', () => {
    expect(storyBeat({ scene2: true, page1: true, chapter: 1 }).zh).toBe('326 · 虚荣之星');
    expect(storyBeat({ scene2: true, page1: true, chapter: 2 }).code).toBe('planet2');
  });
  it('327 完成后接结局线(2026-10-03 先做结局):画册页 → 井 → 告别 → 尾声 → 终章', () => {
    const f = { scene2: true, page1: true, chapter: 3 };
    expect(storyBeat(f).code).toBe('ending-book');
    expect(storyBeat({ ...f, endingStep: 1 }).code).toBe('ending-well');
    expect(storyBeat({ ...f, endingStep: 2 }).code).toBe('ending-farewell');
    expect(storyBeat({ ...f, endingStep: 3 }).code).toBe('ending-epilogue');
    expect(storyBeat({ ...f, endingStep: 4 }).code).toBe('finale');
    expect(storyBeat({ ...f, chapter: 6, endingStep: 4 }).code).toBe('finale');
  });
  it('脏 chapter 钳制后照常给节拍(99→结局线,-5→325)', () => {
    expect(storyBeat({ scene2: true, page1: true, chapter: 99 }).code).toBe('ending-book');
    expect(storyBeat({ scene2: true, page1: true, chapter: -5 }).code).toBe('planet0');
  });
});

describe('下一步指引 storyNext(2026-09-27「剧情发展指引不清」单一权威)', () => {
  it('开场:画板画羊', () => {
    const n = storyNext({});
    expect(n.code).toBe('next-draw');
    expect(n.zh).toContain('画好了');
  });
  it('画羊后:羊箱+石门', () => {
    const n = storyNext({ scene2: true });
    expect(n.code).toBe('next-night');
    expect(n.zh).toContain('石门');
  });
  it('书页一后 chapter=0:去 325', () => {
    const n = storyNext({ scene2: true, page1: true, chapter: 0 });
    expect(n.code).toBe('next-planet0');
    expect(n.zh).toContain('325');
    expect(n.zh).toContain('下一步');
  });
  it('建成的站照常指路:chapter=0 去 325', () => {
    const n = storyNext({ scene2: true, page1: true, chapter: 0 });
    expect(n.code).toBe('next-planet0');
    expect(n.zh).toContain('325');
  });
  it('327 之后不再指向没建成的空岛,改指结局线(2026-10-03 画册页)', () => {
    for (const ch of [3, 4, 5]) {
      const n = storyNext({ scene2: true, page1: true, chapter: ch });
      expect(n.code).toBe('next-book');
      expect(n.code).not.toBe('next-await');
    }
    // 还在星球里:先回沙漠,书在那里翻开
    expect(storyNext({ scene2: true, page1: true, chapter: 3, world: 'king327' }).code).toBe(
      'next-book-return'
    );
  });
  it('建成的站照常指路:chapter=1 去 326,chapter=2 去 327(2026-09-27 第7场)', () => {
    const n1 = storyNext({ scene2: true, page1: true, chapter: 1 });
    expect(n1.code).toBe('next-planet1');
    expect(n1.zh).toContain('326');
    const n2 = storyNext({ scene2: true, page1: true, chapter: 2 });
    expect(n2.code).toBe('next-planet2');
    expect(n2.zh).toContain('327');
  });
  it('结局线逐步指引:井 → 告别 → 星星 → 完', () => {
    const f = { scene2: true, page1: true, chapter: 3 };
    expect(storyNext({ ...f, endingStep: 1 }).code).toBe('next-well');
    expect(storyNext({ ...f, endingStep: 2 }).code).toBe('next-farewell');
    expect(storyNext({ ...f, endingStep: 3 }).code).toBe('next-epilogue');
    expect(storyNext({ ...f, endingStep: 4 }).code).toBe('next-done');
  });
  it('脏 chapter 同 storyBeat 钳制(99→结局线,-5→325)', () => {
    expect(storyNext({ scene2: true, page1: true, chapter: 99 }).code).toBe('next-book');
    expect(storyNext({ scene2: true, page1: true, chapter: -5 }).code).toBe('next-planet0');
  });
});

describe('章节钳制 clampChapter', () => {
  it('正常值原样保留', () => {
    expect(clampChapter(0)).toBe(0);
    expect(clampChapter(3)).toBe(3);
    expect(clampChapter(6)).toBe(6);
  });
  it('脏数据兜底:负数归 0,超 6 封顶,小数取整,非数归 0', () => {
    expect(clampChapter(-2)).toBe(0);
    expect(clampChapter(99)).toBe(6);
    expect(clampChapter(4.7)).toBe(4);
    expect(clampChapter(undefined)).toBe(0);
    expect(clampChapter('abc')).toBe(0);
  });
});

describe('章节推进 advanceChapter(只前进不回退)', () => {
  it('更大的 n 才推进', () => {
    expect(advanceChapter(2, 3)).toBe(3);
  });
  it('更小的 n 不回退(重进旧星球不倒退进度)', () => {
    expect(advanceChapter(4, 1)).toBe(4);
  });
  it('相同值幂等', () => {
    expect(advanceChapter(5, 5)).toBe(5);
  });
  it('封顶 6,脏 n 不越界', () => {
    expect(advanceChapter(6, 6)).toBe(6);
    expect(advanceChapter(2, 99)).toBe(6);
    expect(advanceChapter(3, -1)).toBe(3);
  });
  it('CHAPTER_MAX 恒为 6(六颗星球契约)', () => {
    expect(CHAPTER_MAX).toBe(6);
  });
});

// 2026-10-03 重写:旧表缺 5/6 两行 → 回退 0 → 被调用方 Math.max(1,0) 兜底 →
// 书页从 7 倒退到 1(玩家可见)。现按剧本场次总表逐场对齐,并钉死单调不减。
describe('书页换算 pagesBonusForChapter(按剧本场次总表,已读页数)', () => {
  it('0..6 全部有映射,无一回落', () => {
    expect(pagesBonusForChapter(0)).toBe(3); // B612 三页已完成,325 正在演
    expect(pagesBonusForChapter(1)).toBe(4); // 剧本 6 场 = 书页四(325)
    expect(pagesBonusForChapter(2)).toBe(4); // 剧本 7 场 = 书页五,326 刚完 → 仍未满
    expect(pagesBonusForChapter(3)).toBe(5); // 326 与 327 同属书页五,327 完成才满
    expect(pagesBonusForChapter(4)).toBe(5); // 剧本 8 场 = 书页六,328 刚完
    expect(pagesBonusForChapter(5)).toBe(6); // 328 与 329 同属书页六,329 完成才满
    expect(pagesBonusForChapter(6)).toBe(7); // 剧本 9 场 = 书页七(330 地理学家)
  });
  it('单调不减:重进旧星球不得看到书页倒退(2026-10-03 修的核心 bug)', () => {
    let prev = 0;
    for (let ch = 0; ch <= CHAPTER_MAX; ch++) {
      const n = pagesBonusForChapter(ch);
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });
  it('started=false(故事未开始)→ 0,别让全新存档一进游戏就显示「3 / 9」', () => {
    expect(pagesBonusForChapter(0, false)).toBe(0);
    expect(pagesBonusForChapter(6, false)).toBe(0);
  });
  it('钳制:负数/超界/脏数据都落在映射表内,不返回 0', () => {
    expect(pagesBonusForChapter(-5)).toBe(3);
    expect(pagesBonusForChapter(99)).toBe(7);
    expect(pagesBonusForChapter(undefined)).toBe(3);
    expect(pagesBonusForChapter(NaN)).toBe(3);
  });
  it('PAGES_TOTAL = 9(九书页进行中)', () => {
    expect(PAGES_TOTAL).toBe(9);
  });
});

describe('B612 三页细分 pagesFromHomeStep', () => {
  it('站数 → 已读页数(站二树苗与站三日落同属剧本书页一「家与日常」)', () => {
    expect(pagesFromHomeStep(0)).toBe(0);
    expect(pagesFromHomeStep(1)).toBe(1);
    expect(pagesFromHomeStep(2)).toBe(2);
    expect(pagesFromHomeStep(3)).toBe(2); // 日落站仍属书页一
    expect(pagesFromHomeStep(4)).toBe(3); // 玫瑰站 = 书页二(相见)+书页三(离别)
  });
  it('脏数据钳进 0..4', () => {
    expect(pagesFromHomeStep(-3)).toBe(0);
    expect(pagesFromHomeStep(88)).toBe(3);
    expect(pagesFromHomeStep(NaN)).toBe(0);
  });
});

describe('书页单一真相 readPages(2026-10-03)', () => {
  it('B612 途中:按 homeMemoryStep 细分显示,不再恒为 1', () => {
    expect(readPages({ scene2: true, homeMemoryStep: 0 })).toBe(1);
    expect(readPages({ scene2: true, homeMemoryStep: 1 })).toBe(1);
    expect(readPages({ scene2: true, homeMemoryStep: 2 })).toBe(2);
    expect(readPages({ scene2: true, homeMemoryStep: 3 })).toBe(2);
    expect(readPages({ scene2: true, homeMemoryStep: 4 })).toBe(3);
  });
  it('page1 未完成时章节值不参与(chapter 0 是初值,玩家还没读第一页)', () => {
    expect(readPages({ scene2: true, chapter: 0 })).toBe(1);
    expect(readPages({ scene2: true, chapter: 3 })).toBe(1);
  });
  it('page1 总闸优先(旧存档只有 page1 → 满 3 页,不强迫重玩)', () => {
    expect(readPages({ page1: true })).toBe(3);
    expect(readPages({ page1: true, homeMemoryStep: 1 })).toBe(3);
  });
  it('B612 完成后章节线接管', () => {
    expect(readPages({ page1: true, chapter: 0 })).toBe(3);
    expect(readPages({ page1: true, chapter: 1 })).toBe(4);
    expect(readPages({ page1: true, chapter: 3 })).toBe(5);
    expect(readPages({ page1: true, chapter: 6 })).toBe(7);
  });
  it('全程单调不减:从开场一路推进到六章全完成', () => {
    let prev = 0;
    const path = [
      {},
      { scene2: true },
      { scene2: true, homeMemoryStep: 2 },
      { scene2: true, homeMemoryStep: 4 },
      { scene2: true, page1: true, homeMemoryStep: 4, chapter: 0 },
      { scene2: true, page1: true, chapter: 1 },
      { scene2: true, page1: true, chapter: 2 },
      { scene2: true, page1: true, chapter: 3 },
      { scene2: true, page1: true, chapter: 4 },
      { scene2: true, page1: true, chapter: 5 },
      { scene2: true, page1: true, chapter: 6 },
    ];
    for (const f of path) {
      const n = readPages(f);
      expect(n).toBeGreaterThanOrEqual(prev);
      expect(n).toBeLessThanOrEqual(PAGES_TOTAL);
      prev = n;
    }
    expect(prev).toBe(7);
  });
  it('结局线把书页推到 8、9(画册页六~八 = 8 页,告别 = 9 页),单调不减', () => {
    const f = { scene2: true, page1: true, chapter: 3 };
    expect(readPages({ ...f, endingStep: 0 })).toBe(5);
    expect(readPages({ ...f, endingStep: 1 })).toBe(8);
    expect(readPages({ ...f, endingStep: 2 })).toBe(8);
    expect(readPages({ ...f, endingStep: 3 })).toBe(9);
    expect(readPages({ ...f, endingStep: 4 })).toBe(PAGES_TOTAL);
    // 327 没完成时,脏的 endingStep 不让书页跳级
    expect(readPages({ scene2: true, page1: true, chapter: 2, endingStep: 4 })).toBe(4);
  });
  it('空存档返回 1(不是 0:开场已在读第一页)', () => {
    expect(readPages({})).toBe(1);
    expect(readPages()).toBe(1);
  });
});

describe('罗盘 place 装饰 decorateSpiritsState', () => {
  const planets = [
    { name: '国王星', en: 'King', place: '325' },
    { name: '虚荣星', en: 'Vain', place: '326' },
  ];
  const base = [
    { name: 'a', en: 'A', place: '325' },
    { name: 'b', en: 'B', place: '326' },
    { name: 'c', en: 'C', place: '其他' },
  ];
  it('未点亮章节 place 原样', () => {
    const out = decorateSpiritsState(base, planets, 0);
    expect(out[0].place).toBe('325');
    expect(out[1].place).toBe('326');
  });
  it('已点亮章节 place 追加「 · 已点亮」', () => {
    const out = decorateSpiritsState(base, planets, 2);
    expect(out[0].place).toBe('325 · 已点亮');
    expect(out[1].place).toBe('326 · 已点亮');
  });
  it('超出星球数量的项原样透传(与 SPIRITS 尾部对齐)', () => {
    const out = decorateSpiritsState(base, planets, 6);
    expect(out[2]).toBe(base[2]);
  });
  it('不改动入参(返回新对象)', () => {
    const snapshot = JSON.stringify(base);
    decorateSpiritsState(base, planets, 2);
    expect(JSON.stringify(base)).toBe(snapshot);
  });
  it('空数组安全', () => {
    expect(decorateSpiritsState(null, planets, 1)).toEqual([]);
  });
});
