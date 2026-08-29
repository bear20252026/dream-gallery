// 把官网 dist 上传到 R2 公开桶的 site/ 前缀下
// 访问: https://cdn.cloudbear.cloud/site/index.html
const fs = require('fs');
const path = require('path');
const https = require('https');

const TOKEN = process.env.CF_TOKEN;
const ACC = process.env.CF_ACC;
const BUCKET = process.env.CF_BUCKET || 'gallery-media';
const PREFIX = process.env.CF_PREFIX || 'site';
const DIST = process.env.LANDING_DIST;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function put(key, body, contentType) {
  return new Promise((resolve) => {
    const enc = key.split('/').map(encodeURIComponent).join('/');
    const req = https.request(
      {
        host: 'api.cloudflare.com',
        path: `/client/v4/accounts/${ACC}/r2/buckets/${BUCKET}/objects/${enc}`,
        method: 'PUT',
        headers: {
          Authorization: 'Bearer ' + TOKEN,
          'Content-Type': contentType,
          'Content-Length': body.length,
        },
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          let ok = false;
          try { ok = JSON.parse(d).success; } catch (e) {}
          resolve({ key, status: res.statusCode, ok });
        });
      }
    );
    req.on('error', (e) => resolve({ key, status: 0, ok: false, err: e.message }));
    req.write(body);
    req.end();
  });
}

function walk(dir, base = '') {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const rel = base ? base + '/' + name : name;
    if (fs.statSync(p).isDirectory()) out.push(...walk(p, rel));
    else out.push({ rel, abs: p });
  }
  return out;
}

(async () => {
  const files = walk(DIST);
  console.log(`待上传 ${files.length} 个文件 → ${BUCKET}/${PREFIX}/`);
  let ok = 0, fail = 0;
  for (const f of files) {
    const key = PREFIX + '/' + f.rel;
    const type = MIME[path.extname(f.rel).toLowerCase()] || 'application/octet-stream';
    const body = fs.readFileSync(f.abs);
    const r = await put(key, body, type);
    if (r.ok) { ok++; console.log(`  ✓ ${key} (${(body.length / 1024).toFixed(0)}KB)`); }
    else { fail++; console.log(`  ✗ ${key} -> HTTP ${r.status} ${r.err || ''}`); }
  }
  console.log(`\n完成: 成功 ${ok} / 失败 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
