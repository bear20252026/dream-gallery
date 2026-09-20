// files.js — 媒体文件门面(2026-09-18 拆分后仅做接口聚合;审计 P3b)
// 静态读取:files-static.js(Range+gzip);写路径(列表/上传/分片/删除/压缩/AI 审核):files-upload.js。
// lib/routes.js 与 lib/docs.js 的 require('./files') 接口保持不变。
module.exports = {
  ...require('./files-static'),
  ...require('./files-upload'),
};
