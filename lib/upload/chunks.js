// chunks.js — 分片上传的暂存账本与残片治理(2026-10-12 审计挂账 R2 第一步自 lib/files-upload.js 原样搬入)
// 背景:Cloudflare 边缘→源站回源带宽被运营商压到 ~12-40KB/s,>1MB 的上传撑满 100s 超时 → 524。
// 方案:前端按 256KB 切片逐片 POST(每片几秒内完成),服务端按序暂存 .chunks/,最后一片触发改名+同一后处理。
// DG-UP-002(2026-10-11)整改三件(口径一字未改):
//   ① 残片 GC 周期化(此前唯一调用点在末片合并路径里 ⇒ 只发首片的攻击者永不触发清扫,残片无限占盘);
//   ② 在途配额(按 IP 记字节与并发上传数 + 全局并发上限)——残片不进 gateData.uploads,
//      lib/abuse.js 的设备累计统计看不见它们,必须本模块自己记账;
//   ③ 体积上限前移(首片按声明片数判"不可能更小"的下限即拒,每片再按累计实字节即时拒,
//      不再只在末片算总账:4000 片只为一张图也能一路写满 1.5GB 才报 413)。
const fs = require('fs');
const path = require('path');
const { ROOT } = require('../config');

const CHUNK_DIR = process.env.CHUNK_DIR || path.join(ROOT, '.chunks'); // 点目录,静态黑名单天然拦截公网(可重定向给测试/运维)
const CHUNK_MAX_BYTES = 400 * 1024;               // 单片硬上限(前端按 256KB 切)
const CHUNK_NOMINAL_BYTES = 256 * 1024;           // 客户端标称片长(src/gate/upload-rules.mjs CHUNK_SIZE)
const CHUNK_STALE_MS = 24 * 3600 * 1000;          // 超过 24h 的残片视为废弃(AGENTS.md 既有口径)
const CHUNK_GC_INTERVAL_MS = 3600 * 1000;         // 每小时扫一次
const CHUNK_MAX_PARTS = 4000;                     // 片数上限(既有口径)
// 在途配额:超限 503(容量保护,不是行为惩罚 —— 残片占满磁盘后连正常上传都写不进去)
const INFLIGHT_BYTES_PER_IP = 2 * 1024 * 1024 * 1024;
const INFLIGHT_MAX_UPLOADS_PER_IP = 8;
const INFLIGHT_MAX_UPLOADS = 200;

const inflightIp = new Map();   // ip -> { bytes, uploads }
const chunkLedger = new Map();  // 'ip|ownerKey|dir|name' -> { ip, bytes, ts }
const chunkGcCount = { sweeps: 0, removed: 0 };

function ipOf(req) {
  try { return require('../store').realIP(req) || 'unknown'; } catch (e) { return 'unknown'; }
}
function ledgerId(ip, ownerKey, dir, name) { return ip + '|' + ownerKey + '|' + dir + '|' + name; }
function partPath(ownerKey, name, seq) {
  return path.join(CHUNK_DIR, ownerKey + '-' + name + '.' + seq + '.part'); // isValidName 已挡斜杠,name 必为纯文件名
}
function globalInflightUploads() {
  let n = 0;
  for (const v of inflightIp.values()) n += v.uploads;
  return n;
}
function inflightStats() {
  let bytes = 0, uploads = 0;
  for (const v of inflightIp.values()) { bytes += v.bytes; uploads += v.uploads; }
  return { bytes, uploads, ips: inflightIp.size, tracked: chunkLedger.size, sweeps: chunkGcCount.sweeps, removed: chunkGcCount.removed };
}
// 首片准入:返回 null=放行,否则为拒绝原因(perip/global/bytes)
function beginInflight(ip, id, projectedBytes) {
  const cur = inflightIp.get(ip) || { bytes: 0, uploads: 0 };
  if (cur.uploads >= INFLIGHT_MAX_UPLOADS_PER_IP) return 'perip';
  if (globalInflightUploads() >= INFLIGHT_MAX_UPLOADS) return 'global';
  if (cur.bytes + Math.max(0, projectedBytes) > INFLIGHT_BYTES_PER_IP) return 'bytes';
  inflightIp.set(ip, cur);
  chunkLedger.set(id, { ip, bytes: 0, ts: Date.now() });
  cur.uploads += 1;
  return null;
}
function addInflightBytes(ip, id, n) {
  const led = chunkLedger.get(id);
  if (!led) return;
  led.bytes += n;
  led.ts = Date.now();
  const cur = inflightIp.get(ip);
  if (cur) cur.bytes = Math.max(0, cur.bytes + n);
}
function releaseInflight(id) {
  const led = chunkLedger.get(id);
  if (!led) return;
  chunkLedger.delete(id);
  const cur = inflightIp.get(led.ip);
  if (cur) {
    cur.bytes = Math.max(0, cur.bytes - led.bytes);
    cur.uploads = Math.max(0, cur.uploads - 1);
    if (!cur.uploads && !cur.bytes) inflightIp.delete(led.ip);
  }
}
function hasLedger(id) { return chunkLedger.has(id); }
function ledgerBytes(id) { const led = chunkLedger.get(id); return led ? led.bytes : 0; }
// 清掉本次上传已落的全部分片(拒绝/失败路径),被拒的残片不许继续占盘
function dropChunks(ownerKey, name) {
  const prefix = ownerKey + '-' + name + '.';
  try {
    for (const f of fs.readdirSync(CHUNK_DIR)) if (f.startsWith(prefix)) { try { fs.unlinkSync(path.join(CHUNK_DIR, f)); } catch (e) {} }
  } catch (e) {}
}
// 24h 龄期清扫:删过期残片 + 释放其记账(账本按最后活动时间过期,与文件同口径)
function sweepStaleChunks(now) {
  const t0 = now || Date.now();
  chunkGcCount.sweeps++;
  try {
    for (const f of fs.readdirSync(CHUNK_DIR)) {
      try {
        const p = path.join(CHUNK_DIR, f);
        if (t0 - fs.statSync(p).mtimeMs > CHUNK_STALE_MS) { fs.unlinkSync(p); chunkGcCount.removed++; }
      } catch (e) {}
    }
  } catch (e) {}
  for (const [id, led] of chunkLedger) {
    if (t0 - led.ts > CHUNK_STALE_MS) releaseInflight(id);
  }
  return chunkGcCount.removed;
}
let chunkGcTimer = null;
// 周期 GC:句柄可清(stopChunkGc 供测试与关停用);unref 保证定时器永不拖住进程退出
function startChunkGc() {
  if (chunkGcTimer) return false;
  chunkGcTimer = setInterval(() => { try { sweepStaleChunks(); } catch (e) {} }, CHUNK_GC_INTERVAL_MS);
  if (chunkGcTimer.unref) chunkGcTimer.unref();
  return true;
}
function stopChunkGc() {
  if (!chunkGcTimer) return false;
  clearInterval(chunkGcTimer);
  chunkGcTimer = null;
  return true;
}
function chunkGcOn() { return !!chunkGcTimer; }
sweepStaleChunks();      // 模块加载即清一次(此前残片要等"有人完成一次末片合并"才被扫)
startChunkGc();
// 测试钩子:清内存记账(不动磁盘),让用例之间互不牵连
function _resetChunkState() {
  inflightIp.clear();
  chunkLedger.clear();
  chunkGcCount.sweeps = 0;
  chunkGcCount.removed = 0;
}

