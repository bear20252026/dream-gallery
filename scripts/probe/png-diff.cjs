// png-diff.cjs — 极简 PNG 解码 + 归一化块签名对比(截图回归探针共用,零外部依赖)
// decodePng:支持 8bit RGB/RGBA 非隔行(Playwright 截图即此格式)
// blockSignature:裁剪到给定区域 → 网格化 → 每块平均亮度 → 全局标准化(减均值除方差)
//                ——全局光照变化(昼夜/曝光)被抵消,构图变化(缺建筑/缺门/换世界)保留
// compare:返回 changedRatio(超阈块占比)与 maxDelta,调用方定阈值
const zlib = require('zlib');

function decodePng(buf) {
  let off = 8,
    w = 0,
    h = 0,
    depth = 8,
    colorType = 6;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  if (depth !== 8 || (colorType !== 6 && colorType !== 2))
    throw new Error('png-diff: 仅支持 8bit RGB/RGBA PNG,收到 colorType=' + colorType);
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const px = Buffer.alloc(h * stride);
  const paeth = (a, b, c) => {
    const p = a + b - c,
      pa = Math.abs(p - a),
      pb = Math.abs(p - b),
      pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[pos++];
    const row = raw.subarray(pos, pos + stride);
    pos += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
      let v = row[x];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) v += paeth(a, b, c);
      px[y * stride + x] = v & 255;
    }
  }
  return { w, h, px, bpp };
}

// 平均亮度(整帧):mean/max,用于"非黑屏/非白屏"粗断言
function brightness(buf, sample = 7) {
  const { px, bpp } = decodePng(buf);
  let sum = 0,
    mx = 0,
    n = 0;
  for (let i = 0; i < px.length; i += bpp * sample) {
    const lum = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
    sum += lum;
    if (lum > mx) mx = lum;
    n++;
  }
  return { mean: +(sum / n).toFixed(1), max: +mx.toFixed(0) };
}

// 归一化块签名。crop={x0,y0,x1,y1} 为比例(0..1);grid={gx,gy} 块数
function blockSignature(buf, crop, grid) {
  const { w, h, px, bpp } = decodePng(buf);
  const X0 = Math.floor(crop.x0 * w),
    X1 = Math.floor(crop.x1 * w);
  const Y0 = Math.floor(crop.y0 * h),
    Y1 = Math.floor(crop.y1 * h);
  const cw = Math.max(1, Math.floor((X1 - X0) / grid.gx));
  const ch = Math.max(1, Math.floor((Y1 - Y0) / grid.gy));
  const sig = new Float32Array(grid.gx * grid.gy);
  for (let gy = 0; gy < grid.gy; gy++) {
    for (let gx = 0; gx < grid.gx; gx++) {
      let sum = 0,
        n = 0;
      const ys = Y0 + gy * ch,
        xs = X0 + gx * cw;
      for (let y = ys; y < Math.min(ys + ch, Y1); y += 2) {
        for (let x = xs; x < Math.min(xs + cw, X1); x += 2) {
          const i = (y * w + x) * bpp;
          sum += (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
          n++;
        }
      }
      sig[gy * grid.gx + gx] = n ? sum / n : 0;
    }
  }
  // 全局标准化:抵消昼夜/曝光的整体明暗漂移
  let mean = 0;
  for (const v of sig) mean += v;
  mean /= sig.length;
  let vari = 0;
  for (const v of sig) vari += (v - mean) * (v - mean);
  const std = Math.sqrt(vari / sig.length) || 1;
  for (let i = 0; i < sig.length; i++) sig[i] = (sig[i] - mean) / std;
  return sig;
}

// 对比:返回超阈块占比与最大偏差
function compare(sigA, sigB, blockDelta = 0.3) {
  const n = Math.min(sigA.length, sigB.length);
  let changed = 0,
    maxDelta = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(sigA[i] - sigB[i]);
    if (d > blockDelta) changed++;
    if (d > maxDelta) maxDelta = d;
  }
  return { changedRatio: +(changed / n).toFixed(4), maxDelta: +maxDelta.toFixed(3) };
}

module.exports = { decodePng, brightness, blockSignature, compare };
