// main.js — 入口模块：按原始执行顺序导入各副作用模块，最后启动动画循环
window.__BUILD__ = '2026-07-28-r9'; // 部署序号(诊断+刷新产物哈希,绕开边缘节点缓存的 404)
import { ctx } from './ctx.js';

import './ui/overlay.js'; // 弹层注册处(冷核心,必须最先 import:Esc 栈优先级靠监听器注册顺序)
import './state/store.js'; // 存档登记处(冷核心,紧随 overlay:全站 localStorage 唯一入口 ctx.store)
import './scene/scene.js'; // 场景/相机/渲染器 + 墙壁/地板/屋顶 + 天空 + 灯光
import './scene/effects.js'; // 烟花 + 粒子
import './scene/media.js'; // 2D音乐演奏器 + 视频墙 + HTML5音乐
import './gallery/signs.js'; // 户外牌子/白板入口/音乐入口
import './gallery/markers.js'; // YES/奕彤爱心/Adorable标记 + 地板照片
import './gallery/links.js'; // 超链接图标/卷轴/花园入口/滚动古文
import './gallery/paintings.js'; // 挂画系统 + 白板作品墙 + 3D放大系统
import './gallery/mode.js'; // 展示区模式(普通/特殊)+ 链接模型系统
import './gate/settings.js'; // 昵称双渠道(进馆 5 秒弹窗 + ⚙设置)
import './gate/upload.js'; // 访客上传(照片/我的链接)+ AI 配文 + 悬浮路标
import './gate/housecolor.js'; // 房屋分组换色(墙壁/天花板/腰线/踢脚线,仅自己可见)
import './gate/quiz.js'; // 温柔度测试（弹窗 + 3D墙面板）
import './scene/desert.js'; // 西域沙海(无限区块地形/昆仑/水波/飞鸟/沙暴)
import './scene/player.js'; // 玩家/键盘/鼠标/触摸/小地图/跳跃滑翔
import './gate/quizgate.js'; // 入馆答题系统(悬浮答题屏 + 答题面板 + 门禁)
import './gate/prologue.js'; // 冷启动·互动序章(残镜四幕回放+"我愿意"抉择,首访播一次)
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

const {
  L,
  s,
  cam,
  rnd,
  pls,
  WH,
  skyUniforms,
  groundUniforms,
  drawMusicCanvas,
  vidTex,
  vidEl,
  v45Tex,
  v45El,
  tickPhysics,
} = ctx;
const { jD, ks, pl, mv, drM } = ctx.player; // 玩家簇经命名空间取(别名=活委托,player.js Object.assign 后此处读到真值)
// 注意:updateFireworks/pG/pC 不在此解构——effects.js 支持热更新,重载后 ctx 上的引用会换新,
// 主循环必须在调用时从 ctx 读取(见下方粒子循环与烟花调用)

// ===================== 灯光限额(性能) =====================
// 点光源总数直接决定着色器体积:实测单程序编译 59盏≈822ms / 24盏≈208ms / 13盏≈103ms。
// 手机端(防 too many uniforms,2026-07-24 血泪教训):吊顶灯每3留1,装饰氛围灯全移除,
//   保留高空钻石灯与昆仑信标,总额≈13。
// 电脑端(2026-07-24,视频卡顿根因治理):吊顶灯每2留1 + 移除 userData.deco 标记的装饰小灯
//   (发光材质保留,图标仍亮),总额≈30 —— 着色器编译减半,弱 GPU 不再挤掉视频帧。
{
  const isMobile = 'ontouchstart' in window && Math.min(screen.width, screen.height) < 768;
  const keepEvery = isMobile ? 3 : 2;
  const ceil = new Set(pls.filter((p, i) => i % keepEvery === 0).map((p) => p.l));
  const rm = [];
  s.traverse((o) => {
    if (!o.isPointLight) return;
    if (ceil.has(o)) return; // 保留的吊顶灯
    if (o.position.y > 30 || Math.abs(o.position.x) > 500) return; // 保留:钻石灯(高空)/昆仑信标(远方)
    if (isMobile || o.userData.deco) rm.push(o);
  });
  rm.forEach((l) => l.parent.remove(l));
  // 保留的吊顶灯同步削弱 pls 闪烁列表,避免对已移除灯的无效更新
  for (let i = pls.length - 1; i >= 0; i--) if (!ceil.has(pls[i].l)) pls.splice(i, 1);
}

// ===================== 动画 =====================
let lt = performance.now();
let lastPosT = 0,
  lastDayT = 0,
  lastPlsT = 0,
  lastVidT = 0;
