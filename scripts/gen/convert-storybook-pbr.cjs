// convert-storybook-pbr.cjs — storybook GLB 材质转换(一次性,2026-09-06 主人批准方案 Phase A)
// 输入 models/hall/b612-world/b612-storybook.glb 的 23 个材质全部只用
// KHR_materials_pbrSpecularGlossiness(three r160 不认→贴图全丢→整模型黑块)。
// 本脚本:①specGloss→标准 metalRough(漫反射→baseColor,粗糙度=1-光泽,金属度=0)
//        ②玫瑰网格归位到星球顶(原导出烘焙错位,飘在星球外)
//        ③删除壳外多余星幕板 pPlane585 与出天幕的退化草片
// 输出 models/hall/b612-world/b612-storybook-pbr.glb(BIN chunk 原样保留,贴图不动)
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'models', 'hall', 'b612-world', 'b612-storybook.glb');
const OUT = path.join(__dirname, '..', '..', 'models', 'hall', 'b612-world', 'b612-storybook-pbr.glb');

const buf = fs.readFileSync(SRC);
const jsonLen = buf.readUInt32LE(12);
const binOff = 20 + jsonLen;
const binLen = buf.readUInt32LE(binOff);
const g = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
const bin = buf.slice(binOff + 8, binOff + 8 + binLen);

console.log('generator:', g.asset && g.asset.generator);
console.log('required:', JSON.stringify(g.extensionsRequired));

// accessor 的 min/max 是 xyz 对
const accBox = (ai) => {
  const a = g.accessors[ai];
  return (a && a.min && a.max) ? { min: a.min, max: a.max } : null;
};
const meshBox = (mi) => {
  const m = g.meshes[mi];
  let box = null;
  for (const p of m.primitives) {
    const b = accBox(p.attributes.POSITION);
    if (!b) continue;
    if (!box) box = { min: [...b.min], max: [...b.max] };
    for (let i = 0; i < 3; i++) {
      box.min[i] = Math.min(box.min[i], b.min[i]);
      box.max[i] = Math.max(box.max[i], b.max[i]);
    }
  }
  return box;
};

// ---------- ① 材质转换 ----------
let converted = 0;
for (const m of g.materials) {
  const sg = m.extensions && m.extensions.KHR_materials_pbrSpecularGlossiness;
  if (!sg) continue;
  const pbr = {};
  if (sg.diffuseFactor) pbr.baseColorFactor = sg.diffuseFactor;
  if (sg.diffuseTexture) pbr.baseColorTexture = sg.diffuseTexture;
  pbr.metalnessFactor = 0;
  pbr.roughnessFactor = sg.glossinessFactor !== undefined ? Math.max(0.15, 1 - sg.glossinessFactor) : 0.6;
  m.pbrMetallicRoughness = pbr;
  delete m.extensions.KHR_materials_pbrSpecularGlossiness;
  if (!Object.keys(m.extensions).length) delete m.extensions;
  converted++;
}
g.extensionsRequired = (g.extensionsRequired || []).filter((e) => e !== 'KHR_materials_pbrSpecularGlossiness');
g.extensionsUsed = (g.extensionsUsed || []).filter((e) => e !== 'KHR_materials_pbrSpecularGlossiness');
console.log('materials converted:', converted);

// ---------- ③a 删除壳外星幕板 pPlane585 ----------
const parentOf = new Map();
g.nodes.forEach((n, i) => (n.children || []).forEach((c) => parentOf.set(c, i)));
const removedSet = new Set();
const detach = (i) => {
  if (removedSet.has(i)) return;
  const p = parentOf.get(i);
  if (p !== undefined) {
    g.nodes[p].children = g.nodes[p].children.filter((c) => c !== i);
    removedSet.add(i);
  }
};
let removed = [];
for (const { n, i } of g.nodes.map((n, i) => ({ n, i }))) {
  if (/^pPlane585/.test(n.name || '')) {
    detach(i);
    removed.push(n.name);
  }
}
console.log('removed star-curtain nodes:', removed.join(','));

