// ark.js — 灵蕴飞舟·二期②(2026-07-27 主人定稿:六灵蕴+空中永恒展厅融合方案)
// 2026-07-31:替换为草莓牛奶飞船 GLTF 模型(CC-BY-4.0 · Eleanore Falck)
// 飞舟泊于昆仑山巅北侧平台(灵蕴≥1 可见,形态随收集进度进化;六齐才可登舟)
// 首飞=电影化自动航线:66 秒穿越六条航路(每段变色+粒子+短诗 TTS)→ 停靠永恒展厅南平台
// 之后罗盘「✦ 六灵蕴」页可传送往返(返回展厅 / 山巅登舟);重登飞舟可再飞一遍
// 手机灯光账户:全船零 PointLight——发光件全部 MeshBasicMaterial;粒子单套 Points 复用
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ctx } from '../ctx.js';
import { hotBegin, hotEnd } from '../hot.js';
import { goldenTeleport } from '../shared/teleport-fx.js';
import { getGameState } from '../core/game-state.js'; // 阶段4:flightLock 写路径收归 gameState.set(写回经 set 陷阱发事件)
const gs = getGameState();
const bag = hotBegin('ark');
// 灵蕴收集数(spirits.js 经 ctx.kunlun.spiritsGot 暴露;本模块内 3 处 ark.visible 判定用)
// ⚠️ 2026-08-29 修:此处曾被误写成 `() => spiritCount()`(无限自递归 → Maximum call stack
//    size exceeded,一进飞舟可见性判定即栈溢出)。原语义(见 git 146a721^):
//   ark.visible=(ctx.kunlun.spiritsGot?ctx.kunlun.spiritsGot():0)>=1,与下文 804/956 行一致。
const spiritCount = () => (ctx.kunlun.spiritsGot ? ctx.kunlun.spiritsGot() : 0);
const { s, onTick } = ctx;

const KX = 800,
  KZ = 600;
const SPIRIT_COLORS = ['#7ddb7a', '#ff5a4a', '#e8a03c', '#dfeaf5', '#7cc8e8', '#f0a860'];
function groundY(x, z) {
  try {
    return ctx.media.desert.getH(x, z);
  } catch (e) {
    return 0;
  }
}
const BASE_Y = groundY(KX, 585);
const PARK = { x: KX, y: BASE_Y + 1.5, z: 585 }; // 山巅北侧平台
// 实心山铁律:泊位必须落在地表之上(2026-07-27)
if (ctx.media.desert.assertAboveGround)
  ctx.media.desert.assertAboveGround(PARK.x, BASE_Y, PARK.z, '灵蕴飞舟泊位');

// ===================== 飞舟本体(草莓牛奶飞船 GLTF 模型 + 六灵蕴环 + 光粒) =====================
const ark = new THREE.Group();
ark.position.set(PARK.x, PARK.y, PARK.z);
ark.visible = false;
s.add(ark);

// GLTF 模型引用(异步加载后赋值)
let shipModel = null;
let shipMats = []; // 模型材质列表(形态进化用)

// 六灵蕴环(船底六枚灵蕴印记,逐颗点亮)
const haloG = new THREE.Group();
haloG.position.y = -1.2;
ark.add(haloG);
const gems = [];
for (let k = 0; k < 6; k++) {
  const a = (k / 6) * Math.PI * 2;
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.11, 0),
    new THREE.MeshBasicMaterial({
      color: '#554a3a',
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
    })
  );
  gem.position.set(Math.cos(a) * 0.75, 0, Math.sin(a) * 0.75);
  haloG.add(gem);
  gems.push(gem);
}
// 完整形态(6 颗)的周身光粒
const AURA_N = 24,
  auraPos = new Float32Array(AURA_N * 3);
for (let i = 0; i < AURA_N; i++) {
  auraPos[i * 3] = (Math.random() - 0.5) * 3.4;
  auraPos[i * 3 + 1] = (Math.random() - 0.5) * 1.6;
  auraPos[i * 3 + 2] = (Math.random() - 0.5) * 3.4;
}
const auraGeo = new THREE.BufferGeometry();
auraGeo.setAttribute('position', new THREE.BufferAttribute(auraPos, 3));
const aura = new THREE.Points(
  auraGeo,
  new THREE.PointsMaterial({
    color: '#ffd76a',
    size: 0.07,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
);
ark.add(aura);

// 异步加载草莓牛奶飞船模型
const gltfLoader = new GLTFLoader();
gltfLoader.load(
  '/models/strawberry_ship/scene.gltf',
  (gltf) => {
    shipModel = gltf.scene;
    // 模型原始尺寸约 ±1.5,缩放到与旧飞舟相当(~3m 长)
    shipModel.scale.setScalar(1.8);
    // 模型船头方向调整(默认船头 +x,旋转到 +x 朝前)
    shipModel.rotation.y = -Math.PI / 2;
    // 收集所有材质,用于形态进化
    shipModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = false;
        child.receiveShadow = false;
        if (child.material) {
          // 确保材质支持发光
          if (child.material.isMeshStandardMaterial || child.material.isGLTFMaterial) {
            child.material.emissiveIntensity = 0;
          }
          shipMats.push(child.material);
        }
      }
    });
    ark.add(shipModel);
  },
  undefined,
  (err) => {
    console.warn('[ark] GLTF load failed:', err);
  }
);

