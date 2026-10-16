/**
 * dream-gallery 核心类型声明
 * 基于 src/ctx.js, src/engine.js, src/loop.js, src/events.js 的 JSDoc + 运行时分析
 */

import type {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Raycaster,
  Vector2,
  Vector3,
  Object3D,
  TextureLoader,
  CanvasTexture,
  VideoTexture,
  BufferAttribute,
  PointLight,
  Light,
  Mesh,
  Group,
  Material,
  MeshStandardMaterial,
  Intersection,
} from 'three';
// 世界管理器的**真实类**(src/core/scene-manager.js:55 导出)。用 import 类型而不是另写一份
// interface:2026-10-15 核实,`worldManager?: unknown` 一条声明压着 16 条 TS2339
// (getWorld 9 / back 4 / transitioning 2 / enter 1),而那些方法**本来就在类上**
// (registerWorld/enter/back/toMain/transitioning/…) —— 手写接口只会和类各漂各的,
// 拿类本身当权威则不可能漂。
// 对照:本文件里其它 `: unknown` 成员(`planeApi/foxApi/scrollLink/audioManager/loopManager`)
//   仍旧是 unknown,它们的唯一权威是各模块里的对象字面量,没有现成的类型可指。手写一份形状
//   = 再造一条没人钉的声明,而 `mA: Material[]` 就是这条路的下场(见 MediaNamespace.mA)。
//   要收它们得连"声明 ≡ 写入方"的钉子一起写,那是独立一批。
import type { SceneManager } from '../src/core/scene-manager.js';

// ===================== 命名空间类型 =====================

export interface SceneNamespace {
  s: Scene;
  cam: PerspectiveCamera;
  rnd: WebGLRenderer;
  ray: Raycaster;
  mP2: Vector2;
  iG: Object3D[];
  tL: TextureLoader;
  loadTexCapped: (url: string, onLoad?: (tex: CanvasTexture) => void) => CanvasTexture;
  bounds: Array<{ mnX: number; mxX: number; mnZ: number; mxZ: number }>;
  WH: number;
  OL: number;
  OR: number;
  OT: number;
  OBE: number;
  OBR: number;
  IL: number;
  IR: number;
  IRT: number;
  IRB: number;
  floorW: number;
  floorD: number;
  bW: number;
  bD: number;
  pyrHeight: number;
  groundUniforms: Record<string, unknown>;
  skyUniforms: Record<string, unknown>;
  pls: Array<{ l: PointLight }>;
  ambL: Light;
  hemiL: Light;
  L: HTMLElement;
  // —— 运行期挂载(2026-09-20 对齐实际代码) ——
  renderPostProcessing?: () => void;
  resizePostProcessing?: (w: number, h: number) => void;
  activeWorld?: string;
  worldManager?: SceneManager;
  worldStack?: unknown[];
  enterWorld?: (id: string, opts?: unknown) => unknown;
  leaveWorld?: (opts?: unknown) => unknown;
  toMainWorld?: (opts?: unknown) => unknown;
  worldChanged?: (fn: (...a: unknown[]) => void) => void;
  getActiveRoot?: () => unknown;
  getActiveGround?: (x: number, z: number) => unknown;
  getActiveBounds?: () => unknown;
  setTime?: (h: number) => void;
  loopManager?: unknown;
  setLowQuality?: (on: boolean) => void;
  startWorld?: () => Promise<void>;
  jT: HTMLElement;
  jB: HTMLElement;
  aB: HTMLElement;
  avatar: Group;
  /**
   * 金缮效果的**启动函数**,不是布尔。写入方 `src/scene/scene.js:769
   * ctx.scene.kintsugiOn = setupKintsugi(roof, roofThick)`,而 `src/scene/kintsugi.js:9`
   * 那个 setup 走到末尾 `return enableKintsugi`(:38 起定义的无参函数)。
   * 原先声明成 `boolean` 是把 kintsugi.js 里那个**模块内同名局部变量** `let kintsugiOn = false`(:36)
   * 当成了 ctx 成员 —— 于是两个真消费者(sky-progress.js:205 / :215「100 档触发金缮」)报
   * TS2349「This expression is not callable」,而写入方自己报 TS2322。
   */
  kintsugiOn: () => void;
  // ↓ 2026-10-14 补齐(同 KunlunNamespace:声明落后于 src/ctx-scene.js 的 properties 数组)。
  /** 画廊布局常量表 —— 建造几何/碰撞边界/探针坐标共用的单一源,挂的是 scene/layout.mjs 的 LAYOUT ← scene/scene.js:183 */
  layout: {
    outerWest: number;
    outerEast: number;
    outerNorth: number;
    outerSouthEx: number;
    outerSouth: number;
    ceilingHeight: number;
    innerWest: number;
    innerEast: number;
    innerNorth: number;
    innerSouth: number;
  };
  /** 碰撞盒加入门面(外部模块不再直接 push 内部数组)← scene.js:192 */
  addBounds: (list: Array<{ mnX: number; mxX: number; mnZ: number; mxZ: number }>) => void;
  /** 碰撞盒移除门面(B4 整改)← scene.js:186 */
  removeBounds: (list: Array<{ mnX: number; mxX: number; mnZ: number; mxZ: number }>) => void;
  /** 这四条是"探针/调试门面"槽位:由各自系统在装配时挂上、卸载时置 null
   *  (plane-flight.js:545 / scene10-fox.js:494 / earth-day.js:407 / ending-journey.js:713)。
   *  **刻意不临摹对象形状**:今天没有被 checkJs 覆盖的读取方,而临摹错了比不写更坏(它会开始给
   *  消费方一个假的保证)。真要上类型,请顺手把消费方一起加进 tsconfig.checkjs.json 的 include。 */
  planeApi: unknown;
  foxApi: unknown;
  earthDayApi: unknown;
  endingApi: unknown;
  /** properties 数组里列着,但 2026-10-14 全仓实查**既无赋值点也无读取点**的槽位。
   *  记在这里是为了"数组与声明不许漂"那条测试能过 —— 这不是"死代码可删"的结论。 */
  getActiveAtmosphere: unknown;
}

