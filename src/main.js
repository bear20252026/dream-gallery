// main.js — 入口模块：按原始执行顺序导入各副作用模块，最后启动动画循环
expose('BUILD', '2026-07-28-r9'); // 部署序号(诊断+刷新产物哈希,绕开边缘节点缓存的 404)
import { ctx } from './ctx.js';
import './error-report.js'; // 客户端报错反馈(2026-08-30):尽早挂载才能捕获启动期错误

import './ui/overlay.js'; // 弹层注册处(冷核心,必须最先 import:Esc 栈优先级靠监听器注册顺序)
import './state/store.js'; // 存档登记处(冷核心,紧随 overlay:全站 localStorage 唯一入口 ctx.store)
import './scene/scene.js'; // 场景/相机/渲染器 + 墙壁/地板/屋顶 + 天空 + 灯光
// 烟花 + 漂浮粒子:原 scene/effects.js 改为 core/effects-system.js(阶段3 切片),
// 不再副作用挂 ctx.media,改经组合根注入 deps 注册(见下方 createEffectsSystem 注册处)
import './scene/media.js'; // 2D音乐演奏器 + 视频墙 + HTML5音乐
import './gallery/signs.js'; // 户外牌子/白板入口/音乐入口
import './gallery/markers.js'; // YES/奕彤爱心/Adorable标记 + 地板照片
import './gallery/links.js'; // 超链接图标/卷轴/花园入口/滚动古文
import './gallery/paintings.js'; // 挂画系统 + 白板作品墙 + 3D放大系统
import './gallery/mode.js'; // 展示区模式(普通/特殊)+ 链接模型系统
import './gallery/dome-towers.js'; // Yazd 穹顶塔楼群(6 座围圆环绕画廊,按需异步加载)
import './museum/museum.js'; // 万镜博物馆:大堂+贵族房间世界(方案A试点,按需加载)
import './gate/settings.js'; // 昵称双渠道(进馆 5 秒弹窗 + ⚙设置)
import './gate/upload.js'; // 访客上传(照片/我的链接)+ AI 配文 + 悬浮路标
import './gate/housecolor.js'; // 房屋分组换色(墙壁/天花板/腰线/踢脚线,仅自己可见)
import './gate/quiz.js'; // 温柔度测试（弹窗 + 3D墙面板）
import './scene/desert.js'; // 西域沙海(无限区块地形/昆仑/水波/飞鸟/沙暴)
import './scene/player.js'; // 玩家/键盘/鼠标/触摸/小地图/跳跃滑翔
import './gate/quizgate.js'; // 入馆答题系统(悬浮答题屏 + 答题面板 + 门禁)
import './gate/prologue.js'; // 冷启动·互动序章(残镜四幕回放+"我愿意"抉择,首访播一次)
import { showOpening, hideOpening } from './ui/opening-bg.js'; // 首页专属开场:协议后的流动背景(z600)
import './kunlun/peaks.js'; // 昆仑巅彩蛋(90m 登飞来峰语音 / 100m 彩蛋视频)
import './kunlun/spirits.js'; // 六合灵蕴收集(天穹100%后开启:光柱指引/拾取/六齐终章)
import './kunlun/eternal.js'; // 空中永恒展厅·二期①(金门/六边形浮空展厅/晨光留影)
import './kunlun/ark.js'; // 灵蕴飞舟·二期②(山巅登舟/六航路首飞/罗盘往返)
import './kunlun/windchime.js'; // 风铃回响·二期③(西墙风铃/入场自鸣/24h三响/点击再响)
import './kunlun/fireplace.js'; // 暖色壁炉·二期③(西南墙壁炉/火焰粒子/灵蕴染色/靠近暖意)
import './kunlun/snowwin.js'; // 飘雪之窗·二期④(拱窗开闭/窗外飞雪/画上雪纱/风声)
import './kunlun/resetview.js'; // 重置视角·二期④(中央平台/最旧晨光画悬浮展演)

