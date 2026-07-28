// tools/r2-upload.js — 把本地目录上传到 Cloudflare R2(零依赖,SigV4 签名)
// 用法:
//   set R2_ACCOUNT_ID=xxx && set R2_ACCESS_KEY_ID=xxx && set R2_SECRET_ACCESS_KEY=xxx
//   node tools/r2-upload.js <本地目录> [R2前缀] [--skip=关键词]
// 例: node tools/r2-upload.js videos videos --skip=backup
// 密钥只从环境变量读,不写任何文件。
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const ACCOUNT = process.env.R2_ACCOUNT_ID;
const AK = process.env.R2_ACCESS_KEY_ID;
const SK = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.R2_BUCKET || 'gallery-media';
if (!ACCOUNT || !AK || !SK) { console.error('缺少环境变量 R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY'); process.exit(1); }

const localDir = process.argv[2];
const prefix = (process.argv[3] || '').replace(/^\/+|\/+$/g, '');
const skipArg = (process.argv.find(a => a.startsWith('--skip=')) || '').slice(7);
const onlyArg = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
if (!localDir || !fs.statSync(localDir).isDirectory()) { console.error('用法: node tools/r2-upload.js <本地目录> [R2前缀] [--skip=关键词]'); process.exit(1); }

const HOST = `${ACCOUNT}.r2.cloudflarestorage.com`;
const MIME = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t', '.mp3': 'audio/mpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
// SigV4 规范:URI 中除 A-Za-z0-9-._~ 与 / 外一律百分号编码(encodeURIComponent 会漏 !'()* 导致签名不匹配)
function uriEncodeSeg(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}
function uriEncodeKey(key) { return key.split('/').map(uriEncodeSeg).join('/'); }

function sign(method, key, hash, date, amzDate) {
  const uri = '/' + BUCKET + '/' + uriEncodeKey(key);
  const headers = `host:${HOST}\nx-amz-content-sha256:${hash}\nx-amz-date:${amzDate}\n`;
  const canonical = `${method}\n${uri}\n\n${headers}\nhost;x-amz-content-sha256;x-amz-date\n${hash}`;
  const scope = `${date}/auto/s3/aws4_request`;
  const toSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${crypto.createHash('sha256').update(canonical).digest('hex')}`;
  const k = ['date', 'region', 'service', 'request'].reduce((k, s, i) =>
    crypto.createHmac('sha256', k).update([date, 'auto', 's3', 'aws4_request'][i]).digest(), 'AWS4' + SK);
  return `AWS4-HMAC-SHA256 Credential=${AK}/${scope},SignedHeaders=host;x-amz-content-sha256;x-amz-date,Signature=${crypto.createHmac('sha256', k).update(toSign).digest('hex')}`;
}

function put(key, filePath) {
  return new Promise((resolve, reject) => {
    const body = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(body).digest('hex');
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const date = amzDate.slice(0, 8);
    const req = https.request({
      host: HOST, path: `/${BUCKET}/${uriEncodeKey(key)}`, method: 'PUT',
      headers: {
        'x-amz-content-sha256': hash, 'x-amz-date': amzDate,
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Content-Length': body.length,
        'Authorization': sign('PUT', key, hash, date, amzDate),
      },
    }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        if (res.statusCode === 200) resolve();
        else reject(new Error(`HTTP ${res.statusCode}: ${d.slice(0, 300)}`));
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

(async () => {
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else files.push(p);
    }
  })(localDir);
  const list = files.filter(f => (!skipArg || !f.includes(skipArg)) && (!onlyArg || f.includes(onlyArg)));
  console.log(`共 ${list.length} 个文件待上传(跳过含「${skipArg || '无'}」的 ${files.length - list.length} 个)`);
  let ok = 0;
  for (const f of list) {
    const rel = path.relative(localDir, f).replace(/\\/g, '/');
    const key = prefix ? `${prefix}/${rel}` : rel;
    const sizeMB = (fs.statSync(f).size / 1048576).toFixed(1);
    try {
      await put(key, f);
      console.log(`✓ ${key} (${sizeMB}MB)`); ok++;
    } catch (e) { console.error(`✗ ${key}: ${e.message}`); }
  }
  console.log(`完成: ${ok}/${list.length}`);
})();
