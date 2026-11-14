// eternal.js — 星星上的画廊(2026-11-14 重建:统一到《小王子》单一叙事)
//
// 【为什么重建】主人令「我们现在是小王子,故事要统一,情节结构不能分裂」。
// 本模块原先是昆仑/女娲线的「空中永恒展厅」:欢迎语讲西王母存放心象碎片、门贴「B612封印」、
// 未解锁提示说「万镜画廊」。玩家在小王子的沙漠里读补天叙事 —— 那就是分裂。
// 且它整个被 legacy.mjs 搁置(默认不加载),于是 story-progress 终章指路「去永恒展厅挂上你的画」
// 指向一个**根本不存在的去处**,罗盘「返回永恒展厅」按钮点了没反应。本轮把这两件事一起治:
//   ① 世界观全部改成小王子语汇(星星/画廊/旅人),不再有第二个神话;
//   ② 从搁置名单移出,默认加载 ⇒ 终章指路与罗盘入口真正可达。
//
// 【它在故事里的位置】六颗星走完(325 国王 → 330 地理学家,拾齐六枚星屑)后开启。
// 不是新的神话实体,而是「你走过的六颗星,把你送到了这里」——旅程的收束处,
// 玩家把自己一路上传/画下的东西挂在这颗星的墙上。存档键与接口一律不变(老玩家进度不丢)。
//
// ①晨光留影:画廊外的星门(六星屑集齐才可开)→ 传送至B612上空 400m 六边形浮空展厅
//   东墙三幅「你最早挂上的画」+ 体积光晨光;南侧平台金拱门返程
// ⚠️ 接口形状被测试逐字钉住(types-ctx-writer-agreement / ctx-writer-shapes):
//    eternalKeepOut 的 `function (x, z) { return inHall(x, z);` 两行、
//    eternalClick 里 `const h = …eternalHandlers[act];` + `if (h) h(cg);` 派发、
//    以及拆场时四个成员置 null —— 改这些要连钉子一起改,别顺手"优化"。
// 可见性铁律:/api/files 服务端已按设备过滤(演示照片全员/本人上传仅本人/图库仅特殊模式),
//   本模块直接消费其返回,客户端不做二次判断——图库永不泄密
// 手机灯光账户:不新增任何 PointLight——窗/光柱/光束/光池全部 MeshBasicMaterial,画框背光用 emissiveMap
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { eventBus } from '../event-bus.js';
import { hotBegin, hotEnd } from '../hot.js';
import { onMediaChanged } from '../media-push.js'; // 服务端主动推送:后台增删照片即刷新晨光(2026-08-29)
import {
  marbleTexture,
  floorInlayTexture,
  starDomeTexture,
  archWindowTexture,
  shaftTexture as palaceShaftTexture,
  disposePalaceArt,
} from './palace-art.js'; // 星光宫殿的程序化材质(2026-11-14)
import { softenPoints } from '../scene/desert/particle-sprite.js'; // 浮尘圆点(与沙漠粒子同一套)
const bag = hotBegin('eternal');
// 星屑收集数(spirits.js 经 ctx.kunlun.spiritsGot 暴露)
const { s, onTick, loadTexCapped, iG, bounds } = ctx;

// ===================== 位置与地基 =====================
// 展厅悬浮在B612正上方(800,600),地板步行面 y=400(相机远平面 2000,地面远眺在射程内;
// 雾密度 0.006 下实体天然隐形,集齐后点亮的六色光束(fog:false)就是"隐约浮现的光点")
// 2026-11-14 宫殿扩建:HR 7→16(跨度 32m)、墙高 3.5→9m、上加 11m 穹顶。
// 原先十来米见方、抬头一块平板的小房间无论怎么打光都不是宫殿;
// 宫殿感来自**尺度**(人在柱廊下显得小)+ **表面**(大理石金脉/星图穹顶/地面星罗盘)。
const HX = 800,
  HZ = 600,
  HR = 16,
  FLOOR = 400; // 厅心/半径/地板高
const WALL_H = 9; // 柱廊墙高
const DOME_R = 15.4; // 穹顶半径(略小于墙圈,坐在檐口内)
const DOME_H = 11; // 穹顶起拱高度
const inHall = (x, z) => (x - HX) * (x - HX) + (z - HZ) * (z - HZ) < 18.5 * 18.5; // 含南侧平台
// 物理接管(player.js groundY 每帧询问):厅内地面=展厅地板;走出平台边缘=回到沙漠引力(可滑翔落地)
ctx.kunlun.groundOverride = function (x, z) {
  return inHall(x, z) ? FLOOR : undefined;
};
// 小地图禁区(player.js 传送前询问):万镜画廊只能从金门进入
ctx.kunlun.eternalKeepOut = function (x, z) {
  return inHall(x, z);
};

// ===================== 建造辅助(与 scene.js w() 同款碰撞盒) =====================
const myBounds = [],
  myIG = [];
function addBox(x1, z1, x2, z2, y0, h, mat, th) {
  const dx = x2 - x1,
    dz = z2 - z1,
    len = Math.hypot(dx, dz);
  const cx = (x1 + x2) / 2,
    cz = (z1 + z2) / 2,
    ang = Math.atan2(dx, dz);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(th || 0.25, h, len), mat);
  wall.position.set(cx, y0 + h / 2, cz);
  wall.rotation.y = ang;
  s.add(wall);
  const sA = Math.abs(Math.sin(ang)),
    cA = Math.abs(Math.cos(ang)),
    t = (th || 0.25) / 2 + 0.1;
  const b = {
    mnX: cx - ((sA * len) / 2 + cA * t) - 0.1,
    mxX: cx + ((sA * len) / 2 + cA * t) + 0.1,
    mnZ: cz - ((cA * len) / 2 + sA * t) - 0.1,
    mxZ: cz + ((cA * len) / 2 + sA * t) + 0.1,
  };
  ctx.scene.addBounds && ctx.scene.addBounds([b]);
  myBounds.push(b);
  return wall;
}

