// request-identity.js — 请求身份原语(2026-11-17 C9 从 store.js 迁出)
// ===================== 为什么独立成叶子 =====================
// store.js 曾身兼 ≥7 职责(持久化+UA解析+CF网段信任+会话+配额+统计)。本模块收走
// **纯请求判定**(不碰 gateData、不碰磁盘):UA 品牌解析 / 真实 IP 与代理头信任 /
// 设备指纹键 / 自动化流量识别。零依赖(仅 node:crypto),任何 lib 都可安全 require,
// 不会与 store 成环。store.js 保留同名 re-export,全部消费方与测试的
// `require('./store').realIP` 等引用形状不变。
const crypto = require('crypto');

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
// (2026-10-07 审查#2 补:Cloudflare 回源用的是**公网**边缘 IP(172.64.0.0/13 等),
// 原先只认私网网段 → 经 CF 的请求永远取不到访客真 IP,按访客限流/封禁全部失效。
// 故把 CF 官方公布段(www.cloudflare.com/ips,多年稳定)加入可信名单 —— 攻击者若绕过
// CF 直连源站,socket 地址不在段内,伪造头依旧无效)
const CF_RANGES = [
  ['173.245.48.0', 20], ['103.21.244.0', 22], ['103.22.200.0', 22], ['103.31.4.0', 22],
  ['141.101.64.0', 18], ['108.162.192.0', 18], ['190.93.240.0', 20], ['188.114.96.0', 20],
  ['197.234.240.0', 22], ['198.41.128.0', 17], ['162.158.0.0', 15], ['104.16.0.0', 13],
  ['104.24.0.0', 14], ['172.64.0.0', 13], ['131.0.72.0', 22],
].map(([base, bits]) => {
  const [a, b, c, d] = base.split('.').map(Number);
  const start = ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
  return [start, start + (2 ** (32 - bits)) - 1];
});
function isCloudflareIp(ip) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return false;
  const o = ip.split('.').map(Number);
  if (o[0] > 255 || o[1] > 255 || o[2] > 255 || o[3] > 255) return false;
  const n = ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
  return CF_RANGES.some(([s, e]) => n >= s && n <= e);
}
/**
 * 这个请求的代理头(cf-connecting-ip / xff / cf-ipcountry)可信吗。
 * 判定与 realIP 内部完全同源(回环/私网反代 + CF 官方公布段),抽出来是因为 lib/geoip 也要
 * 在**写数据之前**确认头部可信 —— 两处各写一份就会有一边漏掉某个网段,而伪造的 cf-ipcountry
 * 会直接变成后台显示的"访客来自哪里"。
 */
function trustedProxy(req) {
  const sock = String((req.socket && req.socket.remoteAddress) || '').replace(/^::ffff:/i, '');
  return !sock || sock === '127.0.0.1' || sock === '::1' || sock.startsWith('127.') ||
    sock.startsWith('10.') || sock.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(sock) ||
    isCloudflareIp(sock);
}
function realIP(req) {
  const sock = String((req.socket && req.socket.remoteAddress) || '').replace(/^::ffff:/i, '');
  if (trustedProxy(req)) {
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

// 设备指纹(2026-07-25 隧道时代修订):
// ⚠️ 只可用于统计与风控信号,禁止用于授权判定(DG-SEC-001:UA 逐字相同的两个陌生访客会被认成同一人)
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

// 自动化流量识别(测试/探针/无头浏览器):不建档不计数
const BOT_UA_RE = /headless|testagent|perm-test|playwright|puppeteer|phantom|electron|python-requests|curl\/|wget\//i;
function isAutomated(req) {
  if (req.headers['x-probe'] === '1') return true;
  const ua = req.headers['user-agent'] || '';
  return !ua || BOT_UA_RE.test(ua);
}

module.exports = {
  parseBrand, decodeSamsung,
  trustedProxy, realIP, isCloudflareIp,
  deviceKey, legacyDeviceKey,
  isAutomated,
};