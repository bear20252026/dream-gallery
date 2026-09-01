// player.js — 玩家移动/碰撞 + 键盘 + 鼠标 + 触摸(摇杆) + 小地图 + 状态机
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { EYE_HEIGHT } from '../shared/constants.js';
import { getGameState } from '../core/game-state.js'; // 阶段4:viewMode 运行期写路径收归 gameState.set(写回经 set 陷阱发事件)
const gs = getGameState();
const { cam, rnd, bounds, jT, jB, onC3D, zoomOut, OL, OR, OT, OBE, OBR, IL, IR, IRT, IRB } = ctx;
import { mapCanvas, mapScale, mapOffX, mapOffZ, isBig, drawMap } from './minimap.js';

// ===================== 移动状态机(2026-08-01) =====================
import { StateMachine } from '../player/StateMachine.js';
import { IdleState } from '../player/states/PlayerStates.js';
import { resolveMove } from './collision-resolve.js'; // 2026-08-31 水平碰撞解析(子步进+滑行,纯函数)
const playerSM = new StateMachine();
ctx._playerSM = playerSM; // 供外部查询当前状态

// ===================== 玩家 =====================
// 出生在建筑外(z=45),面朝南方大视频墙,背后是建筑;心象共鸣≥95分前由实体门禁墙封挡建筑
const pl = {
  p: new THREE.Vector3(20, EYE_HEIGHT, 14), // 出生眼高(首帧 tickPhysics 会按地形校正)
  y: -Math.PI / 2,
  pi: 0.5,
  r: 0.35,
  vy: 0,
  onGround: true,
  gliding: false,
  glideEnergy: 5,
};
cam.position.copy(pl.p);
cam.rotation.y = pl.y;
cam.rotation.x = pl.pi;
// 视角模式:0=第一人称,1=第三人称(按 V 切换)
ctx.player.viewMode = 0;
// 第三人称下显示的玩家小人(胶囊身+球头,第一人称时隐藏)
const avatar = new THREE.Group();
const bodyMat = new THREE.MeshStandardMaterial({ color: '#ffb6c8', roughness: 0.6 });
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.7, 6, 12), bodyMat);
body.position.y = 0.75;
avatar.add(body);
const head = new THREE.Mesh(
  new THREE.SphereGeometry(0.22, 16, 12),
  new THREE.MeshStandardMaterial({ color: '#ffe8f0', roughness: 0.5 })
);
head.position.y = 1.45;
avatar.add(head);
// 面向指示(鼻尖)
const nose = new THREE.Mesh(
  new THREE.ConeGeometry(0.06, 0.16, 8),
  new THREE.MeshStandardMaterial({ color: '#ff6b8a' })
);
nose.rotation.x = Math.PI / 2;
nose.position.set(0, 1.45, -0.24);
avatar.add(nose);
avatar.visible = false;
// (avatar 加入场景在 scene 引用可用后立即执行)
if (ctx.scene.s) ctx.scene.s.add(avatar);
else
  (function waitS() {
    if (ctx.scene.s) {
      ctx.scene.s.add(avatar);
    } else setTimeout(waitS, 50);
  })();
ctx.scene.avatar = avatar;

