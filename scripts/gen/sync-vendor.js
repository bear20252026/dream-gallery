// sync-vendor.js — 把 npm 安装的三方库拷贝为 vendor/ 下的浏览器直跑副本
// 为什么需要:本地开发/test-mobile 用 Node 服务器原生 ESM 直跑(不经过 Vite),
// 浏览器无法解析裸包名('three'/'hls.js'),由 index.html 的 importmap 映射到 /vendor/*。
// 生产构建(Vite)直接从 node_modules 打包,vendor/ 仅兜底本地原生运行。
// 运行时机:npm install 后自动执行(postinstall),保证 vendor 与 package.json 版本永远一致。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DST_DIR = path.join(ROOT, 'vendor');

// [npm 包名, 包内 ESM 文件, vendor 目标文件名]
const VENDORS = [
  ['three', 'build/three.module.js', 'three.module.js'],
  // r170 起构建拆分:three.module.js 顶部相对导入 './three.core.js',漏拷则 importmap 直跑模式白屏(2026-10-08 升级 0.186 补)
  ['three', 'build/three.core.js', 'three.core.js'],
  ['hls.js', 'dist/hls.mjs', 'hls.mjs'],
];

fs.mkdirSync(DST_DIR, { recursive: true });
for (const [pkg, inner, out] of VENDORS) {
  const src = path.join(ROOT, 'node_modules', pkg, ...inner.split('/'));
  if (!fs.existsSync(src)) {
    console.error(`[sync-vendor] 未找到 ${src},请先 npm install`);
    process.exit(1);
  }
  const ver = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', pkg, 'package.json'), 'utf8')).version;
  fs.copyFileSync(src, path.join(DST_DIR, out));
  console.log(`[sync-vendor] vendor/${out} 已同步(${pkg}@${ver})`);
}

// Three.js 加载器依赖(vite.config.js alias 指向 vendor/):
// FBXLoader + GLTFLoader + fflate + NURBSCurve
// ⚠️ BufferGeometryUtils 不可省:GLTFLoader.js 顶部 `import {toTrianglesDrawMode} from '../utils/BufferGeometryUtils.js'`,
//    漏拷会让整个开发入口(native ESM)在加载 GLTFLoader 时 404 而白屏,且报错只在浏览器控制台可见
//    (生产走 Vite 从 node_modules 打包,不受影响,故极易漏检)。2026-08-29 修。
const THREE_EXAMPLES = [
  'examples/jsm/loaders/FBXLoader.js',
  'examples/jsm/loaders/GLTFLoader.js',
  'examples/jsm/loaders/KTX2Loader.js', // 审查#11:KTX2 纹理支持(传递闭包四件一起拷)
  'examples/jsm/utils/WorkerPool.js',
  'examples/jsm/libs/ktx-parse.module.js',
  'examples/jsm/libs/zstddec.module.js',
  'examples/jsm/math/ColorSpaces.js',
  'examples/jsm/renderers/CSS2DRenderer.js', // 小世界对话气泡(2026-09-06)
  'examples/jsm/libs/fflate.module.js',
  'examples/jsm/libs/meshopt_decoder.module.js', // planets/marker 静态导入;漏拷会让 CI 干净检出整个模块图死亡(2026-09-06)
  'examples/jsm/curves/NURBSCurve.js',
  'examples/jsm/curves/NURBSUtils.js',
  // GLTFLoader 的隐式依赖
  'examples/jsm/utils/BufferGeometryUtils.js',
  // 后处理管线(P1-1)/SkeletonUtils(角色)/FXAA 的入口及其**传递闭包**:
  // 这些文件内部用相对路径互相 import(Pass/CopyShader/LuminosityHighPassShader/OutputShader/MaskPass),
  // 只补入口不补闭包仍会 404。相对依赖只要文件在 vendor 下同构即可解析,无需进 importmap。
  'examples/jsm/utils/SkeletonUtils.js',
  'examples/jsm/shaders/FXAAShader.js',
  'examples/jsm/shaders/CopyShader.js',
  'examples/jsm/shaders/LuminosityHighPassShader.js',
  'examples/jsm/shaders/OutputShader.js',
  'examples/jsm/postprocessing/EffectComposer.js',
  'examples/jsm/postprocessing/Pass.js',
  'examples/jsm/postprocessing/MaskPass.js',
  'examples/jsm/postprocessing/RenderPass.js',
  'examples/jsm/postprocessing/ShaderPass.js',
  'examples/jsm/postprocessing/UnrealBloomPass.js',
  'examples/jsm/postprocessing/OutputPass.js',
];

for (const rel of THREE_EXAMPLES) {
  const src = path.join(ROOT, 'node_modules', 'three', ...rel.split('/'));
  const dst = path.join(DST_DIR, rel);
  const dstDir = path.dirname(dst);
  if (!fs.existsSync(src)) {
    console.warn(`[sync-vendor] 跳过 ${rel}(node_modules 中不存在)`);
    continue;
  }
  fs.mkdirSync(dstDir, { recursive: true });
  fs.copyFileSync(src, dst);
  console.log(`[sync-vendor] vendor/${rel} 已同步`);
}

// KTX2 / Basis 转码器(审查#11,2026-10-08):KTX2Loader 的 transcoder 路径由
// gltf-loader.js 按 IS_LOCAL 二选一 —— 开发(native ESM)取 'vendor/basis/'(上方
// vendor/ 副本),生产取 'basis/'(public/basis/ 由 Vite 拷进 dist 根;public/vendor
// 在 .gitignore 里,故 prod 副本放 public/basis/)。转码器按需加载:GLB 里没有 KTX2
// 纹理就一个字节都不下载,存量 WebP 模型零成本。
const BASIS = [
  'examples/jsm/libs/basis/basis_transcoder.js',
  'examples/jsm/libs/basis/basis_transcoder.wasm',
];
for (const rel of BASIS) {
  const src = path.join(ROOT, 'node_modules', 'three', ...rel.split('/'));
  if (!fs.existsSync(src)) {
    console.warn(`[sync-vendor] 跳过 ${rel}(node_modules 中不存在)`);
    continue;
  }
  const file = rel.split('/').pop();
  fs.mkdirSync(path.join(DST_DIR, 'basis'), { recursive: true });
  fs.copyFileSync(src, path.join(DST_DIR, 'basis', file));
  const pub = path.join(ROOT, 'public', 'basis', file);
  fs.mkdirSync(path.dirname(pub), { recursive: true });
  fs.copyFileSync(src, pub);
  console.log(`[sync-vendor] vendor/basis/${file} + public/basis/${file} 已同步`);
}
