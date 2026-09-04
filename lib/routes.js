// routes.js — 声明式路由表(server.js 的唯一接线层,2026-09-02 自巨型 if 链拆出)
//
// 每项: { method, match, auth, guard?, fn }
//   method — HTTP 方法
//   match  — 精确字符串或正则;正则命中时捕获组经 c.m 传给 fn
//   auth   — 外层鉴权语义(处理器内部可能还有自带检查,双保险):
//              'public' — 公开/自校验接口,外层不拦(访客接口、公开读、凭设备指纹自证)
//              'token'  — 必须 tokenOk(不通过即 401);未配置 TOKEN 同样拒绝(fail-closed)
//              'write'  — /api 写操作:配置了 TOKEN 才校验,未配置放行(与拆分前行为逐位一致)
//   guard  — 可选;返回 false 时跳过本条继续往下匹配(上传接口按 query.name/dir 分流用)
//   fn     — 处理器,参数 c = { req, res, query, m }
//
// 顺序即优先级,与拆分前 server.js 的执行顺序逐位一致。
// 新增端点只需在此追加一行并声明 auth —— 外层鉴权不再可能漏挂(契约测试 lib-routes.test.js 兜底)。
const path = require('path');
const { ROOT, TOKEN, MEDIA_DIRS } = require('./config');
const { sendJson, isValidName } = require('./util');
const {
  serveGatePage, sseRegister, handleCollect, handleReapply, handleEntryStatus, handleRename,
} = require('./gate');
const { tokenOk, handleAdminList, handleAdminDecide, handleAdminBulk, handleAdminQuiz } = require('./admin');
const { handleQuizStart, handleQuizSubmit, handleQuizState, handleQuizInvite, handleQuizJudge } = require('./quiz');
const { serveStatic, handleList, handleUpload, handleUploadChunk, handleDelete, handleMyUploads } = require('./files');
const { handlePublicConfig, handleAdminMode, handleAdminLinks, handleAdminDemo, handleAdminCaption, handleMyLinks } = require('./siteconfig');
const { handleVisionAnalyze } = require('./vision');
const { handleTrackClick, handleClicksClear, handleExportXlsx, handleTrackError } = require('./track');
const { handleDocsGet, handleDocsPost } = require('./docs');
const { handleChatList, handleChatPost } = require('./chat');
const { handleWishPost, handleWishList, handleAdminWishes, handleAdminWish } = require('./wishes');
const { handleAdminAlerts } = require('./abuse');
const { handleReport, handleAdminErrors, handleAdminErrorsClear } = require('./client-errors');
const { handleTts } = require('./tts');
const { mediaSseRegister } = require('./media-push');
const { handleBigscreenGet, handleBigscreenUpload, handleBigscreenDelete } = require('./bigscreen');

// 页面类(需 token 后回静态文件)
function adminPage(file) {
  return (c) => serveStatic(c.req, c.res, path.join(ROOT, file));
}

