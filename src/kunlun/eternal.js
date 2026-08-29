// eternal.js — 空中永恒展厅·二期①(2026-07-27 主人定稿:六灵蕴+空中永恒展厅融合方案)
// ①晨光留影:主展厅东北角金门(六灵蕴集齐才可开)→ 传送至昆仑上空 400m 六边形浮空展厅
//   东墙三幅「你最早挂上的画」+ 体积光晨光;南侧平台金拱门返程
// 可见性铁律:/api/files 服务端已按设备过滤(演示照片全员/本人上传仅本人/图库仅特殊模式),
//   本模块直接消费其返回,客户端不做二次判断——图库永不泄密
// 手机灯光账户:不新增任何 PointLight——窗/光柱/光束/光池全部 MeshBasicMaterial,画框背光用 emissiveMap
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { hotBegin, hotEnd } from '../hot.js';
import { onMediaChanged } from '../media-push.js'; // 服务端主动推送:后台增删照片即刷新晨光(2026-08-29)
const bag = hotBegin('eternal');
// 灵蕴收集数(spirits.js 经 ctx.kunlun.spiritsGot 暴露)
// ⚠️ 2026-08-29 修:此处曾被误写成 `() => spiritCount()`(无限自递归 → Maximum call stack
//    size exceeded)。正确语义取自本文件 658 行既有用法。
const spiritCount = () => (ctx.kunlun.spiritsGot ? ctx.kunlun.spiritsGot() : 0);
const { s, onTick, loadTexCapped, iG, bounds } = ctx;

// ===================== 位置与地基 =====================
// 展厅悬浮在昆仑正上方(800,600),地板步行面 y=400(相机远平面 2000,地面远眺在射程内;
// 雾密度 0.006 下实体天然隐形,集齐后点亮的六色光束(fog:false)就是"隐约浮现的光点")
const HX = 800,
  HZ = 600,
  HR = 7,
  FLOOR = 400; // 厅心/半径/地板高
const inHall = (x, z) => (x - HX) * (x - HX) + (z - HZ) * (z - HZ) < 9.0 * 9.0; // 含南侧平台
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
  bounds.push(b);
  myBounds.push(b);
  return wall;
}

// ===================== 展厅本体(六边形;边法线朝 0/60/…/300°,东墙=法线+x,门墙=300°) =====================
const stoneM = new THREE.MeshStandardMaterial({
  color: '#d9c4a5',
  roughness: 0.85,
  metalness: 0.05,
}); // 暖色磨石
const VX = [],
  VZ = [];
for (let k = 0; k < 6; k++) {
  const a = ((30 + k * 60) * Math.PI) / 180;
  VX.push(HX + HR * Math.cos(a));
  VZ.push(HZ + HR * Math.sin(a));
}
// 六面墙(门墙 E5 留 1.66m 门洞)
const GAP = 0.83; // 门洞半宽
for (let k = 0; k < 6; k++) {
  const x1 = VX[k],
    z1 = VZ[k],
    x2 = VX[(k + 1) % 6],
    z2 = VZ[(k + 1) % 6];
  if (k !== 5) {
    addBox(x1, z1, x2, z2, FLOOR, 3.5, stoneM);
    continue;
  }
  // 门墙:沿墙方向截两段,中央留洞
  const mx = (x1 + x2) / 2,
    mz = (z1 + z2) / 2,
    dl = Math.hypot(x2 - x1, z2 - z1),
    ux = (x2 - x1) / dl,
    uz = (z2 - z1) / dl;
  addBox(x1, z1, mx - ux * GAP, mz - uz * GAP, FLOOR, 3.5, stoneM);
  addBox(mx + ux * GAP, mz + uz * GAP, x2, z2, FLOOR, 3.5, stoneM);
  addBox(mx - ux * GAP, mz - uz * GAP, mx + ux * GAP, mz + uz * GAP, FLOOR + 2.6, 0.9, stoneM); // 门楣段(洞上方补墙)
}
// 地板/吊顶/倒锥底座
const floorM = new THREE.Mesh(
  new THREE.CylinderGeometry(HR, HR, 0.3, 6),
  new THREE.MeshStandardMaterial({ color: '#6a5138', roughness: 0.7 })
);
floorM.position.set(HX, FLOOR - 0.15, HZ);
s.add(floorM);
const ceilM = new THREE.Mesh(
  new THREE.CircleGeometry(HR, 6),
  new THREE.MeshStandardMaterial({
    color: '#e8dcc8',
    transparent: true,
    opacity: 0.4,
    roughness: 0.6,
  })
);
ceilM.rotation.x = Math.PI / 2;
ceilM.rotation.z = Math.PI / 6;
ceilM.position.set(HX, FLOOR + 3.5, HZ);
s.add(ceilM);
const baseM = new THREE.Mesh(
  new THREE.CylinderGeometry(0.6, HR, 4.5, 6),
  new THREE.MeshStandardMaterial({ color: '#8a7358', roughness: 0.9 })
);
baseM.rotation.y = Math.PI / 6;
baseM.position.set(HX, FLOOR - 2.55, HZ);
s.add(baseM);

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
  beam.position.set(HX + 5.5 * Math.cos(a), FLOOR - 61, HZ + 5.5 * Math.sin(a));
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
  sp.scale.set(26, 26, 1);
  sp.position.set(HX, FLOOR + 2, HZ);
  sp.visible = false;
  s.add(sp);
  return sp;
})();

