// ctx-writer-shapes.test.js — 「ctx 成员声明接回唯一写入方」这一批的闸门(2026-10-16 checkJs 第九刀·批次6)
//
// 批次6 收的是最后 14 条里的 13 条,它们的共同点不是"缺一个类型",而是**声明与写入方各说各话**:
// `ctx.media.audioManager: unknown` 之类的声明,把矛盾推到了消费者身上(每个读数点各报一条 TS2339),
// 而真正该被检查的写入方一行都不报。这一刀的两种收法都必须被钉住,否则下一个人会退回到
// "在 ctx.d.ts 里照抄一份形状"——那条路的下场本文件里就有现成的反例(`mA: Material[]`,见 ctx.d.ts)。
//
//  1. 能指回写入方的,一律 `typeof import(...)` / `import type`:audioManager、worldChanged 的载荷。
//     这类声明的判据是"ctx.d.ts 里不许出现手写的形状",而不是形状本身对不对 —— 对了也没用,
//     它会漂。指回之后,写入方自己改签名,消费点立刻跟着报,矛盾当场暴露。
//  2. 指不回去的(links.js 的 `redraw` 定义在建造函数体内,不是模块级绑定),只能手写 + 由 markup/源码反查:
//     scrollLink。这类**必须**由测试把"声明 ≡ 写入方"钉死,参数名、顺序、可选性逐项比。
//  3. 派发契约型:eternalHandlers 的值签名照 eternal.js:704 那行 `h(cg)` 写,不照某个 handler 猜。
//  4. 配置型:navigator.deviceMemory 的声明文件没进 checkJs 程序 = 一句写了等于没写的声明。
//
// 口径沿用第五刀那条:**锚点没命中一律抛错,不许当成"没有问题"**;正则全部行内作用域,
// 不用跨行惰性量词(第九刀批次1 记过:那玩意儿把一次 vitest 跑到 46 秒后被超时杀掉)。
//
// 写这批时判据自己打红过两次,都记在这儿,因为它们不是测试的 bug:
//  · scene-manager.js 的注释原话里有 `eventBus.emit('world:changed', …)`,被"全仓只有一个 emit"
//    数成两条 ⇒ 注释改写成"commit() 里那行 `eventBus.emit`"。判据确实在读文本,不是在读它自己的想象。
//  · browser-globals 那条本来写"唯一消费者",实测是两处(mode.js 与 visitor-fp.js)⇒ 表按实测改。
//
// ⚠️ 为什么"写入方必须真的 export"这一条(J2)只能靠测试,编译器不会管:
//   实测把 audio-manager.js 的 `export const audioManager` 改成 `const`(声明侧不动),
//   `npx tsc -p tsconfig.checkjs.json` 输出 **0 行**,连 `ctx.media.audioManager.这个键不存在(1)`
//   都不报 —— 因为 TS2694 落在 types/ctx.d.ts 这个 **.d.ts** 里,而 tsconfig 开着
//   `skipLibCheck: true`,它只跳检查、不跳使用:那条 import 指空了,成员就静默退化成 `any`。
//   `any` 比这一刀之前的 `unknown` 更糟(unknown 至少让每个读数点报一条,any 让所有读数点失去检查)。
//   所以 typeof import 这条路必须配一个"绑定名/导出确实在"的钉子,不能只信编译器。
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

/** 取一行(或一段)必须命中的锚点;命不中就抛错 —— 判据不许空转。 */
function must(rel, re, label) {
  const src = read(rel);
  const m = src.match(re);
  if (!m) throw new Error(`锚点没命中:${label} —— ${rel} 里的形状已经不是这一刀落地时的样子了`);
  return m;
}

/** src 下所有 .js/.mjs 的相对路径(排除 __tests__,钉子读的是产品代码)。 */
function srcFiles(dir = 'src', acc = []) {
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
const FILES = srcFiles();

/** 按正则扫全仓,返回 [{rel, line, match}] —— 只逐行匹配,不跨行。 */
function scan(re) {
  const hits = [];
  for (const rel of FILES) {
    read(rel)
      .split('\n')
      .forEach((line, i) => {
        const m = line.match(re);
        if (m) hits.push({ rel, line: i + 1, text: line.trim(), match: m });
      });
  }
  return hits;
}

/**
 * 整文件作用域的计数(可以跨行,但**不用惰性量词**)。
 * emit('world:changed', …) 被 prettier 拆成了三行,逐行正则会数出 0 条 —— 那正是
 * "判据静默空转"的形状,所以这一处必须跨行。
 */
function scanText(re) {
  if (!re.global) throw new Error('scanText 需要 /g 标志,否则只数到第一处');
  const hits = [];
  for (const rel of FILES) {
    const ms = read(rel).match(re);
    if (ms) hits.push({ rel, count: ms.length, first: ms[0] });
  }
  return hits;
}

/** 把 `a, b?, c` 这种参数表拆成 [{name, optional}]。 */
function paramsOf(list) {
  return list
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const optional = /^\w+\?/.test(s);
      return { name: s.replace(/^(\w+)\??.*$/, '$1'), optional };
    });
}

