// bundle-voxel.cjs — 从 voxel-src/ 生成 public/voxel/ 五页(共享 three 版)
// 2026-11-17 A1:此前 esbuild bundle:true + format:iife 把 three+addons+业务揉成一团内联,
// 五页各重复一份 three(≈3MB raw / ≈920KB gz)。改为:
//   - format:esm + external:['three','three/addons/*'] —— three 不打进业务码
//   - 页内注入相对 importmap,指向 ./three/(由 sync-voxel-three.js 同步)
//   - 业务码仍是单段 <script type="module">,恢复源本来的 defer 语义
// 相对 importmap 兼容 voyage-scenes.js 的双 base 回退(/voxel/ 与 /public/voxel/)。
//
// 用法:node scripts/gen/sync-voxel-three.js && node scripts/gen/bundle-voxel.cjs
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'voxel-src');
const OUT = path.join(ROOT, 'public/voxel');
// key -> 源子目录(b612-game 是单文件,特殊处理)
const PAGES = { b612: 'b612', fox: 'fox', rose: 'rose', koi: 'koi' };

// 相对 importmap:three 核心 + addons 子路径映射到同目录 three/
const IMPORTMAP =
  '<script type="importmap">\n' +
  '{"imports":{"three":"./three/three.module.js","three/addons/":"./three/examples/jsm/"}}\n' +
  '</script>';

const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vxb-'));

async function buildPage(key, srcHtml) {
  let html = fs.readFileSync(srcHtml, 'utf-8');
  // 去 tailwind CDN(若存在)
  html = html.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@tailwindcss\/browser@4"><\/script>\s*/, '');
  // 去源 importmap(将注入共享版)
  html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '');
  // 提取 module 业务码
  const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  if (!m) throw new Error(key + ': 源无 module 脚本');
  const entry = path.join(tmp, key + '.mjs');
  fs.writeFileSync(entry, m[1]);
  const out = path.join(tmp, key + '.bundle.js');
  // external three/addons:业务码保留裸导入,由页内 importmap 解析
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    outfile: out,
    external: ['three', 'three/addons/*'],
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const bundle = fs.readFileSync(out, 'utf-8');
  // 注入 importmap + 业务 module(替换原 module 脚本位置)
  html = html.replace(/<script type="module">[\s\S]*?<\/script>/, IMPORTMAP + '\n<script type="module">\n' + bundle + '\n</script>');
  fs.writeFileSync(path.join(OUT, key + '.html'), html);
  console.log(key, '业务码', bundle.length, 'B, html', html.length, 'B');
}

(async () => {
  // 共享 three 必须已同步
  if (!fs.existsSync(path.join(OUT, 'three/three.module.js'))) {
    throw new Error('缺 public/voxel/three/three.module.js,请先跑 node scripts/gen/sync-voxel-three.js');
  }
  for (const [key, dir] of Object.entries(PAGES)) {
    await buildPage(key, path.join(SRC, dir, 'index.html'));
  }
  // b612-game:单文件源
  await buildPage('b612-game', path.join(SRC, 'b612-game.html'));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('[bundle-voxel] 五页生成完成(共享 three)');
})().catch((e) => {
  console.error('[bundle-voxel] FAIL', e.message);
  process.exit(1);
});