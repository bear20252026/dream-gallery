// console-capture.cjs — 一次性诊断:抓正式站页面全过程的控制台报错(2026-09-24)
// 用途:主人问"报错为什么还在前台出现" —— 先抓到现场再对症。不修改任何行为。
const { launch } = require('./browser.js');
(async () => {
  const URL = process.env.PROBE_URL || 'http://localhost:5173';
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const logs = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning')
      logs.push(`[console.${m.type()}] ${m.text().slice(0, 300)}`);
  });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message.slice(0, 300)}`));
  page.on('requestfailed', (r) =>
    logs.push(`[requestfailed] ${r.url().slice(0, 160)} ← ${r.failure() && r.failure().errorText}`)
  );
  page.on('response', (r) => {
    if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url().slice(0, 160)}`);
  });
  await page.addInitScript(() => {
    for (const k of ['agreementConsented', 'privacyConsented', 'communityConsented'])
      sessionStorage.setItem(k, '1');
  });
  await page.goto(URL + '/?noopening&noprologue', { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForSelector('#b612Gate', { timeout: 60000 });
    await page.check('#b612Gate #gAgreeChk');
    await page.click('#b612Gate .gEnter');
  } catch (e) {
    logs.push('[probe] 闸门阶段异常: ' + e.message.slice(0, 200));
  }
  try {
    await page.waitForFunction(
      () => window.__bootCheck && window.__bootCheck.ok === true,
      null,
      { timeout: 120000 }
    );
    logs.push('[probe] 世界就绪,再静置 15s 收尾');
    await page.waitForTimeout(15000);
  } catch (e) {
    logs.push('[probe] 进世界超时: ' + e.message.slice(0, 200));
    await page.waitForTimeout(5000);
  }
  console.log(`=== 共 ${logs.length} 条 error/warn/失败 ===`);
  const seen = new Map();
  for (const l of logs) seen.set(l, (seen.get(l) || 0) + 1);
  for (const [l, n] of seen) console.log((n > 1 ? `x${n} ` : '') + l);
  await b.close();
})();
