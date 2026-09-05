// ===================== 审批门数据(JSON 持久化) =====================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT, GATE_MODE, ONCE_GRACE_MS, DAY_MS } = require('./config');
const { getCookies } = require('./util');

// GATE_DATA_FILE 可重定向(测试用,避免触碰真实数据);默认 ROOT/gate_data.json
const DATA_FILE = process.env.GATE_DATA_FILE || path.join(ROOT, 'gate_data.json');
const DATA_FILE_TMP = DATA_FILE + '.tmp';   // JSON 镜像的原子写:先写临时文件,再 rename 覆盖

// SQLite 主持久层(2026-09-01 审计改进项#1):
//  - 整个 gateData 快照以 WAL 事务写入 gate_data.db,原子且崩溃安全,取代纯 JSON 的 .tmp+rename
//  - USE_SQLITE=0 一键回退纯 JSON(回滚开关);better-sqlite3 缺失时自动降级
//  - DB 路径默认由 DATA_FILE 派生(测试临时目录自动隔离);_savedAt 双写标记,
//    加载时取 DB/JSON 中较新的一方——SQLite 写失败重启后不会复活旧快照
const sqlite = require('./sqlite-store');
const SQLITE_ENABLED = process.env.USE_SQLITE !== '0';
const DB_FILE = process.env.SQLITE_PATH || DATA_FILE.replace(/\.json$/i, '.db');
if (SQLITE_ENABLED) { sqlite.initDb(DB_FILE); process.on('exit', () => sqlite.close()); }

