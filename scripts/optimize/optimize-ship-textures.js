#!/usr/bin/env node
// optimize-ship-textures.js — 飞舟贴图一次性压缩(2026-09-24,主人问"加载能否更快")
// 背景:9-21 压缩管线只覆盖了 GLB(meshopt+webp 内嵌),strawberry_ship 是 .gltf+外挂贴图,
// 22MB 原图直出,是开机流量大头。本脚本:四张贴图 → sharp 缩到 2048 → webp,
// 并把 scene.gltf 的 image uri 改指 .webp(浏览器原生解码,无需扩展声明)。
// 一次性工具,跑完即归档备查。
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const DIR = path.join(__dirname, '..', '..', 'models', 'strawberry_ship');
const TEX = path.join(DIR, 'textures');
// 贴图角色 → 参数(法线/R/M 数据贴图质量给高,免接缝走样)
const PLAN = {
  'spaceship_baseColor.jpeg': { max: 2048, q: 82 },
  'spaceship_metallicRoughness.png': { max: 2048, q: 90 },
  'spaceship_emissive.jpeg': { max: 1024, q: 85 },
  'spaceship_normal.png': { max: 2048, q: 90 },
};

(async () => {
  const gltfPath = path.join(DIR, 'scene.gltf');
  const gltf = JSON.parse(fs.readFileSync(gltfPath, 'utf8'));
  let before = 0,
    after = 0;
  for (const img of gltf.images || []) {
    const old = img.uri;
    const base = path.basename(old);
    const plan = PLAN[base];
    if (!plan) continue;
    const src = path.join(DIR, old);
    const outName = base.replace(/\.(png|jpe?g)$/i, '.webp');
    const dst = path.join(TEX, outName);
    before += fs.statSync(src).size;
    await sharp(src)
      .resize({ width: plan.max, height: plan.max, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: plan.q })
      .toFile(dst);
    after += fs.statSync(dst).size;
    const kb = (n) => (n / 1024).toFixed(0) + 'KB';
    console.log(`${base} → ${outName}: ${kb(fs.statSync(src).size)} → ${kb(fs.statSync(dst).size)}`);
    img.uri = 'textures/' + outName; // 同目录改名,gltf 相对引用
  }
  fs.writeFileSync(gltfPath, JSON.stringify(gltf));
  console.log(
    `合计 ${(before / 1024 / 1024).toFixed(1)}MB → ${(after / 1024 / 1024).toFixed(1)}MB`
  );
})();
