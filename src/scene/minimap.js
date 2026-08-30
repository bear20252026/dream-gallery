// minimap.js — 小地图渲染(2026-08-30 从 scene/player.js 拆出,职责单一化)
// 职责:画布/静态底图/建筑区静态图 + 沙漠区地形网格/兴趣点/昆仑与灵蕴方位指示。
// 交互:放大按钮 + 阻止地图上的鼠标/触摸事件冒泡到场景。
// 不负责:点地图传送(耦合物理/传送遮罩,留在 scene/player.js,经本模块导出的度量反算坐标)。
import { ctx } from '../ctx.js';

const { OL, OR, OT, OBE, OBR, IL, IR, IRT, IRB } = ctx;
// ⚠️ 不要在模块顶层捕获 ctx.player.pl —— 本模块经 import 提升,求值早于
//    player.js 挂载 pl(实测报 "reading 'p'" 每帧异常);必须在 drM() 内现取。

export const mC = document.getElementById('mc');
const mX = mC.getContext('2d');
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
export const MSC = 2.2,
  MOX = 75,
  MOZ = 29;
export function isBig() {
  return mBig;
}
// 静态地图层:墙体/标签不变,预渲染一次,每帧只需 drawImage + 玩家点
const mStatic = document.createElement('canvas');
mStatic.width = 150;
mStatic.height = 140;
const mSt = mStatic.getContext('2d');
(function drawStaticMap() {
  // 防御断言(2026-08-30 复查建议):本模块依赖 main.js 的导入顺序(scene.js 先于
  // player.js→minimap.js);若未来有人重排为动态/先行导入,这里会拿到 undefined。
  if (typeof OL !== 'number' || typeof OBR !== 'number') {
    console.error('[minimap] 场馆常量未就绪(OL=' + OL + ',OBR=' + OBR + ')—— 导入顺序被重排?静态底图绘制中止');
    return;
  }
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
export function drM() {
  const pl = ctx.player.pl; // 每帧现取(模块求值早于 player.js 挂载)
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

// 阻止小地图上的鼠标/触摸事件冒泡到场景(避免点地图时误转视角/误点画框)
['mousedown', 'mouseup', 'mousemove', 'touchstart', 'touchend', 'touchmove'].forEach((ev) =>
  mC.addEventListener(ev, (e) => e.stopPropagation())
);
