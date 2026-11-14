// palace-art.js — 星光宫殿的程序化材质(2026-11-14)
//
// 主人要「好看的宫殿」。原先那个「展厅」是半径 7m、墙高 3.5m 的六边形小房间,
// 十来米见方、抬头一块平板 —— 无论怎么打光都不是宫殿。本轮扩成 32m 跨度的穹顶大殿,
// 而宫殿的质感**全在表面**:大理石的纹理与金线、穹顶的星图与银河、地面的星罗盘嵌花。
// 这些若用外部贴图会带来几 MB 资产与加载失败风险,所以全部程序化生成(canvas),
// 零外部资产、零新增灯光、零网络请求。
//
// ⚠️ 无顶层副作用:全部是函数,首次调用才建(需要 document),便于 node 环境单测 import。
// ⚠️ 每张图只在模块内缓存一份(宫殿各面共用),不逐面重建。

import * as THREE from 'three';

const cache = new Map();

function make(key, size, draw) {
  if (cache.has(key)) return cache.get(key);
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  if (!x) return null;
  draw(x, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

/** 确定性伪随机(同一张图每次生成一致,便于回归比对) */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 暖白大理石:底色 + 多层斜向纹理 + 细金脉。
 * @param {number} [size=1024] 贴图边长
 * @returns {THREE.Texture|null}
 */
export function marbleTexture(size = 1024) {
  return make('marble', size, (x, S) => {
    const g = x.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, '#f4ece0');
    g.addColorStop(0.45, '#e8dcc9');
    g.addColorStop(1, '#dccdb6');
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
    const r = rng(20261114);
    // 主纹理:粗而淡的斜向长脉
    // 柔和云斑:先铺一层大尺度明暗,纹理才像石材而不是裂纹
    for (let i = 0; i < 40; i++) {
      const px = r() * S,
        py = r() * S,
        rr = S * (0.06 + r() * 0.16);
      const cg = x.createRadialGradient(px, py, 0, px, py, rr);
      const warm = r() < 0.5;
      cg.addColorStop(0, warm ? 'rgba(255,250,240,0.16)' : 'rgba(196,176,146,0.12)');
      cg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = cg;
      x.beginPath();
      x.arc(px, py, rr, 0, Math.PI * 2);
      x.fill();
    }
    for (let i = 0; i < 14; i++) {
      x.beginPath();
      let px = r() * S,
        py = -40;
      x.moveTo(px, py);
      while (py < S + 40) {
        px += (r() - 0.5) * 120;
        py += 40 + r() * 60;
        x.lineTo(px, py);
      }
      x.strokeStyle = 'rgba(158,136,106,' + (0.03 + r() * 0.05).toFixed(3) + ')';
      x.lineWidth = 1.5 + r() * 5;
      x.stroke();
    }
    // 细金脉:少而亮,给「宫殿」而非「瓷砖」的贵气
    for (let i = 0; i < 9; i++) {
      x.beginPath();
      let px = r() * S,
        py = -30;
      x.moveTo(px, py);
      while (py < S + 30) {
        px += (r() - 0.5) * 90;
        py += 30 + r() * 50;
        x.lineTo(px, py);
      }
      x.strokeStyle = 'rgba(198,160,72,' + (0.14 + r() * 0.16).toFixed(3) + ')';
      x.lineWidth = 0.8 + r() * 1.6;
      x.stroke();
    }
    // 微颗粒:去掉塑料感
    for (let i = 0; i < 5200; i++) {
      const a = 0.02 + r() * 0.05;
      x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,' + a + ')' : 'rgba(120,100,76,' + a + ')';
      x.fillRect(r() * S, r() * S, 1.4, 1.4);
    }
  });
}

/**
 * 地面星罗盘嵌花:大理石底 + 同心金环 + 十二向星芒 + 六颗星色点。
 * 这是「星光宫殿」的身份标记 —— 一眼看出这不是普通展厅。
 * @param {number} [size=1024] 贴图边长
 * @returns {THREE.Texture|null}
 */
