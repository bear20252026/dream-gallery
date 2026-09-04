// b612-opening-sample-probe.cjs — 开幕手绘小样截图自验(一次性探针,归档备查)
// 用法: node scripts/probe/b612-opening-sample-probe.cjs
const path = require('path');
const { launch } = require('./browser.js');

(async () => {
  const file = path.join(__dirname, '..', '..', 'dev', 'b612-opening-sample.html');
  const url = 'file:///' + file.replace(/\\/g, '/');
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(url);
  await page.click('#start');
  await page.waitForSelector('#choice.show', { timeout: 30000 });
  await page.screenshot({ path: path.join(__dirname, '..', 'artifacts', 'b612-sample-1-hat.png') });
  await page.click('#cBoa');
  await page.waitForSelector('#tMind.show', { timeout: 40000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(__dirname, '..', 'artifacts', 'b612-sample-2-elephant.png') });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(__dirname, '..', 'artifacts', 'b612-sample-4-fold.png') });
  await page.waitForSelector('#tFly2.show', { timeout: 40000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(__dirname, '..', 'artifacts', 'b612-sample-3-plane.png') });
  await page.waitForSelector('#replay', { timeout: 20000 });
  console.log('PASS: 全流程跑通(帽子→选择→大象→折纸→尾字)');
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO JS ERRORS');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