export interface PlayerState {
  p: Vector3;
  y: number;
  pi: number;
  r: number;
  vy: number;
  onGround: boolean;
  gliding: boolean;
  glideEnergy: number;
  /**
   * 以下四条是**太空(非主世界)那一套**的键输入票据,不是装饰:
   * 写入方全部在 `src/scene/player.js` 的 `tickPhysics()`(非主世界把主世界物理整套短路后,
   * 把跳跃/下降键转成交给 planets.js 消费的四个字段),读取方是 `src/kunlun/planets.js:774-819`
   * (太空移动分支读两条 `*T` 做爆发衰减、读两条 `space*` 做持续升降,并在松键时清零)。
   * 2026-10-15 之前这里只声明到 `glideEnergy`,于是 planets.js 读它们各报一次 TS2339(共 10 条)。
   */
  /** 上升爆发剩余时长(秒):按下跳跃键瞬间置 0.3,planets.js 每帧递减 —— ← player.js:152 */
  boostT: number;
  /** 下降爆发剩余时长(秒):按下下降键瞬间置 0.3 —— ← player.js:157 */
  boostDownT: number;
  /** 跳跃键是否按住(持续上升)—— ← player.js:155 */
  spaceUp: boolean;
  /** 下降键是否按住(持续下降)—— ← player.js:160 */
  spaceDown: boolean;
}

export interface PlayerNamespace {
  playerSM?: { current?: { name?: string }; change(state: unknown): void; tick(dt: number): void };
  orbit?: { yaw: number; pitch: number; dist: number };
  jumpHold?: boolean;
  pl: PlayerState;
  jD: { x: number; z: number };
  ks: Record<string, boolean>;
  mv: (dx: number, dz: number, dt: number) => void;
  // (原 `drM: () => void;` 已删,2026-10-14:properties 数组里没有 drM ⇒ 代理上没这个成员。
  //   它是旧别名时代(scripts/gen/ctx-alias-codemod.js)留下的过期声明,真名是下面的 drawMap;
  //   全仓除了那条 codemod 清单与一句探针注释之外没有任何读写点。)
  /** 小地图每帧重画 ← src/scene/minimap.js:500(Object.assign 挂点在同文件末尾) */
  drawMap: () => void;
  /** 跳跃/滑翔/重力物理的每帧步进 ← src/scene/player.js:145,由 loop-manager.js:318 取用 */
  tickPhysics: (dt: number) => void;
  viewMode: number;
  quizPassed: boolean;
  quizPassScore: number;
}