let gateData = null;
function loadGateData() {
  let fromDb = null, fromJson = null;
  if (SQLITE_ENABLED) fromDb = sqlite.loadAll();
  try {
    fromJson = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch { /* 无 JSON 或损坏,视为空 */ }
  const dbTs = (fromDb && typeof fromDb === 'object' && fromDb._savedAt) || 0;
  const jsonTs = (fromJson && typeof fromJson === 'object' && fromJson._savedAt) || 0;
  gateData = dbTs >= jsonTs && fromDb ? fromDb : fromJson;
  if (!gateData || typeof gateData !== 'object') {
    gateData = { secret: crypto.randomBytes(24).toString('hex'), applicants: {}, stats: { total: 0, byDay: {} } };
  }
  if (!gateData.secret) gateData.secret = crypto.randomBytes(24).toString('hex');
  if (!gateData.applicants) gateData.applicants = {};
  if (!gateData.stats) gateData.stats = { total: 0, byDay: {} };
  if (!gateData.stats.byDay) gateData.stats.byDay = {};
  if (!gateData.blockedIps) gateData.blockedIps = []; // 拉黑 IP(禁止申请和访问)
  if (!gateData.watchIps) gateData.watchIps = [];     // 重点关注 IP(申请时特殊标识)
  saveGateData();
}
// 保存(2026-09-01 改 SQLite 主持久层):
//  - _savedAt 先记入内存快照,再同时写入 SQLite(WAL 事务,主)与 JSON(镜像,兜底);
//    两者同链串行执行,顺序 SQLite → JSON,任何一边失败另一边仍有完整数据
//  - 加载时按 _savedAt 取较新一方:SQLite 写入持续失败时,重启不会用旧库覆盖新 JSON
//  - 单进程内用 Promise 链串行化:任何调用排队执行,避免交叉写
//  - 多 worker / 多实例:读侧仍是各自内存副本,真正多实例需逐行化改造(后续批次)
let _writeChain = Promise.resolve();
function saveGateData() {
  gateData._savedAt = Date.now();
  _writeChain = _writeChain.then(() => {
    if (SQLITE_ENABLED) sqlite.syncAll(gateData); // 内部已 try/catch,失败不阻断 JSON 镜像
    fs.writeFileSync(DATA_FILE_TMP, JSON.stringify(gateData));
    fs.renameSync(DATA_FILE_TMP, DATA_FILE);
  }).catch(e => { console.error('[store] 保存失败:', e); });
  return _writeChain;
}
loadGateData(); // 审批门与答题系统共用此存储(quizPassed/quizAttempts),启动即加载

// 手机品牌 + 型号解析(从 User-Agent)
// 返回 { brand, model, full } 三个字段
function parseBrand(ua) {
  ua = ua || '';
  if (/iPhone/i.test(ua)) {
    var m = 'iPhone';
    if (/OS (1[6-9]|2\d)_/i.test(ua)) m += ' Pro/Pro Max系列';
    return { brand: 'iPhone', model: m, full: m };
  }
  if (/iPad/i.test(ua)) return { brand: 'iPad', model: 'iPad', full: 'iPad' };

  // 安卓:提取 Build 型号(UA 括号内分号第三段常含机型)
  var buildMatch = ua.match(/;\s*([\w\-+ ]{2,30}?)\s*(?:Build\/[^;)]*)?\s*\)/);
  var model = buildMatch ? buildMatch[1].trim() : '';

  if (/HUAWEI|Huawei/i.test(ua)) {
    var hw = ua.match(/HUAWEI[\w\- ]+\d+/i);
    return { brand: '华为', model: hw ? hw[0] : (model || '华为'), full: '华为 '+(hw?hw[0]:model||'') };
  }
  if (/HONOR/i.test(ua)) return { brand: '荣耀', model: model || '荣耀', full: '荣耀 '+(model||'') };
  if (/Redmi/i.test(ua))         return { brand: '小米', model: 'Redmi', full: 'Redmi '+(model||'') };
  if (/Xiaomi|MIUI|MIX |MI \d/i.test(ua)) {
    var xm = ua.match(/Xiaomi[\w\- ]+\d+/i) || ua.match(/Mi \d{1,2}[A-Za-z]*/i) || ua.match(/MIX [\dA-Z]+/i);
    return { brand: '小米', model: xm ? xm[0] : (model || '小米'), full: xm ? xm[0] : '小米 '+(model||'') };
  }
  if (/OPPO/i.test(ua)) {
    var op = ua.match(/OPPO[\w\- ]+\d+/i);
    return { brand: 'OPPO', model: op ? op[0] : (model || 'OPPO'), full: op ? op[0] : 'OPPO '+(model||'') };
  }
  if (/vivo/i.test(ua)) {
    var vi = ua.match(/vivo[\w\- ]+\d+/i);
    return { brand: 'vivo', model: vi ? vi[0] : (model || 'vivo'), full: vi ? vi[0] : 'vivo '+(model||'') };
  }
  if (/SM-|SAMSUNG/i.test(ua)) {
    var sm = ua.match(/SM-[\w]+\d+[\w]*/i);
    var decoded = sm ? decodeSamsung(sm[0]) : null;
    return { brand: '三星', model: decoded || (sm ? sm[0] : '三星'), full: decoded || (sm ? sm[0] : '三星') };
  }
  if (/OnePlus/i.test(ua)) return { brand: '一加', model: model || '一加', full: '一加 '+(model||'') };
  if (/realme/i.test(ua))  return { brand: 'realme', model: model || 'realme', full: 'realme '+(model||'') };
  if (/Android/i.test(ua)) return { brand: '安卓', model: model || '安卓', full: model || '安卓设备' };
  if (/Windows/i.test(ua)) return { brand: 'Windows', model: 'PC', full: 'Windows PC' };
  if (/Macintosh|Mac OS/i.test(ua)) return { brand: 'Mac', model: 'Mac', full: 'Mac' };
  if (/Linux/i.test(ua)) return { brand: 'Linux', model: 'Linux', full: 'Linux' };
  return { brand: '未知', model: ua.substring(0, 40), full: '未知设备' };
}

// 三星型号解码:SM-S9080 → Galaxy S22 Ultra(国行)
function decodeSamsung(smCode) {
  var map = {
    'SM-S9080':'Galaxy S22 Ultra(国行)','SM-S908E':'Galaxy S22 Ultra(国际)',
    'SM-S9060':'Galaxy S22+','SM-S9010':'Galaxy S22',
    'SM-S9180':'Galaxy S23 Ultra(国行)','SM-S9160':'Galaxy S23+','SM-S9110':'Galaxy S23',
    'SM-S9280':'Galaxy S24 Ultra(国行)','SM-S9260':'Galaxy S24+','SM-S9210':'Galaxy S24',
    'SM-S9380':'Galaxy S25 Ultra(国行)',
    'SM-G9980':'Galaxy S21 Ultra','SM-G9960':'Galaxy S21+','SM-G9910':'Galaxy S21',
    'SM-N9860':'Galaxy Note20 Ultra','SM-N9810':'Galaxy Note20',
    'SM-F9360':'Galaxy Z Fold4','SM-F9460':'Galaxy Z Fold5','SM-F9560':'Galaxy Z Fold6','SM-F9660':'Galaxy Z Fold7',
    'SM-F7310':'Galaxy Z Flip5','SM-F7410':'Galaxy Z Flip6','SM-F7510':'Galaxy Z Flip7',
    'SM-A5360':'Galaxy A53','SM-A5460':'Galaxy A54','SM-A5560':'Galaxy A55','SM-A5660':'Galaxy A56',
    'SM-A3560':'Galaxy A35','SM-A3460':'Galaxy A34',
    'SM-M5560':'Galaxy M55','SM-M3560':'Galaxy M35',
  };
  return map[smCode] || null;
}

