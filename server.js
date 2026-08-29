// 梦幻画廊后端服务器
// 零依赖 Node.js 服务器:静态托管 + 文件列表/上传/删除 API
// 运行: node server.js   (默认端口 3000,可用环境变量 PORT 修改)
// 鉴权(可选): 设置环境变量 TOKEN 后,/api/* 需带 ?token=xxx 或 x-token 请求头,否则 401
// 问答门(可选·旧模式): GATE_ANSWER=暗号 → 答对即进(GATE_QUESTION/GATE_HINT 可改文案)
// 审批门(可选·新模式): GATE_MODE=approval → 访客答题申请,主人在 /admin?token=xxx 审批
//   审批级别: 永久 / 24小时 / 仅一次(首次进入起30分钟)
//   数据存 gate_data.json(申请记录/批准名单/访问统计),重启不丢
// 配置文件: 以上均可在 .env 中设置(真实环境变量优先)

const http = require('http');
const path = require('path');
const { URL } = require('url');

const { ROOT, PORT, TOKEN, CORS_ORIGIN, GATE_ANSWER, GATE_QUESTION, GATE_MODE, MEDIA_DIRS } = require('./lib/config');
const { sendJson, readBody, safeJoin, isValidName } = require('./lib/util');
const { gateData } = require('./lib/store');
const { serveGatePage, sseRegister, handleApply, handleGateStatus, approvalGate, GATE_HASH, hasGateCookie, handleRename } = require('./lib/gate');
const { tokenOk, handleAdminList, handleAdminDecide, handleAdminBulk } = require('./lib/admin');
const { handleQuizStart, handleQuizSubmit, handleQuizState, handleQuizInvite, handleQuizJudge } = require('./lib/quiz');
const { serveStatic, handleList, handleUpload, handleUploadChunk, handleDelete, handleMyUploads } = require('./lib/files');
const { handlePublicConfig, handleAdminMode, handleAdminLinks, handleAdminDemo, handleAdminCaption, handleMyLinks, canServeMedia } = require('./lib/siteconfig');
const { handleVisionAnalyze } = require('./lib/vision');
const { handleTrackClick, handleClicksClear, handleExportXlsx, handleTrackError } = require('./lib/track');
const { handleDocsGet, handleDocsPost } = require('./lib/docs');
const { handleChatList, handleChatPost } = require('./lib/chat');
const { handleAdminAlerts } = require('./lib/abuse');
const { handleTts } = require('./lib/tts');

// 公开静态黑名单:点文件、后端目录、私钥/脚本/文档、数据库与清单文件
// 根目录 .js 仅放行 data.js/sw.js(前端 ESM 需要),其余根级 js 均为后端/工具脚本
// src/ 与 vendor/ 目录(可读源码):公网一律 404,仅 localhost 放行(本地开发/test-mobile 依赖)
// scripts/ 目录(测试/探针/生成器):公网一律 404
function staticDenied(rel, req) {
  const seg = rel.split('/');
  const base = seg[seg.length - 1];
  if (base.startsWith('.')) return true;
  if (['lib', 'node_modules', 'origin', 'tools', 'questions', 'scripts', 'dist'].includes(seg[0])) return true;
  if (seg[0] === 'src' || seg[0] === 'vendor') {
    // 放行 Three.js 加载器依赖(浏览器 importmap 路径)
    if (rel.startsWith('vendor/examples/jsm/')) return false;
    const host = String(req && req.headers && req.headers.host || '');
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return true;
  }
  if (/\.(pem|bat|sh|md|log)$/.test(base)) return true;
  if (['gate_data.json', 'package.json', 'package-lock.json', 'admin.html', 'docs.html'].includes(base)) return true;
  if (seg.length === 1 && base.endsWith('.js') && !['data.js', 'sw.js'].includes(base)) return true;
  return false;
}

