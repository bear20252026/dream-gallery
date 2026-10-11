// admin.js — 主人后台接口(2026-08-30 权限精简版)
// 唯一访客管理动作 = 踢出(kick);被踢者申请重进后批准(approve);其余仅信息记录(备注)。
// 拉黑 IP 保留给反刷预警(abuse)自动使用,不再是常规管理操作。
const { TOKEN } = require('./config');
const { sendJson, readBody, getCookies } = require('./util');
const { gateData, saveGateData, getApplicant, revokeSession, issueSession, rotateMt, capKeys } = require('./store');
const { sseNotify } = require('./gate');
const aiusage = require('./aiusage'); // 只读汇总用(台账本身由消费方记账,见 lib/aiusage.js)
const crypto = require('crypto');

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
  if (process.env.TOKEN_QUERY === '0' && !isLocalHost(req)) return false;
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
function isLocalHost(req) {
  const host = String((req && req.headers && req.headers.host) || '');
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
}

// IP 归属地查询(免费接口,省市级,结果缓存进 gate_data.geo)
// ⚠️ 隐私链路:本函数把**访客 IP** 发给第三方 ip-api.com —— 属于向第三方披露访客个人数据,
// 隐私政策(privacy.html)必须覆盖这条链路(披露对象/目的/字段);保留功能但条目设上限并可一键清理。
const GEO_MAX = 2000; // gateData.geo 条目上限(超了按插入顺序淘汰最旧,防无界增长与历史 IP 长留)
function geoLookup(ip) {
  if (!ip) return;
  if (!gateData.geo) gateData.geo = {};
  if (ip in gateData.geo) return; // 已查过(含失败占位)
  gateData.geo[ip] = null; // 占位防并发重复查询
  capKeys(gateData.geo, GEO_MAX);
  const clean = ip.replace('::ffff:', '');
  fetch(`https://ip-api.com/json/${encodeURIComponent(clean)}?lang=zh-CN&fields=status,regionName,city,isp`, { signal: AbortSignal.timeout(5000) })
    .then(r => r.json())
    .then(d => {
      let g = d.status === 'success'
        ? (d.regionName || '') + (d.city && d.city !== d.regionName ? ' ' + d.city : '') + (d.isp ? ' · ' + d.isp : '')
        : '';
      gateData.geo[ip] = g.trim() || '未知';
      capKeys(gateData.geo, GEO_MAX);
      saveGateData();
    })
    .catch(() => { gateData.geo[ip] = '未知'; capKeys(gateData.geo, GEO_MAX); });
}

// 清理入口(后台 /api/admin/bulk action=clear-geo):抹掉全部 IP→归属地缓存
function clearGeo() {
  gateData.geo = {};
  saveGateData();
}

function handleAdminList(req, res, query) {
  if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
  const list = Object.entries(gateData.applicants)
    .map(([id, a]) => {
      geoLookup(a.ip); // 触发缺失的归属地查询(异步,下次刷新可见)
      return { id, ...a, geo: (gateData.geo && gateData.geo[a.ip]) || '' };
    })
    .sort((x, y) => y.applyTime - x.applyTime);
  // 展示区相关数据(模式卡/媒体库/访客链接用):上传归属、AI 配文、访客链接、站点配置
  const uploads = gateData.uploads || {};
  const uploaderInfo = {};
  for (const [name, u] of Object.entries(uploads)) {
    // 归属优先按 aid(不可猜测的 vid)直查;旧记录没有 aid 才退回 dk(UA 哈希)——
    // 而同一 UA 可能对应多个档案,取"第一个"会把别人的昵称安到这张照片上(2026-10-11 审计收尾),
    // 所以撞上多主时明确标成"归属不明(同 UA 多档案)"让后台看得见不确定性。
    let who = u.aid ? gateData.applicants[u.aid] : null;
    if (!who && u.dk) {
      const same = Object.entries(gateData.applicants).filter(([, a]) => a.dk === u.dk);
      who = same.length === 1 ? same[0][1] : same.length > 1 ? { answer: '归属不明(同 UA 多档案)' } : null;
    }
    uploaderInfo[name] = who ? (who.answer || who.brand || '访客') : '访客';
  }
  sendJson(res, 200, {
    applicants: list, stats: gateData.stats, visits: (gateData.visits || []).slice(-300),
    blocked: gateData.blockedIps, now: Date.now(),
    kickLog: (gateData.kickLog || []).slice(-100).reverse(),
    uploads, uploaderInfo,
    photoCaptions: gateData.photoCaptions || {},
    userLinks: gateData.userLinks || [],
    linkClicks: (gateData.linkClicks || []).slice(-300).reverse(),
    clientErrors: (gateData.clientErrors || []).slice(-100).reverse(),
    alerts: (gateData.alerts || []).slice(-100).reverse(),
    siteConfig: gateData.siteConfig || { mode: 'normal', customLinks: [], demoPhotos: [] },
  });
}

