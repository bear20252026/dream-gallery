// story-text-collision.test.js — 台词"按文本串当身份"的撞键普查(2026-10-15 第六轮审计 M-09)
//
// 为什么要钉:`tt()` 把显示过的字符串记进 `_shown`(text → 双语条目),`retranslate()` 靠它把
// 已上屏的台词就地换成另一种语言(src/core/gameshell-dialog.js:37~40 是唯一消费方)。
// 也就是说**译文文本本身就是主键**。而 `src/shared/story-text.mjs` 的 497 条 {en, zh} 里,
// 有 8 组串是"同一条文本、两种译法" —— 这些格子上 `_shown.set()` 后写覆盖前写,
// 切一次语言就可能把 A 章的台词换成 B 章的译法。今天还没炸,是因为两两成对的句子
// 很少同屏;但它是**数据层的真歧义**,不是排版问题。
//
// 核实结论(先核实再动手):
//   · 普查走的是**真实导出**(import 后递归收集 {en,zh}),不是正则解析源码:
//     497 条双语、0 条半截(en/zh 缺一个),唯一 en / 唯一 zh 各 433 ⇒ 64 条"同 en 同 zh"的
//     良性重复(反查挑哪条都显示得对,不计入撞键)。
//   · 撞键 8 组 = 同 en 不同 zh 4 组 + 同 zh 不同 en 4 组,全部列在下面并写明两处出处。
//   · 真正的修法只有一个:给每行一个稳定 ID(行 ID 化),让 `_shown` 的键从"译文文本"换成 ID。
//     全仓 `tt(` 有 336 处、分布在 46 个文件(src 全量 grep,含 story-text.mjs 自身的定义行),
//     改法是独立一批,**不属于本轮类型/文案批次** —— 所以这里只做:①登记已知 8 组,
//     ②拦住新增撞键,③把"后写覆盖"这个机制用合成用例钉死(不依赖具体译文,改译文不会误红)。
//   · 没有擅自改写任何译本文案:8 组里有 5 组看着像"该统一"(书页八标题、狐狸标题、地理学家
//     大小写…),但统一成哪个是主人的文学决定,不是我能替的。
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as TEXT from '../shared/story-text.mjs';
import { tt, retranslate, scriptLang, setScriptLang } from '../shared/story-text.mjs';

const ROOT = path.resolve(__dirname, '..', '..');

/** 递归收集所有 {en, zh} 双语条目;返回 {at, en, zh}(at = 导出名 + 路径,便于报出处) */
function collect() {
  const out = [];
  const partial = [];
  const walk = (v, at) => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, at + '[' + i + ']'));
    if (!v || typeof v !== 'object') return;
    if (typeof v.en === 'string' && typeof v.zh === 'string')
      return out.push({ at, en: v.en, zh: v.zh });
    if ('en' in v || 'zh' in v) return partial.push(at); // 半截条目会让分母失真
    for (const k of Object.keys(v)) walk(v[k], at + '.' + k);
  };
  for (const k of Object.keys(TEXT)) if (typeof TEXT[k] !== 'function') walk(TEXT[k], k);
  return { out, partial };
}

/** 同串但另一侧多解的键(= 真撞键) */
function ambiguous(field, other) {
  const m = new Map();
  for (const e of collect().out) {
    if (!m.has(e[field])) m.set(e[field], []);
    m.get(e[field]).push(e);
  }
  return [...m.entries()].filter(([, l]) => new Set(l.map((x) => x[other])).size > 1);
}

// 已登记的撞键(2026-10-15 实测;出处见每组注释)
const KNOWN_SAME_EN = [
  'Page VIII · The Earth', // BOOK_PAGES[2].title / VOYAGE.earth.title
  'The thing that is so good about the box you have given me is that at night he can use it as his house.', // DIALOG_LINES.princeIdle[1] / SCENE3.arrival[3]
  'What is it counting in there?', // REPLIES.night.choices[0].label / .pilot
  'I came down very near here.', // SCENE10.snake[0] / SCENE_WELL.muzzle[4]
];
const KNOWN_SAME_ZH = [
  '地理学家', // BOOK_PAGES[1].place / WHO.geographer
  '书页八 · 地球之日', // BOOK_PAGES[2].title / EARTH_UI.chapter
  '狐狸 · 苹果树下', // EARTH_UI.stops.fox / FOX_UI.title
  '大人都曾是孩子——\n只是记得的，没有几个。', // GLOBAL.loading / SCENE_EPILOGUE.dedication
];