// ===================== B3 飞舟结界(2026-07-30) =====================
// 六灵蕴未齐:泊位四周升起半透明灵能穹顶+光环地纹,靠近即被柔和推开(绝不让访客误登沉睡飞舟);
// 六齐(ctx.kunlun.isDone)瞬间穹顶消融(淡出),开放登舟。"按E登上飞舟"提示由 boardBtn 负责。
const BAR_R = 8.5;
const barrier = new THREE.Group();
barrier.position.set(PARK.x, PARK.y, PARK.z);
barrier.visible = false;
const domeGeo = new THREE.SphereGeometry(BAR_R, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62);
const domeMat = new THREE.MeshBasicMaterial({
  color: '#7cc8e8',
  transparent: true,
  opacity: 0.15,
  side: THREE.DoubleSide,
  depthWrite: false,
  toneMapped: false,
  blending: THREE.AdditiveBlending,
});
const dome = new THREE.Mesh(domeGeo, domeMat);
barrier.add(dome);
const barRingGeo = new THREE.TorusGeometry(BAR_R, 0.05, 6, 28);
const barRingMat = new THREE.MeshBasicMaterial({
  color: '#bfe8ff',
  transparent: true,
  opacity: 0.55,
  toneMapped: false,
});
const barRing = new THREE.Mesh(barRingGeo, barRingMat);
barRing.rotation.x = Math.PI / 2;
barRing.position.y = -1.5; // 贴山岩地面(相对 group 原点 PARK.y)
barrier.add(barRing);
s.add(barrier);
let barDissolve = -1; // -1 未消融;<0 且 visible=已触发;>=0 正在消融进度
let barLastT = performance.now();
function barActive(on) {
  if (on) {
    barDissolve = -1;
    barrier.visible = true;
    domeMat.opacity = 0.15;
    barRingMat.opacity = 0.55;
  } else if (barrier.visible && barDissolve < 0) {
    barDissolve = 0;
  } // 触发消融
}
// 结界状态机(每帧):未齐→立起;齐了→消融;软推靠近的访客
function barTick() {
  const now = performance.now();
  const dtB = Math.min(0.05, (now - barLastT) / 1000);
  barLastT = now;
  const done = ctx.kunlun.isDone && ctx.kunlun.isDone();
  if (done) {
    if (barrier.visible && barDissolve < 0) barDissolve = 0;
  } else if (!flying && !FF.on) {
    barActive(true);
  }
  if (!barrier.visible) return;
  barRing.rotation.z += 0.01;
  domeMat.opacity = 0.15 + Math.sin(now * 0.002) * 0.03;
  if (barDissolve >= 0) {
    barDissolve = Math.min(1, barDissolve + dtB * 0.8); // ~1.25s 淡出
    const o = 1 - barDissolve;
    domeMat.opacity *= o;
    barRingMat.opacity *= o;
    if (barDissolve >= 1) {
      barrier.visible = false;
      barDissolve = -1;
    }
    return;
  }
  if (done || flying || FF.on) return;
  // 软推:水平距泊位中心过近→温柔外推到结界边缘(不让踏进沉睡飞舟的泊位)
  const pl = ctx.player.pl;
  if (!pl) return;
  const dx = pl.p.x - PARK.x,
    dz = pl.p.z - PARK.z,
    d = Math.hypot(dx, dz);
  if (d < BAR_R && d > 0.001) {
    pl.p.x = PARK.x + (dx / d) * BAR_R;
    pl.p.z = PARK.z + (dz / d) * BAR_R;
    if (btnT % 15 === 0)
      ctx.ui.modeToast && ctx.ui.modeToast('灵蕴未满，结界仍在。集齐六灵蕴，飞舟自启。');
  }
}

// ===================== 六航路参数(主人定稿文案) =====================
const ROUTES = [
  {
    name: '东线 · 朝霞航路',
    spirit: '春生之芽',
    poem: '黎明从不等人。但它等了你。',
    tint: [255, 183, 109],
    pColor: '#ffd98a',
    mode: 'rise',
  },
  {
    name: '南线 · 炽阳航路',
    spirit: '夏炽之焰',
    poem: '你曾经热爱的，从未真正离开。',
    tint: [255, 122, 74],
    pColor: '#ff6a3a',
    mode: 'rise',
  },
  {
    name: '西线 · 暮色航路',
    spirit: '秋思之叶',
    poem: '眷恋是另一种记忆方式。',
    tint: [195, 141, 158],
    pColor: '#e8a03c',
    mode: 'sway',
  },
  {
    name: '北线 · 寒夜航路',
    spirit: '冬藏之雪',
    poem: '沉默深处，有雪在说话。',
    tint: [93, 106, 142],
    pColor: '#dfeaf5',
    mode: 'fall',
  },
  {
    name: '天顶线 · 破晓航路',
    spirit: '朝露之珠',
    poem: '每一次重新开始，都是第一次。',
    tint: [135, 206, 235],
    pColor: '#7cc8e8',
    mode: 'streak',
  },
  {
    name: '归途线 · 合光航路',
    spirit: '暮光之尘',
    poem: '所有未完成的，都可以被原谅。',
    tint: [232, 200, 144],
    pColor: '#ffffff',
    mode: 'swirl',
  },
];

// ===================== 航线(山巅 → 东→南→西→北→天顶→合光 → 展厅南平台) =====================
const DOCK = { x: 804.2, y: 401.8, z: 593.0 };
const curve = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(PARK.x, PARK.y + 0.4, PARK.z),
    new THREE.Vector3(840, BASE_Y + 40, 600),
    new THREE.Vector3(950, 170, 600), // ①东
    new THREE.Vector3(880, 225, 840), // ②南
    new THREE.Vector3(560, 280, 620), // ③西
    new THREE.Vector3(760, 330, 350), // ④北
    new THREE.Vector3(800, 382, 470), // ⑤天顶
    new THREE.Vector3(802, 395, 555), // ⑥合光
    new THREE.Vector3(DOCK.x, DOCK.y, DOCK.z),
  ],
  false,
  'centripetal'
);

// ===================== 荧光路线(华美荧光线条标记航线,首飞全程可见) =====================
const ROUTE_TUBE_RADIUS = 0.8; // 管道半径
const ROUTE_GLOW_RADIUS = 1.6; // 光晕半径
const routeGroup = new THREE.Group();
routeGroup.visible = false;
s.add(routeGroup);

