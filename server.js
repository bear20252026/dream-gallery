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

// 进程级异常兜底(2026-08-31 审计 H1;2026-10-11 审计十九节改写):
//  - uncaughtException:记录后**收束退出**交 pm2 拉起(继续裸奔会让全局对象处于未知状态,
//    比崩一次更危险);收束期间仍来异常只计数不再重复触发。
//  - unhandledRejection:保持不退出(多为 fetch/定时器的一次性失败),但必须留痕可定位。
let server = null;
let uncaughtCount = 0;
let rejectionCount = 0;
let fatalDraining = false;
process.on('uncaughtException', (e) => {
  uncaughtCount++;
  console.error(`[uncaughtException #${uncaughtCount}] uptime=${Math.round(process.uptime())}s`, e && (e.stack || e.message || e));
  if (fatalDraining || !server) return;
  fatalDraining = true;
  console.error('[uncaughtException] 收束在途请求后退出,交给 pm2 重启…');
  beginShutdown(() => process.exit(1));
});
process.on('unhandledRejection', (e) => {
  rejectionCount++;
  console.error(`[unhandledRejection #${rejectionCount}] uptime=${Math.round(process.uptime())}s`, (e && (e.stack || e.message)) || e);
});

const { ROOT, PORT, TOKEN, IS_PROD } = require('./lib/config');
const { sendJson, safeJoin } = require('./lib/util');
const { recordVisit } = require('./lib/store');
const { entryGate } = require('./lib/gate');
const { serveStatic } = require('./lib/files');
const { dispatch } = require('./lib/routes');
const { canServeMedia } = require('./lib/siteconfig');
const { staticDenied, applySecurityHeaders, mediaGate, serveEntryHtml, corsOriginFor } = require('./lib/security');
const { flushTrack } = require('./lib/track');
const { closeMediaSse } = require('./lib/media-push');

// 生产 fail-fast(2026-10-11 DG-AUTH-001):没有 TOKEN 的生产实例是「后台洞开 + 写接口只靠本地判定」
// 的半瘫状态,必须拒绝启动而不是静默运行。
// ⚠️ 只在 NODE_ENV==='production' 时退出:线上 pm2 目前并未设置 NODE_ENV,
// 无条件退出会把正在服务的环境直接打崩 —— 这是刻意保留的宽松边界,不是漏判。
if (IS_PROD && !TOKEN) {
  console.error('[启动失败] NODE_ENV=production 但未配置 TOKEN:后台与写接口将失去保护,拒绝启动。');
  console.error('[启动失败] 请在 /opt/gallery/.env 设置 TOKEN 后重新 pm2 restart gallery --update-env。');
  process.exit(1);
}