/**
 * 沙海表面对象 `ctx.media.desert` 的真实形状。
 * 每一项都对着**定义处**抄,不是想象中的接口(改地形/大气时请同步这里):
 *   - `getH` ← `src/scene/desert/terrain.js:93` `export const getH = function (x, z)`
 *   - `update` ← `src/scene/desert.js:7` `function update(dt, time)`;调用点 `loop-manager.js:331`
 *   - `kunlun` ← 昆仑巅平面坐标 `{ x: KX, z: KZ }`(`desert.js:22`),消费者拿它算离山巅的距离
 *   - `dayNight` ← `src/scene/desert/atmosphere.js:172` `export function dayNight(hour)`;调用点 `loop-manager.js:342`
 *   - `assertAboveGround` ← `src/scene/desert/terrain.js:106`,**实心山铁律的机器闸门**:
 *     摆放落点埋进山心就 console.error + toast 并返回 false(正常返回 true)
 */
export interface DesertSurface {
  getH: (x: number, z: number) => number;
  update: (dt: number, time: number) => void;
  kunlun: { x: number; z: number };
  dayNight: (hour: number) => void;
  assertAboveGround: (x: number, y: number, z: number, tag?: string) => boolean;
}

export interface MediaNamespace {
  vidEl: HTMLVideoElement;
  v45El: HTMLVideoElement;
  vidTex: VideoTexture;
  v45Tex: VideoTexture;
  vidMesh: Mesh;
  v45Mesh: Mesh;
  drawMusicCanvas: () => void;
  bigScreenHold: boolean;
  /**
   * 沙海表面对象。⚠️原先这里只写了 `{ getH }` 一个成员 —— 而**唯一写入方**
   * `src/scene/desert.js:22` 交出去的是 5 个成员,于是消费者每次读 `kunlun` / `assertAboveGround`
   * / `update` / `dayNight` 都报 TS2339(12 条),而且 `desert.js` 自己那行字面量还被判
   * "Object literal may only specify known properties"(TS2353)——声明比运行时窄,报错的是消费者。
   * 形状逐项取自真实定义处,消费侧实测只用到这五个(`desert.getH` 23 / `desert.kunlun` 7 /
   * `desert.assertAboveGround` 4 / `desert.update` 1 / `desert.dayNight` 1)。
   */
  desert: DesertSurface;
  dayHour: number;
  updateFireworks: () => void;
  pG: BufferAttribute;
  pC: number;
  signMesh: Mesh;
  signMat: Material;
  // ⚠️这里原先还有 `wb: Mesh;` 与 `ytHeart: Mesh;` 两条,2026-10-14 删掉:`src/ctx-media.js` 的
  //   properties 数组里没有这两个名字 ⇒ 代理上根本没有这对 getter/setter,写了就是 undefined
  //   (对象还是 Object.freeze 过的,赋值更会直接 TypeError)。它们只是旧 codemod
  //   (scripts/gen/ctx-alias-codemod.js)时代留下的**过期声明**,全仓没有任何读写点。
  //   现在由 src/__tests__/types-ctx-drift.test.js 双向钉死:接口成员 ≡ 运行时数组,不多也不少。
  mpMesh: Mesh;
  mpMat: Material;
  guideMesh: Mesh;
  scrollLink: unknown;
  /**
   * 背景音乐元素(HTML5 Audio)。2026-10-15 核实:properties 数组里这一项的**唯一写入方**是
   * src/scene/media/audio-manager.js:96 `let mA = new Audio()` → :187 `ctx.media.mA = mA`,
   * 三个读取方(audio-manager.js:174~197、video-wall.js:282、upload.js:229)一律按
   * HTMLAudioElement 用(.paused / .pause / .play)。原先声明成 `Material[]` 是照抄
   * src/ctx.js 的人类可读注释「houseMats/mA 房屋材质分组」—— 那行把媒体命名空间的 mA
   * 和 gallery 的 houseMats 当成同一件事,注释与声明一起错。
   * checkJs 的 TS2740(audio-manager.js:187「HTMLAudioElement 缺 Material[] 的 29 个成员」)
   * 正是这条假声明自己报出来的矛盾,不是代码写错。
   */
  mA: HTMLAudioElement;
  audioManager: unknown;
  // ↓ 2026-10-14 补齐(同 KunlunNamespace:声明落后于 properties 数组),形状取自真实赋值点。
  /** 启动音视频序列(需用户手势)← src/scene/media/video-wall.js:339 挂 triggerSequence */
  startVidSeq: () => void;
  /** 播放第 i 条画廊音轨 ← src/scene/media/gallery-audio.js:83 */
  playGalleryAudio: (i: number) => Promise<void>;
  /** 当前(或补间中)的日照小时 ← src/scene/time-shift.js:32,38 */
  dayTimeSource: () => number;
}

