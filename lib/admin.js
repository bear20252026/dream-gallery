// admin.js — 主人后台接口(2026-08-30 权限精简版)
// 唯一访客管理动作 = 踢出(kick);被踢者申请重进后批准(approve);其余仅信息记录(备注)。
// 拉黑 IP 保留给反刷预警(abuse)自动使用,不再是常规管理操作。
const { TOKEN } = require('./config');
const { sendJson, readBody } = require('./util');
const { gateData, saveGateData, getApplicant, revokeSession } = require('./store');
const { sseNotify } = require('./gate');

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
      return { id, ...a, geo: (gateData.geo && gateData.geo[a.ip]) || '' };
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
    blocked: gateData.blockedIps, now: Date.now(),
    kickLog: (gateData.kickLog || []).slice(-100).reverse(),
    uploads, uploaderInfo,
    photoCaptions: gateData.photoCaptions || {},
    userLinks: gateData.userLinks || [],
    linkClicks: (gateData.linkClicks || []).slice(-300).reverse(),
    clientErrors: (gateData.clientErrors || []).slice(-100).reverse(),
    alerts: (gateData.alerts || []).slice(-100).reverse(),
    siteConfig: gateData.siteConfig || { mode: 'normal', customLinks: [], demoPhotos: [] },
  });
}

// 访客管理动作(精简后):
//   kick    踢出设备(唯一常规管理动作):标记 kicked + 踢出历史 + SSE 立即送出画廊
//   approve 批准重进申请(reapply)或误操作恢复(kicked)→ approved 放行
//   note    备注改名
function handleAdminDecide(req, res, query) {
  if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
  readBody(req, obj => {
    const a = getApplicant(String(obj.id || ''));
    if (!a) { sendJson(res, 404, { error: '申请不存在' }); return; }
    const act = obj.action;
    if (act === 'kick') {
      a.status = 'kicked';
      a.kickedTime = Date.now();
      a.kickReason = String(obj.reason || '').slice(0, 60);
      // 踢出历史日志(独立于档案,档案被重建也不丢记录)
      if (!gateData.kickLog) gateData.kickLog = [];
      gateData.kickLog.push({
        t: Date.now(), id: obj.id, name: a.answer || '访客',
        ip: a.ip || '', dk: a.dk || '', reason: a.kickReason,
      });
      if (gateData.kickLog.length > 200) gateData.kickLog.splice(0, gateData.kickLog.length - 200);
      saveGateData();
      sseNotify(a.dk ? [a.dk] : [], 'kick'); // 秒级通知该设备(收到即弹回申请页)
      sendJson(res, 200, { ok: true });
    } else if (act === 'approve') {
      // 批准重进 / 恢复放行;兼容旧后台缓存发来的 'perm' 同义
      a.status = 'approved';
      a.approveTime = Date.now();
      delete a.matchHint;
      saveGateData();
      sseNotify(a.dk ? [a.dk] : [], 'approved');
      sendJson(res, 200, { ok: true });
    } else if (act === 'note') {
      a.note = String(obj.note || '').slice(0, 50);
      saveGateData();
      sendJson(res, 200, { ok: true });
    } else if (act === 'revoke-session') {
      // 吊销该访客的会话 Token:Cookie 立即失效,不改踢出状态;
      // 本人设备下次访问经指纹兜底重新识别自动换发新会话
      const ok = revokeSession(String(obj.id || ''));
      if (!ok) { sendJson(res, 404, { error: '档案不存在' }); return; }
      sendJson(res, 200, { ok: true });
    } else {
      sendJson(res, 400, { error: '未知操作(仅 kick/approve/note/revoke-session)' });
    }
  });
}

// 批量动作:仅保留 IP 拉黑(反刷预警面板使用),观察列表已废
function handleAdminBulk(req, res, query) {
  if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
  readBody(req, obj => {
    const act = obj.action;
    if (act === 'block' || act === 'unblock') {
      const ip = String(obj.ip || '');
      if (!ip) { sendJson(res, 400, { error: '缺少 ip' }); return; }
      const set = new Set(gateData.blockedIps);
      if (act === 'block') set.add(ip); else set.delete(ip);
      gateData.blockedIps = [...set];
      saveGateData();
      sendJson(res, 200, { ok: true });
    } else {
      sendJson(res, 400, { error: '未知操作(权限体系已精简:仅 block/unblock)' });
    }
  });
}

module.exports = { tokenOk, geoLookup, handleAdminList, handleAdminDecide, handleAdminBulk };
