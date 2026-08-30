// 上传本地 GLB 到 R2(cloudbear R2 bucket gallery-media)
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const R2 = new S3Client({
  region: 'auto',
  endpoint: 'https://52eab2ceafe4c07d54bdea60443ad115.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: 'e486f9216a06e21e4f06aa74d5ee366e',
    secretAccessKey: '47fb5b8e41fedc061ce88814a3e8289843fe224edacb47ed116ec29ee1dc7fbc',
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