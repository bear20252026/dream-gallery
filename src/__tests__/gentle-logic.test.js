// gentle-logic.test.js — 温柔度测试的题库、评分与分档(2026-10-16 接线时从 quiz.js 收成一份)
//
// 这个文件钉三件事:
//  1. **文案逐字未动**。判词与题面是主人的文学内容,工程这边只有"搬拢"的权限。所以下面两张表
//     是把接线前 `src/gate/quiz.js` 里两份字面量抄回来做的全量比对 —— 改一个字,这里就红,
//     红的是"有人动了文案",不是"测试写坏了"。
//  2. **数学对得上**:满分、指数、五档的分界。原实现两条路各写一遍 if/else,其中一条不 clamp,
//     另一条 clamp —— 收成 clamp 的那份,并把边界值(90/75/55/35)钉住。
//  3. **表自身是合法的**:min 严格递减且末条为 0,否则某一档要么永远取不到、要么 gentleTier 返回 undefined。
import { describe, it, expect } from 'vitest';
import {
  GENTLE_QUESTIONS,
  GENTLE_MAX_SCORE,
  GENTLE_TIERS,
  gentlePct,
  gentleRecord,
  gentleScore,
  gentleTier,
} from '../shared/gentle-logic.mjs';

// 接线前 quiz.js 里 DOM 那份 gentleQ 的原样(第五轮:选项分值 20/15/8/0 等)
const QUESTIONS_AS_BEFORE = [
  [
    '看到小猫在阳光下打盹，你会？',
    [
      ['静静看着，不想打扰它', 20],
      ['轻轻摸一摸它的小脑袋', 15],
      ['拍照发朋友圈', 8],
      ['把它叫醒陪自己玩', 0],
    ],
  ],
  [
    '朋友难过时默默流泪，你会？',
    [
      ['静静陪在身边，递上纸巾', 20],
      ['讲笑话逗她开心', 15],
      ['帮她分析问题找办法', 10],
      ['让她自己冷静一会儿', 5],
    ],
  ],
  [
    '你最喜欢的天气是？',
    [
      ['微风拂面的温暖春日', 20],
      ['细雨绵绵的安静黄昏', 18],
      ['大雪纷飞的浪漫夜晚', 15],
      ['阳光明媚的晴朗早晨', 10],
    ],
  ],
  [
    '收到一份手工制作的礼物，你会？',
    [
      ['感动得眼眶湿润', 20],
      ['仔细珍藏起来', 16],
      ['马上回赠一份礼物', 12],
      ['开心地说谢谢', 8],
    ],
  ],
  [
    '看到樱花缓缓飘落，你会想到？',
    [
      ['美好总是短暂，要珍惜当下', 20],
      ['好美，想永远记住这一刻', 18],
      ['明年樱花还会再开的', 12],
      ['落在地上打扫起来好麻烦', 2],
    ],
  ],
];

// 接线前 DOM 长版 + 画布短版两份判词的原样(标题与花在两边一致,判词长度不一致)
const TIERS_AS_BEFORE = [
  [
    90,
    '你是温柔本身',
    '像春风化雨，像暖阳拂面，你的一言一行都浸润着令人心安的温柔。与你相识的人，都会被这份柔软深深治愈。你的温柔不是刻意，而是本能。',
    '像春风化雨，像暖阳拂面，你的一言一行都浸润着令人心安的温柔。',
    '\u{1F338}',
  ],
  [
    75,
    '你很温柔，像一杯温热的奶茶',
    '你的温柔藏在细节里，一句关心的问候，一个体贴的举动，都让人倍感温暖。你是那种会让人想靠近的人。',
    '你的温柔藏在细节里，一句关心的问候，一个体贴的举动，都让人倍感温暖。',
    '\u{1F339}',
  ],
  [
    55,
    '你有温柔的一面，像秋天的阳光',
    '你的温柔不会时时展露，但在重要时刻，你总能给人恰到好处的温暖。学会多表达，你的温柔会更动人。',
    '你的温柔不会时时展露，但在重要时刻，你总能给人恰到好处的温暖。',
    '\u{1F33A}',
  ],
  [
    35,
    '你的温柔藏在心底，等待被发现',
    '你有柔软的心，只是习惯用坚强包裹自己。试着对身边的人多一些表达，你会发现温柔的力量。',
    '你有柔软的心，只是习惯用坚强包裹自己。试着对身边的人多一些表达。',
    '\u{1F33C}',
  ],
  [
    0,
    '你是个酷酷的人，温柔是你的另一面',
    '你的表达方式与众不同，但内心深处同样有柔软。偶尔展露温柔，会让人觉得你更加真实可爱。',
    '你的表达方式与众不同，但内心深处同样有柔软。偶尔展露温柔，会更可爱。',
    '\u{1F33B}',
  ],
];

