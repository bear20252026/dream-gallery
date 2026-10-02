#!/usr/bin/env node
// build-little-prince-assets.cjs — 狐狸站 + 真实飞机资产流水线(2026-10-03)
// 输入(主人提供,版权确认后才上线),均在 Downloads/ 下:
//   el_principito-_escena_con_zorro.glb —— 「小王子与狐狸」整场布景:
//     Escenario_0(地面6件) / Nubes_2(云) / Hojas_3(1792 面叶簇) /
//     Principito_4(王子9件) / Zorro_5(狐狸6件)。剧本第10场站五·狐狸(原著 Ch.21)用。
//   piper_pa_18 (1).glb —— 真实 Piper PA-18 完整机(18 meshes:双翼/桨叶/机身/10 张贴图),
//     用于替换线上 245KB 简化残骸 models/b612/piper-pa18.glb,并支撑可驾驶飞行。
// 输出:models/hall/b612-world/fox-scene.glb / models/b612/piper-pa18-full.glb(均 meshopt+webp)
// 用法:node scripts/optimize/build-little-prince-assets.cjs
// 复跑幂等(输出覆盖)。源文件不动。
const fs = require('fs');
const path = require('path');

const DL = 'C:/Users/17296/Downloads';
const ROOT = path.join(__dirname, '..', '..');
const OUT_WORLD = path.join(ROOT, 'models', 'hall', 'b612-world');
const OUT_B612 = path.join(ROOT, 'models', 'b612');

async function main() {
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { prune, dedup, quantize, meshopt, textureCompress } = await import(
    '@gltf-transform/functions'
  );
  const { MeshoptDecoder, MeshoptEncoder } = require('meshoptimizer');
  await MeshoptEncoder.ready;
  const sharp = require('sharp');
  // ⚠️ 三处必做(2026-09-28 血泪:漏任何一处都只给一句软提示,产物压了个寂寞):
  //   ① ALL_EXTENSIONS(含 EXT_texture_webp) ② meshopt encoder/decoder 依赖
  //   ③ targetFormat 必须是字符串 'webp'(Format.WEBP === undefined,枚举里只有 GLTF/GLB)
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });

  // 自检判据:产物含 WEBP 字节 / PNG 魔数 false / EXT_meshopt_compression=true
  function audit(name, buf) {
    const has = (s) => buf.includes(Buffer.from(s, 'latin1'));
    const pngMagic = buf.includes(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const report = {
      WEBP: has('WEBP'),
      'PNG魔数': pngMagic,
      EXT_meshopt: has('EXT_meshopt_compression'),
    };
    const ok = report.WEBP && !pngMagic && report.EXT_meshopt;
    console.log(`  自检 ${ok ? 'PASS' : 'FAIL'} —`, JSON.stringify(report));
    if (!ok) throw new Error(name + ' 压缩自检未通过,拒绝落盘');
  }

  async function build(srcFile, outDir, outName, maxTex) {
    const src = path.join(DL, srcFile);
    if (!fs.existsSync(src)) throw new Error('源文件不存在: ' + src);
    const before = fs.statSync(src).size;
    const doc = await io.read(src);
    await doc.transform(
      prune(),
      dedup(),
      quantize(),
      meshopt({ encoder: MeshoptEncoder }),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [maxTex, maxTex] })
    );
    const buf = Buffer.from(await io.writeBinary(doc));
    audit(outName, buf);
    const out = path.join(outDir, outName);
    fs.writeFileSync(out, buf);
    const pct = (((before - buf.length) / before) * 100).toFixed(0);
    console.log(
      `${outName}  ${(before / 1024 / 1024).toFixed(2)}MB → ${(buf.length / 1024 / 1024).toFixed(2)}MB  (-${pct}%)`
    );
  }

  // 狐狸站布景:叶簇 1792 面,贴图压到 1024 足够(它是背景元素,不是近观主体)
  await build('el_principito-_escena_con_zorro.glb', OUT_WORLD, 'fox-scene.glb', 1024);
  // 真实飞机:10 张贴图且有近观可能(驾驶舱视角),压到 1024 保细节
  await build('piper_pa_18 (1).glb', OUT_B612, 'piper-pa18-full.glb', 1024);

  console.log('\n完成。落盘位置:');
  console.log('  ' + path.join(OUT_WORLD, 'fox-scene.glb'));
  console.log('  ' + path.join(OUT_B612, 'piper-pa18-full.glb'));
  console.log('\n⚠️ 上线必须双步:deploy.sh(源站) + r2-upload-models-rest.cjs(R2 镜像)');
}

main().catch((e) => {
  console.error('[build-little-prince-assets] 失败:', e.message);
  process.exitCode = 1;
});
