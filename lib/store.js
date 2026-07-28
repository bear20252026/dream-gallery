// ===================== 审批门数据(JSON 持久化) =====================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT, GATE_MODE, ONCE_GRACE_MS, DAY_MS } = require('./config');
const { getCookies } = require('./util');

const DATA_FILE = path.join(ROOT, 'gate_data.json');
let gateData = null;
function loadGateData() {
  try {
    gateData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    gateData = null;
  }
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
function saveGateData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(gateData, null, 1));
}
if (GATE_MODE === 'approval') loadGateData();
else loadGateData(); // 答题系统也使用此存储(quizPassed/quizAttempts)

// 手机品牌解析(从 User-Agent)
function parseBrand(ua) {
  ua = ua || '';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/HUAWEI|Huawei/i.test(ua)) return '华为';
  if (/HONOR/i.test(ua)) return '荣耀';
  if (/Redmi|Xiaomi|Miui|MIX |MI \d/i.test(ua)) return '小米';
  if (/OPPO/i.test(ua)) return 'OPPO';
  if (/vivo/i.test(ua)) return 'vivo';
  if (/SM-|SAMSUNG/i.test(ua)) return '三星';
  if (/OnePlus/i.test(ua)) return '一加';
  if (/realme/i.test(ua)) return 'realme';
  if (/Android/i.test(ua)) return '其他安卓';
  if (/Windows/i.test(ua)) return 'Windows电脑';
  if (/Macintosh|Mac OS/i.test(ua)) return 'Mac电脑';
  if (/Linux/i.test(ua)) return 'Linux设备';
  return '未知设备';
}

// 设备指纹(2026-07-25 隧道时代修订):
// 走 Cloudflare Tunnel 后,所有访客源 IP 都是 ::1(隧道回源),IP 失去区分度——
// 身份改为 UA 为主,设备指纹(屏幕/时区/canvas)辅助合并换 App 场景
function deviceKey(req) {
  return crypto.createHash('sha1')
    .update(req.headers['user-agent'] || '')
    .digest('hex').slice(0, 16);
}
// 兼容旧指纹(IP+UA 时代)的计算,用于匹配历史记录
function legacyDeviceKey(req, ip) {
  return crypto.createHash('sha1')
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
function ownerAid(req) {
  const vid = getCookies(req).vid;
  if (vid && gateData.applicants[vid]) return vid;
  const f = findByDevice(req);
  return f ? f.id : null;
}

function signId(id) {
  return crypto.createHmac('sha256', gateData.secret).update(id).digest('hex').slice(0, 24);
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
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
      const a = gateData.applicants[id];
      if (a && a.status === 'approved' && signId(id) === sig && !levelExpired(a)) {
        if (a.level === 'once' && !a.firstAccess) { a.firstAccess = Date.now(); saveGateData(); }
        return { id, a };
      }
    }
  }
  // 设备指纹兜底:同一设备(IP+UA)有未过期批准即放行
  const f = findByDevice(req);
  if (f && f.a.status === 'approved' && !levelExpired(f.a)) {
    if (f.a.level === 'once' && !f.a.firstAccess) { f.a.firstAccess = Date.now(); saveGateData(); }
    return f;
  }
  return null;
}

function recordVisit(req, id, a) {
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
  levelExpired, checkPass, recordVisit,
};