// ===================== 展厅本体(六边形;边法线朝 0/60/…/300°,东墙=法线+x,门墙=300°) =====================
// 2026-11-14 宫殿:墙面从「灰泥暖石」换成**暖白大理石 + 金脉**(程序化,零外部资产)。
// 灰泥是住宅外墙的质感,宫殿要的是抛光石材 —— 低粗糙度 + 微金属度才有反光。
const marbleTex = marbleTexture();
const stoneM = new THREE.MeshStandardMaterial({
  color: '#f0e6d6',
  map: marbleTex || null,
  roughness: 0.42,
  metalness: 0.08,
});
// 柱身/檐口用同一张大理石但更亮,靠 metalness 拉出石材的润感
const columnM = new THREE.MeshStandardMaterial({
  color: '#f6eee0',
  map: marbleTex || null,
  roughness: 0.34,
  metalness: 0.1,
});
// 金饰(檐线/柱头/门框):高金属度 + 自发光,不新增灯光也有「贵气」
const goldM = new THREE.MeshStandardMaterial({
  color: '#d8ae52',
  roughness: 0.26,
  metalness: 0.9,
  emissive: '#7a5a18',
  emissiveIntensity: 0.22,
});
const VX = [],
  VZ = [];
for (let k = 0; k < 6; k++) {
  const a = ((30 + k * 60) * Math.PI) / 180;
  VX.push(HX + HR * Math.cos(a));
  VZ.push(HZ + HR * Math.sin(a));
}
// 六面墙(门墙 E5 留 3.2m 宽 × 4.6m 高的宫殿正门)
const GAP = 1.6; // 门洞半宽
const DOOR_H = 4.6; // 门洞高
for (let k = 0; k < 6; k++) {
  const x1 = VX[k],
    z1 = VZ[k],
    x2 = VX[(k + 1) % 6],
    z2 = VZ[(k + 1) % 6];
  if (k !== 5) {
    addBox(x1, z1, x2, z2, FLOOR, WALL_H, stoneM);
    continue;
  }
  // 门墙:沿墙方向截两段,中央留洞;洞上方补到墙顶
  const mx = (x1 + x2) / 2,
    mz = (z1 + z2) / 2,
    dl = Math.hypot(x2 - x1, z2 - z1),
    ux = (x2 - x1) / dl,
    uz = (z2 - z1) / dl;
  addBox(x1, z1, mx - ux * GAP, mz - uz * GAP, FLOOR, WALL_H, stoneM);
  addBox(mx + ux * GAP, mz + uz * GAP, x2, z2, FLOOR, WALL_H, stoneM);
  addBox(
    mx - ux * GAP,
    mz - uz * GAP,
    mx + ux * GAP,
    mz + uz * GAP,
    FLOOR + DOOR_H,
    WALL_H - DOOR_H,
    stoneM
  );
}

