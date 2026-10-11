// ===================== R2 媒体自动同步(2026-08-29) =====================
// 需求:服务器(后台)增删媒体 → 自动镜像到 Cloudflare R2,保证"无论从哪加载,内容一致"。
// 原理:调用 R2 管理 API(零依赖 https):
//   PUT    /client/v4/accounts/{acc}/r2/buckets/{bucket}/objects/{key}  (body=文件流)
//   DELETE /client/v4/accounts/{acc}/r2/buckets/{bucket}/objects/{key}
// 配置:服务器 .env 的 CF_R2_TOKEN / CF_R2_ACCOUNT / CF_R2_BUCKET(默认 gallery-media)。
// 未配置 token 时全部静默跳过(本地开发安全);同步失败不阻塞主流程 —— 失败后的可靠重试不在本文件,
// 由 lib/r2outbox.js 的持久台账接手(2026-10-11 DG-R2-003)。
// DG-R2-001(2026-10-11):裸 https.request 无超时会永久挂住请求与 socket ——
//   现固定 15s 超时(destroy 触发 error)+ 有限重试(2 次,指数退避 + jitter)+ 成功/失败计数导出。
//   返回值语义不变:仍只 resolve(不 reject),true=成功 / false=失败 / null=未配置 CF。
// DG-R2-003(2026-10-11)计数分工(两层各管一件事,不重复统计、不要两处翻读数):
//   · 本文件 stats = **传输层**:一次 r2Put/r2Delete 调用最多 3 个 HTTP 请求(retry 计的是"本进程内
//     又发了一次请求"),ok/fail 计的是**这次调用**的最终结论。
//   · lib/r2outbox.js 的 outboxStats() = **对象层台账**:哪些对象还没进 CDN、挂了几次、多久后再试、
//     淘汰了几条、落盘几次;它的 transport 字段直接引用本文件的 r2Stats(),观测面收成一个读数口。
//   ⇒ 本文件**不再**新增任何"待重试清单"职责:跨进程可靠重试全归台账,本文件只管一次调用打死或成功。
const https = require('https');
const fs = require('fs');
const { CF_R2_TOKEN, CF_R2_ACCOUNT, CF_R2_BUCKET, MIME } = require('./config');

const R2_HOST = 'api.cloudflare.com';
const BUCKET = CF_R2_BUCKET || 'gallery-media';
const CF_OK = !!(CF_R2_TOKEN && CF_R2_ACCOUNT);
const R2_TIMEOUT_MS = 15000;
const R2_RETRIES = 2; // 首次之外的再试次数

// 镜像结果计数(供上层日志/后台观测;进程内累计,不落盘 —— 落盘的那份在 lib/r2outbox.js)
const stats = { ok: 0, fail: 0, retry: 0 };
function r2Stats() { return { ...stats }; }

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
function sleep(ms) {
  return new Promise(r => { const t = setTimeout(r, ms); t.unref && t.unref(); });
}
// 退避 0.3s/0.6s/1.2s…上限 4s,附 jitter 防多进程同步重试
function backoff(attempt) {
  return Math.min(4000, 300 * 2 ** attempt) + Math.floor(Math.random() * 250);
}
// 只对会自愈的错误重试:传输错误/超时(0)、5xx、429;4xx(权限/路径)重试无意义
function shouldRetry(status) {
  return status === 0 || status === 429 || status >= 500;
}

// 单次 PUT:resolve(true/false)+status;传输错误 resolve(false)(重试由外层决定)
function putOnce(key, filePath, size, name) {
  return new Promise(resolve => {
    let settled = false;
    const fin = r => { if (settled) return; settled = true; resolve(r); };
    const req = https.request({
      host: R2_HOST,
      path: objPath(key),
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + CF_R2_TOKEN,
        'Content-Type': mimeFor(name),
        'Content-Length': size,
      },
    }, res => {
      let b = '';
      res.on('data', d => { b += d; });
      res.on('end', () => {
        let ok = res.statusCode === 200;
        try { const j = JSON.parse(b); ok = !!(j && j.success); } catch (e) {}
        if (!ok) console.log(`[r2sync] PUT ${res.statusCode} ${key}`);
        fin({ ok, status: ok ? 200 : (res.statusCode || 0) });
      });
      res.on('error', () => fin({ ok: false, status: 0 }));
    });
    // 无超时 = 边缘拥塞时这条 PUT 可以永远挂着(2026-10-11 整改主因)
    req.setTimeout(R2_TIMEOUT_MS, () => req.destroy(new Error('r2 timeout')));
    req.on('error', err => { console.log('[r2sync] PUT 失败', key, err.message); fin({ ok: false, status: 0 }); });
    const src = fs.createReadStream(filePath);
    src.on('error', err => { console.log('[r2sync] PUT 读文件失败', key, err.message); try { req.destroy(); } catch (e) {} fin({ ok: false, status: 0 }); });
    src.pipe(req);
  });
}

function deleteOnce(key) {
  return new Promise(resolve => {
    let settled = false;
    const fin = r => { if (settled) return; settled = true; resolve(r); };
    const req = https.request({
      host: R2_HOST,
      path: objPath(key),
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + CF_R2_TOKEN },
    }, res => {
      let b = '';
      res.on('data', d => { b += d; });
      res.on('end', () => {
        let ok = res.statusCode === 200 || res.statusCode === 204;
        try { const j = JSON.parse(b); ok = !!(j && j.success); } catch (e) {}
        if (!ok) console.log(`[r2sync] DELETE ${res.statusCode} ${key}`);
        fin({ ok, status: ok ? 200 : (res.statusCode || 0) });
      });
      res.on('error', () => fin({ ok: false, status: 0 }));
    });
    req.setTimeout(R2_TIMEOUT_MS, () => req.destroy(new Error('r2 timeout')));
    req.on('error', err => { console.log('[r2sync] DELETE 失败', key, err.message); fin({ ok: false, status: 0 }); });
    req.end();
  });
}

// 带退避重试的通用执行器
async function withRetry(runOnce) {
  let last = { ok: false, status: 0 };
  for (let attempt = 0; attempt <= R2_RETRIES; attempt++) {
    if (attempt) { stats.retry++; await sleep(backoff(attempt)); }
    last = await runOnce();
    if (last.ok) { stats.ok++; return true; }
    if (!shouldRetry(last.status)) break;
  }
  stats.fail++;
  return false;
}

// 上传/覆盖对象(流式,大文件不占内存)
async function r2Put(dir, name, filePath) {
  if (!CF_OK) return null;
  const key = `${dir}/${name}`;
  let size;
  try { size = fs.statSync(filePath).size; }
  catch (e) { console.warn(`[r2sync] PUT 跳过(源文件不可读): ${key} ${e.message}`); stats.fail++; return false; }
  const ok = await withRetry(() => putOnce(key, filePath, size, name));
  if (!ok) console.warn(`[r2sync] PUT 最终失败 ${key}(交 r2outbox 台账按退避继续重试)`);
  return ok;
}

// 删除对象
async function r2Delete(dir, name) {
  if (!CF_OK) return null;
  const key = `${dir}/${name}`;
  const ok = await withRetry(() => deleteOnce(key));
  if (!ok) console.warn(`[r2sync] DELETE 最终失败 ${key}(交 r2outbox 台账按退避继续重试)`);
  return ok;
}

module.exports = { r2Put, r2Delete, r2Stats, R2_TIMEOUT_MS, R2_RETRIES };