// 自适应画质(2026-07-25):帧率持续低自动降 pixelRatio,回升自动恢复;最多每 3 秒调一次
const PR_STEPS = [Math.min(devicePixelRatio, 2), 1.5, 1.25, 1];
let prIdx = 0,
  prLastChange = 0,
  fpsAcc = 0,
  fpsCnt = 0;
// D4 低画质手动开关(2026-07-30):开启后强制最低 pixelRatio(最流畅),自适应只降不升
let lowQuality = !!ctx.store.json('lowQuality', false);
if (lowQuality) {
  prIdx = PR_STEPS.length - 1;
  rnd.setPixelRatio(PR_STEPS[prIdx]);
}
function setLowQuality(on) {
  lowQuality = !!on;
  try {
    ctx.store.setJson('lowQuality', lowQuality);
  } catch (e) {}
  prIdx = lowQuality ? PR_STEPS.length - 1 : 0;
  rnd.setPixelRatio(PR_STEPS[prIdx]);
  if (ctx.ui.modeToast)
    ctx.ui.modeToast(lowQuality ? '已切到「低画质·流畅」(PixelRatio=1)' : '已恢复「高画质·自动」');
}
ctx.setLowQuality = setLowQuality; // 供设置页罗盘调用
function adaptiveQuality(now, dt) {
  if (lowQuality) {
    // 手动低画质:钉死最低档,不再自适应回升
    if (prIdx !== PR_STEPS.length - 1) {
      prIdx = PR_STEPS.length - 1;
      rnd.setPixelRatio(PR_STEPS[prIdx]);
    }
    return;
  }
  fpsAcc += dt;
  fpsCnt++;
  if (fpsAcc < 2) return; // 每 2 秒评估一次
  const avg = fpsCnt / fpsAcc;
  fpsAcc = 0;
  fpsCnt = 0;
  if (now - prLastChange < 3000) return;
  if (avg < 35 && prIdx < PR_STEPS.length - 1) {
    prIdx++;
    rnd.setPixelRatio(PR_STEPS[prIdx]);
    prLastChange = now;
    // 生产环境不输出画质日志
  } else if (avg > 52 && prIdx > 0) {
    prIdx--;
    rnd.setPixelRatio(PR_STEPS[prIdx]);
    prLastChange = now;
  }
}
function an() {
  requestAnimationFrame(an);
  const now = performance.now();
  const dt = Math.min((now - lt) / 1000, 0.1);
  lt = now;
  adaptiveQuality(now, dt);

  // 画廊移动逻辑
  let mx = jD.x,
    mz = jD.z;
  if (ks.w || ks.arrowup) mz += 1;
  if (ks.s || ks.arrowdown) mz -= 1;
  if (ks.a || ks.arrowleft) mx -= 1;
  if (ks.d || ks.arrowright) mx += 1;
  const mg = Math.sqrt(mx * mx + mz * mz);
  if (mg > 0.1) {
    mx /= mg;
    mz /= mg;
    const fx = -Math.sin(pl.y),
      fz = -Math.cos(pl.y),
      rx = Math.cos(pl.y),
      rz = -Math.sin(pl.y);
    mv(fx * mz + rx * mx, fz * mz + rz * mx, dt);
  }
  // 跳跃/滑翔物理(改 pl.p.y,须在相机同步前执行)
  tickPhysics(dt);
  // 相机每帧同步:站立时拖拽转视角/滚轮俯仰也要生效(此前只在 mv 行走时同步)
  if (ctx.player.viewMode === 1) {
    // 第三人称:相机在玩家后上方,注视玩家;小人跟随玩家位置与朝向
    const fx = -Math.sin(pl.y),
      fz = -Math.cos(pl.y);
    let back = 3.5 + pl.pi * 1.5;
    const up = 2.2 - pl.pi * 1.2;
    // 相机防撞:解密通过前,相机不可进入门禁墙范围(背贴墙时相机会被推到墙内)
    // 禁区外扩0.5米:防止近裁面插进墙体出现"一半墙内一半墙外"
    let bx = pl.p.x,
      bz = pl.p.z;
    if (!ctx.player.quizPassed) {
      while (back > 0.4) {
        bx = pl.p.x - fx * back;
        bz = pl.p.z - fz * back;
        const inside = bx > -19 && bx < 19 && bz > -13 && bz < 29;
        if (!inside) break;
        back -= 0.3;
      }
      if (back < 0.4) back = 0.4;
      bx = pl.p.x - fx * back;
      bz = pl.p.z - fz * back;
      // 收缩到底仍撞墙:相机退回玩家位置(宁可与玩家重合,绝不可进入墙体几何)
      if (bx > -19 && bx < 19 && bz > -13 && bz < 29) {
        bx = pl.p.x;
        bz = pl.p.z;
      }
    }
    // 相机贴太近时隐藏小人(仅贴墙极端情况),正常始终显示角色
    if (ctx.scene.avatar) ctx.scene.avatar.visible = back > 1.2;
    // 相机不入沙:不沉到地形之下
    let cy = pl.p.y + up;
    if (ctx.media.desert) {
      const gy = ctx.media.desert.getH(bx, bz);
      if (cy < gy + 0.35) cy = gy + 0.35;
    }
    cam.position.set(bx, cy, bz);
    // 注视点放在玩家前方4米:相机贴墙收缩时也不会垂直俯视地板
    cam.lookAt(pl.p.x + fx * 4, pl.p.y + 0.8, pl.p.z + fz * 4);
    if (ctx.scene.avatar) {
      ctx.scene.avatar.position.copy(pl.p);
      ctx.scene.avatar.position.y = 0.1;
      ctx.scene.avatar.rotation.y = pl.y + Math.PI;
    } // +PI:FBX 绑定朝向补偿(可微调)
  } else {
    cam.position.copy(pl.p);
    cam.rotation.y = pl.y;
    cam.rotation.x = pl.pi;
    // 滑翔气流颠簸(西域原版手感)
    if (pl.gliding) {
      cam.position.y += Math.sin(now * 0.008) * 0.04 + Math.sin(now * 0.013) * 0.02;
      cam.position.x += Math.sin(now * 0.005) * 0.02;
    }
  }
  // 沙漠区块/水面/飞鸟/沙暴逐帧更新
  if (ctx.media.desert) ctx.media.desert.update(dt, now * 0.001);
  // 统一昼夜:60秒一昼夜(西域原版流速);颜色/灯光 10Hz 刷新足够平滑,弱GPU减负
  const hour = (12 + now / 2500) % 24;
  ctx.media.dayHour = hour;
  if (ctx.media.desert && now - lastDayT > 100) {
    lastDayT = now;
    ctx.media.desert.dayNight(hour);
  }
  // 滑翔时视野拉宽,落地恢复
  const tFov = pl.gliding ? 82 : 75;
  if (Math.abs(cam.fov - tFov) > 0.01) {
    cam.fov += (tFov - cam.fov) * dt * 4;
    cam.updateProjectionMatrix();
  }
  // 吊灯闪烁 10Hz 节流(原本每帧33盏全刷,视觉无差别)
  if (now - lastPlsT > 100) {
    lastPlsT = now;
    pls.forEach((p, i) => {
      p.l.intensity = p.base * (1 + Math.sin(now * 0.002 + i * 1.3) * 0.06);
    });
  }
  const _pG = ctx.media.pG,
    _pC = ctx.media.pC; // effects.js 热更新后引用会换,每帧从 ctx 现取
  const pp = _pG.attributes.position.array;
  for (let i = 0; i < _pC; i++) {
    pp[i * 3 + 1] += Math.sin(now * 0.0004 + i * 0.6) * 0.001;
    if (pp[i * 3 + 1] > WH - 0.3) pp[i * 3 + 1] = 0.5;
  }
  _pG.attributes.position.needsUpdate = true;
  // 更新天空 uniform
  skyUniforms.uTime.value = performance.now() * 0.001;
  groundUniforms.uTime.value = performance.now() * 0.001;
  skyUniforms.uCameraPos.value.copy(pl.p);
  groundUniforms.uCameraPos.value.copy(pl.p);
  // 更新烟花(ctx 现取:effects.js 热更新后引用会换)
  if (ctx.media.updateFireworks) ctx.media.updateFireworks();
  drawMusicCanvas();
  // 每帧动画(浮动/自转/闪烁/滚动等)现统一由 ctx.loop(引擎)的 update 阶段驱动,
  // 见 ctx.js:ctx.onTick→ctx.loop.on('update')。此处不再重复迭代,避免与引擎循环双重执行——
  // 此前两套独立 rAF 循环都跑 tickers,导致动画 2x 速、状态机双 tick、且相机/角色朝向顺序不定。
  // 仅播放中才上传视频帧,且按 30Hz 节流(视频本身只有 24-30fps,60Hz 上传是纯浪费)
  if (now - lastVidT > 33) {
    lastVidT = now;
    if (vidTex && vidEl && vidEl.readyState >= 2 && !vidEl.paused) vidTex.needsUpdate = true;
    if (v45Tex && v45El && v45El.readyState >= 2 && !v45El.paused) v45Tex.needsUpdate = true;
  }
  // 更新坐标显示(降频到每 200ms,避免每帧写 DOM)
  if (now - lastPosT > 200) {
    lastPosT = now;
    const posEl = document.getElementById('posD');
    if (posEl)
      posEl.textContent =
        'X:' + pl.p.x.toFixed(2) + ' | Y:' + pl.p.y.toFixed(2) + ' | Z:' + pl.p.z.toFixed(2);
  }
  drM();
  rnd.render(s, cam);
}
an();
// 新游戏引擎循环(与旧循环并行,分阶段 INPUT→UPDATE→RENDER→UI)
ctx.loop.start();
// 玩家状态机:启动时初始化为空闲状态
ctx._playerSM.change(new IdleState());
// 每帧更新状态机(在旧循环 tickers 中,紧随物理之后执行)
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
  c.style.cssText =
    'position:fixed;left:50%;top:64%;transform:translateX(-50%);z-index:75;background:rgba(30,18,28,0.95);border:1px solid rgba(255,214,170,0.35);border-radius:16px;padding:20px 26px;text-align:center;color:#ffe2c4';
  c.innerHTML =
    '<div style="font-size:15px;letter-spacing:2px;margin-bottom:10px">三千年来，第一个带着真意推开这扇门的，是你。<br>墙已经空了太久——挂上你的第一幅画吧。</div><div style="font-size:12px;letter-spacing:2px;margin-bottom:12px;opacity:.7">初见画廊,不妨先读《元素共鸣准则》</div>';
  const a = document.createElement('button');
  a.textContent = '读 一 读';
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
  ov.style.cssText =
    'position:fixed;inset:0;z-index:400;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.7)';
  const card = document.createElement('div');
  card.style.cssText =
    'background:rgba(30,18,28,0.95);border:1px solid rgba(255,214,170,0.35);border-radius:16px;padding:30px 40px;text-align:center;color:#ffe2c4;max-width:360px';
  card.innerHTML =
    '<div style="font-size:18px;letter-spacing:3px;margin-bottom:20px">你是男生还是女生？</div><div style="font-size:13px;opacity:.7;margin-bottom:24px">这会影响你的画廊配色方案</div>';
  const btnM = document.createElement('button');
  btnM.textContent = '男 生';
  btnM.style.cssText =
    'padding:12px 32px;border:none;border-radius:10px;background:linear-gradient(135deg,#4a8fc0,#2a5f8c);color:#fff;cursor:pointer;margin-right:16px;font-size:15px;letter-spacing:2px';
  const btnF = document.createElement('button');
  btnF.textContent = '女 生';
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
      console.log('[gender] 男生配色已应用:墙壁变蓝', mats.length, '块材质');
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

