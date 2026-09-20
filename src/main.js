// main.js — 入口模块(2026-09-06 主人定:启动顺序彻底重排)
// ============================================================
// 【引导阶段】本文件顶部只保留轻量静态导入(闸门/电影/加载屏/UI 轻件),
//   页面加载即执行:加载屏 → 入口闸门 → 纸飞机电影。
// 【世界阶段】全部 3D 世界模块(scene/desert/player/paintings/kunlun...)
//   改为 startWorld() 内按原 import 顺序动态加载 + 执行原构建代码,
//   startWorld 由 watchOpening 的 finishIntro 调用(电影 skip/播完/失败三路)。
//   ——世界不再"随页面加载启动",是真正的启动顺序后置,不是视觉遮盖。
expose('BUILD', '2026-07-28-r9'); // 部署序号(诊断+刷新产物哈希,绕开边缘节点缓存的 404)
import { ctx } from './ctx.js';
import './error-report.js'; // 客户端报错反馈(2026-08-30):尽早挂载才能捕获启动期错误
import './shared/audio-guard.js'; // 全站 AudioParam 时间参数守卫,静默拦截 NaN(2026-09-05)

import './ui/overlay.js'; // 弹层注册处(冷核心,必须最先 import:Esc 栈优先级靠监听器注册顺序)
import './state/store.js'; // 存档登记处(冷核心,紧随 overlay:全站 localStorage 唯一入口 ctx.store)
import { initSentry } from './shared/sentry.js'; // Sentry 错误追踪(2026-08-22,无 3D 依赖,引导期初始化)
import { compositionRoot } from './core/composition-root.js'; // 组合根(阶段1,2026-08-27)
import { setLoop, createLoopSystem, register } from './core/loop.js'; // 单一主循环 facade(阶段1)
import { LoopManager } from './loop-manager.js'; // 循环管理器(构造轻量:仅存 ctx/event-bus/常量)
import { expose } from './debug-hooks.js';
import './visitor-fp.js'; // 访客身份采集+踢出通知(轻量 IIFE,含 SSE 踢出监听,不依赖 3D)
import { createToastSystem } from './core/toast-system.js'; // 示范积木:事件驱动 toast
import { createGameShellSystem } from './core/gameshell-system.js'; // 游戏外壳:手绘对话框+任务栏+系统菜单(2026-08-29)
import { createInputSystem } from './core/input.js'; // 统一输入 facade(阶段1·P1-3)
import { createAudioSystem } from './core/audio-system.js'; // 阶段2 垂直切片:空间音频积木(依赖注入,取代冻结 ctx 写)
import { createPerfMonitorSystem } from './core/perf-monitor-system.js'; // 阶段3 切片:性能监控积木(单循环驱动,删死 ctx import)
import { createEffectsSystem } from './core/effects-system.js'; // 阶段3 切片:粒子/烟花积木(从 LoopManager 上帝渲染器抽出,经 deps 注入)
import { createMediaSystem } from './core/media-system.js'; // 阶段3 切片:媒体逐帧积木(音乐画布+视频纹理,从 LoopManager 上帝渲染器抽出,经 deps 注入)
import { createStateSystem } from './core/state-system.js'; // 阶段3 切片:单向状态库(订阅事件总线,镜像命名空间状态进 game-state)
import { createUiSystem } from './core/ui-system.js'; // 阶段3 切片:UI 域生命周期收口(组合根拥有 overlay 关闭/销毁出口)
import { getGameState } from './core/game-state.js'; // 单例状态库(阶段3 store 真正化)
import * as bootState from './core/boot-state.js';
import { Z } from './shared/z-layers.mjs';
import { GLOBAL, tt } from './shared/story-text.mjs'; // 剧本台词/全局文案单一源(2026-09-07 对稿)
import { applySavedLang, makeLangToggle } from './ui/lang-toggle.js'; // 剧情语言切换(en/zh,单位置切换
import { showWorldLoadError } from './ui/world-err.js'; // 世界启动失败兜底 UI(2026-09-18 外迁)
import { showGuideCard } from './gate/guide-card.js'; // 初见指引卡(2026-09-18 外迁)
import { startAgreementMusic, stopAgreementMusic } from './ui/agreement-music.js'; // 协议配乐(2026-09-18 外迁)
import { paperReveal } from './ui/reveal.js'; // 纸色揭幕(2026-09-18 外迁)
import { startBigscreenWhenReady } from './ui/bigscreen-boot.js'; // 大屏轮播延迟启动(零重依赖,2026-09-18 外迁)
import { signAllConsents } from './gate/consent-session.js'; // 三连协议会话签(零依赖,2026-09-18 外迁)