const ROUTES = [
  // ===================== 协议文档在线编辑器 =====================
  { method: 'GET',  match: '/admin/docs',            auth: 'token', fn: adminPage('docs.html') },
  { method: 'GET',  match: '/api/admin/docs',        auth: 'token', fn: (c) => handleDocsGet(c.req, c.res, c.query) },
  { method: 'POST', match: '/api/admin/docs',        auth: 'token', fn: (c) => handleDocsPost(c.req, c.res) },

  // ===================== 入口守卫访客接口(公开) =====================
  { method: 'POST', match: '/api/entry/collect',     auth: 'public', fn: (c) => handleCollect(c.req, c.res) },
  { method: 'POST', match: '/api/entry/reapply',     auth: 'public', fn: (c) => handleReapply(c.req, c.res) },
  { method: 'GET',  match: '/api/entry/status',      auth: 'public', fn: (c) => handleEntryStatus(c.req, c.res) },
  { method: 'GET',  match: '/api/entry/watch',       auth: 'public', fn: (c) => sseRegister(c.req, c.res) },
  { method: 'POST', match: '/api/entry/rename',      auth: 'public', fn: (c) => handleRename(c.req, c.res) },

  // ===================== 主人后台页面 =====================
  { method: 'GET',  match: '/admin',                 auth: 'token', fn: adminPage('admin.html') },

  // ===================== 客户端报错反馈 =====================
  { method: 'POST', match: '/api/client-errors',             auth: 'public', fn: (c) => handleReport(c.req, c.res) },
  { method: 'GET',  match: '/api/admin/client-errors',       auth: 'token',  fn: (c) => handleAdminErrors(c.req, c.res, c.query) },
  { method: 'POST', match: '/api/admin/client-errors/clear', auth: 'token',  fn: (c) => handleAdminErrorsClear(c.req, c.res, c.query) },

  // ===================== 访客管理 =====================
  { method: 'GET',  match: '/api/admin/list',   auth: 'token', fn: (c) => handleAdminList(c.req, c.res, c.query) },
  { method: 'POST', match: '/api/admin/decide', auth: 'token', fn: (c) => handleAdminDecide(c.req, c.res, c.query) },
  { method: 'POST', match: '/api/admin/bulk',   auth: 'token', fn: (c) => handleAdminBulk(c.req, c.res, c.query) },

  // ===================== 站点配置 =====================
  { method: 'GET',  match: '/api/siteconfig',  auth: 'public', fn: (c) => handlePublicConfig(c.req, c.res) },
  { method: 'POST', match: '/api/admin/mode',    auth: 'token', fn: (c) => handleAdminMode(c.req, c.res, c.query) },
  { method: 'POST', match: '/api/admin/links',   auth: 'token', fn: (c) => handleAdminLinks(c.req, c.res, c.query) },
  { method: 'POST', match: '/api/admin/demo',    auth: 'token', fn: (c) => handleAdminDemo(c.req, c.res, c.query) },
  { method: 'POST', match: '/api/admin/caption', auth: 'token', fn: (c) => handleAdminCaption(c.req, c.res, c.query) },
  { method: 'POST', match: '/api/mylinks',       auth: 'public', fn: (c) => handleMyLinks(c.req, c.res) },

  // ===================== 后台文件预览 =====================
  { method: 'GET', match: /^\/admin-media\/([^/]+)\/(.+)$/, auth: 'token', fn: (c) => {
    if (!MEDIA_DIRS.includes(c.m[1]) || !isValidName(c.m[2])) { sendJson(c.res, 400, { error: '路径不合法' }); return; }
    serveStatic(c.req, c.res, path.join(ROOT, c.m[1], c.m[2]));
  } },

  // ===================== 公开 / 自校验 API(原路由表) =====================
  { method: 'GET',  match: '/api/chat',         auth: 'public', fn: (c) => handleChatList(c.req, c.res) },
  { method: 'POST', match: '/api/chat',         auth: 'public', fn: (c) => handleChatPost(c.req, c.res) },
  // 一念墙(2026-09-04):写下你的一句话,化作灵蕴归入天穹;公开政策与聊天室一致(先发后审)
  { method: 'POST', match: '/api/wish',         auth: 'public', fn: (c) => handleWishPost(c.req, c.res) },
  { method: 'GET',  match: '/api/wishes',       auth: 'public', fn: (c) => handleWishList(c.req, c.res) },
  { method: 'GET',  match: '/api/admin/wishes', auth: 'token',  fn: (c) => handleAdminWishes(c.req, c.res) },
  { method: 'POST', match: '/api/admin/wish',   auth: 'token',  fn: (c) => handleAdminWish(c.req, c.res) },
  { method: 'GET',  match: '/api/quiz/start',   auth: 'public', fn: (c) => handleQuizStart(c.req, c.res, c.query) },
  { method: 'POST', match: '/api/quiz/submit',  auth: 'public', fn: (c) => handleQuizSubmit(c.req, c.res) },
  { method: 'POST', match: '/api/quiz/judge',   auth: 'public', fn: (c) => handleQuizJudge(c.req, c.res) },
  { method: 'GET',  match: '/api/quiz/state',   auth: 'public', fn: (c) => handleQuizState(c.req, c.res) },
  { method: 'POST', match: '/api/quiz/invite',  auth: 'public', fn: (c) => handleQuizInvite(c.req, c.res) },
  { method: 'POST', match: '/api/vision/analyze', auth: 'public', fn: (c) => handleVisionAnalyze(c.req, c.res) },
  { method: 'POST', match: '/api/track/click',  auth: 'public', fn: (c) => handleTrackClick(c.req, c.res) },
  { method: 'POST', match: '/api/track/error',  auth: 'public', fn: (c) => handleTrackError(c.req, c.res) },
  { method: 'GET',  match: '/api/tts',          auth: 'public', fn: (c) => handleTts(c.req, c.res, c.query) },
  // 媒体变更即时推送:游戏页长连接,文件增删后服务端主动广播(2026-08-29)
  { method: 'GET',  match: '/api/media/sse',    auth: 'public', fn: (c) => mediaSseRegister(c.req, c.res) },
  // 户外大屏配置(软编码):游戏端拉取,后台管理后可即时生效(2026-08-29)
  { method: 'GET',  match: '/api/bigscreen',    auth: 'public', fn: (c) => handleBigscreenGet(c.req, c.res) },
  { method: 'POST', match: '/api/admin/clicks/clear', auth: 'token', fn: (c) => handleClicksClear(c.req, c.res, c.query) },
  { method: 'GET',  match: '/api/admin/export.xlsx',  auth: 'token', fn: (c) => handleExportXlsx(c.req, c.res, c.query) },
  { method: 'POST', match: '/api/admin/alerts',       auth: 'token', fn: (c) => handleAdminAlerts(c.req, c.res, c.query) },
  { method: 'GET',  match: '/api/admin/quiz',         auth: 'token', fn: (c) => handleAdminQuiz(c.req, c.res, c.query) },
  // 白板作品保存对所有用户开放(仅限 whiteboard- 前缀 + 图片扩展名白名单:
  // 2026-08-31 审计 H2——原先不限扩展名,可传 whiteboard-x.html 得到主域公网 HTML=存储型 XSS)
  { method: 'POST', match: '/api/upload', auth: 'public',
    guard: (c) => /^whiteboard-[\w-]+\.(png|jpe?g|webp)$/i.test(String(c.query.name || '')),
    fn: (c) => handleUpload(c.req, c.res, c.query) },
  // 访客公开上传照片/视频(图≤50MB/视频≤700MB、全格式)
  { method: 'POST', match: '/api/upload', auth: 'public',
    guard: (c) => c.query.dir === 'photos' || c.query.dir === 'videos',
    fn: (c) => handleUpload(c.req, c.res, c.query, true) },
  // 分片上传(绕开 CF 回源限流的 524)
  { method: 'POST', match: '/api/upload/chunk', auth: 'public', fn: (c) => handleUploadChunk(c.req, c.res, c.query) },
  // 文件列表公开只读
  { method: 'GET',  match: '/api/files',        auth: 'public', fn: (c) => handleList(c.req, c.res, c.query) },
  { method: 'GET',  match: '/api/myuploads',    auth: 'public', fn: (c) => handleMyUploads(c.req, c.res, c.query) },

  // ===================== /api 写操作(TOKEN 已配置时必须鉴权) =====================
  // 通用上传(白板/照片视频 guard 未命中时的兜底,原 TOKEN 门禁后的裸上传)
  { method: 'POST',   match: '/api/upload',                    auth: 'write', fn: (c) => handleUpload(c.req, c.res, c.query) },
  // 户外大屏后台管理:上传替换/清空槽位(2026-08-29)
  { method: 'POST',   match: '/api/admin/bigscreen/upload',    auth: 'write', fn: (c) => handleBigscreenUpload(c.req, c.res, c.query) },
  { method: 'POST',   match: '/api/admin/bigscreen/delete',    auth: 'write', fn: (c) => handleBigscreenDelete(c.req, c.res, c.query) },
  { method: 'DELETE', match: /^\/api\/files\/([^/]+)\/(.+)$/,  auth: 'write', fn: (c) => handleDelete(c.res, c.m[1], c.m[2]) },
];

// 分发:命中返回 true(已处理),未命中返回 false(调用方继续 entryGate/静态服务)
function dispatch(req, res, pathname, query) {
  for (const r of ROUTES) {
    if (req.method !== r.method) continue;
    const hit = typeof r.match === 'string' ? (pathname === r.match) : r.match.exec(pathname);
    if (!hit) continue;
    const c = { req, res, query, m: Array.isArray(hit) ? hit : null };
    if (r.guard && !r.guard(c)) continue;
    if (r.auth === 'token' && !tokenOk(req, query)) { sendJson(res, 401, { error: '未授权:需要 token' }); return true; }
    if (r.auth === 'write' && TOKEN && !tokenOk(req, query)) { sendJson(res, 401, { error: '未授权:缺少或错误的 token' }); return true; }
    r.fn(c);
    return true;
  }
  return false;
}

module.exports = { ROUTES, dispatch };