// ===================== 柱廊(12 根大理石柱 + 金柱头 + 檐口金线) =====================
// 宫殿感的第一来源是**尺度参照**:人站在 9m 高的柱子下才显得小。
// 柱位沿墙圈均匀布 12 根(每面墙 2 根),半径略内收,不挡墙上的画。
const COL_R = HR - 1.5;
const colShaftGeo = new THREE.CylinderGeometry(0.42, 0.5, WALL_H - 1.1, 16, 1);
const colBaseGeo = new THREE.CylinderGeometry(0.66, 0.74, 0.5, 16);
const colCapGeo = new THREE.CylinderGeometry(0.72, 0.46, 0.6, 16);
const colRingGeo = new THREE.TorusGeometry(0.5, 0.06, 8, 20);
for (let i = 0; i < 12; i++) {
  const a = ((15 + i * 30) * Math.PI) / 180;
  const cx = HX + COL_R * Math.cos(a),
    cz = HZ + COL_R * Math.sin(a);
  const g = new THREE.Group();
  g.position.set(cx, FLOOR, cz);
  const base = new THREE.Mesh(colBaseGeo, columnM);
  base.position.y = 0.25;
  g.add(base);
  const shaft = new THREE.Mesh(colShaftGeo, columnM);
  shaft.position.y = 0.5 + (WALL_H - 1.1) / 2;
  g.add(shaft);
  const cap = new THREE.Mesh(colCapGeo, goldM);
  cap.position.y = WALL_H - 0.3;
  g.add(cap);
  // 柱身两道金箍(上/下),给柱子节奏
  for (const ry of [1.4, WALL_H - 1.6]) {
    const ring = new THREE.Mesh(colRingGeo, goldM);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = ry;
    g.add(ring);
  }
  s.add(g);
  // 柱进碰撞:半径 0.75 的方盒(玩家不能穿柱)
  const b = { mnX: cx - 0.75, mxX: cx + 0.75, mnZ: cz - 0.75, mxZ: cz + 0.75 };
  ctx.scene.addBounds && ctx.scene.addBounds([b]);
  myBounds.push(b);
}
// 檐口:墙顶一圈金线 + 承托穹顶的石檐(六边形环)
{
  const corniceGeo = new THREE.CylinderGeometry(HR + 0.5, HR + 0.5, 0.55, 6, 1, true);
  const cornice = new THREE.Mesh(corniceGeo, columnM);
  cornice.position.set(HX, FLOOR + WALL_H + 0.27, HZ);
  cornice.rotation.y = Math.PI / 6;
  cornice.material.side = THREE.DoubleSide;
  s.add(cornice);
  const trimGeo = new THREE.TorusGeometry(HR + 0.35, 0.1, 6, 6);
  const trim = new THREE.Mesh(trimGeo, goldM);
  trim.rotation.x = Math.PI / 2;
  trim.rotation.z = Math.PI / 6;
  trim.position.set(HX, FLOOR + WALL_H + 0.58, HZ);
  s.add(trim);
}
// 地板/吊顶/倒锥底座
// 地面:抛光大理石 + 中央星罗盘嵌花(宫殿的身份标记)
const inlayTex = floorInlayTexture();
const floorM = new THREE.Mesh(
  new THREE.CylinderGeometry(HR, HR, 0.3, 6),
  new THREE.MeshStandardMaterial({ color: '#e6d8c0', roughness: 0.3, metalness: 0.12 })
);
floorM.position.set(HX, FLOOR - 0.15, HZ);
s.add(floorM);
// 嵌花圆盘略高于地面(1cm)避免 z-fighting;半径取墙圈的一半多,居中成阵
{
  const inlay = new THREE.Mesh(
    new THREE.CircleGeometry(HR * 0.62, 64),
    new THREE.MeshStandardMaterial({
      map: inlayTex || null,
      color: '#ffffff',
      roughness: 0.22,
      metalness: 0.16,
    })
  );
  inlay.rotation.x = -Math.PI / 2;
  inlay.position.set(HX, FLOOR + 0.012, HZ);
  s.add(inlay);
  // 嵌花外缘金环
  const ring = new THREE.Mesh(new THREE.TorusGeometry(HR * 0.62, 0.07, 8, 72), goldM);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(HX, FLOOR + 0.02, HZ);
  s.add(ring);
}
// ===================== 星图穹顶(2026-11-14 宫殿) =====================
// 从「一块平板贴星图」换成**真半球穹顶**:11m 起拱、坐在 9m 高的檐口上,
// 内表面贴程序化星图(银河带 + 三层星点 + 六颗主星连线 + 金色刻度环)。
// 用 BackSide 从内侧看,不写深度以外的花招;fog:false 免得暖沙雾把星夜洗淡。
const domeTex = starDomeTexture();
const ceilM = new THREE.Mesh(
  new THREE.SphereGeometry(DOME_R, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
  new THREE.MeshBasicMaterial({
    map: domeTex || null,
    color: domeTex ? '#ffffff' : '#141c38',
    side: THREE.BackSide,
    fog: false,
  })
);
ceilM.scale.y = DOME_H / DOME_R; // 压成扁穹顶(比正半球更有殿堂感)
ceilM.position.set(HX, FLOOR + WALL_H + 0.5, HZ);
s.add(ceilM);
// 穹顶中心悬一颗「本星」:自发光小球 + 光晕,是整座宫殿的光源意象(不新增灯)
const heartStar = new THREE.Mesh(
  new THREE.SphereGeometry(0.55, 24, 16),
  new THREE.MeshBasicMaterial({ color: '#fff3cf', fog: false, toneMapped: false })
);
heartStar.position.set(HX, FLOOR + WALL_H + DOME_H * 0.62, HZ);
s.add(heartStar);
// 穹顶肋:12 道金肋从檐口收向顶心,给穹顶结构感(细圆环切片)
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2;
  const ribCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(
      HX + Math.cos(a) * DOME_R * 0.99,
      FLOOR + WALL_H + 0.55,
      HZ + Math.sin(a) * DOME_R * 0.99
    ),
    new THREE.Vector3(
      HX + Math.cos(a) * DOME_R * 0.55,
      FLOOR + WALL_H + DOME_H * 0.86,
      HZ + Math.sin(a) * DOME_R * 0.55
    ),
    new THREE.Vector3(HX, FLOOR + WALL_H + DOME_H * 0.99, HZ)
  );
  const rib = new THREE.Mesh(new THREE.TubeGeometry(ribCurve, 20, 0.075, 6, false), goldM);
  s.add(rib);
}
// 浮空基座:倒锥 + 岩层环,让宫殿「站在一颗星的碎岩上」
const baseM = new THREE.Mesh(
  new THREE.CylinderGeometry(1.2, HR, 9, 6),
  new THREE.MeshStandardMaterial({ color: '#7a6349', roughness: 0.92 })
);
baseM.rotation.y = Math.PI / 6;
baseM.position.set(HX, FLOOR - 4.8, HZ);
s.add(baseM);
{
  const rim = new THREE.Mesh(new THREE.TorusGeometry(HR + 0.2, 0.22, 8, 6), goldM);
  rim.rotation.x = Math.PI / 2;
  rim.rotation.z = Math.PI / 6;
  rim.position.set(HX, FLOOR - 0.35, HZ);
  s.add(rim);
}

// ===================== 六色光束 + 光晕(集齐才点亮;fog:false,地面可见"隐约浮现") =====================
const SPIRIT_COLORS = ['#7ddb7a', '#ff5a4a', '#e8a03c', '#dfeaf5', '#7cc8e8', '#f0a860'];
const beamsG = new THREE.Group();
for (let k = 0; k < 6; k++) {
  const a = ((30 + k * 60) * Math.PI) / 180;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.55, 118, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color: SPIRIT_COLORS[k],
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    })
  );
  beam.position.set(HX + HR * 0.78 * Math.cos(a), FLOOR - 61, HZ + HR * 0.78 * Math.sin(a));
  beamsG.add(beam);
}
beamsG.visible = false;
s.add(beamsG);
const halo = (function () {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,220,150,0.85)');
  g.addColorStop(0.4, 'rgba(255,200,120,0.3)');
  g.addColorStop(1, 'rgba(255,200,120,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: t,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
  );
  sp.scale.set(58, 58, 1); // 随宫殿跨度放大(原 26 对应 HR=7)
  sp.position.set(HX, FLOOR + 2, HZ);
  sp.visible = false;
  s.add(sp);
  return sp;
})();

// ===================== 南侧平台 + 护栏 + 返程金拱门 =====================
// 平台段在 APOTHEM 定义之前,这里先算一份边心距(同式,单一口径 HR*cos30)
const APOTHEM_DECK = HR * Math.cos(Math.PI / 6);
// 门墙法线朝 300°:外向 O=(0.5,-0.866),沿墙 D=(0.866,0.5)
const OX = 0.5,
  OZ = -0.866,
  DX = 0.866,
  DZ = 0.5;
