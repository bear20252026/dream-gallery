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
import { Z } from './shared/z-layers.mjs'; // 开场链路状态登记册(审计 P2:收编 window.__* 标志)

// ===================== 主画布视觉保险 + 加载屏交接 =====================
// 主画布开机隐藏:闸门/电影期间世界不可见——不是遮盖,startWorld 时才显形,
// 配合世界模块整体后置,构成"电影落定 → 世界才构建+渲染"的硬顺序。
const loopManager = new LoopManager(ctx); // 构造轻量,引导期即可;start() 在 startWorld 才调
ctx.loopManager = loopManager;
setLoop(loopManager); // 注入唯一主循环 facade(新积木经 deps.loop 获取)

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
async function preloadWorld() {
  // —— 世界模块按原 import 顺序加载(逐模块进度可观测,失败上报) ——
  try { window.__worldPhase = '场景'; await import('./scene/scene.js'); } catch (e) { window.__worldPhase = '失败:场景'; console.error('[startWorld] 场景 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: scene/scene.js ' + e.message); throw e; }
  try { window.__worldPhase = '媒体'; await import('./scene/media.js'); } catch (e) { window.__worldPhase = '失败:媒体'; console.error('[startWorld] 媒体 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: scene/media.js ' + e.message); throw e; }
  try { window.__worldPhase = '牌子'; await import('./gallery/signs.js'); } catch (e) { window.__worldPhase = '失败:牌子'; console.error('[startWorld] 牌子 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: gallery/signs.js ' + e.message); throw e; }
  try { window.__worldPhase = '喷泉'; await import('./gallery/fountains.js'); } catch (e) { window.__worldPhase = '失败:喷泉'; console.error('[startWorld] 喷泉 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: gallery/fountains.js ' + e.message); throw e; }
  try { window.__worldPhase = '标记'; await import('./gallery/markers.js'); } catch (e) { window.__worldPhase = '失败:标记'; console.error('[startWorld] 标记 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: gallery/markers.js ' + e.message); throw e; }
  try { window.__worldPhase = '链接'; await import('./gallery/links.js'); } catch (e) { window.__worldPhase = '失败:链接'; console.error('[startWorld] 链接 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: gallery/links.js ' + e.message); throw e; }
  try { window.__worldPhase = '挂画'; await import('./gallery/paintings.js'); } catch (e) { window.__worldPhase = '失败:挂画'; console.error('[startWorld] 挂画 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: gallery/paintings.js ' + e.message); throw e; }
  try { window.__worldPhase = '模式'; await import('./gallery/mode.js'); } catch (e) { window.__worldPhase = '失败:模式'; console.error('[startWorld] 模式 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: gallery/mode.js ' + e.message); throw e; }
  try { window.__worldPhase = '塔楼'; await import('./gallery/dome-towers.js'); } catch (e) { window.__worldPhase = '失败:塔楼'; console.error('[startWorld] 塔楼 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: gallery/dome-towers.js ' + e.message); throw e; }
  try { window.__worldPhase = '设置'; await import('./gate/settings.js'); } catch (e) { window.__worldPhase = '失败:设置'; console.error('[startWorld] 设置 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: gate/settings.js ' + e.message); throw e; }
  try { window.__worldPhase = '上传'; await import('./gate/upload.js'); } catch (e) { window.__worldPhase = '失败:上传'; console.error('[startWorld] 上传 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: gate/upload.js ' + e.message); throw e; }
  try { window.__worldPhase = '房屋色'; await import('./gate/housecolor.js'); } catch (e) { window.__worldPhase = '失败:房屋色'; console.error('[startWorld] 房屋色 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: gate/housecolor.js ' + e.message); throw e; }
  try { window.__worldPhase = '温柔度'; await import('./gate/quiz.js'); } catch (e) { window.__worldPhase = '失败:温柔度'; console.error('[startWorld] 温柔度 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: gate/quiz.js ' + e.message); throw e; }
  try { window.__worldPhase = '沙漠'; await import('./scene/desert.js'); } catch (e) { window.__worldPhase = '失败:沙漠'; console.error('[startWorld] 沙漠 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: scene/desert.js ' + e.message); throw e; }
  try { window.__worldPhase = '玩家'; await import('./scene/player.js'); } catch (e) { window.__worldPhase = '失败:玩家'; console.error('[startWorld] 玩家 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: scene/player.js ' + e.message); throw e; }
  try { window.__worldPhase = '答题门'; await import('./gate/quizgate.js'); } catch (e) { window.__worldPhase = '失败:答题门'; console.error('[startWorld] 答题门 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: gate/quizgate.js ' + e.message); throw e; }
  try { window.__worldPhase = '远方山巅'; await import('./kunlun/peaks.js'); } catch (e) { window.__worldPhase = '失败:远方山巅'; console.error('[startWorld] 昆仑巅 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: kunlun/peaks.js ' + e.message); throw e; }
  try { window.__worldPhase = '灵蕴'; await import('./kunlun/spirits.js'); } catch (e) { window.__worldPhase = '失败:灵蕴'; console.error('[startWorld] 灵蕴 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: kunlun/spirits.js ' + e.message); throw e; }
  try { window.__worldPhase = '永恒厅'; await import('./kunlun/eternal.js'); } catch (e) { window.__worldPhase = '失败:永恒厅'; console.error('[startWorld] 永恒厅 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: kunlun/eternal.js ' + e.message); throw e; }
  try { window.__worldPhase = '飞舟'; await import('./kunlun/ark.js'); } catch (e) { window.__worldPhase = '失败:飞舟'; console.error('[startWorld] 飞舟 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: kunlun/ark.js ' + e.message); throw e; }
  try { window.__worldPhase = '风铃'; await import('./kunlun/windchime.js'); } catch (e) { window.__worldPhase = '失败:风铃'; console.error('[startWorld] 风铃 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: kunlun/windchime.js ' + e.message); throw e; }
  try { window.__worldPhase = '壁炉'; await import('./kunlun/fireplace.js'); } catch (e) { window.__worldPhase = '失败:壁炉'; console.error('[startWorld] 壁炉 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: kunlun/fireplace.js ' + e.message); throw e; }
  try { window.__worldPhase = '雪窗'; await import('./kunlun/snowwin.js'); } catch (e) { window.__worldPhase = '失败:雪窗'; console.error('[startWorld] 雪窗 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: kunlun/snowwin.js ' + e.message); throw e; }
  try { window.__worldPhase = '星球世界'; await import('./kunlun/planets.js'); } catch (e) { window.__worldPhase = '失败:星球世界'; console.error('[startWorld] 星球世界 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: kunlun/planets.js ' + e.message); throw e; }
  try { window.__worldPhase = '对话'; await import('./kunlun/story-dialogs.js'); } catch (e) { window.__worldPhase = '失败:对话'; console.error('[startWorld] 对话 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: kunlun/story-dialogs.js ' + e.message); throw e; }
  try { window.__worldPhase = '石门'; await import('./gallery/portal.js'); } catch (e) { window.__worldPhase = '失败:石门'; console.error('[startWorld] 石门 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: gallery/portal.js ' + e.message); throw e; }
  try { window.__worldPhase = '坠机点'; await import('./gallery/crash-site.js'); } catch (e) { window.__worldPhase = '失败:坠机点'; console.error('[startWorld] 坠机点 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: gallery/crash-site.js ' + e.message); throw e; }
  try { window.__worldPhase = '重置视角'; await import('./kunlun/resetview.js'); } catch (e) { window.__worldPhase = '失败:重置视角'; console.error('[startWorld] 重置视角 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: kunlun/resetview.js ' + e.message); throw e; }
  try { window.__worldPhase = '放下'; await import('./kunlun/letgo.js'); } catch (e) { window.__worldPhase = '失败:放下'; console.error('[startWorld] 放下 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: kunlun/letgo.js ' + e.message); throw e; }
  try { window.__worldPhase = '终章'; await import('./kunlun/finale.js'); } catch (e) { window.__worldPhase = '失败:终章'; console.error('[startWorld] 终章 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: kunlun/finale.js ' + e.message); throw e; }
  try { window.__worldPhase = '状态机'; await import('./player/states/PlayerStates.js'); } catch (e) { window.__worldPhase = '失败:状态机'; console.error('[startWorld] 状态机 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: player/states/PlayerStates.js ' + e.message); throw e; }
  try { window.__worldPhase = '后处理'; await import('./scene/postprocessing.js'); } catch (e) { window.__worldPhase = '失败:后处理'; console.error('[startWorld] 后处理 加载失败:', e.message); if (window.__reportError) window.__reportError('boot', 'startWorld 模块失败: scene/postprocessing.js ' + e.message); throw e; }

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
  ctx.setLowQuality = (on) => loopManager.setLowQuality(on);

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
  ctx._playerSM.change(new IdleState());
  ctx.onTick(function (dt) {
    ctx._playerSM.tick(dt);
  });

  // 世界坐标读数栏(F3 开关,一键复制)
  const { mountCoordHUD } = await import('./ui/coord-hud.js');
  mountCoordHUD(ctx);

  // 性别配色(老档案兼容):等 housecolor.js 就绪后应用
  const savedGender = ctx.store.str('gender');
  if (savedGender) applyGenderColor(savedGender);

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
}

