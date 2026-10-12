// quota.js — 容量/并发硬闸(DG-SEC-005,2026-10-12)在上传流水线上的唯一接法
// (2026-10-12 审计挂账 R2 第一步自 lib/files-upload.js 原样搬入:判定与响应形态一字未改)
//
// 四种 slotKind 的口径(全部沿用 lib/abuse.js 的 reserveUploadSlot,本模块不加任何新判定):
//   'public'     访客直传 / 分片首片探测 / 分片末片合并 —— 走全部硬拒(水位 / 总预算 / 在途 4 并发)
//   'whiteboard' 匿名白板保存 —— 同上
//   'admin'      后台 token 直传(含大屏)—— 一律放行、只记在途账(主人的归档批量是正当负载)
//   预约体积:带了 Content-Length 就按声明体积预约,没带就按 SLOT_RESERVE_FALLBACK(8MB)
//   —— 绝不给匿名请求开"零体积"的空头;admin 没声明就是 0(它不受体积闸约束,记 0 更诚实)
//
// ⚠️ 还位对称是本模块存在的理由:finish / error / aborted / close / 超限 413 / 格式 415 / 预拒
//   每一条结束路径都必须 release() 一次,漏还会让 5 分钟兜底闸(SLOT_MAX_AGE_MS)之前的所有人
//   被 4 并发闸卡住。release() 做了进程内幂等(重复调用只还一次),底层 abuse.releaseUploadSlot
//   本身也是幂等的(还不存在的位=不动账)。
const abuse = require('../abuse');
const { sendJson } = require('../util');

// 写盘前预约:返回 { allow, release(), info }。allow=false 时用 reject() 回 503,一个字节都不写。
function reserve(kind, declaredBytes, dirPath) {
  const cl = declaredBytes > 0 ? declaredBytes : 0;
  const bytes = cl > 0 ? cl : (kind === 'admin' ? 0 : abuse.SLOT_RESERVE_FALLBACK);
  const slot = abuse.reserveUploadSlot(kind, bytes, dirPath);
  let freed = false;
  return {
    allow: !!slot.allow,
    kind,
    bytes,
    info: slot,
    release() {
      if (freed) return false;
      freed = true;
      try { if (typeof slot.done === 'function') return !!slot.done(); } catch (e) {}
      return false;
    },
  };
}

// 首片探测:按声明体积判一次闸就立刻还位(分片传输可以拖很久,不该把 4 个在途名额占满全场;
// 真合并那一刻再另占一位 —— 口径与改造前一致)
function probe(kind, declaredBytes, dirPath) {
  const handle = reserve(kind, declaredBytes, dirPath);
  if (handle.allow) handle.release();
  return handle;
}

// 容量/并发硬闸的拒绝出口:503 + Retry-After,拒绝时一个字节都还没写、文件都还没打开。
// reason 回给前端,便于"为什么传不上去"自查。
function reject(res, handle) {
  const slot = handle && handle.info ? handle.info : handle;
  try { if (typeof res.setHeader === 'function') res.setHeader('Retry-After', String(slot.retryAfter || 30)); } catch (e) {}
  sendJson(res, slot.status || 503, {
    error: '画廊存储容量或写入并发已达上限，请稍后再试',
    reason: slot.reason, detail: slot.detail, retryAfter: slot.retryAfter,
  });
}

// DG-UP-003:反刷的 BIGFILE(300MB)判定前移到 Content-Length / 每片累计阶段——
// 原先要整份写盘后才发现,等于允许攻击者每次刷满 300~700MB 的真实 I/O。
// 返回 'bigfile' = 拒(调用方回 429);设备累计与速率仍在写完后判(需要落盘尺寸/记录)。
function sizePrecheck(key, name, bytes) {
  let block = null;
  try { block = abuse.abuseSizePrecheck(key, name, bytes); } catch (e) {}
  return block;
}

// 落盘后的反刷硬拒(速率/单文件/设备累计):'rate'|'bigfile'|'volume' 由调用方删文件并 429,
// 'storage' 只是全局预警、不拦单人(调用方按"!== 'storage'"判定)
function check(key, name, bytes) {
  let block = null;
  try { block = abuse.abuseCheck(key, name, bytes); } catch (e) {}
  return block;
}

module.exports = { reserve, probe, reject, sizePrecheck, check, abuse };
