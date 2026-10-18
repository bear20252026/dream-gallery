// dom-typed-sites.test.js — 「DOM 取用收成带类型助手」这一批的闸门(2026-10-16 checkJs 第七刀)
//
// 这一刀把 51 条 TS2339(`value` on HTMLElement / `style`·`onclick`·`dataset` on Element /
// `getContext` on HTMLElement)从"每个读数点各报一条"收成"每个标签在 src/shared/dom-typed.js 里
// cast 一次"。风险很具体:**类型是我声称的**。如果 `#qzTa` 其实不是 `<textarea>`,那么
// `qsArea(box,'#qzTa')` 就是一条写在类型上的谎,而且编译器不会报 —— 它比原来的 12 条错更糟,
// 因为原来说"字段不存在"至少提醒人去查。所以本文件的第 2 条不是"测函数",是**拿 markup 反查每个调用点**。
//
// 四条判据各自的来源:
//  1. 助手本体的写法(只 cast、不校验、不改对象)—— 边界写在 dom-typed.js 文件头,这里做成机器闸。
//  2. 每个调用点的"选择器 ↔ 标签"由**仓内 markup** 裁决:markup 从 src/** 的模板字符串与根级 *.html 里
//     扫 `<tag … id="x" …>` / `class="… x …"` 建表;查不到就**抛错**,不静默通过(口径见
//     types-param-bag-shapes.test.js 与第五刀那条"锚点没命中 ≠ 没违反")。
//  3. 运行期与裸 querySelector / getElementById **逐字等价**:同一个对象(===)、同一个选择器字符串、
//     同样的成员顺序(qsa* 唯一真实的差别是 NodeList → Array)。
//  4. 全仓残留的**内联 DOM cast** 是一笔记了名的债:表外新增一条就红,少一条也红。
//
// ⚠️读源码一律走 read():本机检出是 CRLF,`\r` 会卡在 `$` 前面把 not.toMatch 变成空断言。
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const MOD = 'src/shared/dom-typed.js';

// 助手 → 它**声称**的标签。`null` = 只声称"是个元素"(HTMLElement),不需要标签比对。
const CLAIM = {
  byIdEl: null,
  byIdInput: 'input',
  byIdCanvas: 'canvas',
  byIdSelect: 'select',
  byIdBtn: 'button',
  qsEl: null,
  qsInput: 'input',
  qsArea: 'textarea',
  qsSelect: 'select',
  qsBtn: 'button',
  qsaEl: null,
  qsaBtn: 'button',
};

