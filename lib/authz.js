// authz.js — 管理侧鉴权判定单一源(2026-11-17 D1 从 admin.js 迁出)
// ===================== 为什么独立成模块 =====================
// 鉴权判定(会话签发/校验 + API token + adminWrite)此前住在 admin.js —— 一个 300+ 行的
// 后台 handler 大文件。于是每个只要"验个 token"的模块(chat/track/abuse/bigscreen/
// client-errors/files-upload/siteconfig/routes)都被迫 require 整个 admin,把 handler
// 依赖链(store/gate/aiusage/hotread/geoip…)全拖进来,鉴权簇咬尾由此而生。
// 本模块只收**纯判定**:依赖 config/util/store/local-request/crypto,全低位叶子,无环。
// admin.js 保留同名 re-export,全部消费方与测试的 require('./admin').tokenOk 形状不变。
const crypto = require('crypto');
const { TOKEN } = require('./config');
const { getCookies } = require('./util');
const { gateData, saveGateData, capKeys } = require('./store');
const { isLocalRequest } = require('./local-request'); // 叶子:socket 来源判定,Host 只用于否决

// ===================== 管理员会话(2026-10-11:凭据不进 URL,也不进浏览器缓存) =====================
// `/admin?token=<TOKEN>` 降级为「一次性引导」:验过即签发随机 session,并 302 回不带任何 query 的 /admin;
// 此后后台的每个请求(API + `<img>` 的 /admin-media)都由浏览器自动携带 HttpOnly cookie 完成鉴权。
// x-token 请求头与 query.token 两条旧通道一律保留:CI、探针、命令行运维都靠它们,移除即全线断。
const ADMIN_COOKIE = 'admin_session';
const ADMIN_SESSION_MS = 8 * 3600 * 1000; // 8 小时硬到期,不滑动续期
const ADMIN_SESSION_MAX = 50; // 并发会话上限(超了按最早到期淘汰),防引导链接被反复刷出无界表

// 落盘的是 sha256(sessionId)而非 sessionId 本身:gate_data 镜像/备份外泄也换不出可用 cookie
function sidHash(sid) {
  return crypto.createHash('sha256').update(String(sid)).digest('hex');
}
function adminSessions() {
  if (!gateData.adminSessions || typeof gateData.adminSessions !== 'object') gateData.adminSessions = {};
  return gateData.adminSessions;
}
function issueAdminSession() {
  const sid = crypto.randomBytes(32).toString('hex');
  const map = adminSessions();
  map[sidHash(sid)] = Date.now() + ADMIN_SESSION_MS;
  capKeys(map, ADMIN_SESSION_MAX);
  saveGateData();
  return sid;
}
// CSRF 判定:SameSite=Strict 使跨站请求(含第三方表单 POST、跨站导航)根本不携带该 cookie,
// 因此 cookie 通道无需再配一枚 anti-CSRF token;比较沿用 timingSafeEqual,「不存在」与「不匹配」
// 一律返回 false(由调用方发同样的 401/404),不回话「有此会话但已失效」
function adminSessionOk(req) {
  const sid = String(getCookies(req)[ADMIN_COOKIE] || '');
  if (!/^[0-9a-f]{64}$/.test(sid)) return false;
  const map = adminSessions();
  const target = Buffer.from(sidHash(sid));
  const now = Date.now();
  let ok = false;
  let dead = 0;
  for (const [h, exp] of Object.entries(map)) {
    const expired = typeof exp !== 'number' || exp <= now;
    const b = Buffer.from(String(h));
    if (b.length === target.length && crypto.timingSafeEqual(b, target) && !expired) ok = true;
    if (expired) dead++;
  }
  if (dead) {
    // 过期即清:每条会话最多触发一次写盘,不在每个请求上刷磁盘
    for (const [h, exp] of Object.entries(map)) if (typeof exp !== 'number' || exp <= now) delete map[h];
    saveGateData();
  }
  return ok;
}
// Secure + HttpOnly + SameSite=Strict + Path=/ + Max-Age=8h(见上条 CSRF 推理)
function adminSessionCookie(sid) {
  return `${ADMIN_COOKIE}=${sid}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${Math.floor(ADMIN_SESSION_MS / 1000)}`;
}

function sameToken(t) {
  // 常量时间比较(2026-07-28 OWASP 审计:A01 计时侧信道)
  if (!TOKEN || !t || t.length !== TOKEN.length) return false;
  return crypto.timingSafeEqual(Buffer.from(String(t)), Buffer.from(TOKEN));
}

function tokenOk(req, query) {
  query = query || {};
  if (adminSessionOk(req)) return true; // 后台页与内嵌元素走这条(2026-10-11)
  if (req.headers['x-token']) return sameToken(req.headers['x-token']); // 头优先:带了头就不再看 query
  const t = query.token || '';
  if (!t) return false;
  // TOKEN_QUERY=0 时生产禁用 query 传 token(防反代/访问日志泄露);内嵌元素已不带 token,可同时打开
  // 「本地」只认 TCP 来源地址:Host 头是客户端可任意伪造的,伪造 Host: localhost 曾可从公网走 query token
  // 「仅本地」判定唯一实现 = lib/local-request.js(security 也从这里转出;socket 来源,Host 只用于否决)。
  if (process.env.TOKEN_QUERY === '0' && !isLocalRequest(req)) return false;
  return sameToken(t);
}
// 后台页面 bootstrap 专用(2026-09-20 审计 M3 自锁修复):
//   /admin 页 HTML 本身不含数据,query 打开始终放行(TOKEN 仍必验);
//   数据/操作 API 一律走 tokenOk(TOKEN_QUERY=0 时公网拒 query)。
function tokenOkPage(req, query) {
  query = query || {};
  if (adminSessionOk(req)) return true;
  if (req.headers['x-token']) return sameToken(req.headers['x-token']);
  return sameToken(query.token || '');
}

/**
 * 写权限统一判定(2026-11-17 D1 收敛):`tokenOk ‖ (!TOKEN && isLocalRequest)`。
 * 此前同一表达式在 files-upload 三处 + routes dispatch 各写一遍(4 份),语义漂移风险。
 * 逐字保留原表达式(不改成 if(TOKEN) 分支):TOKEN 未配但存在有效 admin 会话 cookie 的
 * 边缘场景(曾配 TOKEN 签发过会话后撤掉),原式经 tokenOk→adminSessionOk 仍放行,分支式会拒。
 */
function adminWrite(req, query) {
  return tokenOk(req, query) || (!TOKEN && isLocalRequest(req));
}

module.exports = {
  ADMIN_COOKIE, ADMIN_SESSION_MS, ADMIN_SESSION_MAX,
  sidHash, adminSessions, issueAdminSession, adminSessionOk, adminSessionCookie,
  sameToken, tokenOk, tokenOkPage, adminWrite,
};