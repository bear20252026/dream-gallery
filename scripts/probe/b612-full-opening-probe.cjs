// b612-full-opening-probe.cjs — 合并开幕全流程自验(正播+跳过双场景,一次性探针归档)
const path = require('path');
const { launch } = require('./browser.js');

(async () => {
  const file = path.join(__dirname, '..', '..', 'dev', 'b612-opening-full.html');
  const url = 'file:///' + file.replace(/\\/g, '/');
  const art = path.join(__dirname, '..', 'artifacts');
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  // ---- 场景一:完整正播 ----
  await page.goto(url);
  await page.click('#start');
  await page.waitForSelector('#choice.show', { timeout: 45000 });
  await page.screenshot({ path: path.join(art, 'b612-full-1-hat.png') });
  await page.click('#cBoa');
  await page.waitForSelector('#tMind.show', { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(art, 'b612-full-2-elephant.png') });
  await page.waitForFunction(() => document.body.classList.contains('act2'), null, { timeout: 40000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(art, 'b612-full-3-seam.png') });
  await page.waitForSelector('#tFly2.ftshow', { timeout: 30000 });
  await page.waitForTimeout(4500);
  await page.screenshot({ path: path.join(art, 'b612-full-4-dive.png') });
  await page.waitForSelector('#replay', { timeout: 60000 });
  await page.waitForTimeout(4500);
  await page.screenshot({ path: path.join(art, 'b612-full-5-land.png') });
  console.log('PASS 正播: 画帽→选择→大象→折纸→交接→俯冲→落地→推镜');

  // ---- 场景二:skip 跳过 ----
  await page.goto(url);
  await page.click('#start');
  await page.waitForTimeout(3000);
  await page.click('#skip');
  await page.waitForSelector('#replay', { timeout: 10000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(art, 'b612-full-6-skip.png') });
  console.log('PASS 跳过: skip 直落定(木牌+尾字+replay)');

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO JS ERRORS');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
