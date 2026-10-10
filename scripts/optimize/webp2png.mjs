// webp2png.mjs — 把 GLB 里的 WEBP 纹理全部解码成 PNG(2026-10-10 KTX2 实验第一步)
// 背景:toktx 不吃 WEBP 输入;先用 sharp 解码(vips 支持 webp),再交 CLI etc1s 编 KTX2。
// AGENTS 三坑避法:NodeIO.registerExtensions(ALL_EXTENSIONS) + meshopt 依赖注册。
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const sharp = require_('sharp');

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('用法: node webp2png.mjs <in.glb> <out.glb>');
  process.exit(1);
}

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });

const doc = await io.read(input);
const textures = doc.getRoot().listTextures();
let n = 0;
for (const tex of textures) {
  if (tex.getMimeType() !== 'image/webp') continue;
  const img = tex.getImage();
  if (!img) continue;
  const png = await sharp(img).png().toBuffer();
  tex.setImage(png);
  tex.setMimeType('image/png');
  n++;
  console.log(`  webp→png ${n}: ${tex.getURI() || '(内嵌)'} ${img.length}→${png.length}B`);
}
await io.write(output, doc);
console.log(`written: ${output}(${n} 张纹理已解码)`);
