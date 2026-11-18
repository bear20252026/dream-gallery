// domain/identity.js — 身份处置域门面(2026-11-17 D2 试点:gateData 按域拆第一刀)
// ===================== 它收编什么 =====================
// 身份域窄片:**踢出/批准/备注的档案处置 + kickLog 踢出历史 + blockedIps 拉黑名单**。
// 此前三块散在 admin.js(handler 内联写档案字段+日志裁剪+落盘)与 gate.js(拉黑判定),
// 消费方直接摸 gateData.kickLog/blockedIps 深层属性。本门面把**写动作与读口径**收进来:
//   - 写函数内部落盘(saveGateData),消费方不再各自记得 save;
//   - 读函数给后台列表/封禁裁决统一口径。
// ===================== 边界(诚实标注) =====================
// applicants 档案本体(8 文件 25+ 处直写,含整档覆写)**本期不收**——跨域引用最密,留待后续。
// adminSessions 会话表属鉴权判定,已随 D1 住 lib/authz.js,不在本域。
// 存储机制(kv 快照+JSON 镜像+写队列)不动:本门面只是接口收窄,不是存储重构。
// ===================== 依赖纪律 =====================
// 只 require store/sse-bus/request-identity(全低位)。**绝不 require admin/gate**——
// 那会把域门面拖回 handler 环;也绝不在 store 里反向 require 本模块(store→retention 教训)。
// gateData 经 store.gateData **每次现取**,不缓存子对象:loadGateData 会整体换对象,
// 测试也会 gateData.xxx={} 整体重置,缓存引用必炸。
const store = require('../store');
const { saveGateData, issueSession } = store;
const { sseNotify } = require('../sse-bus');
const { realIP, deviceKey } = require('../request-identity');

const gd = () => store.gateData;

// ===================== 跨域昵称读口径(2026-11-17 D2) =====================
// chat/wishes 此前各写一份逐字同构的 nickOf(扫 applicants 取雅号)——重复实现+跨域直读档案。
// 收编进身份域单一口径:按设备键查档案雅号,未起名回退「无名藏梦人」。只读,不建档不落盘。
function nickOf(req) {
  const dk = deviceKey(req);
  for (const a of Object.values(gd().applicants || {})) {
    if (a.dk === dk && a.answer) return String(a.answer).slice(0, 16);
  }
  return '无名藏梦人';
}

// ===================== 档案处置(写动作内含落盘+秒级通知) =====================
/** 踢出:改档案状态 + 记踢出历史(独立于档案,档案被重建也不丢) + 落盘 + 秒级通知该设备 */
function kick(a, id, reason) {
  a.status = 'kicked';
  a.kickedTime = Date.now();
  a.kickReason = String(reason || '').slice(0, 60);
  const g = gd();
  if (!g.kickLog) g.kickLog = [];
  g.kickLog.push({
    t: Date.now(), id, name: a.answer || '访客',
    ip: a.ip || '', dk: a.dk || '', reason: a.kickReason,
  });
  if (g.kickLog.length > 200) g.kickLog.splice(0, g.kickLog.length - 200);
  saveGateData();
  sseNotify(a.dk ? [a.dk] : [], 'kick'); // 收到即弹回申请页
}

/** 批准重进/恢复放行:会话唯一正常重发入口(issueSession 内含落盘,状态一并落) */
function approve(a) {
  a.status = 'approved';
  a.approveTime = Date.now();
  delete a.matchHint;
  // 新会话盖上当前 authVersion(吊销过的档案由此才恢复有效)
  issueSession(a);
  sseNotify(a.dk ? [a.dk] : [], 'approved');
}

/** 备注改名 */
function note(a, text) {
  a.note = String(text || '').slice(0, 50);
  saveGateData();
}

// ===================== IP 拉黑(反刷预警自动使用 + 后台运维) =====================
function blockIp(ip) {
  const g = gd();
  const set = new Set(g.blockedIps);
  set.add(ip);
  g.blockedIps = [...set];
  saveGateData();
}
function unblockIp(ip) {
  const g = gd();
  const set = new Set(g.blockedIps);
  set.delete(ip);
  g.blockedIps = [...set];
  saveGateData();
}
/** 封禁裁决的 IP 信号(gate.banDecision 与 ws 守卫共用口径) */
function isIpBlocked(req) {
  const g = gd();
  return Array.isArray(g.blockedIps) && g.blockedIps.includes(realIP(req));
}

// ===================== 后台列表读口径 =====================
function blockedList() {
  return gd().blockedIps;
}
/** 最近 n 条踢出历史(新→旧) */
function kickLogTail(n) {
  return (gd().kickLog || []).slice(-(n || 100)).reverse();
}

// ===================== 档案字段写口径(2026-11-18 F2,D2 第二刀) =====================
// gate/abuse/track 的档案字段散写收编进本门面。**只收字段级写动作**;
// 整档覆写(建档/归并 Object.assign)是身份建立语义,留 gate.js(诚实标注,不强收)。
// 落盘纪律:写函数**不自带 save**的注明 noSave——调用方在自己的事务收口统一落盘
// (abuse 预警+打标同一次 save;collect 归并多动作同一次 save),避免一请求多次整库写。

/** 反刷预警:按设备键给所有匹配档案打可疑标记(noSave,调用方与预警记录同批落盘) */
function markSuspicious(dk, reason) {
  let hit = null;
  for (const a of Object.values(gd().applicants || {})) {
    if (a.dk === dk) {
      a.suspicious = true;
      a.suspiciousReason = reason;
      hit = a;
    }
  }
  return hit; // 调用方取昵称/品牌/IP 用(原内联循环的副产物)
}
/** 摘可疑标记:按设备键(noSave) */
function clearSuspicious(dk) {
  for (const a of Object.values(gd().applicants || {})) {
    if (a.dk === dk) { a.suspicious = false; a.suspiciousReason = ''; }
  }
}
/** 摘全部可疑标记(后台清空预警,noSave) */
function clearAllSuspicious() {
  for (const a of Object.values(gd().applicants || {})) {
    a.suspicious = false; a.suspiciousReason = '';
  }
}
/** 强信号命中:把当前档案标记为踢出并合并线索(noSave,collect 收口统一落盘) */
function markKickedByMerge(me, src, hint) {
  me.status = 'kicked';
  me.kickedTime = src.kickedTime || Date.now();
  me.kickReason = src.kickReason || '';
  me.matchHint = hint;
  me.kickedFrom = src.id;
}
/** 重进申请(noSave:调用方还要 touchSession+Set-Cookie 后统一落盘) */
function applyReentry(a, msg) {
  a.status = 'reapply';
  a.reapplyTime = Date.now();
  a.reapplyMsg = String(msg || '').slice(0, 60);
}
/** 补采指纹(档案没有 fph 才写;自带 save——身份数据必须同步落盘,与原 track 行为一致) */
function attachFingerprint(a, fph, fp) {
  if (!a || a.fph) return false;
  a.fph = fph;
  a.fp = fp;
  saveGateData();
  return true;
}
/** 访问计数+最近访问刷新(noSave:recordVisit 的落盘由 shadow.visit 判定收口) */
function touchVisit(a) {
  if (!a) return;
  a.visits = (a.visits || 0) + 1;
  a.lastAccess = Date.now();
}

module.exports = {
  kick, approve, note,
  blockIp, unblockIp, isIpBlocked,
  blockedList, kickLogTail,
  nickOf,
  markSuspicious, clearSuspicious, clearAllSuspicious,
  markKickedByMerge, applyReentry, attachFingerprint, touchVisit,
};