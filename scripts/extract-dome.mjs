// extract-dome.mjs — 从 yazd GLB 中拆出穹顶建筑本体(Dome 子树),丢弃树木/天盒
// 用法: node scripts/extract-dome.mjs <in.glb> <out.glb>
import fs from 'fs';
import { NodeIO } from '@gltf-transform/core';
import { EXTTextureWebP, KHRMeshQuantization } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';

const [,, inPath, outPath] = process.argv;
const io = new NodeIO().registerExtensions([EXTTextureWebP, KHRMeshQuantization]);
const doc = await io.read(inPath);
const root = doc.getRoot();

// 找到名为 Dome 的节点(保留其子树)
const domeNode = root.listNodes().find(n => n.getName() === 'Dome');
if (!domeNode) { console.error('未找到 Dome 节点'); process.exit(1); }

// Dome 是深层子孙(node0→1→2→Dome),先把它提升到场景顶层,再断掉旧顶层链
const scene = root.listScenes()[0];

scene.addChild(domeNode); // setParent 语义:addChild 自动从旧父 detach
for (const n of scene.listChildren()) {
  if (n !== domeNode) scene.removeChild(n);
}
// 断链后的孤儿(树/天盒)由 prune 物理清除
await doc.transform(prune());

await io.write(outPath, doc);
const kb = fs.statSync(outPath).size / 1024;
console.log(`穹顶本体已拆出: ${outPath} ${(kb / 1024).toFixed(2)}MB`);
