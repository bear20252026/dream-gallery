// 共享上下文：跨模块共享的场景对象、数组、状态都挂在这里。
// ES 模块中 import 的是同一对象引用，先 import 的模块写入，后 import 的模块读取。
// 模块加载顺序见 main.js；写入方见各字段注释。
//
// ===================== 总线登记册(2026-07-28 架构深化①,阶段一) =====================
// ctx 现为全站跨模块通道(107 个映射属性已收入 7 个命名空间,见文件底部别名层)。为避免"上帝总线"继续膨胀,规矩:
//   ① 新挂属性必须先在本文件的对应分组登记(写明类型/写入方/用途);
//   ② 能收进深模块的不要挂总线——存档走 ctx.store,弹层走 ctx.overlay,媒体规则走 mediarules.mjs;
//   ③ 分型(命名空间化)为既定方向,见 RFC-架构深化.md 候选①的阶段二/三提案。
/**
 * 画廊共享上下文。各模块通过 `import {ctx} from './ctx.js'` 读写。
 * @typedef {Object} GalleryCtx
 *
 * ── 帧循环(ctx.js 自身) ──
 * @property {Function[]} tickers   统一每帧动画队列(主循环逐帧调用)
 * @property {function(Function):void} onTick 注册每帧动画:ctx.onTick(fn)
 *
 * ── 场景内核(scene/scene.js 写入) ──
 * @property {THREE.Scene} s        3D 场景
 * @property {THREE.PerspectiveCamera} cam 相机
 * @property {THREE.WebGLRenderer} rnd 渲染器
 * @property {HTMLElement} L        加载遮罩元素
 * @property {THREE.Raycaster} ray  射线拾取器(点击交互用)
 * @property {THREE.Vector2} mP2    鼠标/触摸归一化坐标(射线拾取用)
 * @property {THREE.Object3D[]} iG  可交互对象数组(画框/图标/视频墙等)
 * @property {THREE.TextureLoader} tL 纹理加载器
 * @property {function(string,function=):THREE.CanvasTexture} loadTexCapped 降采样纹理加载(最长边1024,带门禁与距离懒加载)
 * @property {number} OL/OR/OT/OBE/OBR 整体边界:左/右/顶(北)/展厅区南/最南
 * @property {number} WH            墙高
 * @property {number} IL/IR/IRT/IRB 回字内墙禁区边界:左/右/顶/底
 * @property {{mnX:number,mxX:number,mnZ:number,mxZ:number}[]} bounds 全部墙体碰撞盒(移动/传送校验用)
 * @property {number} floorW/floorD 地板宽/深
 * @property {number} bW/bD         音乐演奏器棕色地板宽/深
 * @property {number} pyrHeight     金字塔高度(烟花参照)
 * @property {Object} groundUniforms 云影地面 shader uniforms
 * @property {Object} skyUniforms   天空 shader uniforms
 * @property {{l:THREE.PointLight}[]} pls 呼吸灯数组(主循环驱动明暗)
 * @property {THREE.Light} ambL/hemiL 环境光/半球光(昼夜循环调色用)
 *
 * ── 特效(scene/effects.js 写入) ──
 * @property {function():void} updateFireworks 烟花逐帧更新(主循环调用;热模块,调用时从 ctx 现取)
 * @property {THREE.BufferAttribute} pG 漂浮粒子位置属性
 * @property {number} pC            粒子数量
 *
 * ── 媒体(scene/media.js 写入) ──
 * @property {function():void} drawMusicCanvas 2D音乐演奏器逐帧重绘
 * @property {HTMLVideoElement} vidEl/v45El 大屏1号/4·5号视频元素
 * @property {THREE.VideoTexture} vidTex/v45Tex 对应视频纹理
 * @property {THREE.Mesh} vidMesh/v45Mesh 对应视频墙网格(点击播放/暂停)
 * @property {boolean} bigScreenHold 大屏轮播闸口(三连读未签完=1号原地循环)
 * @property {function(string):void} kunlunSpeak TTS 统一入口(失败静默;/api/tts 代理)
 * @property {number} dayHour       沙漠昼夜时刻(0-24,desert.js 写入)
 * @property {Object} desert        沙漠地形接口(getH 等,desert.js 写入)
 *
 * ── 户外交互(gallery/signs.js·markers.js·links.js 写入) ──
 * @property {THREE.Mesh} signMesh/wb/mpMesh/guideMesh 牌子/白板入口/音乐入口/准则卷轴
 * @property {THREE.Material} signMat/mpMat 点击闪烁材质
 * @property {THREE.Mesh} ytHeart   奕彤爱心(普通模式隐藏)
 * @property {Object} scrollLink    卷轴链接(redraw 改写为《元素共鸣准则》)
 * @property {function} linkGuard   外链可见性守卫(isLink2~13/isGarden,普通模式接管)
 * @property {string[]} LINK_MODEL_TYPES/MOUNTABLE_ICONS 链接模型类型表/可挂载图标表(mode.js)
 * @property {function} spawnLinkModel 链接模型生成(10 种,mode.js)
 * @property {function} trackClick  链接点击埋点(mode.js)
 *
 * ── 挂画(gallery/paintings.js 写入) ──
 * @property {THREE.Group[]} paintGroups 全部画框注册表(模式系统按 src 分级显隐)
 * @property {function(Intersection):void} onC3D 3D 点击处理(player.js 调用)
 * @property {function():void} zoomOut 画框缩回复位
 * @property {?THREE.Group} zG      当前放大的画框(player.js 按 Escape 时读取)
 * @property {function} hangOne     挂画(上传后新照换芯空框用)
 * @property {THREE.Material[]} houseMats/mA 房屋材质分组(housecolor.js 换色用)
 *
 * ── 玩家(scene/player.js 写入) ──
 * @property {{p:THREE.Vector3,y:number,pi:number}} pl 玩家状态:位置/偏航/俯仰
 * @property {{x:number,z:number}} jD 摇杆输入向量
 * @property {Object<string,boolean>} ks 键盘按键状态
 * @property {function(number,number,number):void} mv 玩家移动(含碰撞)
 * @property {function():void} drawMap 小地图逐帧重绘
 * @property {HTMLElement} jT/jB/aB 摇杆容器/手柄/音乐按钮
 *
 * ── 门禁与答题(gate/quizgate.js·quiz.js·prologue.js) ──
 * @property {boolean} quizPassed   心象共鸣通过(建筑门禁总开关)
 * @property {number} quizPassScore 分数线(服务端 QUIZ_PASS_SCORE 经 /api/quiz/state 下发,单一源)
 * @property {function} showGuideCard 初见指引卡(main.js)
 *
 * ── 展示区模式(gallery/mode.js) ──
 * @property {'normal'|'special'} siteMode 展示模式
 * @property {string[]} demoPhotos/myUploads/myLinks/customLinks 站点配置下发名单
 * @property {Object} myUploadTokens/myCaptions 媒体令牌/AI 配文
 * @property {function():void} applyPaintMode/applyMode/refreshMode 模式重算入口
 * @property {?function(string):boolean} texAllowed 纹理门禁(普通模式拦图库;medirules.mjs 决策表)
 * @property {function(string):void} modeToast 轻提示统一入口(反馈文案唯一通道)
 * @property {string} viewMode      视角模式(player.js 写入)
 * @property {function} openUpload/openHouseColor 上传面板/换色面板入口(upload.js/housecolor.js)
 *
 * ── 天穹与灵蕴(kunlun/* 神话层) ──
 * @property {function():number} spiritsGot/isDone 灵蕴收集数/是否集齐(spirits.js)
 * @property {Object[]} spiritsState 灵蕴状态表(设置页罗盘渲染用)
 * @property {string[]} spiritsTTS 灵蕴文案(finale.js 灵蕴归位播报)
 * @property {function} spiritMark  当前灵蕴目标坐标(小地图金点)
 * @property {function} checkSkyMs  天穹里程碑检测(settings.js)
 * @property {function} fadeTeleport 传送过渡遮罩(传送/回家共用)
 *
 * ── 永恒展厅与飞舟(kunlun/eternal.js·ark.js 等) ──
 * @property {Object} eternalHandlers 高空交互分发表(各模块自注册 action→fn)
 * @property {function} eternalClick/eternalTeleport/eternalWelcome 金门点击/传送/欢迎
 * @property {function} eternalKeepOut/groundOverride 小地图禁区/厅内地面覆盖(player.js 钩子)
 * @property {HTMLVideoElement} peakVidEl 昆仑巅彩蛋视频(peaks.js)
 * @property {boolean} flightLock   飞行期总锁(位移/海拔触发类功能必须先查,ark.js)
 * @property {function} arkTeleportToPeak 罗盘传送山巅登舟点(ark.js)
 * @property {Object} flyAudio      飞行音效(ark.js)
 * @property {function} letgoRecall 放下画作召回(letgo.js)
 *
 * ── 冷核心深模块(2026-07-28 架构深化) ──
 * @property {Object} overlay       弹层注册处(src/ui/overlay.js):register/anyOpen/isUiTouch
 * @property {Object} store         存档登记处(src/state/store.js):num/str/json/flag/getSpirits…
 * @property {Object} avatar        头像/入场动画(若非上列归属)
 */

