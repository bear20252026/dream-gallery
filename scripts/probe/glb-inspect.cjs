// glb-inspect.cjs — 快速体检 GLB:节点树/网格尺寸/贴图清单(不读顶点,避开压缩 accessor)
const fs = require('fs');
const f = process.argv[2];
if (!f) { console.error('用法: node glb-inspect.cjs <glb>'); process.exit(1); }
const buf = fs.readFileSync(f);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;
const binLen = buf.readUInt32LE(20 + jsonLen + 4);
console.log('文件:', f, (buf.length / 1048576).toFixed(1) + 'MB');
console.log('meshes=%d nodes=%d materials=%d images=%d textures=%d animations=%d',
  (json.meshes || []).length, (json.nodes || []).length, (json.materials || []).length,
  (json.images || []).length, (json.textures || []).length, (json.animations || []).length);
// 贴图体积
let texBytes = 0;
(json.images || []).forEach((im, i) => {
  const bv = json.bufferViews[(im.bufferView !== undefined ? im.bufferView : 0)];
  const n = bv ? bv.byteLength : 0;
  texBytes += n;
  if (i < 20) console.log('  img', i, im.mimeType || '?', (n / 1048576).toFixed(2) + 'MB', im.name || '');
});
console.log('贴图合计:', (texBytes / 1048576).toFixed(1) + 'MB / 文件', (buf.length / 1048576).toFixed(1) + 'MB');
// 网格尺寸(POSITION accessor min/max)
const acc = json.accessors || [];
(json.meshes || []).slice(0, 30).forEach((m, i) => {
  const pr = (m.primitives || [])[0] || {};
  const a = acc[pr.attributes && pr.attributes.POSITION];
  const mn = a && a.min, mx = a && a.max;
  const sz = mn && mx ? mx.map((v, k) => +(v - mn[k]).toFixed(2)) : null;
  console.log('  mesh', i, m.name || '(no-name)', 'tris≈' + (a ? Math.round(a.count / 3) : '?'), 'size', sz ? sz.join('x') : '?');
});
// 节点树(前 40 个,name 有效者)
const nodes = json.nodes || [];
nodes.slice(0, 60).forEach((n, i) => {
  if (!n.name) return;
  console.log('  node', i, JSON.stringify(n.name), n.mesh !== undefined ? 'mesh#' + n.mesh : '', n.children ? 'kids=' + n.children.length : '');
});
