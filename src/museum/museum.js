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

// 2026-08-31 副作用标记(vite/rolldown tree-shake 会跳过没有调用到入口函数的模块):
// 立即调用 hotBegin 把 museum 模块注册到 hot 系统;hot 模块本身被 main.js 调用,
// 因此本模块有'被实际调用'的入口,rolldown 会把整模块打入 bundle 而不删除
const _mBag = hotBegin('museum');

// 2026-08-31 用户指正:模型立起来时才看到"向上的楼梯 + 二层走廊"(未旋转时楼梯变水平段,走不上去)。
// 必须用**未 quantize** 的 GLB(hall_v4o.glb 52MB):quantize 的坐标反变换会让旋转后世界盒对称异常。
// 立起后楼梯成为真正的向上斜面,玩家可沿楼梯走到二层走廊。
// 2026-08-31 反复旋转试错(rotation.set / lookAt 组合)都无法让用户满意,
// 先回退到 Z_UP=false(用户最早认可的"未旋转+雾化"视觉)以保证能立即上线;
// 二层走动改用传送门(上楼门/下楼门)实现,简单可靠
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
        // 2026-08-31 实测修正:Z-up 立起后"南北深度方向反了"——用户感觉建筑倒在地上
        // 解法:rotation.set(x, y, z) 一次性设;绕 X -π/2(让 Z 高度→Y 高度)+ 绕 Y π(让南北镜像翻转回来)
        if (Z_UP) obj.rotation.set(-Math.PI / 2, Math.PI, 0);
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

