// geoip.js — 访客「来自哪里」:只用 Cloudflare 已经算好的国家码,**零出网**(2026-10-14 第五轮审计 F)
// ===================== 为什么换掉 ip-api =====================
// 原先 lib/admin.js 打 `https://ip-api.com/json/<访客IP>?...`。实测(2026-10-14):
//   HTTPS ⇒ 403 + {"status":"fail","message":"SSL unavailable for this endpoint, order a key at …"}
//   HTTP  ⇒ 200 + 正常结果
// 免费层**只有 HTTP**,而 fetch() 遇到 403 不抛错、返回体又是合法 JSON ⇒ 老代码走
// `d.status === 'success'` 的 else 分支静默写「未知」,**连 .catch 都进不去**;再加上
// `if (ip in gateData.geo) return` 的永久占位,结果是后台归属地**全线、永久**显示「未知」,
// 而这条链路一直在把访客 IP 发给第三方(privacy.html 里为此写过披露)。
//
// ===================== 现在的做法与取舍 =====================
// 全站公网流量本来就在 Cloudflare 后面(store.realIP 认 CF 公布段是同一条判断链),边缘节点
// 早把访客国家算在 `cf-ipcountry` 里 ⇒ 读这个头 = 零外呼、零新依赖、**访客 IP 不再出栈**。
// 代价:粒度从「省市 + ISP」降到「国家/地区」。想保住省市级只能在源站放本地 GeoIP 库
// (.mmdb 既不进 git 也不在后端部署清单里 ⇒ 会多出一块必须手工同步的部署盲区),另案再定。
//
// ⚠️ 三条不许回退的纪律:
//   ① 头部只在 `store.trustedProxy(req)` 成立时才可信 —— 直连/伪造头一律不采信;
//   ② 拿不到国家码时**不写任何占位**(留空 ⇒ 这个人下次从 CF 进来还能补上)。老代码就是拿
//      「未知」当占位把失败永久钉死的;
//   ③ 失败原因要分计数(no-proxy / no-header / local),否则"读数为什么空"又变成一次新的考古。
const { gateData, saveGateData, realIP, trustedProxy, capKeys } = require('./store');

// gateData.geo 条目上限(沿用旧实现同一数量级):超了按插入顺序淘汰最旧,防无界增长与历史 IP 长留。
// 保留期另有 lib/retention.js 的 geo 90 天一道闸,这里管的是"规模",两者不互相替代。
const GEO_MAX = 2000;

// 常见国家/地区 → 中文显示名。表里没有的码原样显示两位码(显示 XX 之外的真码也比「未知」有用)
const COUNTRY_ZH = {
  CN: '中国', HK: '中国香港', MO: '中国澳门', TW: '中国台湾',
  JP: '日本', KR: '韩国', KP: '朝鲜', MN: '蒙古', VN: '越南', TH: '泰国', KH: '柬埔寨',
  MM: '缅甸', LA: '老挝', MY: '马来西亚', SG: '新加坡', ID: '印度尼西亚', PH: '菲律宾',
  BN: '文莱', TL: '东帝汶', NP: '尼泊尔', BT: '不丹', LK: '斯里兰卡', BD: '孟加拉国',
  PK: '巴基斯坦', IN: '印度', MV: '马尔代夫', KZ: '哈萨克斯坦', UZ: '乌兹别克斯坦',
  KG: '吉尔吉斯斯坦', TJ: '塔吉克斯坦', TM: '土库曼斯坦', GE: '格鲁吉亚', AM: '亚美尼亚',
  AZ: '阿塞拜疆', IL: '以色列', IQ: '伊拉克', IR: '伊朗', SA: '沙特阿拉伯', AE: '阿联酋',
  TR: '土耳其', JO: '约旦', LB: '黎巴嫩', SY: '叙利亚', YE: '也门', OM: '阿曼', QA: '卡塔尔',
  KW: '科威特', BH: '巴林', CY: '塞浦路斯',
  RU: '俄罗斯', UA: '乌克兰', BY: '白俄罗斯', PL: '波兰', DE: '德国', FR: '法国',
  GB: '英国', IT: '意大利', ES: '西班牙', PT: '葡萄牙', NL: '荷兰', BE: '比利时',
  CH: '瑞士', AT: '奥地利', SE: '瑞典', NO: '挪威', FI: '芬兰', DK: '丹麦', IS: '冰岛',
  IE: '爱尔兰', CZ: '捷克', SK: '斯洛伐克', HU: '匈牙利', RO: '罗马尼亚', BG: '保加利亚',
  HR: '克罗地亚', SI: '斯洛文尼亚', RS: '塞尔维亚', BA: '波黑', ME: '黑山', MK: '北马其顿',
  AL: '阿尔巴尼亚', GR: '希腊', MT: '马耳他', LU: '卢森堡', MD: '摩尔多瓦',
  US: '美国', CA: '加拿大', MX: '墨西哥', CU: '古巴', DO: '多米尼加', GT: '危地马拉',
  HN: '洪都拉斯', NI: '尼加拉瓜', CR: '哥斯达黎加', PA: '巴拿马', CO: '哥伦比亚',
  VE: '委内瑞拉', EC: '厄瓜多尔', PE: '秘鲁', BO: '玻利维亚', BR: '巴西', CL: '智利',
  AR: '阿根廷', PY: '巴拉圭', UY: '乌拉圭',
  AU: '澳大利亚', NZ: '新西兰', FJ: '斐济',
  EG: '埃及', ZA: '南非', NG: '尼日利亚', KE: '肯尼亚', ET: '埃塞俄比亚', MA: '摩洛哥',
  DZ: '阿尔及利亚', TN: '突尼斯', GH: '加纳', TZ: '坦桑尼亚', UG: '乌干达', AO: '安哥拉',
  CM: '喀麦隆', SN: '塞内加尔', ZW: '津巴布韦', ZM: '赞比亚', MZ: '莫桑比克',
};

