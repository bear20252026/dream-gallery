// upload-rules.mjs — 访客上传的客户端预校验单一源(2026-09-24 自 upload.js 抽出)
// upload.js 原本 isVid 判定写了两份(选文件处/上传处)、阈值散落 —— 抽到这里统一,
// 服务端 lib/files-upload.js 仍做最终校验(客户端预检只为体验,不是安全边界)。
export const VID_EXT = /\.(mp4|webm|mov|m4v|mkv|avi|flv|wmv|ts|m2ts|3gp|mpg|mpeg)$/i;

/** 按扩展名或 MIME 判视频(两处旧判定合一) */
export function isVideo(name, type) {
  return VID_EXT.test(name || '') || /^video\//.test(type || '');
}

/** 大小上限:视频 700MB / 图片 50MB(与选文件处的文案同步改) */
export function maxBytes(isVid) {
  return isVid ? 700 * 1024 * 1024 : 50 * 1024 * 1024;
}

/** ≤384KB 直传;超过走 256KB 分片(CF 回源限流应急,2026-07-28) */
export const DIRECT_MAX = 384 * 1024;
export const CHUNK_SIZE = 256 * 1024;

export function isDirect(size) {
  return size <= DIRECT_MAX;
}

export function chunkCount(size) {
  return Math.ceil(size / CHUNK_SIZE);
}

/** 扩展名净化:小写、去非法字符、按媒体类型兜底 */
export function sanitizeExt(name, isVid) {
  const fallback = isVid ? 'mp4' : 'jpg';
  return (String(name || '').split('.').pop() || fallback).toLowerCase().replace(/[^a-z0-9]/g, '') || fallback;
}