async function startWorld() {
  if (worldStarted) return;
  worldStarted = true;
  bootState.markWorldStarted();
  await preloadWorld(); // 闸门期已预加载则瞬间完成;迟到(直开/noopening 抢跑)则在此等齐
  const { s, cam, rnd } = ctx;

  // 着色器预编译 + 纸色揭幕过渡 + 主循环启动(世界此刻才第一次渲染)
  if (rnd.compileAsync) rnd.compileAsync(s, cam).catch(() => {});
  const c3d = document.getElementById('c');
  if (c3d) c3d.style.visibility = 'visible';
  // 纸色揭幕(2026-09-06 主人定:从画走进现实的连续感):
  // 世界容器先垫纸色不透明打底(与电影最后一帧同色系),世界首帧渲染完成后纸幕淡出。
  const cWrap = document.getElementById('c');
  if (cWrap) {
    cWrap.style.background = '#f3ead2';
    cWrap.style.opacity = '0';
    cWrap.style.transition = 'opacity 1.6s ease';
    requestAnimationFrame(function () {
      cWrap.style.opacity = '1';
    });
    setTimeout(function () {
      cWrap.style.background = '';
      cWrap.style.transition = '';
      cWrap.style.opacity = '';
    }, 1800);
  }
  loopManager.start();
}
ctx.startWorld = startWorld;
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

