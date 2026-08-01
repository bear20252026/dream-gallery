// 门禁:访客问答/等待页 + SSE 踢出推送 + 审批门访客接口 + 非 API 入口检查 + 旧问答门
const crypto = require('crypto');
const { GATE_ANSWER, GATE_QUESTION, GATE_HINT, GATE_MODE } = require('./config');
const { sendJson, readBody, getCookies } = require('./util');
const {
  gateData, saveGateData,
  parseBrand, deviceKey, findByDevice, signId, realIP,
  levelExpired, checkPass, recordVisit,
} = require('./store');

// ===================== 访客问答/等待页 =====================
function gatePageHtml(state, note) {
  const esc = s => String(s).replace(/</g, '&lt;');
  let inner = '';
  if (state === 'apply') {
    if (GATE_MODE === 'approval') {
      // 审批门(现行):开启邀请函即放行,无输入环节,昵称进馆后自愿设置
      inner = `
<div class="q">💌</div>
<div class="wait" style="font-size:16px;line-height:1.9">尊敬的用户:<br>您的邀请函已送达,点开即可进入。<br>祝您观展愉快。</div>
${note ? `<div class="note">${esc(note)}</div>` : ''}
<button onclick="apply()">开启邀请函</button>
<div class="err" id="err"></div>
<div class="hint" style="margin-top:18px">本游戏为3D交互作品,寻找属于你的彩蛋</div>`;
    } else {
      // 旧问答门(保留):需要输入暗号
      inner = `
<div class="q">${esc(GATE_QUESTION)}</div>
${GATE_HINT ? `<div class="hint">提示：${esc(GATE_HINT)}</div>` : ''}
${note ? `<div class="note">${esc(note)}</div>` : ''}
<input id="ans" placeholder="请输入暗号" autocomplete="off" autofocus>
<button onclick="apply()">领取邀请函</button>
<div class="err" id="err"></div>
<div class="hint" style="margin-top:18px">本游戏为3D交互作品,寻找属于你的彩蛋</div>`;
    }
  } else if (state === 'wait') {
    inner = `
<div class="q">⏳</div>
<div class="wait">已提交申请...</div>
<div class="hint">邀请函接收中,无需刷新</div>`;
  } else { // denied
    inner = `
<div class="q">🚫</div>
<div class="wait">${esc(note || '访问未获批准')}</div>
<button onclick="location.reload()">重新申请</button>`;
  }
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
.note{color:#feca57;font-size:13px;margin:-8px 0 16px}
.wait{color:#fff;font-size:18px;margin:10px 0 14px}
input{width:100%;padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font-size:16px;text-align:center;outline:none;box-sizing:border-box}
input:focus{border-color:rgba(255,182,200,.6)}
button{margin-top:14px;width:100%;padding:14px;border:none;border-radius:12px;background:linear-gradient(135deg,#ff6b6b,#feca57);color:#fff;font-size:16px;cursor:pointer}
button:active{transform:scale(.97)}
.err{color:#ff6b6b;font-size:13px;margin-top:12px;min-height:18px}
@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
.shake{animation:shake .3s}
</style></head>
<body><div class="card" id="card">
<h1>梦 幻 画 廊</h1>
${inner}
</div>
<script>
var STATE=${JSON.stringify(state)};
var APPLY_URL=${JSON.stringify(GATE_MODE === 'approval' ? '/api/gate/apply' : '/api/gate')};
async function apply(){
  // 审批门:开启即放行;旧问答门:读输入框暗号
  var inpV=document.getElementById('ans');
  var ans=inpV?inpV.value.trim():'';
  if(inpV&&!ans)return;
  var dev={};
  try{if(navigator.getBattery){var b=await navigator.getBattery();dev.battery=Math.round(b.level*100)+'%';}}catch(e){}
  try{var c=navigator.connection||navigator.webkitConnection;if(c){dev.network=c.type||c.effectiveType||'';}}catch(e){}
  // 设备指纹(稳定信号:换 App/浏览器跳转也能认出同一个人,如千问转接)
  var fp={};
  try{
    fp.scr=screen.width+'x'+screen.height+'x'+(window.devicePixelRatio||1);
    fp.avail=screen.availWidth+'x'+screen.availHeight;
    fp.tz=new Date().getTimezoneOffset();
    fp.lang=navigator.language||'';
    fp.langs=(navigator.languages||[]).join(',');
    fp.platform=navigator.platform||'';
    fp.cores=navigator.hardwareConcurrency||0;
    fp.mem=navigator.deviceMemory||0;
    fp.touch='ontouchstart'in window;
    fp.maxTouch=navigator.maxTouchPoints||0;
    // canvas 指纹:同一设备同一 GPU 渲染结果几乎不变
    var cv=document.createElement('canvas');cv.width=200;cv.height=30;
    var cx=cv.getContext('2d');
    cx.textBaseline='top';cx.font='14px Arial';cx.fillStyle='#f60';cx.fillRect(0,0,100,30);
    cx.fillStyle='#069';cx.fillText('梦幻画廊·fp',2,4);
    cx.strokeStyle='rgba(120,60,200,0.7)';cx.arc(150,15,10,0,Math.PI*2);cx.stroke();
    var durl=cv.toDataURL(),h=0;
    for(var i=0;i<durl.length;i++){h=((h<<5)-h+durl.charCodeAt(i))|0;}
    fp.canvas=(h>>>0).toString(16);
  }catch(e){}
  var r=await fetch(APPLY_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({answer:ans,dev:dev,fp:fp})});
  if(r.ok){location.reload()}
  else{document.getElementById('err').textContent=APPLY_URL==='/api/gate'?'答错了，再想想':'网络开了个小差,请再点一次';var c=document.getElementById('card');c.classList.remove('shake');void c.offsetWidth;c.classList.add('shake')}
}
var inp=document.getElementById('ans');
if(inp)inp.addEventListener('keydown',function(e){if(e.key==='Enter')apply()});
if(STATE==='wait'){
  async function chk(){
    try{
      var r=await fetch('/api/gate/status');
      var d=await r.json();
      if(d.enter)location.reload();
      else if(d.status==='denied'||d.status==='history')location.reload();
    }catch(e){}
  }
  setInterval(chk,8000);
  // 切回页面时立刻检查(后台标签页的定时器会被浏览器节流)
  document.addEventListener('visibilitychange',function(){if(!document.hidden)chk()});
}
</script></body></html>`;
}

function serveGatePage(res, state, note) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(gatePageHtml(state, note));
}

// ===================== SSE 秒级踢出推送 =====================
// 访客页面持有 /api/gate/watch 长连接;审批变更时服务端主动推送 recheck
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
// dks 为空数组 = 通知全部在线设备
function sseKick(dks) {
  const targets = dks && dks.length ? dks : [...sseClients.keys()];
  for (const dk of targets) {
    const set = sseClients.get(dk);
    if (!set) continue;
    for (const res of set) { try { res.write('data: recheck\n\n'); } catch (e) {} }
  }
}

// ===================== 访客放行:开启邀请函即通行 =====================
// 规则(2026-07-25 主人定):任何人直接放行,无需后台同意;昵称进馆后自愿设置;
// 身份 = IP+UA 为主,设备指纹(屏幕/时区/语言/平台/canvas)为辅——
// 换 App 跳转(如千问转接)UA 变了也能认出同一个人并归并记录
function fpHash(req, fp) {
  if (!fp || typeof fp !== 'object') return '';
  const stable = [fp.scr, fp.avail, fp.tz, fp.lang, fp.langs, fp.platform, fp.cores, fp.mem, fp.touch, fp.maxTouch, fp.canvas].join('|');
  if (stable.replace(/[|0xfalse,]/g, '') === '') return '';
  return crypto.createHash('sha1').update((realIP(req) || '') + '|' + stable).digest('hex').slice(0, 16);
}

function handleApply(req, res) {
  readBody(req, obj => {
    if (gateData.blockedIps.includes(realIP(req))) { sendJson(res, 403, { error: '很抱歉,您暂时无法参观' }); return; }
    const cookies = getCookies(req);
    const dk = deviceKey(req);
    const ua = req.headers['user-agent'] || '';
    const fph = fpHash(req, obj.fp);
    // 归并优先级:同 UA 指纹 → 同 UA(兼容 IP+UA 时代旧记录)→ 设备指纹 → vid Cookie → 新访客
    let id = null;
    for (const [aid, a] of Object.entries(gateData.applicants)) {
      if (a.dk === dk) { id = aid; break; }
    }
    if (!id && ua) {
      for (const [aid, a] of Object.entries(gateData.applicants)) {
        if (a.ua === ua) { id = aid; break; }
      }
    }
    if (!id && fph) {
      for (const [aid, a] of Object.entries(gateData.applicants)) {
        if (a.fph === fph) { id = aid; break; }
      }
    }
    if (!id && cookies.vid && gateData.applicants[cookies.vid]) id = cookies.vid;
    if (!id) id = crypto.randomBytes(8).toString('hex');
    const old = gateData.applicants[id] || {};
    gateData.applicants[id] = {
      // 显式带名则以新名为准(归并换名);未带名保留旧名,默认「访客」
      answer: String(obj.answer || '').trim().slice(0, 16) || old.answer || '访客',
      ua: req.headers['user-agent'] || old.ua || '',
      brand: parseBrand(req.headers['user-agent']),
      ip: realIP(req) || '',
      dk,
      fph: fph || old.fph || '',
      fp: obj.fp && typeof obj.fp === 'object' ? obj.fp : (old.fp || {}),
      dev: obj.dev && typeof obj.dev === 'object' ? { battery: obj.dev.battery || '', network: obj.dev.network || '' } : (old.dev || {}),
      applyTime: old.applyTime || Date.now(),
      lastAccess: Date.now(),
      status: 'approved',
      level: 'perm',
      approveTime: old.approveTime || Date.now(),
      visits: old.visits || 0,
    };
    saveGateData();
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': [`vid=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`, mintPass(res, id)],
    });
    res.end(JSON.stringify({ ok: true, status: 'approved', enter: true }));
  });
}

// 签发通行证 Cookie
function mintPass(res, id) {
  return `pass=${id}.${signId(id)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`;
}

// POST /api/gate/rename {name}:进馆后自愿设置/修改昵称
// 双渠道:入馆 5 秒弹窗(文案「执棋入局,应先正其名。还请赐下雅号,以载此卷丹青。」)+ ⚙设置页
// 身份按 IP+UA 为主、vid Cookie 兜底;写回申请人记录的 answer 字段
function handleRename(req, res) {
  readBody(req, obj => {
    const name = String(obj.name || '').trim().slice(0, 16);
    if (!name) { sendJson(res, 400, { error: '昵称不能为空' }); return; }
    const cookies = getCookies(req);
    const dk = deviceKey(req);
    let id = null;
    for (const [aid, a] of Object.entries(gateData.applicants)) {
      if (a.dk === dk) { id = aid; break; }
    }
    if (!id && cookies.vid && gateData.applicants[cookies.vid]) id = cookies.vid;
    if (!id) { sendJson(res, 404, { error: '还没有访客记录,请先开启邀请函' }); return; }
    gateData.applicants[id].answer = name;
    saveGateData();
    sendJson(res, 200, { ok: true, name });
  });
}

function handleGateStatus(req, res) {
  const cookies = getCookies(req);
  // 已可进入(Cookie 或设备兜底):有 vid 但还没通行证时顺手补发
  if (checkPass(req)) {
    if (!cookies.pass && cookies.vid) {
      const va = gateData.applicants[cookies.vid];
      if (va && va.status === 'approved') {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Set-Cookie': mintPass(res, cookies.vid),
        });
        res.end(JSON.stringify({ status: 'approved', enter: true, level: va.level }));
        return;
      }
    }
    sendJson(res, 200, { status: 'approved', enter: true });
    return;
  }
  const id = cookies.vid;
  // vid Cookie 查不到时走设备指纹兜底(App内置浏览器 Cookie 被拦截时也能识别)
  const rec = id && gateData.applicants[id] ? { id, a: gateData.applicants[id] } : findByDevice(req);
  const a = rec && rec.a;
  if (!a) { sendJson(res, 200, { status: 'none', enter: false }); return; }
  // 已批准但还没领通行证 → 此刻补发(等待页轮询到批准后自动进入)
  if (a.status === 'approved' && !levelExpired(a)) {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': mintPass(res, rec.id),
    });
    res.end(JSON.stringify({ status: 'approved', enter: true, level: a.level }));
    return;
  }
  sendJson(res, 200, { status: a.status, enter: false, level: a.level });
}

// 审批门:非 API 请求的统一入口检查。返回 true 表示已放行
// 规则(2026-07-25 主人定):没有邀请函页,任何人直接进——
// 陌生设备首次访问即静默建档放行(IP+UA 建档;指纹由页面后台补采到 /api/gate/apply)
// 仅拉黑 IP 仍拦截
function autoAdmit(req, res, pathname) {
  const dk = deviceKey(req);
  let id = null;
  for (const [aid, a] of Object.entries(gateData.applicants)) {
    if (a.dk === dk) { id = aid; break; }
  }
  if (!id) id = crypto.randomBytes(8).toString('hex');
  const old = gateData.applicants[id] || {};
  gateData.applicants[id] = {
    answer: old.answer || '访客',
    ua: req.headers['user-agent'] || '',
    brand: parseBrand(req.headers['user-agent']),
    ip: realIP(req) || '',
    dk,
    fph: old.fph || '',
    fp: old.fp || {},
    dev: old.dev || {},
    applyTime: old.applyTime || Date.now(),
    lastAccess: Date.now(),
    status: 'approved',
    level: 'perm',
    approveTime: old.approveTime || Date.now(),
    visits: old.visits || 0,
    special: old.special || false,
    note: old.note || '',
  };
  if (pathname === '/') recordVisit(req, id, gateData.applicants[id]);
  else saveGateData();
  res.setHeader('Set-Cookie', [`vid=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`, mintPass(res, id)]);
  return true;
}

function approvalGate(req, res, pathname) {
  if (gateData.blockedIps.includes(realIP(req))) {
    serveGatePage(res, 'denied', '你已被拉黑，如有疑问请联系主人');
    return false;
  }
  const pass = checkPass(req);
  if (pass) {
    if (pathname === '/') recordVisit(req, pass.id, pass.a);
    return true;
  }
  // vid 已批准且未过期,但还没领通行证 → 补发并放行
  const vid = getCookies(req).vid;
  const f = vid && gateData.applicants[vid] ? { id: vid, a: gateData.applicants[vid] } : findByDevice(req);
  const a = f && f.a;
  if (a && a.status === 'approved' && !levelExpired(a)) {
    if (pathname === '/') recordVisit(req, f.id, a);
    if (vid) res.setHeader('Set-Cookie', mintPass(res, vid)); // 有 vid 才补发通行证
    return true;
  }
  // 无邀请函页:陌生设备静默建档直接放行;被拒绝/已撤销的不再放行
  if (a && (a.status === 'denied' || a.status === 'history')) {
    serveGatePage(res, 'denied', '很抱歉,您暂时无法参观');
    return false;
  }
  return autoAdmit(req, res, pathname);
}

// ===================== 旧问答门(答对即进) =====================
const GATE_SALT = crypto.randomBytes(16).toString('hex');
const GATE_HASH = GATE_ANSWER ? crypto.createHash('sha256').update(GATE_ANSWER + GATE_SALT).digest('hex') : '';
function hasGateCookie(req) {
  return getCookies(req).gate === GATE_HASH;
}

module.exports = {
  gatePageHtml, serveGatePage,
  sseRegister, sseKick,
  handleApply, handleRename, mintPass, handleGateStatus,
  approvalGate, GATE_HASH, hasGateCookie,
};