// ===================== 主画布视觉保险 + 加载屏交接 =====================
// 主画布开机隐藏:闸门/电影期间世界不可见——不是遮盖,startWorld 时才显形,
// 配合世界模块整体后置,构成"电影落定 → 世界才构建+渲染"的硬顺序。
const loopManager = new LoopManager(ctx); // 构造轻量,引导期即可;start() 在 startWorld 才调
ctx.scene.loopManager = loopManager; // 2026-09-18 收编登记册(scene 内核)
setLoop(loopManager); // 注入唯一主循环 facade(新积木经 deps.loop 获取)

// 早按存档载入剧情语言(双语可切换)
const _sl = applySavedLang();
document.body.dataset.scriptLang = _sl;
// 主世界常驻语言切换钮:同一位置只显示当前语言标签(EN/中文)
{
  const tb = makeLangToggle({ placement: 'top:14px;right:14px', z: Z.navBtn });
  tb.style.position = 'fixed';
  document.body.appendChild(tb);
}
// 加载屏引言(2026-09-07 对稿《中文文学译本》全局文案件)
{
  const lq = document.getElementById('loadQuote');
  if (lq) {
    lq.textContent = tt(GLOBAL.loading);
    lq.style.cssText =
      'margin-top:18px;font-style:italic;font-size:14px;line-height:1.9;letter-spacing:1px;color:rgba(84,70,58,.6);white-space:pre-line;text-align:center';
  }
}

const _c3d = document.getElementById('c');
if (_c3d) _c3d.style.visibility = 'hidden';
function fadeLoad() {
  const l = document.getElementById('l');
  if (!l) return;
  l.style.opacity = '0';
  setTimeout(() => (l.style.display = 'none'), 800);
}
// 加载屏交接:闸门就绪后 400ms 淡出(保底 8s 兜底)
let _loadFaded = false;
function fadeLoadOnce() {
  if (_loadFaded) return;
  _loadFaded = true;
  fadeLoad();
}
(function waitGateReady() {
  const t = setInterval(() => {
    if (document.getElementById('b612Gate') || window.__gateFailed) {
      clearInterval(t);
      setTimeout(fadeLoadOnce, 400);
    }
  }, 100);
  setTimeout(() => {
    clearInterval(t);
    fadeLoadOnce();
  }, 8000);
})();

