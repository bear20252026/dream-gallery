// ===================== R2 媒体自动同步(2026-08-29) =====================
// 需求:服务器(后台)增删媒体 → 自动镜像到 Cloudflare R2,保证"无论从哪加载,内容一致"。
// 原理:调用 R2 管理 API(零依赖 https):
//   PUT    /client/v4/accounts/{acc}/r2/buckets/{bucket}/objects/{key}  (body=文件流)
//   DELETE /client/v4/accounts/{acc}/r2/buckets/{bucket}/objects/{key}
// 配置:服务器 .env 的 CF_R2_TOKEN / CF_R2_ACCOUNT / CF_R2_BUCKET(默认 gallery-media)。
// 未配置 token 时全部静默跳过(本地开发安全);同步失败不阻塞主流程(调用方自行 catch)。
const https = require('https');
const fs = require('fs');
const { CF_R2_TOKEN, CF_R2_ACCOUNT, CF_R2_BUCKET, MIME } = require('./config');

const R2_HOST = 'api.cloudflare.com';
const BUCKET = CF_R2_BUCKET || 'gallery-media';
const CF_OK = !!(CF_R2_TOKEN && CF_R2_ACCOUNT);

function encKey(key) {
  // 整串编码(含 / → %2F),与 R2 管理 API 要求一致
  return encodeURIComponent(key);
}
function mimeFor(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return MIME['.' + ext] || 'application/octet-stream';
}
function objPath(key) {
  return `/client/v4/accounts/${CF_R2_ACCOUNT}/r2/buckets/${BUCKET}/objects/${encKey(key)}`;
}

// 上传/覆盖对象(流式,大文件不占内存)
function r2Put(dir, name, filePath) {
  if (!CF_OK) return Promise.resolve(null);
  const key = `${dir}/${name}`;
  return new Promise((resolve, reject) => {
    let stat;
    try { stat = fs.statSync(filePath); } catch (e) { resolve(false); return; }
    const req = https.request({
      host: R2_HOST,
      path: objPath(key),
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + CF_R2_TOKEN,
        'Content-Type': mimeFor(name),
        'Content-Length': stat.size,
      },
    }, res => {
      let b = '';
      res.on('data', d => { b += d; });
      res.on('end', () => {
        let ok = res.statusCode === 200;
        try { const j = JSON.parse(b); ok = !!(j && j.success); } catch (e) {}
        if (!ok) console.log(`[r2sync] PUT ${res.statusCode} ${key}`);
        resolve(ok);
      });
    });
    req.on('error', err => { console.log('[r2sync] PUT 失败', key, err.message); reject(err); });
    fs.createReadStream(filePath).pipe(req);
  });
}

// 删除对象
function r2Delete(dir, name) {
  if (!CF_OK) return Promise.resolve(null);
  const key = `${dir}/${name}`;
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: R2_HOST,
      path: objPath(key),
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + CF_R2_TOKEN },
    }, res => {
      let b = '';
      res.on('data', d => { b += d; });
      res.on('end', () => {
        let ok = res.statusCode === 200;
        try { const j = JSON.parse(b); ok = !!(j && j.success); } catch (e) {}
        if (!ok) console.log(`[r2sync] DELETE ${res.statusCode} ${key}`);
        resolve(ok);
      });
    });
    req.on('error', err => { console.log('[r2sync] DELETE 失败', key, err.message); reject(err); });
    req.end();
  });
}

module.exports = { r2Put, r2Delete };