// 神话层延迟加载(非首屏必需，等场景就绪后异步加载，减小初始包体积 ~30%)
// 这些模块在首帧渲染后才触发，不影响首次加载速度
setTimeout(function () {
  import('./kunlun/peaks.js'); // 昆仑巅彩蛋
  import('./kunlun/spirits.js'); // 六合灵蕴收集
  import('./kunlun/eternal.js'); // 空中永恒展厅·二期①
  import('./kunlun/ark.js'); // 灵蕴飞舟·二期②
  import('./kunlun/windchime.js'); // 风铃回响·二期③
  import('./kunlun/fireplace.js'); // 暖色壁炉·二期③
  import('./kunlun/snowwin.js'); // 飘雪之窗·二期④
  import('./kunlun/avatar.js'); // FBX 角色(第三人称玩家模型, 异步加载)
}, 2000);
import './kunlun/letgo.js'; // 放下与召回·二期⑤(长按消解成光尘/空画框/罗盘召回;软删除铁律)
import './kunlun/finale.js'; // 终章三件套·二期⑥(俯瞰天穹/心象投影/灵蕴归位·六合藏梦人)
import { IdleState } from './player/states/PlayerStates.js'; // 移动状态机(2026-08-01)
import {
  initPostProcessing,
  renderPostProcessing,
  resizePostProcessing,
} from './scene/postprocessing.js'; // 后处理管线(2026-08-22)
import { initSentry } from './shared/sentry.js'; // Sentry 错误追踪(2026-08-22)
import { compositionRoot } from './core/composition-root.js'; // 组合根(阶段1,2026-08-27)
import { createToastSystem } from './core/toast-system.js'; // 示范积木:事件驱动 toast
import { createGameShellSystem } from './core/gameshell-system.js'; // 游戏外壳:手绘对话框+任务栏+系统菜单(2026-08-29)
import { setLoop, createLoopSystem, register } from './core/loop.js'; // 单一主循环 facade(阶段1)
import { createInputSystem } from './core/input.js'; // 统一输入 facade(阶段1·P1-3)
import { createAudioSystem } from './core/audio-system.js'; // 阶段2 垂直切片:空间音频积木(依赖注入,取代冻结 ctx 写)
import { createPerfMonitorSystem } from './core/perf-monitor-system.js'; // 阶段3 切片:性能监控积木(单循环驱动,删死 ctx import)
import { createEffectsSystem } from './core/effects-system.js'; // 阶段3 切片:粒子/烟花积木(从 LoopManager 上帝渲染器抽出,经 deps 注入)
import { createMediaSystem } from './core/media-system.js'; // 阶段3 切片:媒体逐帧积木(音乐画布+视频纹理,从 LoopManager 上帝渲染器抽出,经 deps 注入)
import { createStateSystem } from './core/state-system.js'; // 阶段3 切片:单向状态库(订阅事件总线,镜像命名空间状态进 game-state)
import { createUiSystem } from './core/ui-system.js'; // 阶段3 切片:UI 域生命周期收口(组合根拥有 overlay 关闭/销毁出口)
import { getGameState } from './core/game-state.js'; // 单例状态库(阶段3 store 真正化)

const { L, s, cam, rnd, pls, WH, skyUniforms, groundUniforms } = ctx;
const { jD, ks, pl, mv, drawMap } = ctx.player; // 玩家簇经命名空间取(别名=活委托,player.js Object.assign 后此处读到真值)
// 注意:updateFireworks/pG/pC 不在此解构——effects.js 支持热更新,重载后 ctx 上的引用会换新,
// 主循环必须在调用时从 ctx 读取(见下方粒子循环与烟花调用)