// 获取真实客户端 IP(2026-08-31 审计 H9 收紧):
// 代理头(cf-connecting-ip/xff)仅当 TCP 来源是回环/私网(反代/隧道回源)时才可信——
// 公网直连时这些头全部客户端可伪造,一律改用 socket 地址,防伪头绕过拉黑/污染统计
function realIP(req) {
  const sock = String((req.socket && req.socket.remoteAddress) || '').replace(/^::ffff:/i, '');
  const trustedProxy =
    !sock || sock === '127.0.0.1' || sock === '::1' || sock.startsWith('127.') ||
    sock.startsWith('10.') || sock.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(sock);
  if (trustedProxy) {
    const cf = req.headers['cf-connecting-ip'];
    const xff = req.headers['x-forwarded-for'];
    const xri = req.headers['x-real-ip'];
    const raw = cf
      || (xff ? String(xff).split(',')[0].trim() : '')
      || xri
      || '';
    if (raw) return String(raw).replace(/^::ffff:/i, '');
  }
  return sock;
}

// 配额/限流身份键(2026-08-31 审计 H8):dk=sha1(UA) 可轮换伪造,
// 优先用不可猜的 vid Cookie(HttpOnly),无档案时才退回 dk(维持老访客兼容)
// 2026-09-01 会话化:vid 档案存在但会话已过期/吊销 → 视同无效,退回 dk 兜底
function quotaKey(req) {
  const vid = getCookies(req).vid;
  const a = vid ? getApplicant(vid) : null;
  if (a && sessionValid(a)) return vid.slice(0, 24);
  return deviceKey(req);
}

// 键数上限(2026-08-31 审计 H5):限流/配额表防伪造身份无限增键
// 值为时间戳的表删最旧;其余(日配额表,过期即无效)超限随机淘汰
function capKeys(obj, max) {
  const keys = Object.keys(obj);
  if (keys.length <= max) return;
  if (typeof obj[keys[0]] === 'number') {
    keys.sort((a, b) => obj[a] - obj[b]);
    for (const k of keys.slice(0, keys.length - max)) delete obj[k];
  } else {
    for (const k of keys.slice(0, keys.length - max)) delete obj[k];
  }
}

// 访客档案总量上限(H5):超限时按最近访问淘汰,防伪造 UA 无限建档膨胀
function capApplicants(max) {
  max = max || 5000;
  const list = Object.entries(gateData.applicants);
  if (list.length <= max) return;
  list.sort((a, b) => (a[1].lastAccess || 0) - (b[1].lastAccess || 0));
  for (const [id] of list.slice(0, list.length - max)) delete gateData.applicants[id];
}

// 设备指纹(2026-07-25 隧道时代修订):
// 走 Cloudflare Tunnel 后,所有访客源 IP 都是 ::1(隧道回源),IP 失去区分度——
// 身份改为 UA 为主,设备指纹(屏幕/时区/canvas)辅助合并换 App 场景
function deviceKey(req) {
  // 2026-09-06 sha1→sha256(扫描器弱哈希整改);旧档案经 findByDevice 的 UA 精确匹配兜底,身份不断
  return crypto.createHash('sha256')
    .update(req.headers['user-agent'] || '')
    .digest('hex').slice(0, 16);
}
// 兼容旧指纹(IP+UA 时代)的计算,用于匹配历史记录
function legacyDeviceKey(req, ip) {
  return crypto.createHash('sha256')
    .update((ip || '') + '|' + (req.headers['user-agent'] || ''))
    .digest('hex').slice(0, 16);
}
function findByDevice(req) {
  const dk = deviceKey(req);
  const ua = req.headers['user-agent'] || '';
  let best = null, bestId = null;
  for (const [id, a] of Object.entries(gateData.applicants)) {
    if (a.dk === dk || (ua && a.ua === ua)) {
      if (!best || a.applyTime > best.applyTime) { best = a; bestId = id; }
    }
  }
  return best ? { id: bestId, a: best } : null;
}

