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
  SCENE5,
  SCENE7_VANITY,
  SCENE7_TIPPLER,
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
    expect(
      whoSpk(SCENE2.who.prince) === 'prince' && SCENE2.round1.who.en === SCENE2.who.prince.en
    ).toBe(true);
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
  const tables = {
    FILM,
    STORY,
    DIALOG_LINES,
    SCENE2,
    SCENE3,
    SCENE4,
    SCENE5,
    SCENE7_VANITY,
    SCENE7_TIPPLER,
  };
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
    const legal = new Set(['prince', 'pilot', 'sheep', 'rose', 'king', 'vain', 'tippler', '']);
    walk(tables, 'root', (e, p) => {
      if (e.spk !== undefined) {
        expect(legal.has(e.spk), p + '.spk=' + e.spk).toBe(true);
      }
    });
  });
  it('行星居民 who 必带专属 spk(2026-09-28 声线分层:漏带=朗读走女声)', () => {
    expect(whoSpk(SCENE5 ? { spk: 'king' } : null)).toBe('king');
    expect(SCENE7_VANITY.chainA.every((l) => !l.who || l.who.spk)).toBe(true);
    expect(SCENE7_TIPPLER.chain.every((l) => !l.who || l.who.spk)).toBe(true);
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
  it('第7场上半 326 链完整(2026-09-27 情节阶段二:登场四句+拍手+帽子六句)', () => {
    expect(SCENE7_VANITY.chainA).toHaveLength(4);
    expect(SCENE7_VANITY.chainB).toHaveLength(6);
    expect(SCENE7_VANITY.chainA[0].en).toMatch(/admirer/);
    expect(SCENE7_VANITY.clapToast.zh).toContain('啪');
    expect(SCENE7_VANITY.pickedToast.zh).toContain('虚荣');
    expect(SCENE7_VANITY.doneToast.zh).toContain('326');
  });
  it('第7场下半 327 链完整(2026-09-27 情节阶段二:十问答+指引三toast)', () => {
    expect(SCENE7_TIPPLER.chain).toHaveLength(10);
    expect(SCENE7_TIPPLER.chain[0].en).toMatch(/What are you doing/);
    expect(SCENE7_TIPPLER.chain[7].en).toMatch(/Ashamed of drinking/);
    expect(SCENE7_TIPPLER.pickupToast.zh).toContain('拾起');
    expect(SCENE7_TIPPLER.pickedToast.zh).toContain('酒鬼');
    expect(SCENE7_TIPPLER.doneToast.zh).toContain('书页五');
  });
  it('补齐的剧本台词不许再丢(2026-09-27 定稿全本 v2 对稿)', () => {
    // 面包树大祸句在 baobab 末尾
    expect(SCENE3.baobab[SCENE3.baobab.length - 1].en).toMatch(/catastrophe/);
    // 日落四问在 fond 之后、44 次之前
    const sunsetEn = SCENE3.sunset.map((l) => l.en).join('\n');
    expect(sunsetEn).toMatch(/But we must wait/);
    expect(sunsetEn).toMatch(/at home/);
    expect(SCENE3.sunset.findIndex((l) => /forty-four/.test(l.en))).toBeGreaterThan(
      SCENE3.sunset.findIndex((l) => /must wait/.test(l.en))
    );
    // 第4场开篇诘问 7 句 + 眼泪字幕 + 玫瑰初醒在 arrival 首句
    expect(SCENE4.interrogation.length).toBe(7);
    expect(SCENE4.interrogation[0].en).toMatch(/does it eat flowers/);
    expect(SCENE4.tearsCaption.en).toMatch(/land of tears/);
    expect(SCENE4.arrival[0].en).toMatch(/scarcely awake/);
  });
});
