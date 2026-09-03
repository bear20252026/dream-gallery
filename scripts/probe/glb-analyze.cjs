// glb-analyze.cjs — 分析 GLB 模型的水平方向性(有没有"正面")
// 用法: node glb-analyze.cjs <模型绝对路径> [扇区数]
// 正确支持: ① interleaved bufferView(byteStride) ② node TRS 层级变换累积
// 输出: 每个扇区的 顶点数 / 最远半径 / 平均高度 / 最高点,以及极差比
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
const NSEC = parseInt(process.argv[3] || '12', 10);
if (!file) { console.error('用法: node glb-analyze.cjs <glb路径> [扇区数]'); process.exit(1); }

const buf = fs.readFileSync(file);
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('不是 GLB');
let off = 12, json = null, binStart = -1, binLen = 0;
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
  const body = off + 8;
  if (type === 0x4e4f534a) json = JSON.parse(buf.slice(body, body + len).toString('utf8'));
  else if (type === 0x004e4942) { binStart = body; binLen = len; }
  off = body + len + ((4 - (len % 4)) % 4);
  if (json && binStart >= 0) break;
}
console.log(`文件: ${path.basename(file)}  (${(buf.length / 1048576).toFixed(2)} MB)`);
console.log(`BIN chunk: offset=${binStart} len=${binLen}`);
console.log(`meshes=${(json.meshes || []).length}  nodes=${(json.nodes || []).length}  materials=${(json.materials || []).length}`);

const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const SZ = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

// ---- 读取 accessor(支持 interleaved) ----
function rd(acc) {
  const vs = json.bufferViews[acc.bufferView];
  const comp = NCOMP[acc.type];
  const esz = SZ[acc.componentType];
  const stride = vs.byteStride || comp * esz;   // 交错时用 stride 跳顶点
  const base = binStart + (vs.byteOffset || 0) + (acc.byteOffset || 0);
  const n = acc.count, out = new Float64Array(n * comp);
  for (let i = 0; i < n; i++) {
    const p = base + i * stride;
    for (let c = 0; c < comp; c++) {
      const q = p + c * esz;
      if (q + esz > buf.length) throw new Error(`读越界 @acc${json.accessors.indexOf(acc)} i=${i}`);
      out[i * comp + c] =
        acc.componentType === 5126 ? buf.readFloatLE(q) :
        acc.componentType === 5125 ? buf.readUInt32LE(q) :
        acc.componentType === 5123 ? buf.readUInt16LE(q) :
        acc.componentType === 5122 ? buf.readInt16LE(q) :
        acc.componentType === 5121 ? buf.readUInt8(q) :
        buf.readInt8(q);
    }
  }
  return out;
}

// ---- 4x4 矩阵(列主序,three.js 同) ----
function ident() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
function mul(a, b) { // a*b
  const o = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
    o[i * 4 + j] = s;
  }
  return o;
}
function fromTRS(t, r, s) {
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const sx = s[0], sy = s[1], sz = s[2];
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    t[0], t[1], t[2], 1,
  ];
}
function apply(m, v) {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
  ];
}

// ---- 遍历节点树,把所有顶点变换到 root 空间 ----
const all = [];  // {x,y,z}
let totalVerts = 0;
function walk(nodeIdx, parent) {
  const nd = json.nodes[nodeIdx];
  let m = parent;
  if (nd.matrix) m = mul(parent, nd.matrix);
  else m = mul(parent, fromTRS(nd.translation || [0,0,0], nd.rotation || [0,0,0,1], nd.scale || [1,1,1]));
  if (nd.mesh !== undefined) {
    const mesh = json.meshes[nd.mesh];
    for (const prim of mesh.primitives) {
      if (prim.attributes === undefined) continue;
      const pa = prim.attributes.POSITION;
      if (pa === undefined) continue;
      const pos = rd(json.accessors[pa]);
      totalVerts += pos.length / 3;
      for (let i = 0; i < pos.length; i += 3) {
        const w = apply(m, [pos[i], pos[i+1], pos[i+2]]);
        all.push(w);
      }
    }
  }
  for (const c of nd.children || []) walk(c, m);
}
const roots = (json.scenes && json.scenes[json.scene || 0].nodes) || [0];
for (const r of roots) walk(r, ident());

