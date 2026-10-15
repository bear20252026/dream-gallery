// types-param-bag-shapes.test.js — 「状态包/输入包/选项包不许声明成裸 object」的闸门(2026-10-15 checkJs 第六刀)
//
// 为什么要钉:纯函数把整包状态声明成 `@param {object}`,TS 就只知道"它是个对象",
// 于是**函数体里每一个 `state.y` / `input.pitch` / `o.peak` 都是一条 TS2339**,而读错误的人
// 会以为"字段不存在 = 代码写错了",跑去改那行本来正确的代码 —— 这正是 M-08 那三条假声明的机理,
// 只不过这次的谎不是"形状写错",是"形状压根没写"(注释里那行 `{ y, vy, onGround }` 是散文,不是类型)。
// 本刀收掉 36 条(165 → 129),四个文件:
//   · src/scene/player-physics.js   14 条(VerticalState / VerticalInput / VerticalStep)
//   · src/scene/player.js            5 条(全在 `stepVertical` 的返回值上,治上面那条 @returns 就没了)
//   · src/kunlun/freeflight-physics.js 7 条(FlightState / FlightInput / FlightFlags)
//   · src/shared/audio-blip.js        9 条(chime 的选项包)
//   · src/hot.js                      1 条(bag.register 的 `{scene?:object, shared?:Set|Array}`)
//
// 核实时抓到的三条**注释与现实不符**(所以没有照抄旧注释,都按写入方裁决):
//   · freeflight 的 `autoNavTarget` 旧注释写 `Vector3|null`,而唯一生产写入方 ark.js:563 传的是
//     `DOCK`(字面量 `{x:804.2, y:401.8, z:593}`,不是 Vector3)。本模块只把它交给 `Vector3.copy()`,
//     而那个 API 收的正是 `{x,y,z}` 结构 ⇒ 照旧注释写会让生产调用点冒出一条假错。
//   · hot.js 的 `shared?:Set|Array` 少了 `WeakSet` 与**谓词**两种,而它转交的 disposeObject3D
//     自己写明白认四种(`src/__tests__/dispose-object3d.test.js:100` 就在用谓词形式)。
//   · `src/core/input.js` 原本叠了**两个** JSDoc 块(`@param {object}` 在上、`InputManager` 在下),
//     TS 只认紧邻声明的那一块 ⇒ 上面那条 `{object}` 从不产错,却会被任何"数 `{object}`"的统计
//     当成一笔债。本刀把它并成一块(删前后 checkJs 全集 `comm` 双向 0 条漂移,证明它确实是惰的)。
//
// 判据一律**两边都由源码或运行期裁决**:声明的键集合 ≡ 实现真正读到的键集合(Proxy 记名) ≡
// 写入方那行字面量的键集合。单向 `toContain` 挡不住"注释里多写一个字段"这种漂移。
// ⚠️所有读源码的正则都走 read():本机检出是 CRLF,`\r` 会卡在 `$` 前面把 not.toMatch 变成空断言
//   (口径见 types-ctx-writer-agreement.test.js 头部那条,2026-10-15 踩过)。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { stepVertical } from '../scene/player-physics.js';
import { stepFlight } from '../kunlun/freeflight-physics.js';
import { chime } from '../shared/audio-blip.js';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const PP = 'src/scene/player-physics.js';
const FP = 'src/kunlun/freeflight-physics.js';
const AB = 'src/shared/audio-blip.js';
const PLAYER = 'src/scene/player.js';
const ARK = 'src/kunlun/ark.js';
const HOT = 'src/hot.js';

// ===================== 源码小工具 =====================

/**
 * 从 `text[start]`(必须是 `{`)开始扫这一个对象字面量,返回顶层键(去掉 `?`)与结束下标。
 * 深度 >1 的内容(嵌套对象、函数体、三元)一律不算键;某段一旦见过顶层 `:` 就不再当键。
 * 锚点找不到时**抛错**,不静默返回空数组 —— "没测到"和"没违反"是两种结论(第五刀的教训)。
 */
