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
