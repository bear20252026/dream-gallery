// story-progress.mjs — B612 剧情进度纯逻辑(2026-09-24 自 planets.js / gameshell-system.js 抽出)
// 目的:剧情域大文件每次改都是回归裸奔——把不依赖 3D 的进度契约钉进单测。
// 四条契约:
//   1. 章节只前进不回退,封顶 6(setChapter/存档回读共用);
//   2. 书页换算(已读页数,0..9)→ 任务册「书页 x/9」;语义 = **已完成页数**,单调不减;
//   3. 罗盘页 place 装饰:已点亮章节追加「 · 已点亮」(顺序与 spirits SPIRITS 一致);
//   4. readPages() 是书页的唯一真相(2026-10-03):任务册「书页」行与「进程」行必须同源。
// 回归锚点:书页映射表改动曾只改一处漏另一处(线性映射想当然),此表是唯一权威;
// 2026-10-03 又发现缺 5/6 两行会让书页从 7 倒退到 1,故补全 + 单测钉死单调不减。
import { PLANETS } from './planet-logic.mjs';
import { endingReady, pagesFromEnding, endingBeat, endingNext } from './ending-logic.mjs';

/** 章节封顶(6 = 六章全部点亮) */
export const CHAPTER_MAX = 6;

/** 任意读数钳进 0..6(存档脏数据兜底) */
export function clampChapter(n) {
  n = Number(n) || 0;
  if (n < 0) return 0;
  return Math.min(Math.floor(n), CHAPTER_MAX);
}

/** 章节推进:只前进不回退(setChapter 语义)。返回新章节,不落盘——落盘由调用方做 */
export function advanceChapter(current, n) {
  return Math.max(clampChapter(current), clampChapter(n));
}

/**
 * 章节 → 任务册书页数(9 页制)。语义 = **已完成页数**。
 *
 * ⚠️ 2026-10-03 重写。此前此表缺 5/6 两行,回退 0,被调用方 Math.max(1, 0) 兜底,
 * 会让书页从 7 **倒退到 1** ——玩家可见的倒退。现按剧本场次总表逐场对齐:
 *   剧本 3/4/5 场 = 书页一/二/三(B612 家与日常 → 玫瑰 → 离别)→ 由 homeMemoryStep 细分
 *   剧本   6 场   = 书页四(325 国王)          → chapter 1 完成才进 4 页
 *   剧本   7 场   = 书页五(326 **与** 327 同页)→ chapter 2 停在 4 页,3 才进 5 页
 *   剧本   8 场   = 书页六(328 **与** 329 同页)→ chapter 4 停在 5 页,5 才进 6 页
 *   剧本   9 场   = 书页七(330 地理学家)      → chapter 6 完成才进 7 页
 * 语义 = **已完成页数**,单调不减是硬要求(玩家重进旧星球不得看到进度回退,单测钉死)。
 *
 * ⚠️ started=false 返回 0,且**必须在 B612(page1)完成后才让章节值参与**(见 readPages):
 * chapter 0 是存档初值(325 未完成),不代表 B612 三页已读完。若无条件取用,
 * 画羊刚完成、还没进石门的玩家会看到「书页 3 / 9」——他连第一页都没读到。
 */
const CHAPTER_TO_PAGES = { 0: 3, 1: 4, 2: 4, 3: 5, 4: 5, 5: 6, 6: 7 };
export function pagesBonusForChapter(chapter, started = true) {
  if (!started) return 0;
  return CHAPTER_TO_PAGES[clampChapter(chapter)] ?? 3;
}

/** 任务册书页总数(展示层「x / 9」的分母)。唯一来源,禁止再硬编码。 */
export const PAGES_TOTAL = 9;

/**
 * B612 家的三页细分(2026-10-03)。剧本第 3/4/5 场 = 书页一/二/三,
 * 但三场在实现里是 scene3-memory 的 4 个 STEPS(volcano/baobab/sunset/rose),
 * 玫瑰那一站内部又含 相见(regret 前)与 离别 两段。
 * → 用 homeMemoryStep(0..4 已完成站数)换算"已完成页数":
 *   0 站→0 页 · 1 站→1 页 · 2 站→2 页 · 3 站(日落)→2 页 · 4 站(玫瑰/离别)→3 页
 * 站三(日落)与站二(树苗)同属剧本书页一(家与日常),故两站都只到 2 页。
 * @param {number} homeMemoryStep 已完成的 B612 站数
 */
export function pagesFromHomeStep(homeMemoryStep) {
  const s = Math.max(0, Math.min(4, Math.floor(Number(homeMemoryStep) || 0)));
  return [0, 1, 2, 2, 3][s];
}

/**
 * 书页数单一真相(2026-10-03)。任务册「书页 x / 9」与「进程」行必须同源,
 * 否则会出现「进程:书页五 进行中」与「书页:1 / 9」自相矛盾(2026-10-03 修)。
 * 三段进度取最大:开场弧线(B612 三页) / 星球章节 / 已完成 B612 站数。
 * @param {{scene2?:boolean,page1?:boolean,chapter?:number,homeMemoryStep?:number}} flags
 * @returns {number} 0..PAGES_TOTAL
 */