// ---------- ③b 删除出天幕的退化网格(按节点变换后的世界坐标,整体在 ±23 壳外才算) ----------
let degen = [];
for (let i = 0; i < g.nodes.length; i++) {
  const n = g.nodes[i];
  if (n.mesh === undefined || removedSet.has(i)) continue;
  const box = meshBox(n.mesh);
  if (!box) continue;
  const s = n.scale ? Math.max(...n.scale.map(Math.abs)) : 1;
  const t = n.translation || [0, 0, 0];
  const c = box.min.map((v, k) => ((v + box.max[k]) / 2) * s + t[k]);
  const half = (Math.max(...box.min.map(Math.abs), ...box.max.map(Math.abs)) || 0) * s;
  // 某一轴上整体明显在壳外(壳 ±22.42)→ 不可见垃圾
  if (Math.abs(c[0]) - half > 23 || Math.abs(c[1]) - half > 23 || Math.abs(c[2]) - half > 23) {
    detach(i);
    degen.push((g.meshes[n.mesh].name || '?') + '@' + c.map((v) => +v.toFixed(0)));
  }
}
console.log('removed degenerate out-of-dome meshes:', degen.length, degen.slice(0, 6).join(' ; '));

// ---------- ② 玫瑰归位:mesh 名 Rosss* 的节点 → 星球顶空节点位置(1.231,0.631,-0.780) s=0.1233 ----------
const ROSE_TARGET = [1.231, 0.631, -0.78];
const ROSE_SCALE = 0.1233;
let roseFixed = [];
for (const { n } of g.nodes.map((n, i) => ({ n, i }))) {
  if (n.mesh === undefined) continue;
  const name = (g.meshes[n.mesh].name || '') + '|' + (n.name || '');
  if (!/Rosss/i.test(name)) continue;
  const box = meshBox(n.mesh);
  if (!box) continue;
  const c = box.min.map((v, i) => (v + box.max[i]) / 2);
  n.scale = [ROSE_SCALE, ROSE_SCALE, ROSE_SCALE];
  n.translation = ROSE_TARGET.map((v, i) => +(v - c[i] * ROSE_SCALE).toFixed(4));
  roseFixed.push((g.meshes[n.mesh].name || '?') + ' t=' + JSON.stringify(n.translation));
}
console.log('rose re-anchored:', roseFixed.join(' ; ') || '(none found!)');

// ---------- 复查全局包围盒(沿父链累积缩放/平移;有旋转的链跳过并计数) ----------
const chainXf = (i) => {
  // 自上而下累积 s/t;链上任一环有旋转则不可靠,返回 null
  const chain = [];
  for (let cur = i; cur !== undefined; cur = parentOf.get(cur)) chain.push(cur);
  let s = 1, t = [0, 0, 0];
  for (let k = chain.length - 1; k >= 0; k--) {
    const n = g.nodes[chain[k]];
    if (n.rotation) return null;
    t = t.map((v, q) => v * (n.scale ? n.scale[q] : 1) + (n.translation ? n.translation[q] : 0));
    s *= n.scale ? Math.abs(n.scale[0]) : 1;
  }
  return { s, t };
};
let all = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
let skipped = 0;
for (let i = 0; i < g.nodes.length; i++) {
  const n = g.nodes[i];
  if (n.mesh === undefined || removedSet.has(i)) continue;
  const box = meshBox(n.mesh);
  if (!box) continue;
  const xf = chainXf(i);
  if (!xf) { skipped++; continue; }
  for (const px of [box.min, box.max]) {
    for (let k = 0; k < 3; k++) {
      const v = px[k] * xf.s + xf.t[k];
      all.min[k] = Math.min(all.min[k], v);
      all.max[k] = Math.max(all.max[k], v);
    }
  }
}
console.log('final bbox min:', all.min.map((v) => +v.toFixed(2)), 'max:', all.max.map((v) => +v.toFixed(2)), '(rot 链跳过 ' + skipped + ' 个)');

// ---------- 打包 GLB(JSON/BIN 各补齐 4 字节) ----------
let js = Buffer.from(JSON.stringify(g), 'utf8');
const padJ = (4 - (js.length % 4)) % 4;
if (padJ) js = Buffer.concat([js, Buffer.alloc(padJ, 0x20)]);
let binP = bin;
const padB = (4 - (binP.length % 4)) % 4;
if (padB) binP = Buffer.concat([binP, Buffer.alloc(padB, 0)]);
const total = 12 + 8 + js.length + 8 + binP.length;
const out = Buffer.alloc(total);
out.write('glTF', 0, 'ascii');
out.writeUInt32LE(2, 4);
out.writeUInt32LE(total, 8);
out.writeUInt32LE(js.length, 12);
out.write('JSON', 16, 'ascii');
js.copy(out, 20);
out.writeUInt32LE(binP.length, 20 + js.length);
out.write('BIN\0', 24 + js.length, 'ascii');
binP.copy(out, 28 + js.length);
fs.writeFileSync(OUT, out);
console.log('written:', path.basename(OUT), (out.length / 1024 / 1024).toFixed(1) + 'MB');