// ===================== 灯光限额(性能) =====================
// 光源总数直接决定着色器体积:实测单程序编译 59盏≈822ms / 24盏≈208ms / 13盏≈103ms。
// 每个片元着色器要为**所有**光源做循环,光源数是最贵的一项——比网格/贴图都贵。
//
// 2026-08-30 修复(实测场景 87 盏 → 卡顿 FPS 0.8):
//   1) 原第 98 行 `if (isMobile || o.userData.deco) rm.push(o)` 在电脑端恒为 false
//      —— `userData.deco` 全项目只在 gallery/links.js 赋值过(links 经 main.js:14 导入、modules.js 注册在跑),
//      实测 deco 灯数为 0。结果:电脑端**一盏灯都不移除**,限额形同虚设。
//   2) 原逻辑只处理 `o.isPointLight`,完全漏掉 40 盏 SpotLight
//      (每幅画一个射灯,paintings.js `wi < 40`),而 SpotLight 比 PointLight 更贵
//      (多方向/角度/penumbra 计算)。
// 现改为:走到 traverse 末尾的灯一律移除(即"不在保留名单内就删");
//   并新增 SpotLight 限额,只保留前 SPOT_KEEP 盏画框射灯。
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
      // 前 SPOT_KEEP 盏画框射灯保留,其余连 target 一起移除(target 也是场景节点)
      if (spotSeen < SPOT_KEEP) spotSeen++;
      else {
        rm.push(o);
        if (o.target && o.target.parent) rm.push(o.target);
      }
      return;
    }
    if (!o.isPointLight) return;
    if (ceil.has(o)) return; // 保留:命中的吊顶灯
    if (o.position.y > 30 || Math.abs(o.position.x) > 500) return; // 保留:钻石灯(高空)/昆仑信标(远方)
    rm.push(o); // 其余一律移除(不再依赖从未生效的 userData.deco)
  });
  rm.forEach((l) => l.parent && l.parent.remove(l));
  // 保留的吊顶灯同步削弱 pls 闪烁列表,避免对已移除灯的无效更新
  for (let i = pls.length - 1; i >= 0; i--) if (!ceil.has(pls[i].l)) pls.splice(i, 1);
  if (typeof window !== 'undefined') {
    expose('lightBudget', { removed: rm.length, keepEvery, spotKeep: SPOT_KEEP });
  }
}

// ===================== 后处理管线初始化(2026-08-22) =====================
initPostProcessing(rnd, s, cam);
// 关键接线:组合根唯一循环(loop-manager._executeRenderPhase)只认 ctx.scene.renderPostProcessing
// 来绘制 3D 场景。若此处不挂上,场景永远不被渲染——表现为「地图空白,但 HUD/对话框正常」。
ctx.scene.renderPostProcessing = renderPostProcessing;
ctx.scene.resizePostProcessing = resizePostProcessing;
// 阶段3 切片:性能监控改为 PerfMonitorSystem,由唯一组合根单循环驱动(原文件在 ?perf 下自起第二条 rAF,已消除)
compositionRoot.register(createPerfMonitorSystem({ renderer: rnd }));
initSentry(); // Sentry 错误追踪(需配置 DSN)
// 阶段2 垂直切片:空间音频作为 AudioSystem 接入组合根(经 deps 注入相机,绝不直接写冻结 ctx)
// 旧 initSpatialAudio()/exposeToCtx() 已移除 —— 这正是首页崩溃补丁的根因,现已用 DI 取代。
compositionRoot.register(
  createAudioSystem({
    scene: ctx.scene,
    getCamera: () => ctx.scene.cam, // 防腐适配:阶段3 相机迁移后改由 deps 直接提供
    eventBus: ctx.events,
  })
);
// 阶段3 切片:烟花 + 漂浮粒子作为 EffectsSystem 接入组合根(engine/animate 相位)。
// 原逻辑嵌在 LoopManager._executeUpdatePhase 里直接读 ctx.media.updateFireworks/pG/pC（上帝渲染器散点读取），
// 现改为 deps 注入 scene 与场景常量,由唯一单循环驱动;LoopManager 不再持有该逻辑。
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
// 阶段3 切片:媒体逐帧逻辑(音乐画布 drawMusicCanvas + 视频墙纹理 needsUpdate)作为 MediaSystem 接入组合根(presentation/render 相位)。
// 原逻辑散落在 LoopManager._executeUpdatePhase / _executeRenderPhase 直接读 ctx.media.*（上帝渲染器散点读取），
// 现改为 deps 注入 ctx.media,由唯一单循环驱动;LoopManager 不再持有该逻辑。
compositionRoot.register(createMediaSystem({ media: ctx.media }));
// 阶段3 切片:单向状态库 StateSystem(platform/bootstrap)订阅事件总线,把命名空间状态镜像进 game-state,
// 使 game-state 成为系统可读/可订阅的统一状态源(读模型);写者/读者零改动。Stage 4 可把写路径也收归此处,关闭 ctx 直写。
compositionRoot.register(
  createStateSystem({ eventBus: ctx.events, gameState: getGameState(), ctx })
);
// 阶段3 切片:UI 域生命周期收口 UiSystem(platform/bootstrap):overlay.js 全局 Esc 监听仍在 main.js 最先 import 以保证栈优先级,
// 但本 System.dispose 正式拥有关闭全部弹层/移除 Esc 监听的出口,使 ui 成为组合根可管理的生命周期单元。
compositionRoot.register(createUiSystem({ ctx }));
window.addEventListener('resize', () => {
  const w = innerWidth,
    h = innerHeight;
  rnd.setSize(w, h);
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
  resizePostProcessing(w, h);
});