export interface GalleryNamespace {
  paintGroups: Group[];
  onC3D: (intersection: Intersection) => void;
  zoomOut: () => void;
  /** 画框飞入放大 ← src/gallery/painting-zoom.js:20(挂点 paintings.js:657) */
  zoomIn: (cg: Group) => void;
  zG: Group | null;
  /**
   * 挂一幅画并返回那个画框 Group。**唯一写入方 `src/gallery/paintings.js:309`,三个参数**:
   * `(mU 路径, caption 配文, aura 气质归类或 null)`;返回 `hangOn()`/`takeoverEmpty()` 建出的 `Group`
   * (后者只在拿到空框时返回,拿不到就走前者新建 ⇒ 不会返回 null)。
   * ⚠️原先声明成 `(url: string) => void`:参数少两个 ⇒ 调用方 `upload.js:395` 报 TS2554,
   * 返回写成 void ⇒ 紧接着 `upload.js:399` 读 `g.userData.ox/oy/oz`(路标起点)报 3 条 TS2339。
   * 那四条都是声明的错:`ctx.mode.myUploads.push(name)` 之后立刻要靠这个 Group 拉金色路标。
   */
  hangOne: (url: string, caption: string, aura: string | null) => Group;
  /**
   * 房屋可染色材质分组:键 = wall / base / deco / ceil。
   * 2026-10-15 核实:唯一写入方 src/scene/scene.js:913 挂的是**对象**(:206 建,四组元素
   * 全是 MeshStandardMaterial,:216 push 墙共享材质、:762 push 屋顶两块),原先声明的
   * `Material[]` 与之矛盾 ⇒ housecolor.js:55 按组名 `houseMats[g]` 取数组、:121/:125 取
   * `.wall` 全在报错(那两条 TS2339 是声明的错,不是取法的错)。
   * 用 Record 而不是四个具名键,因为 housecolor.js 按 GROUPS 表以 string 索引;
   * 四组的实际键名见 src/scene/scene.js:206 与 src/gate/housecolor.js 的 GROUPS。
   */
  houseMats: Record<string, MeshStandardMaterial[]>;
  openHouseColor: () => void;
  /** 审查#10(2026-10-08):墙体 InstancedMesh 化后的挂画墙清单(scene.js 直供)。挂画只依赖 position/rotation.y/userData._half */
  wallSpecs: {
    position: { x: number; y: number; z: number };
    rotation: { y: number };
    userData: { _half: number };
  }[];
}

/**
 * 访客自己的链接 —— **唯一写入方 = 服务端裁剪**:`lib/siteconfig.js:89`
 * `.map(l => ({ id, name, url, model, pos }))`(客户端只可能收到这五个键,`aid/dk/ts` 不下发)。
 * `pos` 的形状取同文件 `:209`:`{x,y,z}|null`(数字,不是数组)。
 * ⚠️原先这里写的是 `string[]` —— 那是**比运行时窄**的假声明:消费方 `mode.js:325` 读 `l.pos.x`、
 * `upload.js:508` 读 `l.name`、`:523` 读 `l.id`,三条 TS2339 报的是声明的错,不是取法的错。
 * 钉子:`src/__tests__/types-link-contract.test.js`(声明成员集合 ≡ 服务端 map 出来的键集合)。
 */
export interface MyLinkItem {
  id: string;
  name: string;
  url: string;
  model: string;
  pos: { x: number; y: number; z: number } | null;
}

