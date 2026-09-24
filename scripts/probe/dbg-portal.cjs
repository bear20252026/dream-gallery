// dbg-portal.cjs — 临时调试:石门自动传送为何不触发(批3 回归排查)
const { launch } = require('./browser.js');
(async () => {
  const URL = process.env.PROBE_URL || 'http://localhost:5173';
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    for (const k of ['agreementConsented', 'privacyConsented', 'communityConsented'])
      sessionStorage.setItem(k, '1');
  });
  await page.goto(URL + '/?noopening&noprologue', { waitUntil: 'domcontentloaded' });
  // 闸门必须勾选+ENTER(无人点击则 60s 也不放行——gate 超时只管"闸门加载失败")
  await page.waitForSelector('#b612Gate', { timeout: 90000 });
  await page.check('#b612Gate #gAgreeChk');
  await page.click('#b612Gate .gEnter');
  await page.waitForFunction(() => window.__ctx && window.__ctx.player && window.__ctx.player.pl, { timeout: 90000 });
  await page.waitForTimeout(2000);
  const r = await page.evaluate(async () => {
    const log = [];
    const p = window.__ctx.player.pl.p;
    p.x = 0.1; p.z = 56;
    for (let i = 0; i < 12; i++) {
      await new Promise((res) => setTimeout(res, 500));
      log.push((window.__ctx.scene.activeWorld || 'main') + ' @' + p.x.toFixed(1) + ',' + p.z.toFixed(1));
      if (window.__ctx.scene.activeWorld && window.__ctx.scene.activeWorld !== 'main') break;
    }
    return { log, boot: window.__bootCheck, worldPhase: window.__worldPhase };
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('pageerrors:', errors.length ? errors : '无');
  await b.close();
})();
