#!/usr/bin/env node
// optimize-textures.js — 纹理压缩管线(2026-08-22 大厂标准)
// 将 public/ 下的 PNG/JPEG 纹理转换为 WebP 格式(浏览器支持率 >97%)
// 用法: node scripts/optimize/optimize-textures.js [--dry-run]
// 依赖: sharp (npm install --save-dev sharp)

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PUBLIC = path.join(ROOT, 'public');
const DRY_RUN = process.argv.includes('--dry-run');

// 支持的图片格式
const IMG_EXTS = new Set(['.png', '.jpg', '.jpeg']);

// 跳过的目录(已压缩/特殊格式)
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'vendor', 'models']);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (IMG_EXTS.has(path.extname(entry.name).toLowerCase())) {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.error('[optimize] 需要安装 sharp: npm install --save-dev sharp');
    process.exit(1);
  }

  const files = walk(PUBLIC);
  console.log(`[optimize] 找到 ${files.length} 个图片文件`);

  let saved = 0;
  let converted = 0;

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const webpPath = file.replace(/\.(png|jpe?g)$/i, '.webp');

    // 跳过已有 WebP 版本的
    if (fs.existsSync(webpPath)) continue;

    const origSize = fs.statSync(file).size;

    if (DRY_RUN) {
      console.log(`  [dry-run] ${path.relative(ROOT, file)} (${(origSize / 1024).toFixed(0)}KB)`);
      continue;
    }

    try {
      const info = await sharp(file)
        .webp({ quality: 80, effort: 4 })
        .toFile(webpPath);

      const ratio = ((1 - info.size / origSize) * 100).toFixed(1);
      saved += origSize - info.size;
      converted++;
      console.log(`  ${path.relative(ROOT, file)} → WebP (-${ratio}%)`);
    } catch (e) {
      console.warn(`  [跳过] ${path.relative(ROOT, file)}: ${e.message}`);
    }
  }

  console.log(`\n[optimize] 完成: ${converted} 个文件转换, 节省 ${(saved / 1024 / 1024).toFixed(1)}MB`);
}

main().catch(console.error);
