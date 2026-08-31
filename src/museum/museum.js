// museum.js — 万镜博物馆世界(2026-08-31 方案 A 试点)
// 架构:大堂(hintze-hall 扫描)与贵族房间各自占据一个远区坐标,三层世界状态机
//   gallery(现有画廊) ↔ hall(大堂) ↔ room(id)(贵族房间)
// 移动方案(审计结论):扫描模型零碰撞,纯视觉;行走靠"隐形积木"——
//   groundOverride 接管地板 + AABB 隐形墙(bounds 共享数组) + 现有玩家控制原样
// 加载策略:世界模型第一次进入时按需加载(带进度遮罩),之后常驻 visible 切换,切换瞬时
// 接入:画廊南通道 (6, 26) 放发光门框,走近 2.5m 自动触发 enterHall
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ctx } from '../ctx.js';
import { hotBegin, hotEnd } from '../hot.js';
import { goldenTeleport } from '../shared/teleport-fx.js';

// 2026-08-31:hintze-hall 是 Z-up(地板 mesh Z 范围 -9~1,X 跨 123m → Z 是高度)。
// 但 quantize 后坐标反变换改了 Z 范围,旋转后世界盒 ±28.8m(对称)而非 0~38.5m,玩家被定位在中腰。
// 权衡:保持不旋转 + 远端石块用场景雾融掉(让 Z-up 几何延伸看起来像"沙地中的石阵");
//       vs 旋转 + 修偏移(玩家站 Y=28m 顶楼、踩不到地板、看不到一楼大厅)。
// 选前者:用户认可的拱廊/钢架主楼梯视角保留,"漂浮石块"在沙漠雾中虚化容忍。
const Z_UP = false;
import { bigText } from '../ui/kit.js';
import { HALL, ROOMS, ROOM_BY_ID } from './rooms-config.js';

const bag = hotBegin('museum');

const { s, bounds, addBounds, removeBounds } = ctx.scene;

const loader = new GLTFLoader();
const cache = new Map(); // url -> THREE.Group(常驻,visible 切换)
const worldBounds = new Map(); // url -> [AABB...] 该世界专属碰撞
let current = 'gallery'; // gallery | hall:<url> | room:<id>
let tpLock = false;
let museumLight = null; // 大堂/房间是 PBR 材质,需要灯光(unlit 房间不受影响,共用无妨)

// ---------- 加载遮罩 ----------
let maskEl = null;
function showMask(name) {
  if (!maskEl) {
    maskEl = document.createElement('div');
    maskEl.style.cssText =
      'position:fixed;inset:0;z-index:9000;background:#0d0a12;color:#ffe2c4;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:15px;letter-spacing:2px';
    maskEl.innerHTML =
      '<div id="_mzName" style="font-size:22px;font-weight:700;margin-bottom:14px"></div>' +
      '<div style="width:260px;height:8px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden"><div id="_mzBar" style="width:0%;height:100%;background:linear-gradient(90deg,#ff9a9e,#fecfef);transition:width .2s"></div></div>' +
      '<div id="_mzPct" style="margin-top:10px;opacity:.6;font-size:12px"></div>';
    document.body.appendChild(maskEl);
  }
  maskEl.style.display = 'flex';
  maskEl.querySelector('#_mzName').textContent = name;
  maskEl.querySelector('#_mzBar').style.width = '0%';
  maskEl.querySelector('#_mzPct').textContent = '';
}
function hideMask() {
  if (maskEl) maskEl.style.display = 'none';
}

