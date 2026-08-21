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
  kunlunSpeak: (text: string) => void;
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

export declare class EntityRegistry {
  _map: Map<string, EntityEntry>;
  _byType: Map<string, Set<string>>;
  _dirty: Set<string>;
  _nextId: number;

  register(mesh: Object3D, opts?: RegisterOpts): string;
  unregister(id: string): void;
  find(type: string): Object3D[];
  findByTag(tag: string): Object3D[];
  get(id: string): EntityEntry | undefined;
  forEach(fn: (entry: EntityEntry, id: string) => void): void;
  readonly size: number;
  markDirty(id: string): void;
  markTypeDirty(type: string): void;
  getDirtyAndClear(): string[];
  processDirty(fn: (entry: EntityEntry, id: string) => void): void;
}

// ===================== 输入管理器 =====================

export declare class InputManager {
  _keys: Record<string, boolean>;
  _actions: Record<string, Array<(dt: number) => void>>;
  _mouse: { x: number; y: number; dx: number; dy: number; down: boolean };
  _touch: { active: boolean; x: number; y: number };
  _bindings: Record<string, string[]>;

  bindAction(action: string, keys: string[]): void;
  isDown(action: string): boolean;
  readonly mouseDelta: { x: number; y: number };
  initDefaults(): void;
  on(action: string, fn: (dt: number) => void): void;
  tick(dt: number): void;
}

// ===================== 游戏主循环 =====================

export type GamePhase = 'input' | 'update' | 'render' | 'ui';

export declare class GameLoop {
  _phases: Record<GamePhase, Array<(dt: number) => void>>;
  _running: boolean;
  _lastTime: number;
  timeScale: number;
  maxDelta: number;

  on(phase: GamePhase, fn: (dt: number) => void): () => void;
  off(phase: GamePhase, fn: (dt: number) => void): void;
  start(): void;
  pause(): void;
  resume(): void;
}

// ===================== 事件总线 =====================

export interface EventBus {
  on(event: string, fn: (...args: unknown[]) => void): () => void;
  once(event: string, fn: (...args: unknown[]) => void): () => void;
  off(event: string, fn?: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
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
  [key: string]: unknown;
}