// 沿曲线生成 6 段荧光管道(每段对应一个航路颜色)
const routeSegments = [];
for (let seg = 0; seg < 6; seg++) {
  const startT = seg / 6,
    endT = (seg + 1) / 6;
  const segCurve = new THREE.CatmullRomCurve3(
    Array.from({ length: 20 }, (_, i) => {
      const t = startT + (endT - startT) * (i / 19);
      return curve.getPoint(t);
    }),
    false,
    'centripetal'
  );
  // 内层发光管道
  const tubeGeo = new THREE.TubeGeometry(segCurve, 40, ROUTE_TUBE_RADIUS, 8, false);
  const tubeMat = new THREE.MeshBasicMaterial({
    color: SPIRIT_COLORS[seg],
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const tube = new THREE.Mesh(tubeGeo, tubeMat);
  routeGroup.add(tube);
  // 外层光晕管道(更大更透明)
  const glowGeo = new THREE.TubeGeometry(segCurve, 40, ROUTE_GLOW_RADIUS, 8, false);
  const glowMat = new THREE.MeshBasicMaterial({
    color: SPIRIT_COLORS[seg],
    transparent: true,
    opacity: 0.15,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  routeGroup.add(glow);
  routeSegments.push({ tube, glow, tubeMat, glowMat });
}

// 分段标记光圈(每段起点/终点)
const routeMarkers = [];
for (let i = 0; i <= 6; i++) {
  const t = i / 6;
  const pos = curve.getPoint(t);
  const ringGeo = new THREE.TorusGeometry(2.5, 0.15, 8, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: i < 6 ? SPIRIT_COLORS[i] : '#ffffff',
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.copy(pos);
  ring.rotation.x = Math.PI / 2; // 水平放置
  routeGroup.add(ring);
  // 内圈光球
  const sphereGeo = new THREE.SphereGeometry(0.8, 12, 8);
  const sphereMat = new THREE.MeshBasicMaterial({
    color: i < 6 ? SPIRIT_COLORS[i] : '#ffffff',
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  sphere.position.copy(pos);
  routeGroup.add(sphere);
  routeMarkers.push({ ring, sphere, ringMat, sphereMat });
}

// 荧光路线动画状态
let routeVisible = false,
  routeOpacity = 1,
  routePulseT = 0;

// ===================== 航路粒子(单套 320 点,六段换色换动法;第六段六色顶点色) =====================
const PN = 320,
  pPos = new Float32Array(PN * 3),
  pCol = new Float32Array(PN * 3);
for (let i = 0; i < PN; i++) {
  const c = new THREE.Color(SPIRIT_COLORS[i % 6]);
  pCol[i * 3] = c.r;
  pCol[i * 3 + 1] = c.g;
  pCol[i * 3 + 2] = c.b;
}
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
// 柔光圆点(默认方点太硬,糊屏元凶)
function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(16, 16, 1, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.4)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
const pMat = new THREE.PointsMaterial({
  color: '#ffd98a',
  size: 0.5,
  map: dotTexture(),
  transparent: true,
  opacity: 0.7,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const flightPts = new THREE.Points(pGeo, pMat);
flightPts.visible = false;
flightPts.frustumCulled = false;
s.add(flightPts);

// ===================== 反馈组件(叮声/大字/着色罩) =====================
function chime(i) {
  try {
    const ac = chime.ac || (chime.ac = new (window.AudioContext || window.webkitAudioContext)());
    const base = [659, 698, 784, 880, 988, 1047][i] || 880;
    [0, 0.12].forEach((d, k) => {
      const o = ac.createOscillator(),
        g = ac.createGain();
      o.type = 'sine';
      o.frequency.value = base * (k ? 2 : 1);
      g.gain.setValueAtTime(0.0001, ac.currentTime + d);
      g.gain.exponentialRampToValueAtTime(0.2, ac.currentTime + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + d + 1.4);
      o.connect(g);
      g.connect(ac.destination);
      o.start(ac.currentTime + d);
      o.stop(ac.currentTime + d + 1.5);
    });
  } catch (e) {}
}
function bigText(text, hold) {
  const d = document.createElement('div');
  d.style.cssText =
    'position:fixed;inset:0;z-index:389;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity .5s';
  const inner = document.createElement('div');
  inner.style.cssText =
    'max-width:86vw;text-align:center;font-size:clamp(19px,4.6vw,30px);letter-spacing:3px;color:#ffe9c4;text-shadow:0 0 30px rgba(255,200,100,.6),0 2px 12px rgba(0,0,0,.8);line-height:1.9';
  inner.textContent = text;
  d.appendChild(inner);
  document.body.appendChild(d);
  requestAnimationFrame(() => {
    d.style.opacity = '1';
  });
  setTimeout(() => {
    d.style.opacity = '0';
    setTimeout(() => d.remove(), 600);
  }, hold || 2200);
}
const tintOv = document.createElement('div');
tintOv.style.cssText =
  'position:fixed;inset:0;z-index:385;pointer-events:none;opacity:0;transition:opacity 1.2s';
document.body.appendChild(tintOv);

// ===================== 自由飞(飞机骨·2026-07-27:首飞后再登舟进入;配方来自两套飞机参考码,温和无失速) =====================
// 物理:四元数姿态;灵蕴自动油门,速度向往巡航值(侧向自然阻尼,轨迹跟机头);
// 控制权限随速度缩放;倾斜联动转向(协调转弯);撞地钳制不死;疆域/天顶软限制。
const FF = {
  on: false,
  pos: new THREE.Vector3(),
  quat: new THREE.Quaternion(),
  vel: new THREE.Vector3(),
  pitchRate: 0,
  rollRate: 0,
  energy: 100,
  boostHold: false,
  autoNav: false,
  lastT: 0,
};
window.__arkFF = FF; // 探针钩子(仿 __vidEl 惯例)
const CRUISE = 24,
  YMAX = 480,
  BOUND_R = 720,
  GROUND_CLEAR = 3;
const QMODEL = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2); // 模型船头 +x → 物理船头 +z
const _qTmp = new THREE.Quaternion(),
  _eTmp = new THREE.Euler(),
  _v1 = new THREE.Vector3(),
  _v2 = new THREE.Vector3(),
  _v3 = new THREE.Vector3();
const _camPos = new THREE.Vector3(); // 追尾相机平滑状态必须自存:主循环每帧先从 pl.p 重置 cam,不能依赖 cam 上帧值
const joy = { x: 0, y: 0, id: null };
let hist = [],
  histLast = 0,
  ffToastT = 0,
  ffStatT = 0;

// ---- HUD(#arkHud:pointer-events none 容器,子控件单独 auto;id 已进 player.js isUiTouch 白名单) ----
const hud = document.createElement('div');
hud.id = 'arkHud';
hud.style.cssText =
  'position:fixed;inset:0;z-index:60;display:none;pointer-events:none;font-family:inherit';
hud.innerHTML =
  '<div id="ffStats" style="position:absolute;top:14px;left:14px;padding:8px 14px;border-radius:12px;border:1px solid rgba(255,214,130,.45);background:rgba(30,20,10,.55);color:#ffe9c4;font-size:13px;letter-spacing:2px;line-height:1.8"></div>' +
  '<div style="position:absolute;right:16px;bottom:96px;text-align:center">' +
  '<div id="ffBoost" style="width:64px;height:64px;margin:0 auto;border-radius:50%;border:1px solid rgba(255,190,110,.8);background:rgba(60,32,10,.6);color:#ffd76a;font-size:13px;letter-spacing:2px;display:flex;align-items:center;justify-content:center;pointer-events:auto;cursor:pointer;user-select:none;-webkit-user-select:none;touch-action:none">冲刺</div>' +
  '<div style="margin:8px auto 0;width:110px;height:8px;border-radius:4px;border:1px solid rgba(255,214,130,.5);background:rgba(20,12,6,.6);overflow:hidden"><div id="ffEnergyBar" style="height:100%;width:100%;background:linear-gradient(90deg,#e8a03c,#ffd76a)"></div></div>' +
  '<div style="margin-top:4px;color:rgba(255,233,196,.7);font-size:11px;letter-spacing:3px">灵蕴</div>' +
  '</div>' +
  '<div style="position:absolute;left:50%;bottom:40px;transform:translateX(-50%);display:flex;gap:14px">' +
  '<button id="ffNavBtn" style="padding:10px 20px;border-radius:20px;border:1px solid rgba(124,200,232,.7);background:rgba(14,26,34,.6);color:#cfe9f5;font-size:14px;letter-spacing:3px;cursor:pointer;font-family:inherit;pointer-events:auto">✦ 去展厅</button>' +
  '<button id="ffHomeBtn" style="padding:10px 20px;border-radius:20px;border:1px solid rgba(255,214,130,.6);background:rgba(40,26,12,.6);color:#ffe9c4;font-size:14px;letter-spacing:3px;cursor:pointer;font-family:inherit;pointer-events:auto">↓ 返回地面</button>' +
  '</div>' +
  '<div id="ffJoy" style="position:absolute;left:26px;bottom:90px;width:108px;height:108px;border-radius:50%;border:1px solid rgba(255,214,130,.4);background:rgba(30,20,10,.35);display:none;pointer-events:auto;touch-action:none">' +
  '<div id="ffKnob" style="position:absolute;left:50%;top:50%;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(255,214,130,.35);border:1px solid rgba(255,214,130,.7)"></div>' +
  '</div>';
document.body.appendChild(hud);
const hudOvApi = ctx.overlay.register(hud, { touchOnly: true }); // 飞行 HUD:只进触摸白名单;Esc 是飞行逻辑(返回地面),不是关弹层
const ffStats = hud.querySelector('#ffStats'),
  ffEnergyBar = hud.querySelector('#ffEnergyBar'),
  ffBoost = hud.querySelector('#ffBoost'),
  ffJoy = hud.querySelector('#ffJoy'),
  ffKnob = hud.querySelector('#ffKnob');
hud.querySelector('#ffNavBtn').onclick = () => {
  if (!FF.on) return;
  FF.autoNav = true;
  ctx.ui.modeToast && ctx.ui.modeToast('自动导航：朝永恒展厅飞去——任何手动操作即可接管。');
};
hud.querySelector('#ffHomeBtn').onclick = () => {
  if (FF.on) endFree('ground');
};
// 冲刺钮(按住)
function boostOn(e) {
  e.preventDefault();
  FF.boostHold = true;
  ffBoost.style.background = 'rgba(120,60,16,.75)';
}
function boostOff() {
  FF.boostHold = false;
  ffBoost.style.background = 'rgba(60,32,10,.6)';
}
ffBoost.addEventListener('touchstart', boostOn, { passive: false });
ffBoost.addEventListener('touchend', boostOff);
ffBoost.addEventListener('touchcancel', boostOff);
ffBoost.addEventListener('mousedown', boostOn);
ffBoost.addEventListener('mouseup', boostOff);
ffBoost.addEventListener('mouseleave', boostOff);
// 手机虚拟摇杆(左下:推上=爬升,推下=俯冲,左右=倾斜转向)
if ('ontouchstart' in window) ffJoy.style.display = 'block';
function joyMove(t) {
  const r = ffJoy.getBoundingClientRect(),
    cx = r.left + r.width / 2,
    cy = r.top + r.height / 2;
  let dx = t.clientX - cx,
    dy = t.clientY - cy;
  const m = Math.hypot(dx, dy),
    max = 40;
  if (m > max) {
    dx *= max / m;
    dy *= max / m;
  }
  joy.x = dx / max;
  joy.y = dy / max;
  ffKnob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
}
ffJoy.addEventListener(
  'touchstart',
  (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    joy.id = t.identifier;
    joyMove(t);
  },
  { passive: false }
);
ffJoy.addEventListener(
  'touchmove',
  (e) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === joy.id) joyMove(t);
    }
  },
  { passive: false }
);
function joyEnd(e) {
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === joy.id) {
      joy.id = null;
      joy.x = 0;
      joy.y = 0;
      ffKnob.style.transform = '';
    }
  }
}
ffJoy.addEventListener('touchend', joyEnd);
ffJoy.addEventListener('touchcancel', joyEnd);

function startFree() {
  if (FF.on || flying || !ctx.player.pl) return;
  FF.on = true;
  FF.autoNav = false;
  FF.boostHold = false;
  FF.pos.set(ark.position.x, ark.position.y + 0.6, ark.position.z);
  FF.quat.setFromEuler(new THREE.Euler(0, Math.PI, 0)); // 机头朝北,背对山巅
  FF.vel.set(0, 0, 0);
  FF.pitchRate = 0;
  FF.rollRate = 0;
  FF.energy = 100;
  hist = [];
  histLast = 0;
  FF.lastT = performance.now();
  _camPos.copy(FF.pos); // 相机从船上平滑拉出
  gs.set('flightLock', true); // 阶段4:经 gameState.set 写回(读者 ctx.kunlun.flightLock 经 vault 同步) // 总锁:player 移动/物理/小地图/回家键全部冻结
  boardBtn.style.display = 'none';
  hud.style.display = 'block';
  ark.visible = true;
  flightPts.visible = true;
  // 手动飞行时显示荧光路线(半透明,作为路径参考)
  routeGroup.visible = true;
  routeVisible = true;
  routeOpacity = 0.4; // 半透明,不遮挡视野
  applyRouteOpacity();
  pMat.vertexColors = false;
  pMat.color.set('#ffd76a');
  pMat.needsUpdate = true;
  if (!ctx.store.flag('arkFFSeen')) {
    ctx.store.mark('arkFFSeen');
    bigText('从现在起，风向由你决定。', 3000);
    ctx.ui.kunlunSpeak &&
      ctx.ui.kunlunSpeak(
        '从现在起，风向由你决定。W 爬升，S 俯冲，A D 转向，空格冲刺。点去展厅可以自动导航。',
        'ark'
      ); // B6 航路音色
  }
  ctx.ui.modeToast && ctx.ui.modeToast('W 爬升 · S 俯冲 · A/D 转向 · 空格冲刺 · E 降落 · Esc 返回');
}
// mode:'ground'=人舟化光回山巅;'land'=原地降落(人落当前点,舟回山巅);'dock'=静默清理(dock() 接管落位)
function endFree(mode) {
  if (!FF.on) return;
  FF.on = false;
  FF.autoNav = false;
  FF.boostHold = false;
  hud.style.display = 'none';
  flightPts.visible = false;
  // 隐藏荧光路线
  routeVisible = false;
  routeGroup.visible = false;
  gs.set('flightLock', false); // 阶段4:经 gameState.set 写回(读者 ctx.kunlun.flightLock 经 vault 同步)
  const pl = ctx.player.pl;
  if (mode === 'ground') {
    pl.p.set(PARK.x, groundY(PARK.x, PARK.z + 3) + 1.6, PARK.z + 3);
    pl.y = Math.PI;
    pl.pi = 0.15;
    pl.vy = 0;
    pl.onGround = true;
    ark.position.set(PARK.x, PARK.y, PARK.z);
    ark.visible = spiritCount() >= 1;
    ctx.ui.modeToast && ctx.ui.modeToast('飞舟化作一道光，载你回到山巅。');
  } else if (mode === 'land') {
    pl.p.copy(FF.pos);
    pl.vy = 0;
    pl.onGround = false; // 从当前位置缓缓落下
    ark.position.set(PARK.x, PARK.y, PARK.z);
    ark.visible = spiritCount() >= 1;
    ctx.ui.modeToast && ctx.ui.modeToast('已下舟——飞舟自己回山巅等你了。');
  }
  if (mode !== 'dock') {
    ctx.scene.cam.position.copy(pl.p);
    ctx.scene.cam.rotation.y = pl.y;
    ctx.scene.cam.rotation.x = pl.pi;
  }
}
function freeTick() {
  const now = performance.now();
  let dt = (now - FF.lastT) / 1000;
  FF.lastT = now;
  if (!(dt > 0)) dt = 0.016;
  if (dt > 0.05) dt = 0.05;
  const ks = ctx.player.ks || {};
  // 输入:W 爬升 / S 俯冲 / A D 转向(摇杆同向);正 pitch=抬首,正 roll=左倾
  let pitchIn = (ks.w ? 1 : 0) - (ks.s ? 1 : 0) - joy.y;
  let rollIn = (ks.a ? 1 : 0) - (ks.d ? 1 : 0) + joy.x;
  // 自动导航:朝展厅泊位柔和转向,任何手动输入立即接管
  if (FF.autoNav) {
    _v1.set(DOCK.x - FF.pos.x, DOCK.y - FF.pos.y, DOCK.z - FF.pos.z);
    if (_v1.length() < 10) {
      dock();
      return;
    }
    _v1.normalize();
    _v2.set(0, 0, 1).applyQuaternion(FF.quat);
    const crossY = _v2.z * _v1.x - _v2.x * _v1.z; // >0 目标在右侧
    if (Math.abs(pitchIn) > 0.15 || Math.abs(rollIn) > 0.15 || FF.boostHold || ks[' ']) {
      FF.autoNav = false;
      ctx.ui.modeToast && ctx.ui.modeToast('已接管手动驾驶。');
    } else {
      rollIn = -Math.max(-1, Math.min(1, crossY * 3));
      pitchIn = Math.max(-0.6, Math.min(0.6, (_v1.y - _v2.y) * 4));
    }
  }
  if (pitchIn > 1) pitchIn = 1;
  if (pitchIn < -1) pitchIn = -1;
  if (rollIn > 1) rollIn = 1;
  if (rollIn < -1) rollIn = -1;
  // 控制权限随速度(低速不灵活;无失速,不会拍地上)
  const spd = FF.vel.length();
  const auth = Math.max(0.35, Math.min(1, spd / 12));
  // 姿态角提取(限幅+松杆自动改平:2026-07-27 探针血泪——纯角速度积分,按住 W 2 秒翻 183° 倒扣)
  _v2.set(0, 0, 1).applyQuaternion(FF.quat);
  const pitchCur = Math.asin(Math.max(-1, Math.min(1, _v2.y))); // 当前仰角
  _v3.set(1, 0, 0).applyQuaternion(FF.quat);
  const rollCur = Math.asin(Math.max(-1, Math.min(1, _v3.y))); // 当前左倾角
  const P_LIM = 1.05,
    R_LIM = 1.3; // 俯仰 ±60°、滚转 ±75°:到边不许再转
  if (pitchCur > P_LIM && pitchIn > 0) pitchIn = 0;
  if (pitchCur < -P_LIM && pitchIn < 0) pitchIn = 0;
  if (rollCur > R_LIM && rollIn > 0) rollIn = 0;
  if (rollCur < -R_LIM && rollIn < 0) rollIn = 0;
  const k = Math.min(1, dt * 6);
  let tPitch = pitchIn * 1.6 * auth,
    tRoll = rollIn * 2.2 * auth;
  if (Math.abs(pitchIn) < 0.1) tPitch += -pitchCur * 1.2 * auth; // 松杆自动改平(街机手感)
  if (Math.abs(rollIn) < 0.1) tRoll += -rollCur * 1.5 * auth;
  FF.pitchRate += (tPitch - FF.pitchRate) * k;
  FF.rollRate += (tRoll - FF.rollRate) * k;
  const yawRate = -FF.rollRate * 0.5; // 协调转弯:倾斜自动带转向
  _eTmp.set(-FF.pitchRate * dt, yawRate * dt, FF.rollRate * dt, 'YXZ');
  _qTmp.setFromEuler(_eTmp);
  FF.quat.multiply(_qTmp).normalize();
  // 灵蕴驱动·自动油门:速度向往巡航值,侧向自然阻尼
  const boosting = (FF.boostHold || ks[' ']) && FF.energy > 0;
  if (boosting) FF.energy = Math.max(0, FF.energy - 14 * dt);
  else FF.energy = Math.min(100, FF.energy + 10 * dt);
  _v2
    .set(0, 0, 1)
    .applyQuaternion(FF.quat)
    .multiplyScalar(CRUISE * (boosting ? 1.9 : 1));
  FF.vel.lerp(_v2, Math.min(1, dt * 2.2));
  FF.pos.addScaledVector(FF.vel, dt);
  // 实心山铁律:撞地钳制(灵蕴护体,不死)
  const gh = ctx.media.desert ? ctx.media.desert.getH(FF.pos.x, FF.pos.z) : 0;
  if (FF.pos.y < gh + GROUND_CLEAR) {
    FF.pos.y = gh + GROUND_CLEAR;
    if (FF.vel.y < 0) FF.vel.y = 0;
    FF.vel.multiplyScalar(0.94);
    if (now - ffToastT > 3000) {
      ffToastT = now;
      ctx.ui.modeToast && ctx.ui.modeToast('灵蕴护体，飞舟轻轻掠过地面。');
    }
  }
  // 天顶与疆域(昆仑托底)
  if (FF.pos.y > YMAX) {
    FF.pos.y = YMAX;
    if (FF.vel.y > 0) FF.vel.y = 0;
  }
  {
    const dx = FF.pos.x - KX,
      dz = FF.pos.z - KZ,
      r = Math.hypot(dx, dz);
    if (r > BOUND_R) {
      FF.pos.x = KX + (dx / r) * BOUND_R;
      FF.pos.z = KZ + (dz / r) * BOUND_R;
      FF.vel.multiplyScalar(0.9);
      if (now - ffToastT > 3000) {
        ffToastT = now;
        ctx.ui.modeToast && ctx.ui.modeToast('再远，昆仑就托不住你了。');
      }
    }
  }
  // 渲染:飞舟姿态(QMODEL 对齐模型船头 +x 与物理船头 +z)
  ark.position.copy(FF.pos);
  ark.quaternion.copy(FF.quat).multiply(QMODEL);
  // 玩家状态同步(小地图/天空/沙漠区块以 pl.p 为准)
  const pl = ctx.player.pl;
  pl.p.copy(FF.pos);
  pl.vy = 0;
  pl.onGround = false;
  _v2.set(0, 0, 1).applyQuaternion(FF.quat);
  pl.y = Math.atan2(-_v2.x, -_v2.z);
  pl.pi = 0;
  // 第三人称追尾相机(主循环相机同步在 ticker 之前执行且每帧重置 cam,此处用自存平滑状态覆盖)
  _v3.set(0, 4.2, -13).applyQuaternion(FF.quat).add(FF.pos);
  _camPos.lerp(_v3, Math.min(1, dt * 5));
  ctx.scene.cam.position.copy(_camPos);
  _v3.set(0, 1.2, 10).applyQuaternion(FF.quat).add(FF.pos);
  ctx.scene.cam.lookAt(_v3);
  // 尾迹:沿航迹铺柔光粒子,冲刺变粗
  if (now - histLast > 60 && spd > 5) {
    hist.push(FF.pos.clone());
    if (hist.length > 80) hist.shift();
    histLast = now;
  }
  {
    const arr = pGeo.attributes.position.array,
      n = hist.length;
    for (let i = 0; i < PN; i++) {
      const h = n ? hist[Math.max(0, n - 1 - Math.floor(i / 4))] : FF.pos;
      arr[i * 3] = h.x + (((i * 37) % 10) - 5) * 0.14;
      arr[i * 3 + 1] = h.y + (((i * 23) % 8) - 4) * 0.12;
      arr[i * 3 + 2] = h.z + (((i * 53) % 10) - 5) * 0.14;
    }
    pGeo.attributes.position.needsUpdate = true;
    pMat.size += ((boosting ? 0.85 : 0.5) - pMat.size) * 0.15;
  }
  // HUD 刷新(120ms 节流)
  if (now - ffStatT > 120) {
    ffStatT = now;
    ffStats.textContent =
      '高度 ' +
      Math.round(FF.pos.y) +
      ' m · 速度 ' +
      Math.round(spd) +
      ' m/s' +
      (FF.autoNav ? ' · 自动导航中' : '');
    ffEnergyBar.style.width = Math.round(FF.energy) + '%';
  }
}

// ===================== 登舟按钮(走近出现;button 天然过 isUiTouch 白名单) =====================
const boardBtn = document.createElement('button');
boardBtn.style.cssText =
  'position:fixed;left:50%;bottom:160px;transform:translateX(-50%);z-index:60;display:none;padding:12px 30px;border-radius:24px;border:1px solid rgba(255,214,130,.7);background:rgba(40,26,12,.8);color:#ffe9c4;font-size:16px;letter-spacing:4px;cursor:pointer;font-family:inherit';
document.body.appendChild(boardBtn);
boardBtn.onclick = () => {
  if (!(ctx.kunlun.isDone && ctx.kunlun.isDone())) {
    const n = ctx.kunlun.spiritsGot ? ctx.kunlun.spiritsGot() : 0;
    ctx.ui.modeToast && ctx.ui.modeToast('六灵蕴未齐（' + n + '/6）——飞舟还在沉睡。');
    return;
  }
  if (ctx.store.flag('arkFlew'))
    startFree(); // 首飞完成后:自由飞
  else startFlight(); // 第一次:电影化六航路巡礼
};
// 跳过按钮(仅飞行中)
const skipBtn = document.createElement('button');
skipBtn.textContent = '跳过 · 立即抵达';
skipBtn.style.cssText =
  'position:fixed;right:18px;bottom:170px;z-index:60;display:none;padding:9px 16px;border-radius:18px;border:1px solid rgba(255,255,255,.35);background:rgba(20,14,10,.55);color:#ffe9c4;font-size:13px;cursor:pointer;font-family:inherit';
document.body.appendChild(skipBtn);
skipBtn.onclick = () => {
  if (flying) dock();
};
function onKey(e) {
  if (e.key && e.key.toLowerCase() === 'e') {
    if (FF.on) {
      // 自由飞:低空低速原地降落
      const gh = ctx.media.desert ? ctx.media.desert.getH(FF.pos.x, FF.pos.z) : 0;
      if (FF.pos.y < gh + 12 && FF.vel.length() < 30) endFree('land');
      else ctx.ui.modeToast && ctx.ui.modeToast('太高或太快——先减速低飞，再按 E 降落。');
      return;
    }
    if (boardBtn.style.display === 'block') boardBtn.click();
  }
  if (e.key === 'Escape') {
    if (flying) dock();
    else if (FF.on) endFree('ground');
  }
}
document.addEventListener('keydown', onKey);

// ===================== 飞行主流程 =====================
const FLY_MS = 66000;
let flying = false,
  flyT0 = 0,
  flySeg = -1;
function startFlight() {
  if (flying || !ctx.player.pl) return;
  flying = true;
  flyT0 = performance.now();
  flySeg = -1;
  gs.set('flightLock', true); // 阶段4:经 gameState.set 写回(读者 ctx.kunlun.flightLock 经 vault 同步) // player.js:移动/物理/小地图传送/回家键全部冻结
  boardBtn.style.display = 'none';
  skipBtn.style.display = 'block';
  ark.visible = false;
  flightPts.visible = true;
  // 显示荧光路线(首飞全程可见)
  routeGroup.visible = true;
  routeVisible = true;
  routeOpacity = 1;
  applyRouteOpacity();
  bigText('灵蕴飞舟 · 六航路巡礼', 2600);
  ctx.ui.modeToast && ctx.ui.modeToast('坐稳了——昆仑的风在为你让路。');
}
function enterSeg(k) {
  flySeg = k;
  const r = ROUTES[k];
  tintOv.style.background = `radial-gradient(circle at 50% 42%, rgba(${r.tint[0]},${r.tint[1]},${r.tint[2]},0.16), rgba(${r.tint[0]},${r.tint[1]},${r.tint[2]},0.05) 55%, rgba(0,0,0,0) 78%)`;
  tintOv.style.opacity = '1';
  bigText(r.spirit + ' · ' + r.name);
  ctx.ui.kunlunSpeak && ctx.ui.kunlunSpeak(r.poem, 'ark'); // B6 航路音色
  chime(k);
  if (k === 5) {
    pMat.vertexColors = true;
  } else {
    pMat.vertexColors = false;
    pMat.color.set(r.pColor);
  }
  pMat.needsUpdate = true;
}
function dock() {
  if (!(flying || FF.on)) return;
  if (FF.on) endFree('dock'); // 自由飞飞近泊位:静默清理,下面统一落位
  flying = false;
  skipBtn.style.display = 'none';
  tintOv.style.opacity = '0';
  flightPts.visible = false;
  // 荧光路线淡出(2秒后隐藏)
  routeVisible = false;
  setTimeout(() => {
    routeGroup.visible = false;
  }, 2000);
  const pl = ctx.player.pl;
  pl.p.set(DOCK.x, 401.6, 593.2);
  pl.y = 2.5;
  pl.pi = 0.08;
  pl.vy = 0;
  pl.onGround = true;
  ctx.scene.cam.position.copy(pl.p);
  ctx.scene.cam.rotation.y = pl.y;
  ctx.scene.cam.rotation.x = pl.pi;
  gs.set('flightLock', false); // 阶段4:经 gameState.set 写回(读者 ctx.kunlun.flightLock 经 vault 同步)
  ctx.store.mark('arkFlew');
  ctx.kunlun.eternalWelcome && ctx.kunlun.eternalWelcome(); // 首到欢迎(已迎过则静默)
  ctx.ui.modeToast && ctx.ui.modeToast('已停靠 · 永恒展厅南侧平台');
  window.__refreshSpirits && window.__refreshSpirits();
  // 飞舟化光返回山巅
  setTimeout(() => {
    ark.position.set(PARK.x, PARK.y, PARK.z);
    ark.visible = spiritCount() >= 1;
  }, 2500);
}
// 罗盘传送:回到山巅登舟点
ctx.kunlun.arkTeleportToPeak = function () {
  if (flying) return;
  const pl = ctx.player.pl;
  if (!pl) return;
  goldenTeleport(() => {
    pl.p.set(PARK.x, groundY(PARK.x, PARK.z + 3) + 1.6, PARK.z + 3);
    pl.y = Math.PI;
    pl.pi = 0.15;
    pl.vy = 0;
    pl.onGround = true;
    ctx.scene.cam.position.copy(pl.p);
    ctx.scene.cam.rotation.y = pl.y;
    ctx.scene.cam.rotation.x = pl.pi;
  });
};

// 荧光路线透明度应用(淡出动画)
function applyRouteOpacity() {
  routeSegments.forEach((seg) => {
    seg.tubeMat.opacity = 0.6 * routeOpacity;
    seg.glowMat.opacity = 0.15 * routeOpacity;
  });
  routeMarkers.forEach((m) => {
    m.ringMat.opacity = 0.7 * routeOpacity;
    m.sphereMat.opacity = 0.5 * routeOpacity;
  });
}

// ===================== 主循环:形态进化 + 悬浮 + 登舟提示 + 飞行推进 =====================
let appliedN = -1,
  btnT = 0;
function applyForm(n) {
  appliedN = n;
  for (let k = 0; k < 6; k++) {
    gems[k].material.color.set(k < n ? SPIRIT_COLORS[k] : '#554a3a');
  }
  // GLTF 模型形态进化:灵蕴越多,模型发光越强
  const ei = n >= 3 ? 0.25 + n * 0.1 : 0; // 3 颗起发光,6 颗最强
  shipMats.forEach((m) => {
    if (m.emissiveIntensity !== undefined) m.emissiveIntensity = ei;
  });
  aura.material.opacity = n >= 6 ? 0.9 : 0; // 6:六色流光周身
}
onTick(function () {
  barTick(); // B3 结界状态机(立起/消融/软推)
  const n = ctx.kunlun.spiritsGot ? ctx.kunlun.spiritsGot() : 0;
  if (n !== appliedN) applyForm(n);
  ark.visible = FF.on ? true : !flying && n >= 1;
  const t = performance.now() * 0.001;
  // 荧光路线动画(脉动+淡出)
  if (routeGroup.visible) {
    routePulseT += 0.016;
    // 脉动效果:光圈旋转+光球呼吸
    routeMarkers.forEach((m, i) => {
      m.ring.rotation.z += 0.015 * (i % 2 === 0 ? 1 : -1);
      m.sphere.scale.setScalar(1 + Math.sin(routePulseT * 2 + i) * 0.15);
    });
    // 淡出动画
    if (!routeVisible && routeOpacity > 0) {
      routeOpacity = Math.max(0, routeOpacity - 0.016 * 0.5); // 2秒淡出
      applyRouteOpacity();
    }
    // 飞行中荧光路线微微脉动
    if (flying || FF.on) {
      const pulse = 1 + Math.sin(routePulseT * 3) * 0.08;
      routeSegments.forEach((seg) => {
        seg.tubeMat.opacity = 0.6 * routeOpacity * pulse;
      });
    }
  }
  if (ark.visible) {
    if (!FF.on) {
      ark.position.y = PARK.y + Math.sin(t * 1.2) * 0.12; // 待机悬浮呼吸
      ark.rotation.y = Math.sin(t * 0.4) * 0.06;
    }
    haloG.rotation.y += 0.008;
    if (n >= 6) {
      const ga = auraGeo.attributes.position.array;
      for (let i = 0; i < AURA_N; i++) {
        ga[i * 3 + 1] += Math.sin(t * 2 + i) * 0.002;
      }
      auraGeo.attributes.position.needsUpdate = true;
    }
  }
  // 登舟提示(4m,250ms 节流)
  btnT++;
  if (btnT % 15 === 0 && ctx.player.pl && !flying && !FF.on) {
    const dx = ctx.player.pl.p.x - PARK.x,
      dz = ctx.player.pl.p.z - PARK.z,
      near = dx * dx + dz * dz < 16;
    if (near && n >= 1) {
      boardBtn.style.display = 'block';
      boardBtn.textContent =
        ctx.kunlun.isDone && ctx.kunlun.isDone() ? '登 上 飞 舟' : '飞舟沉睡中（' + n + '/6）';
    } else boardBtn.style.display = 'none';
  }
  if (flying) {
    const el = performance.now() - flyT0,
      tt = Math.min(el / FLY_MS, 1);
    const seg = Math.min(5, Math.floor(tt * 6));
    if (seg !== flySeg) enterSeg(seg);
    const pos = curve.getPoint(tt),
      tan = curve.getTangent(tt);
    const pl = ctx.player.pl;
    pl.p.copy(pos);
    pl.y = Math.atan2(-tan.x, -tan.z);
    pl.pi = Math.max(-0.5, Math.min(0.5, Math.asin(Math.max(-1, Math.min(1, tan.y))) * 0.8));
    // 航路粒子:环绕玩家的流带,按航段换动法
    const mode = ROUTES[flySeg].mode,
      arr = pGeo.attributes.position.array;
    for (let i = 0; i < PN; i++) {
      const sd = i * 2.399,
        sp = (i % 7) * 0.5 + 1;
      let ang = sd,
        rad = 9 + ((i * 37) % 20),
        yo = ((i * 13) % 12) - 6; // 环带 9~29m:让出视野中心,看得见航线
      if (mode === 'rise') {
        yo = ((t * sp * 2 + sd) % 12) - 6;
      } else if (mode === 'fall') {
        yo = 6 - ((t * sp * 2 + sd) % 12);
      } else if (mode === 'sway') {
        yo = 6 - ((t * sp + sd) % 12);
        ang += Math.sin(t * 2 + sd) * 0.8;
      } else if (mode === 'streak') {
        yo = ((t * sp * 6 + sd) % 16) - 8;
        rad = 5 + ((i * 17) % 12);
      } else if (mode === 'swirl') {
        ang += t * 1.5;
        rad = 24 - (tt * 6 - 5) * 18;
        if (rad < 7) rad = 7;
      }
      arr[i * 3] = pos.x + Math.cos(ang) * rad;
      arr[i * 3 + 1] = pos.y + yo;
      arr[i * 3 + 2] = pos.z + Math.sin(ang) * rad;
    }
    pGeo.attributes.position.needsUpdate = true;
    if (tt >= 1) dock();
  }
  if (FF.on) freeTick(); // 自由飞:物理+相机+尾迹+HUD
});

bag.custom.push(() => {
  if (flying) {
    gs.set('flightLock', false); // 阶段4:经 gameState.set 写回(读者 ctx.kunlun.flightLock 经 vault 同步)
    flying = false;
  }
  if (FF.on) {
    gs.set('flightLock', false); // 阶段4:经 gameState.set 写回(读者 ctx.kunlun.flightLock 经 vault 同步)
    FF.on = false;
  }
  boardBtn.remove();
  skipBtn.remove();
  tintOv.remove();
  hud.remove();
  routeGroup.remove(); // 清理荧光路线
  hudOvApi.unregister();
  document.removeEventListener('keydown', onKey);
  ctx.kunlun.arkTeleportToPeak = null;
  window.__arkFF = null;
});
hotEnd('ark');
if (import.meta.hot) import.meta.hot.accept();
