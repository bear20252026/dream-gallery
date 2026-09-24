#!/usr/bin/env node
// r2-upload-models-rest.cjs — 经 CF REST API 把本地 models/ 镜像到 R2(2026-09-24)
// 通道与 lib/r2sync.js 完全一致(PUT /client/v4/accounts/{acc}/r2/buckets/{bucket}/objects/{key}),
// 凭据用服务器 .env 的 CF_R2_TOKEN / CF_R2_ACCOUNT(凭据只走环境变量,不落库)。
// 用法: CF_R2_TOKEN=... CF_R2_ACCOUNT=... node scripts/r2-upload-models-rest.cjs
const fs = require('fs');
const path = require('path');
const https = require('https');

const TOKEN = process.env.CF_R2_TOKEN;
const ACC = process.env.CF_R2_ACCOUNT;
const BUCKET = process.env.CF_R2_BUCKET || 'gallery-media';
if (!TOKEN || !ACC) {
  console.error('缺少 CF_R2_TOKEN / CF_R2_ACCOUNT');
  process.exit(1);
}
const ROOT = path.join(__dirname, '..', 'models');
const MIME = {
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
};
const encKey = (k) => k.split('/').map(encodeURIComponent).join('/');

function put(key, body) {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.cloudflare.com',
        path: `/client/v4/accounts/${ACC}/r2/buckets/${BUCKET}/objects/${encKey(key)}`,
        method: 'PUT',
        headers: {
          Authorization: 'Bearer ' + TOKEN,
          'Content-Type': MIME[path.extname(key).toLowerCase()] || 'application/octet-stream',
          'Content-Length': body.length,
          // R2 对象 HTTP 元数据:命中边缘缓存时随对象下发
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
        timeout: 120000,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      }
    );
    req.on('error', () => resolve(0));
    req.end(body);
  });
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === '.DS_Store' || name === 'Thumbs.db') continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

(async () => {
  const files = walk(ROOT);
  console.log(`[r2-models] 本地 ${files.length} 个文件`);
  let up = 0,
    fail = 0;
  for (const f of files) {
    const key = 'models/' + path.relative(ROOT, f).split(path.sep).join('/');
    const body = fs.readFileSync(f);
    const code = await put(key, body);
    if (code >= 200 && code < 300) {
      up++;
      console.log(`  ↑ ${key} (${(body.length / 1024).toFixed(0)}KB) ${code}`);
    } else {
      fail++;
      console.error(`  ✗ ${key} HTTP ${code}`);
    }
  }
  console.log(`[r2-models] 完成: 成功 ${up} / 失败 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
