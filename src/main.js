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

// ===================== 世界阶段:startWorld =====================
// 按原 main.js import 顺序动态加载全部世界模块,随后执行原顶层构建代码
// (灯光限额/后处理接线/组合根系统注册/状态机/坐标 HUD)。加载完成才启动主循环。
let worldStarted = false;
async function startWorld() {
  if (worldStarted) return;
  worldStarted = true;
  window.__worldStarted = true;

  // —— 世界模块按原 import 顺序加载(顺序即依赖顺序,不可调换) ——
  await import('./scene/scene.js'); // 场景/相机/渲染器 + 墙壁/地板/屋顶 + 天空 + 灯光
  await import('./scene/media.js'); // 2D音乐演奏器 + 视频墙 + HTML5音乐
  await import('./gallery/signs.js'); // 户外牌子/音乐入口
  await import('./gallery/fountains.js'); // 户外四座 Zsolnay 喷泉
  await import('./gallery/markers.js'); // YES/奕彤爱心/Adorable标记 + 地板照片
  await import('./gallery/links.js'); // 超链接图标/卷轴/花园入口/滚动古文
  await import('./gallery/paintings.js'); // 挂画系统 + 白板作品墙 + 3D放大系统
  await import('./gallery/mode.js'); // 展示区模式 + 链接模型系统
  await import('./gallery/dome-towers.js'); // Yazd 穹顶塔楼群
  await import('./gate/settings.js'); // 昵称双渠道(进馆 5 秒弹窗 + ⚙设置)
  await import('./gate/upload.js'); // 访客上传(照片/我的链接)+ AI 配文 + 悬浮路标
  await import('./gate/housecolor.js'); // 房屋分组换色
  await import('./gate/quiz.js'); // 温柔度测试(弹窗 + 3D墙面板)
  await import('./scene/desert.js'); // 西域沙海(无限区块地形/昆仑/水波/飞鸟/沙暴)
  await import('./scene/player.js'); // 玩家/键盘/鼠标/触摸/小地图/跳跃滑翔
  await import('./gate/quizgate.js'); // 入馆答题系统(悬浮答题屏 + 答题面板 + 门禁)
  // 昆仑层(二期):peaks→spirits→eternal→ark→windchime→fireplace→snowwin,
  // 然后 planets(石门/传送台/六星世界;须在 eternal 之后,groundOverride 链)→story-dialogs→resetview
  await import('./kunlun/peaks.js'); // 昆仑巅彩蛋(90m 登飞来峰语音 / 100m 彩蛋视频)
  await import('./kunlun/spirits.js'); // 六合灵蕴收集
  await import('./kunlun/eternal.js'); // 空中永恒展厅·二期①
  await import('./kunlun/ark.js'); // 灵蕴飞舟·二期②
  await import('./kunlun/windchime.js'); // 风铃回响·二期③
  await import('./kunlun/fireplace.js'); // 暖色壁炉·二期③
  await import('./kunlun/snowwin.js'); // 飘雪之窗·二期④
  await import('./kunlun/planets.js'); // B612 六星章节:星门+传送石台都在此构建(漏载=石门消失,2026-09-06)
  await import('./kunlun/story-dialogs.js'); // 小世界情景对话(须在 planets 之后)
  await import('./kunlun/resetview.js'); // 重置视角·二期④
  await import('./kunlun/letgo.js'); // 放下与召回·二期⑤
  await import('./kunlun/finale.js'); // 终章三件套·二期⑥
  await import('./player/states/PlayerStates.js'); // 移动状态机
  const pp = await import('./scene/postprocessing.js'); // 后处理管线

  // —— 以下为原 main.js 顶层构建代码(依赖上述模块的副作用,顺序不可调换) ——
  const { s, cam, rnd, pls } = ctx;

  // ===================== 灯光限额(性能) =====================
  // 光源总数直接决定着色器体积:实测单程序编译 59盏≈822ms / 24盏≈208ms / 13盏≈103ms。
  // 保留名单:命中的吊顶灯(每 N 留 1) + 高空钻石灯(y>30) + 远方昆仑信标(|x|>500)。
  {
    const isMobile = 'ontouchstart' in window && Math.min(screen.width, screen.height) < 768;
    const keepEvery = isMobile ? 3 : 2;
    const SPOT_KEEP = isMobile ? 4 : 10; // 画框射灯保留数(其余画作靠环境光)
    const ceil = new Set(pls.filter((p, i) => i % keepEvery === 0).map((p) => p.l));
    const rm = [];
    let spotSeen = 0;
    s.traverse((o) => {
      if (o.isSpotLight) {
        if (spotSeen < SPOT_KEEP) spotSeen++;
        else {
          rm.push(o);
          if (o.target && o.target.parent) rm.push(o.target);
        }
        return;
      }
      if (!o.isPointLight) return;
      if (ceil.has(o)) return; // 保留:命中的吊顶灯
      if (o.position.y > 30 || Math.abs(o.position.x) > 500) return; // 保留:钻石灯/昆仑信标
      rm.push(o); // 其余一律移除
    });
    rm.forEach((l) => l.parent && l.parent.remove(l));
    for (let i = pls.length - 1; i >= 0; i--) if (!ceil.has(pls[i].l)) pls.splice(i, 1);
    expose('lightBudget', { removed: rm.length, keepEvery, spotKeep: SPOT_KEEP });
  }

  // ===================== 后处理管线初始化(2026-08-22) =====================
  pp.initPostProcessing(rnd, s, cam);
  ctx.scene.renderPostProcessing = pp.renderPostProcessing;
  ctx.scene.resizePostProcessing = pp.resizePostProcessing;
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

  // 着色器预编译 + 主画布显形 + 主循环启动(世界此刻才第一次渲染)
  if (rnd.compileAsync) rnd.compileAsync(s, cam).catch(() => {});
  const c3d = document.getElementById('c');
  if (c3d) c3d.style.visibility = 'visible';
  loopManager.start();
}
ctx.startWorld = startWorld;
expose('startWorld', startWorld);

