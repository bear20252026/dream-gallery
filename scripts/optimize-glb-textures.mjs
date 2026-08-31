// optimize-glb-textures.mjs — GLB 贴图优化:降分辨率 + WEBP 编码(几何不动)
// 用法: node scripts/optimize-glb-textures.mjs <in.glb> <out.glb> [maxSize=2048] [quality=82]
// 背景: @gltf-transform/cli 的 textureCompress 对 16-bit PNG 源报
//       "colourspace: parameter space not set"(libvips space=32 无效),
//       故先用 sharp 归一化为 8-bit sRGB 再编码 WEBP。
import fs from 'fs';
import { NodeIO } from '@gltf-transform/core';
import { EXTTextureWebP, KHRMaterialsPBRSpecularGlossiness } from '@gltf-transform/extensions';
import sharp from 'sharp';

const [,, inPath, outPath, sizeArg, qualityArg] = process.argv;
const MAX = Number(sizeArg || 2048);
const Q = Number(qualityArg || 82);

const io = new NodeIO().registerExtensions([EXTTextureWebP, KHRMaterialsPBRSpecularGlossiness]);
const doc = await io.read(inPath);

const ext = doc.createExtension(EXTTextureWebP);
ext.setRequired(true);

const textures = doc.getRoot().listTextures();
console.log(`贴图 ${textures.length} 张,目标 ${MAX}px WEBP q${Q}`);
for (const tex of textures) {
  const img = await tex.getImage();
  const meta = await sharp(img).metadata();
  const out = await sharp(img)
    .toColourspace('srgb') // 归一化色彩空间(修复 16-bit 源)
    .resize({ width: MAX, height: MAX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: Q })
    .toBuffer();
  tex.setImage(out);
  tex.setMimeType('image/webp');
  console.log(`  ${meta.width}x${meta.height} → ≤${MAX} WEBP ${(out.length / 1024).toFixed(0)}KB`);
}

await io.write(outPath, doc);
const kb = fs.statSync(outPath).size / 1024;
console.log(`输出: ${outPath} ${(kb / 1024).toFixed(1)}MB`);
