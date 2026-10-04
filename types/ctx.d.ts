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
  Intersection,
} from 'three';

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
  worldManager?: unknown;
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
  drM: () => void;
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
  wb: Mesh;
  mpMesh: Mesh;
  mpMat: Material;
  guideMesh: Mesh;
  ytHeart: Mesh;
  scrollLink: unknown;
  mA: Material[];
  audioManager: unknown;
}

export interface GalleryNamespace {
  paintGroups: Group[];
  onC3D: (intersection: Intersection) => void;
  zoomOut: () => void;
  zG: Group | null;
  hangOne: (url: string) => void;
  houseMats: Material[];
  openHouseColor: () => void;
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
}

export interface OverlayAPI {
  register: (id: string, el: HTMLElement, opts?: { esc?: boolean; backdrop?: boolean }) => void;
  anyOpen: () => boolean;
  isUiTouch: (e: TouchEvent) => boolean;
}

export interface StoreAPI {
  num: (key: string, fallback?: number) => number;
  str: (key: string, fallback?: string) => string;
  json: <T>(key: string, fallback?: T) => T;
  flag: (key: string, fallback?: boolean) => boolean;
  set: (key: string, value: unknown) => void;
  getSpirits: () => unknown;
}

export interface UINamespace {
  modeToast: (msg: string) => void;
  openDialog: (opts: unknown) => void;
  dialogOpen: () => boolean;
  cancelDialogScope: (scope: string) => void;
  advanceDialog: () => void;
  portfolio: { open: () => void; count: () => number } | null;
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