/**
 * 后台配置的展示区链接 —— **唯一写入方 = `lib/siteconfig.js:96`**
 * `.map(l => ({ id, name, url, icon, model }))`;四个字符串由 `POST /api/admin/links` 一律
 * `String(...).trim()` 生成(同文件 `:148-154`),`icon` 可能是空串(空=挂模型而非原图案)。
 * 消费者:`mode.js:106/313`(`l.icon` 真值判定)、`linkSigOf`(`l.model || 'sphere'`)。
 */
export interface CustomLinkItem {
  id: string;
  name: string;
  url: string;
  icon: string;
  model: string;
}

export interface ModeNamespace {
  siteMode: 'normal' | 'special';
  demoPhotos: string[];
  myUploads: string[];
  myLinks: MyLinkItem[];
  customLinks: CustomLinkItem[];
  myUploadTokens: Record<string, string>;
  myCaptions: Record<string, string>;
  applyPaintMode: () => void;
  applyMode: () => void;
  refreshMode: () => void;
  /** 链接实体按 id 增量对齐(2026-10-11 DG-GPU-001:未变保留/移除才 dispose/新增才 spawn) */
  renderCustomLinks: () => void;
  applyTexGate: () => void;
  texAllowed: ((url: string) => boolean) | null;
  /**
   * 链接门禁。2026-10-15 从 `() => void` 改成真实形状:写入方 `src/gallery/mode.js:172
   * function linkGuard(linkKey)` 明确 `return true / false`(注释:"返回 true = 已接管"),
   * 唯一消费方 `src/gallery/paintings.js:595` 正是拿它做真值判断并 `return`。
   * 原先声明成 void 让那行同时报 TS2554 + TS1345;而那行**多传**的第二个实参 `cg`
   * 是实现里根本不存在的死参数,已按声明删掉(不是把声明改成两个参数去迁就写错的调用)。
   */
  linkGuard: (linkKey: string) => boolean;
  spawnLinkModel: (type: string, url: string) => Object3D;
  trackClick: (linkId: string) => void;
  LINK_MODEL_TYPES: string[];
  MOUNTABLE_ICONS: string[];
  openUpload: () => void;
}

/**
 * 一颗灵蕴在罗盘页上的呈现。逐项取自**唯一原始写入方**
 * `src/kunlun/spirits.js:467 function spiritsState()` 的 `SPIRITS.map(...)` 字面量。
 * `state` 实际只会是 'got' / 'open' / 'locked' 三种,但那里是 map 回调里的三元表达式,
 * TS 会把它推成 `string`(没有 as const),所以声明也只能写 string —— 写成语字面量联合
 * 等于让写入方自己报错。星球岛那版是把上面这个函数**再包一层**
 * (`src/kunlun/planets.js:861` 用 decorateSpiritsState 覆盖 name/en/place),所以两个写入方
 * 都得能赋进同一个声明,这也是这条钉子要比「形状对不对」而不是「谁先写」的原因。
 */
export interface SpiritItem {
  name: string;
  en: string;
  emotion: string;
  color: string;
  place: string;
  state: string;
}

