// gate.js — 入口守卫 + 踢出/重进申请流(2026-08-30 权限体系精简版)
// 规则(主人定):所有用户自由进入画廊;唯一管理动作 = 踢出;
// 被踢出设备再次进入必须提交申请,后台批准后放行。
// 身份识别三级:Cookie(vid/pass) → 设备键(UA/dk) → 前端采集的持久 ID + 多维指纹
//   (localStorage/IndexedDB/Cookie 三处冗余、canvas/webgl/audio),核对"是不是同一个人"。
const crypto = require('crypto');
const { sendJson, readBody, getCookies } = require('./util');
const {
  gateData, saveGateData,
  parseBrand, deviceKey, findByDevice, signId, realIP,
  recordVisit, isAutomated, getApplicant, quotaKey, capApplicants, capKeys,
  sessionValid, touchSession, authVid, resumeSession, isUnclaimedProfile, sessionRevoked,
} = require('./store');
const geoip = require('./geoip'); // 访客国家/地区:只用 Cloudflare 已算好的 cf-ipcountry 头,零外呼
const identity = require('./domain/identity'); // D2:身份域门面(拉黑判定读口径;门面只依赖低位叶子,无环)
const ratelimit = require('./ratelimit'); // 采集端点洪水防护(2026-11-11 审计 P2-1)
const { COLLECT_RATE } = require('./config');