// ===================== 世界阶段:预加载(不渲染)+ 揭幕启动 =====================
// 拆两段(2026-09-06 主人定「恢复预加载,只加载不展示」):
//   preloadWorld — 闸门 ENTER 即开始、与电影并行:加载全部世界模块并完成场景构建
//                  (灯光限额/后处理/组合根/状态机/HUD),但不揭幕、不启动主循环,
//                  不出一帧画面——加载耗时被电影时长整体吸收,落定即进世界。
//   startWorld   — 电影落定后调用:等预加载完成(通常已完成)→ 纸色揭幕 → 启动循环。
let worldStarted = false;
let worldBooting = null;
let worldBooted = false;
let preloadPromise = null; // 预加载记忆化:并发调用(onEnter 与 startWorld)共享同一次加载
async function preloadWorld() {
  if (preloadPromise) return preloadPromise; // 2026-09-07 修复:重复调用曾让组合根 init 多跑,系统全量重复装配
  preloadPromise = (async () => {
  // —— 世界模块按原 import 顺序加载(2026-09-18 数据化:字面量 import thunk,Vite 仍逐个切包) ——
  const WORLD_MODULES = [
    ['场景', () => import('./scene/scene.js')],
    ['媒体', () => import('./scene/media.js')],
    ['牌子', () => import('./gallery/signs.js')],
    ['喷泉', () => import('./gallery/fountains.js')],
    ['标记', () => import('./gallery/markers.js')],
    ['链接', () => import('./gallery/links.js')],
    ['挂画', () => import('./gallery/paintings.js')],
    ['模式', () => import('./gallery/mode.js')],
    ['塔楼', () => import('./gallery/dome-towers.js')],
    ['设置', () => import('./gate/settings.js')],
    ['上传', () => import('./gate/upload.js')],
    ['房屋色', () => import('./gate/housecolor.js')],
    ['温柔度', () => import('./gate/quiz.js')],
    ['沙漠', () => import('./scene/desert.js')],
    ['玩家', () => import('./scene/player.js')],
    ['答题门', () => import('./gate/quizgate.js')],
    ['远方山巅', () => import('./kunlun/peaks.js')],
    ['灵蕴', () => import('./kunlun/spirits.js')],
    ['永恒厅', () => import('./kunlun/eternal.js')],
    ['飞舟', () => import('./kunlun/ark.js')],
    ['风铃', () => import('./kunlun/windchime.js')],
    ['壁炉', () => import('./kunlun/fireplace.js')],
    ['雪窗', () => import('./kunlun/snowwin.js')],
    ['星球世界', () => import('./kunlun/planets.js')],
    ['第6场国王', () => import('./kunlun/scene6-king.js')],
    ['对话', () => import('./kunlun/story-dialogs.js')],
    ['石门', () => import('./gallery/portal.js')],
    ['坠机点', () => import('./gallery/crash-site.js')],
    ['画羊', () => import('./gate/scene2-draw.js')],
    ['书页一', () => import('./gate/scene3-night.js')],
    ['回忆层', () => import('./kunlun/scene3-memory.js')],
    ['重置视角', () => import('./kunlun/resetview.js')],
    ['放下', () => import('./kunlun/letgo.js')],
    ['终章', () => import('./kunlun/finale.js')],
    ['状态机', () => import('./player/states/PlayerStates.js')],
    ['后处理', () => import('./scene/postprocessing.js')],
  ];
  for (const [label, load] of WORLD_MODULES) {
    try {
      window.__worldPhase = label;
      await load();
    } catch (e) {
      window.__worldPhase = '失败:' + label;
      console.error('[startWorld] ' + label + ' 加载失败:', e.message);
      if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: ' + label + ' ' + e.message);
      throw e;
    }
  }

  // —— 以下为原 main.js 顶层构建代码(依赖上述模块的副作用,顺序不可调换) ——
  const { s, cam, rnd, pls } = ctx;

  // ===================== 灯光限额(性能;选择算法在 core/light-budget.js 纯逻辑) =====================
  // 光源总数直接决定着色器体积:实测单程序编译 59盏≈822ms / 24盏≈208ms / 13盏≈103ms。
  {
    const isMobile = 'ontouchstart' in window && Math.min(screen.width, screen.height) < 768;
    const { selectLightsToRemove } = await import('./core/light-budget.js');
    const { remove: rm, ceil } = selectLightsToRemove((cb) => s.traverse(cb), pls, { isMobile });
    rm.forEach((l) => l.parent && l.parent.remove(l));
    for (let i = pls.length - 1; i >= 0; i--) if (!ceil.has(pls[i].l)) pls.splice(i, 1);
    expose('lightBudget', { removed: rm.length, keepEvery: isMobile ? 3 : 2, spotKeep: isMobile ? 4 : 10 });
  }

  // ===================== 后处理管线初始化(2026-08-22) =====================
  const pp = await import('./scene/postprocessing.js'); // 已在上方链加载,此处取缓存
  pp.initPostProcessing(rnd, s, cam);
  ctx.scene.renderPostProcessing = pp.renderPostProcessing;
  ctx.scene.resizePostProcessing = pp.resizePostProcessing;
  // 多世界:把主世界后处理管线注入 SceneManager(切世界时由它接管挂/摘)
  if (ctx.scene.worldManager && ctx.scene.worldManager.setMainPost)
    ctx.scene.worldManager.setMainPost(pp.renderPostProcessing);
  compositionRoot.register(createPerfMonitorSystem({ renderer: rnd }));
  initSentry();
  compositionRoot.register(
    createAudioSystem({
      scene: ctx.scene,
      getCamera: () => ctx.scene.cam,
      eventBus: ctx.events,
    })
  );
  compositionRoot.register(
    createEffectsSystem({
      scene: ctx.scene,
      floorW: ctx.floorW,
      floorD: ctx.floorD,
      IL: ctx.IL,
      IR: ctx.IR,
      IRT: ctx.IRT,
      IRB: ctx.IRB,
      OT: ctx.OT,
      OBR: ctx.OBR,
      WH: ctx.WH,
      bW: ctx.bW,
      bD: ctx.bD,
      pyrHeight: ctx.pyrHeight,
    })
  );
  compositionRoot.register(createMediaSystem({ media: ctx.media, scene: ctx.scene }));
  compositionRoot.register(
    createStateSystem({ eventBus: ctx.events, gameState: getGameState(), ctx })
  );
  compositionRoot.register(createUiSystem({ ctx }));
  window.addEventListener('resize', () => {
    const w = innerWidth,
      h = innerHeight;
    rnd.setSize(w, h);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    pp.resizePostProcessing(w, h);
  });

  // ===================== 动画(统一循环管理器,构造在引导期/startWorld 只启动) =====================
  const lowQuality = !!ctx.store.json('lowQuality', false);
  if (lowQuality) loopManager.setLowQuality(true);
  ctx.scene.setLowQuality = (on) => loopManager.setLowQuality(on);

  compositionRoot.register(createToastSystem());
  compositionRoot.register(createGameShellSystem()); // 手绘游戏外壳(对话框/任务栏/菜单)
  compositionRoot.register(createLoopSystem());
  compositionRoot.register(createInputSystem(ctx.input));
  compositionRoot.init();
  expose('compositionRoot', compositionRoot);
  expose('gameState', getGameState());
  expose('bootState', bootState.default); // 可观测:开场链路状态(gatePassed/worldStarted/introFired)
  register((dt) => compositionRoot.update(dt));

  // 玩家状态机:世界就绪后初始化为空闲状态
  const { IdleState } = await import('./player/states/PlayerStates.js');
  ctx.player.playerSM.change(new IdleState());
  ctx.onTick(function (dt) {
    ctx.player.playerSM.tick(dt);
  });

  // 世界坐标读数栏(F3 开关,一键复制)
  const { mountCoordHUD } = await import('./ui/coord-hud.js');
  mountCoordHUD(ctx);

  // 性别配色(老档案兼容):世界阶段动态取(housecolor 已在 WORLD_MODULES;2026-09-18 外迁回所属模块)
  const savedGender = ctx.store.str('gender');
  if (savedGender) {
    const { applyGenderColor } = await import('./gate/housecolor.js');
    applyGenderColor(savedGender);
  }

  // 可选装饰模块(失败静默重试,不影响进馆)
  softImport(() => import('./museum/museum.js'));
  softImport(() => import('./gallery/gallery-v2.js'));
  softImport(() => import('./gallery/rose-gallery.js'));
  softImport(() => import('./gallery/tower-orb.js'));
  // 第三人称角色模型延迟 2s(FBX 较大;其余昆仑层已按序加载)
  setTimeout(function () {
    softImport(() => import('./kunlun/avatar.js'));
  }, 2000);

  // P3(2026-09-07 审计):启动自检——模块清单靠人肉同步,漏载的后果是静默的
  // (2026-09-06「石门消失」就是漏载 planets.js)。对关键装配断言,缺谁喊谁。
  const missing = [];
  const need = function (name, getter) {
    try {
      if (!getter()) missing.push(name);
    } catch (e) {
      missing.push(name);
    }
  };
  need('scene.rnd(渲染器)', function () { return ctx.scene.rnd; });
  need('scene.s(活动场景)', function () { return ctx.scene.s; });
  need('scene.worldManager(世界注册表)', function () { return ctx.scene.worldManager; });
  need('scene.renderPostProcessing(后处理)', function () { return ctx.scene.renderPostProcessing; });
  need('player.pl(玩家)', function () { return ctx.player && ctx.player.pl; });
  need('desert.getH(地形)', function () { return ctx.media && ctx.media.desert && ctx.media.desert.getH; });
  need('kunlun.spiritsState(灵蕴契约)', function () { return ctx.kunlun && ctx.kunlun.spiritsState; });
  need('media.vidEl(户外大屏)', function () { return ctx.media && ctx.media.vidEl; });
  window.__bootCheck = { ok: missing.length === 0, missing: missing };
  if (missing.length)
    console.error('[startWorld] 启动自检缺项(模块漏载或初始化失败):', missing.join(', '));

  worldBooted = true; // 预加载完成:模块与场景构建全部就绪(揭幕由 startWorld 负责)
  })().catch(function (e) {
    preloadPromise = null; // 失败清空记忆,允许 startWorld 重试
    throw e;
  });
  return preloadPromise;
}

