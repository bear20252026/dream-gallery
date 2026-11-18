// admin.js — 主人后台接口(2026-08-30 权限精简版)
// 唯一访客管理动作 = 踢出(kick);被踢者申请重进后批准(approve);其余仅信息记录(备注)。
// 拉黑 IP 保留给反刷预警(abuse)自动使用,不再是常规管理操作。
const fs = require('fs');
const path = require('path');
const { USER_LINKS_PER_PERSON, USER_LINKS_MAX, MYLINKS_RATE } = require('./config');
const { sendJson, readBody, safeJoin } = require('./util');
// D1 阶段3:镜像/台账/广播直依赖叶子(原批量批准分支懒 require files-upload 是 admin↔files-upload
// 唯一真环对的另一半;files-upload 的 tokenOk 已改 authz,环对两边都断开)
const { r2Mirror } = require('./r2-mirror');
const r2outbox = require('./r2outbox');
const { mediaBroadcast } = require('./media-push');
// D2:身份处置域门面(踢出/批准/备注/拉黑,写动作内含落盘+通知)
const identity = require('./domain/identity');
const { gateData, saveGateData, getApplicant, revokeSession, rotateMt } = require('./store');
// (sseNotify/issueSession 随处置动作收编进 domain/identity,D2;admin 不再直接发通知/签发会话)
const aiusage = require('./aiusage'); // 只读汇总用(台账本身由消费方记账,见 lib/aiusage.js)
const hotread = require('./hotread'); // 读门面:后台三列表走真表,null ⇒ 旁路数组(SQLite 不可用/读抛错)
// (TOKEN/getCookies/capKeys/isLocalRequest/crypto 随鉴权判定迁 lib/authz.js,D1)

// ===================== 管理员会话与 token 判定(2026-11-17 D1 迁出) =====================
// 全部判定逻辑已迁 lib/authz.js(纯判定叶子,只依赖 config/util/store/local-request/crypto)。
// 这里 re-export 保持全部消费方 require('./admin').tokenOk 等引用形状与测试钉子不变。
// 新代码请直接 require('./authz') —— 别再为验个 token 拖进整个后台 handler 依赖链。
const {
  ADMIN_COOKIE, ADMIN_SESSION_MS, ADMIN_SESSION_MAX,
  sidHash, adminSessions, issueAdminSession, adminSessionOk, adminSessionCookie,
  sameToken, tokenOk, tokenOkPage, adminWrite,
} = require('./authz');

// IP 归属地(2026-10-14 换实现):这里**不再发任何网络请求**,只读 lib/geoip 记下的国家/地区标签。
// 旧版打 https://ip-api.com/json/<访客IP> —— 而免费层只有 HTTP:HTTPS 回 403 + {"status":"fail"},
// fetch 不为 403 抛错、返回体又是合法 JSON ⇒ 走 status!=='success' 分支静默写「未知」,连 .catch 都
// 进不去,再被 `if (ip in gateData.geo) return` 的永久占位钉死 ⇒ 后台归属地全线、永久显示「未知」。
// 而且这条链路一直在把访客 IP 交给第三方(privacy.html 曾为此专门披露)。现在访客 IP 不出栈。
const geoip = require('./geoip');
function geoLabel(ip) { return geoip.labelOf(ip); }

// 清理入口(后台 /api/admin/bulk action=clear-geo):抹掉全部 IP→归属地缓存
function clearGeo() {
  gateData.geo = {};
  saveGateData();
}

