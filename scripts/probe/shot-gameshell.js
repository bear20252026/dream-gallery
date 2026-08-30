const { chromium } = require('playwright-core');
const URL = 'http://localhost:5174/';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  // 触发开场昆仑台词 → 手绘对话框
  await page.mouse.click(20, 20);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'gameshell-dialog.png' });
  // 再开系统菜单
  await page.evaluate(() => { const b = document.getElementById('gsMenuBtn'); if (b) b.click(); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'gameshell-menu.png' });
  await browser.close();
  console.log('shots saved');
})().catch((e) => { console.log('FATAL: ' + e.message); process.exit(1); });
