#!/usr/bin/env node
// build-tippler-assets.cjs — 327 酒鬼星球资产流水线(2026-09-27)
// 输入(主人提供,版权确认后才上线):Downloads/ 下 alcoholic_set.glb / jim_e._brown.glb /
//   milky_way_skybox_hdri_panorama.glb(另:alcoholic_set (1).glb 是现代易拉罐,
//   与 1940s 寓言气质不合,弃用)
// 输出:models/hall/b612-world/tippler-{bottles,man,sky}.glb(压缩版,meshopt+webp)
// 用法:node scripts/optimize/build-tippler-assets.cjs
// 复跑幂等(输出覆盖)。源文件不动。
const fs = require('fs');
const path = require('path');

const DL = 'C:/Users/17296/Downloads';
const OUT = path.join(__dirname, '..', '..', 'models', 'hall', 'b612-world');

async function main() {
  const { NodeIO, Format } = await import('@gltf-transform/core');
  const { prune, dedup, quantize, meshopt, textureCompress } = await import(
    '@gltf-transform/functions'
  );
  const { MeshoptEncoder } = require('meshoptimizer');
  await MeshoptEncoder.ready;
  const sharp = require('sharp');
  const io = new NodeIO();

  async function squeeze(doc, maxTex) {
    await doc.transform(
      prune(),
      dedup(),
      quantize(),
      meshopt({ encoder: MeshoptEncoder }),
      textureCompress({ encoder: sharp, targetFormat: Format.WEBP, resize: [maxTex, maxTex] })
    );
    return doc;
  }
  async function write(doc, name) {
    const out = path.join(OUT, name);
    const buf = await io.writeBinary(doc);
    fs.writeFileSync(out, Buffer.from(buf));
    console.log(name, (buf.byteLength / 1024 / 1024).toFixed(2) + 'MB');
  }

  // —— 1. 三只歪酒瓶:只留 Whiskey 01/02/03 子树,其余 12 组整组移除 ——
  {
    const doc = await io.read(path.join(DL, 'alcoholic_set.glb'));
    const root = doc.getRoot();
    const rootNode = root.listNodes().find((n) => n.getName() === 'RootNode');
    if (!rootNode) throw new Error('RootNode 未找到');
    for (const child of rootNode.listChildren().slice()) {
      if (!/^BW BLBS Bottle Whiskey 0[123]$/.test(child.getName() || '')) {
        rootNode.removeChild(child);
        child.dispose();
      }
    }
    const kept = rootNode.listChildren().map((n) => n.getName());
    console.log('保留瓶组:', kept.join(' / '));
    await squeeze(doc, 1024);
    await write(doc, 'tippler-bottles.glb');
  }

  // —— 2. 酒鬼本人:整体压缩(站姿,入场时倚瓶微倾,见 scene7-tippler.js) ——
  {
    const doc = await io.read(path.join(DL, 'jim_e._brown.glb'));
    await squeeze(doc, 1024);
    await write(doc, 'tippler-man.glb');
  }

  // —— 3. 银河天幕:只压纹理(559 顶点球体不动;全景噪点多,2048 反涨,取 1024) ——
  {
    const doc = await io.read(path.join(DL, 'milky_way_skybox_hdri_panorama.glb'));
    await doc.transform(
      prune(),
      dedup(),
      textureCompress({ encoder: sharp, targetFormat: Format.WEBP, resize: [1024, 1024] })
    );
    await write(doc, 'tippler-sky.glb');
  }
  console.log('DONE');
}

main().catch((e) => {
  console.error('BUILD FAIL:', e.message);
  process.exit(1);
});