describe('温柔度题库 = 接线前那一份,一个字没动', () => {
  it('五题 × 四选项,题面/选项/分值全量相等', () => {
    const seen = GENTLE_QUESTIONS.map((item) => [item.q, item.o.map((opt) => [opt.t, opt.s])]);
    expect(seen).toEqual(QUESTIONS_AS_BEFORE);
  });

  it('每题恰好四选项(画布那半边按 4 行排版,多了会画到面板外)', () => {
    for (const item of GENTLE_QUESTIONS) expect(item.o.length).toBe(4);
  });

  it('满分由表算出来,且仍是 100(指数就是百分比)', () => {
    expect(GENTLE_MAX_SCORE).toBe(100);
    expect(GENTLE_MAX_SCORE).toBe(
      GENTLE_QUESTIONS.reduce((sum, item) => sum + Math.max(...item.o.map((o) => o.s)), 0)
    );
  });

  it('每道题的最高分选项都在 A(探针与单测按 [0,0,0,0,0] 走"最优解")', () => {
    GENTLE_QUESTIONS.forEach((item) => {
      const best = Math.max(...item.o.map((o) => o.s));
      expect(item.o[0].s, `第几题的 A 不是最高分:${item.q}`).toBe(best);
    });
  });
});

describe('温柔度判词表 = 接线前那两份,一个字没动', () => {
  it('五档的 min/标题/长判词/短判词/花 全量相等', () => {
    const seen = GENTLE_TIERS.map((t) => [t.min, t.title, t.desc, t.descShort, t.mark]);
    expect(seen).toEqual(TIERS_AS_BEFORE);
  });

  it('花那五个码位保持原有的跳号(四档 🌼=1F33C、末档 🌻=1F33B,不是笔误)', () => {
    expect(GENTLE_TIERS.map((t) => t.mark)).toEqual([
      '\u{1F338}',
      '\u{1F339}',
      '\u{1F33A}',
      '\u{1F33C}',
      '\u{1F33B}',
    ]);
  });

  it('画布短版必须比 DOM 长版短(这是两个字段存在的唯一理由)', () => {
    for (const t of GENTLE_TIERS) expect(t.descShort.length).toBeLessThan(t.desc.length);
  });

  it('min 严格递减且末条为 0(否则某一档永远取不到,或 gentleTier 返回 undefined)', () => {
    for (let i = 1; i < GENTLE_TIERS.length; i++)
      expect(GENTLE_TIERS[i].min).toBeLessThan(GENTLE_TIERS[i - 1].min);
    expect(GENTLE_TIERS[GENTLE_TIERS.length - 1].min).toBe(0);
  });
});

describe('温柔度的账', () => {
  it('全选 A = 满分 100,全选 D = 25(最低档)', () => {
    expect(gentleScore([0, 0, 0, 0, 0])).toBe(100);
    expect(gentleScore([3, 3, 3, 3, 3])).toBe(25);
  });

  it('没答/越界/负数都按 0 分计,且不抛错', () => {
    expect(gentleScore([])).toBe(0);
    expect(gentleScore([undefined, undefined, undefined, undefined, undefined])).toBe(0);
    expect(gentleScore([null, null, null, null, null])).toBe(0);
    // [9,-2,0,1.5,3] → 第1题越界0 + 第2题负数0 + 第3题A=20 + 第4题小数下界0 + 第5题D=2
    expect(gentleScore([9, -2, 0, 1.5, 3])).toBe(22);
  });

  it('越界的选项下标不污染总分(1.5 不是合法下标 ⇒ 那题 0 分)', () => {
    expect(gentleScore([0, 0, 0, 0, 1.5])).toBe(80);
  });

  it('指数 = 百分比并钳在 0..100(两条路原本一个 clamp 一个不 clamp,收成 clamp 的那份)', () => {
    expect(gentlePct(0)).toBe(0);
    expect(gentlePct(25)).toBe(25);
    expect(gentlePct(100)).toBe(100);
    expect(gentlePct(101)).toBe(100);
    expect(gentlePct(-10)).toBe(0);
  });

  it('分档边界:90/75/55/35 是 inclusive 下限', () => {
    expect(gentleTier(100).min).toBe(90);
    expect(gentleTier(90).min).toBe(90);
    expect(gentleTier(89).min).toBe(75);
    expect(gentleTier(75).min).toBe(75);
    expect(gentleTier(74).min).toBe(55);
    expect(gentleTier(55).min).toBe(55);
    expect(gentleTier(54).min).toBe(35);
    expect(gentleTier(35).min).toBe(35);
    expect(gentleTier(34).min).toBe(0);
    expect(gentleTier(0).min).toBe(0);
  });

  it('脏指数(负数/大于 100)也落在首尾两档,不返回 undefined', () => {
    expect(gentleTier(120).title).toBe(GENTLE_TIERS[0].title);
    expect(gentleTier(-5).title).toBe(GENTLE_TIERS[GENTLE_TIERS.length - 1].title);
  });

  it('落库记录的形状:未答记 -1,越界记 -1,pct 与 score 自洽', () => {
    const r = gentleRecord([0, 1, 9, undefined, 3], 1700000000123.4);
    expect(r.answers).toEqual([0, 1, -1, -1, 3]);
    expect(r.score).toBe(gentleScore([0, 1, 9, undefined, 3]));
    expect(r.pct).toBe(gentlePct(r.score));
    expect(r.at).toBe(1700000000123);
    expect(Object.keys(r).sort()).toEqual(['answers', 'at', 'pct', 'score']);
  });

  it('两条路(全选 A / 全选 D)记出来的 pct 就是分档表认的那两个极端', () => {
    expect(gentleRecord([0, 0, 0, 0, 0], 1).pct).toBe(100);
    expect(gentleRecord([3, 3, 3, 3, 3], 1).pct).toBe(25);
    expect(gentleTier(gentleRecord([3, 3, 3, 3, 3], 1).pct).min).toBe(0);
  });
});
