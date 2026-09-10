// minimap.js — 小地图「羊皮纸罗盘」(2026-09-10 主人定圆形罗盘方案;前身 2026-08-30 自 player.js 拆出)
// 艺术语言:与全站手绘 UI(对话框/任务册/画板)统一——纸底/墨线/朱砂印章/BOTW 式极简。
// 结构:圆形画布(⌀150/放大⌀260,墨环+刻度+北针画在 bezel 层);
//   建筑区 = 260² 静态纸质底图(S=2.6px/m,zone 外沿正好内切于圆)按档缩放;
//   沙漠区 = 启动时一次性预渲染的全沙漠等高线纸图图集(1600×1400,1px=1m,
//     22k 采样 + marching-squares 等高线,替代旧版每帧 1200+ 次 getH 网格重绘),
//     每帧只 drawImage 取玩家视窗 + 画标记。
// 交互:放大按钮 + 阻止地图事件冒泡。点图传送在 scene/player.js(经 bMap/bUnmap 反算,圆形命中)。
import { ctx } from '../ctx.js';
import { Z } from '../shared/z-layers.mjs';

const { OL, OR, OT, OBE, OBR, IL, IR, IRT, IRB } = ctx;
// ⚠️ 不要在模块顶层捕获 ctx.player.pl —— 本模块经 import 提升,求值早于
//    player.js 挂载 pl(实测报 "reading 'p'" 每帧异常);必须在 drawMap() 内现取。

// ===================== 画布与两档尺寸 =====================
export const mapCanvas = document.getElementById('mc');
const mapCtx = mapCanvas.getContext('2d');
const SMALL = 150,
  BIG = 260;
let mBig = false;
mapCanvas.width = SMALL;
mapCanvas.height = SMALL;

// 放大按钮(纸片小方章风;必须落在圆形命中区内——border-radius:50% 会把圆外点击裁掉)
const mBigBtn = document.createElement('button');
mBigBtn.textContent = '⤢';
mBigBtn.title = '放大小地图';
mBigBtn.style.cssText =
  'position:absolute;left:50%;bottom:9px;transform:translateX(-50%);z-index:2;width:22px;height:22px;border-radius:6px;' +
  'border:1px solid rgba(74,53,38,.5);background:rgba(248,241,223,.88);color:#4e4237;' +
  "font-size:12px;line-height:1;cursor:pointer;pointer-events:auto;font-family:'Kaiti SC','STKaiti','KaiTi',serif";
mBigBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  mBig = !mBig;
  const mDiv = document.getElementById('m');
  mDiv.style.transition = 'width .35s ease,height .35s ease';
  const s = mBig ? BIG : SMALL;
  mapCanvas.width = s;
  mapCanvas.height = s;
  mDiv.style.width = s + 'px';
  mDiv.style.height = s + 'px';
  ensureBezel();
});
document.getElementById('m').appendChild(mBigBtn);

export function isBig() {
  return mBig;
}

// ===================== 建筑区坐标变换(传送反算共用,玩家坐标 ↔ 图面像素) =====================
// zone(x∈[-34,34], z∈[-13,60] 中心 z=23.5)的外沿角正好落在圆周上:S=w/100。
// 旧版导出 mapScale/mapOffX/mapOffZ 已废:传送与绘制统一走这两个函数,永不再各写一份。
const ZONE_CZ = 23.5;
export function bMap(w, x, z) {
  const S = w / 100;
  return [w / 2 + x * S, w / 2 + (z - ZONE_CZ) * S];
}
export function bUnmap(w, px, py) {
  const S = w / 100;
  return [(px - w / 2) / S, (py - w / 2) / S + ZONE_CZ];
}

// ===================== 调色板(全站羊皮纸语言) =====================
const INK = '#4e4237',
  INK_SOFT = 'rgba(78,66,55,.42)',
  CINNABAR = '#a04a35',
  PAPER = '#f3ead2',
  GOLD = '#d9a441';

