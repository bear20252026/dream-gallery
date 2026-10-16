// plane-and-save-shapes.test.js — 第十刀·批次1 的闸门(2026-16 落地,日期见 AGENTS)
//
// 这一批切的是第十刀·批次0 撑开检查图之后剩下的第一族:**纯函数核的入参包写的是裸 `object`**。
// `src/scene/plane-physics.mjs` 22 条 + `src/shared/chapter-map-logic.mjs` 7 条,机制同一条:
// 编译器看见 `@param {object} s`,于是 `s.pos.x`、`store.mark(k)` 全是"往 object 上要属性"(TS2339),
// 写错一个键名不会有任何人拦。旧图里没有这两个文件,所以它们连"报错的资格"都没有 —— 批次0 之后才看得见。
//
// 补法沿用第六刀那条:**状态包/输入包不许裸 object,按实际用到的面写全**。
// 但"写全"这一步本身可以写假(形状抄错、键名抄漏、可选性猜反),所以这里的钉子不测类型,
// 测**声明与写入方是不是同一份事实**:
//  · PlaneState 八键 ≡ plane-flight.js 的 freshState() 字面键 ≡ stepPlane 返回的 `o` 字面键;
//  · PlaneInput 的可选性逐个对应实现里的兜底(`|| 0` / `&& …` / `? … : 0`),不多不少;
//  · crashed **不许**出现在 PlaneState 里(它是 plane-flight.js 的模块级旗,只在调用点并进去);
//  · SaveReader/SaveWriter ≡ 本文件真调用的那九个,且九个都真实存在于唯一写入方 storeApi;
//  · Buffer 的声明面 = 调用面(只有 from/toString),且检查图的 types 里始终没有 "node"。
//
// 口径照旧:锚点没命中一律抛错,不许当成"没有问题";正则只在一行内活动(第九刀批次1 记过:跨行惰性
// 量词把一次 vitest 拖到 46 秒后被超时杀掉)。对象字面量用花括号计数器切,不用 `[^}]+` 那种一遇嵌套就漏。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const PHYS = 'src/scene/plane-physics.mjs';
const FLIGHT = 'src/scene/plane-flight.js';
const SAVE = 'src/shared/chapter-map-logic.mjs';
const API = 'src/state/store-api.js';
const MOUNT = 'src/state/store.js';
const NODEG = 'types/node-fallback-globals.d.ts';

const sorted = (a) => [...a].sort();

/** 锚点必须命中;命不中抛错(判据不许空转)。传路径。 */
function must(rel, re, label) {
  return mustText(read(rel), re, `${label} —— ${rel}`);
}
/** 同上,但传的是已经读进来的文本。 */
function mustText(text, re, label) {
  const m = text.match(re);
  if (!m) throw new Error(`锚点没命中:${label}`);
  return m;
}

/** 从 braceIdx 的 `{` 扫到配对 `}`(跳过字符串与 // 注释),返回含花括号的原文。 */
function literalBlock(src, braceIdx, where) {
  if (src[braceIdx] !== '{') throw new Error(`锚点没命中:${where}(那个位置不是 {)`);
  let depth = 0;
  for (let i = braceIdx; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') i++;
        i++;
      }
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    // 块注释里的花括号不算数(storeApi 的对象字面量里就挂着好几段 JSDoc,里面有 `{string[]}`)
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) throw new Error(`块注释没闭合:${where}`);
      i = end + 1;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return src.slice(braceIdx, i + 1);
    }
  }
  throw new Error(`花括号没配对:${where}`);
}

/**
 * 取对象字面量 / 内联对象类型里的**浅层成员**。返回 [{name, optional}]。
 * 认不出的片段直接抛 —— 否则"漏了一个键"会悄悄变成"少一条断言"。
 *
 * 三种写法都要认:`key: type`(对象字面量与 JSDoc 内联类型)、`key(args){…}`(方法简写,
 * storeApi 与 .d.ts 的 interface 都是这种)、以及 `Object<string, *>`(尖括号里也有逗号,
 * 所以 angle=true 时把 `<`/`>` 也计入深度 —— 只在**类型文本**里开这个模式,源码里 `<` 是比较运算符)。
 * @param {string} block
 * @param {string} where 出错时报是哪一块
 * @param {{angle?:boolean}} [opt]
 */
