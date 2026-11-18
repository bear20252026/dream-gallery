// sse-bus.js — 访客 SSE 秒级推送通道(2026-11-17 D1 阶段2 从 gate.js 拆出)
// ===================== 为什么独立成叶子 =====================
// admin.js 踢出/批准要发 sseNotify,此前被迫 require 整个 gate.js(入口守卫+建档+页面HTML),
// 构成 admin→gate 环核心边。本模块只收**推送通道**(注册/通知/踢出+资源闸),
// 依赖 store/util/cors 全低位叶子,admin/upload-publish 直依赖它,环边消失。
// gate.js 保留同名 re-export(routes 与测试钉着 gate.sseRegister/sseNotify 形状)。
const { sendJson } = require('./util');
const { capKeys } = require('./store');
const { deviceKey, realIP } = require('./request-identity');
const { corsOriginFor } = require('./cors'); // 叶子:与真响应/预检共用单一裁决(D1 顶部化,原懒require是惯性)

// ===================== SSE 秒级推送(踢出/批准通知) =====================
// 长连接资源闸(2026-10-10 DG-RT-002):原先无上限、无空闲回收——少量 UA 反复连就能耗尽进程句柄,
// 半开连接还会永久留在 Map 里。超限一律 503 直接拒(不建半开流、不占句柄):
// 浏览器 EventSource 自带退避重连,访客端代码零改动;通知本身另有兜底
// (闸门/申请页每 6 秒轮 /api/entry/status,进馆页面刷新同样会被 entryGate 拦),降级可接受。
const SSE_MAX_PER_IP = 3;
const SSE_MAX_TOTAL = 1000;
const SSE_MAX_KEYS = 2000; // 镜像键表上限(capKeys 兜住伪造 UA 增键)
const SSE_IDLE_MS = 5 * 60 * 1000;
const SSE_HB_MS = 25000;
const sseClients = new Map(); // deviceKey -> Set<res>(键数天然受 SSE_MAX_TOTAL 约束)
const sseKeys = {};           // deviceKey -> 最近活跃时刻,与 sseClients 键同步,交给 capKeys 收口
const sseIpCount = {};        // IP -> 活动连接数
let sseTotal = 0;

// 键被 capKeys 淘汰时关掉其名下连接,免得 Map 与键表长期脱节
function sseCloseKey(key) {
  const set = sseClients.get(key);
  if (!set) return;
  for (const res of [...set]) { try { if (res.destroy) res.destroy(); else res.end(); } catch (e) {} }
}

function sseRegister(req, res) {
  const dk = deviceKey(req);
  const ip = realIP(req) || 'unknown';
  if (sseTotal >= SSE_MAX_TOTAL || (sseIpCount[ip] || 0) >= SSE_MAX_PER_IP) {
    sendJson(res, 503, { error: '推送通道已满,请稍后再试' });
    return;
  }
  // SSE 跨域头不再恒 *(2026-11-11 审计 P3-4):与真响应/预检共用 corsOriginFor 单一裁决,
  // 未命中 allowlist 的跨源请求不设头(浏览器自然拒绝),同源请求不受影响。
  const sseHeaders = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  };
  const sseCors = corsOriginFor(req);
  if (sseCors) {
    sseHeaders['Access-Control-Allow-Origin'] = sseCors.origin;
    if (sseCors.vary) sseHeaders['Vary'] = 'Origin';
  }
  res.writeHead(200, sseHeaders);
  res.write(':ok\n\n');
  if (!sseClients.has(dk)) sseClients.set(dk, new Set());
  sseClients.get(dk).add(res);
  sseKeys[dk] = Date.now();
  sseIpCount[ip] = (sseIpCount[ip] || 0) + 1;
  sseTotal++;
  capKeys(sseKeys, SSE_MAX_KEYS);
  capKeys(sseIpCount, SSE_MAX_KEYS);
  if (sseClients.size > SSE_MAX_KEYS) {
    for (const k of [...sseClients.keys()]) if (!(k in sseKeys)) sseCloseKey(k);
  }
  let hb = null;
  let last = Date.now();
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (hb) clearInterval(hb);
    const set = sseClients.get(dk);
    if (set) {
      set.delete(res);
      if (!set.size) sseClients.delete(dk); // 空 Set 必须真删,否则 Map 键只增不减
    }
    if (sseIpCount[ip]) { sseIpCount[ip]--; if (sseIpCount[ip] <= 0) delete sseIpCount[ip]; }
    sseTotal = Math.max(0, sseTotal - 1);
  };
  // 心跳兼空闲判定:写回调不再回来(半开/卡死)或累计 5 分钟无活跃即收流清理
  hb = setInterval(() => {
    const sock = req.socket;
    if (!sock || sock.destroyed || res.writableEnded || res.destroyed) { cleanup(); return; }
    if (Date.now() - last > SSE_IDLE_MS) { cleanup(); try { if (req.destroy) req.destroy(); } catch (e) {} return; }
    sseKeys[dk] = Date.now();
    try { res.write(':hb\n\n', (err) => { if (err) cleanup(); else last = Date.now(); }); } catch (e) { cleanup(); }
  }, SSE_HB_MS);
  req.on('close', cleanup);
  if (res.on) res.on('error', cleanup);
}
// 事件:kick(立即踢出画廊) / approve(申请已批,可进)
function sseNotify(dks, event) {
  const targets = dks && dks.length ? dks : [...sseClients.keys()];
  for (const dk of targets) {
    const set = sseClients.get(dk);
    if (!set) continue;
    for (const res of [...set]) { try { res.write(`data: ${event}\n\n`); } catch (e) {} }
  }
}
// 兼容旧调用名(paintings.js 刷新墙)
function sseKick(dks) { sseNotify(dks, 'recheck'); }

module.exports = { sseRegister, sseNotify, sseKick };