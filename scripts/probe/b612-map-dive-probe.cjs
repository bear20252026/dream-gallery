// b612-map-dive-probe.cjs — 古地图俯冲真样截图自验(一次性探针,归档备查)
// 用法: node scripts/probe/b612-map-dive-probe.cjs
const path = require('path');
const { launch } = require('./browser.js');

(async () => {
  const file = path.join(__dirname, '..', '..', 'dev', 'b612-map-dive-sample.html');
  const url = 'file:///' + file.replace(/\\/g, '/');
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const art = path.join(__dirname, '..', 'artifacts');

  await page.goto(url);
  await page.click('#start');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(art, 'b612-dive-1-high.png') });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(art, 'b612-dive-2-mid.png') });
  await page.waitForTimeout(7000);
  await page.screenshot({ path: path.join(art, 'b612-dive-3-low.png') });
  await page.waitForSelector('#replay', { timeout: 25000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(art, 'b612-dive-4-land.png') });
  console.log('PASS: 俯冲全流程跑通(高空→穿越→落地→尘埃)');
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO JS ERRORS');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
