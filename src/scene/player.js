// player.js — 玩家移动/碰撞 + 键盘 + 鼠标 + 触摸(摇杆) + 小地图 + 状态机
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { getGameState } from '../core/game-state.js'; // 阶段4:viewMode 运行期写路径收归 gameState.set(写回经 set 陷阱发事件)
const gs = getGameState();
const { cam, rnd, bounds, jT, jB, onC3D, zoomOut, OL, OR, OT, OBE, OBR, IL, IR, IRT, IRB } = ctx;

// ===================== 移动状态机(2026-08-01) =====================
import { StateMachine } from '../player/StateMachine.js';
import { IdleState } from '../player/states/PlayerStates.js';
const playerSM = new StateMachine();
ctx._playerSM = playerSM; // 供外部查询当前状态

// ===================== 玩家 =====================
// 出生在建筑外(z=45),面朝南方大视频墙,背后是建筑;心象共鸣≥95分前由实体门禁墙封挡建筑
const pl = {
  p: new THREE.Vector3(20, 1.6, 14),
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

function hT(x, z) {
  for (const b of bounds) {
    const cx = Math.max(b.mnX, Math.min(x, b.mxX)),
      cz = Math.max(b.mnZ, Math.min(z, b.mxZ));
    if ((x - cx) ** 2 + (z - cz) ** 2 < pl.r ** 2) return true;
  }
  return false;
}
function rs(dx, dz) {
  const cx = pl.p.x,
    cz = pl.p.z;
  if (!hT(dx, dz)) return { x: dx, z: dz };
  const mx = !hT(dx, cz),
    mz = !hT(cx, dz);
  if (mx && mz) return Math.abs(dx - cx) > Math.abs(dz - cz) ? { x: dx, z: cz } : { x: cx, z: dz };
  if (mx) return { x: dx, z: cz };
  if (mz) return { x: cx, z: dz };
  return { x: cx, z: cz };
}
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
  const nx = pl.p.x + wx * spd,
    nz = pl.p.z + wz * spd;
  const r = rs(nx, nz);
  pl.p.x = r.x;
  pl.p.z = r.z;
  // 地面跟随(沙漠地形):着地时贴近地表
  if (pl.onGround) {
    const gy = groundY(r.x, r.z) + 1.6;
    pl.p.y += (gy - pl.p.y) * Math.min(dt * 12, 1);
  }
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
  const gy = groundY(pl.p.x, pl.p.z) + 1.6;
  // 起跳(落地瞬间触发一次)
  if (pl.onGround && jumpPressed) {
    pl.vy = 9.5;
    pl.onGround = false;
  }
  jumpPressed = false;
  // 滑翔判定:空中按住跳跃键且有余量
  if (!pl.onGround && jumpHold && pl.glideEnergy > 0) {
    pl.gliding = true;
    pl.glideEnergy -= dt * 0.35;
    if (pl.glideEnergy < 0) pl.glideEnergy = 0;
  } else {
    pl.gliding = false;
    if (pl.onGround) pl.glideEnergy = Math.min(5, pl.glideEnergy + dt * 1.2);
  }
  // 重力:滑翔时大幅减缓(西域原版手感)
  pl.vy -= (pl.gliding ? 3.5 : 26) * dt;
  if (pl.gliding) {
    // 抬头:乘风速冲,高度换速度;低头:获得升力
    if (pl.pi > 0.15) pl.vy -= pl.pi * 6 * dt;
    if (pl.pi < -0.15) pl.vy += 1.5 * dt;
    // 上升气流托举并回充能量
    const ud = updraft(pl.p.x, pl.p.z);
    if (ud > 0) {
      pl.vy += ud * dt;
      pl.glideEnergy = Math.min(5, pl.glideEnergy + dt * 0.6);
    }
    // 上升/下坠限速(原版 clamp:-12~6)
    pl.vy = Math.max(-12, Math.min(6, pl.vy));
  }
  pl.p.y += pl.vy * dt;
  if (pl.p.y <= gy) {
    // 落地/贴地:直接吸附地表(高速落地也不会穿透或卡落)
    pl.p.y = gy;
    pl.vy = 0;
    pl.onGround = true;
  } else {
    pl.onGround = false;
  }
  // 兜底:意外跌出世界时拉回出生点
  if (pl.p.y < -30) {
    pl.p.set(20, groundY(20, 14) + 1.6, 14);
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
// 滑翔能量 HUD(顶部中央五格,原版样式:细条+回充脉冲)
const glideHud = document.createElement('div');
glideHud.style.cssText =
  'position:fixed;top:70px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:35;pointer-events:none';
const glidePips = [];
for (let i = 0; i < 5; i++) {
  const pip = document.createElement('div');
  pip.className = 'glide-pip';
  glideHud.appendChild(pip);
  glidePips.push(pip);
}
document.body.appendChild(glideHud);
function updateGlideHUD() {
  const n = Math.ceil(Math.max(0, pl.glideEnergy / 5) * 5);
  glidePips.forEach((pip, i) => {
    pip.classList.toggle('active', i < n);
    pip.classList.toggle('recharge', pl.onGround && i >= n);
  });
  jumpBtn.classList.toggle('gliding', pl.gliding);
}
const jumpBtn = document.createElement('button');
jumpBtn.id = 'jumpBtnGlide';
jumpBtn.textContent = '▲';
jumpBtn.title = '跳跃(按住滑翔)';
jumpBtn.style.cssText =
  'position:fixed;bottom:30px;right:20px;z-index:35;width:110px;height:110px;border-radius:50%;border:1px solid rgba(255,220,150,0.4);background:rgba(40,25,10,0.55);color:#ffe4b5;font-size:34px;cursor:pointer;font-family:inherit';
jumpBtn.addEventListener('touchstart', (e) => {
  e.preventDefault();
  jumpPressed = true;
  jumpHold = true;
  jumpBtn.style.transform = 'scale(0.9)';
});
jumpBtn.addEventListener('touchend', (e) => {
  jumpHold = false;
  jumpBtn.style.transform = '';
});
jumpBtn.addEventListener('mousedown', (e) => {
  e.stopPropagation();
  jumpPressed = true;
  jumpHold = true;
  jumpBtn.style.transform = 'scale(0.9)';
});
jumpBtn.addEventListener('mouseup', () => {
  jumpHold = false;
  jumpBtn.style.transform = '';
});
document.body.appendChild(jumpBtn);

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
// 鼠标拖拽旋转视角
document.addEventListener('mousemove', (e) => {
  if (mDg && mLX !== null) {
    const s = 0.06;
    pl.y -= (e.clientX - mLX) * s;
    pl.pi -= (e.clientY - mLY) * s * 0.6;
    pl.pi = Math.max(-0.5, Math.min(0.5, pl.pi));
    mLX = e.clientX;
    mLY = e.clientY;
  }
});
cEl.addEventListener('mousedown', (e) => {
  if (!('ontouchstart' in window) && e.button === 0) {
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
cEl.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    pl.pi += e.deltaY * 0.0005;
    pl.pi = Math.max(-0.8, Math.min(0.8, pl.pi));
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
  tST = 0;
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
    if (!isUiTouch(e)) e.preventDefault();
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
        pl.y -= (t.clientX - lx) * s;
        pl.pi -= (t.clientY - ly) * s * 0.6;
        pl.pi = Math.max(-0.5, Math.min(0.5, pl.pi));
        lx = t.clientX;
        ly = t.clientY;
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
  jD.x = 0;
  jD.z = 0;
  jT.classList.remove('a');
  jT.style.transform = 'translate(-50%,-50%)';
});

// ===================== 小地图 =====================
const mC = document.getElementById('mc'),
  mX = mC.getContext('2d');
mC.width = 150;
mC.height = 140;
// 放大态(建筑区静态图等比放大 / 沙漠区视野半径 45→150m)
let mBig = false;
const mBigBtn = document.createElement('button');
mBigBtn.textContent = '⤢';
mBigBtn.title = '放大小地图';
mBigBtn.style.cssText =
  'position:absolute;left:4px;bottom:4px;z-index:25;width:22px;height:22px;border-radius:5px;border:1px solid rgba(255,150,180,0.4);background:rgba(20,10,16,0.7);color:#ffb6c8;font-size:12px;line-height:1;cursor:pointer;pointer-events:auto';
mBigBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  mBig = !mBig;
  const mDiv = document.getElementById('m');
  // 丝滑切换:尺寸变化走 CSS transition,昆仑指示位置两态一致不再"到处跑"
  mDiv.style.transition = 'width .35s ease,height .35s ease,opacity .35s ease';
  mDiv.style.opacity = '0.35';
  setTimeout(() => {
    mDiv.style.opacity = '1';
  }, 180);
  if (mBig) {
    mC.width = 280;
    mC.height = 280;
    mDiv.style.width = '280px';
    mDiv.style.height = '280px';
  } else {
    mC.width = 150;
    mC.height = 140;
    mDiv.style.width = '150px';
    mDiv.style.height = '140px';
  }
});
document.getElementById('m').appendChild(mBigBtn);
// 地图比例尺:覆盖 x±34m / z=-13~50m(含室外白板区),三处(静态层/玩家点/传送)必须一致
const MSC = 2.2,
  MOX = 75,
  MOZ = 29;
// 静态地图层:墙体/标签不变,预渲染一次,每帧只需 drawImage + 玩家点
const mStatic = document.createElement('canvas');
mStatic.width = 150;
mStatic.height = 140;
const mSt = mStatic.getContext('2d');
(function drawStaticMap() {
  const mX = mSt; // 以下静态绘制代码与原逐帧版本一致,只是画到离屏层
  const w = 150,
    h = 140,
    sc = MSC,
    ox = MOX,
    oz = MOZ;
  // 背景
  mX.fillStyle = 'rgba(12,5,10,0.85)';
  mX.fillRect(0, 0, w, h);
  // --- 上方展厅区（z=-12~6）---
  // 展厅外墙
  mX.strokeStyle = 'rgba(255,150,180,0.5)';
  mX.lineWidth = 1.5;
  mX.beginPath();
  mX.moveTo(ox + OL * sc, oz + OT * sc);
  mX.lineTo(ox + OR * sc, oz + OT * sc);
  mX.lineTo(ox + OR * sc, oz + OBE * sc);
  mX.lineTo(ox + OL * sc, oz + OBE * sc);
  mX.closePath();
  mX.stroke();
  // 展厅内部隔墙
  mX.strokeStyle = 'rgba(255,150,180,0.2)';
  mX.lineWidth = 0.8;
  // 走廊x=-4
  mX.beginPath();
  mX.moveTo(ox - 4 * sc, oz + OT * sc);
  mX.lineTo(ox - 4 * sc, oz + (OBE - 1) * sc);
  mX.stroke();
  // 走廊x=4
  mX.beginPath();
  mX.moveTo(ox + 4 * sc, oz + OT * sc);
  mX.lineTo(ox + 4 * sc, oz + (OBE - 1) * sc);
  mX.stroke();
  // E厅南墙(z=6)
  mX.beginPath();
  mX.moveTo(ox - 4 * sc, oz + OBE * sc);
  mX.lineTo(ox - 1 * sc, oz + OBE * sc);
  mX.moveTo(ox + 1 * sc, oz + OBE * sc);
  mX.lineTo(ox + 4 * sc, oz + OBE * sc);
  mX.stroke();
  // 展厅标签
  mX.fillStyle = 'rgba(255,200,220,0.5)';
  mX.font = 'bold 6px sans-serif';
  mX.textAlign = 'center';
  mX.fillText('A', ox - 11 * sc, oz - 9 * sc);
  mX.fillText('B', ox + 11 * sc, oz - 9 * sc);
  mX.fillText('C', ox - 11 * sc, oz - 1 * sc);
  mX.fillText('D', ox + 11 * sc, oz - 1 * sc);
  mX.fillText('E', ox, oz + 3.5 * sc);
  mX.fillText('F', ox - 11 * sc, oz + 4 * sc);
  mX.fillText('G', ox + 11 * sc, oz + 4 * sc);
  // --- 下方回字大厅（z=6~28）---
  // 回字外墙（南+东西延长）
  mX.strokeStyle = 'rgba(255,150,180,0.6)';
  mX.lineWidth = 1.8;
  mX.beginPath();
  mX.moveTo(ox + OL * sc, oz + OBE * sc);
  mX.lineTo(ox + OL * sc, oz + OBR * sc);
  mX.lineTo(ox + OR * sc, oz + OBR * sc);
  mX.lineTo(ox + OR * sc, oz + OBE * sc);
  mX.stroke();
  // 回字内墙（四段带门洞）
  mX.strokeStyle = 'rgba(255,120,160,0.55)';
  mX.lineWidth = 1.8;
  // 内北墙(z=11)
  mX.beginPath();
  mX.moveTo(ox + IL * sc, oz + IRT * sc);
  mX.lineTo(ox + -2 * sc, oz + IRT * sc);
  mX.moveTo(ox + 2 * sc, oz + IRT * sc);
  mX.lineTo(ox + IR * sc, oz + IRT * sc);
  mX.stroke();
  // 内南墙(z=23)
  mX.beginPath();
  mX.moveTo(ox + IL * sc, oz + IRB * sc);
  mX.lineTo(ox + -2 * sc, oz + IRB * sc);
  mX.moveTo(ox + 2 * sc, oz + IRB * sc);
  mX.lineTo(ox + IR * sc, oz + IRB * sc);
  mX.stroke();
  // 内西墙(x=-7)
  mX.beginPath();
  mX.moveTo(ox + IL * sc, oz + IRT * sc);
  mX.lineTo(ox + IL * sc, oz + 15.5 * sc);
  mX.moveTo(ox + IL * sc, oz + 18.5 * sc);
  mX.lineTo(ox + IL * sc, oz + IRB * sc);
  mX.stroke();
  // 内东墙(x=7)
  mX.beginPath();
  mX.moveTo(ox + IR * sc, oz + IRT * sc);
  mX.lineTo(ox + IR * sc, oz + 15.5 * sc);
  mX.moveTo(ox + IR * sc, oz + 18.5 * sc);
  mX.lineTo(ox + IR * sc, oz + IRB * sc);
  mX.stroke();
  // 门洞标记
  mX.fillStyle = 'rgba(255,200,150,0.5)';
  mX.font = '5px sans-serif';
  mX.fillText('门', ox, oz + (IRT - 0.4) * sc);
  mX.fillText('门', ox, oz + (IRB + 0.6) * sc);
  // --- 室外白板区标记(z=42 白板 / z=47 展示墙) ---
  mX.strokeStyle = 'rgba(255,200,150,0.5)';
  mX.lineWidth = 1.2;
  mX.beginPath();
  mX.moveTo(ox - 3 * sc, oz + 42 * sc);
  mX.lineTo(ox + 3 * sc, oz + 42 * sc);
  mX.stroke();
  mX.beginPath();
  mX.moveTo(ox - 6.5 * sc, oz + 47 * sc);
  mX.lineTo(ox + 6.5 * sc, oz + 47 * sc);
  mX.stroke();
  mX.fillText('白板', ox, oz + 44.5 * sc);
})();

// 地形色(与 desert.js getColor 同阈值,但去掉随机噪点,避免地图闪烁)
function tCol(h) {
  if (h < -2) return 'rgb(222,216,206)';
  if (h < 0.5) return 'rgb(191,165,114)';
  if (h < 3) return 'rgb(209,183,127)';
  if (h < 7) return 'rgb(178,153,107)';
  if (h < 12) return 'rgb(140,114,89)';
  if (h < 20) return 'rgb(114,102,97)';
  if (h < 35) return 'rgb(140,132,122)';
  if (h < 60) return 'rgb(165,158,147)';
  if (h < 90) return 'rgb(191,186,178)';
  return 'rgb(242,244,249)';
}
function drM() {
  const inZone = Math.abs(pl.p.x) < 34 && pl.p.z > -13 && pl.p.z < 60;
  if (inZone) {
    // 建筑区:静态图(放大态等比缩放)
    const sc = mC.width / 150;
    mX.setTransform(sc, 0, 0, sc, 0, 0);
    mX.drawImage(mStatic, 0, 0);
    const px = MOX + pl.p.x * MSC,
      pz = MOZ + pl.p.z * MSC;
    mX.fillStyle = '#ff5090';
    mX.beginPath();
    mX.arc(px, pz, 3, 0, Math.PI * 2);
    mX.fill();
    mX.fillStyle = '#fff';
    mX.font = 'bold 7px sans-serif';
    mX.textAlign = 'center';
    mX.fillText('我', px, pz - 5);
    mX.strokeStyle = '#ffb0c0';
    mX.lineWidth = 1.2;
    mX.beginPath();
    mX.moveTo(px, pz);
    mX.lineTo(px - Math.sin(pl.y) * 6, pz - Math.cos(pl.y) * 6);
    mX.stroke();
    // 昆仑方位指示(静态图模式也恒显:玩家点旁指向昆仑的黄点+标注)
    if (ctx.media.desert && ctx.media.desert.kunlun) {
      const K = ctx.media.desert.kunlun;
      const a = Math.atan2(K.z - pl.p.z, K.x - pl.p.x);
      let ex = px + Math.cos(a) * 30,
        ey = pz + Math.sin(a) * 30;
      ex = Math.max(6, Math.min(144, ex));
      ey = Math.max(6, Math.min(134, ey));
      mX.fillStyle = '#ffdd88';
      mX.beginPath();
      mX.arc(ex, ey, 3.5, 0, Math.PI * 2);
      mX.fill();
      mX.font = '7px sans-serif';
      mX.textAlign = 'center';
      mX.fillText('昆仑', ex, ey - 5);
    }
    mX.setTransform(1, 0, 0, 1, 0, 0);
    return;
  }
  const W = mC.width,
    H = mC.height,
    R = mBig ? 150 : 45,
    k = W / (2 * R);
  const cell = Math.max(2, Math.round(W / 36));
  for (let gy = 0; gy < H; gy += cell)
    for (let gx = 0; gx < W; gx += cell) {
      const wx = pl.p.x + (gx - W / 2) / k,
        wz = pl.p.z + (gy - H / 2) / k;
      const h = ctx.media.desert ? ctx.media.desert.getH(wx, wz) : 0;
      mX.fillStyle = tCol(h);
      mX.fillRect(gx, gy, cell, cell);
    }
  // 兴趣点:画廊建筑/希沃白板/心象共鸣屏
  const poi = [
    [0, 8, '#ff88aa', '馆'],
    [0, 44, '#a0e0ff', '板'],
    [39, 14, '#feca57', '考'],
  ];
  mX.font = '8px sans-serif';
  mX.textAlign = 'center';
  for (const p of poi) {
    const gx = W / 2 + (p[0] - pl.p.x) * k,
      gy = H / 2 + (p[1] - pl.p.z) * k;
    if (gx > 5 && gx < W - 5 && gy > 5 && gy < H - 5) {
      mX.fillStyle = p[2];
      mX.beginPath();
      mX.arc(gx, gy, 3.5, 0, Math.PI * 2);
      mX.fill();
      mX.fillText(p[3], gx, gy - 5);
    }
  }
  // 昆仑:在视野内画点,视野外在边缘画方位指示(加大加亮,带描边)
  if (ctx.media.desert && ctx.media.desert.kunlun) {
    const K = ctx.media.desert.kunlun;
    const gx = W / 2 + (K.x - pl.p.x) * k,
      gy = H / 2 + (K.z - pl.p.z) * k;
    mX.fillStyle = '#ffdd88';
    mX.strokeStyle = '#fff';
    mX.lineWidth = 1.2;
    if (gx > 7 && gx < W - 7 && gy > 7 && gy < H - 7) {
      mX.beginPath();
      mX.arc(gx, gy, 5, 0, Math.PI * 2);
      mX.fill();
      mX.stroke();
      mX.font = '8px sans-serif';
      mX.fillText('昆仑', gx, gy - 7);
    } else {
      const a = Math.atan2(gy - H / 2, gx - W / 2);
      const ex = W / 2 + Math.cos(a) * (W / 2 - 8),
        ey = H / 2 + Math.sin(a) * (H / 2 - 8);
      mX.beginPath();
      mX.arc(ex, ey, 4, 0, Math.PI * 2);
      mX.fill();
      mX.stroke();
      mX.font = '8px sans-serif';
      mX.fillText('昆仑', ex, ey - 6);
    }
  }
  // 灵蕴目标标记(spirits.js ctx.kunlun.spiritMark):视野内画脉动金点+名字,视野外在边缘画方位指示
  if (ctx.kunlun.spiritMark) {
    const mk = ctx.kunlun.spiritMark();
    if (mk) {
      const gx = W / 2 + (mk.x - pl.p.x) * k,
        gy = H / 2 + (mk.z - pl.p.z) * k;
      const pulse = 3.5 + Math.sin(performance.now() * 0.005) * 1.2;
      mX.fillStyle = mk.color;
      mX.strokeStyle = '#fff';
      mX.lineWidth = 1;
      if (gx > 7 && gx < W - 7 && gy > 7 && gy < H - 7) {
        mX.beginPath();
        mX.arc(gx, gy, pulse, 0, Math.PI * 2);
        mX.fill();
        mX.stroke();
        mX.font = '8px sans-serif';
        mX.fillText(mk.name, gx, gy - 6);
      } else {
        const a = Math.atan2(gy - H / 2, gx - W / 2);
        const ex = W / 2 + Math.cos(a) * (W / 2 - 8),
          ey = H / 2 + Math.sin(a) * (H / 2 - 8);
        mX.beginPath();
        mX.arc(ex, ey, 4, 0, Math.PI * 2);
        mX.fill();
        mX.stroke();
        mX.font = '7px sans-serif';
        mX.fillText('灵蕴', ex, ey - 6);
      }
    }
  }
  // 玩家(恒在中心,标"我"便于识别)
  mX.fillStyle = '#ff5090';
  mX.beginPath();
  mX.arc(W / 2, H / 2, 4, 0, Math.PI * 2);
  mX.fill();
  mX.fillStyle = '#fff';
  mX.font = 'bold 9px sans-serif';
  mX.textAlign = 'center';
  mX.fillText('我', W / 2, H / 2 - 7);
  mX.strokeStyle = '#ffb0c0';
  mX.lineWidth = 1.4;
  mX.beginPath();
  mX.moveTo(W / 2, H / 2);
  mX.lineTo(W / 2 - Math.sin(pl.y) * 8, H / 2 - Math.cos(pl.y) * 8);
  mX.stroke();
}

// 小地图传送:pixeldown 即时响应(比 click 快,手机无 300ms 延迟)
// 像素坐标反算世界坐标,仅墙体内忽略;范围覆盖室内 + 室外白板区(z≤50)
// 阻止小地图上的鼠标/触摸事件冒泡到场景(避免点地图时误转视角/误点画框)
['mousedown', 'mouseup', 'mousemove', 'touchstart', 'touchend', 'touchmove'].forEach((ev) =>
  mC.addEventListener(ev, (e) => e.stopPropagation())
);
// ===================== 传送过渡遮罩(2026-07-27 主人反馈"没有过渡":消除跳切感) =====================
// 全屏深色遮罩:180ms 淡入 → 执行位移 → 220ms 淡出。小地图传送/回家键共用;其他模块经 ctx.kunlun.fadeTeleport 复用
const tpVeil = document.createElement('div');
tpVeil.style.cssText =
  'position:fixed;inset:0;z-index:400;background:#0a0510;opacity:0;pointer-events:none;transition:opacity .18s ease';
document.body.appendChild(tpVeil);
function fadeTeleport(cb) {
  tpVeil.style.opacity = '1';
  setTimeout(() => {
    cb();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        tpVeil.style.opacity = '0';
      });
    });
  }, 180);
}

