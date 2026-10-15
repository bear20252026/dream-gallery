// types/ctx.d.ts 的成员**必须由写入方决定**,不是由注释决定(2026-10-15 审计 M-08 第六轮)。
// 起因是三条假声明,它们在 checkJs 里报出来的形状恰好和"代码写错了"一模一样,
// 于是下一个人会去改代码 —— 而代码是对的:
//   · `mA: Material[]`   ← 抄自 src/ctx.js 人类可读注释「houseMats/mA 房屋材质分组」,
//     把媒体命名空间的背景音乐元素当成了 gallery 的材质分组;唯一写入方 audio-manager.js:96
//     `let mA = new Audio()` 直接撞出 TS2740。
//   · `houseMats: Material[]` ← 写入方 scene.js:913 挂的是**对象** {wall,base,deco,ceil},
//     housecolor.js 按组名索引、按 `.wall` 取名,全在报错。
//   · `worldManager?: unknown` ← 唯一写入方 scene-manager.js:395 `= new SceneManager(...)`,
//     类就在那儿导出,却没人指它 ⇒ 16 条 TS2339 挂在真实存在的方法上。
// 这三条一共 48 条 checkJs 报错(306 → 258),没有一条是运行期 bug —— 全是声明在说谎。
// 所以这里钉的是**方向**:声明必须指向写入方的真实形状,注释要和声明一致。
// 反向验证见 .tmp/rv-m08.sh:把三条分别改回 unknown / Material[] / 删掉 typedef,
// 对应断言必须变红(且 checkJs 计数回升)。
//
// 2026-10-15 又按同一方向收了两簇(258 → 236,共 22 条),并把它们一并纳进来当闸门:
//   · `MediaNamespace.desert` 只写了 `{ getH }` 一个成员,而唯一写入方 `src/scene/desert.js:22`
//     交出去的是 5 个成员 ⇒ 11 条 TS2339 挂在真实存在的 `kunlun` / `assertAboveGround` 等成员上,
//     外加 1 条 TS2353(写入方自己的字面量被嫌"多写了 update")。
//   · `PlayerState` 停在 `glideEnergy`,而 `src/scene/player.js` 的 `tickPhysics()` 会写四个太空键
//     字段(`boostT` / `boostDownT` / `spaceUp` / `spaceDown`),`planets.js` 逐帧读 ⇒ 10 条 TS2339。
//     这条还顺手把四个字段的**初值**补进 `pl` 的字面量:声明说有,对象就得真的有(见下面第二条断言)。
// 两簇各做过归因反向验证:单独退 `desert` ⇒ 248(+12);单独退 `PlayerState` 四条声明 ⇒ 246(+10);
// 一起退 ⇒ 精确回到 258。⚠️这两次注入都要求正则能吃 CRLF(`\r?\n`)——本机检出是 CRLF,
// 第一版用 `$…\n` 写,结果"替换成功、一条没删",差点把"没测到"记成"没影响"。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const DTS = read('types/ctx.d.ts');

// 从 `export interface X { ... }` 体里取某成员的声明行(两格缩进的那个键)
function memberLine(iface, member) {
  const i = DTS.indexOf('export interface ' + iface);
  if (i < 0) throw new Error('types/ctx.d.ts 里没有 ' + iface);
  const bodyStart = DTS.indexOf('{', i);
  const bodyEnd = DTS.indexOf('\n}', bodyStart);
  // 键名后可跟 `*` 或 `?`(可选成员);写成 `\?` 是"必须有个问号",会一条都匹配不上 ——
  // 用字符类,与 types-ctx-drift.test.js 同法。
  const re = new RegExp('^ {2}' + member + '[*?]?:\\s*([^;]+);', 'm');
  const m = DTS.slice(bodyStart, bodyEnd).match(re);
  return m ? m[1].trim() : null;
}