function handleAdminList(req, res, query) {
  if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
  const list = Object.entries(gateData.applicants)
    .map(([id, a]) => {
      // 只读:归属地由访客自己的请求经 lib/geoip 记下(旧版在这里发起外呼并落盘 ——
      // 一个"列表现"的接口顺手写库,既慢又会把后台打开次数变成第三方查询次数)
      return { id, ...a, geo: geoLabel(a.ip) };
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
    applicants: list, stats: gateData.stats, visits: hotread.visitsTail(300) || (gateData.visits || []).slice(-300),
    blocked: identity.blockedList(), now: Date.now(), // D2:身份域门面读口径
    kickLog: identity.kickLogTail(100),
    uploads, uploaderInfo,
    photoCaptions: gateData.photoCaptions || {},
    userLinks: gateData.userLinks || [],
    // 归属地读数:来源、条目数,以及**为什么是空的**(header/no-header/no-proxy/local 分开计数)
    // —— 旧版失败原因只有一句 console 也没有,查一次就要翻代码
    geo: geoip.geoStats(),
    // 三道闸的读数(2026-10-13):访客链接撞到 USER_LINKS_MAX 时,访客只拿到一句 503、服务器只有一行
    // console.warn,面板上完全看不出来 —— 于是"要不要把 300 改大"这个决定没有数据可看。
    // used 是**全局条数**(所有访客合计),perPerson/rate 是判定口径;值来自 lib/config.js 那一份常量
    // (siteconfig re-export 同一个,不是复制的第二份真相)。
    linkCaps: {
      used: (gateData.userLinks || []).length,
      max: USER_LINKS_MAX,
      perPerson: USER_LINKS_PER_PERSON,
      ratePerMin: MYLINKS_RATE,
    },
    linkClicks: (hotread.clicksTail(300) || (gateData.linkClicks || []).slice(-300)).reverse(),
    clientErrors: (hotread.gateErrorsTail(100) || (gateData.clientErrors || []).slice(-100)).reverse(),
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
      // D2:处置动作收编身份域门面(改状态+踢出历史+落盘+秒级通知,语义逐字保留)
      identity.kick(a, obj.id, obj.reason);
      sendJson(res, 200, { ok: true });
    } else if (act === 'approve') {
      // 批准重进 / 恢复放行;兼容旧后台缓存发来的 'perm' 同义
      identity.approve(a); // 会话唯一正常重发入口(issueSession 内含落盘)
      sendJson(res, 200, { ok: true });
    } else if (act === 'note') {
      identity.note(a, obj.note);
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
      // D2:拉黑写动作收编身份域门面(内含落盘)
      if (act === 'block') identity.blockIp(ip); else identity.unblockIp(ip);
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
    } else if (act === 'approve-media' || act === 'reject-media') {
      // R4 视频待审队列(2026-11-16 零成本方案):人工批准/拒绝。
      // approve:摘 pending → 补 R2 镜像(待审期间刻意没镜像)→ 广播上墙;
      // reject:删文件+删记录(与 NSFW block 同口径:违规内容不留盘)。
      const name = String(obj.name || '');
      // 审计2修 P3-1:hasOwnProperty 防 name='__proto__' 时 rec=Object.prototype 的原型污染
      const rec = name && gateData.uploads && Object.prototype.hasOwnProperty.call(gateData.uploads, name)
        ? gateData.uploads[name] : null;
      if (!rec) { sendJson(res, 404, { error: '找不到该上传记录' }); return; }
      // 审计2修:本队列只服务视频待审(videoReview 由 publish 写入,dir 恒 'videos')。
      // 没有 videoReview 的记录(图片/主人直传视频)不该被这两个动作改写,防记录污染。
      if (!rec.videoReview) { sendJson(res, 400, { error: '该记录不在视频待审队列' }); return; }
      const dir = rec.videoReview.dir || 'videos';
      if (act === 'approve-media') {
        delete rec.pending;
        rec.reviewedAt = Date.now();
        saveGateData();
        // 补镜像+广播:走与直传相同的通道(台账失败退避重试);D1 阶段3 顶部直依赖叶子,环对已断
        try {
          const fp = safeJoin(path.join(dir, name));
          if (fp && fs.existsSync(fp)) {
            r2Mirror(dir, name, fp);
          } else {
            // 审计2修 P3-2:文件不在(压缩刚改名/被挪)不能静默漏推 —— 记台账让 r2outbox 兜底重试
            console.warn('[admin] 批准时源文件暂不在位,记台账待补镜像:', name);
            try { r2outbox.enqueuePut(dir, name, fp || ''); } catch (e2) {}
          }
        } catch (e) { console.warn('[admin] 批准后补镜像失败(台账会兜底):', e && e.message); }
        try { mediaBroadcast({ dir, name }); } catch (e) {}
        sendJson(res, 200, { ok: true, name, approved: true });
      } else {
        // 审计2修 P2-1:**同步**删文件(旧异步 unlink 与在途压缩收工有竞态窗口);
        // 记录先删再删文件:压缩收工的"记录仍在"复查据此丢弃产物,不会复活。
        delete gateData.uploads[name];
        saveGateData();
        try {
          const fp = safeJoin(path.join(dir, name));
          if (fp) { try { fs.unlinkSync(fp); } catch (e) {} }
        } catch (e) {}
        try { r2outbox.syncDelete(dir, name); } catch (e) {}
        sendJson(res, 200, { ok: true, name, rejected: true });
      }
    } else {
      sendJson(res, 400, { error: '未知操作(仅 block/unblock/rotate-mt/clear-geo/approve-media/reject-media)' });
    }
  });
}

// GET /api/admin/quiz(token):答题记录 + 设备信息(原 server.js 内联逻辑,2026-09-02 路由拆分迁入)
function handleAdminQuiz(req, res, query) {
  if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
  const devMap = {};
  for (const a of Object.values(gateData.applicants)) {
    if (a.dk) devMap[a.dk] = { answer: a.answer, brand: a.brand || '', geo: geoLabel(a.ip) };
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
  geoLabel,
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