// CF 的 XX = 取不到国家、T1 = Tor 出口;这两种都不当成"归属地"
const NOT_A_COUNTRY = new Set(['XX', 'T1']);

const stats = { header: 0, noHeader: 0, noProxy: 0, local: 0, overwritten: 0 };

/** 从请求里取可信的国家码(两位大写);不可信或没有就返回 null */
function countryCode(req) {
  if (!trustedProxy(req)) return null;
  const raw = req.headers['cf-ipcountry'];
  if (!raw) return null;
  const code = String(raw).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || NOT_A_COUNTRY.has(code)) return null;
  return code;
}

function labelOf(ip) {
  if (!ip || !gateData.geo) return '';
  const g = gateData.geo[String(ip).replace(/^::ffff:/i, '')];
  return typeof g === 'string' ? g : '';
}

/**
 * 记一次访客国家(在拿到 req 的地方调用,不做任何网络请求)。
 * @returns {'header'|'no-header'|'no-proxy'|'local'|'skip'} 便于计数与排查
 */
function note(req) {
  if (!req) return 'skip';
  if (!trustedProxy(req)) { stats.noProxy++; return 'no-proxy'; }
  const ip = realIP(req);
  if (!ip || ip === '127.0.0.1' || ip === '::1' || /^(10\.|192\.168\.|127\.)/.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) {
    stats.local++;
    return 'local'; // 本机/回环(单测、探针、运维直连)不写表:写了就是把测试地址当真访客
  }
  const code = countryCode(req);
  if (!code) { stats.noHeader++; return 'no-header'; } // **不写占位**:下次从 CF 进来还能补
  if (!gateData.geo) gateData.geo = {};
  const clean = String(ip).replace(/^::ffff:/i, '');
  const label = (COUNTRY_ZH[code] || code) + ' · 按国家码';
  if (gateData.geo[clean] !== undefined) stats.overwritten++;
  if (gateData.geo[clean] === label) return 'header'; // 值没变就不落盘(全量快照写盘很贵)
  gateData.geo[clean] = label;
  capKeys(gateData.geo, GEO_MAX);
  saveGateData();
  stats.header++;
  return 'header';
}

function geoStats() {
  return {
    ...stats,
    entries: gateData.geo ? Object.keys(gateData.geo).length : 0,
    source: 'cloudflare-cf-ipcountry',
    outbound: false, // 断言用的显式事实:本模块绝不出网
  };
}

function resetGeoStats() {
  stats.header = 0; stats.noHeader = 0; stats.noProxy = 0; stats.local = 0; stats.overwritten = 0;
}

module.exports = { COUNTRY_ZH, GEO_MAX, countryCode, labelOf, note, geoStats, resetGeoStats };