// 访客身份(2026-07-28 OWASP 审计:A01 上传归属原来只认 sha1(UA)——同型号设备撞车、改 UA 即伪造)。
// vid Cookie 是随机 16 位不可猜测值,只存在本人浏览器:归属匹配优先 vid,设备指纹仅作兜底(兼容旧数据)。
// 2026-09-01 会话化:vid 会话过期/吊销后不再认 vid,退回设备指纹重新识别
function ownerAid(req) {
  const vid = getCookies(req).vid;
  const a = vid ? getApplicant(vid) : null;
  if (a && sessionValid(a)) return vid;
  const f = findByDevice(req);
  return f ? f.id : null;
}

// ===================== 会话机制(2026-09-01,vid Token 不再永久有效) =====================
// 每个档案内嵌 sess = { issuedAt, lastSeen, expiresAt, revoked }:
//  - 30 天空闲过期(滑动续期:有效访问即刷新)
//  - 管理员可吊销单访客会话(revoked,不动踢出状态)
//  - 老档案无 sess 视为有效(迁移期兼容,不批量失效),下次活动时惰性补发
//  - 过期/吊销后 vid 失效 → 身份链落到 dk/UA 兜底重新识别,设备换发新会话,不会被挡在门外
const SESSION_IDLE_MS = 30 * DAY_MS;
const SESSION_TOUCH_THROTTLE_MS = 3600000; // 续期落盘节流:1 小时内重复访问不重复写盘

function ensureSession(a) {
  const now = Date.now();
  if (!a.sess || typeof a.sess !== 'object' || !a.sess.issuedAt) {
    a.sess = { issuedAt: now, lastSeen: now, expiresAt: now + SESSION_IDLE_MS, revoked: false };
  }
  return a.sess;
}

function sessionValid(a) {
  if (!a) return false;
  if (!a.sess) return true; // 老档案迁移兼容
  if (a.sess.revoked) return false;
  return Date.now() <= a.sess.expiresAt;
}

// 有效访问时调用:惰性补发 / 换发(吊销或过期后设备重新识别) / 滑动续期(带落盘节流)
function touchSession(a) {
  if (!a || typeof a !== 'object') return;
  const now = Date.now();
  const s = ensureSession(a);
  if (s.revoked || now > s.expiresAt) {
    a.sess = { issuedAt: now, lastSeen: now, expiresAt: now + SESSION_IDLE_MS, revoked: false };
    saveGateData();
    return;
  }
  if (now - s.lastSeen < SESSION_TOUCH_THROTTLE_MS) return;
  s.lastSeen = now;
  s.expiresAt = now + SESSION_IDLE_MS;
  saveGateData();
}

// 管理员吊销:该 vid 立即失效;本人设备下次访问经 dk/UA 兜底重新识别自动换发
function revokeSession(vid) {
  const a = getApplicant(vid);
  if (!a) return false;
  const now = Date.now();
  a.sess = { issuedAt: (a.sess && a.sess.issuedAt) || now, lastSeen: now, expiresAt: 0, revoked: true };
  saveGateData();
  return true;
}