async function startWorld() {
  if (worldStarted) {
    console.warn('[startWorld] 重入被拦截', new Error().stack.slice(0, 500));
    return;
  }
  worldStarted = true;
  bootState.markWorldStarted();
  await preloadWorld(); // 闸门期已预加载则瞬间完成;迟到(直开/noopening 抢跑)则在此等齐
  const { s, cam, rnd } = ctx;

  // 着色器预编译 + 纸色揭幕过渡 + 主循环启动(世界此刻才第一次渲染)
  if (rnd.compileAsync) rnd.compileAsync(s, cam).catch(() => {});
  const c3d = document.getElementById('c');
  if (c3d) c3d.style.visibility = 'visible';
  paperReveal(); // 纸色揭幕(2026-09-18 外迁 ui/reveal.js)
  loopManager.start();
}
ctx.scene.startWorld = startWorld;
expose('startWorld', startWorld);
expose('preloadState', function () {
  return worldBooted ? 'done' : worldBooting ? 'loading' : 'idle';
}); // 探针钩子:预加载是否已在电影期间完成
expose('bootState', bootState.default); // 引导期即暴露:生产诊断可见世界加载进度
expose('worldPhase', () => window.__worldPhase || '(未开始)');

// ===================== 引导期:UI 轻件与开场链路 =====================
function softImport(load) {
  load().catch(() => setTimeout(() => load().catch(() => console.info('[main] 可选模块暂未加载(不影响进馆)')), 1500));
}

