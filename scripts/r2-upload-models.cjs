#!/usr/bin/env node
// r2-upload-models.cjs — 把本地 models/ 镜像到 R2(2026-09-24,主人批准"模型走 R2 CDN")
// 用法: R2_ENDPOINT=... R2_ACCESS_KEY=... R2_SECRET_KEY=... node scripts/r2-upload-models.cjs
// 上传后模型经 https://cdn.cloudbear.cloud/models/... 边缘分发(带 immutable 缓存头),
// 前端 gltf-loader.js 自动改写并带源站回退。凭据只读环境变量,永不落库(2026-08-31 泄露教训)。
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY;
const R2_SECRET_KEY = process.env.R2_SECRET_KEY;
if (!R2_ENDPOINT || !R2_ACCESS_KEY || !R2_SECRET_KEY) {
  console.error('缺少 R2 凭据(R2_ENDPOINT / R2_ACCESS_KEY / R2_SECRET_KEY)');
  process.exit(1);
}
const R2 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
  forcePathStyle: true,
});
const BUCKET = 'gallery-media';
const ROOT = path.join(__dirname, '..', 'models');
const SKIP = new Set(['.DS_Store', 'Thumbs.db']);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = path.join(dir, name);
    const s = fs.statSync(p);
    if (s.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

(async () => {
  const files = walk(ROOT);
  console.log(`[r2-models] 本地 ${files.length} 个文件`);
  let up = 0,
    same = 0,
    fail = 0;
  for (const f of files) {
    const key = 'models/' + path.relative(ROOT, f).split(path.sep).join('/');
    const body = fs.readFileSync(f);
    try {
      // 秒级续传:head 命中且长度一致就跳过(模型是持久资产,内容变更必换文件名/过 md5 流程)
      const head = await R2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
      if (head.ContentLength === body.length) {
        same++;
        continue;
      }
    } catch (e) {
      /* 404 = 新文件 */
    }
    try {
      await R2.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: body,
          ContentType: /\.glb$/.test(key)
            ? 'model/gltf-binary'
            : /\.gltf$/.test(key)
              ? 'model/gltf+json'
              : /\.bin$/.test(key)
                ? 'application/octet-stream'
                : /\.webp$/.test(key)
                  ? 'image/webp'
                  : 'application/octet-stream',
          CacheControl: 'public, max-age=31536000, immutable',
        })
      );
      up++;
      console.log('  ↑ ' + key + ' (' + (body.length / 1024).toFixed(0) + 'KB)');
    } catch (e) {
      fail++;
      console.error('  ✗ ' + key + ': ' + e.message);
    }
  }
  console.log(`[r2-models] 完成: 上传 ${up} / 相同 ${same} / 失败 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
