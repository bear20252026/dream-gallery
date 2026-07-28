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
  const ver = require(path.join(ROOT, 'node_modules', pkg, 'package.json')).version;
  fs.copyFileSync(src, path.join(DST_DIR, out));
  console.log(`[sync-vendor] vendor/${out} 已同步(${pkg}@${ver})`);
}