/** @type {import('../types/ctx').GalleryCtx} */
export const ctx = {};
// 诊断钩子:探针脚本读取运行时状态(quizPassed/store/overlay 等)用
if (typeof window !== 'undefined') window.__ctx = ctx;

// ===================== 游戏主循环(2026-08-01 引擎化改造) =====================
import { GameLoop } from './loop.js';
ctx.loop = new GameLoop();
// 单一驱动:只保留 ctx.tickers 一路,由 LoopManager 在 UPDATE 阶段统一执行。
// 早期曾同时 ctx.tickers.push 又 ctx.loop.on('update'),导致每个 onTick 每帧执行两次(双循环 bug)。
// GameLoop 实例保留,仅持有 timeScale(供 LoopManager.pause/resume/_frame 读写);
// 阶段调度与 rAF 主循环已统一由 LoopManager 承担,GameLoop 内死实现于 2026-08-29 清理。
ctx.tickers = [];
ctx.onTick = (fn) => {
  ctx.tickers.push(fn);
  return () => {
    const i = ctx.tickers.indexOf(fn);
    if (i >= 0) ctx.tickers.splice(i, 1);
  };
};

// ===================== 实体注册表 + 输入管理器 =====================
import { EntityRegistry, InputManager } from './engine.js';
ctx.ent = new EntityRegistry();
ctx.input = new InputManager();
ctx.input.initDefaults();
// 输入 tick 由 LoopManager 的 INPUT 阶段调用(单一主循环,不再经 ctx.loop)