// 2026-08-31 碰撞修复:水平碰撞解析抽到 scene/collision-resolve.js(纯函数,可单测)。
// 原 hT/rs 单步检测只查终点 → 低帧率/滑翔加速时单步位移超过碰撞体厚度 → 穿模。
// 现在 resolveMove 内部做子步进(每步 ≤0.12m)+ 逐轴滑行。
function mv(wx, wz, dt) {
  if (ctx.kunlun.flightLock) return; // 飞舟巡礼中(ark.js):移动冻结,航线接管
  let spd = 3.2 * dt; // 固定速度
  // 滑翔乘风(西域原版):提速1.6倍 + 朝昆仑方向的导向风加成(dot²*0.6);抬头再按俯仰角加成
  if (pl.gliding) {
    let boost = 1.6;
    if (ctx.media.desert && ctx.media.desert.kunlun) {
      const dx = ctx.media.desert.kunlun.x - pl.p.x,
        dz = ctx.media.desert.kunlun.z - pl.p.z;
      const dl = Math.hypot(dx, dz) || 1;
      const dot = -Math.sin(pl.y) * (dx / dl) + -Math.cos(pl.y) * (dz / dl);
      if (dot > 0) boost += dot * dot * 0.6;
    }
    spd *= boost;
    if (pl.pi > 0.2) spd *= 1 + pl.pi * 0.5;
  }
  // 2026-09-01 高度感知护栏:传入脚底高度,带 mnY/mxY 的墙(如二层回廊护栏)
  // 只对垂直区间重叠的玩家生效——一楼玩家可从二楼护栏下方自由通行
  const r = resolveMove(
    pl.p.x,
    pl.p.z,
    wx * spd,
    wz * spd,
    pl.r,
    bounds,
    undefined,
    pl.p.y - EYE_HEIGHT
  );
  pl.p.x = r.x;
  pl.p.z = r.z;
  // 地面高度统一由 tickPhysics → stepVertical 吸附处理(不再在此处平滑跟随)。
  // 2026-08-31:原先此处 lerp 跟随与 stepVertical 硬吸附并存,在斜坡/门槛处两套逻辑
  // 互相追赶 → 玩家抖动、陷入坡道。现在只保留物理核一条路径。
  // 相机位置/朝向统一由 main.js 主循环(an)接管(第一/第三人称都在那里处理),
  // 此处只负责位移+碰撞。删去原先的相机 lerp/lookAt/Euler 覆盖,消除与 main.js 的相机打架
  // (此前两处都写 cam.position/rotation,导致第三人称抖动、朝向被 Euler 覆盖而错乱)。
}
function groundY(x, z) {
  // 空中永恒展厅(eternal.js):厅内地面=展厅地板;范围外返回 undefined 走沙漠地形
  if (ctx.kunlun.groundOverride) {
    const g = ctx.kunlun.groundOverride(x, z);
    if (g !== undefined) return g;
  }
  return ctx.media.desert ? ctx.media.desert.getH(x, z) : 0;
}
// 上升气流检测(西域原版:海拔>10且坡度>5的陡崖热气流)
function updraft(x, z) {
  const h = groundY(x, z);
  const st = 2;
  const sl = Math.max(
    Math.abs(h - groundY(x, z - st)),
    Math.abs(h - groundY(x, z + st)),
    Math.abs(h - groundY(x + st, z)),
    Math.abs(h - groundY(x - st, z))
  );
  return h > 10 && sl > 5 ? Math.min(sl * 0.25, 3.5) : 0;
}
// 每帧物理:跳跃 + 滑翔(空格/跳跃按钮,空中按住=滑翔,消耗能量,落地回能)
let jumpHold = false,
  jumpPressed = false;
function tickPhysics(dt) {
  ctx._jumpHold = jumpHold; // 暴露给状态机(ctx.player 被 aliasNS 冻结,不能加属性)
  if (ctx.kunlun.flightLock) {
    jumpPressed = false;
    return;
  } // 飞舟巡礼中(ark.js):重力/跳跃冻结,且吞掉排队跳跃,防落地弹跳
  // 垂直运动纯物理核(2026-08-30 终审 TOP1:单步积分抽到 scene/player-physics.js 可单测)
  const gy = groundY(pl.p.x, pl.p.z) + EYE_HEIGHT;
  const ns = stepVertical(
    { y: pl.p.y, vy: pl.vy, onGround: pl.onGround, glideEnergy: pl.glideEnergy },
    { jumpPressed, jumpHold, pitch: pl.pi, updraft: updraft(pl.p.x, pl.p.z), gy },
    dt
  );
  jumpPressed = false;
  pl.p.y = ns.y;
  pl.vy = ns.vy;
  pl.onGround = ns.onGround;
  pl.gliding = ns.gliding;
  pl.glideEnergy = ns.glideEnergy;
  // 兜底:意外跌出世界时拉回出生点
  if (pl.p.y < -30) {
    pl.p.set(20, groundY(20, 14) + EYE_HEIGHT, 14);
    pl.vy = 0;
    pl.onGround = true;
  }
  updateGlideHUD();
}
// 跳跃输入:空格(电脑) + 跳跃按钮(手机)
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.repeat) {
    jumpPressed = true;
    jumpHold = true;
    e.preventDefault();
  }
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Space') jumpHold = false;
});
// 滑翔能量 HUD + 跳跃按钮(B4 外迁 ui/glide-hud.js;输入经回调回写物理状态)
const glideHudApi = createGlideHUD({
  onJumpPress() {
    jumpPressed = true;
    jumpHold = true;
  },
  onJumpRelease() {
    jumpHold = false;
  },
});
function updateGlideHUD() {
  glideHudApi.update(pl);
}