const AM = 'src/scene/media/audio-manager.js';
const CTX = 'types/ctx.d.ts';

describe('批次6-1 audioManager:声明指回唯一写入方,ctx.d.ts 里不许躺着一份形状', () => {
  const MEMBER = new RegExp(`^  audioManager: (.+);$`, 'm');

  it('ctx.d.ts 的成员就是 typeof import,而且没有手写形状', () => {
    const raw = must(CTX, MEMBER, 'audioManager 成员行').pop();
    expect(raw).toBe("typeof import('../src/scene/media/audio-manager.js').audioManager");
    expect(raw).not.toMatch(/unknown/);
    expect(raw).not.toMatch(/\{\s*\w+\s*:/); // 手写形状(哪怕只写一个键)就是回到 mA: Material[] 那条路
  });

  it('写入方确实是模块级导出,并且全世界只有一处挂载', () => {
    must(AM, /^export const audioManager = \{$/m, 'audioManager 导出');
    const mounts = read(AM).match(/^ctx\.media\.audioManager = audioManager;$/gm) || [];
    expect(mounts).toHaveLength(1);
    // typeof import 指的是**绑定名**,绑定名漂了声明就指到 undefined ⇒ 两边必须同名同形
    expect(read(AM)).toMatch(/export const audioManager/);
  });

  it('playOne 的 @param 键 ≡ 函数体解构的键,且默认值 {} 要求每个键都是可选的', () => {
    const lines = read(AM).split('\n');
    const at = lines.findIndex((l) => /^audioManager\.playOne = function \(/.test(l));
    if (at < 0) throw new Error('锚点没命中:playOne 赋值行');
    const destructure = lines[at].match(/function \(\{([^}]*)\}\s*(=\s*\{\})?\)/);
    if (!destructure) throw new Error('锚点没命中:playOne 的解构入参');
    const bodyKeys = paramsOf(destructure[1])
      .map((p) => p.name)
      .sort();
    expect(destructure[2]).toBeTruthy(); // 默认值 {} 就是"每个键都可能缺"的物证

    const doc = lines.slice(Math.max(0, at - 14), at).join('\n');
    const declared = doc.match(/@param \{\{([^}]*)\}\} \[item\]/s);
    if (!declared) throw new Error('锚点没命中:playOne 的 @param 块');
    // JSDoc 里这块是按 ` * ` 换行写的,先把它压回一行再拆键(不压的话 `.*$` 撞上换行就截不动)
    const flat = declared[1]
      .split('\n')
      .map((s) => s.replace(/^\s*\*+/, '').trim())
      .join(' ');
    const declaredKeys = flat
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        if (!/\?\s*:/.test(s))
          throw new Error(`@param 里 ${s} 没标可选 —— 默认值是 {} ,写必填就是谎`);
        return s.replace(/\?\s*:.*$/, '');
      })
      .sort();
    expect(declaredKeys).toEqual(bodyKeys);
  });

  it('playHint 的 @param 数 = 它自己的形参数,两个外部调用者都按它调', () => {
    const lines = read(AM).split('\n');
    const at = lines.findIndex((l) => /^audioManager\.playHint = function \(/.test(l));
    if (at < 0) throw new Error('锚点没命中:playHint 赋值行');
    const arity = paramsOf(lines[at].match(/function \(([^)]*)\)/)[1]).length;
    const doc = lines.slice(Math.max(0, at - 10), at).join('\n');
    const n = (doc.match(/^ \* @param /gm) || []).length;
    expect(n).toBe(arity);
    // 调用者:upload.js:219 与本文件 :48,都不超过这份 arity
    const calls = scan(/^.*\.playHint\(/).map((h) => ({ rel: h.rel, line: h.line }));
    expect(calls).toEqual(
      expect.arrayContaining([
        { rel: 'src/gate/upload.js', line: expect.any(Number) },
        { rel: AM, line: expect.any(Number) },
      ])
    );
  }, 90000);
});

