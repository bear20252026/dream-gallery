// ===================== 审批门:主人后台接口 =====================
const { TOKEN } = require('./config');
const { sendJson, readBody } = require('./util');
const { gateData, saveGateData } = require('./store');
const { sseKick } = require('./gate');

function tokenOk(req, query) {
  // 常量时间比较(2026-07-28 OWASP 审计:A01 计时侧信道;长度不等即拒,不泄露长度信息以外的内容)
  const t = query.token || req.headers['x-token'] || '';
  if (!TOKEN || !t || t.length !== TOKEN.length) return false;
  return require('crypto').timingSafeEqual(Buffer.from(t), Buffer.from(TOKEN));
}

// IP 归属地查询(免费接口,省市级,结果缓存进 gate_data.geo)
function geoLookup(ip) {
  if (!ip) return;
  if (!gateData.geo) gateData.geo = {};
  if (ip in gateData.geo) return; // 已查过(含失败占位)
  gateData.geo[ip] = null; // 占位防并发重复查询
  const clean = ip.replace('::ffff:', '');
  fetch(`http://ip-api.com/json/${encodeURIComponent(clean)}?lang=zh-CN&fields=status,regionName,city,isp`, { signal: AbortSignal.timeout(5000) })
    .then(r => r.json())
    .then(d => {
      let g = d.status === 'success'
        ? (d.regionName || '') + (d.city && d.city !== d.regionName ? ' ' + d.city : '') + (d.isp ? ' · ' + d.isp : '')
        : '';
      gateData.geo[ip] = g.trim() || '未知';
      saveGateData();
    })
    .catch(() => { gateData.geo[ip] = '未知'; });
}

function handleAdminList(req, res, query) {
  if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
  const list = Object.entries(gateData.applicants)
    .map(([id, a]) => {
      geoLookup(a.ip); // 触发缺失的归属地查询(异步,下次刷新可见)
      return {
        id, ...a,
        geo: (gateData.geo && gateData.geo[a.ip]) || '',
        vip: !!(a.dk && gateData.vipPassed && gateData.vipPassed[a.dk]),
        quizPassed: !!(a.dk && gateData.quizPassed && gateData.quizPassed[a.dk]),
      };
    })
    .sort((x, y) => y.applyTime - x.applyTime);
  // 展示区相关数据(模式卡/媒体库/访客链接用):上传归属、AI 配文、访客链接、站点配置
  const uploads = gateData.uploads || {};
  const uploaderInfo = {};
  for (const [name, u] of Object.entries(uploads)) {
    const rec = Object.entries(gateData.applicants).find(([, a]) => a.dk === u.dk);
    uploaderInfo[name] = rec ? (rec[1].answer || rec[1].brand || '访客') : '访客';
  }
  sendJson(res, 200, {
    applicants: list, stats: gateData.stats, visits: (gateData.visits || []).slice(-300),
    blocked: gateData.blockedIps, watch: gateData.watchIps, now: Date.now(),
    uploads, uploaderInfo,
    photoCaptions: gateData.photoCaptions || {},
    userLinks: gateData.userLinks || [],
    linkClicks: (gateData.linkClicks || []).slice(-300).reverse(),
    clientErrors: (gateData.clientErrors || []).slice(-100).reverse(),
    alerts: (gateData.alerts || []).slice(-100).reverse(),
    siteConfig: gateData.siteConfig || { mode: 'normal', customLinks: [], demoPhotos: [] },
  });
}

function handleAdminDecide(req, res, query) {
  if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
  readBody(req, obj => {
    const a = gateData.applicants[obj.id];
    if (!a) { sendJson(res, 404, { error: '申请不存在' }); return; }
    const act = obj.action;
    if (act === 'perm' || act === 'day' || act === 'once') {
      a.status = 'approved';
      a.level = act;
      a.approveTime = Date.now();
      a.firstAccess = null;
    } else if (act === 'deny') {
      a.status = 'denied';
    } else if (act === 'note') {
      a.note = String(obj.note || '').slice(0, 50);
      saveGateData();
      sendJson(res, 200, { ok: true });
      return;
    } else if (act === 'special') {
      // 授予「特殊访问」(仅后台被动授予,不可前台申请):该设备看到特殊模式(全展示)
      a.special = true;
    } else if (act === 'unspecial') {
      a.special = false;
    } else if (act === 'vip') {
      // 授予 VIP 免答权限(仅后台被动授予,不可前端申请)
      if (!a.dk) { sendJson(res, 400, { error: '该设备暂无指纹记录,无法授予' }); return; }
      if (!gateData.vipPassed) gateData.vipPassed = {};
      gateData.vipPassed[a.dk] = Date.now();
    } else if (act === 'unvip') {
      // 撤销 VIP 权限(立即生效,该设备被送出建筑,围墙重新竖起)
      if (gateData.vipPassed) delete gateData.vipPassed[a.dk];
    } else if (act === 'unquiz') {
      // 撤销答题获得权限(同样送出建筑)
      if (gateData.quizPassed) delete gateData.quizPassed[a.dk];
    } else if (act === 'revoke') {
      // 撤销批准 → 归入历史(不回待批准列表),访客可重新申请
      a.status = 'history';
      a.historyReason = 'revoked';
      a.level = null;
      a.approveTime = null;
      a.firstAccess = null;
    } else {
      sendJson(res, 400, { error: '未知操作' });
      return;
    }
    saveGateData();
    sseKick(a.dk ? [a.dk] : []); // 秒级通知该设备重新校验(dk 缺失则广播)
    sendJson(res, 200, { ok: true });
  });
}

// 不针对单个申请的批量动作
function handleAdminBulk(req, res, query) {
  if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
  readBody(req, obj => {
    const act = obj.action;
    if (act === 'revoke_all') {
      let n = 0;
      for (const a of Object.values(gateData.applicants)) {
        if (a.status === 'approved') { a.status = 'history'; a.historyReason = 'revoked'; a.level = null; a.approveTime = null; a.firstAccess = null; n++; }
      }
      saveGateData();
      sseKick([]); // 一键撤销:广播通知全部在线设备
      sendJson(res, 200, { ok: true, count: n });
    } else if (act === 'block' || act === 'unblock' || act === 'watch' || act === 'unwatch') {
      const ip = String(obj.ip || '');
      if (!ip) { sendJson(res, 400, { error: '缺少 ip' }); return; }
      const listName = (act === 'block' || act === 'unblock') ? 'blockedIps' : 'watchIps';
      const add = (act === 'block' || act === 'watch');
      const set = new Set(gateData[listName]);
      if (add) set.add(ip); else set.delete(ip);
      gateData[listName] = [...set];
      saveGateData();
      if (act === 'block') sseKick([]); // 拉黑:广播踢出该 IP 下在线设备
      sendJson(res, 200, { ok: true });
    } else {
      sendJson(res, 400, { error: '未知操作' });
    }
  });
}

module.exports = { tokenOk, geoLookup, handleAdminList, handleAdminDecide, handleAdminBulk };