// ===================== 建筑区静态底图(260²,S=2.6,纸质重画;旧粉霓虹退役) =====================
const B_BASE = 260;
const buildBase = document.createElement('canvas');
buildBase.width = B_BASE;
buildBase.height = B_BASE;
let buildBaseReady = false;
function drawBuildingBase() {
  if (typeof OL !== 'number' || typeof OBR !== 'number') {
    console.error(
      '[minimap] 场馆常量未就绪(OL=' + OL + ',OBR=' + OBR + ')—— 导入顺序被重排?静态底图绘制中止'
    );
    return;
  }
  const c = buildBase.getContext('2d');
  const S = B_BASE / 100,
    ox = B_BASE / 2,
    oz = B_BASE / 2;
  const px = (x) => ox + x * S,
    pz = (z) => oz + (z - ZONE_CZ) * S;
  c.clearRect(0, 0, B_BASE, B_BASE);
  // 纸底
  c.fillStyle = PAPER;
  c.fillRect(0, 0, B_BASE, B_BASE);
  // 展厅群淡彩洗(上区 z=-12~6 一片,回字大厅 z=6~28 一片)
  c.fillStyle = 'rgba(213,178,110,.14)';
  c.fillRect(px(OL), pz(OT), (OR - OL) * S, (OBE - OT) * S);
  c.fillStyle = 'rgba(190,120,90,.10)';
  c.fillRect(px(OL), pz(OBE), (OR - OL) * S, (OBR - OBE) * S);
  // --- 展厅外墙(墨线) ---
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.lineCap = 'round';
  c.strokeRect(px(OL), pz(OT), (OR - OL) * S, (OBE - OT) * S);
  // 走廊隔墙 x=±4
  c.strokeStyle = INK_SOFT;
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(px(-4), pz(OT));
  c.lineTo(px(-4), pz(OBE - 1));
  c.moveTo(px(4), pz(OT));
  c.lineTo(px(4), pz(OBE - 1));
  // E 厅南墙(z=OBE,留中门)
  c.moveTo(px(-4), pz(OBE));
  c.lineTo(px(-1), pz(OBE));
  c.moveTo(px(1), pz(OBE));
  c.lineTo(px(4), pz(OBE));
  c.stroke();
  // --- 回字大厅外墙(南+东西) ---
  c.strokeStyle = INK;
  c.lineWidth = 2.2;
  c.beginPath();
  c.moveTo(px(OL), pz(OBE));
  c.lineTo(px(OL), pz(OBR));
  c.lineTo(px(OR), pz(OBR));
  c.lineTo(px(OR), pz(OBE));
  c.stroke();
  // 回字内墙(四段带门洞)
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(px(IL), pz(IRT));
  c.lineTo(px(-2), pz(IRT));
  c.moveTo(px(2), pz(IRT));
  c.lineTo(px(IR), pz(IRT));
  c.moveTo(px(IL), pz(IRB));
  c.lineTo(px(-2), pz(IRB));
  c.moveTo(px(2), pz(IRB));
  c.lineTo(px(IR), pz(IRB));
  c.moveTo(px(IL), pz(IRT));
  c.lineTo(px(IL), pz(15.5));
  c.moveTo(px(IL), pz(18.5));
  c.lineTo(px(IL), pz(IRB));
  c.moveTo(px(IR), pz(IRT));
  c.lineTo(px(IR), pz(15.5));
  c.moveTo(px(IR), pz(18.5));
  c.lineTo(px(IR), pz(IRB));
  c.stroke();
  // 门洞:朱砂小菱形(旧「门」字退役)
  c.fillStyle = CINNABAR;
  for (const dz of [IRT, IRB + 0.6]) {
    c.save();
    c.translate(px(0), pz(dz));
    c.rotate(Math.PI / 4);
    c.fillRect(-2.6, -2.6, 5.2, 5.2);
    c.restore();
  }
  // 展厅标签(楷体,墨色淡)
  c.fillStyle = 'rgba(74,53,38,.62)';
  c.font = "13px 'Kaiti SC','STKaiti','KaiTi',serif";
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const rooms = [
    ['A', -11, -9],
    ['B', 11, -9],
    ['C', -11, -1],
    ['D', 11, -1],
    ['E', 0, 3.5],
    ['F', -11, 4],
    ['G', 11, 4],
  ];
  for (const [t, rx, rz] of rooms) c.fillText(t, px(rx), pz(rz));
  // --- 四座喷泉:青墨圈 + 水波(南泉盖「泉」印章) ---
  const FOUNTAIN_SPOTS = [
    [0, 42],
    [0, -26],
    [32, 8],
    [-32, 8],
  ];
  for (const [fx, fz] of FOUNTAIN_SPOTS) {
    c.strokeStyle = 'rgba(70,120,130,.65)';
    c.fillStyle = 'rgba(70,120,130,.16)';
    c.lineWidth = 1.4;
    c.beginPath();
    c.arc(px(fx), pz(fz), 1.7 * S, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.beginPath();
    c.arc(px(fx), pz(fz), 0.7 * S, 0.2, Math.PI - 0.2);
    c.stroke();
  }
  seal(c, px(0), pz(42) + 12, '泉', 20);
  buildBaseReady = true;
}

// 朱砂印章(圆角方 + 白楷体字)
function seal(c, x, y, ch, size) {
  c.save();
  c.fillStyle = CINNABAR;
  const s = size || 13;
  const r = s * 0.28;
  c.beginPath();
  c.roundRect(x - s / 2, y - s / 2, s, s, r);
  c.fill();
  c.fillStyle = '#f8f1df';
  c.font = "bold " + Math.round(s * 0.72) + "px 'Kaiti SC','STKaiti','KaiTi',serif";
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(ch, x, y + s * 0.04);
  c.restore();
}

// ===================== 沙漠等高线纸图图集(一次性预渲染) =====================
// 覆盖画廊(0,0)+B612(800,600)+空中展厅(800,600):x∈[-450,1150] z∈[-450,950],1px=1m。
// 采样网格 10m/格(22.4k 次 getH,一次性 ~15ms);等高线 marchingsquares;西北光山影。
const ATLAS = { x0: -450, z0: -450, w: 1600, h: 1400, cell: 10 };
const atlas = document.createElement('canvas');
atlas.width = ATLAS.w;
atlas.height = ATLAS.h;
let atlasReady = false;
let atlasBuilding = false;
function buildAtlas() {
  if (atlasReady || atlasBuilding || !ctx.media.desert) return;
  atlasBuilding = true;
  try {
    const t0 = performance.now();
    const c = atlas.getContext('2d');
    const GX = Math.ceil(ATLAS.w / ATLAS.cell),
      GZ = Math.ceil(ATLAS.h / ATLAS.cell);
    const H = new Float32Array((GX + 1) * (GZ + 1));
    for (let j = 0; j <= GZ; j++)
      for (let i = 0; i <= GX; i++)
        H[j * (GX + 1) + i] = ctx.media.desert.getH(ATLAS.x0 + i * ATLAS.cell, ATLAS.z0 + j * ATLAS.cell);
    // 纸底
    c.fillStyle = PAPER;
    c.fillRect(0, 0, ATLAS.w, ATLAS.h);
    // 沙色水彩洗(按格均高调色,向纸色褪)
    for (let j = 0; j < GZ; j++)
      for (let i = 0; i < GX; i++) {
        const h = (H[j * (GX + 1) + i] + H[j * (GX + 1) + i + 1] + H[(j + 1) * (GX + 1) + i] + H[(j + 1) * (GX + 1) + i + 1]) / 4;
        c.fillStyle = washColor(h);
        c.fillRect(i * ATLAS.cell, j * ATLAS.cell, ATLAS.cell + 1, ATLAS.cell + 1);
        // 山影:西北光,坡向差 ±10%
        const dh = H[(j + 1) * (GX + 1) + i + 1] - H[j * (GX + 1) + i];
        const a = Math.max(-0.1, Math.min(0.1, -dh * 0.012));
        if (Math.abs(a) > 0.015) {
          c.fillStyle = a > 0 ? 'rgba(255,252,240,' + a.toFixed(3) + ')' : 'rgba(70,50,30,' + (-a).toFixed(3) + ')';
          c.fillRect(i * ATLAS.cell, j * ATLAS.cell, ATLAS.cell + 1, ATLAS.cell + 1);
        }
      }
    // 等高线(marching squares;每第三条为计曲线,加粗)
    const bands = [-2, 0, 3, 6, 10, 15, 21, 28, 36, 46, 60, 80, 100];
    c.lineCap = 'round';
    for (let b = 0; b < bands.length; b++) {
      c.strokeStyle = b % 3 === 0 ? 'rgba(78,66,55,.46)' : 'rgba(78,66,55,.28)';
      c.lineWidth = b % 3 === 0 ? 1.7 : 1.1;
      c.beginPath();
      const t = bands[b];
      for (let j = 0; j < GZ; j++)
        for (let i = 0; i < GX; i++) {
          const a = H[j * (GX + 1) + i],
            bb = H[j * (GX + 1) + i + 1],
            cc = H[(j + 1) * (GX + 1) + i + 1],
            d = H[(j + 1) * (GX + 1) + i];
          const idx = (a > t ? 8 : 0) | (bb > t ? 4 : 0) | (cc > t ? 2 : 0) | (d > t ? 1 : 0);
          if (idx === 0 || idx === 15) continue;
          const x0 = i * ATLAS.cell,
            y0 = j * ATLAS.cell;
          // 四边交点(线性插值):T 上边 / B 下边 / L 左边 / R 右边
          const T = [x0 + ATLAS.cell * ((a - t) / (bb - a || 1e-6)), y0];
          const B = [x0 + ATLAS.cell * ((d - t) / (cc - d || 1e-6)), y0 + ATLAS.cell];
          const L = [x0, y0 + ATLAS.cell * ((a - t) / (d - a || 1e-6))];
          const R = [x0 + ATLAS.cell, y0 + ATLAS.cell * ((bb - t) / (cc - bb || 1e-6))];
          seg(idx, T, R, B, L, c);
        }
      c.stroke();
    }
    // B612 山巅小标记(峰顶平台)
    seal(c, 800 - ATLAS.x0, 600 - ATLAS.z0 - 14, '巅', 22);
    atlasReady = true;
    console.log('[minimap] 沙漠纸图图集预渲染完成 ' + Math.round(performance.now() - t0) + 'ms');
  } catch (e) {
    console.error('[minimap] 图集预渲染失败:', e.message);
  }
  atlasBuilding = false;
}
// 16 案例:返回该格内等值线段(T上/R右/B下/L左交点)
function seg(idx, T, R, B, L, c) {
  const mv = (p, q) => {
    c.moveTo(p[0], p[1]);
    c.lineTo(q[0], q[1]);
  };
  switch (idx) {
    case 1: case 14: mv(L, B); break;
    case 2: case 13: mv(B, R); break;
    case 3: case 12: mv(L, R); break;
    case 4: case 11: mv(T, R); break;
    case 6: case 9: mv(T, B); break;
    case 7: case 8: mv(L, T); break;
    case 5: mv(T, L); mv(B, R); break;
    case 10: mv(T, R); mv(L, B); break;
  }
}
function washColor(h) {
  if (h < -2) return '#efe9dc';
  if (h < 3) return '#ece1c8';
  if (h < 8) return '#e3d5b4';
  if (h < 15) return '#d8c6a0';
  if (h < 24) return '#c9b48d';
  if (h < 40) return '#b9a179';
  if (h < 60) return '#a98f6f';
  if (h < 90) return '#9d8a74';
  return '#cfc8bd';
}

// ===================== 罗盘 bezel(墨环+刻度+北针+纸缘晕影,静态一次) =====================
const bezels = {};
function ensureBezel() {
  const s = mBig ? BIG : SMALL;
  if (bezels[s]) return bezels[s];
  const b = document.createElement('canvas');
  b.width = s;
  b.height = s;
  const c = b.getContext('2d');
  const r = s / 2;
  // 纸缘晕影
  const g = c.createRadialGradient(r, r, r * 0.72, r, r, r);
  g.addColorStop(0, 'rgba(90,70,45,0)');
  g.addColorStop(1, 'rgba(90,70,45,.26)');
  c.fillStyle = g;
  c.fillRect(0, 0, s, s);
  // 墨环(内细外粗,画布边缘留 2px 给 CSS 圆裁剪)
  c.strokeStyle = INK;
  c.lineWidth = 2.5;
  c.beginPath();
  c.arc(r, r, r - 3.5, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = 'rgba(74,53,38,.45)';
  c.lineWidth = 1;
  c.beginPath();
  c.arc(r, r, r - 8, 0, Math.PI * 2);
  c.stroke();
  // 刻度:每 15° 短线,正交方位加粗
  for (let a = 0; a < 360; a += 15) {
    const rad = (a * Math.PI) / 180,
      major = a % 90 === 0;
    c.strokeStyle = major ? INK : 'rgba(74,53,38,.35)';
    c.lineWidth = major ? 2 : 1;
    const r1 = r - 10,
      r2 = r - (major ? 20 : 15);
    c.beginPath();
    c.moveTo(r + Math.sin(rad) * r1, r - Math.cos(rad) * r1);
    c.lineTo(r + Math.sin(rad) * r2, r - Math.cos(rad) * r2);
    c.stroke();
  }
  // 北针:墨三角插朱砂北尖,指向图心
  c.fillStyle = CINNABAR;
  c.beginPath();
  c.moveTo(r, r - 12);
  c.lineTo(r - 4.5, r - 24);
  c.lineTo(r + 4.5, r - 24);
  c.closePath();
  c.fill();
  c.fillStyle = INK;
  c.beginPath();
  c.moveTo(r, r - 12 + 12 * 0.4);
  c.lineTo(r - 4.5, r - 24 + 12 * 0.4);
  c.lineTo(r + 4.5, r - 24 + 12 * 0.4);
  c.closePath();
  c.fill();
  if (s === BIG) {
    c.fillStyle = 'rgba(74,53,38,.7)';
    c.font = "12px 'Kaiti SC','STKaiti','KaiTi',serif";
    c.textAlign = 'center';
    c.fillText('北', r, r - 32);
    // 比例尺(R=150m 视野):60m 线段
    const k = s / 300,
      len = 60 * k;
    c.strokeStyle = INK;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(r - len / 2, s - 16);
    c.lineTo(r + len / 2, s - 16);
    c.moveTo(r - len / 2, s - 19);
    c.lineTo(r - len / 2, s - 13);
    c.moveTo(r + len / 2, s - 19);
    c.lineTo(r + len / 2, s - 13);
    c.stroke();
    c.fillStyle = INK;
    c.font = "10px 'Kaiti SC','STKaiti','KaiTi',serif";
    c.fillText('60m', r, s - 24);
  }
  bezels[s] = b;
  return b;
}

// ===================== 动态绘制 =====================
// 墨色小箭头(玩家,随朝向旋转;纸色描边保对比)
function drawArrow(c, x, y, ang, s) {
  c.save();
  c.translate(x, y);
  c.rotate(-ang);
  c.scale(s, s);
  c.beginPath();
  c.moveTo(0, -6.5);
  c.lineTo(4.6, 5.2);
  c.lineTo(0, 2.6);
  c.lineTo(-4.6, 5.2);
  c.closePath();
  c.fillStyle = INK;
  c.strokeStyle = 'rgba(248,241,223,.92)';
  c.lineWidth = 1.6 / s;
  c.fill();
  c.stroke();
  c.restore();
}
// 四芒星屑(B612 指示)
function drawStar(c, x, y, r, label) {
  c.save();
  c.translate(x, y);
  c.fillStyle = GOLD;
  c.strokeStyle = 'rgba(248,241,223,.9)';
  c.lineWidth = 1;
  c.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    c.lineTo(Math.sin(a) * r, -Math.cos(a) * r);
    c.lineTo(Math.sin(a + Math.PI / 4) * r * 0.32, -Math.cos(a + Math.PI / 4) * r * 0.32);
  }
  c.closePath();
  c.fill();
  c.stroke();
  if (label) {
    c.fillStyle = 'rgba(74,53,38,.75)';
    c.font = "10px 'Kaiti SC','STKaiti','KaiTi',serif";
    c.textAlign = 'center';
    c.fillText('B612', 0, -r - 5);
  }
  c.restore();
}

let lastMs = 0;
let lastKeepOut = false;
export function drawMap() {
  const t0 = performance.now();
  const pl = ctx.player.pl; // 每帧现取(模块求值早于 player.js 挂载)
  const W = mapCanvas.width;
  const inZone = Math.abs(pl.p.x) < 34 && pl.p.z > -13 && pl.p.z < 60;
  mapCtx.clearRect(0, 0, W, W);
  // 圆形裁剪(与 CSS 圆裁剪双保险;bezel 环内才是图)
  mapCtx.save();
  mapCtx.beginPath();
  mapCtx.arc(W / 2, W / 2, W / 2 - 3, 0, Math.PI * 2);
  mapCtx.clip();
  if (inZone) drawBuilding(pl, W);
  else drawDesert(pl, W);
  mapCtx.restore();
  mapCtx.drawImage(ensureBezel(), 0, 0);
  lastMs = performance.now() - t0;
}

// —— 建筑区:静态纸质底图缩放 + 动态标记 ——
function drawBuilding(pl, W) {
  if (!buildBaseReady) drawBuildingBase();
  mapCtx.drawImage(buildBase, 0, 0, B_BASE, B_BASE, 0, 0, W, W);
  const [px, pz] = bMap(W, pl.p.x, pl.p.z);
  drawArrow(mapCtx, px, pz, pl.y, W / BIG);
  // B612 星屑方位(静态图模式恒显;贴边钳制)
  if (ctx.media.desert && ctx.media.desert.kunlun) {
    const K = ctx.media.desert.kunlun;
    const a = Math.atan2(K.z - pl.p.z, K.x - pl.p.x);
    let ex = px + Math.cos(a) * W * 0.28,
      ey = pz + Math.sin(a) * W * 0.28;
    const rMax = W / 2 - 16;
    const dx = ex - W / 2,
      dy = ey - W / 2,
      d = Math.hypot(dx, dy);
    if (d > rMax) {
      ex = W / 2 + (dx / d) * rMax;
      ey = W / 2 + (dy / d) * rMax;
    }
    drawStar(mapCtx, ex, ey, W === BIG ? 7 : 5, false);
  }
}

// —— 沙漠区:图集视窗 + 印章/星屑/禁区/灵蕴 ——
function drawDesert(pl, W) {
  if (!atlasReady) buildAtlas();
  const R = mBig ? 150 : 45; // 视野半径(米)
  mapCtx.fillStyle = PAPER;
  mapCtx.fillRect(0, 0, W, W);
  if (atlasReady) {
    const sw = 2 * R; // 图集 1px=1m
    let sx = pl.p.x - ATLAS.x0 - R,
      sy = pl.p.z - ATLAS.z0 - R;
    sx = Math.max(0, Math.min(ATLAS.w - sw, sx));
    sy = Math.max(0, Math.min(ATLAS.h - sw, sy));
    mapCtx.drawImage(atlas, sx, sy, sw, sw, 0, 0, W, W);
  }
  const k = W / (2 * R); // 屏幕像素/米
  const gx = (wx) => W / 2 + (wx - pl.p.x) * k,
    gy = (wz) => W / 2 + (wz - pl.p.z) * k;
  const vis = (x, y, m) => x > m && x < W - m && y > m && y < W - m;
  // 万镜画廊禁区(hatch + 镜印章;800,600)
  lastKeepOut = false;
  {
    const hx = gx(800),
      hz = gy(600),
      hr = 9 * k;
    if (vis(hx, hz, hr + 6)) {
      lastKeepOut = true;
      mapCtx.save();
      mapCtx.strokeStyle = 'rgba(120,90,160,.55)';
      mapCtx.fillStyle = 'rgba(120,90,160,.12)';
      mapCtx.lineWidth = 1.2;
      mapCtx.setLineDash([4, 3]);
      mapCtx.beginPath();
      mapCtx.arc(hx, hz, hr, 0, Math.PI * 2);
      mapCtx.fill();
      mapCtx.stroke();
      mapCtx.setLineDash([]);
      mapCtx.clip();
      mapCtx.strokeStyle = 'rgba(120,90,160,.28)';
      for (let o = -hr; o < hr; o += 5) {
        mapCtx.beginPath();
        mapCtx.moveTo(hx + o, hz - hr);
        mapCtx.lineTo(hx + o + 2 * hr, hz + hr);
        mapCtx.stroke();
      }
      mapCtx.restore();
      seal(mapCtx, hx, hz, '镜', 12);
    }
  }
  // 兴趣点印章:馆/板/考
  const poi = [
    [0, 8, '馆'],
    [0, 44, '板'],
    [39, 14, '考'],
  ];
  for (const [wx, wz, ch] of poi) {
    const x = gx(wx),
      y = gy(wz);
    if (vis(x, y, 8)) seal(mapCtx, x, y, ch, W === BIG ? 14 : 11);
  }
  // B612 星屑:视野内画星,视野外贴边指示
  if (ctx.media.desert && ctx.media.desert.kunlun) {
    const K = ctx.media.desert.kunlun;
    const x = gx(K.x),
      y = gy(K.z);
    if (vis(x, y, 14)) drawStar(mapCtx, x, y, W === BIG ? 8 : 6, mBig);
    else {
      const a = Math.atan2(y - W / 2, x - W / 2);
      drawStar(mapCtx, W / 2 + Math.cos(a) * (W / 2 - 14), W / 2 + Math.sin(a) * (W / 2 - 14), W === BIG ? 7 : 5, false);
    }
  }
  // 灵蕴目标(脉动金点;视野外贴边)
  if (ctx.kunlun.spiritMark) {
    const mk = ctx.kunlun.spiritMark();
    if (mk) {
      const x = gx(mk.x),
        y = gy(mk.z);
      const pulse = 3.5 + Math.sin(performance.now() * 0.005) * 1.2;
      if (vis(x, y, 12)) {
        mapCtx.fillStyle = mk.color;
        mapCtx.strokeStyle = 'rgba(248,241,223,.9)';
        mapCtx.lineWidth = 1.2;
        mapCtx.beginPath();
        mapCtx.arc(x, y, pulse, 0, Math.PI * 2);
        mapCtx.fill();
        mapCtx.stroke();
        if (mBig) {
          mapCtx.fillStyle = 'rgba(74,53,38,.75)';
          mapCtx.font = "10px 'Kaiti SC','STKaiti','KaiTi',serif";
          mapCtx.textAlign = 'center';
          mapCtx.fillText(mk.name, x, y - 8);
        }
      } else {
        const a = Math.atan2(y - W / 2, x - W / 2);
        mapCtx.fillStyle = mk.color;
        mapCtx.strokeStyle = 'rgba(248,241,223,.9)';
        mapCtx.lineWidth = 1;
        mapCtx.beginPath();
        mapCtx.arc(W / 2 + Math.cos(a) * (W / 2 - 12), W / 2 + Math.sin(a) * (W / 2 - 12), 3.5, 0, Math.PI * 2);
        mapCtx.fill();
        mapCtx.stroke();
      }
    }
  }
  drawArrow(mapCtx, W / 2, W / 2, pl.y, W / BIG);
}

// ===================== 探针钩子 + 收尾 =====================
window.__minimap = {
  get atlasReady() {
    return atlasReady;
  },
  atlas,
  buildBase,
  get lastMs() {
    return lastMs;
  },
  get lastKeepOut() {
    return lastKeepOut;
  },
  sizes: { SMALL, BIG },
  // 探针专用:同步试画箭头(loop 每帧重绘会盖掉,只在同一次 JS 任务内读数有效)
  drawArrowAt: (x, y, ang, s) => drawArrow(mapCtx, x, y, ang, s),
};
// 启动空闲期提前预渲染图集(desert.js 已挂载时);否则首次进沙漠当帧同步构建
if (typeof requestIdleCallback === 'function') requestIdleCallback(() => buildAtlas(), { timeout: 8000 });
else setTimeout(buildAtlas, 4000);

// 阻止小地图上的鼠标/触摸事件冒泡到场景(避免点地图时误转视角/误点画框)
['mousedown', 'mouseup', 'mousemove', 'touchstart', 'touchend', 'touchmove'].forEach((ev) =>
  mapCanvas.addEventListener(ev, (e) => e.stopPropagation())
);
