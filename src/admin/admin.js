// admin.js — 后台脚本(2026-09-24 自 admin.html 内联抽出;2026-10-09 审查 P2 切分为四模块)
// 本体保留:共享可变状态 DATA/RANGE/CAL_DATE + 数据/访客/预警/统计/历史/答题/文件/展示/大屏/杂项
// (这些分区横跨读写 DATA 且互相成环,第一阶段不动);报错/一念墙/TTS→admin-tabs.js,
// 协议文档→admin-docs.js,在线对话→admin-chat.js,共享工具→admin-core.js。
// ⚠️ 兼容关键:markup 与 innerHTML 模板里的内联 onclick 依赖全局函数
//   → 文件末尾统一 Object.assign(window, {...}) 兜底,勿删;模板里引用的名字必须存活于此。

import {
  TOKEN,
  tk,
  tk2,
  tkq,
  adminFetch,
  confirmAsync,
  $,
  esc,
  j,
  fmt,
  day0,
  todayStr,
  toast,
  brandIcon,
  brandShow,
} from './admin-core.js';
import { loadErrors } from './admin-tabs.js';
import { loadDocs } from './admin-docs.js';
import { startChat, stopChatLive, chatSelect, chatSend } from './admin-chat.js';

import { DATA, RANGE, CAL_DATE, setData } from './admin-state.js';
import { renderStats, setRange, calDay, calMonth, calReset } from './admin-stats.js';
import {
  loadFiles,
  pv,
  pvUrl,
  delFile,
  upload,
  loadDisplay,
  uploadBigscreen,
  delBigscreen,
  addCustomLink,
  presetLink,
  delCustomLink,
  delUserLink,
  toggleDemo,
  editCaption,
  copyTxt,
  dl,
  clearClicks,
  exportPdf,
} from './admin-content.js';

