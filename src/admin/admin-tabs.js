// admin-tabs.js — 报错反馈/一念墙/语音播放追踪三个独立 tab(2026-10-09 自 admin.js 切出,逐字迁移)
// 顶层 wiring 依赖 DOM 就绪(admin.html 的 module script 在 body 末尾),保持模块顶层执行。

import { tk, adminFetch, confirmAsync, $, esc, fmt, toast } from './admin-core.js';

// ===================== 报错反馈(2026-08-30) =====================
const TYPE_ICON = { js: '⚡', promise: '⏳', resource: '📦', webgl: '🖥', network: '🌐' };
const TYPE_NAME = {
  js: 'JS 异常',
  promise: 'Promise',
  resource: '资源',
  webgl: 'WebGL',
  network: '网络',
};
// ===================== 一念墙管理(2026-09-04) =====================
async function loadWishes() {
  try {
    const r = await adminFetch('/api/admin/wishes' + tk());
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || '加载失败');
    $('wishTotal').textContent = '共 ' + d.total + ' 念';
    const box = $('wishAdminList');
    box.innerHTML = '';
    if (!d.list.length) {
      box.innerHTML =
        '<div class="card" style="color:var(--muted)">墙还空着——还没有访客写过一念。</div>';
      return;
    }
    for (const w of d.list) {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.cssText = 'padding:10px 14px;margin-bottom:8px';
      const txt = document.createElement('div');
      txt.style.cssText = 'font-size:14px;word-break:break-all';
      txt.textContent = w.t;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;margin-top:6px';
      const meta = document.createElement('span');
      meta.style.cssText = 'color:var(--muted);font-size:12px';
      meta.textContent = w.n + ' · ' + fmt(w.ts);
      const del = document.createElement('button');
      del.className = 'btn-del';
      del.textContent = '删除';
      del.addEventListener('click', async function () {
        if (!(await confirmAsync('确定删除这条一念?'))) return;
        try {
          const rr = await adminFetch('/api/admin/wish' + tk(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'del', id: w.id }),
          });
          if (!rr.ok) throw new Error('删除失败');
          toast('已删除');
          loadWishes();
        } catch (e) {
          toast(e.message, true);
        }
      });
      row.appendChild(meta);
      row.appendChild(del);
      card.appendChild(txt);
      card.appendChild(row);
      box.appendChild(card);
    }
  } catch (e) {
    $('wishAdminList').innerHTML =
      '<div class="card" style="color:#c64545">加载失败: ' + esc(e.message) + '</div>';
  }
}
$('wishRefresh').addEventListener('click', loadWishes);

export async function loadErrors() {
  try {
    const type = $('errType').value;
    const q = $('errQ').value.trim();
    // token 已由 adminFetch 统一走 x-token 头,tk() 恒返空串;查询串必须自起 "?",
    // 再写 '+ tk() + "&type="' 会拼出 client-errors&type= 畸形 URL → 404(2026-09-25 血泪)
    const r = await adminFetch(
      '/api/admin/client-errors?type=' + encodeURIComponent(type) + '&q=' + encodeURIComponent(q)
    );
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || '加载失败');
    // 统计卡
    const cards = [
      ['总次数', d.total],
      ['独立错误', d.unique],
      ['近 24h', d.recent24],
    ];
    for (const [k, v] of Object.entries(d.byType || {})) cards.push([TYPE_NAME[k] || k, v]);
    $('errStats').innerHTML = cards
      .map(
        ([k, v]) =>
          `<div class="stat"><div class="stat-num">${v}</div><div class="stat-lab">${esc(k)}</div></div>`
      )
      .join('');
    // 列表
    if (!d.list.length) {
      $('errList').innerHTML =
        '<div class="card" style="color:var(--muted)">暂无报错 —— 访客端一切正常 🎉</div>';
      return;
    }
    $('errList').innerHTML = d.list
      .map((e) => {
        const ctxBits = [];
        if (e.viewMode !== undefined && e.viewMode !== null)
          ctxBits.push(e.viewMode === 1 ? '第三人称' : '第一人称');
        if (e.playerPos) ctxBits.push('位置(' + e.playerPos + ')');
        if (e.count > 1) ctxBits.push('×' + e.count + ' 次');
        return `<div class="card" style="padding:10px 14px">
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                  <span style="font-size:16px">${TYPE_ICON[e.type] || '•'}</span>
                  <b>${TYPE_NAME[e.type] || esc(e.type)}</b>
                  <span style="color:var(--muted);font-size:12px">${fmt(e.lastT)}</span>
                  ${ctxBits.map((x) => `<span style="font-size:11px;background:var(--surface-2,#eee);padding:2px 8px;border-radius:10px">${esc(x)}</span>`).join('')}
                </div>
                <div style="margin-top:6px;font-family:monospace;font-size:12px;word-break:break-all">${esc(e.message)}</div>
                ${e.source ? `<div style="color:var(--muted);font-size:11px;margin-top:4px;font-family:monospace">${esc(e.source)}${e.lineno ? ':' + e.lineno + ':' + e.colno : ''}</div>` : ''}
                ${e.stack ? `<details style="margin-top:6px"><summary style="cursor:pointer;font-size:12px;color:var(--muted)">堆栈</summary><pre style="font-size:11px;white-space:pre-wrap;word-break:break-all;background:var(--surface-2,#f4f4f4);padding:8px;border-radius:6px;margin:4px 0 0">${esc(e.stack)}</pre></details>` : ''}
                ${e.ua ? `<div style="color:var(--muted);font-size:11px;margin-top:4px">${esc(e.ua)}</div>` : ''}
              </div>`;
      })
      .join('');
  } catch (e) {
    $('errList').innerHTML =
      '<div class="card" style="color:#c64545">加载失败: ' + esc(e.message) + '</div>';
  }
}
$('errRefresh').addEventListener('click', loadErrors);
$('errType').addEventListener('change', loadErrors);
$('errClear').addEventListener('click', async function () {
  if (!(await confirmAsync('确定清空全部报错记录?此操作不可恢复'))) return;
  try {
    await adminFetch('/api/admin/client-errors/clear' + tk(), { method: 'POST' });
    toast('已清空');
    loadErrors();
  } catch (e) {
    toast('清空失败: ' + e.message, true);
  }
});
$('errQ').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loadErrors();
});

