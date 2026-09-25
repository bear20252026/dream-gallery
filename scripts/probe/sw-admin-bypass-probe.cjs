// sw-admin-bypass-probe.cjs — SW 对 /admin 系列绕过 + 导航网络优先 验收(2026-09-25)
// 背景:/admin 不带 .html,曾被 sw.js 当静态资源走 SWR,后台更新后主人首屏仍是旧
// admin.html(「报错反馈 文件不存在」久修不愈真凶);且 /admin?token= 整 URL 落盘。
// 断言:①SW 激活后旧池清空,只剩 VER 池;②VER 池里没有任何 /admin* 条目(绕过=永不缓存);
//       ③SW 控制下的 /admin 页面功能完好(报错 tab 可切可读)。
const { launch } = require('./browser.js');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ROOT = path.join(__dirname, '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'swbypass-'));
const PORT = process.env.SW_BYPASS_PORT || 3252;
const VER = 'gallery-v14'; // 与 public/sw.js 的 VER 同步;升版时这里要跟

function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        TOKEN: 'adminprobe',
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
  // 本地静态服务不映射 public/,临时把 sw.js 放到根(swcoped '/' 需要 /sw.js 可达)
  const swDst = path.join(ROOT, 'sw.js');
  const swSrc = path.join(ROOT, 'public', 'sw.js');
  fs.copyFileSync(swSrc, swDst);
  let child;
  let pass = 0, fail = 0;
  const ok = (name, cond, extra) => {
    if (cond) { pass++; console.log('  ✅ ' + name); }
    else { fail++; console.log('  ❌ ' + name + (extra ? ' → ' + extra : '')); }
  };
  try {
    child = await startServer(PORT);
    const BASE = 'http://localhost:' + PORT;
    const b = await launch();
    const page = await b.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

    // 1) 首次打开后台(无 SW),注册 SW 并等激活
    await page.goto(BASE + '/admin?token=adminprobe', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.evaluate(() => navigator.serviceWorker.register('/sw.js'));
    await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true), { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500); // install/activate/claim

    // 2) SW 控制下重开 /admin
    await page.goto(BASE + '/admin?token=adminprobe', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    const st = await page.evaluate(async () => {
      const keys = await caches.keys();
      const reqs = [];
      for (const k of keys) {
        const pool = await caches.open(k);
        for (const r of await pool.keys()) reqs.push(k + ' ' + new URL(r.url).pathname);
      }
      return {
        controlled: !!navigator.serviceWorker.controller,
        pools: keys,
        entries: reqs,
        hasSwitchTab: typeof window.switchTab === 'function',
      };
    });
    ok('A. 重开后页面已被 SW 控制', st.controlled);
    ok('B. 旧缓存池已清,只剩 ' + VER, st.pools.length === 1 && st.pools[0] === VER, JSON.stringify(st.pools));
    ok('C. 缓存池无任何 /admin* 条目(绕过=永不缓存,token 不落盘)',
      st.entries.every((e) => !e.split(' ')[1].startsWith('/admin')),
      JSON.stringify(st.entries));

    // 3) SW 控制下后台功能完好:切「报错反馈」tab 能读
    await page.evaluate(() => { const t = document.querySelector('.tab[data-tab="errors"]'); if (t) t.click(); });
    await page.waitForTimeout(2500);
    const tab = await page.evaluate(() => ({
      panel: (() => { const p = document.getElementById('tab-errors'); return p && p.style.display !== 'none'; })(),
      list: ((document.getElementById('errList') || {}).innerHTML || '').length,
      switchTab: typeof window.switchTab === 'function',
    }));
    ok('D. 后台脚本加载(switchTab 全局兜底)', tab.switchTab);
    ok('E. 报错 tab 可切换且 errList 有渲染', tab.panel && tab.list > 0);
    ok('F. 无 JS 未捕获异常', errors.length === 0, errors.slice(0, 2).join(' | '));

    await b.close();
  } finally {
    if (child) child.kill();
    try { fs.unlinkSync(swDst); } catch (e) {}
  }
  console.log('\n=== SW /admin 绕过验收:' + pass + ' 通过 / ' + fail + ' 失败 ===');
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('探针崩了: ' + e.message); process.exit(2); });
