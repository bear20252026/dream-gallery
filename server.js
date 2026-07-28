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

const { ROOT, PORT, TOKEN, GATE_ANSWER, GATE_QUESTION, GATE_MODE, MEDIA_DIRS } = require('./lib/config');
const { sendJson, readBody, safeJoin, isValidName } = require('./lib/util');
const { gateData } = require('./lib/store');
const { serveGatePage, sseRegister, handleApply, handleGateStatus, approvalGate, GATE_HASH, hasGateCookie, handleRename } = require('./lib/gate');
const { tokenOk, handleAdminList, handleAdminDecide, handleAdminBulk } = require('./lib/admin');
const { handleQuizStart, handleQuizSubmit, handleQuizState, handleQuizInvite, handleQuizJudge } = require('./lib/quiz');
const { serveStatic, handleList, handleUpload, handleUploadChunk, handleDelete } = require('./lib/files');
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

  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
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
    // 主人后台页面 + 接口(需 TOKEN)
    if (pathname === '/admin' && req.method === 'GET') {
      if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权:需要 token' }); return; }
      serveStatic(req, res, path.join(ROOT, 'admin.html'));
      return;
    }
    if (pathname === '/api/admin/list' && req.method === 'GET') { handleAdminList(req, res, query); return; }
    if (pathname === '/api/admin/decide' && req.method === 'POST') { handleAdminDecide(req, res, query); return; }
    if (pathname === '/api/admin/bulk' && req.method === 'POST') { handleAdminBulk(req, res, query); return; }
  }
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

  // API 路由
  if (pathname.startsWith('/api/')) {
    // 聊天室(公开读,发言按设备限流;数据全员可见,仅留最近100条)
    if (pathname === '/api/chat' && req.method === 'GET') { handleChatList(req, res); return; }
    if (pathname === '/api/chat' && req.method === 'POST') { handleChatPost(req, res); return; }
    // 答题系统(公开,进馆门禁)
    if (pathname === '/api/quiz/start' && req.method === 'GET') { handleQuizStart(req, res, query); return; }
    if (pathname === '/api/quiz/submit' && req.method === 'POST') { handleQuizSubmit(req, res); return; }
    if (pathname === '/api/quiz/judge' && req.method === 'POST') { handleQuizJudge(req, res); return; }
    if (pathname === '/api/quiz/state' && req.method === 'GET') { handleQuizState(req, res); return; }
    if (pathname === '/api/quiz/invite' && req.method === 'POST') { handleQuizInvite(req, res); return; }
    // AI 看图配文(公开,仅限本人上传)
    if (pathname === '/api/vision/analyze' && req.method === 'POST') { handleVisionAnalyze(req, res); return; }
    // 链接点击埋点(公开;数据仅后台 token 可见,普通用户无法查看)
    if (pathname === '/api/track/click' && req.method === 'POST') { handleTrackClick(req, res); return; }
    // 访客端 JS 报错回传(公开;仅后台可见)
    if (pathname === '/api/track/error' && req.method === 'POST') { handleTrackError(req, res); return; }
    // TTS 语音合成代理(公开,按设备限流 30 次/天,文案哈希缓存)
    if (pathname === '/api/tts' && req.method === 'GET') { handleTts(req, res, query); return; }
    // 点击记录:批量清理 / 导出 Excel(token)
    if (pathname === '/api/admin/clicks/clear' && req.method === 'POST') { handleClicksClear(req, res, query); return; }
    if (pathname === '/api/admin/export.xlsx' && req.method === 'GET') { handleExportXlsx(req, res, query); return; }
    if (pathname === '/api/admin/alerts' && req.method === 'POST') { handleAdminAlerts(req, res, query); return; }
    // 答题记录(需 TOKEN;无论是否开启审批门都可用)
    if (pathname === '/api/admin/quiz' && req.method === 'GET') {
      if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
      const devMap = {};
      for (const a of Object.values(gateData.applicants)) {
        if (a.dk) devMap[a.dk] = { answer: a.answer, brand: a.brand || '', geo: (gateData.geo && gateData.geo[a.ip]) || '' };
      }
      const attempts = (gateData.quizAttempts || []).slice(-100).reverse()
        .map(at => ({ ...at, device: devMap[at.dk] || null }));
      sendJson(res, 200, { attempts });
      return;
    }
    // 白板作品保存对所有用户开放(仅限 whiteboard- 前缀文件;其余 API 仍需 TOKEN)
    if (pathname === '/api/upload' && req.method === 'POST' && /^whiteboard-/.test(String(query.name || ''))) {
      handleUpload(req, res, query);
      return;
    }
    // 访客公开上传照片/视频(所有人可传、不限张数、图≤50MB/视频≤700MB、全格式;归属按设备记录)
    if (pathname === '/api/upload' && req.method === 'POST' && (query.dir === 'photos' || query.dir === 'videos')) {
      handleUpload(req, res, query, true);
      return;
    }
    // 分片上传(2026-07-28 晚高峰应急:CF 回源限流,>1MB 直传 524;256KB/片逐片传)
    if (pathname === '/api/upload/chunk' && req.method === 'POST') { handleUploadChunk(req, res, query); return; }
    // 文件列表公开只读(画廊/白板墙需要);上传/删除仍需 TOKEN
    if (pathname === '/api/files' && req.method === 'GET') { handleList(req, res, query); return; }
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
