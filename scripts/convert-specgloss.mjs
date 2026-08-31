// convert-specgloss.mjs — 把 GLB 内 KHR_materials_pbrSpecularGlossiness 材质转成标准 metalRoughness
// 背景:three r160 的 GLTFLoader 不再解析 specularGlossiness 贴图 → 直接加载会得到白模
// 转换:diffuseTexture→baseColorTexture, metallic=0, roughness=1-glossinessFactor(扫描建筑按非金属近似)
// 用法: node scripts/convert-specgloss.mjs <in.glb> <out.glb>
import fs from 'fs';
import { NodeIO } from '@gltf-transform/core';
import { EXTTextureWebP, KHRMaterialsPBRSpecularGlossiness, KHRMeshQuantization, KHRTextureTransform } from '@gltf-transform/extensions';

const [,, inPath, outPath] = process.argv;
const io = new NodeIO().registerExtensions([EXTTextureWebP, KHRMaterialsPBRSpecularGlossiness, KHRMeshQuantization, KHRTextureTransform]);
const doc = await io.read(inPath);
const root = doc.getRoot();

for (const mat of root.listMaterials()) {
  const ext = mat.getExtension('KHR_materials_pbrSpecularGlossiness');
  if (!ext) continue;
  // diffuse → baseColor
  const diffuseTex = ext.getDiffuseTexture();
  if (diffuseTex) mat.setBaseColorTexture(diffuseTex);
  const df = ext.getDiffuseFactor();
  if (df) mat.setBaseColorFactor(df);
  // 扫描建筑近似非金属:metallic=0, roughness=1
  mat.setMetallicFactor(0);
  mat.setRoughnessFactor(1);
  mat.setExtension('KHR_materials_pbrSpecularGlossiness', null);
  console.log('  转换材质:', mat.getName() || '(未命名)');
}

// 移除 extensionsRequired/Used 中的 specularGlossiness 声明
const json = doc;
await io.write(outPath, doc);
const kb = fs.statSync(outPath).size / 1024;
console.log(`输出: ${outPath} ${(kb / 1024).toFixed(2)}MB`);