const handler = (req, res) => {
  // 畸形请求行/Host 头(实测 '//?noopening' 打崩过进程:2026-09-26 pm2 error log
  // uncaughtException ERR_INVALID_URL,飞行中的语音请求全部腰斩)——必须接住,返回 400
  let u;
  try {
    u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    sendJson(res, 400, { error: 'URL 不合法' });
    return;
  }
  // 畸形 URL(如 /%)会让 decodeURIComponent 抛 URIError,不接住整个进程就崩
  let pathname;
  try { pathname = decodeURIComponent(u.pathname); }
  catch { sendJson(res, 400, { error: 'URL 不合法' }); return; }
  // 反斜杠路径一律 404(2026-08-31 审计 M8:防 Windows 部署下 %5C 绕过媒体门禁;Linux 下也无合法反斜杠路径)
  if (pathname.includes('\\')) { sendJson(res, 404, { error: 'Not Found' }); return; }
  const query = Object.fromEntries(u.searchParams);

  applySecurityHeaders(req, res); // CSP/CORS/nosniff 等(2026-09-18 下沉 lib/security)

  // CORS 预检(2026-09-18 审计 P2#7;2026-10-11 DG-CORS-001):与 applySecurityHeaders 共用
  // security.corsOriginFor —— 两处必须同一裁决,否则「预检放行 A 域、真请求回 B 域」自相矛盾
  if (req.method === 'OPTIONS') {
    const cors = corsOriginFor(req);
    const headers = {
      'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-token',
    };
    if (cors) headers['Access-Control-Allow-Origin'] = cors.origin;
    res.writeHead(204, headers);
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
  // 远方山丘(2026-10-05):故事之后的落脚处,构建在 public/hill/ → dist/hill/。
  // 山丘用相对路径加载 ./assets/,所以 /hill 先补斜杠跳到 /hill/,/hill/ 再落到 index.html
  if (rel === 'hill') {
    const q = req.url.indexOf('?');
    res.writeHead(301, { Location: '/hill/' + (q < 0 ? '' : req.url.slice(q)) });
    res.end();
    return;
  }
  if (rel === 'hill/') rel = 'hill/index.html';
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

server = http.createServer(handler);

// 优雅关闭(2026-10-07 审查#9;2026-10-11 审计二十节校正数值与注释):
// pm2 restart/reload 与 Ctrl+C 都走 SIGTERM/SIGINT —— 停止接收新连接,给在途请求一个
// **有上限**的排空窗口后退出。原注释写「让最长 6 分钟的 AI 阅卷/大上传跑完」是失实的:
// 真实兜底只有 8 秒,>8s 的长请求照样被腰斩。现把窗口做成具名常量,与注释、pm2 kill-timeout
// 三者对齐:DRAIN=15000ms ⇒ deploy.sh/backend-sync.sh 的 --kill-timeout 必须 > 本值(建议 25000)。
// 为什么是 15s 不是 30s:游戏页常驻 SSE(/api/media/sse、/api/entry/watch)是长连接,
// server.close() 的回调在长连接断开前不会到来 ⇒ 每次发布都会**等满**整个窗口,
// 30s 等于给每次 pm2 restart 加半分钟;这里靠关闭 SSE 主动收束 + 15s 上限折中。
const SHUTDOWN_DRAIN_MS = 15000;
let shuttingDown = false;
function beginShutdown(exit) {
  try { flushTrack(); } catch (e) { console.error('[shutdown] 埋点批量落盘失败:', e && (e.message || e)); }
  // AI 用量台账是合并写盘(5s / 20 条),退出前必须 stop() 收尾,否则窗口内最后几条丢盘。
  try { require('./lib/aiusage').stop(); } catch (e) { console.error('[shutdown] AI 用量收尾失败:', e && (e.message || e)); }
  // 保留期清扫的日定时器(已 unref),与其它后台定时器口径一致:显式停一次不留悬挂。
  try { require('./lib/retention').stopRetention(); } catch (e) { console.error('[shutdown] 保留期清扫停止失败:', e && (e.message || e)); }
  // R2 待发台账:stopOutbox() = 合并落盘 + 清两个定时器(不要只调 flush(),那会留悬挂句柄)。
  try { require('./lib/r2outbox').stopOutbox(); } catch (e) { console.error('[shutdown] R2 台账收尾失败:', e && (e.message || e)); }
  try { closeMediaSse(); } catch (e) { console.error('[shutdown] SSE 收束失败:', e && (e.message || e)); }
  try {
    const filesUpload = require('./lib/files-upload');
    if (typeof filesUpload.stopChunkGc === 'function') filesUpload.stopChunkGc(); // 分片 GC 定时器
  } catch (e) { console.error('[shutdown] 分片 GC 清理失败:', e && (e.message || e)); }
  if (!server) { exit(); return; }
  server.close(() => {
    console.log('[shutdown] 在途请求已收束,退出');
    exit();
  });
  setTimeout(() => {
    console.log(`[shutdown] ${SHUTDOWN_DRAIN_MS / 1000}s 兜底到点,强制退出`);
    exit();
  }, SHUTDOWN_DRAIN_MS);
}
function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] 收到 ${signal}:停止接收新请求,最多等待 ${SHUTDOWN_DRAIN_MS / 1000}s 让在途请求收束…`);
  beginShutdown(() => process.exit(0));
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server.listen(PORT, () => {
  const { ROUTES } = require('./lib/routes');
  console.log(`服务器已启动: http://localhost:${PORT}`);
  console.log(TOKEN ? `API 鉴权已启用(TOKEN),请求需带 ?token= 或 x-token 头` : `API 未启用鉴权(设置环境变量 TOKEN 可开启)`);
  console.log(`入口守卫已启用:自由进画廊;仅拦截被踢出设备(重进需申请)与拉黑 IP。后台: /admin?token=<TOKEN>`);
  if (!TOKEN) console.error('[安全告警] TOKEN 未设置:后台 /admin 不可用(fail-closed),auth:write 档的上传/大屏/删除接口仅本地可达。生产请在 .env 设置 TOKEN 后 pm2 restart gallery --update-env');
  // 保留期清扫(lib/retention.js)与 R2 待发台账(lib/r2outbox.js)的启动点都在入口这一层:
  // 两者都反向依赖 store/client-errors,接进底座会造出循环依赖(《npm run deps》是硬门禁)。
  // RETENTION_DISABLED=1 由 retention 自己守;两个 start 都幂等且定时器 unref。
  try { require('./lib/retention').startRetention(); } catch (e) { console.error('[startup] 保留期清扫启动失败(不影响服务):', e && (e.message || e)); }
  try { require('./lib/r2outbox').startOutbox(); } catch (e) { console.error('[startup] R2 待发台账启动失败(不影响服务):', e && (e.message || e)); }
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