function scanObject(text, start, at) {
  if (text[start] !== '{') throw new Error(`起点不是 { : ${at}`);
  const keys = [];
  let depth = 0;
  let seg = '';
  let hasColon = false;
  const pushKey = (s) => {
    // JSDoc 的续行带 `*`(`,\n *   rollRate:number`),不剥掉它键名就带着星号匹配不上
    const k = s
      .trim()
      .replace(/^\*+\s*/, '')
      .trim();
    if (/^[\w$]+\??$/.test(k)) keys.push(k.replace(/\?$/, ''));
  };
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{' || ch === '[' || ch === '(') {
      depth++;
      if (depth > 1) seg += ch;
      continue;
    }
    if (ch === '}' || ch === ']' || ch === ')') {
      depth--;
      if (depth === 0) {
        if (!hasColon) pushKey(seg);
        return { keys, end: i };
      }
      seg += ch;
      continue;
    }
    if (depth === 1 && ch === ',') {
      if (!hasColon) pushKey(seg);
      seg = '';
      hasColon = false;
      continue;
    }
    // 顶层 `:` 之前那段才是键名(简写属性没有冒号,交给上面的 `,` 分支收)
    if (depth === 1 && ch === ':' && !hasColon) {
      pushKey(seg);
      seg = '';
      hasColon = true;
      continue;
    }
    if (depth >= 1) seg += ch;
  }
  throw new Error(`对象字面量没有闭合: ${at}`);
}

/** 某个 `@typedef {{ … }} Name` 的顶层键 */
function typedefKeys(src, name) {
  for (const m of src.matchAll(/@typedef\s*\{\s*\{/g)) {
    const open = m.index + m[0].length - 1; // 内层那个 {
    const { keys, end } = scanObject(src, open, `typedef ${name}`);
    const after = src.slice(end + 1).match(/^\s*\}?\s*([\w$]+)/); // 内层 } 之后还剩 typedef 的外层 }
    if (after && after[1] === name) return keys;
  }
  throw new Error(`typedef 没找到: ${name}`);
}

/** `needle` 之后第一个对象字面量的顶层键 */
function firstLiteralKeys(src, needle, label) {
  const i = src.indexOf(needle);
  if (i < 0) throw new Error(`锚点没命中: ${label} → ${needle}`);
  const open = src.indexOf('{', i);
  if (open < 0) throw new Error(`锚点之后没有 { : ${label}`);
  return scanObject(src, open, label).keys;
}

/** 文本里 `name.X` 形式的成员名(先剥注释,免得把散文里的字段名数成读数) */
function memberNames(text, name) {
  const noComments = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
  const out = new Set();
  for (const m of noComments.matchAll(new RegExp(`\\b${name}\\.([A-Za-z_$][\\w$]*)`, 'g')))
    out.add(m[1]);
  return [...out];
}

/** 运行期读数:Proxy 记下"实现到底读了哪些键",值照原样给(数学要能跑) */
function census(target) {
  const seen = new Set();
  const proxy = new Proxy(target, {
    get(t, prop) {
      if (typeof prop === 'string') seen.add(prop);
      return t[prop];
    },
  });
  return { proxy, keys: () => [...seen].sort() };
}

const sorted = (a) => [...a].sort();

// ===================== 判据 =====================

describe('垂直运动包:声明 ≡ 实现读的 ≡ 写入方传的', () => {
  const src = read(PP);

  it('VerticalState 的键 ≡ stepVertical 实际从 state 上读的键', () => {
    const st = census({ y: 10, vy: -1, onGround: true, glideEnergy: 5 });
    const inp = census({ jumpPressed: true, jumpHold: true, pitch: 0.5, updraft: 2, gy: 1.6 });
    stepVertical(st.proxy, inp.proxy, 1 / 60);
    expect(sorted(st.keys())).toEqual(sorted(typedefKeys(src, 'VerticalState')));
  });

  it('VerticalInput 的键 ≡ 两个分支合起来实际读的键(短路会把 jumpPressed/jumpHold 藏起来)', () => {
    const inp = census({ jumpPressed: true, jumpHold: true, pitch: 0.5, updraft: 2, gy: 1.6 });
    stepVertical({ y: 10, vy: 0, onGround: true, glideEnergy: 5 }, inp.proxy, 1 / 60);
    // 第二次改成"空中 + 按住 + 有余量"才会进滑翔分支,那里才读 pitch / updraft
    stepVertical({ y: 12, vy: -1, onGround: false, glideEnergy: 5 }, inp.proxy, 1 / 60);
    expect(sorted(inp.keys())).toEqual(sorted(typedefKeys(src, 'VerticalInput')));
  });

  it('生产调用点(player.js)传的字面量键,与声明一字不差;返回值被读的键与 @returns 一字不差', () => {
    const p = read(PLAYER);
    const at = p.indexOf('const ns = stepVertical(');
    if (at < 0) throw new Error('锚点没命中: player.js 里的 `const ns = stepVertical(`');
    const a = scanObject(p, p.indexOf('{', at), 'player.js 入参 state');
    const b = scanObject(p, p.indexOf('{', a.end), 'player.js 入参 input');
    expect(sorted(a.keys)).toEqual(sorted(typedefKeys(src, 'VerticalState')));
    expect(sorted(b.keys)).toEqual(sorted(typedefKeys(src, 'VerticalInput')));
    expect(sorted(memberNames(p, 'ns'))).toEqual(sorted(typedefKeys(src, 'VerticalStep')));
  });

  it('返回值运行期的键 ≡ VerticalStep(声明说有,对象就得真的有)', () => {
    const out = stepVertical(
      { y: 10, vy: 0, onGround: false, glideEnergy: 5 },
      { jumpPressed: false, jumpHold: true, pitch: 0.4, updraft: 1, gy: 1.6 },
      1 / 60
    );
    expect(sorted(Object.keys(out))).toEqual(sorted(typedefKeys(src, 'VerticalStep')));
  });
});

describe('自由飞包:同上,并且 autoNavTarget 按写入方的真实形状裁决', () => {
  const src = read(FP);

  it('FlightState 的键 ≡ stepFlight 克隆并读出的键', () => {
    const st = census({
      pos: new THREE.Vector3(0, 100, 0),
      quat: new THREE.Quaternion(),
      vel: new THREE.Vector3(),
      pitchRate: 0,
      rollRate: 0,
      energy: 100,
      autoNav: true,
    });
    const inp = census({
      pitchIn: 0.2,
      rollIn: -0.1,
      boostHold: false,
      boostKey: true,
      autoNavTarget: { x: 5000, y: 500, z: 5000 }, // 远到不会触发靠港早退
      groundHeightAt: () => 0,
      centerX: 800,
      centerZ: 600,
    });
    stepFlight(st.proxy, inp.proxy, 1 / 60);
    expect(sorted(st.keys())).toEqual(sorted(typedefKeys(src, 'FlightState')));
    expect(sorted(inp.keys())).toEqual(sorted(typedefKeys(src, 'FlightInput')));
  });

  it('生产调用点 ark.js 传的输入字面量 ≡ FlightInput;它的状态持有者 freeFlight 必须是超集', () => {
    const ark = read(ARK);
    expect(sorted(firstLiteralKeys(ark, 'const flags = stepFlightInto(', 'ark.js 输入包'))).toEqual(
      sorted(typedefKeys(src, 'FlightInput'))
    );
    const held = firstLiteralKeys(ark, 'const freeFlight = {', 'ark.js freeFlight');
    for (const k of typedefKeys(src, 'FlightState')) expect(held).toContain(k);
    // 持有者确实还带着本模块不碰的字段(所以才用「只声明物理拥有的七个」而不是照抄十个)
    expect(held.filter((k) => !typedefKeys(src, 'FlightState').includes(k)).length).toBeGreaterThan(
      0
    );
  });

  it('autoNavTarget 不许被写成 Vector3(唯一生产写入方传的是 {x,y,z} 字面量 DOCK)', () => {
    expect(src).not.toMatch(/autoNavTarget\?:\s*THREE\.Vector3/);
    expect(src).toMatch(/autoNavTarget\?:\s*\{x:number, y:number, z:number\}\|null/);
    expect(read(ARK)).toMatch(/^const DOCK = \{ x: [\d.]+, y: [\d.]+, z: [\d.]+ \};$/m);
  });

  it('flags 的键 ≡ FlightFlags ≡ 实现里真正赋过的 flags.', () => {
    const out = stepFlight(
      {
        pos: new THREE.Vector3(0, 100, 0),
        quat: new THREE.Quaternion(),
        vel: new THREE.Vector3(),
        pitchRate: 0,
        rollRate: 0,
        energy: 100,
        autoNav: false,
      },
      { pitchIn: 0, rollIn: 0, boostHold: false, boostKey: false, centerX: 0, centerZ: 0 },
      1 / 60
    ).flags;
    expect(sorted(Object.keys(out))).toEqual(sorted(typedefKeys(src, 'FlightFlags')));
    expect(sorted(memberNames(src, 'flags'))).toEqual(sorted(typedefKeys(src, 'FlightFlags')));
  });
});

describe('chime 的选项包与 hot.register 的 opts', () => {
  it('chime 声明的键 ≡ 实现从包里读的键;三处真实调用传的键都必须在声明里', () => {
    const src = read(AB);
    const o = census({ peak: 0.2, decay: 1.2, delay2: 0.1, dest: null, audioCtx: null });
    chime(440, o.proxy);
    expect(sorted(o.keys())).toEqual(sorted(typedefKeys(src, 'ChimeOpts')));
    // 调用方普查:ark.js 不传包(所以第二参必须是可选的 [o]),eternal/spirits 各传三个键
    const passed = new Set();
    for (const m of read('src/kunlun/eternal.js').matchAll(/blipChime\([^)]*\{\s*([^}]+)\}/g))
      m[1].split(',').forEach((kv) => passed.add(kv.split(':')[0].trim()));
    for (const m of read('src/kunlun/spirits.js').matchAll(/blipChime\([^)]*\{\s*([^}]+)\}/g))
      m[1].split(',').forEach((kv) => passed.add(kv.split(':')[0].trim()));
    expect(passed.size).toBeGreaterThan(0);
    for (const k of passed) expect(typedefKeys(src, 'ChimeOpts')).toContain(k);
    expect(src).toMatch(/@param \{ChimeOpts\} \[o\]/);
  });

  it('hot.register 的 scene 是 Object3D 不是裸 object,shared 认四种(照 disposeObject3D 的契约)', () => {
    const src = read(HOT);
    expect(src).toMatch(/scene\?:import\('three'\)\.Object3D/);
    expect(src).not.toMatch(/scene\?:object/);
    expect(src).toMatch(
      /shared\?:Set\|WeakSet\|Array\|\(\(res:object, kind:string\)=>boolean\)\|null/
    );
    // disposeObject3D 自己那份声明仍是唯一出处:hot 的写法不许比它窄
    expect(read('src/shared/dispose-object3d.mjs')).toMatch(
      /@param \{Set\|WeakSet\|Array\|Function\|null\|undefined\} shared/
    );
  });
});