// P1(2026-09-07 审计):世界启动失败的兜底 UI(纸色,与开场视觉同系)。
// 模块加载失败多为网络抖动,重载即愈;缺项详情留在 console(__bootCheck/__worldPhase)。
function showWorldLoadError() {
  if (document.getElementById('worldErr')) return;
  const d = document.createElement('div');
  d.id = 'worldErr';
  d.style.cssText =
    'position:fixed;inset:0;z-index:' +
    (Z.loading + 1) +
    ';display:flex;flex-direction:column;gap:20px;align-items:center;justify-content:center;' +
    'background:#f3ead2;color:#4e4237;font-family:Georgia,serif;text-align:center;padding:24px';
  const t = document.createElement('div');
  t.style.cssText = 'font-size:19px;letter-spacing:3px';
  t.textContent = '世界没能落进画里';
  const s = document.createElement('div');
  s.style.cssText = 'font-size:13px;opacity:.75;letter-spacing:1px;line-height:1.9';
  s.textContent = '大概是网络抖了一下。检查连接后,重新开始这段旅程。';
  const b = document.createElement('button');
  b.textContent = '重 新 加 载';
  b.style.cssText =
    'padding:12px 34px;border:1px solid rgba(90,72,50,.45);border-radius:24px;background:transparent;' +
    'color:#4e4237;font-size:15px;letter-spacing:4px;cursor:pointer;font-family:inherit';
  b.onclick = function () {
    location.reload();
  };
  d.appendChild(t);
  d.appendChild(s);
  d.appendChild(b);
  document.body.appendChild(d);
}

// 《元素共鸣准则》阅读卡(settings.js 4s 后调用)
function showGuideCard() {
  if (document.getElementById('guideCard')) return;
  if (
    !sessionStorage.getItem('agreementConsented') ||
    !sessionStorage.getItem('privacyConsented') ||
    !sessionStorage.getItem('communityConsented')
  )
    return;
  if (ctx.store.str('nick')) return;
  const c = document.createElement('div');
  c.id = 'guideCard';
  c.setAttribute('role', 'dialog');
  c.setAttribute('aria-modal', 'false');
  c.setAttribute('aria-label', '初见指引');
  c.style.cssText =
    'position:fixed;left:50%;top:64%;transform:translateX(-50%);z-index:' + Z.guideCard + ';background:rgba(30,18,28,0.95);border:1px solid rgba(255,214,170,0.35);border-radius:16px;padding:20px 26px;text-align:center;color:#ffe2c4';
  c.innerHTML =
    '<div style="font-size:15px;letter-spacing:2px;margin-bottom:10px">三千年来，第一个带着真意推开这扇门的，是你。<br>墙已经空了太久——挂上你的第一幅画吧。</div><div style="font-size:12px;letter-spacing:2px;margin-bottom:12px;opacity:.7">初见画廊,不妨先读《元素共鸣准则》</div>';
  const a = document.createElement('button');
  a.textContent = '读 一 读';
  a.setAttribute('aria-label', '阅读元素共鸣准则');
  a.style.cssText =
    'padding:9px 22px;border:none;border-radius:9px;background:linear-gradient(135deg,#c98a4b,#8a5a2a);color:#fff;cursor:pointer;margin-right:10px';
  a.onclick = () => {
    window.openPanel('guide.html', '元素共鸣准则');
    c.remove();
  };
  const b = document.createElement('button');
  b.textContent = '先逛逛';
  b.style.cssText =
    'padding:9px 22px;border:1px solid rgba(255,255,255,0.25);border-radius:9px;background:transparent;color:#dcc;cursor:pointer';
  b.onclick = () => {
    c.remove();
  };
  c.appendChild(a);
  c.appendChild(b);
  document.body.appendChild(c);
  let left = 10;
  b.disabled = true;
  b.style.opacity = '0.5';
  b.textContent = '先逛逛(' + left + 's)';
  const t = setInterval(function () {
    left--;
    if (left <= 0) {
      clearInterval(t);
      b.disabled = false;
      b.style.opacity = '';
      b.textContent = '先逛逛';
    } else b.textContent = '先逛逛(' + left + 's)';
  }, 1000);
}
ctx.showGuideCard = showGuideCard;