// ===================== 键盘 =====================
// e.key 可能是 undefined(输入法 composition / 合成事件 / 部分移动端键盘 /
// autofill 触发的 keydown),直接 .toLowerCase() 会抛 TypeError —— 先判空。
const ks = {};
document.addEventListener('keydown', (e) => {
  if (!e.key) return;
  ks[e.key.toLowerCase()] = true;
});
// V 键切换第一/第三人称
function toggleView() {
  gs.set('viewMode', ctx.player.viewMode === 1 ? 0 : 1); // 阶段4:经 gameState.set 写回(读者 ctx.player.viewMode 经 vault 同步)
  // 进第三人称:轨道从当前朝向起步(相机从正后方开始环绕,不跳变)
  if (ctx.player.viewMode === 1) {
    orbit.yaw = pl.y;
    orbit.pitch = 0.25;
  }
  if (ctx.scene.avatar) ctx.scene.avatar.visible = ctx.player.viewMode === 1;
  window.quizToast &&
    window.quizToast(
      ctx.player.viewMode === 1 ? '已切换:第三人称视角' : '已切换:第一人称视角',
      true
    );
}
document.addEventListener('keydown', (e) => {
  if (e.key && e.key.toLowerCase() === 'v') toggleView();
});
// 视角切换独立按钮(手机/电脑通用)
const viewBtn = document.createElement('button');
viewBtn.id = 'viewBtn';
viewBtn.textContent = '人称';
viewBtn.style.cssText =
  'position:fixed;bottom:148px;right:20px;z-index:35;width:56px;height:32px;border-radius:16px;border:1px solid rgba(255,150,180,0.4);background:rgba(20,10,18,0.5);color:rgba(255,182,200,0.75);font-size:12px;cursor:pointer;font-family:inherit';
viewBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleView();
});
document.body.appendChild(viewBtn);
document.addEventListener('keyup', (e) => {
  if (!e.key) return;
  ks[e.key.toLowerCase()] = false;
});

// ===================== 第三人称轨道相机状态 =====================
// 2026-08-30:此前第三人称没有独立轨道 —— 拖拽改 pl.y(角色朝向),相机永远钉在背后,
// 角色又永远背对相机 → 永远看不到正脸,俯仰也被 ±0.5rad 钳死。
// 现在拖拽=环绕相机(yaw 360° 自由 + pitch 大范围),滚轮/双指=拉远拉近;
// 角色自身朝向由 loop-manager 平滑转向实际移动方向,静止时拖拽只环绕不转身。
const orbit = { yaw: 0, pitch: ORBIT_DEFAULTS.pitch, dist: ORBIT_DEFAULTS.dist };
ctx._orbit = orbit; // loop-manager 第三人称相机分支读取;toggleView 时初始化 yaw
const PITCH_MIN = -0.6,
  PITCH_MAX = 1.25,
  DIST_MIN = 1.2,
  DIST_MAX = 7;

