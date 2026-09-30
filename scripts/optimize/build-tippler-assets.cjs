#!/usr/bin/env node
// build-tippler-assets.cjs — 327 酒鬼星球资产流水线(2026-09-27)
// 输入(主人提供,版权确认后才上线):Downloads/ 下 alcoholic_set.glb(15 组酒瓶)/
//   alcoholic_set (1).glb(8 罐)/ jim_e._brown.glb(酒鬼本人)/
//   milky_way_skybox_hdri_panorama.glb(银河天幕)。四件全部上线,不丢任何一组
//   (2026-09-30 主人令:旧版只留 3 瓶+弃用易拉罐,属"没完全运用")。
// 输出:models/hall/b612-world/tippler-{bottles,cans,man,sky}.glb(压缩版,meshopt+webp)
// 用法:node scripts/optimize/build-tippler-assets.cjs
// 复跑幂等(输出覆盖)。源文件不动。
const fs = require('fs');
const path = require('path');

const DL = 'C:/Users/17296/Downloads';
const OUT = path.join(__dirname, '..', '..', 'models', 'hall', 'b612-world');

async function main() {
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { prune, dedup, quantize, meshopt, textureCompress } = await import(
    '@gltf-transform/functions'
  );
  const { MeshoptDecoder, MeshoptEncoder } = require('meshoptimizer');
  await MeshoptEncoder.ready;
  const sharp = require('sharp');
  // ⚠️ 两处必注册(2026-09-28 实锤:不注册则扩展"不会写出",产物仍是裸 PNG + 无 meshopt,
  //    控制台只给一句 "Some extensions were not registered for I/O" 的软提示):
  //    ① ALL_EXTENSIONS(含 EXT_texture_webp)② meshopt encoder/decoder 依赖。
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });

  async function squeeze(doc, maxTex) {
    await doc.transform(
      prune(),
      dedup(),
      quantize(),
      meshopt({ encoder: MeshoptEncoder }),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [maxTex, maxTex] })
    );
    return doc;
  }
  async function write(doc, name) {
    const out = path.join(OUT, name);
    const buf = await io.writeBinary(doc);
    fs.writeFileSync(out, Buffer.from(buf));
    console.log(name, (buf.byteLength / 1024 / 1024).toFixed(2) + 'MB');
  }

  // —— 1. 全套酒瓶(2026-09-30 主人令「完全运用,不漏下」:旧版只留 Whiskey 01/02/03
  //       三组,其余 12 组整组丢弃;现 15 组全留,由 scene7-tippler 逐个摆位) ——
  {
    const doc = await io.read(path.join(DL, 'alcoholic_set.glb'));
    const root = doc.getRoot();
    const rootNode = root.listNodes().find((n) => n.getName() === 'RootNode');
    if (!rootNode) throw new Error('RootNode 未找到');
    const kept = rootNode.listChildren().map((n) => n.getName());
    console.log('保留瓶组(' + kept.length + '):', kept.join(' / '));
    await squeeze(doc, 1024);
    await write(doc, 'tippler-bottles.glb');
  }

  // —— 1b. 易拉罐套装(alcoholic_set (1).glb,8 罐;旧版判「气质不合」弃用,现纳入) ——
  {
    const doc = await io.read(path.join(DL, 'alcoholic_set (1).glb'));
    const root = doc.getRoot();
    const rootNode = root.listNodes().find((n) => n.getName() === 'RootNode');
    console.log(
      '保留罐组(' + (rootNode ? rootNode.listChildren().length : 0) + '):',
      rootNode ? rootNode.listChildren().map((n) => n.getName()).join(' / ') : ''
    );
    await squeeze(doc, 1024);
    await write(doc, 'tippler-cans.glb');
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
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] })
    );
    await write(doc, 'tippler-sky.glb');
  }
  console.log('DONE');
}

main().catch((e) => {
  console.error('BUILD FAIL:', e.message);
  process.exit(1);
});