describe('台词按文本当身份的撞键普查(M-09)', () => {
  it('普查分母可信:每条都同时有 en 与 zh,没有半截条目', () => {
    const { out, partial } = collect();
    expect(out.length).toBeGreaterThan(400);
    expect(partial, '半截双语条目: ' + partial.join(', ')).toEqual([]);
  });

  it('同 en 不同 zh:只允许已登记的 4 组(新增即红)', () => {
    const now = ambiguous('en', 'zh').map(([k]) => k);
    expect(now.filter((k) => !KNOWN_SAME_EN.includes(k))).toEqual([]);
  });

  it('同 zh 不同 en:只允许已登记的 4 组(新增即红)', () => {
    const now = ambiguous('zh', 'en').map(([k]) => k);
    expect(now.filter((k) => !KNOWN_SAME_ZH.includes(k))).toEqual([]);
  });
});

describe('撞键的机制性代价:_shown 后写覆盖(合成用例,不依赖具体译文)', () => {
  const prev = scriptLang();
  afterEach(() => setScriptLang(prev));

  it('同一串文本被两条不同译法 tt() 过,反查只能得到最后写过的那条', () => {
    const A = { en: '__rv_collision_synth__', zh: '甲译' };
    const B = { en: '__rv_collision_synth__', zh: '乙译' };
    setScriptLang('en');
    expect(tt(A)).toBe('__rv_collision_synth__');
    expect(tt(B)).toBe('__rv_collision_synth__'); // 同一串文本,两次写入
    setScriptLang('zh');
    // 先显示的 A 换出来的却是 B 的译法 —— 文本当身份时没有别的可依据
    expect(retranslate('__rv_collision_synth__')).toBe('乙译');
  });

  it('不撞键的行不受影响(证明病在键,不在反查机制本身)', () => {
    const C = { en: '__rv_unique_synth_c__', zh: '丙译' };
    const D = { en: '__rv_unique_synth_d__', zh: '丁译' };
    setScriptLang('en');
    tt(C);
    tt(D);
    setScriptLang('zh');
    expect(retranslate('__rv_unique_synth_c__')).toBe('丙译');
    expect(retranslate('__rv_unique_synth_d__')).toBe('丁译');
  });
});

describe('反查表只允许一张(第二张会把 8 组撞键变成乘二)', () => {
  // 扫的是**整个仓库的源码**而不是只有 src/:这张反查表如果长在 lib/、scripts/ 或某个 html 里,
  // 只扫 src/ 就完全放过它(2026-10-17 实测这一条独跑 25s 冲破 vitest 默认 20s 预算 ⇒ 显式给预算;
  // 扩大范围不是因为慢,是因为原来那份**扫漏了**)。测试自己住在 __tests__/,那里的命中不算。
  const SCAN_ROOTS = ['src', 'lib', 'scripts', 'public', 'types', 'hill-src/src'];
  it('`_shown` 只住在 story-text.mjs,别处不得再建 text→条目 的反查表', () => {
    const hits = new Set();
    for (const d of SCAN_ROOTS) {
      const base = path.join(ROOT, d);
      if (!fs.existsSync(base)) continue;
      for (const f of fs.readdirSync(base, { recursive: true })) {
        const inside = String(f).replace(/\\/g, '/');
        if (!/\.(js|mjs|html)$/.test(inside)) continue;
        if (inside.includes('__tests__/')) continue;
        const rel = d + '/' + inside;
        const abs = path.join(base, inside);
        if (!fs.statSync(abs).isFile()) continue;
        if (fs.readFileSync(abs, 'utf8').includes('_shown')) hits.add(rel);
      }
    }
    expect([...hits].sort()).toEqual(['src/shared/story-text.mjs']);
  }, 60_000);
});