describe('批次6-2 scrollLink:指不回写入方,那就把"声明 ≡ links.js"逐项钉住', () => {
  const LINKS = 'src/gallery/links.js';

  it('唯一写入方是 `ctx.media.scrollLink = { redraw }`,redraw 是本文件唯一同名函数', () => {
    expect(read(LINKS).match(/ctx\.media\.scrollLink = \{ redraw \};/g)).toHaveLength(1);
    expect(read(LINKS).match(/function redraw\(/g)).toHaveLength(1);
  });

  it('声明里的参数名/顺序/可选性与 function redraw(title, sub) 逐项一致', () => {
    const writer = must(LINKS, /^\s*function redraw\(([^)]*)\) \{$/m, 'redraw 定义').pop();
    const decl = must(
      CTX,
      /^ {2}scrollLink: \{ redraw: \(([^)]*)\) => void \};$/m,
      'scrollLink 声明'
    ).pop();
    expect(paramsOf(decl).map((p) => p.name)).toEqual(paramsOf(writer).map((p) => p.name));
    // 可选性由 redraw 自己的函数体裁决:title 直接读 .length(必填),sub 走 `sub || ''`(可缺)
    const body = read(LINKS).split('function redraw(')[1].split('\n').slice(0, 22).join('\n');
    expect(body).toMatch(/title\.length/);
    expect(body).toMatch(/sub \|\| ''/);
    expect(paramsOf(decl).map((p) => p.optional)).toEqual([false, true]);
  });

  it('消费点的实参数不超过声明的 arity,且全仓只有一处调用', () => {
    const calls = scan(/^.*ctx\.media\.scrollLink\.redraw\(/);
    expect(calls).toHaveLength(1);
    const args = calls[0].text.match(/redraw\((.*)\);/)[1].split(',').length;
    expect(args).toBeLessThanOrEqual(2);
  }, 90000);
});

describe('批次6-3 world:changed:载荷类型由 emit 那一行自己负责', () => {
  const SM = 'src/core/scene-manager.js';

  it('全仓只有一个 emit("world:changed"),而且它就写在本文件的 commit 里', () => {
    const emits = scanText(/emit\(\s*'world:changed'/g);
    expect(emits).toHaveLength(1);
    expect(emits[0].rel).toBe(SM);
    expect(emits[0].count).toBe(1);
  });

  it('emit 的那份对象字面量被钉成 WorldChangedPayload,键与 typedef 逐项相等', () => {
    const typedef = must(
      SM,
      /@typedef \{\{ ([^}]+) \}\} WorldChangedPayload/,
      'WorldChangedPayload typedef'
    ).pop();
    const typedefKeys = typedef
      .split(',')
      .map((s) =>
        s
          .trim()
          .replace(/\??:.*$/, '')
          .replace(/\?$/, '')
      )
      .sort();
    const emitted = must(
      SM,
      /@type \{WorldChangedPayload\} \*\/ \(\{ ([^)]+) \}\)/,
      'emit 处的 @type cast'
    ).pop();
    const emittedKeys = emitted
      .split(',')
      .map((s) => s.trim().replace(/\s*:.*$/, ''))
      .sort();
    expect(emittedKeys).toEqual(typedefKeys);
    // 值必须是字符串:声明写 from/to: string,而 source.id / target.id 就是那两个字(见 registerWorld)
    expect(emitted).toMatch(/from: source\.id, to: target\.id/);
  });

  it('ctx.d.ts 的成员指的是那份 typedef,不再是 (...a: unknown[])', () => {
    // `.+` 而不是 `[^)]+`:值里带 `import('…')`,那对括号会把后者截断
    const decl = must(CTX, /^ {4}fn: \(d: (.+)\) => void$/m, 'worldChanged 的 fn 参数').pop();
    expect(decl).toBe("import('../src/core/scene-manager.js').WorldChangedPayload");
    expect(read(CTX)).not.toMatch(/worldChanged\?: \(fn: \(\.\.\.a: unknown\[\]\]/);
  });

  it('两个消费者各只读载荷里声明过的键', () => {
    const readers = scan(/^ctx\.scene\.worldChanged &&$/);
    expect(readers.map((r) => r.rel).sort()).toEqual(
      ['src/kunlun/planets.js', 'src/scene/media/audio-manager.js'].sort()
    );
    const declared = read(SM).match(/@typedef \{\{ ([^}]+) \}\} WorldChangedPayload/)[1];
    for (const r of readers) {
      const lines = read(r.rel).split('\n');
      const start = r.line; // 匹配行的下一行(0-based)
      if (!/ctx\.scene\.worldChanged\(function \(d\) \{/.test(lines[start])) {
        throw new Error(`${r.rel}:${start + 1} 不是预期的 worldChanged(function (d) { 形态`);
      }
      let end = start;
      while (end < lines.length && !/^\s*\}\);\s*$/.test(lines[end])) end++;
      if (end >= lines.length) throw new Error(`${r.rel} 的 worldChanged 回调找不到收尾的 });`);
      const block = lines.slice(start, end).join('\n');
      for (const key of block.match(/\bd\.([A-Za-z_$][\w$]*)/g) || []) {
        const name = key.slice(2);
        if (!declared.includes(name)) throw new Error(`${r.rel}:${r.line} 读了未声明的 d.${name}`);
      }
      expect(block).toMatch(/d\.to/); // 这两处存在的理由就是读 to,读不到说明形态变了
    }
  });
});

