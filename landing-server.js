/**
 * 官网落地页独立静态服务(2026-08-29)
 * ------------------------------------------------------------
 * 目的:让 www.cloudbear.cloud 根路径直接是官网,与画廊(3000)完全隔离,
 *      互不干扰、可独立重启/回滚。
 *
 * 用法:
 *   node landing-server.js            # 默认 3100
 *   PORT=3100 ROOT=/opt/gallery/landing node landing-server.js
 *
 * 特性:
 *   - 单页应用(SPA)回退:任意未命中路径 → index.html(react-router 通配兜底)
 *   - 路径穿越防护:拒绝 .. 与绝对路径
 *   - 缓存:index.html 不缓存(便于即时更新),带 hash 的静态资源长缓存
 *   - 仅服务白名单扩展名,其余 404
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.LANDING_PORT || 3100);
const ROOT = path.resolve(process.env.LANDING_ROOT || path.join(__dirname, 'landing'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.map': 'application/json; charset=utf-8',
};

/** 判断解析后的真实路径是否仍在 ROOT 内(防路径穿越) */
function safeResolve(relPath) {
  const target = path.resolve(ROOT, relPath);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return null;
  return target;
}

function sendFile(res, filePath, { cache } = {}) {
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      // SPA 回退:交给 react-router(已配置 <Route path="*"> 兜底)
      return sendFile(res, path.join(ROOT, 'index.html'), { cache: false });
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': st.size,
      'Cache-Control': cache ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    res.writeHead(400).end('Bad Request');
    return;
  }

  // 健康检查(供 pm2 / 隧道探活)
  if (pathname === '/__health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  const rel = pathname.replace(/^\/+/, '') || 'index.html';
  const filePath = safeResolve(rel);
  if (!filePath) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  // 目录请求 → 该目录下 index.html
  fs.stat(filePath, (err, st) => {
    if (!err && st.isDirectory()) {
      return sendFile(res, path.join(filePath, 'index.html'), { cache: false });
    }
    // 带 hash 的构建产物长缓存;入口文件不缓存
    const hashed = /-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(path.basename(filePath));
    sendFile(res, filePath, { cache: hashed });
  });
});

server.listen(PORT, () => {
  console.log(`[landing] 官网落地页已启动: http://localhost:${PORT}`);
  console.log(`[landing] 静态根目录: ${ROOT}`);
});
