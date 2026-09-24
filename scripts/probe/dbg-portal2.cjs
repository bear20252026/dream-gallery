// dbg-portal2.cjs — 复刻 planets 探针完整流程,逐 500ms 记录世界状态(临时)
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { launch } = require('./browser.js');
const ROOT = path.join(__dirname, '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dbgpl-'));
const PORT = 3241;
function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port), GATE_DATA_FILE: path.join(TMP, 'gate_data.json') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => { if (d.toString().includes('服务器已启动')) resolve(child); });
    child.on('error', reject);
    setTimeout(() => reject(new Error('服务器启动超时')), 12000);
  });
}
(async () => {
  const child = await startServer(PORT);
  const base = 'http://localhost:' + PORT + '/';
  const b = await launch();
  const page = await b.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 120)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 120)); });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b612Gate', { timeout: 90000 });
  await page.check('#b612Gate #gAgreeChk');
  await page.click('#b612Gate .gEnter');
  await page.waitForSelector('#b612film', { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.click('#b612film #fSkip');
  await page.waitForFunction(() => !document.getElementById('b612film'), null, { timeout: 20000 });
  await page.waitForFunction(() => window.__ctx && window.__ctx.player && window.__ctx.player.pl, { timeout: 60000 }).catch(() => errors.push('pl 未就绪'));
  await page.waitForTimeout(3000);
  const r = await page.evaluate(async () => {
    const log = [];
    const pl = window.__ctx.player && window.__ctx.player.pl;
    if (!pl) return { fatal: 'no player.pl', phase: window.__worldPhase, boot: window.__bootCheck };
    const p = pl.p;
    p.x = 0.1; p.z = 56;
    for (let i = 0; i < 24; i++) {
      await new Promise((res) => setTimeout(res, 500));
      const w = window.__ctx.scene.activeWorld || 'main';
      const navs = [...document.querySelectorAll('#worldNav button')].map((x) => x.textContent);
      const navShow = (document.getElementById('worldNav') || {}).style;
      log.push(w + ' nav=' + (navShow && navShow.display) + JSON.stringify(navs));
      if (w !== 'main' && i > 6) break;
    }
    return { log, boot: window.__bootCheck, phase: window.__worldPhase };
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('errors:', errors.length ? errors.slice(0, 8) : '无');
  child.kill();
  await b.close();
})();
