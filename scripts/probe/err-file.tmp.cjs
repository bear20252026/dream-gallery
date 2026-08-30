const { spawn } = require('child_process');
const path = require('path');
const { chromium, devices } = require('playwright-core');
const ROOT = path.join(__dirname, '..', '..');
(async () => {
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: '3222' }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 3000));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ ...devices['iPhone 12'] });
  await ctx.addInitScript(() => {
    window.__errs = [];
    window.addEventListener('error', (e) => {
      window.__errs.push({ msg: String(e.message).slice(0, 100), file: e.filename, line: e.lineno, col: e.colno });
    }, true);
  });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:3222/?shaderdebug', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(9000);
  console.log(JSON.stringify(await page.evaluate(() => window.__errs), null, 1));
  await browser.close();
  child.kill();
})();