export function floorInlayTexture(size = 1024) {
  return make('inlay', size, (x, S) => {
    const C = S / 2;
    const g = x.createRadialGradient(C, C, S * 0.04, C, C, C);
    g.addColorStop(0, '#fbf4e8');
    g.addColorStop(0.55, '#eadcc6');
    g.addColorStop(1, '#d6c4a8');
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
    const r = rng(77031);
    // 大理石细脉(比墙面淡,地面要托住光)
    for (let i = 0; i < 18; i++) {
      x.beginPath();
      let px = r() * S,
        py = -30;
      x.moveTo(px, py);
      while (py < S + 30) {
        px += (r() - 0.5) * 110;
        py += 45 + r() * 55;
        x.lineTo(px, py);
      }
      x.strokeStyle = 'rgba(150,126,96,' + (0.04 + r() * 0.06).toFixed(3) + ')';
      x.lineWidth = 2 + r() * 7;
      x.stroke();
    }
    // 同心金环
    for (const [rr, w, a] of [
      [0.94, 5, 0.5],
      [0.8, 2.5, 0.36],
      [0.5, 3.5, 0.44],
      [0.28, 2, 0.3],
    ]) {
      x.beginPath();
      x.arc(C, C, C * rr, 0, Math.PI * 2);
      x.strokeStyle = 'rgba(198,158,66,' + a + ')';
      x.lineWidth = w;
      x.stroke();
    }
    // 十二向星芒(长短相间,像罗盘)
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const long = i % 2 === 0;
      const r0 = C * (long ? 0.3 : 0.5);
      const r1 = C * (long ? 0.79 : 0.62);
      x.beginPath();
      x.moveTo(C + Math.cos(a) * r0, C + Math.sin(a) * r0);
      x.lineTo(C + Math.cos(a) * r1, C + Math.sin(a) * r1);
      x.strokeStyle = 'rgba(198,158,66,' + (long ? 0.42 : 0.24) + ')';
      x.lineWidth = long ? 3 : 1.6;
      x.stroke();
    }
    // 中心八角星
    x.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      const rr = C * (i % 2 === 0 ? 0.26 : 0.1);
      const px = C + Math.cos(a) * rr,
        py = C + Math.sin(a) * rr;
      i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
    }
    x.closePath();
    const sg = x.createRadialGradient(C, C, 4, C, C, C * 0.26);
    sg.addColorStop(0, 'rgba(255,232,178,0.92)');
    sg.addColorStop(1, 'rgba(206,164,74,0.5)');
    x.fillStyle = sg;
    x.fill();
    x.strokeStyle = 'rgba(180,140,56,0.6)';
    x.lineWidth = 2;
    x.stroke();
    // 六颗星色点(与六星屑同色序)
    const SIX = ['#7ddb7a', '#ff5a4a', '#e8a03c', '#dfeaf5', '#7cc8e8', '#f0a860'];
    SIX.forEach((col, i) => {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const px = C + Math.cos(a) * C * 0.64,
        py = C + Math.sin(a) * C * 0.64;
      const gg = x.createRadialGradient(px, py, 1, px, py, C * 0.055);
      gg.addColorStop(0, col);
      gg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gg;
      x.beginPath();
      x.arc(px, py, C * 0.055, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = col;
      x.beginPath();
      x.arc(px, py, C * 0.017, 0, Math.PI * 2);
      x.fill();
    });
  });
}

/**
 * 穹顶星图:夜蓝底 + 银河带 + 三层星点 + 六颗主星与连线 + 金色刻度环。
 * @param {number} [size=2048] 贴图边长(穹顶最大,值得给足分辨率)
 * @returns {THREE.Texture|null}
 */
