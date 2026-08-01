// ===================== 审批门数据(JSON 持久化) =====================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT, GATE_MODE, ONCE_GRACE_MS, DAY_MS } = require('./config');
const { getCookies } = require('./util');

// GATE_DATA_FILE 可重定向(测试用,避免触碰真实数据);默认 ROOT/gate_data.json
const DATA_FILE = process.env.GATE_DATA_FILE || path.join(ROOT, 'gate_data.json');
const DATA_FILE_TMP = DATA_FILE + '.tmp';   // 原子写:先写临时文件,再 rename 覆盖正式文件
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
// 原子 + 串行化保存:
//  - 先写 .tmp 再 renameSync(同文件系统 rename 原子):进程崩溃/pm2 重启时正式文件不会被截断,
//    最多留下一个无用 .tmp(下次保存会被覆盖),不会损坏正式数据。
//  - 单进程内用 Promise 链串行化:任何调用(含未来异步触发路径)排队执行,避免两个写同时操作 .tmp。
//  - 多 worker / 多实例不适用:各进程内存副本独立,需迁 SQLite(见审查意见 P1)。当前部署为单实例 pm2,安全。
let _writeChain = Promise.resolve();
function saveGateData() {
  _writeChain = _writeChain.then(() => {
    fs.writeFileSync(DATA_FILE_TMP, JSON.stringify(gateData, null, 1));
    fs.renameSync(DATA_FILE_TMP, DATA_FILE);
  }).catch(e => { console.error('[store] 保存 gate_data.json 失败:', e); });
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
    'SM-F9360':'Galaxy Z Fold4','SM-F9460':'Galaxy Z Fold5','SM-F9560':'Galaxy Z Fold6',
    'SM-F7310':'Galaxy Z Flip5','SM-F7410':'Galaxy Z Flip6',
    'SM-F9360':'Galaxy Z Fold4','SM-F9460':'Galaxy Z Fold5','SM-F9560':'Galaxy Z Fold6','SM-F9660':'Galaxy Z Fold7',
    'SM-F7310':'Galaxy Z Flip5','SM-F7410':'Galaxy Z Flip6','SM-F7510':'Galaxy Z Flip7',
    'SM-A5360':'Galaxy A53','SM-A5460':'Galaxy A54','SM-A5560':'Galaxy A55','SM-A5660':'Galaxy A56',
    'SM-A3560':'Galaxy A35','SM-A3460':'Galaxy A34',
    'SM-M5560':'Galaxy M55','SM-M3560':'Galaxy M35',
  };
  return map[smCode] || null;
}

// 获取真实客户端 IP(Cloudflare Tunnel/CDN 回源时,优先用 cf-connecting-ip)
// 规范 IPv4-mapped IPv6(::ffff:1.2.3.4 → 1.2.3.4),便于去重与归属地查询
function realIP(req) {
  const cf = req.headers['cf-connecting-ip'];
  const xff = req.headers['x-forwarded-for'];
  const xri = req.headers['x-real-ip'];
  const raw = cf
    || (xff ? String(xff).split(',')[0].trim() : '')
    || xri
    || (req.socket && req.socket.remoteAddress) || '';
  return String(raw).replace(/^::ffff:/i, '');
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
  levelExpired, checkPass, recordVisit, realIP,
};