const DECK_OFF = APOTHEM_DECK + 3.0; // 平台中心离厅心:墙外再挑 3m
const deckC = { x: HX + DECK_OFF * OX, z: HZ + DECK_OFF * OZ };
const deck = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.3, 6.0), stoneM);
deck.position.set(deckC.x, FLOOR - 0.15, deckC.z);
deck.rotation.y = Math.atan2(DX, DZ);
s.add(deck);
// 三边护栏(高1m,进碰撞;靠厅一侧敞开)
addBox(
  deckC.x + DX * 3.5 + OX * 3.0,
  deckC.z + DZ * 3.5 + OZ * 3.0,
  deckC.x - DX * 3.5 + OX * 3.0,
  deckC.z - DZ * 3.5 + OZ * 3.0,
  FLOOR,
  1.0,
  stoneM,
  0.14
);
addBox(
  deckC.x + DX * 3.5 - OX * 2.9,
  deckC.z + DZ * 3.5 - OZ * 2.9,
  deckC.x + DX * 3.5 + OX * 3.0,
  deckC.z + DZ * 3.5 + OZ * 3.0,
  FLOOR,
  1.0,
  stoneM,
  0.14
);
addBox(
  deckC.x - DX * 3.5 - OX * 2.9,
  deckC.z - DZ * 3.5 - OZ * 2.9,
  deckC.x - DX * 3.5 + OX * 3.0,
  deckC.z - DZ * 3.5 + OZ * 3.0,
  FLOOR,
  1.0,
  stoneM,
  0.14
);
// 金拱门(平台外缘,点击返程)
const goldTrim = new THREE.MeshStandardMaterial({
  color: '#caa040',
  metalness: 0.85,
  roughness: 0.28,
  emissive: '#7a5a18',
  emissiveIntensity: 0.4,
});
const portalG = new THREE.Group();
portalG.position.set(deckC.x + OX * 2.4, FLOOR, deckC.z + OZ * 2.4);
portalG.rotation.y = Math.atan2(-OX, -OZ); // 面朝厅内
for (const p of [-1, 1]) {
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.26, 4.2, 0.26), goldTrim);
  pillar.position.set(p * 1.5, 2.1, 0);
  portalG.add(pillar);
}
const plintel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 0.3), goldTrim);
plintel.position.set(0, 4.3, 0);
portalG.add(plintel);
const ppane = new THREE.Mesh(
  new THREE.PlaneGeometry(2.7, 4.0),
  new THREE.MeshBasicMaterial({
    color: '#ffd98a',
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  })
);
ppane.position.set(0, 2.1, 0);
portalG.add(ppane);
portalG.userData = { eternalAction: 'portal' };
s.add(portalG);
iG.push(portalG);
myIG.push(portalG);

// ===================== 晨光:东墙三扇拱窗 + 斜射体积光柱 + 地面光池 + 浮尘(全 Basic,零灯光) =====================
// 东墙内壁 x = HX + HR*cos(30°) - 壁厚/2(六边形边心距 = HR*cos30)。
// ⚠️ 全部按 HR/WALL_H 推导,不再写死 805.91/804/802.2 —— 宫殿扩建后写死值会飘到墙外。
const APOTHEM = HR * Math.cos(Math.PI / 6); // 边心距
const EX = HX + APOTHEM - 0.16; // 东墙内壁
const WIN_Y = FLOOR + WALL_H * 0.62; // 窗心高(宫殿高窗)
const WIN_W = 2.4,
  WIN_H = 3.6; // 拱窗尺寸
const FRAME_SPAN = 5.2; // 三扇窗/三幅画的横向间距
const shaftTex = palaceShaftTexture(),
  shaftMats = [];
