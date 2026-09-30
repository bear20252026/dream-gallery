// glb-group-sizes.cjs — 逐组量 GLB 道具世界尺寸(TRS 矩阵累积,正确处理嵌套 scale)
const fs = require('fs');
const f = process.argv[2];
const b = fs.readFileSync(f);
const jl = b.readUInt32LE(12);
const j = JSON.parse(b.slice(20, 20 + jl).toString('utf8'));
const nodes = j.nodes || [], acc = j.accessors || [], meshes = j.meshes || [];
const Q = (q) => { // 四元数→旋转矩阵(列主序)
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
};
function localMatrix(n) {
  const q = n.rotation || [0, 0, 0, 1];
  const R = Q(q);
  const s = n.scale || [1, 1, 1];
  const t = n.translation || [0, 0, 0];
  const M = [];
  for (let c = 0; c < 3; c++)
    for (let r = 0; r < 3; r++) M[c * 3 + r] = R[c * 3 + r] * s[c];
  M[9] = t[0]; M[10] = t[1]; M[11] = t[2];
  return M; // 列主序 4x4(省略 [0,0,0,1] 行)
}
function mul(A, B) { // A·B
  const M = new Array(12).fill(0);
  for (let c = 0; c < 3; c++)
    for (let r = 0; r < 3; r++) {
      let v = 0;
      for (let k = 0; k < 3; k++) v += A[k * 3 + r] * B[c * 3 + k];
      M[c * 3 + r] = v;
    }
  for (let r = 0; r < 3; r++) M[9 + r] = A[9 + r] + A[r] * B[9] + A[3 + r] * B[10] + A[6 + r] * B[11];
  return M;
}
function xform(M, p) {
  return [
    M[0] * p[0] + M[3] * p[1] + M[6] * p[2] + M[9],
    M[1] * p[0] + M[4] * p[1] + M[7] * p[2] + M[10],
    M[2] * p[0] + M[5] * p[1] + M[8] * p[2] + M[11],
  ];
}
const root = nodes.findIndex((n) => n.name === 'RootNode');
if (root < 0) { console.error('RootNode 未找到'); process.exit(1); }
const S = 0.01;
(nodes[root].children || []).forEach((ci) => {
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  (function walk(ni, pm) {
    const n = nodes[ni];
    const M = mul(pm, localMatrix(n));
    if (n.mesh !== undefined) {
      (meshes[n.mesh].primitives || []).forEach((pr) => {
        const a = acc[pr.attributes.POSITION];
        if (!a || !a.min) return;
        for (const px of [a.min, a.max])
          for (const py of [a.min, a.max])
            for (const pz of [a.min, a.max]) {
              const w = xform(M, [px[0], py[1], pz[2]]);
              for (let k = 0; k < 3; k++) {
                mn[k] = Math.min(mn[k], w[k]);
                mx[k] = Math.max(mx[k], w[k]);
              }
            }
      });
    }
    (n.children || []).forEach((c) => walk(c, M));
  })(ci, [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
  const sz = mx.map((v, k) => (((v - mn[k]) * S)).toFixed(2));
  const ctr = mn.map((v, k) => ((((v + mx[k]) / 2) * S)).toFixed(2));
  console.log((nodes[ci].name || '?').replace('BW BLBS ', '').replace('BW CDS ', ''),
    'size(m)', sz.join('x'), 'center(m)', ctr.join(','));
});