// 安全读取访客档案(2026-08-31 审计 H3):普通对象上 applicants["__proto__"] 会返回 Object.prototype,
// 攻击者可借此伪造合法身份并污染原型。所有按键读取一律走本函数
function getApplicant(key) {
  if (!key || typeof key !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(gateData.applicants, key) ? gateData.applicants[key] : null;
}

function signId(id) {
  return crypto.createHmac('sha256', gateData.secret).update(id).digest('hex').slice(0, 24);
}
function todayStr() {
  // 使用服务器本地时间(UTC+8),而非 UTC;toISOString() 会偏移 8 小时导致跨天统计不准
  var d=new Date();
  var yyyy=d.getFullYear();
  var mm=String(d.getMonth()+1).padStart(2,'0');
  var dd=String(d.getDate()).padStart(2,'0');
  return yyyy+'-'+mm+'-'+dd;
}

// 批准是否已过期(day 超 24h / once 超宽限)
function levelExpired(a) {
  const now = Date.now();
  if (a.level === 'day' && now > a.approveTime + DAY_MS) return true;
  if (a.level === 'once' && a.firstAccess && now > a.firstAccess + ONCE_GRACE_MS) return true;
  return false;
}

// 通行证校验:Cookie 优先,设备指纹兜底(App内置浏览器常拦截第三方/嵌入式Cookie)
// 返回 {id, a} 或 null
function checkPass(req) {
  const pass = getCookies(req).pass;
  if (pass) {
    const dot = pass.lastIndexOf('.');
    if (dot > 0) {
      const id = pass.slice(0, dot), sig = pass.slice(dot + 1);
      const a = getApplicant(id);
      // 2026-09-01 会话化:通行证还要求会话有效(过期/吊销后落到设备指纹兜底)
      if (a && a.status === 'approved' && sessionValid(a) && signId(id) === sig && !levelExpired(a)) {
        if (a.level === 'once' && !a.firstAccess) { a.firstAccess = Date.now(); saveGateData(); }
        touchSession(a);
        return { id, a };
      }
    }
  }
  // 设备指纹兜底:同一设备(IP+UA)有未过期批准即放行(会话过期/吊销后由此重新识别并自动换发)
  const f = findByDevice(req);
  if (f && f.a.status === 'approved' && !levelExpired(f.a)) {
    if (f.a.level === 'once' && !f.a.firstAccess) { f.a.firstAccess = Date.now(); saveGateData(); }
    touchSession(f.a);
    return f;
  }
  return null;
}

// 自动化流量识别(2026-08-30):测试脚本/探针/无头浏览器不计入访客统计、不建访客档案
// 双保险:① 探针统一带 x-probe 头(最可靠);② UA 特征兜底防第三方工具漏标
const BOT_UA_RE = /headless|testagent|perm-test|playwright|puppeteer|phantom|electron|python-requests|curl\/|wget\//i;
function isAutomated(req) {
  if (req.headers['x-probe'] === '1') return true;
  const ua = req.headers['user-agent'] || '';
  return !ua || BOT_UA_RE.test(ua);
}

function recordVisit(req, id, a) {
  // 自动化访问(测试/探针/无头浏览器)不计入真实访客
  if (isAutomated(req)) return;
  // 仅当“无任何外部代理 IP 头 且 源是回环”才跳过——这是本地开发/直连测试流量;
  // 走 Cloudflare 时真实访客 IP 在 cf-connecting-ip(或 socket 直接是访客 IP)中,一律计数,
  // 即便隧道回源使 socket 变成 ::1 也不误杀。
  var ip=realIP(req);
  var cf=req.headers['cf-connecting-ip'];
  var xff=req.headers['x-forwarded-for'];
  var isLoopback=!ip||ip==='127.0.0.1'||ip==='::1'||ip.startsWith('::ffff:127.')||ip==='localhost';
  if(isLoopback&&!cf&&!xff)return;
  // 去重:同一设备 60 秒内只计一次(防止 F5/自动刷新导致暴增)
  var dk=deviceKey(req);
  var now=Date.now();
  if(!gateData._visitRate)gateData._visitRate={};
  if(gateData._visitRate[dk]&&now-gateData._visitRate[dk]<60000)return;
  gateData._visitRate[dk]=now;
  if (Object.keys(gateData._visitRate).length > 5000) capKeys(gateData._visitRate, 4000);
  gateData.stats.total++;
  const d = todayStr();
  gateData.stats.byDay[d] = (gateData.stats.byDay[d] || 0) + 1;
  if (a) {
    a.visits = (a.visits || 0) + 1;
    a.lastAccess = Date.now();
  }
  // 访问日志(统计页按 日/周/月/年 聚合,保留最近 1000 条)
  if (!gateData.visits) gateData.visits = [];
  gateData.visits.push({ t: Date.now(), id: id || null });
  if (gateData.visits.length > 1000) gateData.visits.splice(0, gateData.visits.length - 1000);
  saveGateData();
}

module.exports = {
  DATA_FILE, gateData, loadGateData, saveGateData,
  parseBrand, deviceKey, legacyDeviceKey, findByDevice, ownerAid, signId, todayStr,
  levelExpired, checkPass, recordVisit, realIP, isAutomated, getApplicant, quotaKey, capKeys, capApplicants,
  SESSION_IDLE_MS, ensureSession, sessionValid, touchSession, revokeSession,
};
