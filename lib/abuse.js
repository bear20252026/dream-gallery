// abuse.js — 反刷存储预警:检测恶意大容量上传(人肉占盘攻击)
// 规则(2026-07-25 主人定):
//   速率:同设备 10 分钟内上传 >8 个文件 → 预警
//   总量:同设备累计上传 >2GB → 预警
//   大单:单文件 >300MB → 预警
//   全盘:photos+videos 目录 >10GB → 全局预警
// 预警写入 gateData.alerts 并在设备档案上打 suspicious 标记;后台可一键封闭 IP / 忽略
// 2026-10-12 DG-SEC-005 追加:低水位/总预算超支/在途写盘过多 ⇒ 硬拒「新增匿名上传」(见 reserveUploadSlot),后台 token 一律不拦
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./config');
const { gateData, saveGateData } = require('./store');
const { sendJson, readBody } = require('./util');
const { tokenOk } = require('./admin');

if (!gateData.alerts) gateData.alerts = [];

const RATE_WINDOW = 10 * 60 * 1000, RATE_MAX = 8;
const VOLUME_MAX = 2 * 1024 * 1024 * 1024;   // 单设备累计 2GB
const BIGFILE = 300 * 1024 * 1024;           // 单文件 300MB
const DISK_MAX = 10 * 1024 * 1024 * 1024;    // photos+videos 共 10GB

// ===== 全局容量与并发硬闸(2026-10-12 DG-SEC-005)=====
// 为什么这一条硬拒、那一条只预警:
//   预警 = 「单人可归责」的滥用(速率/单文件/设备累计)⇒ 只罚肇事设备,不连坐无辜访客;
//   硬拒 = 「全局资源事实」(目标盘剩余不足 / 媒体总量超预算 / 同时写盘太多)⇒ 拒新增的**匿名**上传,
//          回 503 + Retry-After 让它稍后重试;后台 token 直传一律不拦(主人自己要传,也只有他能清盘)。
const envNum = (v, dflt) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : dflt; };
const DISK_MIN_FREE = envNum(process.env.DISK_MIN_FREE_BYTES, 2 * 1024 * 1024 * 1024); // 目标盘剩余低于此 ⇒ 匿名上传 503
const UPLOAD_MAX_INFLIGHT = Math.max(1, envNum(process.env.UPLOAD_MAX_INFLIGHT, 4));   // 进程内在途写盘上限(2 核小机)
const SLOT_RESERVE_FALLBACK = 8 * 1024 * 1024; // 请求没带 Content-Length 时按典型照片体积预约,不给匿名体积开空头
const SLOT_MAX_AGE_MS = 5 * 60 * 1000;         // 兜底闸:漏掉的结束路径 5 分钟后自动还位(计数绝不永久泄漏)
const RETRY_AFTER_S = 30;
const MEDIA_STAT_TTL_MS = 15 * 1000;           // 目录总量统计要逐文件 stat,15 秒内复用同一读数

function pushAlert(type, dk, detail, file, size) {
  // 同类同人同文件 10 分钟内不重复报
  const dup = gateData.alerts.find(a => !a.dismissed && a.type === type && a.dk === dk && a.file === file && Date.now() - a.t < 10 * 60 * 1000);
  if (dup) return;
  // 设备档案:标记可疑 + 取昵称/IP
  let name = '访客', brand = '', ip = '';
  for (const a of Object.values(gateData.applicants || {})) {
    if (a.dk === dk) { a.suspicious = true; a.suspiciousReason = detail; name = a.answer || name; brand = a.brand || ''; ip = a.ip || ''; }
  }
  gateData.alerts.push({ t: Date.now(), type, dk, name, brand, ip, detail, file: file || '', size: size || 0, dismissed: false });
  if (gateData.alerts.length > 500) gateData.alerts.splice(0, gateData.alerts.length - 500);
  saveGateData();
}

function dirBytes(dir) {
  let sum = 0;
  try {
    for (const f of fs.readdirSync(path.join(ROOT, dir))) {
      try { sum += fs.statSync(path.join(ROOT, dir, f)).size; } catch (e) {}
    }
  } catch (e) {}
  return sum;
}

// 媒体目录总占用(带 15s 复用;_forceMediaBytes 是测试钩)
const mediaMemo = { bytes: 0, at: 0 };
let _forceMediaBytes = null;
function mediaBytes(force) {
  if (_forceMediaBytes !== null) return _forceMediaBytes;
  const now = Date.now();
  if (force || now - mediaMemo.at > MEDIA_STAT_TTL_MS) {
    mediaMemo.bytes = dirBytes('photos') + dirBytes('videos');
    mediaMemo.at = now;
  }
  return mediaMemo.bytes;
}

