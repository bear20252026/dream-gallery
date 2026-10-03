// 保留形状/网格名/材质，不做简化；下载原件不动，发布文件用meshopt压缩。
const fs = require('fs');
const path = require('path');
async function build() {
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { meshopt } = await import('@gltf-transform/functions');
  const { MeshoptDecoder, MeshoptEncoder } = require('meshoptimizer');
  await MeshoptEncoder.ready;
  const input = process.argv[2] || 'C:/Users/17296/Downloads/sheep (1).glb';
  const output = path.resolve(__dirname, '../../models/b612/sheep-companion.glb');
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  const doc = await io.read(input);
  await doc.transform(
    meshopt({ encoder: MeshoptEncoder, quantizePosition: 16, quantizeNormal: 12 })
  );
  await io.write(output, doc);
  const buffer = fs.readFileSync(output);
  if (!buffer.includes(Buffer.from('EXT_meshopt_compression')))
    throw Error('meshopt extension missing');
  console.log(
    'sheep companion: ' +
      fs.statSync(input).size +
      ' → ' +
      buffer.length +
      ' bytes; outline and material names preserved'
  );
}
build().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