// ===================== 命名空间别名层 + 扁平写软冻结(2026-08-22 架构优化) =====================
// 扁平路径永久可用(老代码零改动);新代码用命名空间路径,读/写都经 get/set 委托到同一个真实存储 vault——
// 行为完全等价,HMR 热替换属性后别名自动拿到新值(比模块顶层一次性解构更稳)。
// 阶段三(软冻结):映射属性的扁平写在 dev 环境(localhost/?ctxdebug)告警一次指路命名空间;
//   全 src 已迁移完毕,正式环境告警应为零——若出现说明有新代码走了老路。告警不阻断行为。
const vault = {}; // 映射属性的唯一真实存储(扁平访问器与命名空间共享)

// 导入独立命名空间模块
import { createUINamespace } from './ctx-ui.js';
import { createKunlunNamespace } from './ctx-kunlun.js';
import { createPlayerNamespace } from './ctx-player.js';
import { createSceneNamespace } from './ctx-scene.js';
import { createMediaNamespace } from './ctx-media.js';
import { createGalleryNamespace } from './ctx-gallery.js';
import { createModeNamespace } from './ctx-mode.js';
import { getGameState } from './core/game-state.js';

// 创建命名空间代理对象
ctx.ui = createUINamespace(vault);
ctx.kunlun = createKunlunNamespace(vault);
ctx.player = createPlayerNamespace(vault);
ctx.scene = createSceneNamespace(vault);
ctx.media = createMediaNamespace(vault);
ctx.gallery = createGalleryNamespace(vault);
ctx.mode = createModeNamespace(vault);