function shallowEntries(block, where, opt) {
  const angle = !!(opt && opt.angle);
  const body = block.slice(1, -1);
  const parts = [];
  let depth = 0;
  let cur = '';
  let inStr = null;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      cur += c;
      if (c === '\\') {
        cur += body[++i];
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      inStr = c;
      cur += c;
      continue;
    }
    if (c === '/' && body[i + 1] === '/') {
      while (i < body.length && body[i] !== '\n') i++;
      cur += '\n';
      continue;
    }
    if (c === '/' && body[i + 1] === '*') {
      const end = body.indexOf('*/', i + 2);
      if (end < 0) throw new Error(`块注释没闭合:${where}`);
      i = end + 1;
      continue;
    }
    if (c === '{' || c === '(' || c === '[' || (angle && c === '<')) depth++;
    // `=>` 里的 `>` 不是尖括号闭合(不挡掉它,`(x:number)=>boolean, 下一个键` 会被并成一片)
    if (angle && c === '=' && body[i + 1] === '>') {
      cur += '=>';
      i++;
      continue;
    }
    if (c === '}' || c === ')' || c === ']' || (angle && c === '>')) depth--;
    // 分隔符:对象字面量与 JSDoc 内联类型用 `,`,而 interface 的成员之间是 `;`。
    // 只认逗号的那一版实测把 `.d.ts` 里注入的第 3 个成员整片吞掉(判据空转),所以两个都认。
    if ((c === ',' || c === ';') && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) parts.push(cur);
  const out = [];
  for (const raw of parts) {
    const p = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
      .trim();
    if (!p) continue;
    const m = p.match(/^([A-Za-z_$][\w$]*)\??\s*(:|\(|$)/);
    if (!m) throw new Error(`片段认不出:${where} ⇒ ${JSON.stringify(p.slice(0, 60))}`);
    out.push({ name: m[1], optional: p.slice(m[1].length, m[1].length + 3).indexOf('?') >= 0 });
  }
  return out;
}

const memberNames = (list) => sorted(list.map((e) => e.name));

/** 某个 @typedef 的内联对象体(必须是一行写法;类型文本里尖括号也计深度)。 */
function typedefEntries(rel, tname) {
  const m = must(rel, new RegExp(`@typedef \\{\\{([^\\n]*)\\}\\} ${tname}(?![\\w$])`), tname);
  return shallowEntries(`{${m[1]}}`, tname, { angle: true });
}

/** 找到 `name` 的定义处,返回它前面那段 JSDoc 原文。 */
function jsdocOf(rel, declRe, label) {
  const src = read(rel);
  const m = src.match(declRe);
  if (!m) throw new Error(`锚点没命中:${label}`);
  const start = src.lastIndexOf('/**', m.index);
  if (start < 0) throw new Error(`锚点没命中:${label} 的 JSDoc 块`);
  return src.slice(start, m.index);
}

/** 取 .d.ts 里某个 interface 的浅层成员(精确匹配 `interface NAME {`)。 */
function ifaceMembers(d, name) {
  const at = d.indexOf(`interface ${name} {`);
  if (at < 0) throw new Error(`锚点没命中:interface ${name}`);
  return shallowEntries(literalBlock(d, d.indexOf('{', at), name), name);
}

/** 产品 src 下所有 .js/.mjs(__tests__ 除外:Buffer 那条要数产品侧真实调用面)。 */ function srcFiles(
  dir = 'src',
  acc = []
) {
  for (const name of fs.readdirSync(path.join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    const st = fs.statSync(path.join(ROOT, rel));
    if (st.isDirectory()) {
      if (rel === 'src/__tests__' || rel === 'src/vendor') continue;
      srcFiles(rel, acc);
    } else if (/\.(js|mjs)$/.test(name)) acc.push(rel);
  }
  return acc;
}

describe('批次1-1 PlaneState:声明 ≡ freshState() ≡ stepPlane 的返回字面量', () => {
  const EXPECT = ['onGround', 'pitch', 'pos', 'roll', 'speed', 'throttle', 'vspeed', 'yaw'];

  it('八个键一字不差,且八个都是必填(实现里无守卫直读)', () => {
    const e = typedefEntries(PHYS, 'PlaneState');
    expect(memberNames(e)).toEqual(EXPECT);
    const optional = e.filter((x) => x.optional).map((x) => x.name);
    expect(optional).toEqual([]);
  });

  it('写入方 plane-flight.js 的 freshState() 造的就是这八个键', () => {
    const src = read(FLIGHT);
    const i = src.indexOf('function freshState()');
    if (i < 0) throw new Error('锚点没命中:freshState() 的定义');
    const b = src.indexOf('{', src.indexOf('return', i));
    expect(
      memberNames(shallowEntries(literalBlock(src, b, 'freshState 的返回'), 'freshState'))
    ).toEqual(EXPECT);
  });

  it('stepPlane 的演化结果 o 也是这八个键(不多不少)', () => {
    const src = read(PHYS);
    const b = src.indexOf('{', src.indexOf('const o ='));
    expect(memberNames(shallowEntries(literalBlock(src, b, 'stepPlane 的 o'), 'o'))).toEqual(
      EXPECT
    );
  });

  it('@returns 指回两个 typedef,没有再抄一遍形状', () => {
    must(PHYS, /@returns \{\{state:PlaneState, flags:PlaneFlags\}\}/, 'stepPlane 的 @returns');
  });

  it('两个形参都接回了 typedef(裸 object 在本文件已归零)', () => {
    expect(read(PHYS)).not.toMatch(/@param \{object\}/);
    must(PHYS, /@param \{PlaneState\} s/, 'stepPlane 的 s');
    must(PHYS, /@param \{PlaneInput\} inp/, 'stepPlane 的 inp');
  });
});

describe('批次1-2 PlaneInput:六个键 ≡ readInput(),可选性 ≡ 实现里的兜底', () => {
  const GUARD = {
    pitchIn: /clampN\(inp\.pitchIn \|\| 0\)/,
    rollIn: /clampN\(inp\.rollIn \|\| 0\)/,
    yawIn: /clampN\(inp\.yawIn \|\| 0\)/,
    throttleIn: /\(inp\.throttleIn \|\| 0\)/,
    brakeHold: /inp\.brakeHold &&/,
    groundHeightAt: /inp\.groundHeightAt \?/,
  };
  const EXPECT = memberNames(Object.keys(GUARD).map((name) => ({ name })));

  it('六个键一字不差,且每个都有兜底 ⇒ 六个全可选', () => {
    const e = typedefEntries(PHYS, 'PlaneInput');
    expect(memberNames(e)).toEqual(EXPECT);
    for (const one of e) {
      if (!Object.prototype.hasOwnProperty.call(GUARD, one.name))
        throw new Error(`PlaneInput 多了没登记兜底判据的键:${one.name}`);
      if (!one.optional) throw new Error(`${one.name} 声明成必填,但实现里有兜底`);
      must(PHYS, GUARD[one.name], `${one.name} 的兜底`);
    }
  });

  it('写入方 readInput() 返回的就是这六个键', () => {
    const src = read(FLIGHT);
    const i = src.indexOf('function readInput()');
    if (i < 0) throw new Error('锚点没命中:readInput() 的定义');
    const b = src.indexOf('{', src.indexOf('return', i));
    expect(
      memberNames(shallowEntries(literalBlock(src, b, 'readInput 的返回'), 'readInput'))
    ).toEqual(EXPECT);
  });

  it('groundHeightAt 的签名与写入方一致:收 (x, z) 两个数、返回高度', () => {
    const m = must(PHYS, /groundHeightAt\?:\(([^)]*)\)=>number/, 'groundHeightAt 的函数形状');
    expect(m[1].replace(/\s/g, '')).toBe('x:number,z:number');
    must(FLIGHT, /const groundH = \(x, z\) =>/, 'groundH 的两个形参');
    must(FLIGHT, /groundHeightAt: groundH,/, 'readInput 里对 groundH 的接线');
  });
});

describe('批次1-3 PlaneFlags:五个事件 ≡ flags 字面量,产品侧读的两枚都在里面', () => {
  const EXPECT = ['boundaryHit', 'crash', 'liftoff', 'stall', 'touchdown'];

  it('声明的五个键 ≡ stepPlane 里 flags 的字面量键', () => {
    const src = read(PHYS);
    const b = src.indexOf('{', src.indexOf('const flags ='));
    expect(memberNames(shallowEntries(literalBlock(src, b, 'flags'), 'flags'))).toEqual(EXPECT);
    expect(memberNames(typedefEntries(PHYS, 'PlaneFlags'))).toEqual(EXPECT);
  });

  it('产品侧只读 liftoff 与 crash,两枚都已声明', () => {
    const consumed = sorted([...read(FLIGHT).matchAll(/r\.flags\.([A-Za-z_$][\w$]*)/g)]).map(
      (m) => m[1]
    );
    expect(consumed).toEqual(['crash', 'liftoff']);
    for (const k of consumed) if (!EXPECT.includes(k)) throw new Error(`读了没声明的旗:${k}`);
  });
});

describe('批次1-4 crashed 不归物理核:它在 PlanePhaseInput,不许混进 PlaneState', () => {
  it('PlaneState 八键里没有 crashed', () => {
    expect(memberNames(typedefEntries(PHYS, 'PlaneState'))).not.toContain('crashed');
  });

  it('PlanePhaseInput = PlaneState & { crashed?:boolean } 一字不差', () => {
    must(PHYS, /@typedef \{PlaneState & \{ crashed\?:boolean \}\} PlanePhaseInput/, '交集声明');
    must(PHYS, /@param \{PlanePhaseInput\} s/, 'planePhase 的入参声明');
  });

  it('stepPlane 从不把 crashed 写进状态(它只写 flags.crash)', () => {
    const src = read(PHYS);
    if (/o\.crashed/.test(src)) throw new Error('出现了 o.crashed ⇒ crashed 已经变成状态字段');
    must(PHYS, /flags\.crash = true/, 'crash 事件的写法');
  });

  it('crashed 的真实出处:plane-flight.js 的模块级旗 + 调用点现场并进去', () => {
    must(FLIGHT, /^ {2}let crashed = false;$/m, '模块级 crashed');
    must(FLIGHT, /planePhase\(\{ \.\.\.state, crashed \}\)/, '调用点的并进写法');
  });
});

describe('批次1-5 SaveReader / SaveWriter:声明的九个键 ≡ 本文件真调用的,且都在 storeApi 上', () => {
  const READER = ['flag', 'json', 'num', 'str'];
  const WRITER = ['mark', 'setJson', 'setNum', 'setStr', 'unmark'];
  const NINE = sorted([...READER, ...WRITER]);

  it('两个面各自的键集一字不差', () => {
    expect(memberNames(typedefEntries(SAVE, 'SaveReader'))).toEqual(READER);
    expect(memberNames(typedefEntries(SAVE, 'SaveWriter'))).toEqual(WRITER);
  });

  it('文件里 `store.X(` 调用到的方法 ≡ 这九个(声明既不缺一枚也不多一枚)', () => {
    // 用 Set 去重:同一个方法调多次算一个;注释里提到的 `ctx.store.json(…)` 也在 READER 里,不构成噪声。
    const called = [
      ...new Set([...read(SAVE).matchAll(/store\.([A-Za-z_$][\w$]*)\(/g)].map((m) => m[1])),
    ];
    expect(sorted(called)).toEqual(NINE);
  });

  it('九个方法都真实挂在唯一写入方 storeApi 上(指不回去就是假档案)', () => {
    const src = read(API);
    const i = src.indexOf('export const storeApi = {');
    if (i < 0) throw new Error('锚点没命中:export const storeApi = {');
    const onApi = memberNames(
      shallowEntries(literalBlock(src, src.indexOf('{', i), 'storeApi'), 'storeApi')
    );
    const missing = NINE.filter((m) => !onApi.includes(m));
    expect(missing).toEqual([]);
    // 本模块用不到的方法不许混进声明(getSpirits/addSpirit/houseColor… 都不是存档码这条线的)
    for (const extra of ['getSpirits', 'addSpirit', 'houseColor', 'hasWriteFailure'])
      expect(NINE).not.toContain(extra);
  });

  it('挂载点仍是一处:ctx.ui.store = storeApi', () => {
    expect([...read(MOUNT).matchAll(/ctx\.ui\.store = storeApi/g)]).toHaveLength(1);
  });

  it('五个 setter 声明成返回 boolean,与"只认严格 === false"配套(DG-STATE-002)', () => {
    for (const name of WRITER)
      must(SAVE, new RegExp(`${name}:\\([^\\n]*\\)=>boolean`), `${name} 的返回类型`);
    must(SAVE, /if \(ok === false\) failed\.push\(k\);/, '严格 === false 的判定');
  });

  it('每个函数按自己真用到的面声明:读函数给 SaveReader,写函数给 SaveWriter', () => {
    const CASES = [
      ['collectSave', 'SaveReader'],
      ['encodeSave', 'SaveReader'],
      ['applySave', 'SaveWriter'],
      ['importSave', 'SaveReader & SaveWriter'],
      ['restoreSave', 'SaveWriter'],
    ];
    for (const [fn, want] of CASES) {
      const doc = jsdocOf(SAVE, new RegExp(`export function ${fn}\\(`), `${fn} 的定义`);
      const m = doc.match(/@param \{([^}]*)\} store/);
      if (!m) throw new Error(`锚点没命中:${fn} 的 @param store`);
      expect(`${fn} → ${m[1]}`).toBe(`${fn} → ${want}`);
    }
  });

  it('SaveBackup 的两个键 ≡ importSave 里快照字面量(唯一写入方)', () => {
    expect(memberNames(typedefEntries(SAVE, 'SaveBackup'))).toEqual(['at', 'data']);
    const src = read(SAVE);
    const b = src.indexOf('{', src.indexOf('const snap ='));
    expect(memberNames(shallowEntries(literalBlock(src, b, 'snap'), 'snap'))).toEqual([
      'at',
      'data',
    ]);
    // 读出方确实靠 data 决定撤不撤销按钮(声明里那个键不是摆设)
    must('src/ui/chapter-map.js', /rawBackup\.data && typeof rawBackup\.data === 'object'/, '守卫');
  });

  it('这两个文件里裸 {object} 归零(第六刀排他表的两处落点)', () => {
    for (const rel of [PHYS, SAVE]) expect(read(rel)).not.toMatch(/@param \{object\}/);
  });
});

describe('批次1-6 Buffer 兜底:声明面 = 调用面,且不借 @types/node 整副牌照', () => {
  it('产品 src 里 Buffer 只出现在存档码兜底那两处', () => {
    const hits = [];
    for (const rel of srcFiles()) {
      read(rel)
        .split('\n')
        .forEach((line, idx) => {
          if (/\bBuffer\./.test(line)) hits.push(`${rel}:${idx + 1}`);
        });
    }
    expect(hits).toHaveLength(2);
    expect(sorted(new Set(hits.map((h) => h.split(':')[0])))).toEqual([SAVE]);
    // 两处都必须住在 b64encode/b64decode 的兜底分支里(写在这儿才是那条分支)
    const src = read(SAVE);
    for (const fn of ['b64encode', 'b64decode']) {
      const at = src.indexOf(`function ${fn}(`);
      if (at < 0) throw new Error(`锚点没命中:${fn} 的定义`);
      const body = src.slice(at, src.indexOf('\n}', at));
      expect(`${fn}:${/\bBuffer\./.test(body)}`).toBe(`${fn}:true`);
      expect(body).toMatch(/if \(typeof (?:btoa|atob) === 'function'\) return/);
    }
  });

  it('两处都是 `Buffer.from(…, 编码).toString(编码)` 的形状', () => {
    expect([
      ...read(SAVE).matchAll(/Buffer\.from\([^()\n]*\)\.toString\('[a-z0-9]+'\)/g),
    ]).toHaveLength(2);
  });

  it('声明只给了 from 与 toString 两个面(不冒充完整 BufferConstructor)', () => {
    const d = read(NODEG);
    expect(memberNames(ifaceMembers(d, 'NodeFallbackBuffer'))).toEqual(['toString']);
    expect(memberNames(ifaceMembers(d, 'NodeFallbackBufferConstructor'))).toEqual(['from']);
    mustText(d, /from\(data: string, encoding\?: string\): NodeFallbackBuffer;/, 'from 的签名');
    mustText(d, /toString\(encoding\?: string\): string;/, 'toString 的签名');
  });

  it('它是全局脚本(没有 import/export),且被 include 罩住 —— 否则写了等于没写(第九刀批次6 的教训)', () => {
    const d = read(NODEG);
    expect(d).not.toMatch(/^\s*(?:import|export)\s/m);
    expect(must('tsconfig.checkjs.json', /"include": \[([^\]]*)\]/, 'include 数组')[1]).toMatch(
      /types\/\*\*\/\*\.d\.ts/
    );
  });

  it('检查图的 types 里始终没有 "node"(放开整套 node 全局会把误用洗成绿)', () => {
    const t = must('tsconfig.checkjs.json', /"types": \[([^\]]*)\]/, 'types 数组')[1];
    expect(t).not.toMatch(/\bnode\b/);
    expect(t).toMatch(/vite\/client/);
  });
});
