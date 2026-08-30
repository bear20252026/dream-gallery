// 复刻 test-mobile 环境诊断 posD 不更新
const { spawn } = require('child_process');
const path = require('path');
const { chromium, devices } = require('playwright-core');
const ROOT = path.join(__dirname, '..', '..');
(async () => {
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: '3221' }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 3000));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ ...devices['iPhone 12'] });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  page.on('response', (r) => { if (r.status() === 404) errs.push('404: ' + r.url()); });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push('CONSOLE-' + m.type() + ': ' + m.text().slice(0, 220)); });
  await page.goto('http://127.0.0.1:3221/?shaderdebug', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(10000);
  const st = await page.evaluate(() => ({
    posD: (document.getElementById('posD') || {}).textContent,
    errFiles: window.__errFiles,
    hasCtx: !!window.__ctx,
    hasGame: !!window.__gameState,
    canvases: document.querySelectorAll('canvas').length,
    lights: (() => { let n = 0; try { window.__ctx.scene.s.traverse((o) => { if (o.isLight) n++; }); } catch (e) { return 'err'; } return n; })(),
  }));
  console.log(JSON.stringify(st, null, 2));
  console.log('页面异常:', errs.length ? errs.slice(0, 3) : '无');
  await browser.close();
  child.kill();
})();