function switchTab(t) {
  var panels = [
    'approve',
    'stats',
    'history',
    'quiz',
    'display',
    'files',
    'docs',
    'errors',
    'ttsstats',
    'chat',
  ];
  for (var i = 0; i < panels.length; i++) {
    var p = $('tab-' + panels[i]);
    if (p) p.style.display = panels[i] === t ? '' : 'none';
  }
  document.querySelectorAll('.tab').forEach(function (e) {
    e.classList.toggle('active', e.dataset.tab === t);
  });
  if (t !== 'chat') stopChatLive();
  var loadFn = null;
  if (t === 'files') loadFn = loadFiles;
  else if (t === 'quiz') loadFn = loadQuiz;
  else if (t === 'display') loadFn = loadDisplay;
  else if (t === 'docs') loadFn = loadDocs;
  else if (t === 'chat') loadFn = startChat;
  else if (t === 'errors') loadFn = loadErrors;
  if (loadFn) setTimeout(loadFn, 200);
}
// ---------- 数据 ----------
async function load() {
  let r, d;
  try {
    r = await adminFetch('/api/admin/list' + tk());
    if (r.status === 401) {
      document.querySelector('.wrap').innerHTML = '<h1>401 未授权：网址后请加 ?token=你的密码</h1>';
      return;
    }
    if (!r.ok) throw new Error('服务返回 ' + r.status);
    d = await r.json();
  } catch (e) {
    // 部署重启窗口/瞬时网络问题:明确提示并自动重试,避免误以为数据丢失
    document.querySelector('.wrap').innerHTML =
      '<h1>⏳ 数据加载失败(' +
      esc(e.message) +
      ')，3 秒后自动重试…</h1><p>若服务器正在更新，稍候即可恢复；已有访问记录不会丢失。</p>';
    setTimeout(load, 3000);
    return;
  }
  setData(d);
  renderApprove();
  renderStats();
  renderHistory();
  // 数据快照时间:区分"暂时没刷出来"与"数据丢了"
  const el = document.getElementById('dataStamp');
  if (el)
    el.textContent =
      '数据时间 ' +
      new Date().toLocaleTimeString('zh-CN', { hour12: false }) +
      ' · 访问明细共 ' +
      (DATA.visits || []).length +
      ' 条';
}
function cardHtml(a, now) {
  let btns = '';
  if (a.status === 'reapply') {
    btns = `<button class="btn-perm" onclick="decide('${a.id}','approve')">批准进入</button>`;
  } else if (a.status === 'kicked' || a.status === 'denied' || a.status === 'history') {
    btns = `<button class="btn-perm" onclick="decide('${a.id}','approve')">恢复放行</button>`;
  } else {
    btns = `<button class="btn-kick" onclick="kickAsk('${a.id}','${j(a.answer || '')}')">踢出画廊</button><button class="btn-note" onclick="revokeSessAsk('${a.id}','${j(a.answer || '')}')">吊销会话</button>`;
  }
  const ip = a.ip || '';
  const isBlocked = (DATA.blocked || []).includes(ip);
  const statusBadge =
    a.status === 'approved'
      ? '<span class="badge approved">已放行</span>'
      : a.status === 'reapply'
        ? '<span class="badge pending">重进申请待批</span>'
        : a.status === 'kicked'
          ? '<span class="badge denied">已踢出</span>'
          : a.status === 'denied'
            ? '<span class="badge denied">已拒绝(旧)</span>'
            : '<span class="badge history">历史档案</span>';
  const badge =
    statusBadge +
    (isBlocked ? '<span class="badge blocked">IP已拉黑</span>' : '') +
    (a.kickReason
      ? `<span class="badge denied" title="踢出理由">理由:${esc(a.kickReason)}</span>`
      : '') +
    (a.matchHint
      ? `<span class="badge denied" style="background:#7a1f2b">🔁 疑似同一设备:${esc(a.matchHint)}</span>`
      : '') +
    (a.reapplyMsg
      ? `<span class="badge pending" title="申请留言">留言:${esc(a.reapplyMsg)}</span>`
      : '') +
    (a.suspicious
      ? '<span class="badge denied" title="' + esc(a.suspiciousReason || '') + '">⚠ 可疑</span>'
      : '');
  const noteBit = a.note ? `<span class="note-tag"> ${esc(a.note)}</span>` : '';
  const ipHist = (a.ips || []).length > 1 ? ' · 历史IP ' + a.ips.length + ' 个' : '';
  return `<div class="card">
<div class="answer">${brandIcon(a.brand)} 「${esc(a.answer)}」${badge}</div>
<div class="meta">${noteBit}<span class="brand-tag">${brandShow(a.brand)}</span><span class="geo-tag">📍 ${esc(a.geo || '定位中…')}</span>IP ${esc(ip.replace('::ffff:', ''))}${ipHist} · 访问 ${a.visits || 0} 次<br>首次 ${fmt(a.applyTime)}${a.kickedTime ? ' · 踢出 ' + fmt(a.kickedTime) : ''}${a.reapplyTime ? ' · 申请 ' + fmt(a.reapplyTime) : ''}${a.lastAccess ? ' · 最近访问 ' + fmt(a.lastAccess) : ''}</div>
<div class="actions">${btns}
<button class="btn-note" onclick="editNote('${a.id}','${j(a.note || '')}')">备注</button></div></div>`;
}
async function editNote(id, old) {
  const n = prompt('给这台设备起个备注名（留空清除）:', old || '');
  if (n === null) return;
  const r = await adminFetch('/api/admin/decide' + tk(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, action: 'note', note: n }),
  });
  if (r.ok) {
    toast('备注已保存');
    load();
  } else toast('保存失败', 1);
}

