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

let DATA = null,
  RANGE = 'day',
  CAL_DATE = null;

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
  DATA = d;
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
function statCards(arr) {
  return arr
    .map(
      ([n, l]) => `<div class="stat"><div class="num">${n}</div><div class="label">${l}</div></div>`
    )
    .join('');
}
// ---------- 统计页 ----------
function weekStart(t) {
  const d = new Date(day0(t));
  const w = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - w);
  return d.getTime();
}
function monthStart(t) {
  const d = new Date(t);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function yearStart(t) {
  const d = new Date(t);
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function renderStats() {
  var s = DATA.stats,
    visits = DATA.visits || [];
  var t0 = day0(Date.now()),
    w0 = weekStart(Date.now()),
    m0 = monthStart(Date.now());
  $('statCards2').innerHTML = statCards([
    [s.total, '累计'],
    [
      visits.filter(function (v) {
        return v.t >= t0;
      }).length,
      '今日',
    ],
    [
      visits.filter(function (v) {
        return v.t >= w0;
      }).length,
      '本周',
    ],
    [
      visits.filter(function (v) {
        return v.t >= m0;
      }).length,
      '本月',
    ],
  ]);
  // 30天柱状图
  var days = [],
    i;
  for (i = 29; i >= 0; i--) {
    var t = t0 - i * 86400000;
    days.push({ t: t, label: new Date(t).getDate(), key: todayStr(t) });
  }
  var max = Math.max(
    1,
    days.reduce(function (m, d) {
      return Math.max(m, s.byDay[d.key] || 0);
    }, 0)
  );
  $('chart').innerHTML = days
    .map(function (d) {
      var c = s.byDay[d.key] || 0;
      return (
        '<div class=\"bar\" style=\"height:' +
        Math.max(2, (c / max) * 100) +
        '%\" onclick=\"calDay(' +
        d.t +
        ')\"><span class=\"tip\">' +
        d.key.slice(5) +
        ' · ' +
        c +
        '次</span></div>'
      );
    })
    .join('');
  $('chartX').innerHTML = days
    .map(function (d, i) {
      return '<span>' + (i % 5 === 0 ? d.label : '') + '</span>';
    })
    .join('');
  renderCalendar();
  renderRange();
}
function renderCalendar() {
  var base = CAL_DATE || Date.now();
  var first = new Date(base);
  first.setDate(1);
  var startW = (first.getDay() + 6) % 7;
  var dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  var s = DATA.stats;
  var ym = first.getFullYear() + '年' + (first.getMonth() + 1) + '月';
  var html =
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
    '<button class="range-btn" onclick="calMonth(-1)" style="padding:2px 10px;font-size:14px">◀</button>' +
    '<span style="font-size:14px;color:#d97706">' +
    ym +
    '</span>' +
    '<button class="range-btn" onclick="calMonth(1)" style="padding:2px 10px;font-size:14px">▶</button>' +
    '<button class="range-btn" onclick="calReset();" style="padding:2px 10px;font-size:12px;margin-left:auto">本月</button>' +
    '</div>';
  html += ['一', '二', '三', '四', '五', '六', '日']
    .map((d) => '<div class="cal-head">' + d + '</div>')
    .join('');
  for (var i = 0; i < startW; i++) html += '<div></div>';
  for (var d = 1; d <= dim; d++) {
    var t = new Date(first.getFullYear(), first.getMonth(), d).getTime();
    var c = s.byDay[todayStr(t)] || 0;
    html +=
      '<div class="cal-cell' +
      (c ? ' has' : '') +
      (todayStr(t) === todayStr() ? ' today' : '') +
      '" onclick="calDay(' +
      t +
      ')">' +
      d +
      (c ? '<span class="c">' + c + '</span>' : '') +
      '</div>';
  }
  $('calendar').innerHTML = html;
}
function calMonth(delta) {
  var d = new Date(CAL_DATE || Date.now());
  d.setMonth(d.getMonth() + delta);
  CAL_DATE = d.getTime();
  renderStats();
}
function calDay(t) {
  CAL_DATE = t;
  setRange('custom');
}
function setRange(r, btn) {
  RANGE = r;
  CAL_DATE = r === 'custom' ? CAL_DATE : null;
  if (btn) {
    document.querySelectorAll('.range-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
  }
  renderRange();
}
function renderRange() {
  const visits = (DATA.visits || []).filter((v) => v.id);
  const apps = {};
  DATA.applicants.forEach((a) => (apps[a.id] = a));
  let from = 0,
    title = '';
  if (RANGE === 'day') {
    from = day0(Date.now());
    title = '今天';
  } else if (RANGE === 'week') {
    from = weekStart(Date.now());
    title = '本周';
  } else if (RANGE === 'month') {
    from = monthStart(Date.now());
    title = '本月';
  } else if (RANGE === 'year') {
    from = yearStart(Date.now());
    title = '今年';
  } else {
    from = day0(CAL_DATE);
    title = todayStr(CAL_DATE);
  }
  const to = RANGE === 'custom' ? from + 86400000 : Infinity;
  const inR = visits.filter((v) => v.t >= from && v.t < to);
  const byId = {};
  inR.forEach((v) => {
    byId[v.id] = byId[v.id] || { n: 0, last: 0 };
    byId[v.id].n++;
    byId[v.id].last = Math.max(byId[v.id].last, v.t);
  });
  const rows = Object.entries(byId)
    .sort((a, b) => b[1].last - a[1].last)
    .map(([id, v]) => {
      const a = apps[id] || { answer: '(未记录设备)', brand: '', geo: '' };
      return `<div class="vrow"><span>${brandIcon(a.brand)}</span><span class="who">「${esc(a.answer)}」 <span class="brand-tag">${brandShow(a.brand)}</span><span class="geo-tag">📍${esc(a.geo || '定位中')}</span></span><span class="cnt">${v.n} 次 · ${fmt(v.last).slice(5)}</span></div>`;
    })
    .join('');
  $('rangeList').innerHTML =
    `<div class="sub" style="margin:6px 0 10px">${title} · 共 ${inR.length} 次访问 · ${Object.keys(byId).length} 台设备</div>` +
    (rows || '<div class="empty">该时段暂无访问</div>');
}
// ---------- 历史页 ----------
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
// ---------- 文件页 ----------
async function loadFiles() {
  const dirs = [
    ['photos', ' 照片'],
    ['videos', '🎬 视频'],
    ['music', '🎵 音乐'],
  ];
  const caps = (DATA && DATA.photoCaptions) || {},
    ups = (DATA && DATA.uploaderInfo) || {};
  const demos = (DATA && DATA.siteConfig && DATA.siteConfig.demoPhotos) || [];
  let html = '';
  for (const [dir, label] of dirs) {
    const r = await adminFetch('/api/files?dir=' + dir + tk2());
    const d = await r.json();
    const files = (d[dir] || []).sort((a, b) => b.mtime.localeCompare(a.mtime));
    // 大屏 1~5 号:与「户外大屏」管理页同一套编号/同一批文件(videos/户外大屏/ 子目录,列表 API 不递归故单独拉配置)
    let bsHtml = '';
    if (dir === 'videos') {
      try {
        const bd = await (await adminFetch('/api/bigscreen')).json();
        bsHtml = (bd.slots || [])
          .map(
            (s) => `<div class="file-row" style="align-items:center">
        <!-- eslint-disable-next-line no-irregular-whitespace -- 模板串全角空格是 UI 分隔符 -->
        <span class="fname"><b>${esc(s.label)}</b>&#12288;${s.file ? esc(s.file) : '<span style="opacity:.45">空</span>'}</span>
        ${s.file && !s.hls ? `<button class="btn-day" onclick="pvUrl('${s.src}','${(s.file || '').split('.').pop().toLowerCase()}')">预览播放</button>` : ''}
        ${s.file && s.hls ? `<span style="opacity:.5">HLS 流,不支持在线预览</span>` : ''}
      </div>`
          )
          .join('');
      } catch (e) {
        // 原:静默吞掉 → 整个大屏区块凭空消失
        bsHtml = `<div class="fname" style="color:#c0392b">大屏槽位加载失败:${esc(String(e.message || e))}</div>`;
      }
    }
    html += `${bsHtml ? `<div class="section-title">🎬 户外大屏 1~5 号(画廊内循环播放;与「户外大屏」页编号一致)</div>${bsHtml}` : ''}<div class="section-title">${dir === 'videos' ? '🎬 其他视频(不在大屏循环内)' : label} (${files.length})</div>
<div class="upload-box"><input type="file" id="up-${dir}"><button class="btn-day" onclick="upload('${dir}')">上传到 ${dir}</button></div>
<div>${
      files
        .map((f) => {
          const isImg = /\.(jpe?g|png|gif|webp)$/i.test(f.name);
          const url = `/admin-media/${dir}/${encodeURIComponent(f.name)}` + tkq();
          const cap = caps[f.name]
            ? `<div style="font-size:12px;color:#ffd9a8;padding:2px 0">✍ ${esc(caps[f.name])}</div>`
            : '';
          const who = ups[f.name] ? `<span class="fsize"> ${esc(ups[f.name])}</span>` : '';
          const demoBtn =
            dir === 'photos'
              ? demos.includes(f.name)
                ? `<button class="btn-revoke" onclick="toggleDemo('${j(f.name)}',false)">取消演示</button>`
                : `<button class="btn-day" onclick="toggleDemo('${j(f.name)}',true)">设为演示</button>`
              : '';
          return `<div class="file-row" style="align-items:flex-start">
        ${isImg ? `<img src="${url}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;cursor:pointer" onclick="pv('${dir}','${j(f.name)}')">` : ''}
        <span class="fname" onclick="pv('${dir}','${j(f.name)}')" title="点击预览">${esc(f.name)}<br>${who}${cap}</span>
        <span class="fsize">${(f.size / 1024 / 1024).toFixed(2)}MB</span>
        <button class="btn-day" onclick="dl('/admin-media/${dir}/${encodeURIComponent(f.name)}','${j(f.name)}')">下载</button>
        <button class="btn-day" onclick="copyTxt(location.origin+'/admin-media/${dir}/' + encodeURIComponent('${j(f.name)}') + '${tkq()}')">复制链接</button>
        ${dir === 'photos' ? `<button class="btn-day" onclick="editCaption('${j(f.name)}','${j(caps[f.name] || '')}')">编辑配文</button>` : ''}
        ${demoBtn}
        <button class="btn-del" onclick="delFile('${dir}','${encodeURIComponent(f.name)}')">删除</button></div>`;
        })
        .join('') || '<div class="empty">空</div>'
    }</div>`;
  }
  $('fileSections').innerHTML = html;
}
function pv(dir, name) {
  pvUrl(
    `/admin-media/${dir}/${name}` + tkq(),
    decodeURIComponent(name).split('.').pop().toLowerCase()
  );
}
// 支持任意 URL 的媒体预览(文件页用 /admin-media 相对路径,大屏页用 CDN 绝对地址)
function pvUrl(url, ext) {
  const m = $('pvMask');
  if (
    [
      'jpg',
      'jpeg',
      'png',
      'gif',
      'webp',
      'bmp',
      'avif',
      'heic',
      'heif',
      'tif',
      'tiff',
      'ico',
    ].includes(ext)
  )
    m.innerHTML = `<img src="${url}">`;
  else if (['mp4', 'webm', 'm4v', 'mov'].includes(ext))
    m.innerHTML = `<video src="${url}" controls autoplay></video>`;
  else if (['mp3', 'wav', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'flac'].includes(ext))
    m.innerHTML = `<audio src="${url}" controls autoplay></audio>`;
  else {
    toast('该格式不支持在线播放(可下载后本地打开)', 1);
    return;
  }
  m.classList.add('show');
}
async function delFile(dir, name) {
  if (!(await confirmAsync('确定删除 ' + decodeURIComponent(name) + ' ？不可恢复！'))) return;
  const r = await adminFetch(`/api/files/${dir}/${name}?x=1` + tk2(), { method: 'DELETE' });
  if (r.ok) {
    toast('已删除');
    loadFiles();
  } else toast('删除失败', 1);
}
async function upload(dir) {
  const inp = $('up-' + dir);
  if (!inp.files.length) {
    toast('请先选择文件', 1);
    return;
  }
  const f = inp.files[0];
  const r = await adminFetch(`/api/upload?dir=${dir}&name=${encodeURIComponent(f.name)}` + tk2(), {
    method: 'POST',
    body: f,
  });
  if (r.ok) {
    toast('上传成功');
    loadFiles();
  } else toast('上传失败', 1);
}
// ---------- 展示区 ----------
const MOUNT_ICONS = {
  isLink2: '月球',
  isLink3: '滚动古文',
  isLink4: '墨韵文档',
  isLink5: '火星',
  isLink6: '木星',
  isLink7: '地球',
  isLink8: '全息档案',
  isLink9: '翠玉',
  isLink10: '福字',
  isLink11: '雅集',
  isLink12: '文档金库',
  isLink13: '祥云文档',
  isGarden: '秘密花园',
};
const LINK_MODELS = {
  sphere: '水晶球',
  cube: '立方晶',
  cone: '金字塔',
  octa: '星钻',
  torus: '光环',
  cylinder: '玉柱',
  icosa: '宝石',
  knot: '如意结',
  capsule: '胶囊',
  dodeca: '多面晶',
};
function loadDisplay() {
  if (!DATA) return;
  loadBigscreen();
  const sc = DATA.siteConfig || { mode: 'normal', customLinks: [], demoPhotos: [] };
  // 模式卡
  $('modeCard').innerHTML =
    `全局默认模式:<b style="color:#16a34a">普通模式(2026-09-06 起特殊模式已删除)</b>`;
  // 挂载下拉
  $('clIcon').innerHTML =
    '<option value="">不挂原图案(新建模型)</option>' +
    Object.entries(MOUNT_ICONS)
      .map(([k, v]) => `<option value="${k}">${v}</option>`)
      .join('');
  $('clModel').innerHTML = Object.entries(LINK_MODELS)
    .map(([k, v]) => `<option value="${k}">${v}</option>`)
    .join('');
  // 自定义链接列表
  $('customLinks').innerHTML =
    (sc.customLinks || [])
      .map(
        (l) => `<div class="file-row">
    <span class="fname">${esc(l.name)} → <a href="${j(l.url)}" target="_blank" style="color:#8cf">${esc(l.url.slice(0, 42))}</a>
    ${l.icon ? `<span class="fsize">挂在「${MOUNT_ICONS[l.icon] || l.icon}」(普通模式)</span>` : `<span class="fsize">模型「${LINK_MODELS[l.model] || l.model || '水晶球'}」</span>`}</span>
    <button class="btn-day" onclick="copyTxt('${j(l.url)}')">复制</button>
    <button class="btn-del" onclick="delCustomLink('${l.id}')">删除</button></div>`
      )
      .join('') || '<div class="empty">暂无</div>';
  // 演示照片
  const demos = sc.demoPhotos || [];
  $('demoPhotos').innerHTML =
    '当前: ' +
    (demos.map((d) => esc(d)).join('、') || '无') +
    '<br><span style="opacity:.6;font-size:12px">在「文件管理」里对每张照片点「设为/取消演示」即可调整</span>';
  // 访客链接
  const ul = DATA.userLinks || [];
  const nameOf = (dk) => {
    const r = (DATA.applicants || []).find((a) => a.dk === dk);
    return r ? r.answer || r.brand || '访客' : '访客';
  };
  $('userLinks').innerHTML =
    ul
      .map(
        (l) => `<div class="file-row">
    <span class="fname">[${esc(nameOf(l.dk))}] ${esc(l.name)} → <a href="${j(l.url)}" target="_blank" style="color:#8cf">${esc(l.url.slice(0, 42))}</a>
    <span class="fsize">${LINK_MODELS[l.model] || l.model || ''} · ${fmt(l.ts)}</span></span>
    <button class="btn-day" onclick="copyTxt('${j(l.url)}')">复制</button>
    <button class="btn-del" onclick="delUserLink('${l.id}')">删除</button></div>`
      )
      .join('') || '<div class="empty">暂无</div>';
  // 链接点击记录(仅后台可见)
  const clicks = DATA.linkClicks || [];
  $('clickList').innerHTML =
    clicks
      .map((c) => {
        const fp = c.fp || {},
          dev = c.dev || {};
        const idBits = [c.brand, c.geo, fp.scr, fp.platform ? '' : null]
          .filter(Boolean)
          .join(' · ');
        return `<div class="card">
      <div class="answer">${brandIcon(c.brand)} 「${esc(c.name || '访客')}」 点了 <b style="color:#8cf">${esc(c.link)}</b></div>
      <div class="meta">→ ${esc(c.url)}<br>
      ${fmt(c.t)} · IP ${esc((c.ip || '').replace('::ffff:', ''))} ${esc(c.geo || '')} · ${esc(c.brand || '')}${dev.battery ? ' · 🔋' + esc(dev.battery) : ''}${dev.network ? ' · 📶' + esc(dev.network) : ''}<br>
      屏幕 ${esc(fp.scr || '-')} · 时区 ${esc(String(fp.tz ?? '-'))} · 语言 ${esc(fp.lang || '-')} · ${esc(fp.platform || '')} · ${fp.cores || '-'}核 · 触屏${fp.touch ? '有' : '无'} · 指纹 ${esc(fp.canvas || '-')}${c.pos ? ` · 坐标 ${c.pos.x},${c.pos.y},${c.pos.z}` : ''}</div>
    </div>`;
      })
      .join('') || '<div class="empty">还没有点击记录</div>';
  // 访客端报错不再在此渲染(2026-09-24 修空白 bug):
  // 旧链路(/api/track/error → gateData.clientErrors)前端已无调用方,且此处
  // $('errList') 与「报错」独立 tab 的 #errList 撞重复 id,互相覆写 ——
  // 报错统一由独立 tab 的 loadErrors()(读 /api/admin/client-errors)渲染。
}
// ---------- 户外大屏管理(软编码;上传替换/清空 → 同步 R2 + 游戏即时生效) ----------
async function loadBigscreen() {
  const box = $('bigscreen');
  if (!box) return;
  box.innerHTML = '加载中…';
  try {
    const r = await adminFetch('/api/bigscreen');
    const d = await r.json();
    if (!d.ok) {
      box.innerHTML = '加载失败';
      return;
    }
    box.innerHTML = d.slots
      .map(
        (
          s
        ) => `<div class="card" style="display:flex;align-items:center;gap:10px;padding:10px 12px">
        <b style="width:64px">${s.label}</b>
        <span style="flex:1;opacity:.85;word-break:break-all">${s.file ? esc(s.file) + (s.hls ? ' <span style="opacity:.6">(HLS)</span>' : '') : '<span style="opacity:.45">空(不播放)</span>'}</span>
        ${s.file && !s.hls ? `<button class="btn-day" onclick="pvUrl('${s.src}','${(s.file || '').split('.').pop().toLowerCase()}')">预览</button>` : ''}
        ${s.file && s.hls ? `<span style="opacity:.5">HLS 流,不支持在线预览</span>` : ''}
        <button class="btn-day" onclick="uploadBigscreen('${s.slot}','${s.label}')">上传替换</button>
        ${s.file ? `<button class="btn-del" onclick="delBigscreen('${s.slot}','${s.label}')">清空</button>` : ''}
      </div>`
      )
      .join('');
  } catch (e) {
    box.innerHTML = '加载失败';
  }
}
function uploadBigscreen(slot, label) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'video/mp4,video/webm,video/x-matroska,.mp4,.webm,.m4v,.mov,.mkv,.m3u8';
  input.onchange = async function () {
    const f = input.files[0];
    if (!f) return;
    if (!(await confirmAsync('替换「' + label + '」的视频为 ' + f.name + ' ?'))) return;
    const btn = document.querySelector(`#bigscreen button[data-slot="${slot}"]`);
    try {
      const r = await adminFetch(
        '/api/admin/bigscreen/upload?slot=' + slot + '&name=' + encodeURIComponent(f.name) + tk(),
        { method: 'POST', body: f }
      );
      const d = await r.json();
      toast(d.ok ? '已上传: ' + f.name : d.error || '上传失败', d.ok ? 0 : 1);
    } catch (e) {
      toast('上传失败', 1);
    }
    loadBigscreen();
  };
  input.click();
}
async function delBigscreen(slot, label) {
  if (!(await confirmAsync('清空「' + label + '」的视频?'))) return;
  try {
    const r = await adminFetch('/api/admin/bigscreen/delete?slot=' + slot + tk(), {
      method: 'POST',
    });
    const d = await r.json();
    toast(d.ok ? '已清空' : d.error || '删除失败', d.ok ? 0 : 1);
  } catch (e) {
    toast('删除失败', 1);
  }
  loadBigscreen();
}
async function addCustomLink() {
  const name = $('clName').value.trim(),
    url = $('clUrl').value.trim();
  const icon = $('clIcon').value,
    model = $('clModel').value;
  if (!name || !url) {
    toast('名称和链接都要填', 1);
    return;
  }
  const r = await adminFetch('/api/admin/links' + tk(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'add', name, url, icon, model }),
  });
  const d = await r.json();
  if (r.ok) {
    toast('已添加');
    $('clName').value = '';
    $('clUrl').value = '';
    DATA.siteConfig.customLinks.push(d.item);
    loadDisplay();
  } else toast(d.error || '失败', 1);
}
function presetLink(name, url) {
  $('clName').value = name;
  $('clUrl').value = url;
}
async function delCustomLink(id) {
  const r = await adminFetch('/api/admin/links' + tk(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'del', id }),
  });
  if (r.ok) {
    DATA.siteConfig.customLinks = DATA.siteConfig.customLinks.filter((l) => l.id !== id);
    loadDisplay();
    toast('已删除');
  } else toast('失败', 1);
}
async function delUserLink(id) {
  const r = await adminFetch('/api/admin/links' + tk(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delUser', id }),
  });
  if (r.ok) {
    DATA.userLinks = DATA.userLinks.filter((l) => l.id !== id);
    loadDisplay();
    toast('已删除');
  } else toast('失败', 1);
}
async function toggleDemo(name, demo) {
  const r = await adminFetch('/api/admin/demo' + tk(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: name, demo }),
  });
  const d = await r.json();
  if (r.ok) {
    DATA.siteConfig.demoPhotos = d.demoPhotos;
    toast(demo ? '已设为演示' : '已取消演示');
    loadFiles();
  } else toast('失败', 1);
}
async function editCaption(name, old) {
  const c = prompt('编辑「' + name + '」的 AI 配文(留空删除):', old || '');
  if (c === null) return;
  const r = await adminFetch('/api/admin/caption' + tk(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: name, caption: c }),
  });
  if (r.ok) {
    if (DATA.photoCaptions) DATA.photoCaptions[name] = c;
    toast('配文已保存');
    loadFiles();
  } else toast('保存失败', 1);
}
function copyTxt(t) {
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject())
    .then(() => toast('已复制'))
    .catch(() => {
      prompt('手动复制:', t);
    });
}
// 带令牌头的下载(fetch x-token → blob → 本地保存),不再依赖 URL 参数存活,任何浏览器都不会"需要授权"
async function dl(url, filename) {
  try {
    const r = await adminFetch(url, { headers: { 'x-token': TOKEN } });
    if (!r.ok) {
      toast('下载失败:HTTP ' + r.status, 1);
      return;
    }
    const b = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = filename || url.split('/').pop().split('?')[0] || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('已开始下载');
  } catch (e) {
    toast('下载失败:' + e.message, 1);
  }
}
async function clearClicks() {
  if (!(await confirmAsync('确定清空全部链接点击记录?不可恢复!(建议先导出 Excel)'))) return;
  const r = await adminFetch('/api/admin/clicks/clear' + tk(), { method: 'POST' });
  if (r.ok) {
    DATA.linkClicks = [];
    loadDisplay();
    toast('已清空');
  } else toast('失败', 1);
}
// 导出 PDF:新开打印页(记录 + 答题全量 + 照片原图附录),浏览器「打印→另存为 PDF」
async function exportPdf() {
  const photos = await (await adminFetch('/api/files?dir=photos' + tk2())).json();
  const imgs = photos.photos || [];
  const clicks = DATA.linkClicks || [];
  const attempts = (await (await adminFetch('/api/admin/quiz' + tk())).json()).attempts || [];
  const w = window.open('', '_blank');
  const escH = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;');
  let html = `<html><head><meta charset="utf-8"><title>梦幻画廊数据档案</title>
  <style>body{font-family:'Microsoft YaHei';padding:24px;font-size:12px}h1{font-size:20px}h2{font-size:15px;margin-top:26px;border-bottom:1px solid #999;padding-bottom:4px}
  table{border-collapse:collapse;width:100%;margin-top:8px}td,th{border:1px solid #aaa;padding:4px 6px;text-align:left;vertical-align:top;word-break:break-all}
  .pg{page-break-before:always}.ph{text-align:center;margin-top:14px}.ph img{max-width:100%;max-height:520px;border:1px solid #ccc}
  .cap{color:#a60;font-size:13px;margin-top:6px}</style></head><body>
  <h1>梦幻画廊 · 数据档案(${new Date().toLocaleString('zh-CN', { hour12: false })})</h1>
  <h2>一、链接点击记录(${clicks.length} 条)</h2>
  <table><tr><th>时间</th><th>昵称</th><th>IP/归属</th><th>品牌</th><th>链接</th><th>URL</th><th>屏幕/平台</th><th>指纹</th></tr>
  ${clicks
    .map((c) => {
      const fp = c.fp || {};
      return `<tr><td>${new Date(c.t).toLocaleString('zh-CN', { hour12: false })}</td><td>${escH(c.name)}</td><td>${escH((c.ip || '').replace('::ffff:', ''))} ${escH(c.geo || '')}</td><td>${escH(c.brand)}</td><td>${escH(c.link)}</td><td>${escH(c.url)}</td><td>${escH(fp.scr || '')} ${escH(fp.platform || '')} ${fp.cores || ''}核</td><td>${escH(fp.canvas || '')}</td></tr>`;
    })
    .join('')}</table>
  <h2>二、答题全量记录(${attempts.length} 条)</h2>
  ${attempts
    .map(
      (
        a
      ) => `<table><tr><th colspan="2">${new Date(a.t).toLocaleString('zh-CN', { hour12: false })} · 总分 ${a.total} · 选择 ${a.mcScore}/81 · 问答 ${a.qaScore}/19(${a.qaBy === 'ai' ? 'AI' : '本地'})</th></tr>
    ${(a.fullReview || []).map((m, j) => `<tr><td style="width:70%">${j + 1}. ${escH(m.q || '')}<br>A.${escH(m.options && m.options.A)} B.${escH(m.options && m.options.B)} C.${escH(m.options && m.options.C)} D.${escH(m.options && m.options.D)}</td><td>选 ${escH(m.chosen)} / 正解 ${escH(m.correctLetter)} ${m.right ? '✓' : '✗'}</td></tr>`).join('')}
    <tr><td><b>问答题目:</b>${escH(a.qaQ || '')}<br><b>作答:</b>${escH((a.qaText || '').slice(0, 800))}</td><td><b>评语:</b>${escH(a.qaComment || '')}</td></tr></table>`
    )
    .join('')}
  <h2 class="pg">三、照片原图(上传照片 + 希沃白板画作,共 ${imgs.length} 张)</h2>
  ${imgs.map((f) => `<div class="ph"><img src="/admin-media/photos/${encodeURIComponent(f.name)}${tkq()}"><div>${escH(f.name)}</div>${DATA.photoCaptions && DATA.photoCaptions[f.name] ? `<div class="cap">✍ ${escH(DATA.photoCaptions[f.name])}</div>` : ''}</div>`).join('')}
  </body></html>`;
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 1500);
}

function calReset() {
  CAL_DATE = null;
  renderStats();
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
