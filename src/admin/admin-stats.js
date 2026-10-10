// admin-stats.js — 统计页(30 天柱状图 + 日历 + 时段访问榜;2026-10-10 admin 第二阶段切出,逐字迁移)
// RANGE/CAL_DATE 状态经 admin-state.js live binding 读;写入走 setter(重绑点收拢)。
import { $, esc, fmt, day0, todayStr, brandIcon, brandShow } from './admin-core.js';
import { DATA, RANGE, CAL_DATE, setCalDate, setRangeValue } from './admin-state.js';

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
function statCards(arr) {
  return arr
    .map(
      ([n, l]) => `<div class="stat"><div class="num">${n}</div><div class="label">${l}</div></div>`
    )
    .join('');
}
export function renderStats() {
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
export function calMonth(delta) {
  var d = new Date(CAL_DATE || Date.now());
  d.setMonth(d.getMonth() + delta);
  setCalDate(d.getTime());
  renderStats();
}
export function calDay(t) {
  setCalDate(t);
  setRange('custom');
}
export function setRange(r, btn) {
  setRangeValue(r);
  setCalDate(r === 'custom' ? CAL_DATE : null);
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

export function calReset() {
  setCalDate(null);
  renderStats();
}
