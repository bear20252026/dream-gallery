#!/usr/bin/env node
// build-rose-lamp-assets.cjs — 主人提供的玫瑰与路灯真模型入库(2026-10-04)
// 输入(Downloads/,主人提供并自行确认版权):
//   rose.glb                                  玻璃罩里的玫瑰(木底座)→ 只取玻璃罩(底座有铭牌字样、花朵较糙,不用)
//   piano_rose.glb                            高精度单朵玫瑰(137 万面)→ hero-rose(罩里那朵,4 万面)+ garden-rose(玫瑰园,4 千面实例化)
//   victorian_street_lamp_simplified_1900s.glb 维多利亚路灯 → 329 点灯人星
// 输出:models/hall/b612-world/{rose-dome,hero-rose,garden-rose,street-lamp}.glb(meshopt + webp,已减面)
// 用法:node scripts/optimize/build-rose-lamp-assets.cjs   (DL=<下载目录> 可覆盖)
// 复跑幂等(输出覆盖)。源文件不动。
const fs = require('fs');
const path = require('path');

const DL = process.env.DL || 'C:/Users/17296/Downloads';
const OUT = path.join(__dirname, '..', '..', 'models', 'hall', 'b612-world');

async function main() {
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const F = await import('@gltf-transform/functions');
  const { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } = require('meshoptimizer');
  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;
  const sharp = require('sharp');
  // ⚠️ 必须注册扩展与 meshopt 依赖,否则静默产出未压缩文件(见 AGENTS.md 模型压缩管线)
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });
  const tris = (doc) => {
    let t = 0;
    for (const m of doc.getRoot().listMeshes())
      for (const p of m.listPrimitives()) {
        const i = p.getIndices();
        t += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3;
      }
    return Math.round(t);
  };
  // 「粗暴减面」:高精度玫瑰的每片花瓣都有 UV/法线接缝,常规 simplify 被接缝锁死(137 万面只降到 15 万),
  // 远看的花园玫瑰用 simplifySloppy 不管拓扑地按目标面数收缩,再 compact 掉无用顶点。
  const sloppy = (ratio, minTris) => (doc) => {
    for (const mesh of doc.getRoot().listMeshes())
      for (const prim of mesh.listPrimitives()) {
        const idx = prim.getIndices();
        const pos = prim.getAttribute('POSITION');
        if (!idx || !pos) continue;
        const n = idx.getCount();
        const target = Math.max(minTris * 3, Math.floor((n * ratio) / 3) * 3);
        if (target >= n) continue;
        const out = MeshoptSimplifier.simplifySloppy(
          new Uint32Array(idx.getArray()),
          new Float32Array(pos.getArray()),
          3,
          null,
          target,
          1
        )[0];
        idx.setArray(new Uint32Array(out));
        F.compactPrimitive(prim);
      }
  };
  // 只留玻璃罩:去掉木底座(带铭牌字样)和罩里那朵较糙的玫瑰
  const glassOnly = () => (doc) => {
    for (const node of doc.getRoot().listNodes()) {
      const m = node.getMesh();
      if (!m) continue;
      const glass = m
        .listPrimitives()
        .some((p) => p.getMaterial() && p.getMaterial().getAlphaMode() === 'BLEND');
      if (!glass) node.setMesh(null);
    }
  };
  async function squeeze(doc, { maxTex, ratio, error, sloppyRatio, glass }) {
    const steps = [F.dedup(), F.flatten(), F.join(), F.weld()];
    if (glass) steps.unshift(glassOnly());
    if (sloppyRatio) steps.push(sloppy(sloppyRatio, 24));
    if (ratio)
      steps.push(F.simplify({ simplifier: MeshoptSimplifier, ratio, error: error || 0.01 }));
    steps.push(
      F.prune(),
      F.quantize(),
      F.meshopt({ encoder: MeshoptEncoder }),
      F.textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [maxTex, maxTex] })
    );
    await doc.transform(...steps);
    return doc;
  }
  async function build(src, name, opts) {
    const doc = await io.read(path.join(DL, src));
    const before = tris(doc);
    await squeeze(doc, opts);
    const buf = await io.writeBinary(doc);
    fs.writeFileSync(path.join(OUT, name), Buffer.from(buf));
    console.log(
      name,
      before + ' → ' + tris(doc) + ' tris',
      (buf.byteLength / 1024 / 1024).toFixed(2) + 'MB'
    );
  }
  fs.mkdirSync(OUT, { recursive: true });
  await build('victorian_street_lamp_simplified_1900s.glb', 'street-lamp.glb', {
    maxTex: 512,
    ratio: 0.3,
    error: 0.002,
  });
  await build('rose.glb', 'rose-dome.glb', { maxTex: 256, glass: true });
  // 他的那一朵(玻璃罩里,近看):同一朵玫瑰,保留更多细节
  await build('piano_rose.glb', 'hero-rose.glb', { maxTex: 1024, sloppyRatio: 0.03 });
  await build('piano_rose.glb', 'garden-rose.glb', {
    maxTex: 512,
    sloppyRatio: Number(process.env.ROSE_RATIO || 0.004),
  });
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
