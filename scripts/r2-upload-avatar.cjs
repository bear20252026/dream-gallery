// 上传本地 GLB 到 R2(cloudbear R2 bucket gallery-media)
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

// ⚠️ 2026-08-31 安全修正:原先写死在此处的 R2 密钥曾随 PUBLIC 仓库泄露,已改为环境变量读取。
//    必须去 Cloudflare 后台吊销并轮换那对密钥——删文件无效,提交历史已被公开克隆。
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY;
const R2_SECRET_KEY = process.env.R2_SECRET_KEY;
if (!R2_ENDPOINT || !R2_ACCESS_KEY || !R2_SECRET_KEY) {
  console.error('缺少 R2 凭据:请先设置环境变量 R2_ENDPOINT / R2_ACCESS_KEY / R2_SECRET_KEY');
  process.exit(1);
}
const R2 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY,
    secretAccessKey: R2_SECRET_KEY,
  },
  forcePathStyle: true,
});

const BUCKET = 'gallery-media';
const CDN = 'https://cdn.cloudbear.cloud/';
const ROOT = path.join(__dirname, '..');

async function upload(localPath, key) {
  const body = fs.readFileSync(localPath);
  // 查远端是否已存在(避免覆盖旧版)
  const exists = await R2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })).then(() => true).catch(() => false);
  if (exists && !process.env.FORCE) {
    console.log('已存在,跳过:', key, '(', body.length, 'bytes )');
    return;
  }
  await R2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: 'model/gltf-binary',
    CacheControl: 'public, max-age=86400',
  }));
  console.log('✓ 上传:', key, '(', body.length, 'bytes )  → ', CDN + key);
}

(async () => {
  const dir = process.argv[2] || '.docs-bak/catwalk-glb';
  const prefix = process.argv[3] || 'models/avatar/catwalk/';
  const fullDir = path.resolve(ROOT, dir);
  const files = fs.readdirSync(fullDir).filter((f) => f.endsWith('.glb'));
  for (const f of files) {
    await upload(path.join(fullDir, f), prefix + f);
  }
})();