// 踢出前填理由(可空)
async function kickAsk(id, name) {
  const reason = prompt('踢出「' + name + '」的理由(选填,将记入踢出历史):', '');
  if (reason === null) return;
  decide(id, 'kick', reason);
}
// 吊销会话:该设备 Cookie 立即失效,下次访问重新识别身份并自动换发(不等于踢出)
async function revokeSessAsk(id, name) {
  if (
    !confirm(
      '吊销「' +
        name +
        '」的会话 Token?\n其 Cookie 立即失效,下次访问将自动重新识别身份(不会被挡在门外,区别于踢出)。'
    )
  )
    return;
  decide(id, 'revoke-session');
}
async function decide(id, action, reason) {
  const r = await adminFetch('/api/admin/decide' + tk(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, action, reason: reason || '' }),
  });
  if (r.ok) {
    toast(
      action === 'kick'
        ? '已踢出,该设备将立即弹回申请页'
        : action === 'revoke-session'
          ? '已吊销会话,该设备下次访问将重新识别'
          : '操作成功'
    );
    load();
  } else {
    const d = await r.json().catch(() => ({}));
    toast(d.error || '操作失败', 1);
  }
}
// ---------- 访客管理页 ----------
function renderApprove() {
  const A = DATA.applicants,
    s = DATA.stats;
  renderAlerts();
  const reapply = A.filter((a) => a.status === 'reapply');
  const approved = A.filter((a) => a.status === 'approved');
  const kicked = A.filter((a) => ['kicked', 'denied', 'history'].includes(a.status));

  // 顶部摘要条:新权限体系下最关键的三个数字
  $('summaryBar').innerHTML = [
    { n: reapply.length, label: '待批重进申请', cls: 'amber', tab: 'reapply' },
    { n: approved.length, label: '已放行设备', cls: 'green' },
    { n: s.byDay[todayStr()] || 0, label: '今日访问', cls: 'blue' },
    { n: s.total, label: '累计访问', cls: 'grey' },
  ]
    .map(
      (x) =>
        `<div class="sum-item ${x.cls}${x.tab ? ' clickable' : ''}"${x.tab ? ` onclick="document.getElementById('reapplyTitle').scrollIntoView({behavior:'smooth'})"` : ''}><div class="sum-n">${x.n}</div><div class="sum-l">${x.label}</div></div>`
    )
    .join('');

  // 待批徽标:tab 上提醒有待办
  const badge = document.getElementById('pendingBadge');
  badge.style.display = reapply.length ? 'inline-block' : 'none';
  badge.textContent = ' ' + reapply.length;

  // 重进申请(待办区,琥珀高亮)
  $('reapplyTitle').textContent = reapply.length
    ? `🔔 重进申请（${reapply.length} 台设备等待批准）`
    : '🔔 重进申请（暂无待办）';
  $('reapply').innerHTML =
    reapply.map((a) => cardHtml(a, DATA.now)).join('') ||
    '<div class="empty">暂无重进申请——被踢出的设备重新进入画廊时会出现在这里</div>';

  renderApproved(approved);

  // 踢出历史时间线(新→旧)
  const log = DATA.kickLog || [];
  $('kickLog').innerHTML =
    log
      .map(
        (k, i) =>
          `<div class="tl-item"><div class="tl-dot"></div><div class="tl-body"><div class="tl-head">「${esc(k.name)}」<span class="tl-ip">IP ${esc((k.ip || '').replace('::ffff:', ''))}</span></div>${k.reason ? `<div class="tl-reason">理由:${esc(k.reason)}</div>` : ''}<div class="tl-time">${fmt(k.t)}</div></div></div>`
      )
      .join('') || '<div class="empty">还没有踢出记录</div>';
}
// 已放行列表:支持搜索,按最近访问倒序,默认只渲染前 60(全量渲染 600+ 卡片会卡)
function renderApproved(pre) {
  const A = DATA.applicants || [];
  const approved = pre || A.filter((a) => a.status === 'approved');
  const q = (($('appSearch') || {}).value || '').trim().toLowerCase();
  let list = approved;
  if (q)
    list = approved.filter(
      (a) =>
        (a.answer || '').toLowerCase().includes(q) ||
        (a.ip || '').toLowerCase().includes(q) ||
        (a.note || '').toLowerCase().includes(q)
    );
  list = list.slice().sort((a, b) => (b.lastAccess || 0) - (a.lastAccess || 0));
  const shown = list.slice(0, 60);
  $('approved').innerHTML =
    shown.map((a) => cardHtml(a, DATA.now)).join('') ||
    `<div class="empty">${q ? '没有匹配的设备' : '暂无已放行设备'}</div>`;
  if (list.length > 60)
    $('approved').innerHTML +=
      `<div class="empty">仅显示最近活跃的 60 台（共 ${list.length} 台${q ? '命中' : ''}，可用搜索缩小范围）</div>`;
}
// ---------- 反刷存储预警 ----------
const ALERT_TYPE = {
  rate: '🚨 刷盘速率',
  bigfile: '📦 超大文件',
  volume: '💾 累计超量',
  storage: '🛑 存储告急',
};
function renderAlerts() {
  const alerts = (DATA.alerts || []).filter((a) => !a.dismissed);
  if (!alerts.length) {
    $('alertBox').innerHTML = '';
    return;
  }
  $('alertBox').innerHTML =
    `<div style="background:rgba(200,40,50,.15);border:1px solid rgba(255,80,90,.5);border-radius:14px;padding:12px 16px;margin:10px 0">
    <div style="color:#ff9aa0;font-weight:700;margin-bottom:8px">⚠ 存储攻击预警 (${alerts.length} 条未处理)
      <button class="btn-revoke" style="margin-left:10px" onclick="clearAlerts()">全部忽略</button></div>
    ${alerts
      .map((a) => {
        const idx = DATA.alerts.indexOf(a);
        return `<div class="file-row" style="border-color:rgba(255,80,90,.3)">
        <span class="fname">${ALERT_TYPE[a.type] || a.type} · ${esc(a.detail)}<br>
        <span style="opacity:.7">「${esc(a.name)}」 ${brandShow(a.brand)} · IP ${esc((a.ip || '').replace('::ffff:', ''))} · ${fmt(a.t)}${a.file ? ' · ' + esc(a.file) : ''}${a.size ? ' · ' + (a.size / 1024 / 1024).toFixed(1) + 'MB' : ''}</span></span>
        <button class="btn-deny" onclick="blockAlertIp('${j(a.ip)}',${idx})">封闭 IP</button>
        <button class="btn-day" onclick="dismissAlert(${idx})">忽略</button>
      </div>`;
      })
      .join('')}
  </div>`;
}
async function dismissAlert(idx) {
  const r = await adminFetch('/api/admin/alerts' + tk(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'dismiss', idx }),
  });
  if (r.ok) {
    DATA.alerts[idx].dismissed = true;
    renderAlerts();
    toast('已忽略');
  } else toast('失败', 1);
}
async function clearAlerts() {
  if (!(await confirmAsync('忽略全部预警?(可疑标记也会清除)'))) return;
  const r = await adminFetch('/api/admin/alerts' + tk(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'clear' }),
  });
  if (r.ok) {
    (DATA.alerts || []).forEach((a) => (a.dismissed = true));
    renderAlerts();
    toast('已全部忽略');
  } else toast('失败', 1);
}
async function blockAlertIp(ip, idx) {
  if (!ip) {
    toast('该预警无 IP 信息', 1);
    return;
  }
  if (
    !(await confirmAsync(
      '封闭 IP ' +
        ip.replace('::ffff:', '') +
        ' ?该 IP 所有设备将立即无法访问(可随时在设备卡片上「解除拉黑」恢复)'
    ))
  )
    return;
  const r = await adminFetch('/api/admin/bulk' + tk(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'block', ip }),
  });
  if (r.ok) {
    await dismissAlert(idx);
    toast('已封闭,设备卡片上可一键解除');
    load();
  } else toast('封闭失败', 1);
}

