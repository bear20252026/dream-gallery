// 解剖 wedding-arch.glb:列出材质透明度 + 每个网格名/材质/包围盒,用于区分"实心可碰撞"与"玻璃可穿过"
const fs = require('fs');
const path = require('path');
const p = path.resolve(__dirname, '../../models/hall/wedding-arch.glb');
const buf = fs.readFileSync(p);
// header: magic(4) version(4) length(4)
let off = 12,
  json = null,
  bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off);
  const type = buf.readUInt32LE(off + 4);
  const data = buf.slice(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
  else if (type === 0x004e4942) bin = data;
  off += 8 + len + ((4 - (len % 4)) % 4);
}
const mats = json.materials || [];
console.log('=== MATERIALS (' + mats.length + ') ===');
mats.forEach((m, i) => {
  const pbr = m.pbrMetallicRoughness || {};
  const bf = pbr.baseColorFactor;
  console.log(
    `  [${i}] ${m.name} | alphaMode=${m.alphaMode || 'OPAQUE'} alphaCutoff=${m.alphaCutoff ?? '-'} ` +
      `baseColor=${bf ? bf.map((n) => n.toFixed(2)).join(',') : '-'} ` +
      `tex=${pbr.baseColorTexture ? pbr.baseColorTexture.index : '-'} ` +
      `doubleSided=${m.doubleSided === true} unlit=${!!m.extensions?.KHR_materials_unlit}`
  );
});

// 每个 mesh primitive: name / material / accessor min-max (世界局部坐标,未含 node 变换)
function accMinMax(ai) {
  const a = json.accessors[ai];
  return a && a.min && a.max ? { min: a.min, max: a.max } : null;
}
const rows = [];
(json.meshes || []).forEach((mesh, mi) => {
  (mesh.primitives || []).forEach((prim, pi) => {
    const mm = accMinMax(prim.attributes.POSITION);
    rows.push({
      mesh: mesh.name || 'mesh' + mi,
      mat: prim.material,
      matName: mats[prim.material]?.name ?? '?',
      verts: json.accessors[prim.attributes.POSITION].count,
      mm,
    });
  });
});
console.log('=== PRIMITIVES (' + rows.length + ') ===');
const byNameMat = new Map();
for (const r of rows) {
  const key = r.mesh + ' || ' + r.matName;
  if (!byNameMat.has(key)) byNameMat.set(key, { n: 0, verts: 0, mat: r.mat, size: [0, 0, 0] });
  const e = byNameMat.get(key);
  e.n++;
  e.verts += r.verts;
  if (r.mm) {
    const s = [r.mm.max[0] - r.mm.min[0], r.mm.max[1] - r.mm.min[1], r.mm.max[2] - r.mm.min[2]];
    for (let i = 0; i < 3; i++) e.size[i] = Math.max(e.size[i], s[i]);
  }
}
[...byNameMat.entries()]
  .sort((a, b) => b[1].n - a[1].n)
  .forEach(([k, v]) => {
    console.log(
      `  ${k} | x${v.n} | ${v.verts} verts | maxSize=${v.size.map((n) => n.toFixed(2)).join(' x ')} | matIdx=${v.mat}`
    );
  });
