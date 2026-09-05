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
  'examples/jsm/libs/fflate.module.js',
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
