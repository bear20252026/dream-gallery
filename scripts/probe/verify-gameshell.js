const { chromium } = require('playwright-core');
const fs = require('fs');
const URL = 'http://localhost:5174/';
const out = [];
const log = (s) => { out.push(s); console.log(s); };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGE_ERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE_ERR: ' + m.text()); });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);

  const exist = await page.evaluate(() => ({
    dialog: !!document.getElementById('gameDialog'),
    quest: !!document.getElementById('questHud'),
    menuBtn: !!document.getElementById('gsMenuBtn'),
    menu: !!document.getElementById('gameMenu'),
  }));
  log('DOM: ' + JSON.stringify(exist));

  // 触发昆仑开场(首点击)→ 应落入手绘对话框
  await page.mouse.click(20, 20);
  await page.waitForTimeout(1500);
  const dlg = await page.evaluate(() => {
    const d = document.getElementById('gameDialog');
    if (!d) return null;
    return { display: getComputedStyle(d).display, text: d.querySelector('.gs-text') ? d.querySelector('.gs-text').textContent : '', name: d.querySelector('.gs-name') ? d.querySelector('.gs-name').textContent : '' };
  });
  log('DIALOG_AFTER_CLICK: ' + JSON.stringify(dlg));

  // 任务栏进度文本
  const quest = await page.evaluate(() => {
    const q = document.getElementById('questHud');
    return q ? q.innerText.replace(/\n+/g, ' | ') : null;
  });
  log('QUEST_HUD: ' + quest);

  // 打开系统菜单
  await page.evaluate(() => { const b = document.getElementById('gsMenuBtn'); if (b) b.click(); });
  await page.waitForTimeout(600);
  const menu = await page.evaluate(() => {
    const m = document.getElementById('gameMenu');
    return m ? getComputedStyle(m).display : null;
  });
  log('MENU_DISPLAY: ' + menu);

  await page.screenshot({ path: 'debug-gameshell.png' });
  log('ERRORS: ' + (errors.length ? errors.join(' ;; ') : 'none'));
  await browser.close();
  fs.writeFileSync('verify-gameshell.log', out.join('\n'));
})().catch((e) => { console.log('FATAL: ' + e.message); process.exit(1); });
