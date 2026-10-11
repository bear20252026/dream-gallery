// admin-ai.js — AI 用量统计分区(2026-10-12 外部审计 P2:统一用量统计的后台口径)
// 数据源:GET /api/admin/ai-usage(lib/aiusage.js 台账的只读汇总;x-token 头由 adminFetch 统一带)。
// 看什么:近 14 天每天各能力的调用数/成功率/平均耗时/token 合计/各通道命中占比 + 最近 50 条调用。
// 口径(必须写在页面上,主人一眼能看见,免得被当成第二套配额):
//   ① 纯观测 —— 本页不参与也不改变任何限流/配额;2026-09-24 主人明令拆除的「按设备日配额」没有复活;
//   ② 台账不含任何文本内容(无 prompt/台词/照片名),所以这里也永远不会显示用户文本;
//   ③ tokens=0 有两种含义:该通道不回 usage 字段,或本来就是本地引擎(edge-tts)——见「通道」表的判定。
// ⚠️ 本分区不写内联 onclick:函数一律 addEventListener 接线(admin.js 里模板引用的名字必须活到 window,
//   构建期不报错、运行期静默死是本项目记录过的坑),用户数据进 HTML 一律 esc(),进 JS 字符串一律 j()。
// ⚠️ admin.html 的 tab markup 本次未改(不在可改文件内)→ tab 按钮与面板由本模块在运行时注入;
//   日后主代理把 markup 补进 admin.html 时,本模块的注入会自动跳过(先判 id 是否已存在)。

import { adminFetch, $, esc, fmt, toast } from './admin-core.js';

const CAPS = ['vision', 'tts', 'tts-batch', 'quiz-ai', 'chat-bot'];
const CAP_NAME = {
  vision: '🖼 看图配文',
  tts: '🔊 台词合成',
  'tts-batch': '🍲 批量预合成',
  'quiz-ai': '📝 答题 AI 阅卷',
  'chat-bot': '🏮 昆仑之灵召唤',
};
const DAYS_BACK = 14;

function pct(part, total) {
  return total ? Math.round((part / total) * 100) + '%' : '—';
}
function num(v) {
  return Number(v || 0).toLocaleString('zh-CN');
}
function ms(v) {
  const n = Number(v || 0);
  return n >= 1000 ? (n / 1000).toFixed(1) + 's' : n + 'ms';
}
function cards(arr) {
  return arr
    .map(
      ([n, l]) =>
        `<div class="stat"><div class="num">${n}</div><div class="label">${esc(l)}</div></div>`
    )
    .join('');
}
// 能力名查表:只认自有属性(防 cap='constructor' 之类把原型方法插进 HTML)
function capName(c) {
  return Object.prototype.hasOwnProperty.call(CAP_NAME, c) ? CAP_NAME[c] : esc(c || '?');
}
// 写 DOM 一律走 put/putText:目标 id 不在就安静跳过。
// 后台模板与运行时注入两条路都可能没有某个节点,而"构建期不报错、运行期静默死"是本项目记录过的坑——
// 这里要的是"少显示一块",绝不是 loadAiUsage 半路抛异常把整页数据卡死。
function put(id, html) {
  const el = $(id);
  if (el) el.innerHTML = html;
}
function putText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

