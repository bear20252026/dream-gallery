// story-progress.test.js — B612 剧情进度纯逻辑契约(2026-09-24 批3 抽取)
// 回归锚点:章节推进若允许回退,玩家重进旧星球会"倒退"全书进度;
// 书页映射若被"优化"成线性式,任务册显示立刻错位(文案契约不是数学)。
import { describe, it, expect } from 'vitest';
import {
  CHAPTER_MAX,
  PAGES_TOTAL,
  clampChapter,
  advanceChapter,
  pagesBonusForChapter,
  decorateSpiritsState,
  storyBeat,
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
  it('chapter 递进:1=326 虚荣 … 5=330 地理学家', () => {
    expect(storyBeat({ scene2: true, page1: true, chapter: 1 }).zh).toBe('326 · 虚荣之星');
    expect(storyBeat({ scene2: true, page1: true, chapter: 5 }).zh).toBe('330 · 地理学家之星');
  });
  it('六章全完成 = 终章', () => {
    expect(storyBeat({ scene2: true, page1: true, chapter: 6 }).code).toBe('finale');
  });
  it('脏 chapter 钳制后照常给节拍(99→终章,-5→325)', () => {
    expect(storyBeat({ scene2: true, page1: true, chapter: 99 }).code).toBe('finale');
    expect(storyBeat({ scene2: true, page1: true, chapter: -5 }).code).toBe('planet0');
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

describe('书页换算 pagesBonusForChapter(忠实线上现状)', () => {
  it('0..4 按文案映射表', () => {
    expect(pagesBonusForChapter(0)).toBe(1);
    expect(pagesBonusForChapter(1)).toBe(4);
    expect(pagesBonusForChapter(2)).toBe(5);
    expect(pagesBonusForChapter(3)).toBe(6);
    expect(pagesBonusForChapter(4)).toBe(7);
  });
  it('章节 5/6 未映射 → 0(调用方回退 page1 标记,勿擅自补值)', () => {
    expect(pagesBonusForChapter(5)).toBe(0);
    expect(pagesBonusForChapter(6)).toBe(0);
  });
  it('PAGES_TOTAL = 9(九书页进行中)', () => {
    expect(PAGES_TOTAL).toBe(9);
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
