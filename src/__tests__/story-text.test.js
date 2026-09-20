// story-text.test.js — 剧情台词单一源契约(2026-09-18 审计 P1 补测)
// 守三条:①tt 双语切换语义;②whoSpk 说话人视觉类型映射;③数据完整性(全表双语、who 带 spk)。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  setScriptLang,
  scriptLang,
  tt,
  whoSpk,
  FILM,
  STORY,
  DIALOG_LINES,
  SCENE2,
  SCENE3,
  SCENE4,
} from '../shared/story-text.mjs';

describe('tt 双语切换', () => {
  beforeEach(() => setScriptLang('en'));
  it('默认 en;取 en 字段', () => {
    expect(scriptLang()).toBe('en');
    expect(tt({ en: 'hi', zh: '嗨' })).toBe('hi');
  });
  it('切 zh 后取 zh 字段;非法值回退 en', () => {
    setScriptLang('zh');
    expect(tt({ en: 'hi', zh: '嗨' })).toBe('嗨');
    setScriptLang('fr');
    expect(scriptLang()).toBe('en');
  });
  it('空入参返回空串;缺当前语言回退另一语', () => {
    expect(tt(null)).toBe('');
    setScriptLang('zh');
    expect(tt({ en: 'only' })).toBe('only');
  });
});

describe('whoSpk 说话人视觉类型', () => {
  it('who 常量带 spk:prince/pilot/sheep/rose', () => {
    expect(whoSpk(SCENE2.who.prince)).toBe('prince');
    expect(whoSpk(SCENE2.who.pilot)).toBe('pilot');
    expect(whoSpk(SCENE2.who.sheep)).toBe('sheep');
    expect(whoSpk(SCENE2.who.prince) === 'prince' && SCENE2.round1.who.en === SCENE2.who.prince.en).toBe(true);
  });
  it('SCENE3.countingWho 是羊(sheep 配色)', () => {
    expect(whoSpk(SCENE3.countingWho)).toBe('sheep');
  });
  it('无 spk 的 who 回退空串(默认羊皮卷样式)', () => {
    expect(whoSpk({ en: 'B612', zh: 'B612' })).toBe('');
    expect(whoSpk(null)).toBe('');
  });
});

describe('数据完整性:全表双语,who 全带 spk', () => {
  const isBilingual = (e) => e && typeof e.en === 'string' && typeof e.zh === 'string';
  const walk = (node, path, fn) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.en === 'string') fn(node, path);
    for (const k of Object.keys(node)) walk(node[k], path + '.' + k, fn);
  };
  const tables = { FILM, STORY, DIALOG_LINES, SCENE2, SCENE3, SCENE4 };
  it('六大表逐条 {en,zh} 齐备', () => {
    let n = 0;
    for (const [name, t] of Object.entries(tables)) {
      walk(t, name, (e, p) => {
        expect(isBilingual(e), p).toBe(true);
        n++;
      });
    }
    expect(n).toBeGreaterThan(80); // 全表规模护栏(目前 ~110 条)
  });
  it('who 对象全部带 spk(spk 字段存在即校验合法值)', () => {
    const legal = new Set(['prince', 'pilot', 'sheep', 'rose', '']);
    walk(tables, 'root', (e, p) => {
      if (e.spk !== undefined) {
        expect(legal.has(e.spk), p + '.spk=' + e.spk).toBe(true);
      }
    });
  });
  it('剧情主链的关键键存在(模块消费契约)', () => {
    expect(FILM.question).toBeTruthy();
    expect(STORY.princeWake.en).toMatch(/sheep/);
    expect(SCENE2.round1).toBeTruthy();
    expect(Array.isArray(SCENE2.after)).toBe(true);
    expect(Array.isArray(SCENE3.arrival)).toBe(true);
    expect(SCENE3.exitBridge).toBeTruthy();
    expect(Array.isArray(SCENE4.farewell)).toBe(true);
  });
});