// 性别配色(老档案兼容;新访客无性别门槛)——世界阶段应用(houseMats 由 housecolor.js 挂载)
function applyGenderColor(gender) {
  if (gender !== 'male') return;
  const blueHex = '#3a5a8c';
  let tries = 0;
  (function tryApply() {
    tries++;
    if (tries > 20) return;
    if (!(ctx.gallery && ctx.gallery.houseMats && ctx.gallery.houseMats.wall)) {
      setTimeout(tryApply, 2000);
      return;
    }
    const mats = ctx.gallery.houseMats.wall;
    try {
      mats.forEach((m) => {
        if (m && m.color && m.color.set) {
          m.color.set(blueHex);
          if (m.needsUpdate) m.needsUpdate = true;
        }
      });
      if (ctx.store.setHouseColor) ctx.store.setHouseColor('wall', blueHex);
    } catch (e) {
      console.warn('[gender] 配色应用失败,重试:', e.message);
      setTimeout(tryApply, 2000);
    }
  })();
}

// ===================== 协议文档配乐(2026-07-31) =====================
const agreementMusic = new Audio('https://cdn.cloudbear.cloud/music/00001.m4a');
agreementMusic.loop = true;
agreementMusic.volume = 0.4;
let agreementMusicPlaying = false;
function startAgreementMusic() {
  if (agreementMusicPlaying) return;
  agreementMusicPlaying = true;
  agreementMusic.play().catch(() => {});
}
function stopAgreementMusic() {
  if (!agreementMusicPlaying) return;
  agreementMusicPlaying = false;
  agreementMusic.pause();
  agreementMusic.currentTime = 0;
}
ctx.stopAgreementMusic = stopAgreementMusic;

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
    sessionStorage.setItem('agreementConsented', '1');
    sessionStorage.setItem('privacyConsented', '1');
    sessionStorage.setItem('communityConsented', '1');
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
    sessionStorage.setItem('agreementConsented', '1');
    sessionStorage.setItem('privacyConsented', '1');
    sessionStorage.setItem('communityConsented', '1');
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
      ctx.store.mark('prologueDone');
      // 大屏轮播启动(审计 P1-R1 完整版):skip/播完/旁路三条路都可能先于
      // video-wall.js 就绪到达——统一轮询等待 startVidSeq 出现(最多 30s)。
      // deferMedia 仅控制布防时机(先等首次交互/4s),不是只试一次。
      let started = false;
      const tryStart = function () {
        if (started) return true;
        if (!ctx.startVidSeq) return false;
        started = true;
        ctx.startVidSeq();
        return true;
      };
      const armPoll = function () {
        const poll = setInterval(function () {
          if (tryStart()) clearInterval(poll);
        }, 300);
        setTimeout(function () {
          clearInterval(poll);
          if (!started) console.warn('[main] startVidSeq 60s 未就绪,大屏轮播本轮放弃');
        }, 60000);
      };
      if (deferMedia) {
        let armed = false;
        const arm = function () {
          if (armed) return;
          armed = true;
          armPoll();
        };
        document.addEventListener('click', arm, { once: true });
        document.addEventListener('touchstart', arm, { once: true });
        setTimeout(arm, 4000);
      } else {
        armPoll();
      }
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