// ===================== 鼠标（电脑：左键拖拽旋转 + 短按点击放大）=====================
const cEl = rnd.domElement;
let mDg = false,
  mLX = 0,
  mLY = 0,
  cDX = 0,
  cDY = 0,
  cT = 0;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ctx.gallery.zG) zoomOut();
});
// 鼠标拖拽旋转视角:第一人称转玩家朝向,第三人称环绕角色(不转角色)
document.addEventListener('mousemove', (e) => {
  if (mDg && mLX !== null) {
    const s = 0.06;
    if (ctx.player.viewMode === 1) {
      orbit.yaw -= (e.clientX - mLX) * s;
      orbit.pitch = Math.max(
        PITCH_MIN,
        Math.min(PITCH_MAX, orbit.pitch - (e.clientY - mLY) * s * 0.6)
      );
    } else {
      pl.y -= (e.clientX - mLX) * s;
      pl.pi -= (e.clientY - mLY) * s * 0.6;
      pl.pi = Math.max(-0.5, Math.min(0.5, pl.pi));
    }
    mLX = e.clientX;
    mLY = e.clientY;
  }
});
cEl.addEventListener('mousedown', (e) => {
  // 混合设备:触屏笔记本上 'ontouchstart' in window === true,原判据把鼠标拖拽整个禁用
  // → 第三人称"视野无法四处切换"。现在任何设备都允许左键拖拽,
  //   仅用 isFreshTouch() 拦掉真实触屏操作后的合成 mouse 事件(防误触发短按放大)。
  if (e.button === 0 && !isFreshTouch()) {
    mDg = true;
    mLX = e.clientX;
    mLY = e.clientY;
    cDX = e.clientX;
    cDY = e.clientY;
    cT = Date.now();
    cEl.style.cursor = 'grabbing';
  }
});
// mouseup判断：短按=3D放大，拖拽=旋转视角
document.addEventListener('mouseup', (e) => {
  mDg = false;
  mLX = null;
  mLY = null;
  cEl.style.cursor = 'default';
  // 判断是否为短按点击（移动<6px且时间<400ms；阈值收紧,避免小幅度转视角被误判为点击）
  const dx = e.clientX - cDX,
    dy = e.clientY - cDY;
  if (Math.sqrt(dx * dx + dy * dy) < 6 && Date.now() - cT < 400) {
    onC3D(e); // 短按点击 -> 3D原位放大
  }
});
// 鼠标滚轮缩放
// 鼠标滚轮:第一人称缩放俯仰;第三人称拉近拉远相机
cEl.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    if (ctx.player.viewMode === 1) {
      orbit.dist = Math.max(DIST_MIN, Math.min(DIST_MAX, orbit.dist + e.deltaY * 0.0025));
    } else {
      pl.pi += e.deltaY * 0.0005;
      pl.pi = Math.max(-0.8, Math.min(0.8, pl.pi));
    }
  },
  { passive: false }
);

// ===================== 触摸 =====================
let jId = null,
  lId = null,
  jD = { x: 0, z: 0 },
  jCX = 0,
  jCY = 0,
  jR = 40,
  lx = 0,
  ly = 0,
  tSX = 0,
  tSY = 0,
  tST = 0,
  pinchId = null, // 双指捏合缩放(第二根触摸的 identifier)
  pinch0 = 1, // 捏合起始两指间距
  d0 = ORBIT_DEFAULTS.dist, // 捏合起始相机距离
  pinchLX = 0,
  pinchLY = 0;