describe('批次6-4 eternalHandlers:值签名照派发契约写,不照某个 handler 猜', () => {
  const ETERNAL = 'src/kunlun/eternal.js';

  it('派发点确实是 h(cg),而 cg 就是 eternalClick 声明收的那个名字', () => {
    must(
      ETERNAL,
      /const h = ctx\.kunlun\.eternalHandlers && ctx\.kunlun\.eternalHandlers\[act\];/,
      '查表'
    );
    must(ETERNAL, /if \(h\) h\(cg\);/, '派发');
    const decl = must(
      CTX,
      /^ {2}eternalClick: \(\(cg: Object3D\) => void\) \| null;$/m,
      'eternalClick 声明'
    );
    expect(decl).toBeTruthy();
  });

  it('ctx.d.ts 的值签名收 cg: Object3D,不是 unknown[]', () => {
    const raw = must(CTX, /^ {2}eternalHandlers: (.+);$/m, 'eternalHandlers 成员').pop();
    expect(raw).toBe('Record<string, (cg: Object3D) => void>');
  });

  // 2026-11-17 C8 收编:散写形态(键赋值+delete)改为 owner 注册 API。
  // 断言语义不变:键集恰为五个/参数≤1且名叫cg/注册必配 off 收手;另钉散写形态绝迹。
  it('五个注册者经 registerEternalHandler 注册,参数最多一个、有的必须叫 cg,且各自都配了 off 收手', () => {
    const regs = scan(/registerEternalHandler\('(\w+)',\s*function\s*\(([^)]*)\)\s*\{?/);
    const keys = regs.map((r) => r.match[1]).sort();
    expect(keys).toEqual(['chime', 'fireplace', 'resetview', 'snowwin', 'spiritmark']);
    for (const r of regs) {
      const ps = paramsOf(r.match[2]);
      expect(ps.length).toBeLessThanOrEqual(1);
      if (ps.length === 1) expect(ps[0].name).toBe('cg');
      // off 配对:注册句柄 const offXxx = registerEternalHandler(...) 且拆场调用 offXxx()
      const handle = read(r.rel).match(
        new RegExp(`const (off\\w+)\\s*=\\s*registerEternalHandler\\('${r.match[1]}'`)
      );
      if (!handle)
        throw new Error(`${r.rel} 注册 ${r.match[1]} 没接住 off 句柄 —— 拆场景会留活引用`);
      const called = read(r.rel).match(new RegExp(`${handle[1]}\\(\\)`));
      if (!called) throw new Error(`${r.rel} 注册了 ${r.match[1]} 但没调用 ${handle[1]}() 收手`);
    }
  });

  it('散写形态绝迹:除 owner(eternal-handlers.js)外,任何文件不得直写 eternalHandlers 表', () => {
    const writes = scan(
      /ctx\.kunlun\.eternalHandlers\s*=|ctx\.kunlun\.eternalHandlers\.\w+\s*=|delete ctx\.kunlun\.eternalHandlers\./
    );
    const rogue = writes.filter((w) => w.rel !== 'src/kunlun/eternal-handlers.js');
    expect(rogue.map((w) => `${w.rel}:${w.line}`)).toEqual([]);
  });
});

// 2026-11-18 E1:C8 收尾欠账——dayTimeSource/groundOverride 两属性的单一 owner 此前只靠
// 人工 grep,无测试钉死,回潮无告警。这里补上(与 eternalHandlers 同款"散写绝迹"口径)。
describe('批次6-4b dayTimeSource/groundOverride:单一 owner 钉死(C8 欠账补)', () => {
  it('dayTimeSource 写入方只许 time-shift.js(owner),其他文件一律经 lockDayAt/shiftDayTo 接口', () => {
    // 注释里的教学示例(loop-manager:365 "经 ctx.media.dayTimeSource = () => 12 覆盖")不算写:
    // 行首 // 或 * 开头的整行注释剔除,只钉真代码。
    const writes = scan(/ctx\.media\.dayTimeSource\s*=/).filter(
      (w) => !/^\s*(\/\/|\*|\/\*)/.test(w.text)
    );
    const rogue = writes.filter((w) => w.rel !== 'src/scene/time-shift.js');
    expect(rogue.map((w) => `${w.rel}:${w.line}`)).toEqual([]);
    expect(writes.length).toBeGreaterThan(0); // owner 自己必须在写(判据不空转)
  });

  it('groundOverride 写入方只许 ground-resolver.js(合成别名),四模块经 addGroundLayer 注册', () => {
    const writes = scan(/ctx\.kunlun\.groundOverride\s*=/);
    const rogue = writes.filter((w) => w.rel !== 'src/shared/ground-resolver.js');
    expect(rogue.map((w) => `${w.rel}:${w.line}`)).toEqual([]);
    expect(writes.length).toBeGreaterThan(0);
    // 四个层注册方都必须经 addGroundLayer 且接住 off(防"注册了不收手"回潮)
    const regs = scan(/const (off\w+)\s*=\s*addGroundLayer\(/);
    const byFile = new Map(regs.map((r) => [r.rel, r.match[1]]));
    for (const rel of [
      'src/kunlun/eternal.js',
      'src/kunlun/planets.js',
      'src/kunlun/resetview.js',
    ]) {
      const h = byFile.get(rel);
      if (!h) throw new Error(`${rel} 没有经 addGroundLayer 注册地面层`);
      if (!read(rel).match(new RegExp(`${h}\\(\\)`)))
        throw new Error(`${rel} 注册了地面层但没调用 ${h}() 收手`);
    }
    // museum 是运行时接管:takeGround/giveGroundBack 包装,两函数都必须在且被调用
    const m = read('src/museum/museum.js');
    expect(m).toMatch(/function takeGround\(\)/);
    expect(m).toMatch(/function giveGroundBack\(\)/);
    expect(m).toMatch(/takeGround\(\);/);
    expect(m).toMatch(/giveGroundBack\(\);/);
  });
});

// 2026-11-18 G1:氛围仲裁收编后钉死散写绝迹——场景接管只许 pushAtmosphereOverride,
// 直调 setAtmosphere 只许昼夜基准层(light-mood 经 ctx.scene.setAtmosphere 别名=applyBase)。
describe('批次6-4c setAtmosphere:场景接管经中央仲裁,散写绝迹(G1)', () => {
  it('直调 setAtmosphere 只许 light-mood(基准层);koi/eternal 等接管方一律经 pushAtmosphereOverride', () => {
    const calls = scan(/\.setAtmosphere\s*\(/).filter((w) => !/^\s*(\/\/|\*|\/\*)/.test(w.text));
    const rogue = calls.filter((w) => w.rel !== 'src/scene/desert/light-mood.js');
    expect(rogue.map((w) => `${w.rel}:${w.line}`)).toEqual([]);
    expect(calls.length).toBeGreaterThan(0); // 基准层必须在调(判据不空转)
  });

  it('ctx.scene.setAtmosphere 赋值只许 main.js 接线到仲裁 applyBase(不许再接裸 pp.setAtmosphere)', () => {
    const m = read('src/main.js');
    expect(m).toMatch(/ctx\.scene\.setAtmosphere\s*=\s*atmos\.applyBase/);
    const assigns = scan(/ctx\.scene\.setAtmosphere\s*=/).filter(
      (w) => !/^\s*(\/\/|\*|\/\*)/.test(w.text)
    );
    expect(assigns.map((w) => w.rel)).toEqual(['src/main.js']);
  });

  it('两个接管方(koi-flight/hall)都经 pushAtmosphereOverride 且 off 配对收手', () => {
    const regs = scan(/pushAtmosphereOverride\('([\w-]+)'/);
    const names = regs.map((r) => r.match[1]).sort();
    expect(names).toEqual(['hall', 'koi-flight']);
    // koi:saved.offAtmos 接住,下机与 dispose 都调 off
    const k = read('src/scene/koi-ship.js');
    expect(k).toMatch(/saved\.offAtmos\s*=\s*pushAtmosphereOverride\('koi-flight'/);
    expect(k.match(/saved\.offAtmos\(\)/g).length).toBeGreaterThanOrEqual(2); // 下机还原+dispose兜底
    // eternal:offHallAtmos 接住,离厅调 off
    const e = read('src/kunlun/eternal.js');
    expect(e).toMatch(/offHallAtmos\s*=\s*pushAtmosphereOverride\('hall'/);
    expect(e).toMatch(/offHallAtmos\(\)/);
    // 每帧压住 workaround 必须绝迹(仲裁后不需要)
    expect(e).not.toMatch(/if \(hallMoodOn\) ctx\.scene\.setAtmosphere/);
  });
});

// H1:锦鲤天空/太阳/环境灯/云抽 koi-env.js。钉死拆分不回退:
// 编排层不许再长回天空实现;setSun 单一定义在 koi-env;水面 uSunDir 与 env 共享同一实例。
describe('批次6-6 koi-env:天空子系统单一归属,编排层只组装(H1)', () => {
  it('setSun/buildSky 定义只在 koi-env.js;koi-ship 只解构使用', () => {
    const defs = scan(/function (setSun|buildSky|buildLights|buildClouds)\s*\(/);
    expect(defs.map((w) => w.rel).filter((r, i, a) => a.indexOf(r) === i)).toEqual([
      'src/scene/koi-env.js',
    ]);
    const k = read('src/scene/koi-ship.js');
    // 格式无关:pre-commit prettier 会把长参数列表折行(批次6-7 曾因此假红),\s+ 兼容两种形态
    expect(k).toMatch(
      /const env = createKoiEnv\(\{\s*voxCore,\s*scene,\s*koiGroup,\s*cloudGroup,\s*matSoft,\s*updaters,?\s*\}\)/
    );
    expect(k).toMatch(/const \{ setSun, buildSky, buildLights, buildClouds, sunDir \} = env/);
    // 天空实现细节绝迹于编排层(防拆分回退)
    expect(k).not.toMatch(/skyMat|sunDisc|radialTexture|cloudCluster/);
  });

  it('applyEnv 沙漠灯判定用 env.sunLight 实时 getter(buildLights 前 undefined 也安全)', () => {
    const k = read('src/scene/koi-ship.js');
    expect(k).toMatch(/o !== env\.sunLight/);
    const e = read('src/scene/koi-env.js');
    expect(e).toMatch(/get sunLight\(\)/);
  });
});

// H2:花瓣粒子/鹤群抽 koi-ambient.js。同 H1 纪律:单一归属+编排层细节绝迹;
// blossomEmitters 必须同引用注入(buildTrees 填、respawnPetal 读,拷一份就断时序)。
describe('批次6-7 koi-ambient:装饰子系统单一归属,发射点同引用(H2)', () => {
  it('buildPetals/buildCranes/makeCrane/respawnPetal 定义只在 koi-ambient.js', () => {
    const defs = scan(/function (buildPetals|buildCranes|makeCrane|respawnPetal)\s*\(/);
    expect(defs.map((w) => w.rel).filter((r, i, a) => a.indexOf(r) === i)).toEqual([
      'src/scene/koi-ambient.js',
    ]);
    const k = read('src/scene/koi-ship.js');
    // 格式无关:prettier 折行兼容(H2 提交时钩子折行曾致本断言假红)
    expect(k).toMatch(
      /const ambient = createKoiAmbient\(\{\s*voxCore,\s*root,\s*craneGroup,\s*matPetal,\s*blossomEmitters,\s*updaters,?\s*\}\)/
    );
    expect(k).toMatch(/const \{ buildPetals, buildCranes \} = ambient/);
    // 装饰实现细节绝迹于编排层(防拆分回退);blossomEmitters 仍在编排层(buildTrees 填)
    expect(k).not.toMatch(/makeCrane|respawnPetal|_dummy|petals/);
    expect(k).toMatch(/blossomEmitters\.push/);
  });
});

describe('批次6-5 navigator.deviceMemory:声明文件必须真的在 checkJs 程序里', () => {
  const BG = 'types/browser-globals.d.ts';

  it('全局脚本形态(没有 import/export)+ 可选数,照 API 的非标准性写', () => {
    const src = read(BG);
    expect(src).not.toMatch(/^export /m);
    expect(src).not.toMatch(/^import /m);
    expect(src).toMatch(/^interface Navigator \{$/m);
    expect(src).toMatch(/^ {2}readonly deviceMemory\?: number;$/m);
  });

  it('tsconfig.checkjs.json 的 include 里有 types/,否则这句声明写了等于没写', () => {
    const cfg = JSON.parse(read('tsconfig.checkjs.json').replace(/^\s*\/\/.*$/gm, ''));
    expect(cfg.include).toContain('types/**/*.d.ts');
  });

  it('两个消费者读它时都带 `|| 0` 守卫(不支持的浏览器读到 undefined)', () => {
    // 2026-10-16 核实:读数点不是"一处"而是两处 —— gallery/mode.js:123 与 visitor-fp.js:52
    // 各建一份指纹缓存,那两行本来都写了 `|| 0`,是 browser-globals.d.ts 的注释先说漏了一处。
    const uses = scan(/navigator\.deviceMemory/);
    expect(uses.map((u) => u.rel).sort()).toEqual(['src/gallery/mode.js', 'src/visitor-fp.js']);
    for (const u of uses) expect(u.text).toMatch(/navigator\.deviceMemory \|\| 0/);
  });
});

describe('批次6-6 玫瑰站 concat:形状归写入方,消费点一个都不重抄', () => {
  const ST = 'src/shared/story-text.mjs';
  const S3 = 'src/kunlun/scene3-memory.js';

  it('story-text.mjs 声明 StoryLine:en/zh 必填、who 可选,who 的形状 ≡ 说话人常量的形状', () => {
    // 嵌套花括号(who 自己是个子形状)决定了这里只能整行取,不能按 `[^}]+` 截
    const td = must(ST, /^ \* @typedef \{\{ (.+) \}\} StoryLine$/m, 'StoryLine typedef').pop();
    const head = td.split('who?:')[0];
    const topKeys = head
      .split(',')
      .map((s) => s.trim().replace(/\??:.*$/, ''))
      .filter(Boolean);
    expect(topKeys).toEqual(['en', 'zh']);
    if (/en\?|zh\?/.test(head))
      throw new Error('en/zh 每条台词都有,标成可选就是替消费方放宽了声明');
    const whoShape = td.match(/who\?: \{([^}]+)\}/);
    if (!whoShape)
      throw new Error('锚点没命中:StoryLine.who 的子形状(它必须是可选 —— 纯字幕行没有说话人)');
    const prince = must(ST, /^const PRINCE = \{ ([^}]+) \};$/m, 'PRINCE 常量').pop();
    const princeKeys = prince
      .split(',')
      .map((s) => s.trim().replace(/\s*:.*$/, ''))
      .sort();
    expect(princeKeys).toEqual(['en', 'spk', 'zh']);
    for (const k of princeKeys) {
      if (!new RegExp(`\\b${k}\\??\\s*:`).test(whoShape[1])) {
        throw new Error(`StoryLine.who 的子形状少了 ${k} —— PRINCE 那批常量有这个键`);
      }
    }
    expect(whoShape[1]).toMatch(/\bspk\?:/); // 可选照 whoSpk 的回退注释,不是照 PRINCE 恰好有 spk
  });

  it('scene3-memory.js 的 cast 只引用那两个 typedef,不内联台词形状', () => {
    const cast = must(
      S3,
      /@type \{Array<import\('\.\.\/shared\/story-text\.mjs'\)\.StoryLine \| PageMark>\}/,
      'concat 收方的 cast'
    ).pop();
    expect(cast).toBeTruthy();
    const line = cast.replace(/^\/\*\* /, '');
    expect(line).not.toMatch(/\ben\s*:/); // 消费点重抄一份 en/zh 形状 = 又造一条没人钉的声明
  });

  it('PageMark 的 typedef ≡ PAGE_TWO_MARK 的实测键,speakSeq 认的就是这个键', () => {
    const td = must(S3, /@typedef \{\{ ([^}]+) \}\} PageMark/, 'PageMark typedef').pop();
    const literal = must(
      S3,
      /^const PAGE_TWO_MARK = \{ ([^}]+) \};$/m,
      'PAGE_TWO_MARK 字面量'
    ).pop();
    const keys = (s) =>
      s
        .split(',')
        .map((x) => x.trim().replace(/\??:.*$/, ''))
        .sort();
    expect(keys(td)).toEqual(keys(literal));
    must(S3, /if \(item && item\.__pageMark\) \{/, 'speakSeq 认哨兵那行');
  });
});

describe('批次6-7 地板(第十刀·批次0 起改成了"上限"而不是"等于 0")', () => {
  /**
   * 第九刀把被检图内的 checkJs 压到 0,当时基线钉成 0。
   * 第十刀把 `tsconfig.checkjs.json` 的 include 从"三个根 + import 闭包(实测 149 个 src 文件)"
   * 扩成**产品源码全量**(排除 `src/__tests__`),罩进来的都是**先前没人看过**的文件,
   * 于是基线一次性跳到 145 —— 那是覆盖面,不是新债(证据:这 24 个文件在旧配置的 `--listFiles`
   * 里一个都不存在,旧图内文件的新增数为 0)。
   * 这条钉子换写法之后**作用没变**:想让上限再往上抬,必须动这个文件,
   * 而且 `--limit` 只许**降**不许升 —— 每切完一族就把这个数字往下压到实测值。
   * 批次1(裸 object 族:plane-physics 22 + chapter-map-logic 7)压到 **116**,判据钉在
   * src/__tests__/plane-and-save-shapes.test.js,那里测的是"声明与写入方同一份事实",不是条数。
   */
  const CEILING = 75;
  it(`checkJs 基线不得超过 ${CEILING}:想抬上限必须同时改这里`, () => {
    const raw = read('scripts/checkjs-baseline.txt').trim();
    if (!/^\d+$/.test(raw)) throw new Error(`基线文件不是一个数:${raw}`);
    const n = Number(raw);
    if (n > CEILING)
      throw new Error(`基线被抬到 ${n} > 上限 ${CEILING} —— 新增的类型债要修,不是把数字改大`);
    expect(n).toBeLessThanOrEqual(CEILING);
  });
});

// I2(2026-11-18):多写方收编。I1 登记册标出的 8 个 ⚠️ 里,4 个是真·第二写方(已收编),
// 4 个是合法共写(在此逐个钉死语义与配对,防被误当违规收掉)。
describe('批次6-8 多写方收编:违规共写绝迹,合法共写钉死(I2)', () => {
  it('tickers 唯一 owner=ctx.js;loop.register 只消费不再兜底建表', () => {
    const w = scan(/ctx\.tickers\s*=(?!=)/).filter((x) => !/^\s*(\/\/|\*|\/\*)/.test(x.text));
    expect(w.map((x) => x.rel)).toEqual(['src/ctx.js']);
    expect(read('src/core/loop.js')).not.toMatch(/if \(!ctx\.tickers\)/);
  });

  it('quizPassed 唯一默认 owner=player.js;答题门只消费通行证与下发分数线', () => {
    const w = scan(/ctx\.player\.quizPassed\s*=(?!=)/).filter(
      (x) => !/^\s*(\/\/|\*|\/\*)/.test(x.text)
    );
    expect(w.map((x) => x.rel)).toEqual(['src/scene/player.js']);
    // 分数线仍归答题门(服务端单源),不被本次收编误伤
    expect(read('src/gate/quizgate.js')).toMatch(/ctx\.player\.quizPassScore = d\.passScore/);
  });

  it('renderPostProcessing 唯一写方=scene-manager;main 经 provideMainPost 门面注入', () => {
    const w = scan(/ctx\.scene\.renderPostProcessing\s*=(?!=)/).filter(
      (x) => !/^\s*(\/\/|\*|\/\*)/.test(x.text)
    );
    expect(w.map((x) => x.rel).filter((r, i, a) => a.indexOf(r) === i)).toEqual([
      'src/core/scene-manager.js',
    ]);
    const m = read('src/main.js');
    expect(m).toMatch(/provideMainPost\(pp\.renderPostProcessing\)/);
    // 门面必须覆盖 manager 未建时序(暂存+补注入),否则加载序一变就静默丢管线
    const sm = read('src/core/scene-manager.js');
    expect(sm).toMatch(/let pendingMainPost = null/);
    expect(sm).toMatch(/if \(pendingMainPost\) \{\s*manager\.setMainPost\(pendingMainPost\)/);
  });

  it('spiritsState 唯一写方=spirits.js;星球版经 spiritsDecorate 装饰器(不捕获prev覆写)', () => {
    // 判据取登记册扫描器(单一事实源):spiritsState 是 Object.assign 平铺注册,
    // 直写正则扫不到 —— 两套口径会漂,统一以 ctx-registry 为准。
    const { scan: scanCtx } = require('../../scripts/admin/ctx-registry.cjs');
    const row = scanCtx().find((r) => r.key === 'kunlun.spiritsState');
    expect(row && row.writers).toEqual(['src/kunlun/spirits.js']);
    const p = read('src/kunlun/planets.js');
    expect(p).not.toMatch(/const prevSpiritsState = ctx\.kunlun\.spiritsState/);
    expect(p).toMatch(/ctx\.kunlun\.spiritsDecorate = \(rows\) =>/);
    expect(p).toMatch(/ctx\.kunlun\.spiritsDecorate = null/); // bag.custom 对称退订
    expect(read('src/kunlun/spirits.js')).toMatch(
      /return ctx\.kunlun\.spiritsDecorate \? ctx\.kunlun\.spiritsDecorate\(rows\) : rows/
    );
  });

  it('4 个合法共写:hot捕获还原/GLB显式升级/世界切换/对话升级,各自配对不许被收掉', () => {
    // onTick:ctx.js 建 + hot.js HMR 捕获包装,uninstallCaptures 必须还原
    const h = read('src/hot.js');
    expect(h).toMatch(/saved\.prevOnTick = prev/);
    expect(h).toMatch(/ctx\.onTick = saved\.prevOnTick/);
    // scene.avatar:player 程序化小人(默认) + kunlun/avatar GLB 显式升级(window.__useGlbAvatar)
    const av = read('src/kunlun/avatar.js');
    expect(av).toMatch(/const USE_GLB_BY_DEFAULT = false/);
    expect(av).toMatch(/window\.__useGlbAvatar = function/);
    // scene.s:scene.js 首建 + scene-manager.syncCtx 世界切换换引用(46 处读者的唯一渲染入口)
    expect(read('src/core/scene-manager.js')).toMatch(/ctx\.scene\.s = world\.scene/);
    // ui.kunlunSpeak:audio-manager 基础实现 + gameshell 对话升级,dispose 必须还原
    const gs = read('src/core/gameshell-system.js');
    expect(gs).toMatch(/prevKunlunSpeak = ctx\.ui\.kunlunSpeak/);
    expect(gs).toMatch(/if \(prevKunlunSpeak\) ctx\.ui\.kunlunSpeak = prevKunlunSpeak/);
  });
});

// I2 实机踩到的真坑:ctx.<域> 是 Object.freeze 的白名单代理,新属性不登记就静默失败
// (planets 加载报 "Cannot add property spiritsDecorate, object is not extensible",
//  整个星球世界加载失败 ⇒ FPS=0)。登记册能扫出写点,但扫不出"白名单没登记"——这条补上。
describe('批次6-9 冻结命名空间:登记册里的域属性必须在白名单内(I2)', () => {
  const NS = {
    kunlun: 'src/ctx-kunlun.js',
    scene: 'src/ctx-scene.js',
    player: 'src/ctx-player.js',
    media: 'src/ctx-media.js',
    ui: 'src/ctx-ui.js',
    gallery: 'src/ctx-gallery.js',
    mode: 'src/ctx-mode.js',
  };

  it('每个已冻结域的登记属性都在对应白名单里(漏登记=运行时静默失败)', () => {
    const { scan: scanCtx } = require('../../scripts/admin/ctx-registry.cjs');
    const rows = scanCtx();
    const missing = [];
    for (const [domain, file] of Object.entries(NS)) {
      const src = read(file);
      if (!/Object\.freeze\(proxy\)/.test(src)) continue; // 只查真冻结的域
      // 白名单条目形如 'propName', (可带行尾注释)
      // 白名单条目可能独占行,也可能紧凑排在 properties 首行(ctx-mode.js)——只钉语义不钉排版
      const allow = new Set([...src.matchAll(/'([A-Za-z_$][\w$]*)'\s*,/g)].map((m) => m[1]));
      for (const r of rows) {
        if (!r.key.startsWith(domain + '.')) continue;
        const prop = r.key.slice(domain.length + 1);
        if (prop.includes('.')) continue; // 更深层不属本白名单
        if (!allow.has(prop)) missing.push(`${r.key} ← ${r.writers.join(',')} (${file} 未登记)`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('spiritsDecorate 已登记(I2 新增装饰器的白名单钉子)', () => {
    expect(read('src/ctx-kunlun.js')).toMatch(/'spiritsDecorate',/);
  });
});