// 目标盘剩余字节。Node ≥22 有 fs.statfsSync;拿不到(旧 Node/异常/取不到块大小)时返回 null,
// 由调用方走降级口径(只用媒体总量闸),并在首次降级时告警点名——水位闸失效必须让运维看得见。
let _forceDiskFree = null;
let statfsWarned = false;
function diskFreeBytes(dir) {
  if (_forceDiskFree !== null) return _forceDiskFree;
  try {
    if (typeof fs.statfsSync !== 'function') {
      if (!statfsWarned) {
        statfsWarned = true;
        console.warn('[abuse] fs.statfsSync 不可用:磁盘剩余空间水位闸降级为「媒体目录总量统计」(硬拒仍生效,水位闸失效)');
      }
      return null;
    }
    const st = fs.statfsSync(dir || ROOT);
    const block = Number(st.bsize) || 0;
    return block > 0 ? Math.max(0, Number(st.bfree || 0) * block) : null;
  } catch (e) { return null; }
}

// 在途写盘账本:id -> { kind, bytes, ts };reservedBytes = 已预约但还没写完的体积
const uploadSlots = new Map();
let slotSeq = 0, reservedBytes = 0;

function reapStaleSlots(now) {
  const t = now || Date.now();
  for (const [id, s] of uploadSlots) {
    if (t - s.ts > SLOT_MAX_AGE_MS) { uploadSlots.delete(id); reservedBytes = Math.max(0, reservedBytes - s.bytes); }
  }
}

// 拒绝结果统一形态:503(资源不足不是访客的过错,不用 429 惩罚本人)
function rejectSlot(reason, detail) {
  return { allow: false, status: 503, reason, detail, retryAfter: RETRY_AFTER_S };
}

function takeSlot(kind, bytes) {
  const id = ++slotSeq;
  uploadSlots.set(id, { kind, bytes, ts: Date.now() });
  reservedBytes += bytes;
  return { allow: true, id, kind, bytes, done: () => releaseUploadSlot(id) };
}

// 写盘前硬闸(2026-10-12 DG-SEC-005):三闸全过才放行。
//   kind='public'|'whiteboard' 走全部硬拒;kind='admin'(后台 token/本地写权)一律放行,但仍占位在账,
//   这样匿名侧能看见"主人正在传大文件"的真实压力,反向不成立(匿名访客永不能挡住后台)。
// 放行时必须最终调用返回的 done() 一次(幂等);结束路径漏掉由 SLOT_MAX_AGE_MS 兜底回收。
function reserveUploadSlot(kind, bytes, dir) {
  const size = Math.max(0, Number(bytes) || 0);
  reapStaleSlots();
  if (kind !== 'admin') {
    if (uploadSlots.size >= UPLOAD_MAX_INFLIGHT) {
      return rejectSlot('inflight', `在途写盘已满 ${uploadSlots.size}/${UPLOAD_MAX_INFLIGHT}`);
    }
    const free = diskFreeBytes(dir);
    if (free !== null && free - size < DISK_MIN_FREE) {
      return rejectSlot('lowdisk', `目标盘剩余 ${(free / 1024 / 1024 / 1024).toFixed(2)}GB,本次要写 ${(size / 1024 / 1024).toFixed(0)}MB,低于水位 ${(DISK_MIN_FREE / 1024 / 1024 / 1024).toFixed(1)}GB`);
    }
    const usage = mediaBytes();
    if (usage + reservedBytes + size > DISK_MAX) {
      return rejectSlot('capacity', `媒体已占 ${(usage / 1024 / 1024 / 1024).toFixed(1)}GB + 在途预留 ${(reservedBytes / 1024 / 1024 / 1024).toFixed(1)}GB + 本次 ${(size / 1024 / 1024 / 1024).toFixed(2)}GB,超过总预算 ${(DISK_MAX / 1024 / 1024 / 1024).toFixed(0)}GB`);
    }
  }
  return takeSlot(kind, size);
}

// 还位(幂等:同一个 id 重复还、还一个不存在的 id 都不报错也不把计数打成负数)
function releaseUploadSlot(id) {
  const s = uploadSlots.get(id);
  if (!s) return false;
  uploadSlots.delete(id);
  reservedBytes = Math.max(0, reservedBytes - s.bytes);
  return true;
}

function uploadSlotStats() {
  return { inflight: uploadSlots.size, reserved: reservedBytes, max: UPLOAD_MAX_INFLIGHT, minFree: DISK_MIN_FREE, diskMax: DISK_MAX, free: diskFreeBytes(ROOT), media: mediaBytes() };
}

// 测试钩:复位账本与两个强制读数(不碰磁盘)
function _resetUploadSlots() {
  uploadSlots.clear();
  reservedBytes = 0;
  _forceDiskFree = null;
  _forceMediaBytes = null;
  mediaMemo.at = 0;
  statfsWarned = false;
}
function _setDiskFreeBytes(v) { _forceDiskFree = (v === null || v === undefined) ? null : Number(v); }
function _setMediaBytes(v) { _forceMediaBytes = (v === null || v === undefined) ? null : Number(v); }

