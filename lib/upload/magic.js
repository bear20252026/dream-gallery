// magic.js — 上传"格式闸门"的单一实现:扩展名白名单 + 各入口体积上限 + 对应的拒答文案
// (2026-10-12 审计挂账 R2 第一步:自 lib/files-upload.js / lib/bigscreen.js 原样搬入,判定结论一字未改)
//
// ⚠️ 为什么这里没有"文件头魔数"校验:本仓库从来没有实装过魔数嗅探(2026-10-11 外部审计提过
//   magic bytes,结论是"后果被 nosniff + 重编码抵消",未落地)。现在补嗅探会把今天能传成功的字节
//   判成 415/400 —— 那是**改变外部行为**,属 REFACTOR-PLAN R2 里需要主人拍板的另起一批(②③⑤),
//   本次"纯搬家"刻意不做。本模块就是把散在两处的扩展名白名单与体积上限收成一个出处。
const path = require('path');

// 公开上传规则(2026-07-25 主人定):任何人可传照片/视频,无需后台同意、不限张数——
//   全量格式:图片含动图/表情包(jpg/png/webp/gif/bmp/avif/heic/heif/tiff/ico;svg 已移除),
//   视频全格式(mp4/webm/mov/m4v/mkv/avi/flv/wmv/ts/m2ts/3gp/mpg/mpeg)
// SVG 已移除(2026-07-31):SVG 可含脚本导致 XSS,即使有 CSP script-src 'none' 仍需额外维护
const PUBLIC_IMG_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif', '.heic', '.heif', '.tiff', '.tif', '.ico'];
const PUBLIC_VID_EXT = ['.mp4', '.webm', '.mov', '.m4v', '.mkv', '.avi', '.flv', '.wmv', '.ts', '.m2ts', '.3gp', '.mpg', '.mpeg'];
const PUBLIC_MAX_IMG = 50 * 1024 * 1024;
const PUBLIC_MAX_VID = 700 * 1024 * 1024;
const PUBLIC_FORMAT_ERROR = '仅支持 photos 图片(全格式)和 videos 视频(全格式)';
const IMG_TOO_BIG = '图片不能超过 50MB';
const VID_TOO_BIG = '视频不能超过 700MB';

// 户外大屏(管理员入口):口径与访客侧刻意不同 —— 大屏要放长轮播片,上限 2GB 由 bigscreen.js 持有
const BSCREEN_EXT = ['.mp4', '.webm', '.m4v', '.mov', '.m3u8', '.mkv'];
const BSCREEN_FORMAT_ERROR = '仅支持视频:mp4/webm/m4v/mov/mkv 或 HLS:m3u8';
const BSCREEN_TOO_BIG = '大屏视频不能超过 2GB';

// 直传/分片两处同款判定:photos 只收图片、videos 只收视频,其余一律 400
function uploadKind(dir, name) {
  const ext = path.extname(name).toLowerCase();
  const isImg = dir === 'photos' && PUBLIC_IMG_EXT.includes(ext);
  const isVid = dir === 'videos' && PUBLIC_VID_EXT.includes(ext);
  return {
    ext,
    isImg,
    isVid,
    allowed: isImg || isVid,
    maxBytes: isVid ? PUBLIC_MAX_VID : PUBLIC_MAX_IMG,
    tooBigMessage: isVid ? VID_TOO_BIG : IMG_TOO_BIG,
  };
}

// 非公开分支(白板/后台 token 直传)的体积上限:与公开同规,但文案按目录区分(历史口径)
function maxBytesForDir(dir) {
  return dir === 'videos' ? PUBLIC_MAX_VID : PUBLIC_MAX_IMG;
}
function dirTooBigMessage(dir) {
  return dir === 'videos' ? VID_TOO_BIG : '文件不能超过 50MB';
}

function bscreenExtAllowed(name) {
  return BSCREEN_EXT.includes(path.extname(name).toLowerCase());
}

module.exports = {
  PUBLIC_IMG_EXT, PUBLIC_VID_EXT, PUBLIC_MAX_IMG, PUBLIC_MAX_VID, PUBLIC_FORMAT_ERROR,
  IMG_TOO_BIG, VID_TOO_BIG,
  BSCREEN_EXT, BSCREEN_FORMAT_ERROR, BSCREEN_TOO_BIG,
  uploadKind, maxBytesForDir, dirTooBigMessage, bscreenExtAllowed,
};
