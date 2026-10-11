// 通用工具函数
const path = require('path');
const { ROOT } = require('./config');

function sendJson(res, code, data) {
  const body = JSON.stringify(data);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff', // 安全头(2026-07-28 OWASP 审计)
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  };
  // 2026-09-18 审计 P1#4:不再无条件覆盖为 *；若 handler 已设 ACAO 则沿用
  // 单测 mock res 可能无 getHeader,按未设置处理
  const hasAco = typeof res.getHeader === 'function' && res.getHeader('Access-Control-Allow-Origin');
  if (!hasAco) {
    // 只在「能给出一个合法单值」时兜底:Access-Control-Allow-Origin 是单值头,
    // 把逗号分隔的 allowlist 原样回显永远匹配不上(2026-10-11 DG-CORS-002)。
    // 多 allowlist 且本请求 Origin 未命中(applySecurityHeaders 因此没设头)时一律不设 = 拒绝。
    const { CORS_ALLOW_ALL, CORS_ALLOWLIST } = require('./config');
    const list = [...(CORS_ALLOWLIST || [])];
    if (CORS_ALLOW_ALL) headers['Access-Control-Allow-Origin'] = '*';
    else if (list.length === 1) headers['Access-Control-Allow-Origin'] = list[0];
  }
  res.writeHead(code, headers);
  res.end(body);
}

function safeJoin(rel) {
  const p = path.normalize(path.join(ROOT, rel));
  // 必须带分隔符比较:'/opt/gallery-evil' 也能通过裸 startsWith('/opt/gallery')(2026-07-28 审计)
  if (p !== ROOT && !p.startsWith(ROOT + path.sep)) return null;
  return p;
}

function isValidName(name) {
  return !!name && !name.includes('/') && !name.includes('\\') && name !== '.' && name !== '..';
}

function readBody(req, cb, maxBytes) {
  const limit = maxBytes || 65536;
  let body = '';
  req.on('data', d => { body += d; if (body.length > limit) req.destroy(); });
  req.on('end', () => {
    try { cb(JSON.parse(body)); } catch { cb({}); }
  });
}

function getCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return out;
}

module.exports = { sendJson, safeJoin, isValidName, readBody, getCookies };
