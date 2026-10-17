// gentle-panel-wiring.test.js — 温柔度面板"接线"这件事的闸门(2026-10-16)
//
// 这块面板从 2026-07-28 基线起就是死的:index.html 的四个按钮写裸全局名(startGentleTest() 等),
// 实现却只经 expose() 落了 `__` 前缀,而全仓没有任何一处给 #gtP 加过 `.show`(= 没有入口)。
// 死这么久没人发现,是因为**没有任何判据读过这条链**。所以本文件比的不是"代码好不好",
// 而是四件"少了任何一件就又变成死 UI"的事实,并且每一条都**由源码裁决**:
//   ① markup 里没有内联 onclick(漂回去 = 又变成点击必炸);
//   ② 声明 ≡ 写入方(菜单调的 open() 必须真的挂在服务上);
//   ③ 菜单四件套齐(markup / 双语文案 / handler / 可见性)—— 少一件就是"有按钮没接线"或"接了没人能按";
//   ④ 题库与判词只有一份出处(漂回两份 = 下次改题只改一边,而两边都不报错)。
// 解析一律"读不到就抛错",不静默通过(与 types-ctx-drift / dom-typed-sites 同一口径)。
// ⚠️读源码统一走 read():本机检出可能是 CRLF,`\r` 卡在 `$` 前面会把 not.toMatch 变成空断言。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
// 读一次缓存一份:这套判据要扫全仓(src 460 份 + 根级 html),
// 而 vitest 并发跑 100 个文件时抢不到 CPU —— 第六刀记过同一条(那条给了 60_000)。
// 这里两件事一起做:①读结果 memo 化,②下面的扫描一律先用便宜的 includes 粗筛,
// 只有命中的文件才付剥注释(codeOf)的正则代价。
const CACHE = new Map();
const read = (rel) => {
  if (!CACHE.has(rel))
    CACHE.set(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'));
  return CACHE.get(rel);
};
// 剥掉注释再读(与 types-param-bag-shapes.test.js:123 同一写法):判据管的是**代码**,
// 而 quiz.js 文件头那段历史说明必然要写出旧的裸全局名 —— 不剥注释就是"把散文数成读数"
// (第九刀 emit 那条、第十刀 @param {object} 那条的同族复发,这次轮到我自己的注释)。
const codeOf = (rel) => {
  const t = read(rel);
  return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
};

const QUIZ = 'src/gate/quiz.js';
const SHARED = 'src/shared/gentle-logic.mjs';
const SHELL = 'src/core/gameshell-system.js';
const INDEX = 'index.html';
const STORE = 'src/state/store-api.js';
const I18N = 'src/ui/i18n-dom.js';

const srcFiles = [];
(function walk(d) {
  for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
    const rel = `${d}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== '__tests__') walk(rel);
    } else if (/\.(js|mjs|cjs)$/.test(e.name)) srcFiles.push(rel);
  }
})('src');
const htmlFiles = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
const allFiles = [...htmlFiles, ...srcFiles];

/** 取 `<div id="gtP">` 整块(按 div 深度配对),免得用"到下一个 <script> 为止"这种脆锚点。 */
function gentlePanelBlock() {
  const text = read(INDEX);
  const start = text.indexOf('<div id="gtP">');
  if (start < 0) throw new Error('index.html 里找不到 <div id="gtP">(面板被改名或搬走了?)');
  const re = /<div\b|<\/div>/g;
  let depth = 0;
  let end = -1;
  for (const m of text.slice(start).matchAll(re)) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) {
      end = start + m.index + m[0].length;
      break;
    }
  }
  if (end < 0) throw new Error('#gtP 的 div 没有配对闭合(结构变了,判据得跟着改)');
  return text.slice(start, end);
}

describe('① markup 与旧契约:面板里不许再有内联 onclick', () => {
  it('#gtP 整块零内联事件属性', () => {
    const block = gentlePanelBlock();
    expect(block, '#gtP 里漂回了内联 onclick(那五个裸全局名会再次变成 undefined)') //
      .not.toMatch(/\son[a-z]+\s*=/);
    expect(block.length, '面板块小得不对劲').toBeGreaterThan(400);
  });

  it('模块要绑的三个按钮都有 id(gtStartBtn / gtNext / gtAgainBtn)', () => {
    const block = gentlePanelBlock();
    for (const id of ['gtStartBtn', 'gtNext', 'gtAgainBtn'])
      expect(block, `面板里没有 id="${id}"`).toContain(`id="${id}"`);
  });

  it('✕ 是 <button> 且有可达名(漂回裸 <div> ⇒ 键盘用户只剩 Esc,焦点环也不存在)', () => {
    const block = gentlePanelBlock();
    const at = block.indexOf('class="gtClose"');
    if (at < 0) throw new Error('面板里没有 .gtClose(它是 overlay 的 x 选择器,改名等于拆掉 ✕)');
    const tag = block.slice(block.lastIndexOf('<', at), block.indexOf('>', at) + 1);
    expect(tag, `.gtClose 不是 <button>: ${tag}`).toMatch(/^<button\b/);
    expect(tag).toMatch(/\stype="button"/); // 面板在 form 之外也要老实待着,别继承 submit 默认
    expect(tag).toMatch(/\sid="gtCloseBtn"/);
    expect(tag).toMatch(/\saria-label="[^"]+"/); // 焦点读得出名字,不是只剩一个乘号
    expect(codeOf(QUIZ), 'overlay 的 x 不再指向 .gtClose ⇒ ✕ 静默失灵') //
      .toMatch(/x:\s*'\.gtClose'/);
  });

  it('那五个裸全局名在全仓(含 HTML)一个字都不剩', () => {
    const names = [
      'startGentleTest',
      'selectGentleO',
      'nextGentleQ',
      'restartGentleTest',
      'closeGentleTest',
    ];
    const hits = [];
    for (const rel of allFiles) {
      const raw = read(rel); // 先用便宜的原文粗筛,命中才付剥注释的正则代价
      if (!names.some((n) => raw.includes(n))) continue;
      const code = codeOf(rel);
      for (const n of names) if (code.includes(n)) hits.push(`${rel}:${n}`);
    }
    expect(hits, '旧契约漂回来了:\n' + hits.join('\n')).toEqual([]);
  }, 60000);

  it('quiz.js 里不再有 selectGentleO 那种"把分值抄进 onclick 字符串"的写法', () => {
    const t = codeOf(QUIZ);
    expect(t).not.toMatch(/onclick=/);
    expect(t, '面板服务必须走 dom-typed 助手,不许写内联 cast').not.toMatch(/@type \{HTML/);
    expect(t).toContain('shared/dom-typed.js');
  });
});

describe('② ctx.ui.gentleTest:写入点唯一,声明 ≡ 写入方', () => {
  const writers = srcFiles.filter((rel) => codeOf(rel).includes('ctx.ui.gentleTest ='));

  it('全仓只有一处写入(第二处写入就是"两份实现"的开始)', () => {
    expect(writers.length, '写入点数量 = ' + writers.length).toBe(1);
    expect(writers[0]).toBe(QUIZ);
  });

  /** 取赋值给 ctx.ui.gentleTest 的那个对象字面量的**顶层**成员名 */
  function writtenMembers() {
    const t = codeOf(QUIZ);
    const at = t.indexOf('ctx.ui.gentleTest = {');
    if (at < 0) throw new Error('quiz.js 里没有 `ctx.ui.gentleTest = {`(服务没挂上?)');
    let depth = 0;
    let end = -1;
    for (let i = at + 'ctx.ui.gentleTest ='.length; i < t.length; i++) {
      if (t[i] === '{') depth++;
      else if (t[i] === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) throw new Error('ctx.ui.gentleTest 的字面量没有闭合');
    const body = t.slice(at, end);
    const names = [...body.matchAll(/^ {2}([A-Za-z0-9_]+)\(/gm)].map((m) => m[1]);
    if (!names.length) throw new Error('一个成员都没解析到 = 这条闸在空转');
    return names;
  }

  /** 取 types/ctx.d.ts 里 gentleTest 声明的成员名 */
  function declaredMembers() {
    const t = read('types/ctx.d.ts');
    const line = t.match(/^ {2}gentleTest:\s*\{([^}]*)\}/m);
    if (!line) throw new Error('ctx.d.ts 里没有 `gentleTest: {…}` 这一行');
    const names = [...line[1].matchAll(/([A-Za-z0-9_]+)\s*:/g)].map((m) => m[1]);
    if (!names.length) throw new Error('gentleTest 声明里一个成员都没解析到 = 空断言');
    return names;
  }

  it('声明的成员集合 ≡ 写入方的成员集合(两边都由源码裁决)', () => {
    expect(declaredMembers().sort()).toEqual(writtenMembers().sort());
    expect(writtenMembers().sort()).toEqual(['close', 'isOpen', 'open']);
  });

  it('ctx-ui.js 的 properties 数组里有 gentleTest(没有它 = 代理上根本没这个 getter)', () => {
    const t = read('src/ctx-ui.js');
    const at = t.indexOf('const properties = [');
    if (at < 0) throw new Error('ctx-ui.js 里找不到 properties 数组');
    const body = t.slice(at, t.indexOf(']', at));
    expect(body).toMatch(/['"]gentleTest['"]/);
  });

  it('菜单确实调了这个服务(不是只加了个按钮)', () => {
    expect(read(SHELL)).toMatch(/ctx\.ui\.gentleTest\?\.open\(\)/);
  });
});

describe('③ 存档键:登记了、不撞车、两条路写同一个键', () => {
  it('SCHEMA 里 gentleTest 已登记,类型 json', () => {
    const t = read(STORE);
    expect(t).toMatch(/^ {2}gentleTest:\s*\{\s*key:\s*'b612GentleTest',\s*type:\s*'json'\s*\},/m);
  });

  it('SCHEMA 的 localStorage 键名不许重复(撞键 = 两个功能互写对方的档)', () => {
    const t = read(STORE);
    const at = t.indexOf('const SCHEMA');
    if (at < 0) throw new Error('store-api.js 里找不到 SCHEMA');
    const body = t.slice(at, t.indexOf('\n};', at));
    const keys = [...body.matchAll(/key:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(keys.length, '一个键都没扫到 = 这条闸在空转').toBeGreaterThan(40);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
    expect(keys).toContain('b612GentleTest');
  });

  it('落库调用恰好两处(DOM 面板 + 3D 墙面),且都走 store.setJson 不直写 localStorage', () => {
    const t = read(QUIZ);
    expect((t.match(/ctx\.store\.setJson\('gentleTest'/g) || []).length).toBe(2);
    expect(t).not.toMatch(/localStorage/);
  });
});

describe('④ 题库与判词只有一份出处', () => {
  /** 全仓(排除 __tests__)统计某个字符串住在哪几个文件的**代码**里;先粗筛再剥注释 */
  const homesOf = (needle) =>
    allFiles.filter((rel) => read(rel).includes(needle) && codeOf(rel).includes(needle)).sort();

  it('题面只住在 shared/gentle-logic.mjs', () => {
    for (const q of ['看到小猫在阳光下打盹', '看到樱花缓缓飘落']) {
      expect(homesOf(q), `「${q}」出现了多处`).toEqual([SHARED]);
    }
  }, 60000);

  it('判词与分档字面量只住在 shared/gentle-logic.mjs', () => {
    expect(homesOf('你是温柔本身')).toEqual([SHARED]);
    expect(homesOf('你是个酷酷的人')).toEqual([SHARED]);
    const ifElse = srcFiles.filter(
      (rel) => read(rel).includes('pct') && /pct\s*>=\s*90/.test(codeOf(rel))
    );
    expect(ifElse, 'if/else 分档漂回来了(那正是两边各写一遍的成因)').toEqual([]);
  }, 60000);

  it('quiz.js 两条路都 import 了这份表', () => {
    const t = codeOf(QUIZ);
    expect(t).toContain('gentle-logic.mjs');
    for (const name of ['GENTLE_QUESTIONS', 'gentlePct', 'gentleTier', 'gentleRecord'])
      expect(t, `quiz.js 没用上 ${name}`).toContain(name);
  });

  it('墙面画布那一半取的仍是这份数据,而且没有把满分写死成 100', () => {
    const t = codeOf(QUIZ);
    expect(t).toMatch(/const qs = GENTLE_QUESTIONS/);
    expect(t).not.toMatch(/totalS\s*\/\s*100/);
  });
});

describe('⑤ 菜单入口:markup / 文案 / handler / 可见性四件齐', () => {
  const t = read(SHELL);

  it('按钮在菜单卡里,且有双语 label(zh 与 en 都在)', () => {
    expect(t).toMatch(/<button class="m-btn" data-act="gentle">/);
    const label = t.match(/gentle:\s*\{\s*zh:\s*'([^']+)',\s*en:\s*'([^']+)'\s*\}/);
    expect(label, '菜单文案缺双语(2026-10-03 规矩:界面文字一律双语)').toBeTruthy();
    expect(label[1]).toContain('温');
    expect(label[2]).toMatch(/[A-Za-z]/);
  });

  it('菜单 markup 的 data-act 集合 ≡ labels 的键集合(加一件忘另一件即红)', () => {
    const markup = new Set([...t.matchAll(/<button[^>]*data-act="([^"]+)"/g)].map((m) => m[1]));
    const at = t.indexOf('const labels = {');
    if (at < 0) throw new Error('gameshell-system.js 里找不到 labels 表');
    // 按花括号配对切这张表:用「找下一个 `\n  };`」当尾锚会**多吃**后面的 overlay 配置对象
    // (第一版就是这么把 display/escapable 数成菜单条目的 —— 尾锚必须来自结构,不是来自缩进猜)
    let depth = 0;
    let end = -1;
    for (let i = at + 'const labels ='.length; i < t.length; i++) {
      if (t[i] === '{') depth++;
      else if (t[i] === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) throw new Error('labels 表没有闭合');
    const body = t.slice(at, end);
    const keys = new Set([...body.matchAll(/^ {6}([a-z]+):/gm)].map((m) => m[1]));
    expect(keys.size, 'labels 一条都没解析到 = 空断言').toBeGreaterThan(8);
    expect([...keys].filter((k) => !markup.has(k))).toEqual([]);
    expect([...markup].filter((k) => !keys.has(k))).toEqual([]);
    expect(keys.has('gentle')).toBe(true);
  });

  it('条目按「服务在不在」显示,而不是无条件常亮', () => {
    expect(t).toMatch(/gentleBtn\.style\.display\s*=\s*ctx\.ui\.gentleTest\s*\?\s*''\s*:\s*'none'/);
  });

  it('✕ 的可达名登记在 i18n-dom.js(双语),不是只写在 markup 的死字串', () => {
    const dom = read(I18N);
    const at = dom.indexOf("$('#gtCloseBtn')");
    if (at < 0) throw new Error('i18n-dom.js 里没有 #gtCloseBtn ⇒ 换语言时读屏仍念旧语言');
    const entry = dom.slice(at, at + 200);
    expect(entry).toMatch(/'aria-label'/);
    const en = entry.match(/en:\s*'([^']+)'/);
    const zh = entry.match(/zh:\s*'([^']+)'/);
    expect(en, 'aria-label 缺英文').toBeTruthy();
    expect(zh, 'aria-label 缺中文').toBeTruthy();
  });
});

describe('⑥ 搁置令没有被顺手改掉(2026-10-03 主人令「旧玩法先放一边」)', () => {
  it('quiz 仍在 LEGACY_MODULE_IDS 里 ⇒ 默认不加载 ⇒ 默认模式也看不到这个入口', () => {
    const t = read('src/shared/legacy.mjs');
    const at = t.indexOf('LEGACY_MODULE_IDS = new Set([');
    if (at < 0) throw new Error('legacy.mjs 里找不到 LEGACY_MODULE_IDS');
    const body = t.slice(at, t.indexOf('])', at));
    expect(body).toMatch(/'quiz'/);
    const ids = (body.match(/'[a-z0-9-]+',?/g) || []).length;
    expect(ids, 'LEGACY_MODULE_IDS 名单条数变了(接线不许顺手把别的旧玩法一起放出来)').toBe(12);
  });

  it('world-loader 里 quiz 这条槽位还在(接线不是靠新增加载路径,而是修好了原有那条)', () => {
    expect(read('src/core/world-loader.js')).toMatch(
      /\{\s*id:\s*'quiz',\s*label:\s*'温柔度',\s*load:\s*\(\)\s*=>\s*import\('\.\.\/gate\/quiz\.js'\)\s*\}/
    );
  });
});
