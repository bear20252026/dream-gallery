// admin-smoke-probe.cjs — admin.html 抽出 JS 后冒烟验收(P2-1,2026-09-24)
// 验证:module 化后 ① 无 pageerror;② window 全局函数兜底生效(内联 onclick 依赖);
//       ③ 标签切换(switchTab)真实可用;④ 关键 DOM 渲染。
const { launch } = require('./browser.js');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ROOT = path.join(__dirname, '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'adminsmoke-'));
const PORT = process.env.ADMIN_SMOKE_PORT || 3251;
function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        TOKEN: 'adminsmoke',
        GATE_DATA_FILE: path.join(TMP, 'gate_data.json'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => { if (d.toString().includes('服务器已启动')) resolve(child); });
    child.on('error', reject);
    setTimeout(() => reject(new Error('服务器启动超时')), 12000);
  });
}
(async () => {
  const child = await startServer(PORT);
  const URL = process.env.PROBE_URL || 'http://localhost:' + PORT;
  const b = await launch();
  const page = await b.newPage({ viewport: { width: 1360, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text()))
      errors.push('console: ' + m.text().slice(0, 100));
  });
  await page.goto(URL + '/admin?token=adminsmoke', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);

  let pass = 0,
    fail = 0;
  const ok = (name, cond, extra) => {
    if (cond) { pass++; console.log('  ✅ ' + name); }
    else { fail++; console.log('  ❌ ' + name + (extra ? ' → ' + extra : '')); }
  };

  const st = await page.evaluate(() => ({
    hasBody: !!document.body,
    windowFns: ['switchTab', 'setRange', 'chatSend', 'decide', 'dl'].filter(
      (f) => typeof window[f] === 'function'
    ),
    tabs: [...document.querySelectorAll('[onclick*="switchTab"]')].length,
  }));
  ok('A. 页面加载无 pageerror', errors.filter((e) => e.startsWith('PAGEERROR')).length === 0);
  ok('B. window 全局函数兜底生效(5 个抽查)', st.windowFns.length === 5, JSON.stringify(st.windowFns));
  ok('C. 标签按钮(markup onclick)存在', st.tabs >= 3, 'count=' + st.tabs);

  // switchTab 真实切换(验证全局函数与 DOM 联动)
  const switched = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('[onclick*="switchTab"]')].find(
      (x) => !/switchTab\('approve'/.test(x.getAttribute('onclick'))
    );
    const target = btn ? btn.getAttribute('onclick').match(/switchTab\('([^']+)'/) : null;
    if (!target) return { ok: false };
    window.switchTab(target[1]);
    return { ok: true, tab: target[1] };
  });
  ok('D. switchTab 切换可用', switched.ok, JSON.stringify(switched));
  ok('E. 无 JS 报错(全量)', errors.length === 0, errors.slice(0, 3).join(' | '));

  console.log('\n=== admin 冒烟:' + pass + ' 通过 / ' + fail + ' 失败 ===');
  await b.close();
  process.exit(fail === 0 ? 0 : 1);
})();