// ===================== 动画（使用统一循环管理器）=====================
import { LoopManager } from './loop-manager.js';
import { expose } from './debug-hooks.js';
const loopManager = new LoopManager(ctx);
ctx.loopManager = loopManager;
setLoop(loopManager); // 注入唯一主循环到 core/loop facade(新积木经 deps.loop 获取)

// D4 低画质手动开关(2026-07-30):开启后强制最低 pixelRatio(最流畅),自适应只降不升
const lowQuality = !!ctx.store.json('lowQuality', false);
if (lowQuality) {
  loopManager.setLowQuality(true);
}
ctx.setLowQuality = (on) => loopManager.setLowQuality(on); // 供设置页罗盘调用

// 组合根:装载新架构积木(阶段1,2026-08-27)。toast-system 订阅 'ui:toast' 事件渲染提示,
// 全站 ctx.ui.modeToast(...) 经 mode.js 防腐转发层 emit 该事件 —— event-bus 首次被业务消费。
// 阶段1 补:loop-system(单一主循环 facade) + input-system(统一输入 facade,每帧镜像到总线)。
compositionRoot.register(createToastSystem());
compositionRoot.register(createGameShellSystem()); // 手绘游戏外壳(对话框/任务栏/菜单)
compositionRoot.register(createLoopSystem());
compositionRoot.register(createInputSystem(ctx.input));
compositionRoot.init();
// 可观测:浏览器控制台 / 验证脚本可打印确定性装配顺序(window.__compositionRoot.list())
expose('compositionRoot', compositionRoot);
// 可观测:单向状态库实例(配合 __compositionRoot,验证 store 真正化)
expose('gameState', getGameState());
// 把组合根每帧 update 注册进唯一主循环(经 core/loop facade,不再散点 ctx.onTick / 自起 rAF)
register((dt) => compositionRoot.update(dt));

// 启动统一循环管理器(唯一主循环)。旧 ctx.loop 不再自起 rAF,避免每帧双执行。
loopManager.start();

// 玩家状态机:启动时初始化为空闲状态
ctx._playerSM.change(new IdleState());
// 每帧更新状态机(在统一循环管理器的 tickers 中,紧随物理之后执行)
ctx.onTick(function (dt) {
  ctx._playerSM.tick(dt);
});