const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
    const rel = `${d}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== '__tests__') walk(rel);
    } else if (/\.(js|mjs|cjs)$/.test(e.name)) files.push(rel);
  }
};
walk('src');

const htmlFiles = fs
  .readdirSync(ROOT)
  .filter((f) => f.endsWith('.html'))
  .map((f) => f);

// ===================== 1. markup 表:id / class → 标签集合 =====================

/**
 * 从 markup(id 与 class 可能来自 *.html,也可能来自 JS 里的模板字符串)建两张表。
 * 只认真实标签开括号,属性串里的 `>` 不做解析(本仓 markup 没有这种写法,第 2 条测试查不到会抛错,
 * 而不是猜)。
 */
function buildMarkupTables() {
  const byId = new Map();
  const byClass = new Map();
  const sources = [...htmlFiles, ...files];
  for (const rel of sources) {
    const text = read(rel);
    for (const m of text.matchAll(/<([a-zA-Z][\w-]*)\b([^>]*)>/g)) {
      const tag = m[1].toLowerCase();
      const attrs = m[2];
      const idm = attrs.match(/\bid=["']([^"'${}]+)["']/);
      if (idm) {
        if (!byId.has(idm[1])) byId.set(idm[1], new Set());
        byId.get(idm[1]).add(tag);
      }
      const clm = attrs.match(/\bclass=["']([^"']+)["']/);
      if (clm) {
        for (const c of clm[1].trim().split(/\s+/)) {
          if (!c || c.includes('${')) continue;
          if (!byClass.has(c)) byClass.set(c, new Set());
          byClass.get(c).add(tag);
        }
      }
    }
  }
  return { byId, byClass };
}

/**
 * 取一个复合选择器的**最后一段**并拆成 {kind, name}:`.qz-track button` → 标签 button;
 * `.qz-opt[data-q="${q}"]` → 类 qz-opt(插值部分整条丢掉,断言只按静态键比对)。
 */
function lastSegment(sel) {
  const clean = sel.split('${')[0];
  const parts = clean.split(/[>\s]+/).filter(Boolean);
  const seg = parts[parts.length - 1] || '';
  const cls = seg.match(/\.([\w-]+)/);
  if (cls) return { kind: 'class', name: cls[1] };
  const id = seg.match(/#([\w-]+)/);
  if (id) return { kind: 'id', name: id[1] };
  const tag = seg.match(/^([a-zA-Z][\w-]*)/);
  if (tag) return { kind: 'tag', name: tag[1].toLowerCase() };
  throw new Error(`选择器认不出键: ${sel}`);
}

/**
 * 从调用括号里取出选择器实参。模板字符串会带 `${…}` 插值,所以**不能**用"配对引号里的内容"当字面量
 * —— `.qz-opt[data-q="${q}"]` 会被拆成 `${q}` 这种没有键的碎片。这里按顶层逗号切最后一段,
 * 再剥引号与插值,留下静态骨架给 lastSegment 认键。
 */
function selOf(buf, byIdForm) {
  let s = buf;
  if (!byIdForm) {
    let depth = 0,
      cut = -1;
    for (let i = 0; i < buf.length; i++) {
      const ch = buf[i];
      if ('([{'.includes(ch)) depth++;
      else if (')]'.includes(ch) || ch === '}') depth--;
      else if (ch === ',' && depth === 0) cut = i;
    }
    if (cut < 0) throw new Error(`调用参数里没有逗号(不是 root+sel 写法): ${buf.slice(0, 40)}`);
    s = buf.slice(cut + 1);
  }
  s = s.replace(/\$\{[^}]*\}/g, '').trim();
  s = s.replace(/^(['"`])/, '').replace(/(['"`])$/, '');
  if (!s) throw new Error(`选择器空了: ${buf.slice(0, 40)}`);
  return s;
}

/** 扫全仓对 dom-typed 的调用点(第一参数是 root 的调用取第二个实参当选择器)。 */
function callSites() {
  const re = new RegExp(`\\b(${Object.keys(CLAIM).join('|')})\\(`, 'g');
  const out = [];
  for (const rel of [...files]) {
    if (rel === MOD) continue;
    const text = read(rel);
    if (!text.includes('dom-typed.js')) continue; // 没 import 助手的文件里同名函数不算调用点
    for (const m of text.matchAll(re)) {
      const helper = m[1];
      const byIdForm = helper.startsWith('byId');
      // 从 ( 起扫到配对 ),先剥掉模板插值与注释,再取最后一个字符串字面量当选择器
      let i = m.index + helper.length + 1;
      let depth = 1;
      let buf = '';
      while (i < text.length && depth > 0) {
        const ch = text[i];
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        else if (ch === ')' || ch === ']' || ch === '}') {
          depth--;
          if (depth === 0) break;
        }
        buf += ch;
        i++;
      }
      out.push({ rel, helper, sel: selOf(buf, byIdForm) });
    }
  }
  return out;
}

afterEach(() => {
  delete globalThis.document;
});

describe('dom-typed 助手本体与调用点', () => {
  it('助手本体:每个函数一次 cast、零 instanceof、只走那三个原生取用', () => {
    const src = read(MOD);
    const names = [...src.matchAll(/export function (\w+)\(/g)].map((m) => m[1]);
    expect(names.sort()).toEqual(Object.keys(CLAIM).sort());
    for (const n of names) {
      const body = src.slice(src.indexOf(`export function ${n}(`));
      const one = body.slice(0, body.indexOf('\n}') + 2);
      const casts = (one.match(/@type \{/g) || []).length;
      expect(casts, `${n} 应该只有 cast 一次`).toBe(1);
      expect(one, `${n} 不许顺手加固`).not.toContain('instanceof');
      expect(one, `${n} 取值方式被改了`).toMatch(
        /(document\.getElementById\(|root\.querySelector\(|root\.querySelectorAll\()/
      );
      // qsa* 必须显式 Array.from(唯一真实的差别:NodeList → 数组),别的助手不许偷偷包一层
      if (n.startsWith('qsa')) expect(one, `${n} 应当用 Array.from`).toContain('Array.from(');
      else expect(one, `${n} 不该多包一层`).not.toContain('Array.from(');
    }
  });

  it('每个调用点的「助手声称的标签 ≡ markup 里的真实标签」(查不到即失败)', () => {
    const { byId, byClass } = buildMarkupTables();
    const sites = callSites();
    expect(sites.length, '一个调用点都没扫到 = 这条闸在空转').toBeGreaterThan(20);
    const bad = [];
    for (const s of sites) {
      const claim = CLAIM[s.helper];
      // byId* 的参数是**裸 id**,不是选择器(`getElementById('mc')`),不能交给 lastSegment ——
      // 否则 'mc' 会被认成"标签名 mc",第一版就是这么全红的。
      const seg = s.helper.startsWith('byId')
        ? { kind: 'id', name: s.sel.replace(/^#/, '') }
        : lastSegment(s.sel);
      let found;
      if (seg.kind === 'id') found = byId.get(seg.name);
      else if (seg.kind === 'class') found = byClass.get(seg.name);
      else found = new Set([seg.name]); // 选择器直接写标签名(`.qz-track button`)
      if (!found || found.size === 0) {
        bad.push(`${s.rel} ${s.helper}(${s.sel}) ⇒ markup 里找不到 #/${seg.kind}=${seg.name}`);
        continue;
      }
      if (claim && !found.has(claim)) {
        bad.push(
          `${s.rel} ${s.helper}(${s.sel}) ⇒ 声称 <${claim}>,markup 里是 ${[...found].join('/')}`
        );
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  }, 120000);

  it('助手不改变对象、不改选择器字符串(qsa* 唯一真实差别是数组)', () => {
    const node = { kind: 'the-same-node' };
    const other = { kind: 'second' };
    const seen = [];
    globalThis.document = {
      getElementById: (id) => {
        seen.push(['byId', id]);
        return node;
      },
    };
    const root = {
      querySelector: (sel) => {
        seen.push(['q', sel]);
        return node;
      },
      querySelectorAll: (sel) => {
        seen.push(['qa', sel]);
        return [node, other];
      },
    };
    // 动态 import 之前 dom 还没被用到,所以直接取已加载的模块即可(模块内是惰性取 document)
    return import('../shared/dom-typed.js').then((D) => {
      // id 故意写成大小写混合的 `McX`:任何"顺手 toLowerCase / trim"的实现都会在这里露出来
      expect(D.byIdEl('McX')).toBe(node);
      expect(D.byIdInput('McX')).toBe(node);
      expect(D.byIdCanvas('McX')).toBe(node);
      expect(D.qsEl(root, '#a')).toBe(node);
      expect(D.qsBtn(root, '#a')).toBe(node);
      expect(D.qsArea(root, '#a')).toBe(node);
      expect(D.qsSelect(root, '#a')).toBe(node);
      expect(D.qsaEl(root, '.b')).toEqual([node, other]);
      expect(D.qsaBtn(root, '.b')).toEqual([node, other]);
      expect(Array.isArray(D.qsaEl(root, '.b'))).toBe(true);
      expect(seen).toEqual([
        ['byId', 'McX'],
        ['byId', 'McX'],
        ['byId', 'McX'],
        ['q', '#a'],
        ['q', '#a'],
        ['q', '#a'],
        ['q', '#a'],
        ['qa', '.b'],
        ['qa', '.b'],
        ['qa', '.b'],
      ]);
    });
  });

  it('本批改过的文件里零内联 cast(走了助手就不该再留 per-point 类型断言)', () => {
    const converted = [
      'src/gate/quizgate.js',
      'src/scene/minimap.js',
      'src/kunlun/ark-freeflight-hud.js',
      'src/scene/desert/atmosphere.js',
      'src/gate/settings.js',
      'src/gate/settings/sky-progress.js',
      'src/gate/settings/chat-room.js',
      // 第八刀接上的四个(第五个 dialog-voice.mjs 走的是 VoiceButton typedef,另有一条测试管它)
      'src/gate/settings/spirit-page.js',
      'src/gate/settings/upload-import.js',
      'src/kunlun/finale.js',
      'src/gate/housecolor.js',
    ];
    for (const rel of converted) {
      const t = read(rel);
      expect(t.includes('@type {HTML'), `${rel} 还留着内联 DOM cast`).toBe(false);
      expect(t, `${rel} 没 import 助手`).toContain('dom-typed.js');
    }
  });

  it('静音钮那个"句柄挂在元素上"的说法只说一次(VoiceButton typedef ≡ 实际用量)', () => {
    // dialog-voice.mjs 不走 dom-typed:它要的不是标签,而是"这只按钮上有一个私有键"这件事。
    // 这一条管的是别让它漂回四个读数点各猜一次的形状(那条 `_langHandler` 在 Element 上的错
    // 就是这么来的),也管住别人在别的文件里裸写 `el._langHandler`。
    const src = read('src/core/dialog-voice.mjs');
    expect(src).toMatch(/@typedef \{HTMLButtonElement & \{ _langHandler\?/);
    expect((src.match(/@type \{VoiceButton/g) || []).length, '两处取用点各一次 cast').toBe(2);
    const users = files.filter((rel) => read(rel).includes('_langHandler'));
    expect(users, '这个私有键只许住在一个文件里').toEqual(['src/core/dialog-voice.mjs']);
  });

  it('全仓内联 DOM cast 是一笔记了名的债(新增一条就红,少一条也红)', () => {
    const ledger = {};
    for (const rel of files) {
      if (rel === MOD) continue;
      const n = (read(rel).match(/@type \{HTML/g) || []).length;
      if (n) ledger[rel] = n;
    }
    // 这些是前几刀(第四刀 upload.js、包 C 的 gameshell-system 等)留下的既有写法,不在本刀范围内。
    // 想收它们就照本刀的口径搬到助手,并在这里把对应条目**删掉** —— 不是往表里加。
    expect(ledger).toEqual({
      'src/core/gameshell-system.js': 6,
      'src/core/scene-manager.js': 1,
      'src/gate/consent-session.js': 2,
      'src/gate/upload.js': 3,
      'src/kunlun/ending-epilogue.js': 1,
      'src/ui/agreement-music.js': 1,
      'src/ui/chapter-map.js': 1,
      'src/ui/portfolio.js': 1,
    });
  });

  it('本文件那张 CLAIM 表 ≡ 助手自己声明的返回类型(表与源码漂了就红)', () => {
    const src = read(MOD);
    const TAGTYPE = {
      input: 'HTMLInputElement',
      canvas: 'HTMLCanvasElement',
      button: 'HTMLButtonElement',
      textarea: 'HTMLTextAreaElement',
      select: 'HTMLSelectElement',
    };
    for (const [n, claim] of Object.entries(CLAIM)) {
      const at = src.indexOf(`export function ${n}(`);
      if (at < 0) throw new Error(`锚点没命中: ${n} 在 dom-typed.js 里不存在`);
      // @returns 写在**函数之前**的 JSDoc 里,所以从 at 往前取;往后切会读到下一个函数的类型(第一版就是这么错的)
      const ret = src.slice(0, at).match(/@returns\s*\{([^}]+)\}[^@]*$/);
      if (!ret) throw new Error(`${n} 没有 @returns`);
      const want = claim === null ? 'HTMLElement' : TAGTYPE[claim];
      if (!want) throw new Error(`CLAIM 里 ${n} 的标签 ${claim} 不在标签表里`);
      const expectRet = n.startsWith('qsa') ? `${want}[]` : `${want}|null`;
      expect(ret[1].replace(/\s/g, ''), `${n} 的 @returns 与 CLAIM 不符`).toBe(expectRet);
    }
  });
});