const winTex = archWindowTexture();
for (const wz of [HZ - FRAME_SPAN, HZ, HZ + FRAME_SPAN]) {
  // 金窗框
  const wframe = new THREE.Mesh(
    new THREE.PlaneGeometry(WIN_W + 0.3, WIN_H + 0.3),
    new THREE.MeshBasicMaterial({ color: '#d8ae52', toneMapped: false, fog: false })
  );
  wframe.rotation.y = -Math.PI / 2;
  wframe.position.set(EX - 0.02, WIN_Y, wz);
  s.add(wframe);
  // 窗面:暖金渐变 + 棂条(程序化贴图)
  const wpane = new THREE.Mesh(
    new THREE.PlaneGeometry(WIN_W, WIN_H),
    new THREE.MeshBasicMaterial({
      map: winTex || null,
      color: winTex ? '#ffffff' : '#ffe0ae',
      toneMapped: false,
      fog: false,
    })
  );
  wpane.rotation.y = -Math.PI / 2;
  wpane.position.set(EX - 0.05, WIN_Y, wz);
  s.add(wpane);
  // 拱顶:半圆金拱(窗上方的弧线),给「宫殿高窗」的读感
  const arch = new THREE.Mesh(new THREE.TorusGeometry(WIN_W / 2, 0.11, 8, 24, Math.PI), goldM);
  arch.rotation.y = -Math.PI / 2;
  arch.position.set(EX - 0.08, WIN_Y + WIN_H / 2, wz);
  s.add(arch);
  // 体积光柱:窗口 → 斜落到地面,双片交叉,加色渐隐
  const poolX = EX - 6.5;
  const smat = new THREE.MeshBasicMaterial({
    map: shaftTex,
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
  shaftMats.push(smat);
  const grp = new THREE.Group();
  const shaftLen = Math.hypot(WIN_Y - FLOOR, EX - poolX) * 1.05;
  grp.position.set((EX + poolX) / 2, (WIN_Y + FLOOR) / 2, wz);
  grp.rotation.z = -Math.atan2(EX - poolX, WIN_Y - FLOOR);
  const pA = new THREE.Mesh(new THREE.PlaneGeometry(WIN_W * 1.15, shaftLen), smat);
  grp.add(pA);
  const pB = new THREE.Mesh(new THREE.PlaneGeometry(WIN_W * 1.15, shaftLen), smat);
  pB.rotation.y = Math.PI / 2;
  grp.add(pB);
  s.add(grp);
  // 地面光池:椭圆(斜射拉长的光斑)
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(1.9, 32),
    new THREE.MeshBasicMaterial({
      color: '#ffd9a0',
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    })
  );
  pool.rotation.x = -Math.PI / 2;
  pool.scale.set(1, 1.7, 1);
  pool.position.set(poolX, FLOOR + 0.03, wz);
  s.add(pool);
}
// 浮尘(45 粒,缓慢飘落+轻摆)
const DUST_N = 160,
  dustPos = new Float32Array(DUST_N * 3);
for (let i = 0; i < DUST_N; i++) {
  dustPos[i * 3] = HX - HR * 0.8 + Math.random() * HR * 1.6;
  dustPos[i * 3 + 1] = FLOOR + 0.4 + Math.random() * (WALL_H + DOME_H * 0.5);
  dustPos[i * 3 + 2] = HZ - HR * 0.8 + Math.random() * HR * 1.6;
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
// 2026-11-14:浮尘必须用柔和圆点贴图 —— 默认 PointsMaterial 无 map 时画**实心方块**,
// 殿内近看是方屑、沙漠远眺被放大成满屏白方块(实机截图抓获)。与沙漠粒子同一套 softenPoints。
const dust = new THREE.Points(
  dustGeo,
  softenPoints(
    new THREE.PointsMaterial({
      color: '#ffdf9a',
      size: 0.07,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  )
);
s.add(dust);

// ===================== 牌匾「晨光留影」 =====================
{
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#2e1c10';
  x.fillRect(0, 0, 512, 128);
  x.strokeStyle = '#caa040';
  x.lineWidth = 6;
  x.strokeRect(8, 8, 496, 112);
  x.fillStyle = '#ffd98a';
  x.font = 'bold 64px serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.shadowColor = '#ffbf5a';
  x.shadowBlur = 18;
  x.fillText('晨 光 留 影', 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 1.3),
    new THREE.MeshBasicMaterial({ map: t, toneMapped: false })
  );
  plaque.rotation.y = -Math.PI / 2;
  plaque.position.set(EX - 0.07, FLOOR + WALL_H * 0.9, HZ);
  s.add(plaque);
}

// ===================== 三幅「最早挂上的画」(服务端过滤后的可见池,按 mtime 取最早三张) =====================
function captionFor(name) {
  if ((ctx.mode.demoPhotos || []).includes(name)) return '晨光留影 · 画廊最早亮起的三束光之一';
  return (ctx.mode.myCaptions && ctx.mode.myCaptions[name]) || '你最早挂上的画之一';
}
let captionsFixed = false;
// 通用画框构建(晨光留影 + C2 展厅选片导入 复用);位置/朝向/文案可配
// isPainting 全字段:直接复用 paintings.js 的 3D 原位放大;不进 paintGroups(模式系统无权管这里)
// mtime 供 letgo.js 空画框题「此处曾有过——日期」
function buildFrame(x, z, rotY, nx, nz, url, name, mtime, caption) {
  const g = new THREE.Group();
  g.position.set(x, FLOOR + 3.0, z);
  g.rotation.y = rotY;
  g.userData = {
    isPainting: true,
    ox: x,
    oy: FLOOR + 3.0,
    oz: z,
    nx: nx,
    nz: nz,
    ry: rotY,
    zoomed: false,
    aiDesc: caption,
    src: url,
    eternalName: name,
    mtime: mtime || null,
  };
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 2.6, 0.12),
    new THREE.MeshStandardMaterial({ color: '#b89040', metalness: 0.75, roughness: 0.3 })
  );
  g.add(frame);
  // 距离懒加载:远在 400m 高空,传送抵达后才拉纹理(quiz/模式门禁由 loadTexCapped 自带)
  const tex = loadTexCapped(url, undefined, { x: HX, z: HZ });
  const pm = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.45,
    emissive: '#ffffff',
    emissiveMap: tex,
    emissiveIntensity: 0.16,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.86, 2.36), pm);
  plane.position.z = 0.075;
  g.add(plane);
  s.add(g);
  iG.push(g);
  myIG.push(g);
  return g;
}
// 东墙·晨光留影(服务端过滤后的可见池,按 mtime 取最早三张)
function addFrame(z, url, name, mtime) {
  buildFrame(EX - 0.1, z, -Math.PI / 2, -1, 0, url, name, mtime, '晨光留影');
}
const FRAME_Z = [HZ - FRAME_SPAN, HZ, HZ + FRAME_SPAN],
  DEMO_FILL = ['201.jpg', '202.jpg', '203.jpg', '204.jpg', '205.png'];
// 晨光留影同步(2026-08-29):后台增删照片后,游戏内最早三幅实时跟随,不中断链条
let mornFrames = [],
  mornPicks = '';
function disposeMorn() {
  for (const g of mornFrames) {
    g.traverse(function (obj) {
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m.map) {
            m.map.dispose();
            m.map = null;
          }
          m.dispose();
        }
      }
      if (obj.geometry) obj.geometry.dispose();
    });
    s.remove(g);
    const ii = iG.indexOf(g);
    if (ii >= 0) iG.splice(ii, 1);
    const mi = myIG.indexOf(g);
    if (mi >= 0) myIG.splice(mi, 1);
  }
  mornFrames = [];
}
function refreshMorning() {
  fetch('/api/files?dir=photos', { cache: 'no-store' })
    .then((r) => r.json())
    .then((d) => {
      const pool = (d.photos || []).filter((f) => !/^whiteboard-/i.test(f.name)); // 白板作品有专属墙,不进晨光
      pool.sort((a, b) => (a.mtime < b.mtime ? -1 : a.mtime > b.mtime ? 1 : 0)); // 最早的在前
      const picks = pool.slice(0, 3).map((f) => ({ name: f.name, mtime: f.mtime }));
      for (const dm of DEMO_FILL) {
        if (picks.length >= 3) break;
        if (!picks.some((p) => p.name === dm)) picks.push({ name: dm, mtime: null });
      } // 不够三张,演示照片补足
      const key = picks
        .slice(0, 3)
        .map((p) => p.name)
        .join('|');
      if (key === mornPicks) return; // 集合没变,不重建(避免纹理反复重载)
      mornPicks = key;
      disposeMorn();
      picks
        .slice(0, 3)
        .forEach((p, i) =>
          mornFrames.push(
            buildFrame(
              EX - 0.1,
              FRAME_Z[i],
              -Math.PI / 2,
              -1,
              0,
              'photos/' + encodeURIComponent(p.name),
              p.name,
              p.mtime,
              '晨光留影'
            )
          )
        );
    })
    .catch(() => {
      const key = DEMO_FILL.slice(0, 3).join('|');
      if (key === mornPicks) return;
      mornPicks = key;
      disposeMorn();
      DEMO_FILL.slice(0, 3).forEach((n, i) =>
        mornFrames.push(
          buildFrame(EX - 0.1, FRAME_Z[i], -Math.PI / 2, -1, 0, 'photos/' + n, n, null, '晨光留影')
        )
      );
    });
}
refreshMorning();
// 每 45s 同步一次晨光(与新媒体墙同步周期一致;仅集合变化才重建)
setInterval(refreshMorning, 45000);
// 服务端主动推送:后台增删照片 → 立即刷新晨光三帧(不等轮询)
// 接住退订函数:拆场时要摘掉,否则热重载后旧回调仍在刷新一批已销毁的画框
const offMediaChanged = onMediaChanged(function (d) {
  if (!d || d.dir === 'photos') refreshMorning();
});