if (!all.length) throw new Error('没有读到任何顶点');
let mnX = 1e9, mxX = -1e9, mnY = 1e9, mxY = -1e9, mnZ = 1e9, mxZ = -1e9;
for (const p of all) {
  if (p[0] < mnX) mnX = p[0]; if (p[0] > mxX) mxX = p[0];
  if (p[1] < mnY) mnY = p[1]; if (p[1] > mxY) mxY = p[1];
  if (p[2] < mnZ) mnZ = p[2]; if (p[2] > mxZ) mxZ = p[2];
}
const cx = (mnX + mxX) / 2, cz = (mnZ + mxZ) / 2;
console.log(`\n顶点总数: ${totalVerts.toLocaleString()}`);
console.log(`世界包围盒: X ${mnX.toFixed(2)} ~ ${mxX.toFixed(2)} (宽 ${(mxX-mnX).toFixed(2)})`);
console.log(`            Y ${mnY.toFixed(2)} ~ ${mxY.toFixed(2)} (高 ${(mxY-mnY).toFixed(2)})`);
console.log(`            Z ${mnZ.toFixed(2)} ~ ${mxZ.toFixed(2)} (深 ${(mxZ-mnZ).toFixed(2)})`);
console.log(`水平直径 ≈ ${Math.max(mxX-mnX, mxZ-mnZ).toFixed(2)} m`);

// ---- 扇区统计 ----
const secs = Array.from({ length: NSEC }, () => ({ n: 0, sumR: 0, maxR: 0, sumY: 0, maxY: -1e9, sumHi: 0, maxHi: -1e9 }));
for (const p of all) {
  const dx = p[0] - cx, dz = p[2] - cz;
  const r = Math.hypot(dx, dz);
  if (r < 1e-6) continue;
  // 角度: 0 = +Z(南,three.js 默认正面方向), 顺时针(俯视看 +X 为东)
  let a = Math.atan2(dx, dz);             // -π..π, 0=+Z
  if (a < 0) a += Math.PI * 2;
  const si = Math.min(NSEC - 1, Math.floor(a / (Math.PI * 2 / NSEC)));
  const s = secs[si];
  const h = p[1] - mnY;                    // 相对底部的高度
  s.n++; s.sumR += r; if (r > s.maxR) s.maxR = r;
  s.sumY += p[1]; if (p[1] > s.maxY) s.maxY = p[1];
  s.sumHi += h; if (h > s.maxHi) s.maxHi = h;
}
const STEP = 360 / NSEC;
console.log(`\n=== 水平 ${NSEC} 扇区方向性分析(每 ${STEP}°) ===`);
console.log(`角度基准: 0°=+Z(南/朝向建筑一侧), 90°=+X(东), 180°=-Z(北), 270°=-X(西)`);
console.log(`高度基准: Y 已减去最低点 ${mnY.toFixed(2)},即"离地高度"\n`);
console.log('扇区'.padEnd(6) + '角度'.padEnd(10) + '顶点数'.padEnd(10) + '最远半径'.padEnd(10) + '平均高'.padEnd(10) + '最高点');
for (let i = 0; i < NSEC; i++) {
  const s = secs[i];
  if (!s.n) { console.log(`${String(i).padEnd(6)}${(i*STEP).toFixed(0).padStart(3)}°`.padEnd(16) + '(空)'); continue; }
  console.log(
    String(i).padEnd(6) +
    `${(i*STEP).toFixed(0).padStart(3)}°`.padEnd(10) +
    s.n.toString().padEnd(10) +
    s.maxR.toFixed(2).padEnd(10) +
    (s.sumHi / s.n).toFixed(2).padEnd(10) +
    s.maxHi.toFixed(2)
  );
}
function ratio(get) {
  const v = secs.map(get).filter(x => x > 0);
  return Math.max(...v) / Math.max(1e-9, Math.min(...v));
}
const rN = ratio(s => s.n), rR = ratio(s => s.maxR), rH = ratio(s => s.maxHi), rA = ratio(s => s.sumHi / Math.max(1, s.n));
console.log(`\n极差比(最大/最小,1.0=完全轴对称):`);
console.log(`  顶点数   ${rN.toFixed(2)}x`);
console.log(`  最远半径 ${rR.toFixed(2)}x`);
console.log(`  最高点   ${rH.toFixed(2)}x`);
console.log(`  平均高   ${rA.toFixed(2)}x`);
const SYM = 1.6;
const verdict = (rN < SYM && rR < SYM && rH < SYM) ? '近似轴对称 → 朝向无所谓' : '存在明显方向性 → 需要定向';
console.log(`\n判定: ${verdict}`);

