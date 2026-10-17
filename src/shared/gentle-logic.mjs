// gentle-logic.mjs — 温柔度测试的题库、评分与分档(单一源)
//
// 为什么先收这一份(2026-10-16 接线):同一套五题、同样五个分档,在 `src/gate/quiz.js` 里写过**两份**
// —— DOM 弹窗一份、3D 墙面面板一份,分档判词还各写一遍 if/else。题面或分值一改,两边一起漂,
// 而漂了没有任何判据会红(与第六轮审计 M-10「同一规则两份实现」同一条病)。
// 两边的真实差别只有一个:画布宽 1024px,长判词会被 wrapText 拆到选项区外,所以画布用短版 ⇒
// 一个 tier 带 `desc`(DOM 长版)与 `descShort`(画布短版),两个字段都由这张表裁决。
//
// ⚠️文案是主人的文学内容,不属于工程决定:这里只做"逐字搬拢",没有增删改任何一个字。

/** 五题 × 四选项;`s` = 该选项得分(满分档 20) */
export const GENTLE_QUESTIONS = [
  {
    q: '看到小猫在阳光下打盹，你会？',
    o: [
      { t: '静静看着，不想打扰它', s: 20 },
      { t: '轻轻摸一摸它的小脑袋', s: 15 },
      { t: '拍照发朋友圈', s: 8 },
      { t: '把它叫醒陪自己玩', s: 0 },
    ],
  },
  {
    q: '朋友难过时默默流泪，你会？',
    o: [
      { t: '静静陪在身边，递上纸巾', s: 20 },
      { t: '讲笑话逗她开心', s: 15 },
      { t: '帮她分析问题找办法', s: 10 },
      { t: '让她自己冷静一会儿', s: 5 },
    ],
  },
  {
    q: '你最喜欢的天气是？',
    o: [
      { t: '微风拂面的温暖春日', s: 20 },
      { t: '细雨绵绵的安静黄昏', s: 18 },
      { t: '大雪纷飞的浪漫夜晚', s: 15 },
      { t: '阳光明媚的晴朗早晨', s: 10 },
    ],
  },
  {
    q: '收到一份手工制作的礼物，你会？',
    o: [
      { t: '感动得眼眶湿润', s: 20 },
      { t: '仔细珍藏起来', s: 16 },
      { t: '马上回赠一份礼物', s: 12 },
      { t: '开心地说谢谢', s: 8 },
    ],
  },
  {
    q: '看到樱花缓缓飘落，你会想到？',
    o: [
      { t: '美好总是短暂，要珍惜当下', s: 20 },
      { t: '好美，想永远记住这一刻', s: 18 },
      { t: '明年樱花还会再开的', s: 12 },
      { t: '落在地上打扫起来好麻烦', s: 2 },
    ],
  },
];

/** 满分 = 每题最高分之和(从表里算出来,不写死 100 —— 改了分值指数要跟着变) */
export const GENTLE_MAX_SCORE = GENTLE_QUESTIONS.reduce(
  (sum, item) => sum + Math.max(...item.o.map((opt) => opt.s)),
  0
);

/** 五档判词:`min` 为 inclusive 下限,表按从高到低排,最后一条 min=0 兜住全部。
 *  `mark` 逐字保留两边原有的同一种花(前四档 1F338/1F339/1F33A,第四档是 1F33C、末档 1F33B ——
 *  这个跳号是原实现的样子,不是笔误,改了就是改画面)。 */
export const GENTLE_TIERS = [
  {
    min: 90,
    title: '你是温柔本身',
    desc: '像春风化雨，像暖阳拂面，你的一言一行都浸润着令人心安的温柔。与你相识的人，都会被这份柔软深深治愈。你的温柔不是刻意，而是本能。',
    descShort: '像春风化雨，像暖阳拂面，你的一言一行都浸润着令人心安的温柔。',
    mark: '\u{1F338}',
  },
  {
    min: 75,
    title: '你很温柔，像一杯温热的奶茶',
    desc: '你的温柔藏在细节里，一句关心的问候，一个体贴的举动，都让人倍感温暖。你是那种会让人想靠近的人。',
    descShort: '你的温柔藏在细节里，一句关心的问候，一个体贴的举动，都让人倍感温暖。',
    mark: '\u{1F339}',
  },
  {
    min: 55,
    title: '你有温柔的一面，像秋天的阳光',
    desc: '你的温柔不会时时展露，但在重要时刻，你总能给人恰到好处的温暖。学会多表达，你的温柔会更动人。',
    descShort: '你的温柔不会时时展露，但在重要时刻，你总能给人恰到好处的温暖。',
    mark: '\u{1F33A}',
  },
  {
    min: 35,
    title: '你的温柔藏在心底，等待被发现',
    desc: '你有柔软的心，只是习惯用坚强包裹自己。试着对身边的人多一些表达，你会发现温柔的力量。',
    descShort: '你有柔软的心，只是习惯用坚强包裹自己。试着对身边的人多一些表达。',
    mark: '\u{1F33C}',
  },
  {
    min: 0,
    title: '你是个酷酷的人，温柔是你的另一面',
    desc: '你的表达方式与众不同，但内心深处同样有柔软。偶尔展露温柔，会让人觉得你更加真实可爱。',
    descShort: '你的表达方式与众不同，但内心深处同样有柔软。偶尔展露温柔，会更可爱。',
    mark: '\u{1F33B}',
  },
];

/**
 * 按作答算总分。`answers[i]` = 第 i 题选中的选项下标;未答/越界按 0 分计(不抛错)。
 * @param {Array<number|undefined|null>} answers
 * @returns {number}
 */
export function gentleScore(answers) {
  let total = 0;
  GENTLE_QUESTIONS.forEach((item, qi) => {
    const idx = answers && answers[qi];
    const opt = typeof idx === 'number' && idx >= 0 ? item.o[idx] : undefined;
    if (opt) total += opt.s;
  });
  return total;
}

/**
 * 指数 = 百分比,钳在 0..100(两边原本一个 clamp 一个不 clamp,收成 clamp 的那份:
 * 满分表改动后 Math.round 仍可能出 101)。
 * @param {number} score
 * @returns {number}
 */
export function gentlePct(score) {
  const pct = Math.round((score / GENTLE_MAX_SCORE) * 100);
  return Math.max(0, Math.min(100, pct));
}

/**
 * 按指数取判词档。
 * @param {number} pct
 * @returns {{min:number,title:string,desc:string,descShort:string,mark:string}}
 */
export function gentleTier(pct) {
  const p = gentlePct(pct); // 先归一到 0..100,脏输入(负数/101)也落在首尾两档里
  const hit = GENTLE_TIERS.find((t) => p >= t.min);
  return hit || GENTLE_TIERS[GENTLE_TIERS.length - 1];
}

/**
 * 落库的那一行记录的形状(DOM 与 3D 两条路共用同一个构造,免得两处各写一份字段)。
 * 只记录,不分支 —— 眼下没有任何玩法读它(与 `witness` 同一口径)。
 * @param {Array<number|undefined|null>} answers
 * @param {number} at 时间戳(测试注入用;调用方传 Date.now())
 * @returns {{at:number,score:number,pct:number,answers:number[]}}
 */
export function gentleRecord(answers, at) {
  const clean = GENTLE_QUESTIONS.map((item, qi) => {
    const idx = answers && answers[qi];
    return typeof idx === 'number' && idx >= 0 && idx < item.o.length ? idx : -1;
  });
  const score = gentleScore(answers);
  return { at: Math.round(at), score, pct: gentlePct(score), answers: clean };
}