// ---------- 护栏(高度感知隐形墙,2026-09-01 楼梯掉落修复) ----------
// 楼梯两侧 + 二层回廊内外缘的防坠护栏。带 mnY/mxY 的墙只对"脚底高度落在区间内"
// 的玩家生效(collision-resolve.hitsAny):一楼玩家(20.8)可从回廊护栏(mnY=30.4)
// 下方自由通行;回廊上的人(30.45)则被挡住——一套墙体同时服务上下两层。
// 坐标为大堂本地偏移(相对 HALL.X/HALL.Z),与 museumGround 共用同一几何事实来源。
function railWall(list, lx1, lz1, lx2, lz2, mnY, mxY) {
  const x1 = HALL.X + lx1,
    z1 = HALL.Z + lz1,
    x2 = HALL.X + lx2,
    z2 = HALL.Z + lz2;
  const cx = (x1 + x2) / 2,
    cz = (z1 + z2) / 2;
  const dx = x2 - x1,
    dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const ang = Math.atan2(dx, dz);
  const sA = Math.abs(Math.sin(ang)),
    cA = Math.abs(Math.cos(ang));
  list.push({
    mnX: cx - ((sA * len) / 2 + cA * 0.25) - 0.1,
    mxX: cx + ((sA * len) / 2 + cA * 0.25) + 0.1,
    mnZ: cz - ((cA * len) / 2 + sA * 0.25) - 0.1,
    mxZ: cz + ((cA * len) / 2 + sA * 0.25) + 0.1,
    mnY,
    mxY,
  });
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
    const dx = x2 - x1,
      dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    // 2026-08-31 修复:之前硬编码 sA=0, cA=1,导致南/北墙(X 长 2*hx 的横条)被算成
    // 中央 0.6m × Z 120m 的竖条 → 直接挡在中央主楼梯(HX)前后,玩家走不到中央楼梯。
    // 改用 atan2(dx, dz) 算真实角度,sA/cA 反映墙的法线方向分量。
    const ang = Math.atan2(dx, dz);
    const sA = Math.abs(Math.sin(ang));
    const cA = Math.abs(Math.cos(ang));
    list.push({
      mnX: cx - ((sA * len) / 2 + cA * 0.2) - 0.1,
      mxX: cx + ((sA * len) / 2 + cA * 0.2) + 0.1,
      mnZ: cz - ((cA * len) / 2 + sA * 0.2) - 0.1,
      mxZ: cz + ((cA * len) / 2 + sA * 0.2) + 0.1,
    });
  }
  if (cfg.id === 'hall') {
    // 大堂外围墙降为"只挡一楼":二层回廊(30.45)从墙上自由越过,
    // 回廊周边由下方外缘护栏封闭,防止越墙后从楼顶坠落
    // 2026-09-01 下楼卡死修复:mxY 30.3→30.1。原 30.3 的墙线(本地 z=±17)正好压在
    // 双分楼梯顶端——玩家下行离开回廊带瞬间 footY 跌到 30.26(<30.3 墙激活),
    // 而身体圆(r=0.35)距墙盒仅 0.15m → 立刻被挡死。碰撞范围内的楼梯最低
    // footY=30.18,降到 30.1 后墙对楼梯上的人永久失效;1F 跳跃最高 22.5,防逃逸不受影响
    for (const w of list) {
      w.mnY = 0;
      w.mxY = 30.1;
    }
    const R1 = [20.5, 30.3]; // 楼梯护栏区间(保护楼梯表面;顶端 30.45 与回廊齐平处放行)
    const R2 = [30.4, 38]; // 回廊护栏区间(只挡二楼的人)
    // --- 楼梯防坠护栏(楼梯几何见 STAIR:平台 x∈[-51,-41],两翼 z 到 ±17,东翼 x 到 -27) ---
    railWall(list, -51.3, -17, -51.3, 17, ...R1); // 西缘(平台+南北两翼西边,视觉无栏杆的高危侧)
    railWall(list, -40.7, -17, -40.7, -5, ...R1); // 北翼东缘
    railWall(list, -40.7, 5, -40.7, 17, ...R1); // 南翼东缘
    railWall(list, -41, -5.3, -27, -5.3, ...R1); // 东翼南缘(降到 1F 的长楼梯两边)
    railWall(list, -41, 5.3, -27, 5.3, ...R1); // 东翼北缘
    // --- 回廊内缘护栏(北/南带在楼梯豁口 x∈[-51,-41] 断开,供楼梯到达回廊) ---
    railWall(list, -56.5, -16.3, -51.3, -16.3, ...R2); // 北带内缘·西段
    railWall(list, -40.7, -16.3, 43.5, -16.3, ...R2); // 北带内缘·东段
    railWall(list, 43.8, -16.3, 43.8, 16.3, ...R2); // 东带内缘
    railWall(list, 43.5, 16.3, -40.7, 16.3, ...R2); // 南带内缘·东段
    railWall(list, -51.3, 16.3, -56.5, 16.3, ...R2); // 南带内缘·西段
    // --- 回廊外缘护栏(U 形闭环,防从楼顶越出) ---
    railWall(list, -56.5, -19.2, 55.5, -19.2, ...R2); // 北带外缘
    railWall(list, 55.5, 19.2, -56.5, 19.2, ...R2); // 南带外缘
    railWall(list, 55.3, -19.2, 55.3, 19.2, ...R2); // 东带外缘
    railWall(list, -56.3, -19.2, -56.3, 19.2, ...R2); // 西端封口
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
//
// 2026-09-01 大修(楼梯掉落根因修复):旧高度场是"假坡道(x -179~-122 沿 Z 插值 20.8→33.6)
// + 假二层(33.6)"——射线实测证明假坡道下方视觉全是 1F 平地(玩家悬空/穿模),
// 假二层区域上方根本没有楼板(纯虚构),真实二层回廊高度是 30.45。
// 新高度场按 hintze-hall 真实几何重建(1m 网格射线实测):
//   1F 地板 20.8 | 西端双分大楼梯:中央平台 25.4,东翼沿 X 降回 1F,
//   南北两翼沿 Z 升至 30.45 | U 形二层回廊 30.45(北/南/东三条边带)
// 所有坐标用"大堂本地坐标"(相对 HALL.X/HALL.Z 的偏移),随配置移位自动跟随——单一事实来源。
const HALL_1F = 20.8; // 一楼脚底高度
const BALC_H = 30.45; // 二层回廊脚底高度(射线实测 30.44~30.45)

// 楼梯几何(本地坐标,X 相对 HALL.X,Z 相对 HALL.Z,高度为脚底值)
const STAIR = {
  land: { x0: -51, x1: -41, z0: -5, z1: 5, h: 25.4 }, // 中央平台
  east: { x1: -27, hEnd: 20.6 }, // 东翼:平台东缘(x=-41)→x=-27 降到 1F
  wing: { x0: -51, x1: -41, zNorth: -17, zSouth: 17, hTop: 30.45 }, // 南北两翼沿 Z 升至回廊
};

// U 形二层回廊可行走带(本地坐标,留 0.5m 安全边距防止踩出视觉楼板)
const BALC = {
  n: { z0: -19, z1: -16.5, x0: -56, x1: 54 }, // 北带(实心楼板 z=-208 一线)
  s: { z0: 16.5, z1: 19, x0: -56, x1: 54 }, // 南带(镜像)
  e: { x0: 44, x1: 55, z0: -19, z1: 19 }, // 东带(x∈[-96,-85] 连片回廊)
};

function museumGround(x, z) {
  const cfg = current === 'hall' ? HALL : ROOM_BY_ID[current.slice(5)];
  if (!cfg) return undefined;
  if (current !== 'hall') {
    // 房间:范围内返回房间地板;范围外 clamp(不返回 undefined,防掉出世界)
    const rx = Math.max(cfg.X - cfg.WALK.hx - 2, Math.min(x, cfg.X + cfg.WALK.hx + 2));
    const rz = Math.max(cfg.Z - cfg.WALK.hz - 2, Math.min(z, cfg.Z + cfg.WALK.hz + 2));
    return cfg.FLOOR;
  }
  // ===== 大堂:1F + 双分大楼梯 + U 形二层回廊 =====
  // 关键(2026-08-31 修复穿地):大堂内**任意位置**都必须返回有效地板高度。
  const lx = x - HALL.X; // 本地坐标
  const lz = z - HALL.Z;
  let h = HALL_1F;
  // 中央平台(25.4)
  const L = STAIR.land;
  if (lx >= L.x0 && lx <= L.x1 && lz >= L.z0 && lz <= L.z1) {
    h = Math.max(h, L.h);
  } else if (lx > L.x1 && lx <= STAIR.east.x1 && lz >= L.z0 && lz <= L.z1) {
    // 东翼楼梯:沿 X 从平台(25.4)线性降到 1F;x=-27 以东已是 1F
    const t = (lx - L.x1) / (STAIR.east.x1 - L.x1);
    h = Math.max(h, L.h + t * (STAIR.east.hEnd - L.h));
  }
  // 南北两翼:沿 Z 从平台(25.4)升到回廊(30.45);只覆盖楼梯宽度 x∈[x0,x1]
  const W = STAIR.wing;
  if (lx >= W.x0 && lx <= W.x1) {
    if (lz < L.z0 && lz >= W.zNorth) {
      const t = (L.z0 - lz) / (L.z0 - W.zNorth);
      h = Math.max(h, L.h + t * (W.hTop - L.h));
    } else if (lz > L.z1 && lz <= W.zSouth) {
      const t = (lz - L.z1) / (W.zSouth - L.z1);
      h = Math.max(h, L.h + t * (W.hTop - L.h));
    }
  }
  // U 形二层回廊(30.45):北带/南带/东带任一命中即站二楼
  const N = BALC.n,
    S = BALC.s,
    E = BALC.e;
  const onBalc =
    (lz >= N.z0 && lz <= N.z1 && lx >= N.x0 && lx <= N.x1) ||
    (lz >= S.z0 && lz <= S.z1 && lx >= S.x0 && lx <= S.x1) ||
    (lx >= E.x0 && lx <= E.x1 && lz >= E.z0 && lz <= E.z1);
  if (onBalc) h = Math.max(h, BALC_H);
  // 2026-09-01 防隔空吸附:玩家脚底远低于此处高架地板(>2m)时视为"从楼板下方通行",
  // 返回 1F 高度。否则 1F 玩家走进东回廊足迹边缘会被 stepVertical 的 landed 硬吸附
  // 瞬间拉上 9.65m(探针实测:1F 向东走到 x本=44 即被拽上二楼)
  if (h > HALL_1F + 0.1) {
    const pl = ctx.player.pl;
    const footY = pl ? pl.p.y - 1.6 : h;
    if (footY < h - 2) return HALL_1F;
  }
  return h;
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
        // 2026-08-31:眼高 = 脚底 + 1.6;大堂一楼脚底 20.8(实测 sol 顶面)
        const footY = current === 'hall' ? HALL_1F : 0;
        pl.p.set(x, footY + 1.6, z);
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
    // 2026-08-31:大堂 X 是长轴(±61.8m 宽 130m),Z 是深度(±27.4m);玩家默认传送站 Z 边缘(yaw 朝 -X),
    // 第一眼沿长轴看到远端拱廊/钢架天窗(用户认可的标志性视角)
    await teleportTo(HALL.X + 30, HALL.Z, -Math.PI / 2); // 东端朝西(-X)看穿大堂
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