export function starDomeTexture(size = 2048) {
  return make('dome', size, (x, S) => {
    const g = x.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, '#0b1226'); // 天顶(v=0 对应球顶)
    g.addColorStop(0.5, '#16204a');
    g.addColorStop(1, '#2a3568'); // 近檐口略亮
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
    const r = rng(6120325);
    // 银河:斜向柔光带 + 密集小星
    x.save();
    x.translate(S * 0.5, S * 0.5);
    x.rotate(-0.42);
    const mg = x.createLinearGradient(0, -S * 0.16, 0, S * 0.16);
    mg.addColorStop(0, 'rgba(120,150,220,0)');
    mg.addColorStop(0.5, 'rgba(150,175,235,0.16)');
    mg.addColorStop(1, 'rgba(120,150,220,0)');
    x.fillStyle = mg;
    x.fillRect(-S, -S * 0.16, S * 2, S * 0.32);
    for (let i = 0; i < 1400; i++) {
      const px = (r() - 0.5) * S * 2;
      const py = (r() - 0.5) * S * 0.26;
      x.fillStyle = 'rgba(226,238,255,' + (0.12 + r() * 0.4).toFixed(3) + ')';
      x.fillRect(px, py, 1.1, 1.1);
    }
    x.restore();
    // 三层星点:暗小 / 中 / 亮大带光晕
    for (let i = 0; i < 1500; i++) {
      const px = r() * S,
        py = r() * S;
      const a = 0.18 + r() * 0.42;
      x.fillStyle = 'rgba(214,230,255,' + a.toFixed(3) + ')';
      x.beginPath();
      x.arc(px, py, 0.6 + r() * 1.1, 0, Math.PI * 2);
      x.fill();
    }
    for (let i = 0; i < 150; i++) {
      const px = r() * S,
        py = r() * S,
        rr = 1.6 + r() * 2.4;
      const gg = x.createRadialGradient(px, py, 0, px, py, rr * 5);
      gg.addColorStop(0, 'rgba(255,255,255,0.95)');
      gg.addColorStop(0.25, 'rgba(210,228,255,0.4)');
      gg.addColorStop(1, 'rgba(180,205,255,0)');
      x.fillStyle = gg;
      x.beginPath();
      x.arc(px, py, rr * 5, 0, Math.PI * 2);
      x.fill();
    }
    // 六颗主星 + 星座连线(呼应六颗星球的旅程)
    const SIX = ['#9dff9a', '#ff8a7a', '#ffc46a', '#f2f8ff', '#a8e0ff', '#ffc98a'];
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      pts.push([
        S * 0.5 + Math.cos(a) * S * (0.2 + (i % 2) * 0.07),
        S * 0.42 + Math.sin(a) * S * (0.16 + (i % 3) * 0.04),
      ]);
    }
    x.strokeStyle = 'rgba(190,214,255,0.26)';
    x.lineWidth = 1.6;
    x.beginPath();
    pts.forEach((p, i) => (i === 0 ? x.moveTo(p[0], p[1]) : x.lineTo(p[0], p[1])));
    x.closePath();
    x.stroke();
    pts.forEach((p, i) => {
      const gg = x.createRadialGradient(p[0], p[1], 0, p[0], p[1], S * 0.035);
      gg.addColorStop(0, '#ffffff');
      gg.addColorStop(0.18, SIX[i]);
      gg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gg;
      x.beginPath();
      x.arc(p[0], p[1], S * 0.035, 0, Math.PI * 2);
      x.fill();
      // 四芒
      x.strokeStyle = 'rgba(255,255,255,0.5)';
      x.lineWidth = 1.2;
      const L = S * 0.022;
      x.beginPath();
      x.moveTo(p[0] - L, p[1]);
      x.lineTo(p[0] + L, p[1]);
      x.moveTo(p[0], p[1] - L);
      x.lineTo(p[0], p[1] + L);
      x.stroke();
    });
    // 檐口金色刻度环(贴图底边 = 穹顶下缘)
    x.strokeStyle = 'rgba(206,168,80,0.5)';
    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(0, S - 10);
    x.lineTo(S, S - 10);
    x.stroke();
    for (let i = 0; i < 72; i++) {
      const px = (i / 72) * S;
      const long = i % 6 === 0;
      x.strokeStyle = 'rgba(206,168,80,' + (long ? 0.55 : 0.3) + ')';
      x.lineWidth = long ? 3 : 1.5;
      x.beginPath();
      x.moveTo(px, S - 10);
      x.lineTo(px, S - (long ? 40 : 24));
      x.stroke();
    }
  });
}

/**
 * 拱窗光面:暖金渐变 + 细棂条,给「光从窗外进来」的读感(自发光,不新增灯)。
 * @returns {THREE.Texture|null}
 */
export function archWindowTexture() {
  return make('arch', 512, (x, S) => {
    const g = x.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, '#fff3d2');
    g.addColorStop(0.4, '#ffdda0');
    g.addColorStop(1, '#e8b878');
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
    // 棂条:竖 3 横 4,深金
    x.strokeStyle = 'rgba(120,88,40,0.5)';
    x.lineWidth = 7;
    for (let i = 1; i < 3; i++) {
      x.beginPath();
      x.moveTo((i / 3) * S, 0);
      x.lineTo((i / 3) * S, S);
      x.stroke();
    }
    for (let i = 1; i < 4; i++) {
      x.beginPath();
      x.moveTo(0, (i / 4) * S);
      x.lineTo(S, (i / 4) * S);
      x.stroke();
    }
  });
}

/**
 * 体积光柱贴图(上亮下透)。
 * @returns {THREE.Texture|null}
 */
export function shaftTexture() {
  return make('shaft', 256, (x, S) => {
    const g = x.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, 'rgba(255,232,180,0.9)');
    g.addColorStop(0.5, 'rgba(255,220,160,0.34)');
    g.addColorStop(1, 'rgba(255,220,160,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
  });
}

/** 供拆场时释放(热重载不泄漏显存) */
export function disposePalaceArt() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