// ---- 第二遍:只看「上部结构」(高于池沿),决定视觉正面的是雕塑不是水池 ----
const HMIN = process.argv[4] !== undefined ? parseFloat(process.argv[4]) : (mnY + (mxY - mnY) * 0.45);
{
  const S = Array.from({ length: NSEC }, () => ({ n: 0, maxHi: -1e9, maxR: 0 }));
  for (const p of all) {
    const h = p[1] - mnY;
    if (h < HMIN - mnY) continue;
    const dx = p[0] - cx, dz = p[2] - cz;
    const r = Math.hypot(dx, dz);
    if (r < 1e-6) continue;
    let a = Math.atan2(dx, dz); if (a < 0) a += Math.PI * 2;
    const s = S[Math.min(NSEC - 1, Math.floor(a / (Math.PI * 2 / NSEC)))];
    s.n++; if (h > s.maxHi) s.maxHi = h; if (r > s.maxR) s.maxR = r;
  }
  const tot = S.reduce((a, s) => a + s.n, 0);
  const list = S.map((s, i) => ({ i, n: s.n, hi: s.maxHi, r: s.maxR }));
  const ns = list.map(o => o.n).filter(x => x > 0);
  const rN2 = ns.length ? Math.max(...ns) / Math.max(1, Math.min(...ns)) : Infinity;
  console.log(`\n=== 上部结构分析(只看离地 > ${(HMIN - mnY).toFixed(2)} m 的顶点,共 ${tot.toLocaleString()} 个) ===`);
  console.log('扇区'.padEnd(6) + '角度'.padEnd(10) + '顶点数'.padEnd(10) + '占比'.padEnd(10) + '最高'.padEnd(8) + '最远半径');
  for (const o of list) {
    const pct = tot ? (o.n / tot * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 2));
    console.log(String(o.i).padEnd(6) + `${(o.i*STEP).toFixed(0).padStart(3)}°`.padEnd(10) +
      String(o.n).padEnd(10) + `${pct.toFixed(1)}%`.padEnd(10) + o.hi.toFixed(2).padEnd(8) + o.r.toFixed(2) + ' ' + bar);
  }
  console.log(`上部顶点数极差比: ${rN2.toFixed(2)}x  ${rN2 < 2 ? '(较均匀 → 无明显正面)' : '(明显集中 → 有正面)'}`);
  const top = [...list].sort((a, b) => b.n - a.n).slice(0, 3);
  console.log(`细节最密集扇区: ${top.map(o => `${(o.i*STEP).toFixed(0)}°(${o.n})`).join(', ')}`);
  const tall = [...list].sort((a, b) => b.hi - a.hi).slice(0, 3);
  console.log(`最高结构扇区:   ${tall.map(o => `${(o.i*STEP).toFixed(0)}°(${o.hi.toFixed(2)}m)`).join(', ')}`);
}

if (!(rN < SYM && rR < SYM && rH < SYM)) {
  const byN = secs.map((s, i) => ({ i, n: s.n })).sort((a, b) => b.n - a.n);
  console.log(`\n顶点最密的 3 个扇区(可能"正面"细节集中处): ${byN.slice(0, 3).map(o => `${(o.i*STEP).toFixed(0)}°`).join(', ')}`);
  const byH = secs.map((s, i) => ({ i, h: s.maxHi })).sort((a, b) => b.h - a.h);
  console.log(`最高结构所在扇区: ${byH.slice(0, 3).map(o => `${(o.i*STEP).toFixed(0)}°`).join(', ')}`);
}
