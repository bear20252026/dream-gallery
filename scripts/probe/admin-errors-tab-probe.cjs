// admin-errors-tab-probe.cjs — 后台「报错反馈」tab 实测探针(2026-09-25 排查主人报"后台看不到报错")
// 用法: ADMIN_TOKEN=<token> [BASE_URL=https://cloudbear.cloud/] node scripts/probe/admin-errors-tab-probe.cjs
// 流程:打开 /admin?token= → 点「报错反馈」tab → 等 loadErrors 完成 → 抓 pageerror/4xx + dump errList/errStats + 截图
const { launch, BASE_URL } = require('./browser.js');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.ADMIN_TOKEN || '';
const OUT = path.join(__dirname, 'admin-errors-tab-shot.png');

(async () => {
  if (!TOKEN) { console.log('❌ 缺 ADMIN_TOKEN 环境变量'); process.exit(2); }
  const b = await launch();
  const page = await b.newPage({ viewport: { width: 1360, height: 900 } });
  const problems = [];
  page.on('pageerror', (e) => problems.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push('console.error: ' + m.text().slice(0, 160));
  });
  page.on('response', (r) => { if (r.status() >= 400) problems.push('HTTP_' + r.status() + ': ' + r.url()); });

  await page.goto(BASE_URL + 'admin?token=' + encodeURIComponent(TOKEN), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  const before = await page.evaluate(() => ({
    tabs: [...document.querySelectorAll('.tab')].map((t) => t.dataset.tab),
    hasPanel: !!document.getElementById('tab-errors'),
    hasErrList: !!document.getElementById('errList'),
  }));
  console.log('tabs=' + JSON.stringify(before.tabs) + ' panel=' + before.hasPanel + ' errList=' + before.hasErrList);

  await page.evaluate(() => {
    const btn = document.querySelector('.tab[data-tab="errors"]');
    if (btn) btn.click();
  });
  await page.waitForTimeout(4000); // switchTab 里 setTimeout(loadFn,200) + fetch 往返

  const after = await page.evaluate(() => ({
    panelVisible: (() => { const p = document.getElementById('tab-errors'); return p && p.style.display !== 'none'; })(),
    tabActive: !!document.querySelector('.tab[data-tab="errors"].active'),
    stats: (document.getElementById('errStats') || {}).textContent || '(空)',
    listHead: ((document.getElementById('errList') || {}).innerHTML || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300),
    listCards: document.querySelectorAll('#errList .card').length,
  }));
  console.log('panelVisible=' + after.panelVisible + ' tabActive=' + after.tabActive);
  console.log('stats: ' + after.stats.slice(0, 200));
  console.log('listCards=' + after.listCards);
  console.log('listHead: ' + after.listHead);

  await page.screenshot({ path: OUT, fullPage: false });
  console.log('截图: ' + OUT);

  const realProblems = problems.filter((p) => !/Failed to load resource|404/.test(p) || /client-errors/.test(p));
  console.log('\n问题清单(' + realProblems.length + '):');
  realProblems.slice(0, 10).forEach((p) => console.log('  ' + p));
  if (!realProblems.length) console.log('  (无)');

  await b.close();
  const pass = after.panelVisible && after.tabActive && after.listCards > 0 && realProblems.length === 0;
  console.log('\n=== 报错反馈 tab 实测:' + (pass ? '✅ 正常渲染' : '❌ 异常') + ' ===');
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error('探针崩了: ' + e.message); process.exit(2); });
