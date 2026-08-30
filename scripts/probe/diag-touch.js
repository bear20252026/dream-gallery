// 完整用户路径复现:触屏模式(用户截图是触屏 UI),抓失败资源 + 逐帧异常 + 输入实测
const { chromium } = require('playwright-core');
const URL = 'https://cloudbear.cloud/';

(async () => {
  const b = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const ctx = await b.newContext({
    viewport: { width: 1280, height: 800 },
    hasTouch: true, // 模拟触屏设备(用户截图为触屏 UI)
  });
  await ctx.addInitScript(() => {
    try {
      sessionStorage.setItem('agreementConsented', '1');
      sessionStorage.setItem('privacyConsented', '1');
      sessionStorage.setItem('communityConsented', '1');
      sessionStorage.setItem('nickPopOff', '1');
    } catch (e) {}
  });
  const page = await ctx.newPage();
  const errs = [];
  const failed = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 250)));
  page.on('requestfailed', (r) => failed.push('FAIL: ' + r.url().slice(0, 120) + ' :: ' + (r.failure() && r.failure().errorText)));
  page.on('response', (r) => { if (r.status() >= 400) failed.push('HTTP' + r.status() + ': ' + r.url().slice(0, 120)); });
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 180)); });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);
  await page.mouse.click(640, 400);
  await page.waitForTimeout(2500);
  // 跳过开屏
  await page.evaluate(() => {
    const el = document.getElementById('openingOv');
    if (el) el.remove();
  });
  await page.waitForTimeout(1500);

  // 检查答题门/弹窗并点掉
  for (let round = 0; round < 8; round++) {
    const clicked = await page.evaluate(() => {
      const kws = ['先逛逛', '跳过', '关闭', '稍后再说', '暂不', '取消', '进入画廊'];
      const btns = [...document.querySelectorAll('button, .btn')].filter((x) => {
        if (x.id === 'viewBtn') return false;
        const t = (x.textContent || '').trim();
        return t && kws.some((k) => t.includes(k)) && x.offsetParent !== null;
      });
      if (btns.length) { btns[0].click(); return btns[0].textContent.trim().slice(0, 12); }
      return null;
    });
    if (!clicked) break;
    console.log('  点掉:', clicked);
    await page.waitForTimeout(1300);
  }

  // 切第三人称
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true }));
  });
  for (let i = 0; i < 45; i++) {
    await page.waitForTimeout(1000);
    if (await page.evaluate(() => !!window.__avatarLoaded)) break;
  }
  await page.waitForTimeout(2500);
  console.log('viewMode:', await page.evaluate(() => window.__ctx.player.viewMode), '| 模型:', await page.evaluate(() => !!window.__avatarLoaded));

  // ---- 触屏摇杆移动实测(左半屏 touch drag)----
  const t1 = await page.evaluate(() => window.__ctx.player.pl.p.toArray().map((n) => +n.toFixed(2)));
  await page.touchscreen.tap(320, 400); // 触发 touch 环境
  // 用 CDP 触摸拖拽模拟摇杆:从摇杆底盘向下滑
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 60, y: 730, id: 1 }] });
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 60, y: 730 - i * 8, id: 1 }] });
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(800);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
  const t2 = await page.evaluate(() => ({
    p: window.__ctx.player.pl.p.toArray().map((n) => +n.toFixed(2)),
    jD: { ...window.__ctx.player.jD },
    sm: window.__ctx._playerSM.current ? window.__ctx._playerSM.current.name : 'NO',
  }));
  console.log('【触屏摇杆】before=', JSON.stringify(t1), 'after=', JSON.stringify(t2));

  // ---- 触屏右半屏拖拽转视角 ----
  const y1 = await page.evaluate(() => +window.__ctx.player.pl.y.toFixed(3));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 900, y: 400, id: 2 }] });
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 900 + i * 15, y: 400, id: 2 }] });
    await page.waitForTimeout(100);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const y2 = await page.evaluate(() => +window.__ctx.player.pl.y.toFixed(3));
  console.log('【触屏视角】y:', y1, '→', y2, 'delta=', (y2 - y1).toFixed(3));

  console.log('\n【失败请求】');
  [...new Set(failed)].slice(0, 12).forEach((f) => console.log('  ' + f));
  console.log('【页面异常】');
  [...new Set(errs)].slice(0, 8).forEach((e) => console.log('  ' + e));
  await page.screenshot({ path: 'touch-repro.png' });
  await b.close();
})();
