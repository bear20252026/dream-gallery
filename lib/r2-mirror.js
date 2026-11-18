// r2-mirror.js — 媒体 R2 镜像三门面(2026-11-17 D1 阶段3 从 files-upload.js 拆出)
// ===================== 为什么独立成叶子 =====================
// admin 批量批准(approve-media)与 bigscreen 上传要调 r2Mirror,此前被迫懒 require 整个
// files-upload.js(上传编排层),与 files-upload 懒指 admin.tokenOk 构成唯一真环对。
// 本模块只收**镜像门面**(进程内待补推集合 + 持久台账接线),只依赖 r2outbox,
// admin/bigscreen 直依赖它,环对消失。files-upload re-export 保
// lib-r2-outbox.test 钉着的"镜像与删除必须经台账"契约。
//
// 两层补偿(2026-10-11 DG-R2-002 → DG-R2-003 持久台账):
//   ① 进程内 r2Failed 集合:供"媒体命中源站文件时补推一次"用(r2HealMedia,调用点在
//      lib/files-static.js 的媒体服务路径);
//   ② 持久台账:每次镜像事件**先记账再推**,推失败就把这条留在台账里按 30s→2m→10m→1h→6h 退避重试,
//      重启不丢(台账不进 gateData,独立小文件 .r2-outbox.json,公网被 staticDenied 三重挡住)。
const r2outbox = require('./r2outbox');

const r2Failed = new Set(); // 'dir|name' — 本进程见过失败的镜像键(①的账本)
const r2Pushing = new Set(); // 正在补推,去重防并发重复 PUT
function r2Key(dir, name) { return r2outbox.keyOf(dir, name); }
// 镜像一个媒体对象:记账 + 立即试一次(全异步,响应早已发出,不占上传时延)
function r2Mirror(dir, name, filePath) {
  const k = r2Key(dir, name);
  r2Failed.delete(k); // 新的事件:历史失败标记先摘掉,结论由本次尝试决定
  try {
    Promise.resolve(r2outbox.syncPut(dir, name, filePath)).then(
      st => { if (st === 'fail') r2Failed.add(k); },
      () => r2Failed.add(k)
    );
  } catch (e) { r2Failed.add(k); }
}
// 命中源站文件时调用:该对象曾在失败集合里才补推;返回是否发起了补推
function r2HealMedia(dir, name, filePath) {
  const k = r2Key(dir, name);
  if (!r2Failed.has(k) || r2Pushing.has(k)) return false;
  r2Pushing.add(k);
  try {
    Promise.resolve(r2outbox.syncPut(dir, name, filePath)).then(
      st => { r2Pushing.delete(k); if (st === 'ok') r2Failed.delete(k); },
      () => { r2Pushing.delete(k); }
    );
  } catch (e) { r2Pushing.delete(k); }
  return true;
}
// 待补推清单:进程内失败集合 ∪ 持久台账(台账里躺着的就是"CDN 目前可能没有"的对象)
function r2PendingMedia() {
  let keys = [];
  try { keys = r2outbox.pendingKeys(); } catch (e) {}
  return Array.from(new Set([...Array.from(r2Failed), ...keys])).sort();
}

module.exports = { r2Mirror, r2HealMedia, r2PendingMedia };