// ===================== 南侧平台 + 护栏 + 返程金拱门 =====================
// 门墙法线朝 300°:外向 O=(0.5,-0.866),沿墙 D=(0.866,0.5)
const OX = 0.5,
  OZ = -0.866,
  DX = 0.866,
  DZ = 0.5;
const deckC = { x: HX + 7.4 * OX, z: HZ + 7.4 * OZ }; // (803.7,593.6)
const deck = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.3, 2.8), stoneM);
deck.position.set(deckC.x, FLOOR - 0.15, deckC.z);
deck.rotation.y = Math.atan2(DX, DZ);
s.add(deck);
// 三边护栏(高1m,进碰撞;靠厅一侧敞开)
addBox(
  deckC.x + DX * 2 + OX * 1.4,
  deckC.z + DZ * 2 + OZ * 1.4,
  deckC.x - DX * 2 + OX * 1.4,
  deckC.z - DZ * 2 + OZ * 1.4,
  FLOOR,
  1.0,
  stoneM,
  0.14
);
addBox(
  deckC.x + DX * 2 - OX * 1.3,
  deckC.z + DZ * 2 - OZ * 1.3,
  deckC.x + DX * 2 + OX * 1.4,
  deckC.z + DZ * 2 + OZ * 1.4,
  FLOOR,
  1.0,
  stoneM,
  0.14
);
addBox(
  deckC.x - DX * 2 - OX * 1.3,
  deckC.z - DZ * 2 - OZ * 1.3,
  deckC.x - DX * 2 + OX * 1.4,
  deckC.z - DZ * 2 + OZ * 1.4,
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
portalG.position.set(deckC.x + OX * 1.1, FLOOR, deckC.z + OZ * 1.1);
portalG.rotation.y = Math.atan2(-OX, -OZ); // 面朝厅内
for (const p of [-1, 1]) {
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.6, 0.16), goldTrim);
  pillar.position.set(p * 0.8, 1.3, 0);
  portalG.add(pillar);
}
const plintel = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 0.18), goldTrim);
plintel.position.set(0, 2.65, 0);
portalG.add(plintel);
const ppane = new THREE.Mesh(
  new THREE.PlaneGeometry(1.44, 2.4),
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
ppane.position.set(0, 1.3, 0);
portalG.add(ppane);
portalG.userData = { eternalAction: 'portal' };
s.add(portalG);
iG.push(portalG);
myIG.push(portalG);

// ===================== 晨光:东墙三扇亮窗 + 斜射体积光柱 + 地面光池 + 浮尘(全 Basic,零灯光) =====================
// 东墙=V5→V0(x=HX+6.06,z=HZ±3.5),内侧面朝 -x
const EX = HX + 6.06 * 1 - 0.15; // 内壁 x=805.91
function shaftTexture() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 256;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,226,168,0.85)');
  g.addColorStop(0.55, 'rgba(255,214,150,0.32)');
  g.addColorStop(1, 'rgba(255,214,150,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const shaftTex = shaftTexture(),
  shaftMats = [];
for (const wz of [HZ - 2.2, HZ, HZ + 2.2]) {
  const wframe = new THREE.Mesh(
    new THREE.PlaneGeometry(1.05, 1.25),
    new THREE.MeshBasicMaterial({ color: '#caa040', toneMapped: false })
  );
  wframe.rotation.y = -Math.PI / 2;
  wframe.position.set(EX - 0.02, FLOOR + 2.9, wz);
  s.add(wframe);
  const wpane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 1.1),
    new THREE.MeshBasicMaterial({ color: '#ffe0ae', toneMapped: false })
  );
  wpane.rotation.y = -Math.PI / 2;
  wpane.position.set(EX - 0.04, FLOOR + 2.9, wz);
  s.add(wpane);
  // 体积光柱:窗口(805.8,+2.9)→地面(802.2,+0.15),双片交叉,加色渐隐
  const smat = new THREE.MeshBasicMaterial({
    map: shaftTex,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  shaftMats.push(smat);
  const grp = new THREE.Group();
  grp.position.set(804, FLOOR + 1.5, wz);
  grp.rotation.z = -0.92;
  const pA = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 5.0), smat);
  grp.add(pA);
  const pB = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 5.0), smat);
  pB.rotation.y = Math.PI / 2;
  grp.add(pB);
  s.add(grp);
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(0.95, 24),
    new THREE.MeshBasicMaterial({
      color: '#ffd9a0',
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(802.2, FLOOR + 0.04, wz);
  s.add(pool);
}
// 浮尘(45 粒,缓慢飘落+轻摆)
const DUST_N = 45,
  dustPos = new Float32Array(DUST_N * 3);
for (let i = 0; i < DUST_N; i++) {
  dustPos[i * 3] = HX - 3 + Math.random() * 8;
  dustPos[i * 3 + 1] = FLOOR + 0.3 + Math.random() * 3;
  dustPos[i * 3 + 2] = HZ - 3.2 + Math.random() * 6.4;
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(
  dustGeo,
  new THREE.PointsMaterial({
    color: '#ffdf9a',
    size: 0.045,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
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
    new THREE.PlaneGeometry(2.2, 0.55),
    new THREE.MeshBasicMaterial({ map: t, toneMapped: false })
  );
  plaque.rotation.y = -Math.PI / 2;
  plaque.position.set(EX - 0.06, FLOOR + 3.15, HZ);
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
  g.position.set(x, FLOOR + 1.8, z);
  g.rotation.y = rotY;
  g.userData = {
    isPainting: true,
    ox: x,
    oy: FLOOR + 1.8,
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
    new THREE.BoxGeometry(1.1, 1.3, 0.07),
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
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 1.14), pm);
  plane.position.z = 0.045;
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
const FRAME_Z = [HZ - 2.2, HZ, HZ + 2.2],
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
  fetch('/api/files?dir=photos')
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
      picks.slice(0, 3).forEach((p, i) =>
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
          buildFrame(
            EX - 0.1,
            FRAME_Z[i],
            -Math.PI / 2,
            -1,
            0,
            'photos/' + n,
            n,
            null,
            '晨光留影'
          )
        )
      );
    });
}
refreshMorning();
// 每 45s 同步一次晨光(与新媒体墙同步周期一致;仅集合变化才重建)
setInterval(refreshMorning, 45000);
// 服务端主动推送:后台增删照片 → 立即刷新晨光三帧(不等轮询)
onMediaChanged(function (d) {
  if (!d || d.dir === 'photos') refreshMorning();
});