// 末片合并:校验齐全 → 占在途写盘名额 → 'wx' 独占创建拿 fd → 流式拼接(避免 Buffer.concat 全量
// 读入内存导致 OOM)→ 清残片。失败时把自己刚建出来的半成品摘掉,不许留幽灵文件占死这个名字。
// 抛出的错误带着调用方要回的状态码:httpCode=413/409、capacity=true(带 quota 句柄)、其余=分片不完整 409。
async function assemble(opts) {
  const { ownerKey, name, total, finalPath, dirPath, maxBytes, reserveMerge } = opts;
  let merged = false;
  let createdTarget = false; // 'wx' 之后失败要把自己建的半成品摘掉,不许留幽灵文件
  let mergeSlot = null, mergeReject = null; // DG-SEC-005:合并写盘那一刻才占在途名额
  try {
    // 流式拼接(2026-07-31):避免 Buffer.concat 全量读入内存导致 OOM
    let totalSize = 0;
    for (let i = 0; i < total; i++) {
      const p = partPath(ownerKey, name, i);
      if (!fs.existsSync(p)) throw new Error('缺第 ' + (i + 1) + ' 片');
      totalSize += fs.statSync(p).size;
    }
    if (totalSize > maxBytes) throw Object.assign(new Error(opts.tooBigMessage), { httpCode: 413 });
    // DG-SEC-005 在途写盘硬闸:合并 = 这条路上真正落盘的一刻。被拒时分片原样保留,
    //   客户端按 Retry-After 重发末片就能续上(不 dropChunks、不还额度,免得合法上传被自己挤死)
    mergeSlot = reserveMerge(totalSize);
    if (!mergeSlot.allow) { mergeReject = mergeSlot; mergeSlot = null; throw Object.assign(new Error('存储容量或写入并发已达上限，请稍后再试'), { capacity: true, slot: mergeReject }); }
    // 组装输出用 'wx' 独占创建拿 fd:分片期间别人抢先落了同名文件 ⇒ EEXIST ⇒ 409
    //   (与直传同规;不再靠"existsSync 查两次"兜竞态窗口)
    let ffd;
    try { ffd = fs.openSync(finalPath, 'wx'); }
    catch (e) { if (e && e.code === 'EEXIST') throw Object.assign(new Error('同名文件已存在，请改名后再上传'), { httpCode: 409 }); throw e; }
    createdTarget = true;
    const mws = fs.createWriteStream(finalPath, { fd: ffd });
    for (let i = 0; i < total; i++) {
      const p = partPath(ownerKey, name, i);
      await new Promise((ok, fail) => { const rs = fs.createReadStream(p); rs.pipe(mws, { end: false }); rs.on('end', ok); rs.on('error', fail); });
    }
    mws.end();
    await new Promise(ok => mws.on('finish', ok));
    merged = true;
    for (let i = 0; i < total; i++) fs.unlinkSync(partPath(ownerKey, name, i));
    return { ok: true, totalSize };
  } catch (e) {
    if (createdTarget && !merged) { try { fs.unlinkSync(finalPath); } catch (e3) {} } // 半成品不留,否则该名字被幽灵文件占死
    throw e;
  } finally {
    if (mergeSlot) mergeSlot.release(); // 合并成功/失败/断连都还位(release 幂等)
  }
}

module.exports = {
  CHUNK_DIR, CHUNK_MAX_BYTES, CHUNK_NOMINAL_BYTES, CHUNK_STALE_MS, CHUNK_GC_INTERVAL_MS, CHUNK_MAX_PARTS,
  INFLIGHT_BYTES_PER_IP, INFLIGHT_MAX_UPLOADS_PER_IP, INFLIGHT_MAX_UPLOADS,
  ipOf, ledgerId, partPath, inflightStats, beginInflight, addInflightBytes, releaseInflight,
  hasLedger, ledgerBytes, dropChunks, sweepStaleChunks, startChunkGc, stopChunkGc, chunkGcOn,
  assemble, _resetChunkState,
};