// 启动时预编译全部着色器(异步):把编译成本集中到加载屏期间,消灭运行时的编译卡顿
function fadeLoad() {
  L.style.opacity = '0';
  setTimeout(() => (L.style.display = 'none'), 800);
}
// 《元素共鸣准则》阅读卡(2026-07-25 主人修订):与昵称弹窗同规则——
// 只在未起名时出现,每次重进都弹;前 10 秒不可删;写过雅号后,本卡与昵称弹窗都不再出现
// 协议门控(2026-07-26):《用户协议》《隐私保护指引》未签署前,本卡不弹
function showGuideCard() {
  if (document.getElementById('guideCard')) return;
  if (
    !sessionStorage.getItem('agreementConsented') ||
    !sessionStorage.getItem('privacyConsented') ||
    !sessionStorage.getItem('communityConsented')
  )
    return;
  if (ctx.store.str('nick')) return; // 已起名:不再显现
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
  // 前 10 秒只锁「先逛逛」(关闭键);「读一读」立即可点(2026-07-26 主人修订:冻结是请人读,不是拦人读)
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

// ===================== 性别选择弹窗(2026-07-31 v2 全访客) =====================
// 问访客性别:女生维持现状,男生把建筑颜色调成蓝色
// v2: 移除 sessionStorage 协议检查(老访客新会话标记为空导致不显示),改为轮询等协议签完
function showGenderSelect() {
  // 已选择过则跳过
  if (ctx.store.flag('genderSelected')) return;
  // 协议未签完则 2 秒后再试(最多等 60 秒)
  if (
    !sessionStorage.getItem('agreementConsented') ||
    !sessionStorage.getItem('privacyConsented') ||
    !sessionStorage.getItem('communityConsented')
  ) {
    if (!window.__genderRetry) {
      window.__genderRetry = 1;
      setTimeout(() => {
        window.__genderRetry = 0;
        showGenderSelect();
      }, 2000);
    }
    return;
  }
  if (document.getElementById('genderOv')) return;
  const ov = document.createElement('div');
  ov.id = 'genderOv';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-label', '性别选择');
  ov.style.cssText =
    'position:fixed;inset:0;z-index:400;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.7)';
  const card = document.createElement('div');
  card.style.cssText =
    'background:rgba(30,18,28,0.95);border:1px solid rgba(255,214,170,0.35);border-radius:16px;padding:30px 40px;text-align:center;color:#ffe2c4;max-width:360px';
  card.innerHTML =
    '<div style="font-size:18px;letter-spacing:3px;margin-bottom:20px">你是男生还是女生？</div><div style="font-size:13px;opacity:.7;margin-bottom:24px">这会影响你的画廊配色方案</div>';
  const btnM = document.createElement('button');
  btnM.textContent = '男 生';
  btnM.setAttribute('aria-label', '选择男生配色');
  btnM.style.cssText =
    'padding:12px 32px;border:none;border-radius:10px;background:linear-gradient(135deg,#4a8fc0,#2a5f8c);color:#fff;cursor:pointer;margin-right:16px;font-size:15px;letter-spacing:2px';
  const btnF = document.createElement('button');
  btnF.textContent = '女 生';
  btnF.setAttribute('aria-label', '选择女生配色');
  btnF.style.cssText =
    'padding:12px 32px;border:none;border-radius:10px;background:linear-gradient(135deg,#e8a0b4,#c07090);color:#fff;cursor:pointer;font-size:15px;letter-spacing:2px';
  btnM.onclick = () => {
    ctx.store.mark('genderSelected');
    ctx.store.setStr('gender', 'male');
    applyGenderColor('male');
    ov.remove();
  };
  btnF.onclick = () => {
    ctx.store.mark('genderSelected');
    ctx.store.setStr('gender', 'female');
    ov.remove();
  };
  card.appendChild(btnM);
  card.appendChild(btnF);
  ov.appendChild(card);
  document.body.appendChild(ov);
}
// 应用性别对应的建筑颜色
function applyGenderColor(gender) {
  if (gender !== 'male') return;
  // 男生:建筑墙壁调成蓝色(黛蓝 #3a5a8c)
  const blueHex = '#3a5a8c';
  // 延迟执行,等 housecolor.js 加载完成;多轮重试直到 houseMats 就绪
  let tries = 0;
  (function tryApply() {
    tries++;
    if (tries > 20) return; // 最多重试 20 次(40秒)
    if (!(ctx.gallery && ctx.gallery.houseMats && ctx.gallery.houseMats.wall)) {
      setTimeout(tryApply, 2000);
      return;
    }
    const houseMats = ctx.gallery.houseMats;
    const mats = houseMats.wall;
    // 直接用材质自带的 color API 改色(不依赖 THREE 全局引用)
    try {
      mats.forEach((m) => {
        if (m && m.color && m.color.set) {
          m.color.set(blueHex); // THREE.Color.set 接受 hex 字符串
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
// 性别选择:未选择过则轮询等待协议签完后显示(所有访客统一,不再区分新老)
if (!ctx.store.flag('genderSelected')) {
  setTimeout(showGenderSelect, 4000);
}
// 启动时应用已保存的性别颜色
const savedGender = ctx.store.str('gender');
if (savedGender) applyGenderColor(savedGender);

// 快速进馆(2026-07-25 主人定):加载屏 1.2s 即退场,着色器在后台继续编译,
// 物体编译好一个出现一个(并行编译不阻塞主线程),不再整屏等待
setTimeout(fadeLoad, 1200);

// ===================== 协议文档配乐(2026-07-31) =====================
// 浏览3个协议文档时循环播放00001.m4a,进入画廊后立即停止
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
// 导出给 prologue.js 使用(序章结束时停止协议配乐)
ctx.stopAgreementMusic = stopAgreementMusic;

// 协议先行(2026-07-27 主人定):三连读——用户协议→隐私指引→游戏社区公约。
// 首访严格(每份 20s+滚底+打勾+锁死),回访轻量(照弹但即点即走);中途中断,下次从"未签的第一份"接着弹
if (
  !sessionStorage.getItem('agreementConsented') ||
  !sessionStorage.getItem('privacyConsented') ||
  !sessionStorage.getItem('communityConsented')
) {
  setTimeout(function () {
    const url = !sessionStorage.getItem('agreementConsented')
      ? 'agreement.html?consent=1'
      : !sessionStorage.getItem('privacyConsented')
        ? 'privacy.html?consent=1'
        : 'community.html?consent=1';
    window.openPanel(url, '协议与公约');
    startAgreementMusic(); // 开始播放协议配乐
  }, 1800);
}
if (rnd.compileAsync) rnd.compileAsync(s, cam).catch(() => {});

// ===================== 开场流程统一调度(2026-08-29 顺序梳理) =====================
// 正常游戏顺序(单一入口,杜绝双轮询抢跑):
//   ① 协议三连读(用户协议 → 隐私指引 → 社区公约,必须签完)
//   ↓
//   ② 首页开场(开屏:逐字启程仪式 → 标题层 → 点「进入画廊」)
//   ↓
//   ③ 残镜序章(仅首访播一次;由本处在开屏结束后显式驱动)
//   ↓
//   ④ 3D 画廊
// 2026-08-29 修订:此前 prologue.js 与开场层各自轮询 consent,存在竞态——
// 序章可能在开场层之前抢跑(z-index 500 被 600 盖住,用户在开屏上点击时剧情已播完)。
// 现改为:序章一律由本处驱动;prologue.js 仅保留"开场层不可用"时的延迟兜底。
function startPrologueIfNeeded() {
  if (!ctx.store.flag('prologueDone') && ctx.startPrologue) ctx.startPrologue();
}
(function watchOpening() {
  function allConsented() {
    return (
      sessionStorage.getItem('agreementConsented') &&
      sessionStorage.getItem('privacyConsented') &&
      sessionStorage.getItem('communityConsented')
    );
  }
  // 测试/探针可加 ?noopening 或置 skipOpening 跳过开场层(与 ?noprologue 同机制)
  const skipOpening = /noopening/.test(location.search) || !!sessionStorage.getItem('skipOpening');
  let done = false;
  function tick() {
    if (done) return;
    // ① 协议未签完:一律等待(协议先行)
    if (!allConsented()) {
      setTimeout(tick, 1000);
      return;
    }
    done = true;
    // 开场层被显式跳过:标记后直接进序章(不再等开屏)
    if (skipOpening) {
      window.__openingSplashSkipped = true;
      startPrologueIfNeeded();
      return;
    }
    // ② 开屏 → 用户点「进入画廊」→ ③ 序章
    showOpening(function () {
      hideOpening();
      startPrologueIfNeeded();
    });
  }
  setTimeout(tick, 1200);
})();

import './visitor-fp.js'; // 访客身份采集+踢出通知(2026-08-30 权限精简):持久ID三处冗余+多维指纹+SSE踢出监听
// 梦幻画廊 展厅+回字大厅 已启动

// C6 退出文案(2026-07-28,设计文档第 19 步):切走/关闭页面时留一句;切回时即见
// (已冠前缀的六合藏梦人追加一行;modeToast 轻提示,不打断)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  const crowned = ctx.store && ctx.store.str('prefix') === '六合藏梦人·';
  ctx.ui.modeToast &&
    ctx.ui.modeToast(
      '你带走的不只是记忆。昆仑留着你的光。' + (crowned ? ' 六合藏梦人，天穹与心象皆已完整。' : '')
    );
});