// 访客管理动作(精简后):
//   kick    踢出设备(唯一常规管理动作):标记 kicked + 踢出历史 + SSE 立即送出画廊
//   approve 批准重进申请(reapply)或误操作恢复(kicked)→ approved 放行
//   note    备注改名
function handleAdminDecide(req, res, query) {
  if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
  readBody(req, obj => {
    const a = getApplicant(String(obj.id || ''));
    if (!a) { sendJson(res, 404, { error: '申请不存在' }); return; }
    const act = obj.action;
    if (act === 'kick') {
      a.status = 'kicked';
      a.kickedTime = Date.now();
      a.kickReason = String(obj.reason || '').slice(0, 60);
      // 踢出历史日志(独立于档案,档案被重建也不丢记录)
      if (!gateData.kickLog) gateData.kickLog = [];
      gateData.kickLog.push({
        t: Date.now(), id: obj.id, name: a.answer || '访客',
        ip: a.ip || '', dk: a.dk || '', reason: a.kickReason,
      });
      if (gateData.kickLog.length > 200) gateData.kickLog.splice(0, gateData.kickLog.length - 200);
      saveGateData();
      sseNotify(a.dk ? [a.dk] : [], 'kick'); // 秒级通知该设备(收到即弹回申请页)
      sendJson(res, 200, { ok: true });
    } else if (act === 'approve') {
      // 批准重进 / 恢复放行;兼容旧后台缓存发来的 'perm' 同义
      a.status = 'approved';
      a.approveTime = Date.now();
      delete a.matchHint;
      // 批准 = 会话的唯一正常重发入口:新会话盖上当前 authVersion(吊销过的档案由此才恢复有效)
      issueSession(a); // 内含 saveGateData, status/approveTime 一并落盘
      sseNotify(a.dk ? [a.dk] : [], 'approved');
      sendJson(res, 200, { ok: true });
    } else if (act === 'note') {
      a.note = String(obj.note || '').slice(0, 50);
      saveGateData();
      sendJson(res, 200, { ok: true });
    } else if (act === 'revoke-session') {
      // 吊销该访客的会话 Token:Cookie 立即失效,不改踢出状态;
      // 2026-10-10 DG-AUTH-002:吊销是永久状态(authVersion+1,旧 sess 永不匹配),
      // 不会因设备下次访问自动换发——恢复只能靠批准(approve)。
      // revoked_permanently 供后台文案对齐:前端「将重新识别/不等于踢出」的措辞需要改(主代理处理)。
      const ok = revokeSession(String(obj.id || ''));
      if (!ok) { sendJson(res, 404, { error: '档案不存在' }); return; }
      sendJson(res, 200, { ok: true, revoked_permanently: true });
    } else {
      sendJson(res, 400, { error: '未知操作(仅 kick/approve/note/revoke-session)' });
    }
  });
}

// 批量/运维动作:block-unblock(IP 拉黑) + rotate-mt(重签媒体令牌) + clear-geo(清理 IP 归属地缓存)
function handleAdminBulk(req, res, query) {
  if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
  readBody(req, obj => {
    const act = obj.action;
    if (act === 'block' || act === 'unblock') {
      const ip = String(obj.ip || '');
      if (!ip) { sendJson(res, 400, { error: '缺少 ip' }); return; }
      const set = new Set(gateData.blockedIps);
      if (act === 'block') set.add(ip); else set.delete(ip);
      gateData.blockedIps = [...set];
      saveGateData();
      sendJson(res, 200, { ok: true });
    } else if (act === 'rotate-mt') {
      // 媒体令牌轮换(DG-AUTH-003):令牌是 bearer,怀疑泄漏即重签,旧 URL 当场失效
      const name = String(obj.name || '');
      const mt = name ? rotateMt(name) : null;
      if (!mt) { sendJson(res, 404, { error: '找不到该上传记录' }); return; }
      sendJson(res, 200, { ok: true, name, mt, rotated: true });
    } else if (act === 'clear-geo') {
      clearGeo();
      sendJson(res, 200, { ok: true });
    } else {
      sendJson(res, 400, { error: '未知操作(仅 block/unblock/rotate-mt/clear-geo)' });
    }
  });
}

// GET /api/admin/quiz(token):答题记录 + 设备信息(原 server.js 内联逻辑,2026-09-02 路由拆分迁入)
function handleAdminQuiz(req, res, query) {
  if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
  const devMap = {};
  for (const a of Object.values(gateData.applicants)) {
    if (a.dk) devMap[a.dk] = { answer: a.answer, brand: a.brand || '', geo: (gateData.geo && gateData.geo[a.ip]) || '' };
  }
  const attempts = (gateData.quizAttempts || []).slice(-100).reverse()
    .map(at => ({ ...at, device: devMap[at.dk] || null }));
  sendJson(res, 200, { attempts });
}

// GET /api/admin/ai-usage(token):AI 用量台账只读汇总(2026-10-12 审计 P2 · 统一用量统计)
// 只读不写:返回按天×能力的汇总 + 最近调用 + 通道命中滚动;台账里没有任何文本内容(见 lib/aiusage.js)。
// ⚠️ 本端点不参与也不改变任何限流/配额判定 —— 2026-09-24 主人拆除的按设备日配额不在此复活。
function handleAdminAiUsage(req, res, query) {
  if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
  sendJson(res, 200, aiusage.summary());
}

module.exports = {
  tokenOk,
  tokenOkPage,
  geoLookup,
  clearGeo,
  handleAdminList,
  handleAdminDecide,
  handleAdminBulk,
  handleAdminQuiz,
  handleAdminAiUsage,
  ADMIN_COOKIE,
  ADMIN_SESSION_MS,
  adminSessionOk,
  adminSessionCookie,
  issueAdminSession,
};