// ===================== C2 展厅选片导入(2026-07-30) =====================
// 本人从「我的上传」中挑选的作品,呈现在永恒展厅西墙(私人收藏墙);
// 可见性由 /api/myuploads 服务端按设备过滤保证(与 mediarules.isMine 同口径:仅本人上传可见),
// 客户端只呈现「已选 ∩ 本人拥有」之名,删除的作品自动跳过。西墙网格容量 5列×3行=15 幅。
const WX = HX - APOTHEM + 0.16; // 西墙内壁 x(按边心距推导)
const IMP_CAP = 15;
function buildImportFrames() {
  const picks = ctx.store.json('eternalPicks', []) || [];
  if (!Array.isArray(picks) || !picks.length) return;
  fetch('/api/myuploads')
    .then((r) => r.json())
    .then((d) => {
      const mine = new Set(d.names || []);
      let i = 0;
      for (const name of picks) {
        if (!mine.has(name)) continue; // 已删除/非本人,跳过(不占名额)
        if (i >= IMP_CAP) break;
        const col = i % 5,
          row = Math.floor(i / 5);
        const z = HZ + (-6.0 + col * 3.0);
        const y = FLOOR + (1.6 + row * 2.9); // 3 行,画框高 2.6,顶不超 WALL_H
        buildFrame(
          WX + 0.1,
          z,
          Math.PI / 2,
          1,
          0,
          'photos/' + encodeURIComponent(name),
          name,
          null,
          '你挂在这颗星上的画'
        );
        i++;
      }
      if (picks.length > IMP_CAP)
        ctx.ui.modeToast && ctx.ui.modeToast('西墙最多挂 ' + IMP_CAP + ' 幅，其余已为你留作候选。');
    })
    .catch((e) => {
      // 西墙选片拉取失败:无兜底回退,补 warn 留痕便于排障(2026-11-11 空 catch 复核:可疑级)
      console.warn('[eternal] 西墙选片(/api/myuploads)拉取失败', e);
    });
}
buildImportFrames();
ctx.kunlun.rebuildEternalPicks = buildImportFrames; // C2:选片保存后由设置页调用,刷新西墙

// ===================== 星门(地面·画廊外沙地;六星屑集齐才开) =====================
// ⚠️ 位置有硬约束:paintings.js:527 的答题守卫会把 x∈(-19,19) 且 z∈(-13,29) 内的
// 一切点击丢弃(quizPassed 之前)。原先门在 (15,-12) **正落在矩形里** ⇒ 新玩家点它
// 毫无反应,只能靠罗盘绕路。现移到建筑 footprint 之外的沙地 (0,34):
// z=34>29 出矩形,且距出生点(-3.5,70.5)约 36m,首屏朝北(166°)就能看见这道门。
const DOOR_X = 0,
  DOOR_Z = 34;
const doorG = new THREE.Group();
doorG.position.set(DOOR_X, 0, DOOR_Z);
for (const p of [-1, 1]) {
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.0, 0.5), goldTrim);
  pillar.position.set(p * 0.99, 1.5, 0);
  doorG.add(pillar);
}
const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.22, 0.5), goldTrim);
lintel.position.set(0, 3.05, 0);
doorG.add(lintel);
const doorMat = new THREE.MeshStandardMaterial({
  color: '#b88a30',
  metalness: 0.8,
  roughness: 0.32,
  emissive: '#8a6420',
  emissiveIntensity: 0.12,
});
for (const side of [-1, 1])
  for (const p of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.88, 2.8, 0.08), doorMat);
    panel.position.set(p * 0.45, 1.4, side * 0.2);
    doorG.add(panel);
  }
doorG.userData = { eternalAction: 'door' };
s.add(doorG);
iG.push(doorG);
myIG.push(doorG);
// 未开启时的封条(贴在南面)。文案改小王子语汇:不是"封印",而是"还没走完六颗星"。
const seal = (function () {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#2a3a5a'; // 夜蓝(原朱红封印属旧神话配色)
  x.fillRect(0, 0, 128, 512);
  x.strokeStyle = '#ffd98a';
  x.lineWidth = 6;
  x.strokeRect(8, 8, 112, 496);
  x.fillStyle = '#ffd98a';
  x.font = 'bold 56px serif';
  x.textAlign = 'center';
  '六星未齐'.split('').forEach((ch, i) => x.fillText(ch, 64, 100 + i * 105));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 1.8),
    new THREE.MeshBasicMaterial({ map: t, toneMapped: false })
  );
  m.position.set(0, 1.5, 0.26);
  doorG.add(m);
  return m;
})();
// 解锁后的门周金光点
const GLOW_N = 16,
  glowPos = new Float32Array(GLOW_N * 3);