// ---------- 模型加载(常驻缓存) ----------
function loadWorld(url, name) {
  if (cache.has(url)) return Promise.resolve(cache.get(url));
  showMask(name);
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const obj = gltf.scene;
        // 2026-08-31 轴向修正:hintze-hall 是 Z-up 导出(实测地板 mesh "sol" 的 Z 范围仅 -9~1、
        // X 跨 123m、Y 跨 53m → Z 才是高度方向)。three 按 Y-up 加载会让整栋楼躺倒,
        // 玩家看到的是"建筑侧面"而非室内,且地板穿透成坡。绕 X 轴 -90°:(x,y,z)→(x,z,-y)
        if (Z_UP) obj.rotation.x = -Math.PI / 2;
        // 扫描资产贴图自带烘焙光照 → 全部转 MeshBasicMaterial(unlit)+关闭雾影响,
        // 呈现 VR Tour 原貌且不受场景灯光/雾/昼夜干扰
        obj.traverse((o) => {
          if (o.material) {
            const fix = (m0) => {
              // 2026-08-31 Z-up 妥协:开雾让远处 Z-up 几何延伸融进沙漠
              const basic = new THREE.MeshBasicMaterial({ fog: true });
              if (m0.map) basic.map = m0.map;
              if (m0.color) basic.color = m0.color;
              basic.side = THREE.DoubleSide; // 从建筑内部观看,必须双面渲染(否则看到的是外面)
              return basic;
            };
            o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material);
          }
        });
        s.add(obj);
        cache.set(url, obj);
        hideMask();
        resolve(obj);
      },
      (ev) => {
        if (!ev.total) return;
        const pct = Math.round((ev.loaded / ev.total) * 100);
        const bar = maskEl && maskEl.querySelector('#_mzBar');
        const pctEl = maskEl && maskEl.querySelector('#_mzPct');
        if (bar) bar.style.width = pct + '%';
        if (pctEl) pctEl.textContent = pct + '%';
      },
      (e) => {
        hideMask();
        reject(e);
      }
    );
  });
}

// ---------- 灯光(大堂/房间 PBR 需要;进入时挂,常驻) ----------
function ensureLight() {
  if (museumLight) return;
  const amb = new THREE.AmbientLight(0xfff2e0, 1.1);
  const dir = new THREE.DirectionalLight(0xfff2e0, 1.4);
  dir.position.set(-1200, 120, -800);
  museumLight = new THREE.Group();
  museumLight.add(amb, dir);
  s.add(museumLight);
}

// ---------- 摆放模型:包围盒中心对齐世界锚点,地面(minY)对齐 FLOOR ----------
function place(obj, cfg) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  obj.position.set(
    cfg.X - center.x * cfg.SCALE,
    cfg.FLOOR - box.min.y * cfg.SCALE,
    cfg.Z - center.z * cfg.SCALE
  );
  obj.scale.setScalar(cfg.SCALE);
  obj.updateMatrixWorld(true);
  // 2026-08-31 手机实测:大堂外沙漠地形 Y=0~5 穿入室内 → 在大堂底部加一个略大于模型的 plane
  // 遮住底部沙漠,使玩家看到的是"博物馆地板"而不是"外面的沙漠岩石"
  if (cfg.floor === true) {
    const pad = 4; // 四周外扩 4m
    const floorGeom = new THREE.PlaneGeometry(size.x + pad * 2, size.z + pad * 2);
    const floorMat = new THREE.MeshBasicMaterial({
      color: cfg.floorColor || 0xc4a880, // 黄褐色石材,贴近大堂主色调
      fog: false,
      side: THREE.DoubleSide,
    });
    const floorMesh = new THREE.Mesh(floorGeom, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    // 2026-08-31:Z-up 旋转后 box.min.y=-27(外墙地下延伸),用 cfg.floorOffsetY 调地板 plane 高度覆盖外墙地下
    const floorY = cfg.FLOOR + (cfg.floorOffsetY || 0);
    floorMesh.position.set(cfg.X, floorY, cfg.Z);
    floorMesh.renderOrder = -1; // 防止与地面 z-fighting
    s.add(floorMesh);
  }
  return size;
}

// ---------- 世界碰撞:生成可走区外圈隐形墙 ----------
function buildBounds(cfg) {
  const list = [];
  const { hx, hz } = cfg.WALK;
  const walls = [
    [cfg.X - hx, cfg.Z - hz, cfg.X + hx, cfg.Z - hz],
    [cfg.X + hx, cfg.Z - hz, cfg.X + hx, cfg.Z + hz],
    [cfg.X + hx, cfg.Z + hz, cfg.X - hx, cfg.Z + hz],
    [cfg.X - hx, cfg.Z + hz, cfg.X - hx, cfg.Z - hz],
  ];
  for (const [x1, z1, x2, z2] of walls) {
    const cx = (x1 + x2) / 2,
      cz = (z1 + z2) / 2;
    const len = Math.hypot(x2 - x1, z2 - z1);
    const sA = Math.abs(Math.sin(0)) + 0, // 轴对齐
      cA = 1;
    list.push({
      mnX: cx - ((sA * len) / 2 + cA * 0.2) - 0.1,
      mxX: cx + ((sA * len) / 2 + cA * 0.2) + 0.1,
      mnZ: cz - ((cA * len) / 2 + sA * 0.2) - 0.1,
      mxZ: cz + ((cA * len) / 2 + sA * 0.2) + 0.1,
    });
  }
  return list;
}