// 混合设备(触屏笔记本)支持:真实 touch 刚结束后的合成 mouse 事件不当作鼠标输入,
// 否则触屏操作后的 click 合成会误触发"短按=3D放大"与视角拖拽。
let lastTouchT = 0;
function isFreshTouch() {
  return Date.now() - lastTouchT < 800;
}
function uj() {
  const rect = jB.getBoundingClientRect();
  jCX = rect.left + rect.width / 2;
  jCY = rect.top + rect.height / 2;
}
uj();
window.addEventListener('resize', uj);
// 横屏/竖屏自适应
function onResize() {
  cam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix();
  rnd.setSize(innerWidth, innerHeight);
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => {
  setTimeout(onResize, 300);
});
// 触摸点是否落在 HTML UI 上(答题面板/按钮/输入框等):UI 触摸不拦截 click 合成,也不触发摇杆/视角
// 2026-07-25 补充:#lk 粉色齿轮(是 div 不是 button)及各自建面板,否则手机端被当游戏输入 preventDefault,点不动
function isUiTouch(e) {
  const t = e.target;
  return (
    t &&
    t.closest &&
    ((ctx.overlay && ctx.overlay.isUiTouch(t)) ||
      !!t.closest('button') ||
      !!t.closest('input') ||
      !!t.closest('textarea') ||
      !!t.closest('select') ||
      !!t.closest('a') ||
      !!t.closest('#lk') ||
      !!t.closest('#kunlunCompass') ||
      !!t.closest('#gearPanel') ||
      !!t.closest('#upPanel') ||
      !!t.closest('#hcPanel') ||
      !!t.closest('#nickPop'))
  );
}
document.addEventListener(
  'touchstart',
  (e) => {
    lastTouchT = Date.now();
    // ⚠️ 2026-08-30 移动端卡死修复:不再对非 UI 触摸 blanket preventDefault!
    // preventDefault 会杀掉 click 合成 → 全站所有依赖 click 的元素(开屏"轻触启程"、
    // 序章、弹窗遮罩等非 button 元素)在手机上永久失效。滚动/双击缩放的禁用改由
    // index.html 的 CSS `html,body{touch-action:none;overscroll-behavior:none}` 承担;
    // 拖拽期间的滚动抑制仍由 touchmove 的 preventDefault 兜底。
    // isUiTouch 豁免保留:面板/控件触摸不启动摇杆与视角拖拽。
    uj();
    if (isUiTouch(e)) return; // 面板/控件上的触摸不启动摇杆和视角拖拽
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.clientX < innerWidth / 2 && jId === null) {
        jId = t.identifier;
        jT.classList.add('a');
      } else if (t.clientX >= innerWidth / 2 && lId === null) {
        lId = t.identifier;
        lx = t.clientX;
        ly = t.clientY;
        tSX = t.clientX;
        tSY = t.clientY;
        tST = Date.now();
      } else if (lId !== null && pinchId === null) {
        // 第二根触摸:进入双指捏合缩放(第三人称调整相机距离)
        pinch0 = Math.hypot(t.clientX - lx, t.clientY - ly) || 1;
        d0 = orbit.dist;
        pinchId = t.identifier;
        pinchLX = t.clientX;
        pinchLY = t.clientY;
      }
    }
  },
  { passive: false }
);
document.addEventListener(
  'touchmove',
  (e) => {
    if (!isUiTouch(e)) e.preventDefault(); // UI 内允许正常滚动(长题单需要滑动)
    if (isUiTouch(e)) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === jId) {
        const dx = t.clientX - jCX,
          dy = t.clientY - jCY;
        const d = Math.min(Math.sqrt(dx * dx + dy * dy), jR);
        const a = Math.atan2(dy, dx);
        jD.x = (Math.cos(a) * d) / jR;
        jD.z = (-Math.sin(a) * d) / jR;
        jT.style.transform =
          'translate(calc(-50% + ' +
          Math.cos(a) * d +
          'px), calc(-50% + ' +
          Math.sin(a) * d +
          'px))';
      }
      if (t.identifier === lId) {
        const s = 0.06; // 固定灵敏度 (10*0.006)
        if (pinchId !== null) {
          // 双指捏合中:单指拖拽暂停,只更新基准位置供捏合测距
          lx = t.clientX;
          ly = t.clientY;
          continue;
        }
        // 增量必须先算再更新基准(否则 dx/dy 恒 0)
        const dxT = t.clientX - lx,
          dyT = t.clientY - ly;
        if (ctx.player.viewMode === 1) {
          orbit.yaw -= dxT * s;
          orbit.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, orbit.pitch - dyT * s * 0.6));
        } else {
          pl.y -= dxT * s;
          pl.pi -= dyT * s * 0.6;
          pl.pi = Math.max(-0.5, Math.min(0.5, pl.pi));
        }
        lx = t.clientX;
        ly = t.clientY;
      }
      if (t.identifier === pinchId) {
        pinchLX = t.clientX;
        pinchLY = t.clientY;
        const cur = Math.hypot(pinchLX - lx, pinchLY - ly) || 1;
        if (ctx.player.viewMode === 1) {
          orbit.dist = Math.max(DIST_MIN, Math.min(DIST_MAX, (d0 * pinch0) / cur));
        }
      }
    }
  },
  { passive: false }
);
document.addEventListener('touchend', (e) => {
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (t.identifier === jId) {
      jId = null;
      jD.x = 0;
      jD.z = 0;
      jT.classList.remove('a');
      jT.style.transform = 'translate(-50%,-50%)';
    }
    if (t.identifier === pinchId) {
      pinchId = null; // 任一指抬起,捏合结束
    }
    if (t.identifier === lId) {
      lId = null;
      const dx = t.clientX - tSX,
        dy = t.clientY - tSY;
      if (Math.sqrt(dx * dx + dy * dy) < 12 && Date.now() - tST < 400) onC3D(e); // 阈值收紧(触屏抖动大,略宽于鼠标)
    }
  }
});
document.addEventListener('touchcancel', () => {
  jId = null;
  lId = null;
  pinchId = null;
  jD.x = 0;
  jD.z = 0;
  jT.classList.remove('a');
  jT.style.transform = 'translate(-50%,-50%)';
});

