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
  kintsugiOn: boolean;
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

export interface MediaNamespace {
  vidEl: HTMLVideoElement;
  v45El: HTMLVideoElement;
  vidTex: VideoTexture;
  v45Tex: VideoTexture;
  vidMesh: Mesh;
  v45Mesh: Mesh;
  drawMusicCanvas: () => void;
  bigScreenHold: boolean;
  desert: { getH: (x: number, z: number) => number };
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
  hangOne: (url: string) => void;
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

export interface ModeNamespace {
  siteMode: 'normal' | 'special';
  demoPhotos: string[];
  myUploads: string[];
  myLinks: string[];
  customLinks: string[];
  myUploadTokens: Record<string, string>;
  myCaptions: Record<string, string>;
  applyPaintMode: () => void;
  applyMode: () => void;
  refreshMode: () => void;
  /** 链接实体按 id 增量对齐(2026-10-11 DG-GPU-001:未变保留/移除才 dispose/新增才 spawn) */
  renderCustomLinks: () => void;
  applyTexGate: () => void;
  texAllowed: ((url: string) => boolean) | null;
  linkGuard: () => void;
  spawnLinkModel: (type: string, url: string) => Object3D;
  trackClick: (linkId: string) => void;
  LINK_MODEL_TYPES: string[];
  MOUNTABLE_ICONS: string[];
  openUpload: () => void;
}

export interface KunlunNamespace {
  flightLock: boolean;
  eternalHandlers: Record<string, (...args: unknown[]) => void>;
  eternalClick: () => void;
  eternalTeleport: () => void;
  eternalWelcome: () => void;
  eternalKeepOut: () => void;
  groundOverride: ((x: number, z: number) => number | null) | null;
  arkTeleportToPeak: () => void;
  letgoRecall: () => void;
  peakVidEl: HTMLVideoElement | null;
  flyAudio: unknown;
  spiritsGot: () => number;
  isDone: () => boolean;
  spiritMark: () => { x: number; z: number } | null;
  spiritsTTS: string[];
  spiritsState: unknown[];
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
  modeToast: (msg: string) => void;
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
