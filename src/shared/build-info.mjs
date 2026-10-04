// build-info.mjs — 版本戳显示(2026-10-03:版本号随每次发布自动更新)
// __B612_BUILD__ 由 vite.config.js 在构建时从 git 注入 {n, hash, date};
// 不经 Vite 直接跑源码(本地 server.js / 单测)时没有这个常量,显示「dev」。
/* global __B612_BUILD__ */
export function buildInfo() {
  const b = typeof __B612_BUILD__ !== 'undefined' ? __B612_BUILD__ : null;
  return b && b.n ? b : null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 闸门底行文字,如「Updated Oct 3, 2026 · v1.214」/「更新于 2026-10-03 · v1.214」 */
export function versionLine(info, lang = 'en') {
  if (!info) return lang === 'zh' ? '开发版' : 'dev build';
  const [y, m, d] = String(info.date || '').split('-').map(Number);
  const v = 'v1.' + info.n;
  if (!y) return v;
  return lang === 'zh'
    ? '更新于 ' + info.date + ' · ' + v
    : 'Updated ' + MONTHS[m - 1] + ' ' + d + ', ' + y + ' · ' + v;
}