// ===================== 通用工具 =====================
// Cookie 属性(2026-09-18 审计 P1#3):HTTPS/生产域追加 Secure,防明文信道窃取 vid/pass
function cookieAttrs(req) {
  const host = String((req && req.headers && req.headers.host) || '').toLowerCase();
  const proto = String((req && req.headers && req.headers['x-forwarded-proto']) || '').toLowerCase();
  const encrypted = !!(req && req.socket && req.socket.encrypted);
  const isHttps = encrypted || proto.split(',')[0].trim() === 'https';
  const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const secure = isHttps || (!isLocal && host.endsWith('cloudbear.cloud'));
  return `HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

function mintPass(req, id) {
  return `pass=${id}.${signId(id)}; Path=/; Max-Age=31536000; ${cookieAttrs(req)}`;
}

function vidCookie(req, id) {
  return `vid=${id}; Path=/; Max-Age=31536000; ${cookieAttrs(req)}`;
}

// 多维指纹哈希:前端原始信号 → 稳定哈希集合(不含 IP,允许跨网络命中)
// 任一哈希命中档案 fpSet 即判定同一设备
function fpHashes(fp) {
  if (!fp || typeof fp !== 'object') return [];
  const groups = [
    // 硬件组:屏幕/时区/语言/平台/核数/内存/触屏 + canvas 渲染
    [fp.scr, fp.avail, fp.tz, fp.lang, fp.langs, fp.platform, fp.cores, fp.mem, fp.touch, fp.maxTouch, fp.canvas],
    // GPU 组:WebGL 渲染器串(换浏览器也不变)
    [fp.webgl],
    // 音频组:AudioContext 渲染哈希
    [fp.audio],
  ];
  const out = [];
  for (const g of groups) {
    const s = g.map(x => (x === undefined || x === null ? '' : String(x))).join('|');
    if (s.replace(/[|0,false]/g, '') === '') continue;
    out.push(crypto.createHash('sha256').update(s).digest('hex').slice(0, 16));
  }
  return out;
}

// 按档案字段记录 IP 历史(最多 10 个,最新在前)
// ⚠️ a.ips 保持"字符串数组"原形状不变(后台只读 a.ips.length,任何消费方都不该被迫处理对象),
//   时间维度平行记在 a.ipsAt(同下标、同样最长 10 条)——保留期清理(lib/retention.js 的 ipHistory)
//   只按 ipsAt 丢"超过保留期的历史 IP",当前 a.ip 永远保留;门禁判定用的是当前 IP/指纹,
//   所以丢掉半年前用过的网络地址不影响"同设备重进申请"的识别。
// 2026-11-17 C10:pushIp 返回"是否发生实质变更"。同 IP 的时刻刷新按 1h 节流
// (与 touchSession 同口径):ipsAt 只被保留期裁剪消费(判"老于保留期"),小时级精度足够,
// 每请求刷 Date.now() 是把"无实质变更"变成"有变更"的写放大根源。
const IP_TOUCH_THROTTLE_MS = 3600000;
function pushIp(a, ip) {
  if (!ip) return false;
  const clean = String(ip).replace(/^::ffff:/i, '');
  let changed = false;
  if (!Array.isArray(a.ips)) { a.ips = []; changed = true; }
  if (!Array.isArray(a.ipsAt)) { a.ipsAt = a.ips.map(() => 0); changed = true; } // 0 = 存量未知时刻(清理时按畸形跳过)
  if (a.ips[0] === clean) {
    // 同一个 IP 仍在用:刷新它的时刻,免得长期连网的访客把当前地址"老化"掉(1h 节流)
    if (Array.isArray(a.ipsAt) && a.ipsAt.length === a.ips.length) {
      const now = Date.now();
      if (now - (a.ipsAt[0] || 0) >= IP_TOUCH_THROTTLE_MS) { a.ipsAt[0] = now; changed = true; }
    }
    return changed;
  }
  const i = a.ips.indexOf(clean);
  if (i >= 0) { a.ips.splice(i, 1); if (Array.isArray(a.ipsAt)) a.ipsAt.splice(i, 1); }
  a.ips.unshift(clean);
  if (Array.isArray(a.ipsAt)) a.ipsAt.unshift(Date.now());
  if (a.ips.length > 10) a.ips.length = 10;
  if (Array.isArray(a.ipsAt) && a.ipsAt.length > 10) a.ipsAt.length = 10;
  return true; // IP 列表变了 = 实质变更
}

// 身份归并:vid Cookie(会话有效) → 同一 vid 但只是过期(未被吊销)→ 完全匿名档案的 dk(UA) → UA 全文
// 2026-10-10 DG-SEC-002:后两级只许并入「完全匿名且从未被认领」的档案——
// UA 相同不构成身份,他人的昵称/踢出状态不得经 dk 传给新访客(强信号 localId/指纹仍在 handleCollect 兜住真设备)。
// 过期分支只认浏览器里那个不可猜测的 vid 本身(不是 UA),身份可续用;
// 吊销过的档案(sessionRevoked)一律走不到这里,永久失效。
function findVisitorId(req) {
  const vid = authVid(req);
  if (vid) return vid;
  const raw = getCookies(req).vid;
  if (raw) {
    const a = getApplicant(raw);
    if (a && !sessionRevoked(a)) return raw; // 只是过期:稍后由 handleCollect 重新验证换发会话
  }
  const dk = deviceKey(req);
  for (const [aid, a] of Object.entries(gateData.applicants)) {
    if (a.dk === dk && isUnclaimedProfile(a)) return aid;
  }
  const ua = req.headers['user-agent'] || '';
  if (ua) {
    for (const [aid, a] of Object.entries(gateData.applicants)) {
      if (a.ua === ua && isUnclaimedProfile(a)) return aid;
    }
  }
  return null;
}

// ===================== 统一封禁裁决(2026-10-12 外部审计第四轮 Batch1:API 黑名单/封禁校验单一源) =====================
// 单一决策源:回答「该请求的身份是否被封」,两个信号——
//   ① gateData.blockedIps 含 realIP(req);
//   ② 按设备键查到的访客档案 status 落在拒绝集(kicked/denied/history/reapply;
//      status 缺失时才认 kickedTime —— 见 isProfileBanned 的注释)
// 与 entryGate 逐字同口径:档案查找复用下面那个只读入口 findVisitorId
//   (vid Cookie → 未吊销的过期 Cookie → 仅「完全匿名未认领」档案的 dk/UA 兜底)。
// ⚠️ 严格只读:绝不建档、绝不 recordVisit、绝不换发/续期会话、绝不 saveGateData。
//    entryGate 刻意要建/改档案(放行陌生人);本裁决刻意不——两者职责分开,
//    故 server.js 才敢把它放到 dispatch 之前当 API 面的闸门。
const REJECT_STATUSES = ['kicked', 'denied', 'history', 'reapply']; // 与 entryGate 同口径的「不放行」状态

// IP 是否在拉黑名单(API 守卫与 ws 守卫共用,消灭原先两处各写一遍)
// D2:读口径收编身份域门面(与后台 block/unblock 写动作同一处,判定与写入不再各摸深层属性)
function isIpBlocked(req) {
  return identity.isIpBlocked(req);
}

// 取「用于封禁判定的访客档案」:只读,查不到返回 null。
// 后台 API 调用(不带访客 vid Cookie、名下也无匿名未认领档案)返回 null ⇒ 不会被设备信号误封。
function findBannedProfile(req) {
  const id = findVisitorId(req);
  return id ? getApplicant(id) : null;
}

// 档案是否处于拒绝态:status ∈ 拒绝集;kickedTime 是「状态缺失时」的踢出凭据(autoAdmit 重建档案时
// 就是靠它把踢出状态带回来的:status: old.kickedTime ? 'kicked' : 'approved')。
// ⚠️ 绝不可「见 kickedTime 就封」:后台 approve 只把 status 改回 'approved',kickedTime/kickReason
//    作为审计线索永久保留(lib/retention.js 还拿它判「曾被管理员处理过」而免于清理)。
//    若把它当独立封禁条件,主人批准后的人会被永久挡在门外(2026-10-12 由 scripts/test/test.js
//    「批准后恢复放行」用例实锤)。
function isProfileBanned(a) {
  if (!a) return false;
  const st = String(a.status);
  if (REJECT_STATUSES.includes(st)) return true;
  return !a.status && !!a.kickedTime; // 无状态的历史/畸形档案:踢出凭据即视为被请离
}

// 完整裁决:返回 { blocked, reason }。reason ∈ 'blocked-ip' | 'kicked' | null。
// reason 字符串与 lib/multiplayer.upgradeRejectReason 的拒绝契约同源。
function banDecision(req) {
  if (isIpBlocked(req)) return { blocked: true, reason: 'blocked-ip' };
  if (isProfileBanned(findBannedProfile(req))) return { blocked: true, reason: 'kicked' };
  return { blocked: false, reason: null };
}

// ===================== API 层封禁守卫(server.js 在 dispatch 之前调用) =====================
// 背景洞:dispatch 排在 entryGate 之前,故被拉黑 IP / 被踢设备过去仍可打所有 auth:'public' 的接口。
// 现把这道身份判定前移到路由分发之前。命中封禁 ⇒ 直接回 403 JSON(sendJson 自带
// Cache-Control: no-store,防共享缓存回放旧的放行响应;不需 Vary: Cookie),返回 true(已处理),
// 否则返回 false 交回 dispatch。只守卫 /api/ 面——静态/页面请求不在此管辖(它们本就先经 entryGate)。
// 豁免(仅入口/重进流):被挡的访客仍须能看到自己的状态并提交重进申请。尤其 GET /api/entry/watch
// 是 SSE 秒级踢出通道(src/visitor-fp.js:128 的 EventSource 是唯一即时送达 admin kick 的消费者,
// 另闸门「等待页」每 6 秒轮 GET /api/entry/status),一旦被拦踢出就「隐身」。/api/entry/rename 刻意不豁免。
const API_BAN_EXEMPT = new Set([
  'POST /api/entry/collect',
  'POST /api/entry/reapply',
  'GET /api/entry/status',
  'GET /api/entry/watch',
]);
function apiBanGuard(req, res, pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/api/')) return false;
  if (API_BAN_EXEMPT.has(req.method + ' ' + pathname)) return false;
  const d = banDecision(req);
  if (!d.blocked) return false;
  sendJson(res, 403, { error: d.reason === 'blocked-ip' ? '此 IP 已被限制访问' : '此设备已被限制访问' });
  return true;
}

// ===================== 入口守卫(无条件启用,替代旧 approvalGate) =====================
// 返回 true = 放行。仅拦截:被踢出设备(落申请页) / 拉黑 IP(反刷,落拒绝页)。
// 其余任何人(陌生设备)静默建档直接放行——"自由进画廊"。
function entryGate(req, res, pathname) {
  // 拉黑 IP 检查必须在 isAutomated 短路之前(2026-08-31 审计 M1:否则删 UA 头即可绕过拉黑)
  if (isIpBlocked(req)) {
    serveGatePage(res, 'denied', '很抱歉，您暂时无法参观');
    return false;
  }
  // 身份/踢出状态优先判定(2026-09-18 审计 P1#1):不得用 x-probe/空 UA 绕过 kicked/reapply
  // 身份解析只走一个只读入口 findVisitorId;拒绝判定复用 banDecision 的同一套档案口径。
  // isAutomated 仅用于「不建档、不计统计」,不再整段放行。
  const id = findVisitorId(req);
  const p = id ? getApplicant(id) : null;
  if (isProfileBanned(p)) {
    // 已提交重进申请 → 等待页;其余被请离状态(kicked/denied/history)→ 申请页
    if (String(p.status) === 'reapply') serveGatePage(res, 'wait');
    else serveGatePage(res, 'reentry');
    return false;
  }
  // 自动化流量(测试/探针/无头):不建档不计数(上面的拉黑/踢出已生效)
  if (isAutomated(req)) return true;
  // 已批准(或存量无状态)档案:放行并补发通行证
  if (p) {
    const ipChanged = pushIp(p, realIP(req));
    geoip.note(req); // 顺手记下国家/地区(零外呼;值变才自落盘,见 lib/geoip.js 头注)
    // 2026-11-17 C10:lastAccess 与 pushIp 同口径 1h 节流——它只被后台展示/保留期消费,
    // 每请求刷 Date.now() 是"每个静态资源请求都整库落盘"的写放大根源之一。
    const now = Date.now();
    const accessChanged = now - (p.lastAccess || 0) >= IP_TOUCH_THROTTLE_MS;
    if (accessChanged) p.lastAccess = now;
    // 过期会话由「本人那个不可猜测的 HttpOnly vid」本身换发(resumeSession:有效→续期,过期→换发,
    // 吊销过→版本不匹配、永不复活)。此前这里只 touchSession,而唯一的自助换发口 handleCollect
    // 依赖的前端指纹通道早已是死代码 → 30 天空闲过期的人会被永久挡在自己照片之外。
    // resumeSession 内部换发/续期(1h节流)自带落盘,无需这里重复 save。
    resumeSession(p);
    if (pathname === '/') recordVisit(req, id, p);
    else if (ipChanged || accessChanged) saveGateData(); // C10:变更才落盘;无变更的静态请求零写盘
    const cookies = getCookies(req);
    if (!cookies.pass) res.setHeader('Set-Cookie', [
      vidCookie(req, id),
      mintPass(req, id),
    ]);
    return true;
  }

  // 陌生设备:静默建档放行
  return autoAdmit(req, res, pathname);
}

function autoAdmit(req, res, pathname) {
  capApplicants();
  const dk = deviceKey(req);
  let id = null;
  // 同 UA 只可续用「完全匿名且从未被认领」的旧档案(存量迁移),他人档案一律新建身份(DG-SEC-002)
  for (const [aid, a] of Object.entries(gateData.applicants)) {
    if (a.dk === dk && isUnclaimedProfile(a)) { id = aid; break; }
  }
  const isNew = !id; // C10:新建档必落盘;续用旧档案走"变更才落盘"(与 entryGate 同口径)
  if (!id) id = crypto.randomBytes(8).toString('hex');
  const old = gateData.applicants[id] || {};
  // lastAccess 1h 节流(新档案 old 为空 ⇒ now-0 必过节流,首建仍记当前时刻)
  const now = Date.now();
  const accessChanged = now - (old.lastAccess || 0) >= IP_TOUCH_THROTTLE_MS;
  gateData.applicants[id] = {
    answer: old.answer || '访客',
    ua: req.headers['user-agent'] || old.ua || '',
    brand: parseBrand(req.headers['user-agent']),
    ip: realIP(req) || '',
    dk,
    localId: old.localId || '',
    fpSet: old.fpSet || {},
    applyTime: old.applyTime || Date.now(),
    lastAccess: accessChanged ? now : old.lastAccess,
    visits: old.visits || 0,
    note: old.note || '',
    // 会话与吊销版本号必须原样带过去:重建档案时丢掉 sess/authVersion 等于给已吊销会话复活的后门
    authVersion: old.authVersion || 0,
    sess: old.sess,
    // 旧档案若曾被踢出,重建设备档案不洗白踢出状态(踢出以指纹/ID 识别,不依赖单一档案)
    kickedTime: old.kickedTime,
    kickReason: old.kickReason,
    status: old.kickedTime ? 'kicked' : 'approved',
  };
  const ipChanged = pushIp(gateData.applicants[id], realIP(req));
  geoip.note(req);
  resumeSession(gateData.applicants[id]); // 新档案即建会话(自带落盘);吊销过的保持无效
  if (pathname === '/') recordVisit(req, id, gateData.applicants[id]);
  else if (isNew || ipChanged || accessChanged) saveGateData(); // C10:新建档/实质变更才落盘
  res.setHeader('Set-Cookie', [
    vidCookie(req, id),
    mintPass(req, id),
  ]);
  return true;
}

// ===================== 指纹采集归并 + 强信号踢出命中 =====================
// POST /api/entry/collect {lid, fp:{scr,avail,tz,...,canvas,webgl,audio}}
// ① 持久 ID(localId)或任一指纹命中"已踢出"档案 → 当前访问直接判为被踢设备,
//    当前档案并入踢出状态(防"清 Cookie 建新档"绕过),响应 deny 前端跳申请页;
// ② 否则写入当前档案的 localId/fpSet/ips,完善后续识别。
function handleCollect(req, res) {
  // 洪水防护(2026-11-11 审计 P2-1):本端点每次调用全量 saveGateData 落盘,且在封禁豁免清单里——
  // 匿名脚本可反复建新档案造成磁盘写放大。限流必须在 readBody/建档/落盘之前,
  // 超限一个字节都不写。自动化流量(探针/CI)不受限,与下方 isAutomated 短路同口径。
  if (!isAutomated(req)) {
    const rl = ratelimit.hit(req, 'entry-collect', COLLECT_RATE);
    if (!rl.ok) { sendJson(res, 429, { error: '操作过于频繁,请稍后再试', retryAfter: rl.retryAfter }); return; }
  }
  readBody(req, obj => {
    if (isAutomated(req)) { sendJson(res, 200, { ok: true }); return; }
    const lid = String(obj.lid || '').slice(0, 40);
    const hashes = fpHashes(obj.fp);
    let myId = findVisitorId(req);
    if (!myId) { capApplicants(); myId = crypto.randomBytes(8).toString('hex'); }
    const me = getApplicant(myId) || {};

    // 强信号匹配:遍历所有 kicked 档案,查 localId 与指纹集合
    if (me.status !== 'kicked') {
      for (const [aid, a] of Object.entries(gateData.applicants)) {
        if (a.status !== 'kicked') continue;
        const hitLocal = lid && a.localId && a.localId === lid;
        const hitFp = hashes.length && a.fpSet && hashes.some(h => a.fpSet[h]);
        if (hitLocal || hitFp) {
          // 当前档案标记为踢出(同一设备的新档案),并合并线索
          me.status = 'kicked';
          me.kickedTime = a.kickedTime || Date.now();
          me.kickReason = a.kickReason || '';
          me.matchHint = hitLocal ? '持久设备ID匹配' : '设备指纹匹配';
          me.kickedFrom = aid;
          saveGateData();
          sendJson(res, 200, { deny: true });
          return;
        }
      }
    }

    // 正常归并:写入识别信息
    if (lid) me.localId = lid;
    if (!me.fpSet) me.fpSet = {};
    for (const h of hashes) me.fpSet[h] = Date.now();
    const fpKeys = Object.keys(me.fpSet);
    if (fpKeys.length > 40) { // 防膨胀:保留最近 40 个
      fpKeys.sort((x, y) => me.fpSet[y] - me.fpSet[x]);
      me.fpSet = {};
      for (const k of fpKeys.slice(0, 40)) me.fpSet[k] = 1;
    }
    pushIp(me, realIP(req));
    geoip.note(req);
    gateData.applicants[myId] = Object.assign(
      {
        answer: '访客', ua: req.headers['user-agent'] || '', brand: parseBrand(req.headers['user-agent']),
        ip: realIP(req) || '', dk: deviceKey(req), applyTime: Date.now(), lastAccess: Date.now(),
        status: 'approved', visits: 0, note: '', localId: '', fpSet: {}, ips: [], ipsAt: [],
      },
      me
    );
    resumeSession(gateData.applicants[myId]); // 完成指纹重新验证 = 过期会话的唯一换发入口;吊销过的保持无效
    saveGateData();
    if (!getCookies(req).vid) res.setHeader('Set-Cookie', vidCookie(req, myId));
    sendJson(res, 200, { ok: true });
  });
}

// ===================== 重进申请 =====================
// POST /api/entry/reapply {msg}:被踢设备提交申请 → status='reapply',后台出现待批卡片
function handleReapply(req, res) {
  readBody(req, obj => {
    if (isAutomated(req)) { sendJson(res, 403, { error: '自动化访问' }); return; }
    let id = findVisitorId(req);
    if (!id) id = crypto.randomBytes(8).toString('hex');
    const a = getApplicant(id);
    if (a && a.status === 'reapply') { sendJson(res, 200, { ok: true, status: 'reapply' }); return; }
    if (!a || !(a.status === 'kicked' || a.status === 'denied' || a.status === 'history')) {
      // 无踢出档案的设备不该出现在申请页;直接批准放行(守卫未拦到的兜底)
      sendJson(res, 200, { ok: true, status: 'approved' });
      return;
    }
    a.status = 'reapply';
    a.reapplyTime = Date.now();
    a.reapplyMsg = String(obj.msg || '').slice(0, 60);
    touchSession(a);
    saveGateData();
    res.setHeader('Set-Cookie', vidCookie(req, id));
    sendJson(res, 200, { ok: true, status: 'reapply' });
  });
}

// GET /api/entry/status:申请页轮询;批准后 enter=true
function handleEntryStatus(req, res) {
  const id = findVisitorId(req);
  const a = id ? getApplicant(id) : null;
  if (a && a.status === 'approved') {
    resumeSession(a);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': [vidCookie(req, id), mintPass(req, id)],
    });
    res.end(JSON.stringify({ status: 'approved', enter: true }));
    return;
  }
  sendJson(res, 200, { status: a ? a.status : 'none', enter: false });
}

// ===================== SSE 秒级推送(2026-11-17 D1 阶段2 迁出) =====================
// 通道实现(注册/通知/踢出+资源闸)已拆 lib/sse-bus.js 叶子 —— admin 踢出/批准直依赖它,
// admin→gate 环核心边消失。这里 re-export 保 routes/测试钉着的 gate.sseRegister 等形状。
const { sseRegister, sseNotify, sseKick } = require('./sse-bus');

// ===================== 申请页 / 等待页 / 拒绝页 =====================
function gatePageHtml(state) {
  const isReentry = state === 'reentry';
  const inner = isReentry
    ? `
<div class="q">🚪</div>
<div class="wait" style="font-size:16px;line-height:1.9">您曾被请离画廊。<br>如希望再次参观，请提交重新进入申请，<br>经主人批准后即可入内。</div>
<textarea id="msg" placeholder="想对主人说的话(选填)" maxlength="60"></textarea>
<button onclick="apply()">提交重新进入申请</button>
<div class="err" id="err"></div>`
    : state === 'wait'
      ? `
<div class="q">⏳</div>
<div class="wait">申请已提交…</div>
<div class="hint">等待主人批准，此页会自动更新，无需刷新</div>`
      : `
<div class="q">🚫</div>
<div class="wait">很抱歉，您暂时无法参观</div>`;
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>梦幻画廊</title>
<style>
body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1a0a14,#2a1030 50%,#1a0a20);font-family:'Microsoft YaHei',sans-serif}
.card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:40px 32px;text-align:center;max-width:340px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.4)}
h1{color:#ffb6c8;font-size:18px;margin:0;letter-spacing:2px}
.q{color:#fff;font-size:26px;margin:20px 0 22px}
.hint{color:rgba(255,182,200,.55);font-size:14px;margin:-12px 0 18px}
.wait{color:#fff;font-size:18px;margin:10px 0 14px}
textarea{width:100%;height:64px;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font-size:14px;resize:none;outline:none;box-sizing:border-box;font-family:inherit}
textarea:focus{border-color:rgba(255,182,200,.6)}
button{margin-top:14px;width:100%;padding:14px;border:none;border-radius:12px;background:linear-gradient(135deg,#ff6b6b,#feca57);color:#fff;font-size:16px;cursor:pointer}
button:active{transform:scale(.97)}
.err{color:#ff6b6b;font-size:13px;margin-top:12px;min-height:18px}
</style></head>
<body><div class="card" id="card">
<h1>梦 幻 画 廊</h1>
${inner}
</div>
<script>
var STATE=${JSON.stringify(state)};
async function apply(){
  var el=document.getElementById('msg');
  var msg=el?el.value.trim():'';
  var r=await fetch('/api/entry/reapply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({msg:msg})});
  var d=await r.json().catch(function(){return{}});
  if(r.ok&&d.status==='reapply'){location.reload()}
  else if(r.ok&&d.status==='approved'){location.href='/'}
  else{document.getElementById('err').textContent='网络开了个小差,请再点一次'}
}
if(STATE==='wait'){
  async function chk(){
    try{
      var r=await fetch('/api/entry/status');
      var d=await r.json();
      if(d.enter)location.href='/';
      else if(d.status==='kicked'||d.status==='denied'||d.status==='history')location.reload();
    }catch(e){}
  }
  setInterval(chk,6000);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)chk()});
}
</script></body></html>`;
}

