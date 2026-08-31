// convert-specgloss-v2.mjs — 稳定版本
// 1) 把 GLB 的 JSON chunk 抽出来编辑(diffuseTex→baseColorTexture 等)
// 2) 输出修改后的 GLB(JSON 重打包时保证 4 字节对齐)
import fs from 'fs';
const [, , inPath, outPath] = process.argv;
const buf = fs.readFileSync(inPath);
const jsonLen = buf.readUInt32LE(12);
const jsonBuf = buf.slice(20, 20 + jsonLen);
const binLen = buf.readUInt32LE(20 + jsonLen);
const binBuf = buf.slice(20 + jsonLen + 8, 20 + jsonLen + 8 + binLen);
const j = JSON.parse(jsonBuf.toString('utf8'));

// 转换
let conv = 0;
for (const m of (j.materials || [])) {
  const sg = m.extensions && m.extensions.KHR_materials_pbrSpecularGlossiness;
  if (!sg) continue;
  if (!m.pbrMetallicRoughness) m.pbrMetallicRoughness = {};
  const mr = m.pbrMetallicRoughness;
  if (sg.diffuseTexture && sg.diffuseTexture.index !== undefined) {
    mr.baseColorTexture = { index: sg.diffuseTexture.index };
    if (sg.diffuseTexture.texCoord !== undefined) mr.baseColorTexture.texCoord = sg.diffuseTexture.texCoord;
  }
  if (sg.diffuseFactor) mr.baseColorFactor = sg.diffuseFactor;
  mr.metallicFactor = 0;
  mr.roughnessFactor = 1;
  delete m.extensions.KHR_materials_pbrSpecularGlossiness;
  conv++;
}
const cleanList = (l) => (l || []).filter(e => e !== 'KHR_materials_pbrSpecularGlossiness');
j.extensionsUsed = cleanList(j.extensionsUsed);
j.extensionsRequired = cleanList(j.extensionsRequired);

// 重打包 GLB(4 字节对齐)
let newJsonStr = JSON.stringify(j);
const align = (n) => (4 - (n % 4)) % 4;
const jsonPad = align(newJsonStr.length);
newJsonStr = newJsonStr + ' '.repeat(jsonPad);
const binPad = align(binBuf.length);
const newBin = Buffer.concat([binBuf, Buffer.alloc(binPad)]);

const totalLen = 20 + newJsonStr.length + 8 + newBin.length;
const out = Buffer.alloc(totalLen);
out.writeUInt32LE(0x46546C67, 0); // magic
out.writeUInt32LE(2, 4); // version
out.writeUInt32LE(totalLen, 8); // total length
out.writeUInt32LE(newJsonStr.length, 12); // JSON length
out.writeUInt32LE(0x4E4F534A, 16); // JSON type
out.write(newJsonStr, 20); // JSON data
const binStart = 20 + newJsonStr.length;
out.writeUInt32LE(newBin.length, binStart); // BIN length
out.writeUInt32LE(0x004E4942, binStart + 4); // BIN type "BIN\0" (GLB spec magic)
newBin.copy(out, binStart + 8);

fs.writeFileSync(outPath, out);
console.log(`转换 ${conv} 材质 → ${outPath} ${(out.length / 1048576).toFixed(2)}MB`);