// ---- 摇杆的鼠标驱动(混合设备) ----
// 摇杆原本只监听 touch:触屏笔记本上用鼠标点摇杆毫无反应 →"走动不起来"。
// ⚠️ 监听必须挂在容器 #j 上:HTML 里 #jb(底盘)和 #jt(摇杆头)是**兄弟节点**,
//    摇杆头视觉上盖在底盘正中,点中心时事件冒泡路径是 #jt→#j,不经过 #jb。
let jMouse = false;
const jWrap = jB.parentElement || jB;
jWrap.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || isFreshTouch()) return;
  e.stopPropagation();
  jMouse = true;
  jId = 'mouse'; // 占位,防止真实 touch 同时接管
  uj();
  jT.classList.add('a');
  jD.x = 0;
  jD.z = 0;
});
document.addEventListener('mousemove', (e) => {
  if (!jMouse) return;
  const rect = jB.getBoundingClientRect();
  const dx = e.clientX - (rect.left + rect.width / 2);
  const dy = e.clientY - (rect.top + rect.height / 2);
  const d = Math.min(Math.sqrt(dx * dx + dy * dy), jR);
  const a = Math.atan2(dy, dx);
  jD.x = (Math.cos(a) * d) / jR;
  jD.z = (-Math.sin(a) * d) / jR;
  jT.style.transform =
    'translate(calc(-50% + ' + Math.cos(a) * d + 'px), calc(-50% + ' + Math.sin(a) * d + 'px))';
});
document.addEventListener('mouseup', () => {
  if (!jMouse) return;
  jMouse = false;
  jId = null;
  jD.x = 0;
  jD.z = 0;
  jT.classList.remove('a');
  jT.style.transform = 'translate(-50%,-50%)';
});

// 传送过渡遮罩:实现下沉 shared/teleport-fx.js(darkTeleport,与 goldenTeleport 并列)
import { darkTeleport as fadeTeleport } from '../shared/teleport-fx.js';
import { ORBIT_DEFAULTS } from '../shared/constants.js';
import { createGlideHUD } from '../ui/glide-hud.js'; // 滑翔 HUD/跳跃按钮(B4 外迁)
import { stepVertical } from './player-physics.js'; // 垂直运动纯物理核(终审 TOP1 可单测)