// ===================== 引导期:UI 轻件与开场链路 =====================
function softImport(load) {
  load().catch(() => setTimeout(() => load().catch(() => console.info('[main] 可选模块暂未加载(不影响进馆)')), 1500));
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
    'position:fixed;left:50%;top:64%;transform:translateX(-50%);z-index:75;background:rgba(30,18,28,0.95);border:1px solid rgba(255,214,170,0.35);border-radius:16px;padding:20px 26px;text-align:center;color:#ffe2c4';
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
import('./gate/entrygate.js')
  .then(function (m) {
    m.setupEntryGate({
      onGateReady: function () {},
      onEnter: function () {
        startAgreementMusic();
        window.__gatePassed = true;
      },
    });
  })
  .catch(function (e) {
    sessionStorage.setItem('agreementConsented', '1');
    sessionStorage.setItem('privacyConsented', '1');
    sessionStorage.setItem('communityConsented', '1');
    window.__gateFailed = true;
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
    // 等「闸门通过」信号(ENTER 置 __gatePassed);闸门加载失败走 __gateFailed 兜底
    if (!window.__gatePassed && !window.__gateFailed) {
      setTimeout(tick, 300);
      return;
    }
    done = true;
    function finishIntro(deferMedia) {
      window.__introFired = (window.__introFired || 0) + 1;
      if (ctx.startWorld) ctx.startWorld();
      if (ctx.stopAgreementMusic) ctx.stopAgreementMusic();
      ctx.store.mark('prologueDone');
      if (deferMedia) {
        let started = false;
        const go = function () {
          if (started) return;
          started = true;
          if (ctx.startVidSeq) ctx.startVidSeq();
        };
        document.addEventListener('click', go, { once: true });
        document.addEventListener('touchstart', go, { once: true });
        setTimeout(go, 4000);
      } else if (ctx.startVidSeq) ctx.startVidSeq();
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
  const crowned = ctx.store && ctx.store.str('prefix') === '六合藏梦人·';
  ctx.ui.modeToast &&
    ctx.ui.modeToast(
      '你带走的不只是记忆。昆仑留着你的光。' + (crowned ? ' 六合藏梦人，天穹与心象皆已完整。' : '')
    );
});