// ===================== 语音播放追踪(2026-09-26 主人令:播放过/错误/条数全记录) =====================
const TTS_EV_NAME = {
  speak: '发起朗读',
  ok: '开播成功',
  cut: '播一半被掐',
  fail: '播放失败',
  muted: '静音跳过',
  skip: '缓存未命中',
};
async function loadTtsStats() {
  try {
    const r = await adminFetch('/api/admin/tts-stats');
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || '加载失败');
    const c = d.counters || {};
    const cards = [
      ['发起朗读', c.speak || 0],
      ['开播成功', c.ok || 0],
      ['播一半被掐', c.cut || 0],
      ['播放失败', c.fail || 0],
      ['静音跳过', c.muted || 0],
      ['开播率', d.audibleRate == null ? '—' : d.audibleRate + '%'],
      ['近 24h', d.recent24 || 0],
    ];
    $('ttsStatsCards').innerHTML = cards
      .map(
        ([k, v]) =>
          `<div class="stat"><div class="stat-num">${v}</div><div class="stat-lab">${esc(k)}</div></div>`
      )
      .join('');
    if (!(d.list || []).length) {
      $('ttsStatsList').innerHTML =
        '<div class="card" style="color:var(--muted)">暂无记录 —— 进游戏触发一段剧情对话后点刷新</div>';
      return;
    }
    $('ttsStatsList').innerHTML = d.list
      .map((e) => {
        const color =
          e.ev === 'ok'
            ? 'var(--ok,#2a2)'
            : e.ev === 'fail'
              ? '#c64545'
              : e.ev === 'cut'
                ? '#b8860b'
                : 'var(--muted)';
        return `<div class="card" style="padding:8px 14px">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <b style="color:${color}">${TTS_EV_NAME[e.ev] || esc(e.ev)}</b>
            <span style="font-family:monospace;font-size:12px">${esc(e.text)}…</span>
            <span style="font-size:11px;color:var(--muted)">音色 ${esc(e.voice || '—')}</span>
            ${e.ms != null ? `<span style="font-size:11px;color:var(--muted)">起播 ${e.ms}ms</span>` : ''}
            ${e.err ? `<span style="font-size:11px;color:#c64545">${esc(e.err)}</span>` : ''}
            <span style="font-size:11px;color:var(--muted);margin-left:auto">${fmt(e.t)}</span>
          </div>
        </div>`;
      })
      .join('');
  } catch (e) {
    $('ttsStatsList').innerHTML =
      '<div class="card" style="color:#c64545">加载失败: ' + esc(e.message) + '</div>';
  }
}
$('ttsRefresh').addEventListener('click', loadTtsStats);
$('ttsClear').addEventListener('click', async function () {
  if (!(await confirmAsync('确定清空语音播放记录?此操作不可恢复'))) return;
  try {
    await adminFetch('/api/admin/tts-stats/clear' + tk(), { method: 'POST' });
    toast('已清空');
    loadTtsStats();
  } catch (e) {
    toast('清空失败: ' + e.message, true);
  }
});