// ===================== C2 展厅选片导入(2026-07-30) =====================
// 本人从「我的上传」中挑选的作品,呈现在永恒展厅西墙(私人收藏墙);
// 可见性由 /api/myuploads 服务端按设备过滤保证(与 mediarules.isMine 同口径:仅本人上传可见),
// 客户端只呈现「已选 ∩ 本人拥有」之名,删除的作品自动跳过。西墙网格容量 5列×3行=15 幅。
const WX = HX - 6.06; // 西墙内壁 x
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
        const z = HZ + (-3.0 + col * 1.5);
        const y = FLOOR + (0.65 + row * 1.1); // 3 行:0.65/1.75/2.85(画框高1.3,顶不超墙3.5)
        buildFrame(
          WX + 0.1,
          z,
          Math.PI / 2,
          1,
          0,
          'photos/' + encodeURIComponent(name),
          name,
          null,
          '你挑入永恒展厅的画'
        );
        i++;
      }
      if (picks.length > IMP_CAP)
        ctx.ui.modeToast &&
          ctx.ui.modeToast('展厅西墙最多呈现 ' + IMP_CAP + ' 幅，其余已为你留作候选。');
    })
    .catch(() => {});
}
buildImportFrames();
ctx.kunlun.rebuildEternalPicks = buildImportFrames; // C2:选片保存后由设置页调用,刷新西墙

