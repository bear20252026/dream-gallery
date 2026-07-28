// abuse.js — 反刷存储预警:检测恶意大容量上传(人肉占盘攻击)
// 规则(2026-07-25 主人定):
//   速率:同设备 10 分钟内上传 >8 个文件 → 预警
//   总量:同设备累计上传 >2GB → 预警
//   大单:单文件 >300MB → 预警
//   全盘:photos+videos 目录 >10GB → 全局预警
// 预警写入 gateData.alerts 并在设备档案上打 suspicious 标记;后台可一键封闭 IP / 忽略
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./config');
const { gateData, saveGateData } = require('./store');
const { sendJson, readBody } = require('./util');
const { tokenOk } = require('./admin');

if (!gateData.alerts) gateData.alerts = [];

const RATE_WINDOW = 10 * 60 * 1000, RATE_MAX = 8;
const VOLUME_MAX = 2 * 1024 * 1024 * 1024;   // 单设备累计 2GB
const BIGFILE = 300 * 1024 * 1024;           // 单文件 300MB
const DISK_MAX = 10 * 1024 * 1024 * 1024;    // photos+videos 共 10GB

function pushAlert(type, dk, detail, file, size) {
  // 同类同人同文件 10 分钟内不重复报
  const dup = gateData.alerts.find(a => !a.dismissed && a.type === type && a.dk === dk && a.file === file && Date.now() - a.t < 10 * 60 * 1000);
  if (dup) return;
  // 设备档案:标记可疑 + 取昵称/IP
  let name = '访客', brand = '', ip = '';
  for (const a of Object.values(gateData.applicants || {})) {
    if (a.dk === dk) { a.suspicious = true; a.suspiciousReason = detail; name = a.answer || name; brand = a.brand || ''; ip = a.ip || ''; }
  }
  gateData.alerts.push({ t: Date.now(), type, dk, name, brand, ip, detail, file: file || '', size: size || 0, dismissed: false });
  if (gateData.alerts.length > 500) gateData.alerts.splice(0, gateData.alerts.length - 500);
  saveGateData();
}

function dirBytes(dir) {
  let sum = 0;
  try {
    for (const f of fs.readdirSync(path.join(ROOT, dir))) {
      try { sum += fs.statSync(path.join(ROOT, dir, f)).size; } catch (e) {}
    }
  } catch (e) {}
  return sum;
}

// 每次公开上传成功后调用(dk=上传者设备,name=文件名,size=字节)
function abuseCheck(dk, name, size) {
  try {
    if (!gateData.uploads) return;
    const now = Date.now();
    // 1. 速率
    const mine = Object.entries(gateData.uploads).filter(([, u]) => u && u.dk === dk);
    const recent = mine.filter(([, u]) => now - u.ts < RATE_WINDOW);
    if (recent.length > RATE_MAX) {
      pushAlert('rate', dk, `10 分钟内上传 ${recent.length} 个文件(疑似刷盘)`, name, size);
    }
    // 2. 单文件
    if (size > BIGFILE) {
      pushAlert('bigfile', dk, `单文件 ${(size / 1024 / 1024).toFixed(0)}MB 超过 300MB`, name, size);
    }
    // 3. 设备累计(uploads 记录的文件名可能在 photos 或 videos,两个目录都找)
    let total = 0;
    for (const [n] of mine) {
      for (const d of ['photos', 'videos']) {
        try { total += fs.statSync(path.join(ROOT, d, n)).size; break; } catch (e) {}
      }
    }
    if (total > VOLUME_MAX) {
      pushAlert('volume', dk, `累计上传 ${(total / 1024 / 1024 / 1024).toFixed(1)}GB 超过 2GB`, name, size);
    }
    // 4. 全盘占用
    const disk = dirBytes('photos') + dirBytes('videos');
    if (disk > DISK_MAX) {
      pushAlert('storage', dk, `媒体目录总占用 ${(disk / 1024 / 1024 / 1024).toFixed(1)}GB 超过 10GB`, name, size);
    }
  } catch (e) { /* 预警失败不影响上传 */ }
}

// POST /api/admin/alerts {action:'dismiss'|'clear', idx}(token)
function handleAdminAlerts(req, res, query) {
  if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
  readBody(req, obj => {
    if (obj.action === 'dismiss') {
      const a = gateData.alerts[obj.idx];
      if (!a) { sendJson(res, 404, { error: '预警不存在' }); return; }
      a.dismissed = true;
      // 若该设备没有其他未处理预警,摘掉可疑标记
      const dk = a.dk;
      saveGateData();
      if (!gateData.alerts.some(x => !x.dismissed && x.dk === dk)) {
        for (const ap of Object.values(gateData.applicants || {})) if (ap.dk === dk) { ap.suspicious = false; ap.suspiciousReason = ''; }
        saveGateData();
      }
      sendJson(res, 200, { ok: true });
      return;
    }
    if (obj.action === 'clear') {
      gateData.alerts = [];
      for (const ap of Object.values(gateData.applicants || {})) { ap.suspicious = false; ap.suspiciousReason = ''; }
      saveGateData();
      sendJson(res, 200, { ok: true });
      return;
    }
    sendJson(res, 400, { error: 'action 必须是 dismiss 或 clear' });
  });
}

module.exports = { abuseCheck, handleAdminAlerts };