export interface KunlunNamespace {
  flightLock: boolean;
  eternalHandlers: Record<string, (...args: unknown[]) => void>;
  /**
   * ↓ 这六条 2026-10-15 一起改:原先全写成 `() => void`,而实现收参数、有的还返回值、拆场景时会被置
   *   null。声明收 0 参 ⇒ 每个「先判存在再调用」的消费点同时报两条错(TS2554 参数数 + TS1345
   *   「void 不能测真值」),eternalKeepOut 一条就咬住 7 个文件 14 条。形状逐项取自真实写入方:
   *   eternal.js:687 `function (cg)`(cg 取调用方 paintings.js:516 的 `hs[0].object`,是 Object3D)、
   *   eternal.js:653 `function teleport(intoHall)`(只被传 true/false)、eternal.js:639 `welcome()`、
   *   eternal.js:29 `function (x, z) { return inHall(x, z); }`、ark.js:753 `function ()`、
   *   letgo.js:150 `function (name) { … return false / true }`。
   *   null 来自各文件的 bag.custom 拆场路径(eternal.js:756~761、ark.js:912、letgo.js:243)。
   */
  eternalClick: ((cg: Object3D) => void) | null;
  eternalTeleport: ((intoHall: boolean) => void) | null;
  eternalWelcome: (() => void) | null;
  eternalKeepOut: ((x: number, z: number) => boolean) | null;
  groundOverride: ((x: number, z: number) => number | null) | null;
  arkTeleportToPeak: (() => void) | null;
  letgoRecall: ((name: string) => boolean) | null;
  peakVidEl: HTMLVideoElement | null;
  /**
   * 飞舟/山峰背景音乐元素。**唯一写入方 `src/kunlun/peaks.js:49 const flyAudio = new Audio(...)`
   * → `:50 ctx.kunlun.flyAudio = flyAudio`**(那行的注释就写着"上传提示音需要暂停它")。
   * 原先是 `unknown` ⇒ 消费者 `upload.js:233` 把它塞进媒体 Set 时报 "unknown 不能赋给 Element",
   * 紧接着 `:236/:237` 的 `.paused`/`.pause()` 全部落在 Element 上而报错。
   * 留 `| null`:peaks.js 是后台链模块,上传面板可能先于它装配,而 `upload.js` 那边本来就是
   * `if (m) all.add(m)` 带守卫的写法。
   */
  flyAudio: HTMLAudioElement | null;
  spiritsGot: () => number;
  isDone: () => boolean;
  // 形状按**两个写入方**裁决:spirits.js:490 返回 {x,z,name,color},星球模式转交 planetsMark(同形状,见 :421)。
  // 原声明只有 {x,z} ⇒ 小地图读 mk.color / mk.name 各被判成"字段不存在"(2026-10-16 第七刀,同一批 desert 那案的形状)。
  spiritMark: () => { x: number; z: number; name: string; color: string } | null;
  spiritsTTS: string[];
  /**
   * 2026-10-15 从 `unknown[]` 改成函数:它和上一行 `isDone: () => boolean` 出自**同一个**
   * `Object.assign(ctx.kunlun, { spiritsState, isDone, ... })`(spirits.js:493~498),
   * 只有它被写成了数组。后果是消费者 `spirit-page.js:19` 的
   * `ctx.kunlun.spiritsState ? ctx.kunlun.spiritsState() : []` 报 TS2349「不可调用」,
   * 而包装方 `planets.js:861` 报 TS2322 —— 数组形状连"能不能调用"都答错了。
   */
  spiritsState: () => SpiritItem[];
  checkSkyMs: () => void;
  fadeTeleport: (target: Vector3, yaw: number) => void;
  rebuildEternalPicks: () => void;
  // ↓ 2026-10-14 补齐:下面这些名字一直在 `src/ctx-kunlun.js` 的 properties 数组里(运行时有效),
  //   是这个**手工维护**的声明文件落后于运行时 ⇒ 那 36 条 TS2339 是"声明缺口",不是代码有病。
  //   形状取自真实赋值点(文件:行都标出来了),不是猜的。漂移由 src/__tests__/types-ctx-drift.test.js 拦。
  /** 章节推进(只前进不回退,封顶 6)← src/kunlun/planets.js:606 */
  setChapter: (n: number) => void;
  /** 藏起"新芽"星屑 ← planets.js:616 */
  hideSproutMote: () => void;
  /** 通用藏星屑(key 与 PLANETS 同序)← planets.js:621 */
  hidePlanetMote: (key: string) => void;
  /** 星门现身,只进不出 ← planets.js:627 */
  revealStarGate: () => void;
  /** 星门是否已现身(portal.js 凭它决定按钮与自动传送)← planets.js:632 */
  isStarGateOut: () => boolean;
  /** 小地图当前目标(星门或当前岛),没有目标时 null ← planets.js:866 */
  planetsMark: () => { x: number; z: number; name: string; color: string } | null;
  /** 星球岛模式:沙漠光柱系统休眠、questActive 恒真 ← planets.js:198 */
  planetsMode: boolean;
  /** 星球岛拾星屑入口,复用 spirits 的反馈/库存/终章 ← src/kunlun/spirits.js:500(Object.assign) */
  spiritsCollectExternal: (extKey?: string, extLine?: string) => void;
  /** 当前未收集星屑 key ← spirits.js:501 */
  spiritsNextKey: () => string | null;
}