mC.addEventListener('pointerdown', (e) => {
  if (ctx.kunlun.flightLock) {
    window.quizToast && window.quizToast('飞舟巡礼中，坐稳了');
    return;
  } // ark.js:飞行中禁传送
  const r = mC.getBoundingClientRect();
  const inZone = Math.abs(pl.p.x) < 34 && pl.p.z > -13 && pl.p.z < 60;
  let wx, wz;
  if (inZone) {
    // 建筑区:静态图坐标(放大态先归一化)
    const sc = mC.width / 150;
    wx = ((e.clientX - r.left) / sc - MOX) / MSC;
    wz = ((e.clientY - r.top) / sc - MOZ) / MSC;
    if (wx < -32 || wx > 32 || wz < OT - 10 + 0.3 || wz > 60) return; // 建筑区:可传送范围外(建筑外空地四向各扩10米)
  } else {
    // 沙漠区:以玩家为中心反算世界坐标,地图视野内任意点可传送
    const R = mBig ? 150 : 45,
      k = mC.width / (2 * R);
    wx = pl.p.x + (e.clientX - r.left - mC.width / 2) / k;
    wz = pl.p.z + (e.clientY - r.top - mC.height / 2) / k;
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
    pl.p.y = groundY(wx, wz) + 1.6;
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
    pl.p.set(20, groundY(20, 14) + 1.6, 14);
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

Object.assign(ctx.player, { pl, jD, ks, mv, drM });
ctx.kunlun.fadeTeleport = fadeTeleport;
ctx.tickPhysics = tickPhysics; // 未映射属性,保持扁平

// 昆仑灵鉴:行走氛围——「山记得你的每一步。」(已进展厅后,每 4 分钟至多浮现一次)
setInterval(() => {
  if (ctx.player.quizPassed && ctx.ui.modeToast) {
    ctx.ui.modeToast('山记得你的每一步。');
  }
}, 240000);