// ---------- 碰撞切换(bounds 是 player.js 共享引用) ----------
let savedGalleryBounds = null;
function swapBounds(newList) {
  if (!savedGalleryBounds) savedGalleryBounds = bounds.slice(); // 首次进入:存画廊碰撞
  bounds.length = 0;
  for (const b of newList) bounds.push(b);
}
function restoreGalleryBounds() {
  if (!savedGalleryBounds) return;
  bounds.length = 0;
  for (const b of savedGalleryBounds) bounds.push(b);
}

// ---------- 地面接管 ----------
// 注意:eternal.js 在本模块之后加载,会覆盖 ctx.kunlun.groundOverride。
// 因此接管动作在 enterHall/enterRoom 运行时执行(此时 eternal 已就绪),退出画廊时恢复。
function museumGround(x, z) {
  const cfg = current === 'hall' ? HALL : ROOM_BY_ID[current.slice(5)];
  if (!cfg) return undefined;
  if (Math.abs(x - cfg.X) < cfg.WALK.hx + 2 && Math.abs(z - cfg.Z) < cfg.WALK.hz + 2)
    return cfg.FLOOR;
  return undefined;
}
let prevOverride = null;

// ---------- 门框(发光,走近触发) ----------
const portals = [];
function makePortal(x, z, y, color, label, action) {
  const gp = new THREE.Group();
  const frame = new THREE.Mesh(
    new THREE.TorusGeometry(1.1, 0.12, 10, 32),
    new THREE.MeshBasicMaterial({ color })
  );
  frame.position.y = 1.6;
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide,
  });
  const fill = new THREE.Mesh(new THREE.CircleGeometry(1.0, 32), mat);
  fill.position.y = 1.6;
  gp.add(frame, fill);
  // 名牌(canvas 精灵)
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 96;
  const c2 = cv.getContext('2d');
  c2.fillStyle = 'rgba(13,10,18,.85)';
  c2.fillRect(0, 0, 512, 96);
  c2.strokeStyle = color;
  c2.lineWidth = 4;
  c2.strokeRect(2, 2, 508, 92);
  c2.fillStyle = '#ffe2c4';
  c2.font = 'bold 44px sans-serif';
  c2.textAlign = 'center';
  c2.textBaseline = 'middle';
  c2.fillText(label, 256, 50);
  const tex = new THREE.CanvasTexture(cv);
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sign.scale.set(4.2, 0.8, 1);
  sign.position.y = 3.4;
  gp.add(sign);
  gp.position.set(x, y, z);
  s.add(gp);
  portals.push({ gp, action, world: current });
  bag.objs.push(gp);
  return gp;
}

// onTick:门框缓慢旋转 + 全模式距离触发(ctx.onTick(fn) 是注册式,非数组)
ctx.onTick(function museumTick() {
  for (const p of portals) {
    if (!p.gp || !p.gp.visible) continue;
    p.gp.rotation.z += 0.01;
    // 通用走近触发:进入所在世界的门框 2.2m 内自动执行 action
    if (p.action && !tpLock && ctx.player.pl) {
      const pl = ctx.player.pl;
      if (Math.hypot(pl.p.x - p.gp.position.x, pl.p.z - p.gp.position.z) < 2.2) p.action();
    }
  }
  // 画廊内:入口门框固定位置触发(museum 之门不在 portals,单独判)
  if (current === 'gallery' && !tpLock && ctx.player.pl) {
    const pl = ctx.player.pl;
    if (Math.hypot(pl.p.x - 6, pl.p.z - 26) < 2.2) enterHall();
  }
});

// ---------- 世界切换 ----------
function teleportTo(x, z, yFace) {
  return new Promise((resolve) => {
    goldenTeleport(
      () => {
        const pl = ctx.player.pl;
        pl.p.set(x, (current === 'hall' ? HALL.FLOOR : 0) + 1.6, z);
        pl.y = yFace;
        pl.vy = 0;
        pl.onGround = true;
        ctx.scene.cam.position.copy(pl.p);
        ctx.scene.cam.rotation.y = pl.y;
        ctx.scene.cam.rotation.x = pl.pi;
      },
      () => resolve()
    );
  });
}