for (let i = 0; i < GLOW_N; i++) {
  // 跟着门走:原先写死 14.1/-12.3(旧门位),门一挪光点就飘在空地上
  glowPos[i * 3] = DOOR_X - 0.9 + Math.random() * 1.8;
  glowPos[i * 3 + 1] = 0.2 + Math.random() * 2.9;
  glowPos[i * 3 + 2] = DOOR_Z - 0.3 + Math.random() * 0.6;
}
const glowGeo = new THREE.BufferGeometry();
glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
const doorGlow = new THREE.Points(
  glowGeo,
  new THREE.PointsMaterial({
    color: '#ffd76a',
    size: 0.06,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
);
doorGlow.visible = false;
s.add(doorGlow);

// ===================== 反馈:水晶叮 + 金渐隐转场 + 中央大字 =====================
// 叮声实现统一在 shared/audio-blip.js(B1 整改)。
const chime = () => blipChime(1047, { peak: 0.18, decay: 1.2, delay2: 0.1 });

// ===================== 金门/拱门点击 → 传送(paintings.js 经 eternalAction 钩子调来) =====================
// 首到欢迎(ark.js 飞舟停靠后也要调用;localStorage 幂等,只迎一次)
function welcome() {
  if (ctx.store.flag('eternalWelcomed')) return;
  ctx.store.mark('eternalWelcomed');
  bigText('星星上的画廊。你终于到了。', { hold: 2600 });
  ctx.ui.kunlunSpeak &&
    ctx.ui.kunlunSpeak(
      '你终于到了。这颗星很小，只放得下一间画廊——可它一直在等你。你走过国王、爱虚荣的人、酒鬼、商人、点灯人和地理学家，六颗星的光把你送到了这里。现在，把你一路画下的、留下的，挂到墙上去吧。真正重要的东西，眼睛是看不见的；可你挂在这里的每一幅，都是你用心看过的。',
      'hall'
    ); // B6 展厅音色
}
import { goldenTeleport } from '../shared/teleport-fx.js';
import { bigText } from '../ui/kit.js';
import { chime as blipChime } from '../shared/audio-blip.js';
let tpLock = false;
function teleport(intoHall) {
  if (tpLock || !ctx.player.pl) return;
  // 进厅守卫:罗盘「星星上的画廊」与 kunlun:teleport 事件都走这里,
  // 原先只有**点门**那条路查六星,事件这条路能绕过门禁直接进厅。统一到一处判。
  if (intoHall && !(ctx.kunlun.isDone && ctx.kunlun.isDone())) {
    const n = ctx.kunlun.spiritsGot ? ctx.kunlun.spiritsGot() : 0;
    ctx.ui.modeToast && ctx.ui.modeToast('六颗星还没走完（' + n + '/6）——先把六颗星的光都带回来。');
    return;
  }
  tpLock = true;
  chime();
  goldenTeleport(
    () => {
      const pl = ctx.player.pl;
      if (intoHall) {
        // 2026-11-14:落点移到厅心偏西,朝向 **+x(东墙那三幅画)**。
        // 原先落 (802.6,594.5)、yaw 3.68 —— 那是**朝着刚进来的门墙**,
        // 实机截图里玩家一睁眼面对两米外的空白墙角,什么也看不见。
        // yaw=-π/2 ⇒ forward=(-sin,0,-cos)=(+1,0,0),正对东墙晨光留影。
        pl.p.set(HX - APOTHEM * 0.55, FLOOR + 1.6, HZ);
        pl.y = -Math.PI / 2;
        pl.pi = 0.06; // 近乎平视:画心在 FLOOR+1.8,眼高 FLOOR+1.6
      } else {
        // 返程落在星门**南侧**(门外),朝北正对门;原先落 (15,-10.6) 是旧门位。
        // 高度按真实地形取,不写死 1.55 —— 沙面起伏处写死会让玩家悬空或陷沙。
        const rz = DOOR_Z + 2.2;
        const g = ctx.media.desert && ctx.media.desert.getH ? ctx.media.desert.getH(DOOR_X, rz) : 0;
        pl.p.set(DOOR_X, g + 1.6, rz); // 1.6 = EYE_HEIGHT(player.js 同口径)
        pl.y = 0; // heading 0 = 朝 -Z(北),正对星门
        pl.pi = 0.12;
      }
      pl.vy = 0;
      pl.onGround = true;
      ctx.scene.cam.position.copy(pl.p);
      ctx.scene.cam.rotation.y = pl.y;
      ctx.scene.cam.rotation.x = pl.pi;
    },
    () => {
      tpLock = false;
      if (intoHall) welcome();
    }
  );
}
ctx.kunlun.eternalTeleport = teleport; // 罗盘「返回永恒展厅」/ark.js 复用
// gate 层经意图事件解耦传送(2026-08-30 架构复查②:消除 gate→kunlun 反向渗透)
const offTeleportEvt = eventBus.on('kunlun:teleport', ({ kind }) => {
  if (kind === 'eternal') teleport(true);
});
ctx.kunlun.eternalWelcome = welcome; // 飞舟停靠后的首到欢迎(幂等)
ctx.kunlun.eternalClick = function (cg) {
  const act = cg.userData.eternalAction;
  if (act === 'portal') {
    teleport(false);
    return;
  }
  if (act === 'door') {
    if (!(ctx.kunlun.isDone && ctx.kunlun.isDone())) {
      const n = ctx.kunlun.spiritsGot ? ctx.kunlun.spiritsGot() : 0;
      ctx.ui.modeToast &&
        ctx.ui.modeToast(
          '六颗星还没走完（' + n + '/6）——星星上的画廊，要等你把六颗星的光都带回来。'
        );
      return;
    }
    teleport(true);
    return;
  }
  // 厅内交互(风铃/壁炉/……):各模块经 ctx.kunlun.eternalHandlers[action] 自注册
  const h = ctx.kunlun.eternalHandlers && ctx.kunlun.eternalHandlers[act];
  if (h) h(cg);
};

// ===================== 主循环:解锁守望 + 门/光柱呼吸 + 浮尘 + 光束缓旋 =====================
let unlocked = false,
  firstCheck = true;
function setUnlocked(announce) {
  unlocked = true;
  seal.visible = false;
  doorGlow.visible = true;
  beamsG.visible = true;
  // 光晕只给地面远眺看;人在厅内时由主循环按 inHall 关掉(否则整屏被暖光糊满)
  const plU = ctx.player.pl;
  halo.visible = !(plU && inHall(plU.p.x, plU.p.z));
  if (announce)
    ctx.ui.modeToast &&
      ctx.ui.modeToast('六颗星的光齐了。沙地上那道星门开了——星星上的画廊在等你。');
}
// ===================== 厅内氛围(2026-11-14) =====================
// 「整厅米色」的真凶已用逐层排除实验判定:**halo 那个 26×26 加色光晕**
// (给地面远眺标记展厅位置用,不写深度 ⇒ 永远盖在不透明几何之上;进厅后相机距它 1.6m,
//  整屏被暖光糊满)。隐藏它后夜蓝星图立刻显现 —— 见主循环里的 halo.visible。
//
// 所以这里**只做两件小事**,不动灯光/天穹(那些是排查途中基于误判的改动,已收回):
//   ① 背景换星夜蓝:展厅在 400m 高空,窗外不该是沙漠暖色;
//   ② 曝光略降 + 辉光收敛:星夜画廊的调性,画作不被 Bloom 冲淡。
// ⚠️ 昼夜层每帧写曝光/辉光 ⇒ 厅内要持续压住;背景没人管,离厅时自己还原。
let hallMoodOn = false;
let savedBg = null;
const HALL_MOOD = { bloomStrength: 0.16, bloomThreshold: 0.88, exposure: 0.92 };
function applyHallMood(inHallNow) {
  if (inHallNow === hallMoodOn) return;
  hallMoodOn = inHallNow;
  const sc = ctx.scene.s;
  if (inHallNow) {
    savedBg = sc ? sc.background : null;
    if (sc) sc.background = new THREE.Color(0x0a0f1e);
    ctx.scene.setAtmosphere && ctx.scene.setAtmosphere(HALL_MOOD);
  } else {
    if (sc) sc.background = savedBg;
    savedBg = null;
    // 曝光/辉光交回昼夜层(它每帧都写,下一帧自然覆盖)
  }
}

onTick(function () {
  const t = performance.now() * 0.001;
  if (!unlocked && ctx.kunlun.isDone && ctx.kunlun.isDone()) setUnlocked(!firstCheck); // 载入时已齐:静默开门;本 session 集齐:通报
  firstCheck = false;
  // 厅内光照接管(每帧判,状态切换才写)
  const pl0 = ctx.player.pl;
  const inHallNow = !!(pl0 && inHall(pl0.p.x, pl0.p.z));
  applyHallMood(inHallNow);
  // ⚠️ 光晕必须在厅内隐藏 —— 这是「整厅米色」的**真凶**(逐层排除实验判定):
  // halo 是 26×26 的加色 Sprite,给**地面远眺**标记展厅位置用的;它不写深度、
  // 永远盖在不透明几何之上。玩家进厅后相机距它仅 1.6m ⇒ 整屏被暖光糊满,
  // 星空顶与画作全被洗白。隐藏它之后夜蓝星图立刻显现(实机截图对比确认)。
  halo.visible = unlocked && !inHallNow;
  // 昼夜层每帧覆写曝光/辉光 ⇒ 厅内必须持续压住,否则下一帧又被推回沙漠调性
  if (hallMoodOn) ctx.scene.setAtmosphere && ctx.scene.setAtmosphere(HALL_MOOD);
  if (unlocked) doorMat.emissiveIntensity = 0.45 + Math.sin(t * 2) * 0.15;
  for (let i = 0; i < shaftMats.length; i++)
    shaftMats[i].opacity = 0.42 + Math.sin(t * 1.2 + i * 1.7) * 0.08;
  const da = dustGeo.attributes.position.array;
  for (let i = 0; i < DUST_N; i++) {
    da[i * 3 + 1] -= 0.0035;
    da[i * 3] += Math.sin(t * 0.8 + i) * 0.0006;
    if (da[i * 3 + 1] < FLOOR + 0.3) da[i * 3 + 1] = FLOOR + WALL_H + DOME_H * 0.5;
  }
  dustGeo.attributes.position.needsUpdate = true;
  if (unlocked) {
    const ga = glowGeo.attributes.position.array;
    for (let i = 0; i < GLOW_N; i++) {
      ga[i * 3 + 1] += 0.008;
      if (ga[i * 3 + 1] > 3.1) ga[i * 3 + 1] = 0.2;
    }
    glowGeo.attributes.position.needsUpdate = true;
    beamsG.rotation.y += 0.0005;
  }
  // 配文迟到修正:mode.js 数据就绪后,按 演示/本人上传 分别落文案
  if (!captionsFixed && ctx.mode.demoPhotos) {
    captionsFixed = true;
    for (const g of myIG)
      if (g.userData.eternalName) g.userData.aiDesc = captionFor(g.userData.eternalName);
  }
});

bag.custom.push(() => {
  for (const g of myIG) {
    const i = iG.indexOf(g);
    if (i >= 0) iG.splice(i, 1);
  }
  ctx.scene.removeBounds && ctx.scene.removeBounds(myBounds);
  ctx.kunlun.eternalClick = null;
  ctx.kunlun.eternalKeepOut = null;
  ctx.kunlun.groundOverride = null;
  ctx.kunlun.eternalTeleport = null;
  offTeleportEvt();
  ctx.kunlun.eternalWelcome = null;
  // 拆场时人可能还在厅内:还原背景色,否则热重载后沙漠天空永久停在星夜蓝。
  // (旧模块漏了 rebuildEternalPicks 与媒体订阅的解绑,这次一并补上,别重犯)
  applyHallMood(false);
  ctx.kunlun.rebuildEternalPicks = null;
  offMediaChanged && offMediaChanged();
  disposePalaceArt(); // 程序化贴图(大理石/星图/嵌花)一并释放,热重载不泄漏显存
});
hotEnd('eternal');
if (import.meta.hot) import.meta.hot.accept();