// 世界启动失败兜底 UI 已外迁 ui/world-err.js(2026-09-18)

// 初见指引卡已外迁 gate/guide-card.js(2026-09-18)
ctx.ui.showGuideCard = showGuideCard;

// 性别配色已外迁 gate/housecolor.js(2026-09-18,houseMats 本归其所有)

// 协议配乐已外迁 ui/agreement-music.js(2026-09-18)

// ===================== 入口闸门 + 电影预热 =====================
import('./gate/openfilm.js').catch(function () {});
// 审计 P1-R2:动态 import 无超时语义——挂起时 __gateFailed 永不置位,
// watchOpening 空转、用户停在空屏。60s 未就绪即超时放行。
let gateSettled = false;
const gateTimeout = setTimeout(function () {
  if (gateSettled) return;
  gateSettled = true;
  if (!document.getElementById('b612Gate')) {
    bootState.markGateFailed();
    signAllConsents(); // 三连签已外迁 entrygate(2026-09-18)
    console.warn('[gate] 60s 未就绪,超时放行');
  }
}, 60000);
import('./gate/entrygate.js')
  .then(function (m) {
    if (gateSettled) return; // 超时已放行:迟到的闸门不再构建
    gateSettled = true;
    clearTimeout(gateTimeout);
    m.setupEntryGate({
      onGateReady: function () {},
      onEnter: function () {
        startAgreementMusic();
        bootState.markGatePassed();
        preloadWorld().catch(function () {}); // 电影期间后台预加载世界模块(只加载不渲染);失败由 startWorld 的 await 统一上报
      },
    });
  })
  .catch(function (e) {
    if (gateSettled) return;
    gateSettled = true;
    clearTimeout(gateTimeout);
    signAllConsents();
    bootState.markGateFailed();
    console.warn('[gate] 入口闸门初始化失败,已放行:', e.message);
  });

// ===================== 开场流程(唯一链路:闸门 → 电影 → startWorld) =====================
(function watchOpening() {
  const skipFilm =
    /noopening|noprologue|nofilm/.test(location.search) ||
    !!sessionStorage.getItem('skipOpening');
  let done = false;
  function tick() {
    if (done) return;
    // 等「闸门通过」信号(ENTER 置 gatePassed);闸门加载失败/超时走 gateFailed 兜底
    if (!bootState.get('gatePassed') && !bootState.get('gateFailed')) {
      setTimeout(tick, 300);
      return;
    }
    done = true;
    function finishIntro(deferMedia) {
      bootState.bumpIntroFired();
      // P1(2026-09-07 审计):世界启动失败此前是静默的——信标上报了,用户端却
      // 无限停在加载层。给一层可操作的「加载失败+重试」。
      if (ctx.startWorld)
        Promise.resolve(ctx.startWorld()).catch(function () {
          showWorldLoadError();
        });
      if (ctx.stopAgreementMusic) ctx.stopAgreementMusic();
      // 大屏轮播延迟启动(2026-09-18 外迁 video-wall.startBigscreenWhenReady)
      startBigscreenWhenReady(deferMedia);
    }
    if (skipFilm) {
      finishIntro(true);
      return;
    }
    import('./gate/openfilm.js')
      .then(function (m) {
        m.playOpeningFilm(function () {
          finishIntro(false);
        });
      })
      .catch(function (e) {
        console.warn('[film] 开幕电影加载失败,直接进馆:', e.message);
        finishIntro(true);
      });
  }
  setTimeout(tick, 1200);
})();

// C6 退出文案(2026-07-28):切走/关闭页面前留一句(不打断)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  const crowned = ctx.store && ctx.store.str('prefix') === 'B612 旅人·';
  ctx.ui.modeToast &&
    ctx.ui.modeToast(
      '你带走的不只是记忆。B612 留着你的光。' + (crowned ? ' 你的旅程，天穹与心象皆已完整。' : '')
    );
});