async function enterHall() {
  if (tpLock || current !== 'gallery') return;
  tpLock = true;
  try {
    const obj = await loadWorld(HALL.url, HALL.name);
    ensureLight();
    obj.visible = true;
    place(obj, HALL);
    swapBounds(buildBounds(HALL));
    prevOverride = ctx.kunlun.groundOverride; // 保存 eternal 的接管
    ctx.kunlun.groundOverride = museumGround; // 运行时接管(此时 eternal 已加载完)
    current = 'hall';
    await teleportTo(HALL.X + 2, HALL.Z + 4, Math.PI / 2);
    bigText('万镜博物馆');
    // 大堂内三扇房间门框(试点:陈列馆/晨光门厅;第三扇为预告位)
    makePortal(HALL.X - 6, HALL.Z - 7, HALL.FLOOR, '#7ec8ff', '图片陈列馆', () =>
      enterRoom('picture_gallery')
    );
    makePortal(HALL.X + 6, HALL.Z - 7, HALL.FLOOR, '#ffd27e', '晨光门厅', () =>
      enterRoom('upper_vestibule')
    );
    makePortal(HALL.X, HALL.Z - 9, HALL.FLOOR, '#c9a2ff', '更多房间 · 敬请期待', null);
  } catch (e) {
    console.warn('[museum] 大堂加载失败:', e && e.message);
  }
  tpLock = false;
}

async function enterRoom(id) {
  const cfg = ROOM_BY_ID[id];
  if (!cfg || tpLock || current !== 'hall') return;
  tpLock = true;
  try {
    const obj = await loadWorld(cfg.url, cfg.name);
    obj.visible = true;
    place(obj, cfg);
    swapBounds(buildBounds(cfg));
    ctx.kunlun.groundOverride = museumGround;
    current = 'room:' + id;
    // 离开大堂视觉(保留缓存,回大厅再显示)
    const hall = cache.get(HALL.url);
    if (hall) hall.visible = false;
    // 大堂门框也隐藏(与大厅同组隐藏,门框在 s 下需单独藏)
    for (const p of portals) p.gp.visible = p.world === 'room:' + id;
    await teleportTo(cfg.X, cfg.Z + 2, 0);
    bigText(cfg.name);
    // 房间尽头"返回大堂"门
    makePortal(cfg.X, cfg.Z - cfg.WALK.hz + 1.5, cfg.FLOOR, '#ff9a9e', '返回大堂', () =>
      exitToHall()
    );
  } catch (e) {
    console.warn('[museum] 房间加载失败:', e && e.message);
  }
  tpLock = false;
}

async function exitToHall() {
  if (tpLock || current === 'gallery') return;
  const room = cache.get(ROOM_BY_ID[current.slice(5)]?.url);
  if (room) room.visible = false;
  const hall = cache.get(HALL.url);
  if (hall) hall.visible = true;
  for (const p of portals) p.gp.visible = p.world === 'hall';
  swapBounds(buildBounds(HALL));
  ctx.kunlun.groundOverride = museumGround;
  current = 'hall';
  await teleportTo(HALL.X + 2, HALL.Z + 4, Math.PI / 2);
}

async function exitToGallery() {
  if (tpLock || current === 'gallery') return;
  const room = current.startsWith('room:') && cache.get(ROOM_BY_ID[current.slice(5)]?.url);
  if (room) room.visible = false;
  const hall = cache.get(HALL.url);
  if (hall) hall.visible = false;
  for (const p of portals) p.gp.visible = p.world === 'gallery';
  restoreGalleryBounds();
  ctx.kunlun.groundOverride = prevOverride; // 还给 eternal
  current = 'gallery';
  await teleportTo(6, 24.5, Math.PI);
}

// ---------- 画廊入口:博物馆之门 ----------
ensureLight();
makePortal(6, 26, 0, '#c9a2ff', '万镜博物馆 · 入口', null);

bag.custom.push(function () {
  for (const p of portals) s.remove(p.gp);
  for (const obj of cache.values()) s.remove(obj);
  if (museumLight) s.remove(museumLight);
  restoreGalleryBounds();
});

if (typeof window !== 'undefined')
  window.__museum = {
    get current() {
      return current;
    },
    cache,
    portals,
  };
hotEnd('museum');
if (import.meta.hot) import.meta.hot.accept();