// ---------- 运行时挂载(见文件头 ⚠️) ----------
function mountAiTab() {
  const bar = document.querySelector('.tabs');
  if (bar && !bar.querySelector('[data-tab="ai"]')) {
    const t = document.createElement('div');
    t.className = 'tab';
    t.dataset.tab = 'ai';
    t.textContent = 'AI 用量';
    t.addEventListener('click', function () {
      if (typeof window.switchTab === 'function') window.switchTab('ai');
    });
    bar.appendChild(t);
  }
  if (document.getElementById('tab-ai')) return;
  const p = document.createElement('div');
  p.id = 'tab-ai';
  p.style.display = 'none';
  // 骨架里全是本模块写死的字面量,没有一处用户数据。
  // 面板挂在 body 下(与 #tab-errors/#tab-ttsstats 同一层),所以自带 .wrap 保持 1100px 居中版式。
  p.innerHTML = `<div class="wrap">
    <div class="section-title">🧮 AI 用量统计(全站 AI 调用台账:能力 × 通道 × 耗时 × token)</div>
    <div class="card" style="padding:10px 14px;margin-bottom:10px;font-size:12px;color:var(--muted)">
      纯观测页:本页不拦截任何请求,也不改变任何限流/配额(按设备日配额 2026-09-24 已由主人拆除)。
      台账只记 <b>能力/通道/模型/耗时/成败/token/错误类别</b>,<b>不含任何文本内容</b>(无 prompt、无台词、无照片名)。
      落盘按 5 秒窗口 / 20 条合并,所以「在途未落盘」为非零是正常形态,不是丢数。
      token 合计为 0 通常意味着<b>该通道不回 usage 字段</b>(不是没消耗)。
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 0">
      <button class="btn-day" id="aiRefresh" style="padding:7px 12px">刷新</button>
      <span id="aiStamp" style="font-size:12px;color:var(--muted)">尚未加载</span>
    </div>
    <div class="stats" id="aiCards"></div>
    <div class="section-title">通道命中(本进程累计,token 恒 0 = 该通道不回报用量)</div>
    <div id="aiChannels"></div>
    <div class="section-title">近 ${DAYS_BACK} 天 × 能力明细</div>
    <div id="aiDays"></div>
    <div class="section-title">最近调用(台账只留 50 条)</div>
    <div id="aiRecent"></div>
  </div>`;
  document.body.appendChild(p);
  const btn = $('aiRefresh');
  if (btn) btn.addEventListener('click', loadAiUsage);
}

// ---------- 渲染 ----------
function renderChannels(list) {
  if (!list || !list.length) {
    put('aiChannels', '<div class="empty">本进程还没有 AI 调用记录(台账按进程滚动)</div>');
    return;
  }
  const total = list.reduce((s, x) => s + (x.calls || 0), 0);
  const rows = list
    .map(
      (x) => `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid rgba(0,0,0,.08);font-family:monospace">${esc(x.ch)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid rgba(0,0,0,.08)">${num(x.calls)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid rgba(0,0,0,.08)">${pct(x.calls, total)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid rgba(0,0,0,.08);color:${x.ok === x.calls ? '#16a34a' : '#b45309'}">${pct(x.ok, x.calls)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid rgba(0,0,0,.08)">${num(x.tokens)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid rgba(0,0,0,.08);color:${x.tokens ? '#16a34a' : 'var(--muted)'}">${x.tokens ? '平均 ' + num(x.avgTok) + '/次' : '不回 token'}</td>
      </tr>`
    )
    .join('');
  put(
    'aiChannels',
    `<div class="card" style="padding:6px 10px;overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="text-align:left;color:var(--muted)">
        <th style="padding:6px 10px">通道</th><th style="padding:6px 10px">调用</th><th style="padding:6px 10px">占比</th>
        <th style="padding:6px 10px">成功率</th><th style="padding:6px 10px">token 合计</th><th style="padding:6px 10px">用量回报</th>
      </tr></thead><tbody>${rows}</tbody></table></div>`
  );
}