// 静默补采设备指纹(无邀请函页时代:首次访问服务端已按 IP+UA 建档,这里补稳定指纹)
// 之后换 App 跳转(如千问转接)也能认出同一个人
setTimeout(function () {
  try {
    var fp = {
      scr: screen.width + 'x' + screen.height + 'x' + (window.devicePixelRatio || 1),
      avail: screen.availWidth + 'x' + screen.availHeight,
      tz: new Date().getTimezoneOffset(),
      lang: navigator.language || '',
      langs: (navigator.languages || []).join(','),
      platform: navigator.platform || '',
      cores: navigator.hardwareConcurrency || 0,
      mem: navigator.deviceMemory || 0,
      touch: 'ontouchstart' in window,
      maxTouch: navigator.maxTouchPoints || 0,
    };
    var cv = document.createElement('canvas');
    cv.width = 200;
    cv.height = 30;
    var cx = cv.getContext('2d');
    cx.textBaseline = 'top';
    cx.font = '14px Arial';
    cx.fillStyle = '#f60';
    cx.fillRect(0, 0, 100, 30);
    cx.fillStyle = '#069';
    cx.fillText('梦幻画廊·fp', 2, 4);
    cx.strokeStyle = 'rgba(120,60,200,0.7)';
    cx.arc(150, 15, 10, 0, Math.PI * 2);
    cx.stroke();
    var durl = cv.toDataURL(),
      h = 0;
    for (var i = 0; i < durl.length; i++) {
      h = ((h << 5) - h + durl.charCodeAt(i)) | 0;
    }
    fp.canvas = (h >>> 0).toString(16);
    fetch('/api/gate/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: '', fp: fp }),
    }).catch(function () {});
  } catch (e) {}
}, 3000);
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