// Content-Length / 分片累计阶段的体积预检(DG-UP-003 配套:BIGFILE 不必等写盘结束才拒)
// 只判单文件体积;设备累计与速率仍在 abuseCheck(写盘完成后)判,口径不变。
// 返回 null=放行,'bigfile'=调用方应硬拒(429)
function abuseSizePrecheck(dk, name, size) {
  try {
    if (!gateData.uploads || !(size > BIGFILE)) return null;
    pushAlert('bigfile', dk, `单文件 ${(size / 1024 / 1024).toFixed(0)}MB 超过 300MB(体积预检,未落盘)`, name, size);
    return 'bigfile';
  } catch (e) { return null; }
}

// 每次公开上传前/后调用(dk=上传者设备,name=文件名,size=字节)
// 返回 null=放行;返回 'rate'|'bigfile'|'volume'=调用方应硬拒(429);'storage' 只预警不拦单人
function abuseCheck(dk, name, size) {
  try {
    if (!gateData.uploads) return null;
    const now = Date.now();
    let block = null;
    // 1. 速率
    const mine = Object.entries(gateData.uploads).filter(([, u]) => u && u.dk === dk);
    const recent = mine.filter(([, u]) => now - u.ts < RATE_WINDOW);
    if (recent.length > RATE_MAX) {
      pushAlert('rate', dk, `10 分钟内上传 ${recent.length} 个文件(疑似刷盘)`, name, size);
      block = 'rate';
    }
    // 2. 单文件
    if (size > BIGFILE) {
      pushAlert('bigfile', dk, `单文件 ${(size / 1024 / 1024).toFixed(0)}MB 超过 300MB`, name, size);
      block = block || 'bigfile';
    }
    // 3. 设备累计(uploads 记录的文件名可能在 photos 或 videos,两个目录都找)
    let total = 0;
    for (const [n] of mine) {
      for (const d of ['photos', 'videos']) {
        try { total += fs.statSync(path.join(ROOT, d, n)).size; break; } catch (e) {}
      }
    }
    if (total > VOLUME_MAX) {
      pushAlert('volume', dk, `累计上传 ${(total / 1024 / 1024 / 1024).toFixed(1)}GB 超过 2GB`, name, size);
      block = block || 'volume';
    }
    // 4. 全盘占用(预警照旧:超阈值还要在台账里留一条能看见的记录;硬拒新匿名上传归 reserveUploadSlot)
    const disk = mediaBytes();
    if (disk > DISK_MAX) {
      pushAlert('storage', dk, `媒体目录总占用 ${(disk / 1024 / 1024 / 1024).toFixed(1)}GB 超过 10GB`, name, size);
    }
    return block;
  } catch (e) { return null; /* 预警失败不影响上传 */ }
}

// POST /api/admin/alerts {action:'dismiss'|'clear', idx}(token)
function handleAdminAlerts(req, res, query) {
  if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
  readBody(req, obj => {
    if (obj.action === 'dismiss') {
      const a = gateData.alerts[obj.idx];
      if (!a) { sendJson(res, 404, { error: '预警不存在' }); return; }
      a.dismissed = true;
      // 若该设备没有其他未处理预警,摘掉可疑标记
      const dk = a.dk;
      saveGateData();
      if (!gateData.alerts.some(x => !x.dismissed && x.dk === dk)) {
        for (const ap of Object.values(gateData.applicants || {})) if (ap.dk === dk) { ap.suspicious = false; ap.suspiciousReason = ''; }
        saveGateData();
      }
      sendJson(res, 200, { ok: true });
      return;
    }
    if (obj.action === 'clear') {
      gateData.alerts = [];
      for (const ap of Object.values(gateData.applicants || {})) { ap.suspicious = false; ap.suspiciousReason = ''; }
      saveGateData();
      sendJson(res, 200, { ok: true });
      return;
    }
    sendJson(res, 400, { error: 'action 必须是 dismiss 或 clear' });
  });
}

module.exports = {
  abuseCheck, abuseSizePrecheck, handleAdminAlerts, BIGFILE, VOLUME_MAX, RATE_MAX, RATE_WINDOW,
  // 新增能力(2026-10-12 DG-SEC-005):既有导出名与签名一字未动
  reserveUploadSlot, releaseUploadSlot, uploadSlotStats, diskFreeBytes, mediaBytes,
  DISK_MAX, DISK_MIN_FREE, UPLOAD_MAX_INFLIGHT, SLOT_MAX_AGE_MS, RETRY_AFTER_S, SLOT_RESERVE_FALLBACK,
  _resetUploadSlots, _setDiskFreeBytes, _setMediaBytes,
};