/**
 * 取某个 `export interface X { … }` 的**全部成员名**(一行一键;键后可跟 `?`)。
 * 用来把"声明说了什么"和"写入方给了什么"当两个集合并排比 —— 单向的 `toContain` 挡不住
 * 声明比运行期窄(那正是 desert / PlayerState 两簇的形状)。
 * ⚠️按行匹配必须吃 CRLF:本机签出是 CRLF,`\n` 写死的切分会让"一条都没解析到"看起来像"没有成员"。
 */
function ifaceMembers(iface) {
  const i = DTS.indexOf('export interface ' + iface + ' {');
  if (i < 0) throw new Error('types/ctx.d.ts 里没有 interface ' + iface);
  const bodyStart = DTS.indexOf('{', i);
  const bodyEnd = DTS.indexOf('\n}', bodyStart);
  const out = [];
  for (const line of DTS.slice(bodyStart, bodyEnd).split(/\r?\n/)) {
    const m = line.match(/^ {2}([A-Za-z_$][\w$]*)[*?]?:/);
    if (m) out.push(m[1]);
  }
  if (!out.length) throw new Error('interface ' + iface + ' 一个成员都没解析到(排版变了?)');
  return out;
}

describe('ctx.d.ts 三条成员声明 ≡ 各自唯一写入方', () => {
  it('mA 声明为 HTMLAudioElement,且写入方确实是 new Audio()', () => {
    expect(memberLine('MediaNamespace', 'mA')).toBe('HTMLAudioElement');
    const am = read('src/scene/media/audio-manager.js');
    expect(am).toMatch(/let mA = new Audio\(\)/);
    expect(am).toMatch(/ctx\.media\.mA = mA/);
    // 三个读取方一律按音频元素用(.paused/.pause/.play),没有任何一处按材质数组用
    expect(read('src/scene/media/video-wall.js')).toMatch(/mA\.paused/);
    expect(DTS).not.toMatch(/^ {2}mA: Material\[\];$/m);
  });

  it('houseMats 声明为按组名索引的材质表,且写入方确实是对象', () => {
    expect(memberLine('GalleryNamespace', 'houseMats')).toBe(
      'Record<string, MeshStandardMaterial[]>'
    );
    const scene = read('src/scene/scene.js');
    expect(scene).toMatch(/const houseMats = \{ wall: \[\], base: \[/);
    expect(scene).toMatch(/ctx\.gallery\.houseMats = houseMats/);
    // 消费方按组名取值(数组写法不可能通过),四组材质都是 MeshStandardMaterial
    expect(read('src/gate/housecolor.js')).toMatch(/houseMats\[g\]/);
    expect(DTS).not.toMatch(/^ {2}houseMats: Material\[\];$/m);
  });

  it('worldManager 指向真实导出的 SceneManager 类,而不是手写一份形状', () => {
    expect(memberLine('SceneNamespace', 'worldManager')).toBe('SceneManager');
    expect(DTS).toMatch(/import type \{ SceneManager \} from '\.\.\/src\/core\/scene-manager\.js'/);
    const sm = read('src/core/scene-manager.js');
    expect(sm).toMatch(/export class SceneManager/);
    expect(sm).toMatch(/ctx\.scene\.worldManager = manager/);
  });

  it('src/ctx.js 的人类可读登记册不再把 mA 说成材质分组(注释与声明一致)', () => {
    const ctxjs = read('src/ctx.js');
    // 只钉登记册的**条目行**(` * - 名字 说明`);文件里另一处出现这串字是"原先写成什么样"的
    // 事故记录,不是条目,不能一并禁掉。
    expect(ctxjs).not.toMatch(/^ \* - houseMats\/mA/m);
    expect(ctxjs).toMatch(/^ \* - mA\s+背景音乐元素\(HTMLAudioElement/m);
  });

  // —— 以下是 2026-10-15 补的两簇(同一方向:成员清单由写入方决定)——

  it('desert 声明指向 DesertSurface,其成员集合 ≡ desert.js 交出去的字面量', () => {
    expect(memberLine('MediaNamespace', 'desert')).toBe('DesertSurface');
    // 唯一写入方:`ctx.media.desert = { getH, update, kunlun: {...}, dayNight, assertAboveGround };`
    const d = read('src/scene/desert.js');
    const m = d.match(/ctx\.media\.desert = (\{[^\n]*\});/);
    expect(m, 'desert.js 里找不到那行导出(改写法要同步改这条断言)').not.toBe(null);
    const wrote = m[1]
      .replace(/\{[^{}]*\}/g, ' X ') // 先塌掉一层嵌套对象(kunlun 的 { x, z })
      .slice(1, -1)
      .split(',')
      .map((s) => s.trim().split(':')[0].trim())
      .filter(Boolean)
      .sort();
    expect(wrote).toEqual(['assertAboveGround', 'dayNight', 'getH', 'kunlun', 'update'].sort());
    expect(ifaceMembers('DesertSurface').sort()).toEqual(wrote);
    // 说谎的窄写法不许回来(它曾让 11 条真实成员读取全报 TS2339)
    expect(DTS).not.toMatch(/^ {2}desert: \{ getH/m);
  });

  it('PlayerState 的成员集合 ≡ player.js 里 pl 字面量的键(声明说有,对象就得真有)', () => {
    const pj = read('src/scene/player.js');
    const start = pj.indexOf('const pl = {');
    expect(start, 'player.js 里找不到 const pl 字面量').toBeGreaterThan(-1);
    const end = pj.indexOf('\n};', start);
    const body = pj.slice(start, end);
    // 一行一键(prettier 保证);跳过注释行与嵌套调用里的逗号问题
    const wrote = body
      .split(/\r?\n/)
      .map((l) => l.match(/^ {2}([A-Za-z_$][\w$]*)\s*:/))
      .filter(Boolean)
      .map((m) => m[1])
      .sort();
    const declared = ifaceMembers('PlayerState').sort();
    expect(declared).toEqual(wrote);
    // 四个太空键字段必须两边都在:写方 player.js:152-160,读方 planets.js:774-819
    for (const k of ['boostT', 'boostDownT', 'spaceUp', 'spaceDown']) {
      expect(wrote, 'pl 字面量缺 ' + k + '(声明与运行期会再次分叉)').toContain(k);
      expect(pj).toMatch(new RegExp('pl\\.' + k + '\\s*='));
    }
  });
});

describe('2026-10-15 第四刀:链接契约与 hangOne ≡ 服务端 / paintings.js 的真实形状', () => {
  // 同一方向的第三簇:`ModeNamespace.myLinks / customLinks` 写的是 `string[]`,而这两个数组的**唯一
  // 写入方是服务端裁剪**(`lib/siteconfig.js:89` 与 `:96` 的两个 `.map(l => ({…}))`)——下发的是对象数组。
  // 后果与 mA/desert 一模一样:报错的是消费方,而消费方是对的 —— `mode.js:325` 读 `l.pos.x`、
  // `mode.js:106/313` 读 `l.icon`、`upload.js:508` 读 `l.name`、`:523` 读 `l.id`。
  // 以及 `GalleryNamespace.hangOne` 声明成 `(url) => void`,而 `paintings.js:309` 是三个参数、
  // 返回一个画框 Group:`upload.js:395` 因此报 TS2554,紧接着读 `g.userData.ox/oy/oz` 报 3 条 TS2339。
  const SC = read('lib/siteconfig.js');
  /** 从服务端那两行 `.map(l => ({ a: l.a, b: l.b }))` 里取**下发出去的键集合** */
  function servedKeys(re, label) {
    const m = SC.match(re);
    expect(m, `lib/siteconfig.js 里找不到 ${label} 那行裁剪(改写法要同步改这条断言)`).not.toBe(
      null
    );
    return m[1]
      .split(',')
      .map((s) => s.split(':')[0].trim())
      .filter(Boolean)
      .sort();
  }

  it('MyLinkItem 的成员集合 ≡ 服务端 myLinks 裁剪出的键', () => {
    const served = servedKeys(/\.map\(l => \(\{([^}]*)\}\)\);/, 'myLinks');
    expect(served).toEqual(['id', 'model', 'name', 'pos', 'url']);
    expect(ifaceMembers('MyLinkItem').sort()).toEqual(served);
    expect(DTS).not.toMatch(/^ {2}myLinks: string\[\];$/m);
    // pos 的形状取自同文件 :209 的构造点(数字三元组或 null),不是数组
    expect(SC).toMatch(/obj\.pos[\s\S]{0,90}x:[\s\S]{0,40}y:[\s\S]{0,40}z:/);
    expect(memberLine('ModeNamespace', 'myLinks')).toBe('MyLinkItem[]');
  });

  it('CustomLinkItem 的成员集合 ≡ 服务端 customLinks 裁剪出的键', () => {
    const served = servedKeys(/customLinks\.map\(l => \(\{([^}]*)\}\)\)/, 'customLinks');
    expect(served).toEqual(['icon', 'id', 'model', 'name', 'url']);
    expect(ifaceMembers('CustomLinkItem').sort()).toEqual(served);
    expect(DTS).not.toMatch(/^ {2}customLinks: string\[\];$/m);
    expect(memberLine('ModeNamespace', 'customLinks')).toBe('CustomLinkItem[]');
  });

  it('hangOne 的参数个数 ≡ paintings.js 定义的形参个数,且返回值不是 void', () => {
    const pj = read('src/gallery/paintings.js');
    const def = pj.match(/function hangOne\(([^)]*)\)/);
    expect(def, 'paintings.js 里找不到 function hangOne(...)').not.toBe(null);
    const wrote = def[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    expect(wrote).toEqual(['mU', 'caption', 'aura']);
    expect(pj).toMatch(/ctx\.gallery\.hangOne = hangOne/);
    const decl = memberLine('GalleryNamespace', 'hangOne');
    const m = decl.match(/^\((.*)\) => ([\w\s|]+)$/);
    expect(m, 'hangOne 的声明写法变了,这条钉子要跟着改: ' + decl).not.toBe(null);
    expect(m[1].split(',').length).toBe(wrote.length); // 少一个参数就是 upload.js:395 那条 TS2554
    expect(m[2].trim()).toBe('Group'); // 写成 void 等于宣布"路标读不到 userData"
    expect(pj).toMatch(/\n {2}return g;\n\}/); // 写入方确实有返回
  });

  it('flyAudio 指向 HTMLAudioElement(唯一写入方 peaks.js 的 new Audio)', () => {
    const pk = read('src/kunlun/peaks.js');
    expect(pk).toMatch(/const flyAudio = new Audio\(/);
    expect(pk).toMatch(/ctx\.kunlun\.flyAudio = flyAudio/);
    expect(memberLine('KunlunNamespace', 'flyAudio')).toBe('HTMLAudioElement | null');
    expect(DTS).not.toMatch(/^ {2}flyAudio: unknown;$/m);
  });

  it('.js 里不许出现泛型实参写法(checkJs 会把 < 读成断言/比较)', () => {
    // querySelectorAll<HTMLButtonElement>(…) 这类写法在 .ts 里对,在 .js 里会报
    // TS2365「Operator '<' cannot be applied」—— 本刀差点把它当成"类型修好了"。
    const bad = [];
    const dir = path.join(ROOT, 'src');
    for (const rel of fs
      .readdirSync(dir, { recursive: true })
      .filter((f) => typeof f === 'string' && /\.js$/.test(f))
      .map((f) => String(f).replace(/\\/g, '/'))) {
      const src = read(path.join('src', rel));
      // 先把 // 注释剥掉再扫:文件里"为什么不能用泛型"的说明本身就带着这个写法,
      // 不剥就等于让注释去撞自己的闸门(本仓的注释密度高,这类自撞不止一次)。
      const code = src.replace(/^[ \t]*\/\/.*$/gm, '');
      if (
        /\.\w+<(?:NodeListOf|HTMLMediaElement|HTMLButtonElement|HTMLInputElement)\s*>\s*\(/.test(
          code
        )
      )
        bad.push(rel);
    }
    expect(bad, '这些文件用了 .js 里不可解析的泛型实参(改成 JSDoc cast)').toEqual([]);
  });
});

describe('2026-10-15 第五刀:被写成 `() => void` 的成员,参数表 ≡ 写入方', () => {
  // 这一簇不是"形状窄了",是**参数表**在说谎:声明收 0 个参数、返回 void,实现收 1~2 个、返回 boolean,
  // 而拆场景时还会把成员置成 null。后果按站点计:每个"先判存在再调用"的消费点同时吃两条错
  // (TS2554 参数数 + TS1345「void 不能测真值」),`eternalKeepOut` 一条声明咬住 7 个文件 14 条,
  // `modeToast` 一条咬住 9 个文件 9 条,写入方自己还要各报一条 TS2322(实现赋不进声明)。
  // 所以这里钉三件事:参数个数、能不能返回真值、会不会被置 null —— 全部从写入方取。
  const TABLE = [
    ['KunlunNamespace', 'eternalKeepOut', 'src/kunlun/eternal.js'],
    ['KunlunNamespace', 'eternalClick', 'src/kunlun/eternal.js'],
    ['KunlunNamespace', 'eternalTeleport', 'src/kunlun/eternal.js'],
    ['KunlunNamespace', 'eternalWelcome', 'src/kunlun/eternal.js'],
    ['KunlunNamespace', 'arkTeleportToPeak', 'src/kunlun/ark.js'],
    ['KunlunNamespace', 'letgoRecall', 'src/kunlun/letgo.js'],
    ['ModeNamespace', 'linkGuard', 'src/gallery/mode.js'],
    ['UINamespace', 'modeToast', 'src/gallery/mode.js'],
  ];

  /**
   * 从写入方那一行取形参个数。三种写法都要能吃:
   *   `ctx.kunlun.X = function (x, z) {`(eternalKeepOut / eternalClick / letgoRecall)
   *   `ctx.ui.X = (msg, duration) => {`(modeToast)
   *   `ctx.kunlun.X = teleport;`(eternalTeleport / eternalWelcome:同文件里找到那个具名函数再数)
   * 返回 null 表示这条锚点没认出来 —— 调用方会直接把测试判失败,不会"静默通过"。
   */
  function writerArity(file, ns, member) {
    const src = read(file);
    const direct = src.match(
      new RegExp(
        'ctx\\.' +
          ns +
          '\\.' +
          member +
          '\\s*=\\s*(?:function\\s*\\(([^)]*)\\)|\\(([^)]*)\\)\\s*=>)'
      )
    );
    if (direct) {
      const p = (direct[1] ?? direct[2] ?? '').trim();
      return p === '' ? 0 : p.split(',').length;
    }
    const ref = src.match(
      new RegExp('ctx\\.' + ns + '\\.' + member + '\\s*=\\s*([A-Za-z_$][\\w$]*)\\s*;')
    );
    if (!ref) return null;
    const fn = src.match(new RegExp('function\\s+' + ref[1] + '\\s*\\(([^)]*)\\)'));
    if (!fn) return null;
    const p = fn[1].trim();
    return p === '' ? 0 : p.split(',').length;
  }

  /** 声明里函数形状的形参个数:`((x: number, z: number) => boolean) | null` → 2,`() => void` → 0 */
  function declaredArity(decl) {
    const m = decl.match(/\(\s*([^()]*)\)\s*=>/);
    if (!m) throw new Error('声明不是函数形状,这条钉子要跟着改: ' + decl);
    return m[1].trim() === '' ? 0 : m[1].split(',').length;
  }

  for (const [ns, member, file] of TABLE) {
    it(`${member} 的声明参数个数 ≡ ${file} 写入方的形参个数`, () => {
      const decl = memberLine(ns, member);
      expect(decl, `types/ctx.d.ts 里找不到 ${ns}.${member}`).not.toBe(null);
      const wrote = writerArity(file, ns.replace(/Namespace$/, '').toLowerCase(), member);
      expect(wrote, `${file} 里认不出 ctx.${ns}.${member} 的写入方写法`).not.toBe(null);
      expect(declaredArity(decl)).toBe(wrote);
      // 写入方收参数 ⇒ 声明绝不能还是 `() => void`(那正是本刀消掉的那条谎)
      if (wrote > 0) expect(decl).not.toMatch(/^(\(\) => void)( \| null)?$/);
    });
  }

  it('可空性 ≡ 拆场路径:会被置 null 的成员必须声明成 | null', () => {
    // 恒等式两边都由源码决定:左边是"文件里有没有 `ctx.ns.m = null`",右边是"声明有没有 | null"。
    // 少一边就是漏 —— 有 `| null` 而没人置 null,等于宣布了一个运行期不存在的态;
    // 反过来(本刀之前)置了 null 却没声明,消费者那句 `if (ctx.kunlun.eternalKeepOut)` 就成了无根据的守卫。
    const NULLABLE = [
      ['src/kunlun/eternal.js', 'eternalClick', true],
      ['src/kunlun/eternal.js', 'eternalTeleport', true],
      ['src/kunlun/eternal.js', 'eternalWelcome', true],
      ['src/kunlun/eternal.js', 'eternalKeepOut', true],
      ['src/kunlun/ark.js', 'arkTeleportToPeak', true],
      ['src/kunlun/letgo.js', 'letgoRecall', true],
      ['src/gallery/mode.js', 'linkGuard', false],
      ['src/gallery/mode.js', 'modeToast', false],
    ];
    for (const [file, member, isNull] of NULLABLE) {
      const ns = TABLE.find((t) => t[1] === member)[0];
      const assignsNull = new RegExp('ctx\\.\\w+\\.' + member + '\\s*=\\s*null\\b').test(
        read(file)
      );
      expect(assignsNull, `${file} 里 ${member} 的置 null 情况变了(钉子要跟着改)`).toBe(isNull);
      const decl = memberLine(ns, member);
      expect(decl.endsWith('| null'), `${member} 的声明可空性不对: ${decl}`).toBe(isNull);
    }
  });

  it('返回真值的三个成员不再被声明成 void', () => {
    // 这三个的返回值就是它们的用途:消费者靠它决定"要不要继续往下走"。
    // 写成 void 之后,TS 认为 `if (ctx.kunlun.eternalKeepOut(...))` 是在测一个 void —— 报 TS1345,
    // 而下一个人会以为"这行代码有问题",实际代码是对的。
    for (const m of ['eternalKeepOut', 'letgoRecall'])
      expect(memberLine('KunlunNamespace', m)).toMatch(/\) => boolean\)/);
    expect(memberLine('ModeNamespace', 'linkGuard')).toBe('(linkKey: string) => boolean');
    const pj = read('src/gallery/paintings.js');
    expect(pj).toMatch(/if \(ctx\.mode\.linkGuard && ctx\.mode\.linkGuard\(linkKey\)\) return;/);
    // 死参数不许靠"把声明改成两个参数"来消错:实现只有一个形参
    expect(read('src/gallery/mode.js')).toMatch(/function linkGuard\(linkKey\) \{/);
    expect(read('src/kunlun/eternal.js')).toMatch(
      /ctx\.kunlun\.eternalKeepOut = function \(x, z\) \{\r?\n {2}return inHall\(x, z\);/
    );
  });

  it('modeToast 的每个调用点传的实参个数不超过声明', () => {
    // 声明从 1 参修成 2 参(可选)之后,这条钉的是**另一边**:以后谁加第三个实参,
    // 要么先改写入方,要么先改声明,不能悄悄多传。
    const decl = memberLine('UINamespace', 'modeToast');
    expect(decl).toBe('(msg: string, duration?: number) => void');
    const arity = declaredArity(decl);
    const bad = [];
    for (const rel of fs
      .readdirSync(path.join(ROOT, 'src'), { recursive: true })
      .filter((f) => typeof f === 'string' && /\.(js|mjs)$/.test(f))
      .map((f) => String(f).replace(/\\/g, '/'))
      .filter((f) => !f.startsWith('__tests__/'))) {
      const code = read(path.join('src', rel)).replace(/^[ \t]*\/\/.*$/gm, '');
      const re = /\.modeToast\s*\(/g;
      let m;
      while ((m = re.exec(code))) {
        const n = countArgs(code, re.lastIndex);
        if (n > arity)
          bad.push(`${rel}:${code.slice(0, m.index).split(/\r?\n/).length} 传了 ${n} 个`);
      }
    }
    expect(bad, '这些调用点传得比 modeToast 的声明还多').toEqual([]);
  });

  /** 从 `(` 之后扫到配对的 `)`,数顶层逗号(空参算 0) */
  function countArgs(src, openAt) {
    let depth = 1;
    let i = openAt;
    let commas = 0;
    let seen = false;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) depth--;
      else if (depth === 1 && c === ',') commas++;
      if (depth > 0 && c !== ' ' && c !== '\n' && c !== '\t' && c !== ')' && c !== ',') seen = true;
      i++;
    }
    return seen ? commas + 1 : 0;
  }

  it('kintsugiOn 是函数,不是布尔(写入方 return 的是 enableKintsugi)', () => {
    expect(memberLine('SceneNamespace', 'kintsugiOn')).toBe('() => void');
    const sc = read('src/scene/scene.js');
    expect(sc).toMatch(/ctx\.scene\.kintsugiOn = setupKintsugi\(/);
    const k = read('src/scene/kintsugi.js');
    expect(k).toMatch(/function enableKintsugi\(\)/);
    expect(k).toMatch(/return enableKintsugi;/);
    expect(DTS).not.toMatch(/^ {2}kintsugiOn: boolean;$/m);
  });

  it('SpiritItem 的成员集合 ≡ spirits.js 里 SPIRITS.map 交出去的键', () => {
    expect(memberLine('KunlunNamespace', 'spiritsState')).toBe('() => SpiritItem[]');
    expect(DTS).not.toMatch(/^ {2}spiritsState: unknown\[\];$/m);
    const sp = read('src/kunlun/spirits.js');
    const m = sp.match(
      /function spiritsState\(\)[\s\S]{0,600}?return SPIRITS\.map\(\(sp, i\) => \(\{([\s\S]*?)\}\)\);/
    );
    expect(m, 'spirits.js 里 function spiritsState() 的写法变了,这条钉子要跟着改').not.toBe(null);
    const wrote = m[1]
      .split(/\r?\n/)
      .map((l) => l.match(/^ {4}([A-Za-z_$][\w$]*)\s*:/))
      .filter(Boolean)
      .map((x) => x[1])
      .sort();
    expect(wrote).toEqual(['color', 'emotion', 'en', 'name', 'place', 'state']);
    expect(ifaceMembers('SpiritItem').sort()).toEqual(wrote);
    // 星球岛那版是**再包一层**,装饰器必须原样带过其余字段(@template),否则返回值只剩 name/en/place,
    // 赋不进 `() => SpiritItem[]`(planets.js:861 的 TS2322 就是这么来的)。
    const st = read('src/shared/story-progress.mjs');
    expect(st).toMatch(/@template \{Object\} T/);
    expect(st).toMatch(/@param \{\?T\[\]\} arr/);
    expect(st).toMatch(/@returns \{T\[\]\}/);
  });

  it('全仓不许再出现"声明 () => void 而写入方收参数"的成员(防这一类重新长回来)', () => {
    // 这一条是本刀的闸门:上面那些是逐个人的钉子,这条是**类**的钉子。
    // 只认直接赋函数/箭头的写法(`ctx.ns.X = function (a…)` / `= (a…) =>`),
    // 标识符转发与 Object.assign 那种写法这里看不住,由各自的逐条钉子负责。
    const offenders = [];
    const nsOf = {};
    let curIface = '';
    for (const line of DTS.split(/\r?\n/)) {
      const head = line.match(/^export interface ([A-Za-z_$][\w$]*)/);
      if (head) {
        curIface = head[1];
        continue;
      }
      const m = line.match(/^ {2}([A-Za-z_$][\w$]*)[*?]?:\s*\(\(\) => void\)( \| null)?;$/);
      if (m && curIface) nsOf[m[1]] = curIface;
    }
    for (const rel of fs
      .readdirSync(path.join(ROOT, 'src'), { recursive: true })
      .filter((f) => typeof f === 'string' && /\.(js|mjs)$/.test(f))
      .map((f) => String(f).replace(/\\/g, '/'))
      .filter((f) => !f.startsWith('__tests__/'))) {
      const src = read(path.join('src', rel));
      const re =
        /ctx\.(\w+)\.([A-Za-z_$][\w$]*)\s*=\s*(?:function\s*\(([^)]*)\)|\(([^)]*)\)\s*=>)/g;
      let m;
      while ((m = re.exec(src))) {
        const [, nsKey, member, p1, p2] = m;
        const iface = nsOf[member];
        if (!iface) continue;
        const p = (p1 ?? p2 ?? '').trim();
        const n = p === '' ? 0 : p.split(',').length;
        const wantNs = iface.replace(/Namespace$/, '').toLowerCase();
        // 命名空间也要对上:同名成员挂在别的 ns 上不冤枉它
        if (n > 0 && wantNs === nsKey)
          offenders.push(`${iface}.${member} ← ${rel}(写入方 ${n} 个形参)`);
      }
    }
    expect(offenders, '这些成员被声明成 () => void,但写入方收参数').toEqual([]);
  });
});

describe('video-wall.js 的 playVideo 句柄有类型可用(注释级,不动运行期)', () => {
  const vw = read('src/scene/media/video-wall.js');

  it('存在 TaggedVideo typedef,四个句柄都在其中', () => {
    expect(vw).toMatch(/@typedef \{HTMLVideoElement & \{/);
    for (const k of ['_vGen', '_vEndedFn', '_vCanPlayFn', '_vPollId']) {
      expect(vw).toContain(k);
    }
  });

  it('playVideo 的 @param 用 TaggedVideo,而不是裸 HTMLVideoElement', () => {
    const m = vw.match(/@param \{([^}]+)\} el - 视频元素/);
    expect(m && m[1]).toBe('TaggedVideo');
  });

  it('句柄字段只在 playVideo 内使用,没有扩散成第二个记账点', () => {
    // 这些下划线字段挂 DOM 元素上是有意的设计(下一次 playVideo 靠它们摘上一轮的监听器),
    // 但只允许 video-wall 这一处;别处再挂一份就会变成"谁在管这个 <video>"的第二答案。
    // 只扫 src 下的**运行期**模块(__tests__ 里出现这个词是断言本身,不算记账点)
    const hits = [];
    for (const rel of fs
      .readdirSync(path.join(ROOT, 'src'), { recursive: true })
      .filter((f) => typeof f === 'string' && /\.js$/.test(f))
      .map((f) => String(f).replace(/\\/g, '/'))
      .filter((f) => !f.startsWith('__tests__/'))) {
      if (read(path.join('src', rel)).includes('_vCanPlayFn')) hits.push(rel);
    }
    expect(hits).toEqual(['scene/media/video-wall.js']);
  });
});
