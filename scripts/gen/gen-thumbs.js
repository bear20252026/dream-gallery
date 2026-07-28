// gen-thumbs.js — 照片缩略图生成器(服务器/本地通用,需 ffmpeg)
// 扫描 photos/,为每张图生成 photos/thumbs/<同名>.webp(1024px,q4,约 60-100KB)
// 前端 loadTexCapped 优先拉缩略图,404 回退原图;后台/下载仍用原图
// 用法: node gen-thumbs.js [--root /opt/gallery]
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = process.argv.includes('--root')
  ? process.argv[process.argv.indexOf('--root') + 1]
  : path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'photos');
const DST = path.join(SRC, 'thumbs');
const IMG_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif'];

fs.mkdirSync(DST, { recursive: true });
let made = 0, skipped = 0, failed = 0;
for (const f of fs.readdirSync(SRC)) {
  const ext = path.extname(f).toLowerCase();
  if (!IMG_EXT.includes(ext)) continue;
  const out = path.join(DST, f.replace(/\.[^.]+$/, '.webp'));
  try {
    if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(path.join(SRC, f)).mtimeMs) { skipped++; continue; }
    const r = spawnSync('ffmpeg', ['-y', '-i', path.join(SRC, f), '-vf', "scale='min(1024,iw)':-2", '-q:v', '4', out], { stdio: 'ignore' });
    if (r.status === 0 && fs.existsSync(out)) made++;
    else failed++;
  } catch (e) { failed++; }
}
console.log(`[thumbs] 生成 ${made} 张,跳过(已最新) ${skipped},失败 ${failed}`);
