// admin-core.js — 后台共享工具(2026-10-09 审查 P2 自 admin.js 切出,逐字迁移不改逻辑)
// 无状态纯工具。可变状态(DATA/RANGE/CAL_DATE)仍留 admin.js——横跨 8 个分区,第一阶段不动。

export const TOKEN = new URLSearchParams(location.search).get('token') || '';
// 2026-09-18 审计 P1#2:API 一律走 x-token 请求头;URL query 仅用于首次打开后台页
export const authH = () => (TOKEN ? { 'x-token': TOKEN } : {});
export const tk = () => ''; // 兼容旧调用拼接位,token 已在 header
export const tk2 = () => '';
export const tkq = () => '';
export async function adminFetch(url, init) {
  init = init || {};
  const headers = Object.assign({}, init.headers || {}, authH());
  return fetch(url, Object.assign({}, init, { headers }));
}

export function confirmAsync(msg) {
  return new Promise(function (resolve) {
    var m = $('cfm'),
      ok = $('cfmOk'),
      cancel = $('cfmCancel');
    $('cfmMsg').textContent = msg;
    m.classList.add('show');
    ok.onclick = function () {
      m.classList.remove('show');
      resolve(true);
    };
    cancel.onclick = function () {
      m.classList.remove('show');
      resolve(false);
    };
  });
}

export const $ = (id) => document.getElementById(id);
export const esc = (s) => {
  const d = document.createElement('div');
  d.textContent = String(s == null ? '' : s);
  return d.innerHTML;
};
// j():onclick 内联 JS 字符串专用转义(2026-07-28 OWASP 审计 🔴:esc() 不转引号,
// 文件名/备注可含 ' " → 公开上传构造文件名即可在后台页执行 JS 偷地址栏 token)。
// 凡把用户数据插进 onclick='…' / onclick="…" 的 JS 字符串位置,一律用 j() 不用 esc()。
export const j = (s) =>
  String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
export const fmt = (t) => (t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '-');
export const day0 = (t) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
export const todayStr = (t) => {
  var d = new Date(t || Date.now());
  var y = d.getFullYear(),
    m = String(d.getMonth() + 1).padStart(2, '0'),
    day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
};
export function toast(msg, err) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (err ? ' err' : '');
  t.style.display = 'block';
  setTimeout(() => (t.style.display = 'none'), 2200);
}

export function brandIcon(b) {
  var s = typeof b === 'object' ? b.brand || '' : b || '';
  if (/iPhone|iPad/.test(s)) return '🍎';
  if (/Windows|Mac|Linux/.test(s)) return '💻';
  return '📱';
}
export function brandShow(b) {
  if (typeof b === 'object') return b.full || b.brand || '未知';
  return String(b || '未知');
}
