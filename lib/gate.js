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
  checkPass, recordVisit, isAutomated, getApplicant, quotaKey, capApplicants, capKeys,
  sessionValid, touchSession,
} = require('./store');

// ===================== 通用工具 =====================
function mintPass(res, id) {
  return `pass=${id}.${signId(id)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`;
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
    out.push(crypto.createHash('sha1').update(s).digest('hex').slice(0, 16));
  }
  return out;
}

// 按档案字段记录 IP 历史(最多 10 个,最新在前)
function pushIp(a, ip) {
  if (!ip) return;
  const clean = String(ip).replace(/^::ffff:/i, '');
  if (!Array.isArray(a.ips)) a.ips = [];
  if (a.ips[0] === clean) return;
  const i = a.ips.indexOf(clean);
  if (i >= 0) a.ips.splice(i, 1);
  a.ips.unshift(clean);
  if (a.ips.length > 10) a.ips.length = 10;
}

// 身份归并:vid Cookie(要求会话有效,过期/吊销视同无效) → dk(UA) → UA 全文 → 精确匹配新建
// (与 handleCollect 的 localId/指纹归并配合,形成完整识别链)
function findVisitorId(req) {
  const vid = getCookies(req).vid;
  const va = vid ? getApplicant(vid) : null;
  if (va && sessionValid(va)) return vid;
  const dk = deviceKey(req);
  for (const [aid, a] of Object.entries(gateData.applicants)) {
    if (a.dk === dk) return aid;
  }
  const ua = req.headers['user-agent'] || '';
  if (ua) {
    for (const [aid, a] of Object.entries(gateData.applicants)) {
      if (a.ua === ua) return aid;
    }
  }
  return null;
}

// ===================== 入口守卫(无条件启用,替代旧 approvalGate) =====================
// 返回 true = 放行。仅拦截:被踢出设备(落申请页) / 拉黑 IP(反刷,落拒绝页)。
// 其余任何人(陌生设备)静默建档直接放行——"自由进画廊"。
function entryGate(req, res, pathname) {
  // 拉黑 IP 检查必须在 isAutomated 短路之前(2026-08-31 审计 M1:否则删 UA 头即可绕过拉黑)
  if (gateData.blockedIps.includes(realIP(req))) {
    serveGatePage(res, 'denied', '很抱歉，您暂时无法参观');
    return false;
  }
  // 自动化流量(测试/探针):不拦不记,直接过(统计层已单独跳过)
  if (isAutomated(req)) return true;

  const id = findVisitorId(req);
  const a = id ? getApplicant(id) : null;
  if (a) {
    // 被踢出(含旧数据 denied/history)→ 重进申请页
    if (a.status === 'kicked' || a.status === 'denied' || a.status === 'history') {
      serveGatePage(res, 'reentry');
      return false;
    }
    // 已提交重进申请,等待批准
    if (a.status === 'reapply') {
      serveGatePage(res, 'wait');
      return false;
    }
    // approved → 放行并补发通行证(缺失时)
    pushIp(a, realIP(req));
    a.lastAccess = Date.now();
    touchSession(a); // 会话滑动续期/惰性补发/吊销后换发
    if (pathname === '/') recordVisit(req, id, a);
    else saveGateData();
    const cookies = getCookies(req);
    if (!cookies.pass) res.setHeader('Set-Cookie', [
      `vid=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`,
      mintPass(res, id),
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
  for (const [aid, a] of Object.entries(gateData.applicants)) {
    if (a.dk === dk) { id = aid; break; }
  }
  if (!id) id = crypto.randomBytes(8).toString('hex');
  const old = gateData.applicants[id] || {};
  gateData.applicants[id] = {
    answer: old.answer || '访客',
    ua: req.headers['user-agent'] || old.ua || '',
    brand: parseBrand(req.headers['user-agent']),
    ip: realIP(req) || '',
    dk,
    localId: old.localId || '',
    fpSet: old.fpSet || {},
    applyTime: old.applyTime || Date.now(),
    lastAccess: Date.now(),
    visits: old.visits || 0,
    note: old.note || '',
    // 旧档案若曾被踢出,重建设备档案不洗白踢出状态(踢出以指纹/ID 识别,不依赖单一档案)
    kickedTime: old.kickedTime,
    kickReason: old.kickReason,
    status: old.kickedTime ? 'kicked' : 'approved',
  };
  pushIp(gateData.applicants[id], realIP(req));
  touchSession(gateData.applicants[id]); // 新档案即建会话
  if (pathname === '/') recordVisit(req, id, gateData.applicants[id]);
  else saveGateData();
  res.setHeader('Set-Cookie', [
    `vid=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`,
    mintPass(res, id),
  ]);
  return true;
}

// ===================== 指纹采集归并 + 强信号踢出命中 =====================
// POST /api/entry/collect {lid, fp:{scr,avail,tz,...,canvas,webgl,audio}}
// ① 持久 ID(localId)或任一指纹命中"已踢出"档案 → 当前访问直接判为被踢设备,
//    当前档案并入踢出状态(防"清 Cookie 建新档"绕过),响应 deny 前端跳申请页;
// ② 否则写入当前档案的 localId/fpSet/ips,完善后续识别。
function handleCollect(req, res) {
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
    gateData.applicants[myId] = Object.assign(
      {
        answer: '访客', ua: req.headers['user-agent'] || '', brand: parseBrand(req.headers['user-agent']),
        ip: realIP(req) || '', dk: deviceKey(req), applyTime: Date.now(), lastAccess: Date.now(),
        status: 'approved', visits: 0, note: '', localId: '', fpSet: {}, ips: [],
      },
      me
    );
    touchSession(gateData.applicants[myId]); // 指纹归并后同步会话状态
    saveGateData();
    const set = `vid=${myId}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`;
    if (!getCookies(req).vid) res.setHeader('Set-Cookie', set);
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
    res.setHeader('Set-Cookie', `vid=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`);
    sendJson(res, 200, { ok: true, status: 'reapply' });
  });
}

// GET /api/entry/status:申请页轮询;批准后 enter=true
function handleEntryStatus(req, res) {
  const id = findVisitorId(req);
  const a = id ? getApplicant(id) : null;
  if (a && a.status === 'approved') {
    touchSession(a);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': [`vid=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`, mintPass(res, id)],
    });
    res.end(JSON.stringify({ status: 'approved', enter: true }));
    return;
  }
  sendJson(res, 200, { status: a ? a.status : 'none', enter: false });
}

// ===================== SSE 秒级推送(踢出/批准通知) =====================
const sseClients = new Map(); // deviceKey -> Set<res>
function sseRegister(req, res) {
  const dk = deviceKey(req);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write(':ok\n\n');
  if (!sseClients.has(dk)) sseClients.set(dk, new Set());
  sseClients.get(dk).add(res);
  const hb = setInterval(() => { try { res.write(':hb\n\n'); } catch (e) {} }, 25000);
  req.on('close', () => { clearInterval(hb); const set = sseClients.get(dk); if (set) set.delete(res); });
}
// 事件:kick(立即踢出画廊) / approve(申请已批,可进)
function sseNotify(dks, event) {
  const targets = dks && dks.length ? dks : [...sseClients.keys()];
  for (const dk of targets) {
    const set = sseClients.get(dk);
    if (!set) continue;
    for (const res of set) { try { res.write(`data: ${event}\n\n`); } catch (e) {} }
  }
}
// 兼容旧调用名(paintings.js 刷新墙)
function sseKick(dks) { sseNotify(dks, 'recheck'); }

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
  mintPass, fpHashes,
};