// 日界以服务端为准(台账最多就 14 天):倒序取服务端回来的天,浏览器时区不同也不会错位
function renderDays(days) {
  const keys = Object.keys(days || {})
    .sort()
    .reverse()
    .slice(0, DAYS_BACK);
  const out = [];
  for (const key of keys) {
    const byCap = days[key] || {};
    const caps = CAPS.filter((c) => byCap[c] && byCap[c].calls);
    if (!caps.length) continue; // 没调用的日子不占屏(全空时下面给 empty 提示)
    const dayTotal = caps.reduce((s, c) => s + byCap[c].calls, 0);
    const rows = caps
      .map((c) => {
        const x = byCap[c];
        const chBits = Object.entries(x.byChannel || {})
          .sort((a, b) => b[1] - a[1])
          .map(([ch, n]) => `${esc(ch)} ${num(n)}(${pct(n, x.calls)})`)
          .join(' · ');
        return `<tr>
          <td style="padding:5px 10px;border-bottom:1px solid rgba(0,0,0,.06)">${capName(c)}</td>
          <td style="padding:5px 10px;border-bottom:1px solid rgba(0,0,0,.06)">${num(x.calls)}</td>
          <td style="padding:5px 10px;border-bottom:1px solid rgba(0,0,0,.06);color:${x.rate == null ? 'var(--muted)' : x.rate >= 90 ? '#16a34a' : x.rate >= 60 ? '#b45309' : '#c64545'}">${x.rate == null ? '—' : esc(num(x.rate) + '%')}</td>
          <td style="padding:5px 10px;border-bottom:1px solid rgba(0,0,0,.06)">${x.fail ? '<b style="color:#c64545">' + num(x.fail) + '</b>' : '0'}</td>
          <td style="padding:5px 10px;border-bottom:1px solid rgba(0,0,0,.06)">${ms(x.avgMs)}</td>
          <td style="padding:5px 10px;border-bottom:1px solid rgba(0,0,0,.06)">${num(x.tokens)}</td>
          <td style="padding:5px 10px;border-bottom:1px solid rgba(0,0,0,.06);font-family:monospace;font-size:11px">${chBits || '—'}</td>
        </tr>`;
      })
      .join('');
    out.push(`<div class="card" style="padding:8px 10px;margin-bottom:8px;overflow-x:auto">
      <div style="font-weight:700;margin-bottom:4px">${esc(key)} <span style="color:var(--muted);font-weight:400">共 ${num(dayTotal)} 次调用</span></div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="text-align:left;color:var(--muted)">
          <th style="padding:4px 10px">能力</th><th style="padding:4px 10px">调用</th><th style="padding:4px 10px">成功率</th>
          <th style="padding:4px 10px">失败</th><th style="padding:4px 10px">平均耗时</th><th style="padding:4px 10px">token</th><th style="padding:4px 10px">通道命中占比</th>
        </tr></thead><tbody>${rows}</tbody></table></div>`);
  }
  put(
    'aiDays',
    out.join('') || '<div class="empty">近 ' + DAYS_BACK + ' 天没有任何 AI 调用记录</div>'
  );
}

function renderRecent(list) {
  if (!list || !list.length) {
    put('aiRecent', '<div class="empty">暂无调用</div>');
    return;
  }
  put(
    'aiRecent',
    list
      .map((r) => {
        const bits = [
          r.ms != null ? ms(r.ms) : '',
          r.tok ? num(r.tok) + ' tokens' : '0 tokens',
          r.model || '',
          r.err ? '错误 ' + r.err : '',
        ].filter(Boolean);
        return `<div class="card" style="padding:7px 14px">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px">
          <b style="color:${r.ok ? '#16a34a' : '#c64545'}">${r.ok ? '成功' : '失败'}</b>
          <span>${capName(r.cap)}</span>
          <span style="font-family:monospace">${esc(r.ch || '?')}</span>
          ${bits.map((b) => `<span style="background:var(--surface-2,#eee);padding:2px 8px;border-radius:10px">${esc(b)}</span>`).join('')}
          <span style="margin-left:auto;color:var(--muted)">${fmt(r.t)}</span>
        </div>
      </div>`;
      })
      .join('')
  );
}

export async function loadAiUsage() {
  try {
    const r = await adminFetch('/api/admin/ai-usage');
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || '服务返回 ' + r.status);
    const t = d.totals || {};
    put(
      'aiCards',
      cards([
        [num(t.calls), '近 ' + DAYS_BACK + ' 天调用'],
        [t.rate == null ? '—' : num(t.rate) + '%', '成功率'],
        [ms(t.avgMs), '平均耗时'],
        [num(t.tokens), 'token 合计'],
        [num(t.fail), '失败次数'],
        [num(d.pending), '在途未落盘'],
        [num(d.saves), '台账落盘次数'],
      ])
    );
    putText(
      'aiStamp',
      '数据时间 ' +
        new Date(d.now || Date.now()).toLocaleTimeString('zh-CN', { hour12: false }) +
        ' · 窗口 天≤' +
        (d.daysMax || DAYS_BACK) +
        ' / 明细≤' +
        (d.recentMax || 50) +
        ' · 合并 ' +
        (d.flushMs || 5000) +
        'ms / ' +
        (d.flushBatch || 20) +
        ' 条'
    );
    renderChannels(d.channels);
    renderDays(d.days);
    renderRecent(d.recent);
  } catch (e) {
    // 后台页不走访客静默铁律:失败必须页内可见(2026-10-09 空 catch 治理口径)
    put('aiCards', '');
    put('aiChannels', '');
    put('aiDays', '');
    put(
      'aiRecent',
      '<div class="card" style="color:#c64545">加载失败: ' + esc(e.message) + '</div>'
    );
    toast('AI 用量加载失败: ' + e.message, true);
  }
}

mountAiTab();
