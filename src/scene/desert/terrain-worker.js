// terrain-worker.js — 沙漠地形计算 Web Worker(2026-08-22 大厂标准)
// 将地形高度计算从主线程卸载到 Worker
// 用法: const worker = new Worker(new URL('./terrain-worker.js', import.meta.url), { type: 'module' })

const KX = 800,
  KZ = 600,
  KR = 200;

function protectMask(x, z) {
  function rectDist(x, z, x0, x1, z0, z1) {
    const dx = Math.max(x0 - x, 0, x - x1),
      dz = Math.max(z0 - z, 0, z - z1);
    return Math.hypot(dx, dz);
  }
  function padF(d, flatR, blendR) {
    if (d < flatR) return 0;
    if (d > flatR + blendR) return 1;
    const t = (d - flatR) / blendR;
    return t * t * (3 - 2 * t);
  }
  let m = 1;
  m = Math.min(m, padF(rectDist(x, z, -19, 19, -13, 29), 10, 25));
  m = Math.min(m, padF(rectDist(x, z, -8, 8, 36, 52), 6, 14));
  m = Math.min(m, padF(Math.hypot(x - 39, z - 14), 8, 10));
  m = Math.min(m, padF(rectDist(x, z, -86, 86, 97, 103), 0, 10));
  m = Math.min(m, padF(rectDist(x, z, -32, 33, -103, -97), 0, 10));
  // 2026-08-31:大堂/房间保护区(与主线程 terrain.js 保持一致,否则 worker 计算
  // 的高度图与主线程不同步,玩家脚底高度跳变)。
  m = Math.min(m, padF(rectDist(x, z, -200, -80, -207, -173), 0, 5));
  m = Math.min(m, padF(rectDist(x, z, -101, -89, -311, -289), 0, 5));
  m = Math.min(m, padF(rectDist(x, z, -238, -222, -306, -294), 0, 5));
  return m;
}

function computeHeight(x, z) {
  let y = 0.5;
  y += Math.sin(x * 0.006) * Math.cos(z * 0.006) * 4;
  y += Math.sin(x * 0.012 + 1.5) * Math.cos(z * 0.01 + 2.0) * 3;
  const plateau = Math.sin(x * 0.008 + 3) * Math.cos(z * 0.007 + 1);
  if (plateau > 0.4) y += (plateau - 0.4) * 15;
  const dune = Math.sin(x * 0.025 + 5) * Math.cos(z * 0.02 + 3);
  if (dune > 0.1) y += Math.pow(dune - 0.1, 1.5) * 8;
  const yardang = Math.sin(x * 0.035 + 8) * Math.cos(z * 0.028 + 6);
  if (yardang > 0.65) y += (yardang - 0.65) * 25;
  const salt = Math.sin(x * 0.015 + 2) * Math.cos(z * 0.012 + 4);
  if (salt > 0.5) y = y * 0.3 - 3;
  const oasis = Math.sin(x * 0.018 + 7) * Math.cos(z * 0.016 + 9);
  if (oasis > 0.75 && y < 2) y -= 1.5;
  const kx = x - KX,
    kz = z - KZ,
    kd = Math.sqrt(kx * kx + kz * kz);
  if (kd < KR) {
    const ka = Math.atan2(kz, kx);
    const kdE = Math.max(kd, 14);
    const t = Math.max(0, 1 - kdE / KR);
    let m = Math.pow(t, 1.2) * 110;
    let spiral = 0;
    for (let arm = 0; arm < 3; arm++) {
      const aa = ka + (arm * Math.PI * 2) / 3;
      const r = Math.sin(aa * 4 + kd * 0.06);
      if (r > 0.3) spiral += (r - 0.3) * t * 18;
    }
    let fold =
      Math.sin(kx * 0.04 + kz * 0.03) * t * 6 + Math.sin(kx * 0.08) * Math.cos(kz * 0.08) * t * 3;
    const calm = Math.min(1, kd / 26);
    spiral *= calm * calm;
    fold *= calm * calm;
    let peak = 0;
    if (kd < 26) {
      const tt = Math.max(0, (kd - 14) / 12);
      peak = 25 * (1 - tt * tt * (3 - 2 * tt));
    }
    const blend = Math.max(0, 1 - kd / (KR + 20));
    y = y * (1 - blend * 0.85) + (m + spiral + fold + peak) * blend;
  }
  return y;
}

function getHeight(x, z) {
  const m = protectMask(x, z);
  let h = computeHeight(x, z) * m - 0.05 * (1 - m);
  if (h < -2.2 && rectDistSimple(x, z, -19, 19, -13, 29) < 150) h = -2.2;
  return h;
}

function rectDistSimple(x, z, x0, x1, z0, z1) {
  const dx = Math.max(x0 - x, 0, x - x1),
    dz = Math.max(z0 - z, 0, z - z1);
  return Math.hypot(dx, dz);
}

// Worker 消息处理
self.onmessage = function (e) {
  const { type, data } = e.data;

  if (type === 'heightmap') {
    // 批量计算高度图: { x0, z0, x1, z1, step }
    const { x0, z0, x1, z1, step = 1 } = data;
    const cols = Math.ceil((x1 - x0) / step) + 1;
    const rows = Math.ceil((z1 - z0) / step) + 1;
    const heights = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        heights[r * cols + c] = getHeight(x0 + c * step, z0 + r * step);
      }
    }
    self.postMessage({ type: 'heightmap', data: { heights, cols, rows, step, x0, z0 } });
  }

  if (type === 'height') {
    // 单点查询
    const { x, z } = data;
    self.postMessage({ type: 'height', data: { x, z, h: getHeight(x, z) } });
  }
};
