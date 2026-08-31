// strip-hall-deco.mjs — 移除大堂里"水平延展遮挡视线"的装饰浮雕条带,保留主体结构
// 思路:Deco_Metal 系列是 Z-up 模型的水平吊顶装饰,不旋转加载时它们在玩家水平方向像"石头带"挡视线。
// 重要:重新索引 mesh 后必须更新 node.mesh 引用,否则 GLTFLoader 报错
import fs from 'fs';
const [,, inPath, outPath] = process.argv;
const buf = fs.readFileSync(inPath);
const jl = buf.readUInt32LE(12);
const jsonBuf = buf.slice(20, 20 + jl);
const binLen = buf.readUInt32LE(20 + jl);
const binBuf = buf.slice(20 + jl + 8, 20 + jl + 8 + binLen);
const j = JSON.parse(jsonBuf.toString('utf8'));
const KEEP_PREFIXES = ['Murs_', 'Mur_Int', 'sol', 'vitres', 'metal_ext'];
const newIndex = new Map(); // oldIdx -> newIdx
const newMeshes = [];
(j.meshes || []).forEach((m, oldIdx) => {
  if (KEEP_PREFIXES.some(p => (m.name || '').startsWith(p))) {
    newIndex.set(oldIdx, newMeshes.length);
    newMeshes.push(m);
  } else {
    console.log('drop mesh', oldIdx, m.name);
  }
});
j.meshes = newMeshes;
// 修所有 node.mesh 引用
let nodeRefs = 0;
for (const n of j.nodes || []) {
  if (n.mesh !== undefined && newIndex.has(n.mesh)) {
    n.mesh = newIndex.get(n.mesh);
    nodeRefs++;
  } else if (n.mesh !== undefined) {
    delete n.mesh;
  }
}
console.log(`修复 node.mesh 引用 ${nodeRefs} 处`);
const newJson = JSON.stringify(j);
const align = (n) => (4 - (n % 4)) % 4;
const jp = align(newJson.length);
const np = newJson + ' '.repeat(jp);
const bp = align(binBuf.length);
const nb = Buffer.concat([binBuf, Buffer.alloc(bp)]);
const total = 20 + np.length + 8 + nb.length;
const out = Buffer.alloc(total);
out.writeUInt32LE(0x46546C67, 0);
out.writeUInt32LE(2, 4);
out.writeUInt32LE(total, 8);
out.writeUInt32LE(np.length, 12);
out.writeUInt32LE(0x4E4F534A, 16);
out.write(np, 20);
out.writeUInt32LE(nb.length, 20 + np.length);
out.writeUInt32LE(0x004E4942, 24 + np.length);
nb.copy(out, 28 + np.length);
fs.writeFileSync(outPath, out);
console.log(`输出: ${outPath} ${(out.length / 1048576).toFixed(2)}MB`);