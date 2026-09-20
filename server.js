// 梦幻画廊后端服务器
// 零依赖 Node.js 服务器:静态托管 + 文件列表/上传/删除 API
// 运行: node server.js   (默认端口 3000,可用环境变量 PORT 修改)
// 鉴权(可选): 设置环境变量 TOKEN 后,/api/* 需带 ?token=xxx 或 x-token 请求头,否则 401
// 问答门(可选·旧模式): GATE_ANSWER=暗号 → 答对即进(GATE_QUESTION/GATE_HINT 可改文案)
// 审批门(可选·新模式): GATE_MODE=approval → 访客答题申请,主人在 /admin?token=xxx 审批
//   审批级别: 永久 / 24小时 / 仅一次(首次进入起30分钟)
//   数据存 gate_data.json(申请记录/批准名单/访问统计),重启不丢
// 配置文件: 以上均可在 .env 中设置(真实环境变量优先)
//
// 路由(2026-09-02 拆分):所有 API 端点集中声明在 lib/routes.js(带 auth 标注),
// 本文件只负责:安全头 → 路由分发 → 入口守卫 → 访问统计 → 静态服务。

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// 进程级异常兜底(2026-08-31 审计 H1):单个请求的异常不得打崩整个服务。
// 记录后保持存活;pm2 异常重启计数仍在,连续崩溃仍会被 pm2 拉起
process.on('uncaughtException', (e) => {
  console.error('[uncaughtException]', e && (e.stack || e.message || e));
});
process.on('unhandledRejection', (e) => {
  console.error('[unhandledRejection]', e && ((e.stack || e.message) || e));
});

const { ROOT, PORT, TOKEN, CORS_ORIGIN } = require('./lib/config');
const { sendJson, safeJoin } = require('./lib/util');
const { recordVisit } = require('./lib/store');
const { entryGate } = require('./lib/gate');
const { serveStatic } = require('./lib/files');
const { dispatch } = require('./lib/routes');
const { canServeMedia } = require('./lib/siteconfig');
const { staticDenied, applySecurityHeaders, mediaGate, serveEntryHtml } = require('./lib/security');

const handler = (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  // 畸形 URL(如 /%)会让 decodeURIComponent 抛 URIError,不接住整个进程就崩
  let pathname;
  try { pathname = decodeURIComponent(u.pathname); }
  catch { sendJson(res, 400, { error: 'URL 不合法' }); return; }
  // 反斜杠路径一律 404(2026-08-31 审计 M8:防 Windows 部署下 %5C 绕过媒体门禁;Linux 下也无合法反斜杠路径)
  if (pathname.includes('\\')) { sendJson(res, 404, { error: 'Not Found' }); return; }
  const query = Object.fromEntries(u.searchParams);

  applySecurityHeaders(req, res); // CSP/CORS/nosniff 等(2026-09-18 下沉 lib/security)

  // CORS 预检(CORS_ORIGIN 可配,默认 *;收紧后台跨域时设环境变量即可,不硬编码)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': CORS_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // ===================== 路由分发(声明式路由表,见 lib/routes.js) =====================
  if (dispatch(req, res, pathname, query)) return;

  // 入口守卫(2026-08-30 权限精简,无条件启用):自由进画廊,仅拦被踢出设备与拉黑 IP
  if (!entryGate(req, res, pathname)) return;
  // 非首页 HTML 页面请求的访问统计补记(首页已在 entryGate 内记录,防双计)
  // 仅计页面(无扩展名或 .html);静态资源不计数。recordVisit 内部自带:自动化跳过 + 回环跳过 + 60 秒去重
  if (
    pathname !== '/' && pathname !== '/index.html' && pathname !== '/favicon.png' &&
    (/\.(html|htm)$/.test(pathname) || !/\.[a-z0-9]+$/i.test(pathname))
  ) recordVisit(req, null, null);

  // 静态文件:/ → index.html
  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  // 官网落地页子目录回落(2026-08-29):/landing 与 /landing/ → /landing/index.html
  if (rel === 'landing' || rel === 'landing/') rel = 'landing/index.html';
  if (!mediaGate(req, res, rel)) return; // 媒体门禁(2026-09-18 下沉 lib/security)
  // 敏感文件黑名单(2026-07-26):.env/gate_data.json/origin 私钥/题库/后端源码等一律 404
  // 注意:/admin 与 /admin-media 走独立 token 通道,不经过这里,不受影响
  if (staticDenied(rel, req)) {
    sendJson(res, 404, { error: '文件不存在' });
    return;
  }
  const filePath = safeJoin(rel);
  if (!filePath) {
    sendJson(res, 403, { error: '禁止访问' });
    return;
  }
  if (serveEntryHtml(rel, res, filePath)) return; // 一次性强刷注入(2026-09-18 下沉 lib/security)
  serveStatic(req, res, filePath);
};

const server = http.createServer(handler);
server.listen(PORT, () => {
  const { ROUTES } = require('./lib/routes');
  console.log(`服务器已启动: http://localhost:${PORT}`);
  console.log(TOKEN ? `API 鉴权已启用(TOKEN),请求需带 ?token= 或 x-token 头` : `API 未启用鉴权(设置环境变量 TOKEN 可开启)`);
  console.log(`入口守卫已启用:自由进画廊;仅拦截被踢出设备(重进需申请)与拉黑 IP。后台: /admin?token=<TOKEN>`);
  if (!TOKEN) console.log('警告:未设置 TOKEN,后台与写接口不受保护,请设置 TOKEN');
  console.log(`路由: ${ROUTES.length} 个端点已注册(明细见 lib/routes.js)`);
});

// 多人房间(ws):大厅+房间,3-4 人实时同步。单人大地图不受影响。
// 关闭方式:环境变量 MULTI=off
try {
  if (process.env.MULTI !== 'off') {
    const attachMultiplayer = require('./lib/multiplayer');
    attachMultiplayer(server, { path: '/ws' });
  }
} catch (e) {
  console.log('[multiplayer] 未启用:', e.message);
}

// HTTPS 监听(3443,Cloudflare Origin 证书):供 Worker 加密回源,边缘↔源站全加密
// 证书仅 Cloudflare 边缘信任(Origin CA),浏览器直连会告警属正常
try {
  const https = require('https');
  const fs = require('fs');
  const keyPath = path.join(ROOT, 'origin', 'key.pem');
  const certPath = path.join(ROOT, 'origin', 'cert.pem');
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, handler)
      .listen(3443, () => console.log('HTTPS 回源监听: https://localhost:3443(Cloudflare Origin CA)'));
  }
} catch (e) { console.log('HTTPS 监听未启用:', e.message); }