mapCanvas.addEventListener('pointerdown', (e) => {
  if (ctx.kunlun.flightLock) {
    window.quizToast && window.quizToast('飞舟巡礼中，坐稳了');
    return;
  } // ark.js:飞行中禁传送
  const r = mapCanvas.getBoundingClientRect();
  const inZone = Math.abs(pl.p.x) < 34 && pl.p.z > -13 && pl.p.z < 60;
  let wx, wz;
  if (inZone) {
    // 建筑区:静态图坐标(放大态先归一化)
    const sc = mapCanvas.width / 150;
    wx = ((e.clientX - r.left) / sc - mapOffX) / mapScale;
    wz = ((e.clientY - r.top) / sc - mapOffZ) / mapScale;
    if (wx < -32 || wx > 32 || wz < OT - 10 + 0.3 || wz > 60) return; // 建筑区:可传送范围外(建筑外空地四向各扩10米)
  } else {
    // 沙漠区:以玩家为中心反算世界坐标,地图视野内任意点可传送
    const R = isBig() ? 150 : 45,
      k = mapCanvas.width / (2 * R);
    wx = pl.p.x + (e.clientX - r.left - mapCanvas.width / 2) / k;
    wz = pl.p.z + (e.clientY - r.top - mapCanvas.height / 2) / k;
  }
  // 空中永恒展厅(eternal.js):只能从金门进出,小地图不可直接传入
  if (ctx.kunlun.eternalKeepOut && ctx.kunlun.eternalKeepOut(wx, wz)) {
    window.quizToast && window.quizToast('万镜画廊只能从金门进入');
    return;
  }
  for (let i = 0; i < bounds.length; i++) {
    const b = bounds[i];
    if (wx > b.mnX && wx < b.mxX && wz > b.mnZ && wz < b.mxZ) return;
  } // 墙体
  fadeTeleport(() => {
    pl.p.x = wx;
    pl.p.z = wz;
    pl.p.y = groundY(wx, wz) + EYE_HEIGHT;
    pl.vy = 0;
    pl.onGround = true; // 传送到地形表面
    cam.position.copy(pl.p); // 传送后立即同步相机(mv 只在移动时同步)
  });
});

// ===================== 一键回归出生点 =====================
const homeBtn = document.createElement('button');
homeBtn.textContent = '⌂';
homeBtn.title = '回归出生点';
homeBtn.style.cssText =
  'position:fixed;bottom:190px;right:88px;z-index:35;width:44px;height:56px;border-radius:22px;border:1px solid rgba(255,220,150,0.45);background:rgba(35,22,10,0.55);color:#ffe4b5;font-size:20px;cursor:pointer;font-family:inherit';
homeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (ctx.kunlun.flightLock) {
    window.quizToast && window.quizToast('飞舟巡礼中，坐稳了');
    return;
  } // ark.js:飞行中禁回家
  fadeTeleport(() => {
    pl.p.set(20, groundY(20, 14) + EYE_HEIGHT, 14);
    pl.vy = 0;
    pl.onGround = true;
    pl.gliding = false;
    pl.glideEnergy = 5;
    pl.y = -Math.PI / 2;
    pl.pi = 0.5; // 恢复出生朝向(面朝大视频墙)
    cam.position.copy(pl.p);
    cam.rotation.y = pl.y;
    cam.rotation.x = pl.pi;
  });
  window.quizToast && window.quizToast('已回到出生点', true);
});
document.body.appendChild(homeBtn);

Object.assign(ctx.player, { pl, jD, ks, mv, drawMap, tickPhysics });
ctx.kunlun.fadeTeleport = fadeTeleport;

// 昆仑灵鉴:行走氛围——「山记得你的每一步。」(已进展厅后,每 4 分钟至多浮现一次)
setInterval(() => {
  if (ctx.player.quizPassed && ctx.ui.modeToast) {
    ctx.ui.modeToast('山记得你的每一步。');
  }
}, 240000);