export function readPages(flags) {
  const f = flags || {};
  const home = f.page1 ? pagesFromHomeStep(4) : pagesFromHomeStep(f.homeMemoryStep);
  // 章节值只在 B612 三页完成后参与。chapter 0 是存档初值,此刻玩家连第一页都没开始读;
  // 剧本书页一二三 = B612 三场,书页四起才是星球线,所以 page1 之前一律不看章节。
  const chapterPages = f.page1 ? pagesBonusForChapter(f.chapter, true) : 0;
  // 结局线(2026-10-03):画册页六~八 + 找井/告别 = 书页六~九。只在 327 完成后参与。
  const endPages = endingReady(f) ? pagesFromEnding(f.endingStep) : 0;
  return Math.min(PAGES_TOTAL, Math.max(1, home, chapterPages, endPages));
}

/**
 * 进程节拍(2026-09-26 主人报「情节推进理解困难」单一权威)。
 * 按存档标志算「现在讲到哪」,任务册「进程」行展示 —— 开场弧线(坠机→画羊→夜与石门)
 * 此前在羊皮卷上不可见(书页数字不讲人名),玩家不知道故事进行到哪一章。
 * chapter 语义 = 已完成星数(scene6-king 完成时 setChapter(1))→ 当前章 = 下一颗未完成的星。
 * @param {{scene2?:boolean, page1?:boolean, chapter?:number}} flags 存档标志
 * @returns {{code:string, en:string, zh:string}} 调用方 tt() 取当前语言
 */
export function storyBeat(flags) {
  const f = flags || {};
  const ch = clampChapter(f.chapter);
  if (!f.scene2) {
    return { code: 'crash', en: 'The crash — draw me a sheep', zh: '坠机 · 画一只羊' };
  }
  if (!f.page1) {
    return {
      code: 'night',
      en: 'Page I — the night, the box & the glowing door',
      zh: '书页一 · 夜、羊箱与石门',
    };
  }
  // 结局线(2026-10-03):327 之后直接接画册页 → 井 → 告别 → 尾声
  if (endingReady(f)) return endingBeat(f.endingStep);
  const p = PLANETS[ch]; // 已完成 ch 颗 → 当前章是下一颗(325 起)
  if (!p) {
    return { code: 'finale', en: 'Finale — the book is written', zh: '终章 · 这本书，写完了' };
  }
  return { code: 'planet' + ch, en: p.num + ' · ' + p.en, zh: p.num + ' · ' + p.name };
}

/**
 * 下一步指引(2026-09-27「剧情发展指引不清」全链补齐)。
 * 与 storyBeat 同输入,回答「接下来做什么+去哪+怎么去」—— 任务册「下一步」行、
 * B612 首进 toast、探针断言的唯一权威。改文案只许动这里(双语同行)。
 * chapter 语义同 storyBeat(已完成星数 → 当前章=下一颗)。
 * @param {{scene2?:boolean, page1?:boolean, chapter?:number}} flags 存档标志
 * @returns {{code:string, en:string, zh:string}}
 */
export function storyNext(flags) {
  const f = flags || {};
  const ch = clampChapter(f.chapter);
  if (!f.scene2) {
    return {
      code: 'next-draw',
      en: 'Draw on the board — trace the grey lines, then tap Done',
      zh: '在画板上画一只羊——照着淡灰线描，画完点右下角「画好了」',
    };
  }
  if (!f.page1) {
    return {
      code: 'next-night',
      en: 'Hear the counting at the box, then step into the glowing stone door',
      zh: '去羊箱边听数数，然后走进亮起的石门',
    };
  }
  if (endingReady(f)) return endingNext(f.endingStep, f.world);
  const p = PLANETS[ch];
  if (!p) {
    return {
      code: 'next-finale',
      en: 'The book is written — wander, hang your drawings in the eternal hall',
      zh: '书已写完——慢慢逛，去永恒展厅挂上你的画',
    };
  }
  // 诚实指引(2026-09-27):下一站没建成就不许指路 —— 空岛有去无回,
  // 说"在路上"并给可做的事(回主世界/重返 325),建成后翻 PLANETS built 位即自动跟随
  if (!p.built) {
    return {
      code: 'next-await',
      en:
        'The ' +
        p.num +
        ' star is still on its way. Wander the gallery or revisit 325; the gate will tell you when a new chapter opens.',
      zh:
        p.num +
        ' ' +
        p.name +
        '还在路上——先回主世界逛逛，或重返 325，石门亮起就是新篇章',
    };
  }
  return {
    code: 'next-planet' + ch,
    en: 'Next: ' + p.num + ' ' + p.en + ' — tap the button below, pick up the stardust',
    zh: '下一步：去 ' + p.num + ' ' + p.name + '——点屏幕下方按钮进星球，拾起星屑',
  };
}

/**
 * 罗盘页(spiritsState)装饰:前 PLANETS.length 项覆盖 name/en,并给已点亮章节
 * 的 place 追加「 · 已点亮」。原数组不动(返回新对象)。
 * @param {Array<{name:string,en:string,place:string}>} arr prevSpiritsState() 结果
 * @param {Array<{name:string,en:string,place:string}>} planets PLANETS(与 SPIRITS 同序)
 * @param {number} chapter 当前章节
 */
export function decorateSpiritsState(arr, planets, chapter) {
  return (arr || []).map(function (st, i) {
    if (i >= planets.length) return st;
    return Object.assign({}, st, {
      name: planets[i].name,
      en: planets[i].en,
      place: chapter > i ? planets[i].place + ' · 已点亮' : planets[i].place,
    });
  });
}