function serveGatePage(res, state) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(gatePageHtml(state));
}

// ===================== 昵称设置(产品功能,保留) =====================
// POST /api/entry/rename {name}:进馆后自愿设置/修改昵称
function handleRename(req, res) {
  readBody(req, obj => {
    const name = String(obj.name || '').trim().slice(0, 16);
    if (!name) { sendJson(res, 400, { error: '昵称不能为空' }); return; }
    const id = findVisitorId(req);
    if (!id) { sendJson(res, 404, { error: '还没有访客记录' }); return; }
    const rec = getApplicant(id);
    if (!rec) { sendJson(res, 404, { error: '还没有访客记录' }); return; }
    // 限流:每设备 3 秒一次(2026-08-31 审计 M9:高频改名每次全量落盘)
    if (!gateData.renameRate) gateData.renameRate = {};
    const nowR = Date.now();
    if (nowR - (gateData.renameRate[id] || 0) < 3000) { sendJson(res, 429, { error: '改得太快了,歇口气' }); return; }
    gateData.renameRate[id] = nowR;
    if (Object.keys(gateData.renameRate).length > 3000) capKeys(gateData.renameRate, 2500);
    rec.answer = name;
    saveGateData();
    sendJson(res, 200, { ok: true, name });
  });
}

module.exports = {
  entryGate, autoAdmit, serveGatePage, gatePageHtml,
  sseRegister, sseKick, sseNotify,
  handleCollect, handleReapply, handleEntryStatus, handleRename,
  mintPass, fpHashes, cookieAttrs,
  // 统一封禁裁决(API 守卫与 ws 守卫共用,2026-10-12 外部审计第四轮 Batch1)
  REJECT_STATUSES, isIpBlocked, isProfileBanned, findBannedProfile, banDecision, apiBanGuard, API_BAN_EXEMPT,
};
