// b612-full-debug.cjs — 合并版异常诊断(一次性)
const path = require('path');
const { launch } = require('./browser.js');
(async () => {
  const file = path.join(__dirname, '..', '..', 'dev', 'b612-opening-full.html');
  const url = 'file:///' + file.replace(/\\/g, '/');
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });
  page.on('pageerror', () => {});
  await page.goto(url);
  await page.click('#start');
  await page.waitForSelector('#choice.show', { timeout: 45000 });
  await page.click('#cBoa');
  await page.waitForFunction(() => document.body.classList.contains('act2'), null, { timeout: 60000 });
  console.log('act2 reached');
  await page.waitForTimeout(9000);
  const st = await page.evaluate(() => ({
    fly1: document.getElementById('tFly1').className,
    fly2: document.getElementById('tFly2').className,
    planeDomClass: document.getElementById('planeDom').className,
    canvasOpacity: getComputedStyle(document.getElementById('c')).opacity,
  }));
  console.log(JSON.stringify(st));
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
