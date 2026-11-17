// sync-voxel-three.js — 把 three 核心 + voxel 五页所需 addons 闭包同步到 public/voxel/three/
// 2026-11-17 A1:此前五页各自 esbuild 内联一份 three(重复 ≈3MB raw / ≈920KB gz)。
// 改为共享一份本地 ESM three + importmap,页内只留业务代码。
//
// 关键纪律(踩坑前科见 sync-vendor.js):
//  - 目录叫 three/ 不叫 vendor/:.gitignore 的 vendor/ 匹配任意层级同名目录,会被吞掉。
//  - 必须放 public/ 下:部署只传 dist,vite 拷 public/→dist/;根 vendor/ 线上 404。
//  - three.core.js 不可漏:r170+ 拆分,three.module.js 内部 import './three.core.js',漏了白屏。
//  - addons 按传递闭包精确同步(15 文件 ≈141KB),不拷全量 examples/jsm(9.7MB)。
//  - 仅 minify 不 bundle:保留 ESM 模块结构与相对导入,importmap 才能解析。
//
// 用法:node scripts/gen/sync-voxel-three.js
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '../..');
const THREE = path.join(ROOT, 'node_modules/three');
const OUT = path.join(ROOT, 'public/voxel/three');
const JSM = path.join(THREE, 'examples/jsm');

// 五页 import 的 addons 入口(并集),传递闭包由 walk 自动展开
const ENTRIES = [
  'controls/OrbitControls.js',
  'geometries/RoundedBoxGeometry.js',
  'postprocessing/EffectComposer.js',
  'postprocessing/RenderPass.js',
  'postprocessing/ShaderPass.js',
  'postprocessing/UnrealBloomPass.js',
  'postprocessing/OutputPass.js',
  'postprocessing/BokehPass.js',
  'utils/BufferGeometryUtils.js',
];

// 计算 addons 传递闭包(只跟相对导入;'three' 裸导入由 importmap 解析,不展开)
function closure() {
  const seen = new Set();
  function walk(rel) {
    if (seen.has(rel)) return;
    seen.add(rel);
    const f = path.join(JSM, rel);
    if (!fs.existsSync(f)) throw new Error('addons 闭包缺文件: ' + rel);
    const src = fs.readFileSync(f, 'utf8');
    const re = /from\s+['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(src))) {
      const spec = m[1];
      if (spec.startsWith('.')) {
        walk(path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec)));
      }
    }
  }
  ENTRIES.forEach(walk);
  return [...seen].sort();
}

// 仅 minify(不 bundle),保留模块结构;写回时保持相对路径
async function minifyTo(srcFile, outFile) {
  const code = fs.readFileSync(srcFile, 'utf8');
  const res = await esbuild.transform(code, {
    minify: true,
    format: 'esm',
    target: 'es2020',
    legalComments: 'none',
  });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, res.code);
  return res.code.length;
}

(async () => {
  // 版本断言:五页与主游戏必须同版本,防漂移
  const pkg = JSON.parse(fs.readFileSync(path.join(THREE, 'package.json'), 'utf8'));
  const rev = fs.readFileSync(path.join(THREE, 'build/three.core.js'), 'utf8').match(/REVISION\s*=\s*['"](\d+)['"]/);
  console.log('[sync-voxel-three] three 版本', pkg.version, 'REVISION', rev ? rev[1] : '?');
  if (rev && rev[1] !== '186') {
    console.warn('[sync-voxel-three] ⚠️ REVISION 非 186,五页内联产物曾统一升到 186,请确认版本一致性');
  }

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  // 核心两件套
  let total = 0;
  total += await minifyTo(path.join(THREE, 'build/three.module.js'), path.join(OUT, 'three.module.js'));
  total += await minifyTo(path.join(THREE, 'build/three.core.js'), path.join(OUT, 'three.core.js'));

  // addons 闭包(保持 examples/jsm/ 子路径,importmap 的 three/addons/ 映射到此)
  const files = closure();
  for (const rel of files) {
    total += await minifyTo(path.join(JSM, rel), path.join(OUT, 'examples/jsm', rel));
  }
  console.log('[sync-voxel-three] 核心 2 + addons', files.length, '文件,合计', (total / 1024).toFixed(1), 'KB(minified)');
  console.log('[sync-voxel-three] 输出', path.relative(ROOT, OUT));
})().catch((e) => {
  console.error('[sync-voxel-three] FAIL', e.message);
  process.exit(1);
});