export interface OverlayRegisterOpts {
  display?: string;
  escapable?: boolean;
  closeOnOutside?: boolean;
  touchOnly?: boolean;
  canClose?: (reason: 'esc' | 'outside' | 'x' | 'api') => boolean;
  onOpen?: () => void;
  onClose?: (reason: string) => void;
  x?: string | null;
}

export interface OverlayHandle {
  open(): void;
  close(): void;
  isOpen(): boolean;
  unregister(): void;
}

export interface OverlayAPI {
  /** 注册即得弹层三铁律(✕ 事件委托 + 点外圈 + Esc 栈);冷核心 src/ui/overlay.js */
  register: (el: HTMLElement, opts?: OverlayRegisterOpts) => OverlayHandle;
  anyOpen: () => boolean;
  isUiTouch: (t: EventTarget | null) => boolean;
  /** 关闭全部已开弹层(保留注册表与 Esc 监听)——core/ui-system.js dispose 调用 */
  closeAll: () => void;
  /** 彻底销毁:清空注册表并放开常驻持有(Esc 监听随注册表归零才摘;此后 register 会重新挂回) */
  destroy: () => void;
}

export interface StoreAPI {
  num: (key: string, fallback?: number) => number;
  str: (key: string, fallback?: string) => string;
  json: <T>(key: string, fallback?: T) => T;
  flag: (key: string, fallback?: boolean) => boolean;
  /** 写入是否真的落盘(2026-10-11 DG-STATE-002:隐私模式/配额满必须可被调用方感知) */
  setNum: (key: string, value: number) => boolean;
  setStr: (key: string, value: string) => boolean;
  setJson: (key: string, value: unknown) => boolean;
  mark: (key: string) => boolean;
  unmark: (key: string) => boolean;
  /** 本会话是否发生过 localStorage 写/删失败(粘性旗;gl-lost 的「已保存」文案据此换字) */
  hasWriteFailure: () => boolean;
  /** 关键剧情 checkpoint 写失败的提示出口(装配方注入,main.js 走 ctx.ui.modeToast) */
  setCriticalWriteNotifier: (fn: ((name: string) => void) | null) => void;
  resetCriticalNotified: () => void;
  storyCheckpointKeys: () => string[];
  /** 灵蕴库存:key 白名单 + 幂等添加 + 读时清洗旧档重复/非法项 */
  getSpirits: () => string[];
  addSpirit: (key: string) => string[];
  houseColor: (group: string) => string;
  setHouseColor: (group: string, hex: string) => boolean;
  clearHouseColor: (group: string) => boolean;
  set: (key: string, value: unknown) => void;
  /** 测试钩:vitest 的 localStorage mock 直写 backing store 时手动失效内存缓存(业务代码勿用) */
  _dropCache: () => void;
}

