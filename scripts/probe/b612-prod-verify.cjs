// b612-prod-verify.cjs — 生产部署验证(闸门→电影→跳过→游戏),一次性探针归档
// 用法: node scripts/probe/b612-prod-verify.cjs
const path = require('path');
const { launch } = require('./browser.js');

(async () => {
  const art = path.join(__dirname, '..', 'artifacts');
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto('https://cloudbear.cloud/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b612Gate', { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(art, 'prod-1-gate.png') });
  console.log('✓ 生产:入口闸门出现');

  // 协议可开可回
  await page.click('#b612Gate .gLegal a[data-doc="agreement.html"]');
  await page.waitForFunction(() => {
    const p = document.getElementById('panelOv');
    return p && p.style.display === 'flex';
  }, null, { timeout: 15000 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(art, 'prod-2-agreement.png') });
  const dateOk = await page.frameLocator('#panelFrame').locator('text=2026 年 9 月 6 日').first().isVisible();
  await page.frameLocator('#panelFrame').locator('button:has-text("‹ 返回")').click();
  await page.waitForFunction(() => {
    const g = document.getElementById('b612Gate');
    return g && getComputedStyle(g).opacity === '1';
  }, null, { timeout: 10000 });
  console.log('✓ 生产:用户协议可读(日期 2026-09-05 ' + (dateOk ? '已确认' : '未检出') + '),‹返回 回闸门');

  // ENTER → 电影(2026-09-06 起需先勾选同意框,勾选后 ENTER 才点亮)
  await page.click('#b612Gate #gAgreeChk');
  await page.click('#b612Gate .gEnter');
  await page.waitForFunction(() => !document.getElementById('b612Gate'), null, { timeout: 15000 });
  await page.waitForSelector('#b612film', { timeout: 20000 });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(art, 'prod-3-film.png') });
  console.log('✓ 生产:开幕电影开播');

  // skip 直落定
  await page.click('#b612film #fSkip');
  await page.waitForFunction(() => !document.getElementById('b612film'), null, { timeout: 20000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(art, 'prod-4-game.png') });
  console.log('✓ 生产:skip 落定,进入游戏本体');

  console.log(errors.length ? 'ERRORS(含既有噪音需人工甄别):\n' + errors.join('\n') : 'NO JS ERRORS');
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
