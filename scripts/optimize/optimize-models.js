#!/usr/bin/env node
// optimize-models.js — 3D 模型优化管线(2026-08-22 大厂标准)
// 检查 public/models/ 下的 GLTF/GLB 文件,输出大小报告
// 用法: node scripts/optimize/optimize-models.js
// 完整优化需安装 gltf-pipeline: npm install --save-dev gltf-pipeline

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MODELS_DIR = path.join(ROOT, 'public', 'models');

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (/\.(gltf|glb)$/i.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function main() {
  const files = walk(MODELS_DIR);
  if (files.length === 0) {
    console.log('[models] 未找到 GLTF/GLB 文件');
    return;
  }

  console.log(`[models] 找到 ${files.length} 个 3D 模型文件:\n`);

  let totalSize = 0;
  const entries = [];

  for (const file of files) {
    const size = fs.statSync(file).size;
    totalSize += size;
    entries.push({ file: path.relative(ROOT, file), size });
  }

  // 按大小排序
  entries.sort((a, b) => b.size - a.size);

  for (const { file, size } of entries) {
    const mb = (size / 1024 / 1024).toFixed(2);
    const warn = size > 5 * 1024 * 1024 ? ' ⚠️ >5MB' : '';
    console.log(`  ${file.padEnd(50)} ${mb}MB${warn}`);
  }

  console.log(`\n[models] 总大小: ${(totalSize / 1024 / 1024).toFixed(1)}MB`);

  // 建议
  const large = entries.filter(e => e.size > 2 * 1024 * 1024);
  if (large.length > 0) {
    console.log(`\n[models] 建议压缩以下文件(>2MB):`);
    for (const { file } of large) {
      console.log(`  npx gltf-pipeline -i ${file} -o ${file.replace(/\.(gltf|glb)$/, '.optimized.$1')} --draco.compressionLevel 7`);
    }
  }
}

main();