function renderHistory() {
  const A = DATA.applicants,
    now = DATA.now;
  const visits = (DATA.visits || []).slice(-30).reverse();
  const apps = {};
  A.forEach((a) => (apps[a.id] = a));
  $('visitLog').innerHTML =
    visits
      .map((v) => {
        const a = apps[v.id] || { answer: '(未知设备)', brand: '', geo: '' };
        return `<div class="vrow"><span>${brandIcon(a.brand)}</span><span class="who">「${esc(a.answer)}」 <span class="geo-tag">📍${esc(a.geo || '')}</span></span><span class="cnt">${fmt(v.t)}</span></div>`;
      })
      .join('') || '<div class="empty">暂无访问记录</div>';
  const hist = A.filter(
    (a) =>
      a.status === 'history' ||
      a.status === 'denied' ||
      (a.status === 'approved' && a.level === 'day' && now > a.approveTime + 86400000) ||
      (a.status === 'approved' && a.level === 'once' && a.firstAccess)
  );
  $('history').innerHTML =
    hist.map((a) => cardHtml(a, now)).join('') || '<div class="empty">暂无历史记录</div>';
}
// ---------- 答题记录页 ----------
async function loadQuiz() {
  const r = await adminFetch('/api/admin/quiz' + tk());
  if (!r.ok) {
    $('quizList').innerHTML = '<div class="empty">加载失败</div>';
    return;
  }
  const d = await r.json();
  if (!d.attempts.length) {
    $('quizList').innerHTML = '<div class="empty">还没有人参加解密测试</div>';
    return;
  }
  $('quizList').innerHTML = d.attempts
    .map((a, i) => {
      const dev = a.device || {};
      const who = dev.answer ? `「${esc(dev.answer)}」` : '(未申请门禁的设备)';
      // 2026-08-31 审计 M3:geo 来自第三方 ip-api 响应,必须转义后入 innerHTML
      const meta = [dev.brand, dev.geo]
        .filter(Boolean)
        .map((x) => esc(x))
        .join(' · ');
      const trackName = a.track === 'li' ? '理科卷' : a.track === 'wen' ? '文科卷' : '未知卷';
      const badge = a.passed
        ? '<span class="badge approved">通过 ' + a.total + '分</span>'
        : '<span class="badge denied">未通过 ' + a.total + '分</span>';
      const mcReview = (a.review || [])
        .map(
          (rv, j) =>
            `<span style="color:${rv.right ? '#16a34a' : '#ff8a8a'}">${j + 1}${rv.right ? '✓' : '✗'}</span>`
        )
        .join(' ');
      // 全量留档:每题的题目+四选项内容+所选+正解(仅后台可见)
      const fullRows = (a.fullReview || [])
        .map((m, j) => {
          const opt = (L, c) =>
            `<div style="margin-left:14px;color:${L === m.correctLetter ? '#16a34a' : L === m.chosen ? '#ff8a8a' : 'rgba(255,255,255,.6)'}">${L}. ${esc(c || '')}${L === m.correctLetter ? ' ✓正解' : L === m.chosen ? ' ✗TA选的' : ''}</div>`;
          return `<div style="margin-top:8px;padding:8px;background:rgba(255,255,255,.04);border-radius:8px">
        <div><b>第${j + 1}题 · ${esc(m.subject || '')}</b> ${esc(m.q || '')}</div>
        ${opt('A', m.options && m.options.A)}${opt('B', m.options && m.options.B)}${opt('C', m.options && m.options.C)}${opt('D', m.options && m.options.D)}
      </div>`;
        })
        .join('');
      return `<div class="card" style="cursor:pointer" onclick="this.querySelector('.qz-detail').classList.toggle('show')">
<div class="answer">${brandIcon(dev.brand)} ${who} ${badge}</div>
<div class="meta">${meta ? meta + ' · ' : ''}${trackName} · 选择 ${a.mcScore}/81 · 问答 ${a.qaScore}/19(${a.qaBy === 'ai' ? 'AI阅卷' : '本地细则'}) · ${fmt(a.t)}</div>
<div class="qz-detail" style="display:none;margin-top:10px">
<div class="meta" style="color:#d97706">选择对错:${mcReview}</div>
${fullRows}
<div class="meta" style="margin-top:8px;color:#615d59"><b>问答题目:</b>${esc(a.qaQ || '')}</div>
<div class="meta" style="margin-top:6px;padding:10px;background:#f6f5f4;border-radius:8px;white-space:pre-wrap;word-break:break-all"><b>TA 的作答:</b>\n${esc(a.qaText || '(空)')}</div>
${a.qaComment ? `<div class="meta" style="margin-top:6px"><b>评语:</b>${esc(a.qaComment)}</div>` : ''}
</div></div>`;
    })
    .join('');
}

load();
// 支持 /admin#docs 直达协议文档页(合并后台后的旧链接兼容)
if (location.hash.slice(1) === 'docs') switchTab('docs');
// 手动刷新按钮（顶部）—— 不再自动刷新，避免渲染几千条数据卡死浏览器

// ===================== 内联 handler 全局兜底(见文件头说明) =====================
Object.assign(window, {
  addCustomLink,
  blockAlertIp,
  calDay,
  calMonth,
  chatSelect,
  chatSend,
  calReset,
  clearAlerts,
  clearClicks,
  copyTxt,
  decide,
  delBigscreen,
  delCustomLink,
  delFile,
  delUserLink,
  dismissAlert,
  dl,
  editCaption,
  editNote,
  exportPdf,
  kickAsk,
  presetLink,
  pv,
  pvUrl,
  renderApproved,
  revokeSessAsk,
  setRange,
  switchTab,
  toggleDemo,
  upload,
  uploadBigscreen,
});