// ===================== Stage 4 冻结:写路径单入口早注册(2026-08-29) =====================
// 把命名空间运行期状态 prop 的 bindNamespace 注册提前到命名空间创建处(早于任何模块导入期直写),
// 使 player.js:28 viewMode=0 / quizgate.js:29 quizPassed=true 等导入期直写也经 gameState.set 单入口,
// 彻底消除「导入期绕过单入口」残留缺陷。apply 直写 vault + 直发 emitPropertyChange(不经代理 set 陷阱,避免递归)。
// 命名空间 set 陷阱对已绑 prop 委托 gameState.set;非绑 prop 维持原自写 vault + 发事件行为。
const gs = getGameState();
gs.bindNamespace(
  'mode',
  ['siteMode', 'customLinks', 'demoPhotos', 'myUploads', 'myUploadTokens', 'myLinks', 'myCaptions'],
  (prop, val) => {
    const old = vault[prop];
    if (old !== val) {
      vault[prop] = val;
      eventBus.emitPropertyChange('mode', prop, val, old);
    }
  }
);
gs.bindNamespace('player', ['quizPassed', 'viewMode'], (prop, val) => {
  const old = vault[prop];
  if (old !== val) {
    vault[prop] = val;
    eventBus.emitPropertyChange('player', prop, val, old);
  }
});
gs.bindNamespace('kunlun', ['flightLock'], (prop, val) => {
  const old = vault[prop];
  if (old !== val) {
    vault[prop] = val;
    eventBus.emitPropertyChange('kunlun', prop, val, old);
  }
});

// 向后兼容：为所有命名空间属性创建扁平访问器
const allNamespaces = [ctx.ui, ctx.kunlun, ctx.player, ctx.scene, ctx.media, ctx.gallery, ctx.mode];
const devWarned = new Set();
const DEV =
  typeof location !== 'undefined' &&
  (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || /ctxdebug/.test(location.search));

// 为每个命名空间的属性创建扁平访问器
for (const ns of allNamespaces) {
  for (const prop of Object.keys(ns)) {
    if (!Object.getOwnPropertyDescriptor(ctx, prop)) {
      Object.defineProperty(ctx, prop, {
        enumerable: true,
        configurable: true,
        get() {
          return vault[prop];
        },
        set(v) {
          if (DEV && !devWarned.has(prop)) {
            devWarned.add(prop);
            console.warn(
              '[ctx软冻结] ctx.' +
                prop +
                ' 扁平写已废弃,请改用命名空间(ctx.ui/kunlun/player/scene/media/gallery/mode)'
            );
          }
          const oldValue = vault[prop];
          if (oldValue !== v) {
            vault[prop] = v;
          }
        },
      });
    }
  }
}

// ===================== 事件总线(2026-08-22 增强版) =====================
// 增强事件总线，支持命名空间和属性变化事件
// 用法: ctx.events.on('gallery:ready', myHandler)
//       ctx.events.emit('music:started', {track:'00002'})
//       ctx.events.onPropertyChange('scene', 'cam', (newVal, oldVal) => {})
import { eventBus } from './event-bus.js';
ctx.events = eventBus;