describe('类级别闸门:这一族不许回来', () => {
  /** 找出「被声明成裸 {object} 又没有逐成员点号声明」的 @param */
  const bareBags = (text) => {
    const out = [];
    for (const m of text.matchAll(/@param\s+\{object\}\s+(?:\[)?([\w$]+)/g)) {
      const name = m[1];
      const blockStart = text.lastIndexOf('/**', m.index);
      const blockEnd = text.indexOf('*/', m.index);
      const block = text.slice(blockStart, blockEnd);
      if (!new RegExp(`@param\\s*\\{[^}]*\\}\\s*\\[?${name}\\]?\\.`).test(block)) out.push(name);
    }
    return out;
  };

  it('本刀收过的四个文件:零裸 {object} 包参数,也零「包里某个成员写成 object」', () => {
    // 两个方向都要守:整包 `{object}` 会被 checkJs 逐字段点名;
    // 而 `{{scene?:object, …}}` 这种"包有形状、成员没形状"编译器**不报错**,只能靠这条静态闸
    // (hot.register 的 scene 就是这一形,反向验证 I10 会同时打红两条)。
    for (const rel of [PP, FP, AB, HOT]) {
      const t = read(rel);
      expect(bareBags(t), rel).toEqual([]);
      // 只认「记录里的成员」位置(`{` 或 `,` 之后紧跟的名字),否则会把谓词 `(res:object, kind:string)`
      // 里的参数名当成包成员误伤 —— 那是我自己在 hot.js 里写下的合法形状。
      const memberBags = [...t.matchAll(/[{,]\s*[\w$]+\??\s*:\s*object\b/g)].map((m) =>
        m[0].trim()
      );
      expect(memberBags, rel).toEqual([]);
    }
    // 反面:tone 用的是「@param {object} o + @param {number} o.freq」这个合法写法,不该被误伤
    expect(read(AB)).toMatch(/@param \{object\} o/);
  });

  it('全仓其余裸包声明是一笔**记了名**的债(新增一条就红;别把它当"没有问题")', () => {
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
    const ledger = {};
    for (const rel of files) {
      const text = read(rel);
      // 先做一次便宜的字符串筛:全仓 800 多个文件里只有个位数带 `{object}`,
      // 不做这层筛选时这条用例在**整套并发跑**时会因为抢不到 CPU 飘到 20s 超时(2026-10-15 实测)。
      if (!text.includes('{object}')) continue;
      const n = bareBags(text).length;
      if (n) ledger[rel] = n;
    }
    // ⚠️剩下这两处不是"漏做":plane-physics / chapter-map-logic 都**不在 checkJs 的可见图里**
    // (tsconfig.checkjs.json 只 include src/core、src/player、src/kunlun/avatar.js,其余靠 import 传递;
    // `tsc --listFiles` 实测这两个文件确实不在程序集里 —— 2026-10-15 记)。没有编译器背书时,
    // 手写形状反而会变成第二条谎。要治它们得先把文件纳进检查图,那是独立一批。
    expect(ledger).toEqual({
      'src/scene/plane-physics.mjs': 3,
      'src/shared/chapter-map-logic.mjs': 1,
    });
  }, 60000);

  it('tone 的点号子声明与解构形参一字不差(声明里的字段不许是摆设)', () => {
    const src = read(AB);
    const declared = [...src.matchAll(/@param \{[^}]*\} \[?o\.([\w$]+)/g)].map((m) => m[1]);
    expect(sorted(declared)).toEqual(['audioCtx', 'decay', 'delay', 'dest', 'freq', 'gain']);
    const destructure = src.match(/export function tone\(\{([^}]+)\}\)/);
    if (!destructure) throw new Error('锚点没命中: tone 的解构形参');
    expect(sorted(destructure[1].split(',').map((s) => s.split('=')[0].trim()))).toEqual(
      sorted(declared)
    );
  });
});
