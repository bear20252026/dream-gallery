// 验证混合设备修复:触屏环境(hasTouch)下用鼠标驱动摇杆 + 拖拽视角
const { BASE_URL, launch } = require('./browser');


(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  await ctx.addInitScript(() => {
    try {
      sessionStorage.setItem('agreementConsented', '1');
      sessionStorage.setItem('privacyConsented', '1');
      sessionStorage.setItem('communityConsented', '1');
      sessionStorage.setItem('nickPopOff', '1');
    } catch (e) {}
  });
  const page = await ctx.newPage();
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);
  await page.mouse.click(640, 400);
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const el = document.getElementById('openingOv');
    if (el) el.remove();
  });
  // 点掉答题门等
  for (let r = 0; r < 8; r++) {
    const ok = await page.evaluate(() => {
      const kws = ['先逛逛', '跳过', '关闭', '进入画廊'];
      const btns = [...document.querySelectorAll('button, .btn')].filter((x) => {
        if (x.id === 'viewBtn') return false;
        const t = (x.textContent || '').trim();
        return t && kws.some((k) => t.includes(k)) && x.offsetParent !== null;
      });
      if (btns.length) { btns[0].click(); return true; }
      return false;
    });
    if (!ok) break;
    await page.waitForTimeout(1200);
  }
  await page.waitForTimeout(1000);

  // 清掉所有遮挡层(nickPop z=80 / 答题门背景等),保留 HUD
  await page.evaluate(() => {
    document.querySelectorAll('body > div, body > section, body > aside').forEach((el) => {
      const z = parseInt(el.style.zIndex || getComputedStyle(el).zIndex || '0', 10);
      if (z >= 80 && z < 9000 && el.id !== 'viewBtn' && el.id !== 'j') el.remove();
    });
  });
  await page.waitForTimeout(600);

  // ---- 1. 鼠标拖拽转视角(修复前:hasTouch 下被 ontouchstart 门禁拦死) ----
  const y1 = await page.evaluate(() => +window.__ctx.player.pl.y.toFixed(3));
  await page.mouse.move(640, 400);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(640 + i * 12, 400, { steps: 2 });
  await page.mouse.up();
  const y2 = await page.evaluate(() => +window.__ctx.player.pl.y.toFixed(3));
  console.log('【触屏环境+鼠标拖视角】delta =', (y2 - y1).toFixed(3), y2 - y1 !== 0 ? '✓' : '✗ 仍失效');

  // ---- 2. 鼠标驱动摇杆 ----
  const jb = await page.evaluate(() => {
    const r = document.getElementById('jb').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  const p1 = await page.evaluate(() => window.__ctx.player.pl.p.toArray().map((n) => +n.toFixed(2)));
  await page.mouse.move(jb.x, jb.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(jb.x, jb.y - i * 9, { steps: 2 });
  await page.waitForTimeout(1500);
  await page.mouse.up();
  await page.waitForTimeout(300);
  const p2 = await page.evaluate(() => ({
    p: window.__ctx.player.pl.p.toArray().map((n) => +n.toFixed(2)),
    sm: window.__ctx._playerSM.current ? window.__ctx._playerSM.current.name : 'NO',
    jDx: window.__ctx.player.jD.x, jDz: window.__ctx.player.jD.z,
  }));
  const moved = Math.hypot(p2.p[0] - p1[0], p2.p[2] - p1[2]);
  console.log('【触屏环境+鼠标摇杆】位移 =', moved.toFixed(2), 'm | 状态机:', p2.sm, '| jD 复位:', p2.jDx === 0 && p2.jDz === 0 ? '✓' : '✗ ' + JSON.stringify([p2.jDx, p2.jDz]));

  // ---- 3. 第三人称 + 动画态 ----
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true }));
  });
  for (let i = 0; i < 45; i++) {
    await page.waitForTimeout(1000);
    if (await page.evaluate(() => !!window.__avatarLoaded)) break;
  }
  await page.waitForTimeout(2000);
  const anim = await page.evaluate(() => {
    const c = window.__ctx;
    return { viewMode: c.player.viewMode, loaded: !!window.__avatarLoaded, smIdle: c._playerSM.current.name };
  });
  console.log('【第三人称】', JSON.stringify(anim));
  await page.screenshot({ path: 'hybrid-verify.png' });
  await b.close();
})();