// ===================== 金门(地面·主展厅东北角 x=15 z=-12,两面可点;六灵蕴集齐才开) =====================
const doorG = new THREE.Group();
doorG.position.set(15, 0, -12);
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
// 封印条(解锁前贴在南面)
const seal = (function () {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#a02020';
  x.fillRect(0, 0, 128, 512);
  x.strokeStyle = '#ffd98a';
  x.lineWidth = 6;
  x.strokeRect(8, 8, 112, 496);
  x.fillStyle = '#ffd98a';
  x.font = 'bold 64px serif';
  x.textAlign = 'center';
  '六合封印'.split('').forEach((ch, i) => x.fillText(ch, 64, 90 + i * 110));
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
  glowPos[i * 3] = 14.1 + Math.random() * 1.8;
  glowPos[i * 3 + 1] = 0.2 + Math.random() * 2.9;
  glowPos[i * 3 + 2] = -12.3 + Math.random() * 0.6;
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
function chime() {
  try {
    const ac = chime.ac || (chime.ac = new (window.AudioContext || window.webkitAudioContext)());
    [0, 0.1].forEach((d, k) => {
      const o = ac.createOscillator(),
        g = ac.createGain();
      o.type = 'sine';
      o.frequency.value = 1047 * (k ? 2 : 1);
      g.gain.setValueAtTime(0.0001, ac.currentTime + d);
      g.gain.exponentialRampToValueAtTime(0.18, ac.currentTime + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + d + 1.2);
      o.connect(g);
      g.connect(ac.destination);
      o.start(ac.currentTime + d);
      o.stop(ac.currentTime + d + 1.3);
    });
  } catch (e) {}
}
function bigText(text) {
  const d = document.createElement('div');
  d.style.cssText =
    'position:fixed;inset:0;z-index:389;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity .5s';
  const inner = document.createElement('div');
  inner.style.cssText =
    'max-width:86vw;text-align:center;font-size:clamp(20px,5vw,32px);letter-spacing:3px;color:#ffe9c4;text-shadow:0 0 30px rgba(255,200,100,.6),0 2px 12px rgba(0,0,0,.8);line-height:1.9';
  inner.textContent = text;
  d.appendChild(inner);
  document.body.appendChild(d);
  requestAnimationFrame(() => {
    d.style.opacity = '1';
  });
  setTimeout(() => {
    d.style.opacity = '0';
    setTimeout(() => d.remove(), 600);
  }, 2600);
}

// ===================== 金门/拱门点击 → 传送(paintings.js 经 eternalAction 钩子调来) =====================
// 首到欢迎(ark.js 飞舟停靠后也要调用;localStorage 幂等,只迎一次)
function welcome() {
  if (ctx.store.flag('eternalWelcomed')) return;
  ctx.store.mark('eternalWelcomed');
  bigText('永恒展厅。你终于到了。');
  ctx.ui.kunlunSpeak &&
    ctx.ui.kunlunSpeak(
      '你终于到了。这里不在大地上，也不在天穹上。它在你与天空之间——那个只有完整的人才能抵达的位置。从前，这里是西王母存放心象碎片的地方。现在，它是你的了。',
      'hall'
    ); // B6 展厅音色
}
import { goldenTeleport } from '../shared/teleport-fx.js';
let tpLock = false;
function teleport(intoHall) {
  if (tpLock || !ctx.player.pl) return;
  tpLock = true;
  chime();
  goldenTeleport(
    () => {
      const pl = ctx.player.pl;
      if (intoHall) {
        pl.p.set(802.6, FLOOR + 1.6, 594.5);
        pl.y = 3.68;
        pl.pi = 0.1;
      } else {
        pl.p.set(15, 1.55, -10.6);
        pl.y = Math.PI;
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
        ctx.ui.modeToast('六灵蕴未齐（' + n + '/6）——万镜画廊的门，还不会为你打开。');
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
  halo.visible = true; // 昆仑上空浮现六色光点
  if (announce) ctx.ui.modeToast && ctx.ui.modeToast('万镜画廊的门，开了。昆仑上空，有光在等你。');
}
onTick(function () {
  const t = performance.now() * 0.001;
  if (!unlocked && ctx.kunlun.isDone && ctx.kunlun.isDone()) setUnlocked(!firstCheck); // 载入时已齐:静默开门;本 session 集齐:通报
  firstCheck = false;
  if (unlocked) doorMat.emissiveIntensity = 0.45 + Math.sin(t * 2) * 0.15;
  for (let i = 0; i < shaftMats.length; i++)
    shaftMats[i].opacity = 0.42 + Math.sin(t * 1.2 + i * 1.7) * 0.08;
  const da = dustGeo.attributes.position.array;
  for (let i = 0; i < DUST_N; i++) {
    da[i * 3 + 1] -= 0.0035;
    da[i * 3] += Math.sin(t * 0.8 + i) * 0.0006;
    if (da[i * 3 + 1] < FLOOR + 0.25) da[i * 3 + 1] = FLOOR + 3.2;
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
  for (const b of myBounds) {
    const i = bounds.indexOf(b);
    if (i >= 0) bounds.splice(i, 1);
  }
  ctx.kunlun.eternalClick = null;
  ctx.kunlun.eternalKeepOut = null;
  ctx.kunlun.groundOverride = null;
  ctx.kunlun.eternalTeleport = null;
  ctx.kunlun.eternalWelcome = null;
});
hotEnd('eternal');
if (import.meta.hot) import.meta.hot.accept();