export interface UINamespace {
  /**
   * 轻提示统一入口。2026-10-15 补第二个参数:写入方 `src/gallery/mode.js:40
   * ctx.ui.modeToast = (msg, duration) => emit('ui:toast', { text: msg, duration: duration || 2200 })`
   * —— 时长是**可选**的(实现里用 `|| 2200` 兜底),但 9 个调用点确实传了它
   * (journey-system:101 / scene2-draw:107 / late-planets:471 / scene6-king:418 /
   * scene7-tippler:337,367 / scene7-vanity:212,236,248),声明停在 1 参就是 9 条 TS2554。
   */
  modeToast: (msg: string, duration?: number) => void;
  openDialog: (opts: unknown) => void;
  dialogOpen: () => boolean;
  cancelDialogScope: (scope: string) => void;
  advanceDialog: () => void;
  portfolio: {
    open: () => void;
    count: () => number;
    thumb: (id: string) => SVGSVGElement | null;
  } | null;
  witness: {
    ask: (
      id: string,
      opts?: { target?: number }
    ) => Promise<{ skipped: boolean; value?: string; taps?: number }>;
    cancel: () => void;
  } | null;
  chapterMap: { open: () => void } | null;
  starMap: { open: () => void; close: () => void; isOpen: () => boolean } | null;
  voyage: {
    offer: (delayMs?: number, stop?: string) => void;
    open: (stop?: string) => boolean;
    next: () => string | null;
    isOpen: () => boolean;
    arrived: (world: string) => boolean;
  } | null;
  storyMusic: {
    now: () => string | null;
    cue: () => string | null;
    debug: () => { paused: boolean; volume: number; t: number } | null;
  } | null;
  storyTarget: (
    target: { world: string; x: number; z: number; en: string; zh: string } | null
  ) => void;
  journey: {
    beginTask: (
      owner: string,
      id: string,
      options?: {
        onTarget?: (point: { x: number; z: number }, index: number) => void;
        onObserve?: (point: { x: number; z: number }, index: number) => void;
      }
    ) => Promise<unknown>;
    setGoal: (
      owner: string,
      goal: {
        world: string;
        x: number;
        z: number;
        en: string;
        zh: string;
        action?: { zh: string; en: string };
        onActivate?: () => void;
      } | null
    ) => void;
    clearGoal: (owner: string) => void;
    setPhase: (
      owner: string,
      phase: {
        world: string;
        chapter: { zh: string; en: string };
        step?: number;
        total?: number;
        hint?: { zh: string; en: string };
        lock?: boolean;
      } | null
    ) => void;
    phase: () => {
      world: string;
      chapter: { zh: string; en: string };
      step?: number;
      total?: number;
      hint?: { zh: string; en: string };
      lock?: boolean;
    } | null;
    transition: (
      owner: string,
      value: {
        world: string;
        chapter: { zh: string; en: string };
        title: { zh: string; en: string };
        hint: { zh: string; en: string };
        action: { zh: string; en: string };
      }
    ) => Promise<boolean>;
    lookAtGoal: () => void;
    activateGoal: () => boolean;
    busy: () => boolean;
    goal: () => { world: string; x: number; z: number; en: string; zh: string } | null;
    state: () => {
      id: string;
      world: string;
      step: number;
      visited: number[];
      minutes: number;
      feedback?: { zh: string; en: string };
      preview?: boolean;
    } | null;
    remember: (id: string, choice?: number | null, notify?: boolean) => void;
    cancel: (owner?: string) => void;
    openNotebook: () => void;
    openHelp: () => void;
  } | null;
  showGuideCard: () => void;
  stopAgreementMusic: () => void;
  kunlunSpeak: (text: string, voice?: string) => void;
  overlay: OverlayAPI;
  store: StoreAPI;
}

// ===================== 实体注册表 =====================

export interface EntityEntry {
  mesh: Object3D;
  type: string;
  tags: string[];
  data: Record<string, unknown>;
  id: string;
}

export interface RegisterOpts {
  type: string;
  tags?: string[];
  data?: Record<string, unknown>;
}

export type EntityRegistry = import('../src/engine.js').EntityRegistry;

// ===================== 输入管理器 =====================

export type InputManager = import('../src/engine.js').InputManager;

// ===================== 游戏主循环 =====================

export type GamePhase = 'input' | 'update' | 'render' | 'ui';

export type GameLoop = import('../src/loop.js').GameLoop;

// ===================== 事件总线 =====================

export type EventBus = import('../src/event-bus.js').EventBus;

// ===================== Window 探针钩子(运行时挂载,均为诊断用途) =====================

declare global {
  /** 构建时由 vite.config.js define 注入的版本戳(源码直跑时不存在) */
  const __B612_BUILD__: { n: number; hash: string; date: string } | undefined;
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Window {
    [key: string]: any;
    __ctx: import('./ctx').GalleryCtx;
    __gsInitN?: number;
  }
}

// ===================== 主上下文 =====================

export interface GalleryCtx {
  // 帧循环
  tickers: Array<(dt: number) => void>;
  onTick: (fn: (dt: number) => void) => () => void;
  loop: GameLoop;

  // 引擎
  ent: EntityRegistry;
  input: InputManager;

  // 事件总线
  events: EventBus;

  // 命名空间
  scene: SceneNamespace;
  player: PlayerNamespace;
  media: MediaNamespace;
  gallery: GalleryNamespace;
  mode: ModeNamespace;
  kunlun: KunlunNamespace;
  ui: UINamespace;

  // 扁平兼容层（软冻结，新代码应使用命名空间）
  [key: string]: any;
}
