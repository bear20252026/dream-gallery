// 通用工具函数
const path = require('path');
const { ROOT } = require('./config');

function sendJson(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff', // 安全头(2026-07-28 OWASP 审计)
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-cache, no-store, must-revalidate', // 2026-08-31 admin 文件列表实时(浏览器/CDN 不缓存)
  });
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