const handler = (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  // 畸形 URL(如 /%)会让 decodeURIComponent 抛 URIError,不接住整个进程就崩
  let pathname;
  try { pathname = decodeURIComponent(u.pathname); }
  catch { sendJson(res, 400, { error: 'URL 不合法' }); return; }
  const query = Object.fromEntries(u.searchParams);

  // ===================== 全局安全头(2026-08-22 大厂标准) =====================
  // CSP: 限制脚本/样式/图片/连接来源,防止 XSS 和数据注入
  // CORS: 仅允许 cloudbear.cloud + localhost(开发),不再默认 *
  const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(String(req.headers.host || ''));
  if (isLocal) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://cloudbear.cloud');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // CSP: 允许内联脚本(页面内 <script>)、blob URL(视频)、data URL(图片)
  // 不允许 eval、外部脚本域(除 Three.js CDN 备份)、外部样式域
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "connect-src 'self' https://cloudbear.cloud https://cdn.cloudbear.cloud",
      "font-src 'self' data:",
      "object-src 'none'",
      "frame-ancestors 'self'",
    ].join('; ')
  );

  // 协议文档在线编辑器(token):/admin/docs 页面 + /api/admin/docs 读写接口
  if (pathname === '/admin/docs' && req.method === 'GET') {
    if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权:需要 token' }); return; }
    serveStatic(req, res, path.join(ROOT, 'docs.html'));
    return;
  }
  if (pathname === '/api/admin/docs' && req.method === 'GET') {
    if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
    handleDocsGet(req, res, query); return;
  }
  if (pathname === '/api/admin/docs' && req.method === 'POST') {
    if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
    handleDocsPost(req, res); return;
  }

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

  // 审批门:访客接口(不受 TOKEN 限制)
  if (GATE_MODE === 'approval') {
    if (pathname === '/api/gate/apply' && req.method === 'POST') { handleApply(req, res); return; }
    if (pathname === '/api/gate/status' && req.method === 'GET') { handleGateStatus(req, res); return; }
    if (pathname === '/api/gate/watch' && req.method === 'GET') { sseRegister(req, res); return; }
    if (pathname === '/api/gate/rename' && req.method === 'POST') { handleRename(req, res); return; }
  }
  // 主人后台页面 + 接口(需 TOKEN;不依赖审批门开关,始终可用)
  if (pathname === '/admin' && req.method === 'GET') {
    if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权:需要 token' }); return; }
    serveStatic(req, res, path.join(ROOT, 'admin.html'));
    return;
  }
  if (pathname === '/api/admin/list' && req.method === 'GET') { handleAdminList(req, res, query); return; }
  if (pathname === '/api/admin/decide' && req.method === 'POST') { handleAdminDecide(req, res, query); return; }
  if (pathname === '/api/admin/bulk' && req.method === 'POST') { handleAdminBulk(req, res, query); return; }
  // 站点配置:公开读 + 后台写(不依赖审批门开关,始终可用)
  if (pathname === '/api/siteconfig' && req.method === 'GET') { handlePublicConfig(req, res); return; }
  if (pathname === '/api/admin/mode' && req.method === 'POST') { handleAdminMode(req, res, query); return; }
  if (pathname === '/api/admin/links' && req.method === 'POST') { handleAdminLinks(req, res, query); return; }
  if (pathname === '/api/admin/demo' && req.method === 'POST') { handleAdminDemo(req, res, query); return; }
  if (pathname === '/api/admin/caption' && req.method === 'POST') { handleAdminCaption(req, res, query); return; }
  if (pathname === '/api/mylinks' && req.method === 'POST') { handleMyLinks(req, res); return; }
  // 后台文件预览:/admin-media/<dir>/<name>?token=xxx
  const mMatch = pathname.match(/^\/admin-media\/([^/]+)\/(.+)$/);
  if (mMatch && req.method === 'GET') {
    if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
    if (!MEDIA_DIRS.includes(mMatch[1]) || !isValidName(mMatch[2])) { sendJson(res, 400, { error: '路径不合法' }); return; }
    serveStatic(req, res, path.join(ROOT, mMatch[1], mMatch[2]));
    return;
  }

  // 旧问答门答题接口
  if (pathname === '/api/gate' && req.method === 'POST') {
    readBody(req, obj => {
      const ans = String(obj.answer || '').trim();
      if (GATE_ANSWER && ans === GATE_ANSWER) {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Set-Cookie': `gate=${GATE_HASH}; Path=/; HttpOnly; SameSite=Lax`,
        });
        res.end(JSON.stringify({ ok: true }));
      } else {
        sendJson(res, 401, { error: '答错了，再想想' });
      }
    });
    return;
  }

  // ===================== API 路由(路由表:顺序即优先级) =====================
  if (pathname.startsWith('/api/')) {
    // 路由表项:{ method, match, fn }。match 为精确字符串或正则;fn 已绑定 req/res/query。
    // tokenGate 之前的为公开/自校验接口;之后为需外层 token 的写操作(上传/删除)。
    const routes = [
      { method: 'GET',  match: '/api/chat',               fn: () => handleChatList(req, res) },
      { method: 'POST', match: '/api/chat',               fn: () => handleChatPost(req, res) },
      { method: 'GET',  match: '/api/quiz/start',         fn: () => handleQuizStart(req, res, query) },
      { method: 'POST', match: '/api/quiz/submit',        fn: () => handleQuizSubmit(req, res) },
      { method: 'POST', match: '/api/quiz/judge',         fn: () => handleQuizJudge(req, res) },
      { method: 'GET',  match: '/api/quiz/state',         fn: () => handleQuizState(req, res) },
      { method: 'POST', match: '/api/quiz/invite',        fn: () => handleQuizInvite(req, res) },
      { method: 'POST', match: '/api/vision/analyze',     fn: () => handleVisionAnalyze(req, res) },
      { method: 'POST', match: '/api/track/click',        fn: () => handleTrackClick(req, res) },
      { method: 'POST', match: '/api/track/error',        fn: () => handleTrackError(req, res) },
      { method: 'GET',  match: '/api/tts',                fn: () => handleTts(req, res, query) },
      { method: 'POST', match: '/api/admin/clicks/clear', fn: () => handleClicksClear(req, res, query) },
      { method: 'GET',  match: '/api/admin/export.xlsx',  fn: () => handleExportXlsx(req, res, query) },
      { method: 'POST', match: '/api/admin/alerts',       fn: () => handleAdminAlerts(req, res, query) },
      { method: 'GET',  match: '/api/admin/quiz',         fn: () => {
        if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
        const devMap = {};
        for (const a of Object.values(gateData.applicants)) {
          if (a.dk) devMap[a.dk] = { answer: a.answer, brand: a.brand || '', geo: (gateData.geo && gateData.geo[a.ip]) || '' };
        }
        const attempts = (gateData.quizAttempts || []).slice(-100).reverse()
          .map(at => ({ ...at, device: devMap[at.dk] || null }));
        sendJson(res, 200, { attempts });
      } },
      // 白板作品保存对所有用户开放(仅限 whiteboard- 前缀)
      { method: 'POST', match: '/api/upload', guard: () => /^whiteboard-/.test(String(query.name || '')), fn: () => handleUpload(req, res, query) },
      // 访客公开上传照片/视频(图≤50MB/视频≤700MB、全格式)
      { method: 'POST', match: '/api/upload', guard: () => query.dir === 'photos' || query.dir === 'videos', fn: () => handleUpload(req, res, query, true) },
      // 分片上传(绕开 CF 回源限流的 524)
      { method: 'POST', match: '/api/upload/chunk',       fn: () => handleUploadChunk(req, res, query) },
      // 文件列表公开只读
      { method: 'GET',  match: '/api/files',              fn: () => handleList(req, res, query) },
      { method: 'GET',  match: '/api/myuploads',          fn: () => handleMyUploads(req, res, query) },
    ];
    for (const r of routes) {
      if (req.method !== r.method) continue;
      const matched = typeof r.match === 'string' ? pathname === r.match : r.match.test(pathname);
      if (!matched) continue;
      if (r.guard && !r.guard()) continue;
      r.fn();
      return;
    }
    // 外层 token 门禁:以上公开/自校验接口之后,以下写操作(上传/删除)需 token
    if (TOKEN && query.token !== TOKEN && req.headers['x-token'] !== TOKEN) {
      sendJson(res, 401, { error: '未授权:缺少或错误的 token' });
      return;
    }
    if (pathname === '/api/upload' && req.method === 'POST') { handleUpload(req, res, query); return; }
    const delMatch = pathname.match(/^\/api\/files\/([^/]+)\/(.+)$/);
    if (delMatch && req.method === 'DELETE') { handleDelete(res, delMatch[1], delMatch[2]); return; }
  }

  // 审批门:启用后,未通过验证的非 API 请求一律先申请
  if (GATE_MODE === 'approval') {
    if (!approvalGate(req, res, pathname)) return;
  } else if (GATE_ANSWER && !hasGateCookie(req)) {
    // 旧问答门
    serveGatePage(res, 'apply');
    return;
  }

  // 静态文件:/ → index.html
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  // 媒体文件级门禁(2026-07-26):普通用户仅演示照片/白板/户外大屏/本人上传,其余 403
  const mediaMatch = rel.match(/^(photos|videos)\/(.+)$/);
  if (mediaMatch && !canServeMedia(req, mediaMatch[1], mediaMatch[2])) {
    sendJson(res, 403, { error: '无权访问该文件' });
    return;
  }
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
  serveStatic(req, res, filePath);
};

const server = http.createServer(handler);
server.listen(PORT, () => {
  console.log(`服务器已启动: http://localhost:${PORT}`);
  console.log(TOKEN ? `API 鉴权已启用(TOKEN),请求需带 ?token= 或 x-token 头` : `API 未启用鉴权(设置环境变量 TOKEN 可开启)`);
  if (GATE_MODE === 'approval') {
    console.log(`审批门已启用,问题:「${GATE_QUESTION}」后台: /admin?token=<TOKEN>`);
    if (!TOKEN) console.log('警告:审批门需要 TOKEN 才能保护后台,请设置 TOKEN');
  } else {
    console.log(GATE_ANSWER ? `问答门已启用,问题:「${GATE_QUESTION}」` : `问答门/审批门未启用`);
  }
  console.log(`API:`);
  console.log(`  GET    /api/files?dir=photos|videos|music  列出媒体文件`);
  console.log(`  POST   /api/upload?dir=photos&name=x.jpg 上传文件(body 为文件内容)`);
  console.log(`  DELETE /api/files/<dir>/<name>          删除文件`);
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
