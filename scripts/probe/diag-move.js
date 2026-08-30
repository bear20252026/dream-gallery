// 诊断第三人称"卡死":移动/视角/动画三链路逐项实测
const { chromium } = require('playwright-core');
const URL = 'https://cloudbear.cloud/';

(async () => {
  const b = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => {
    try {
      sessionStorage.setItem('agreementConsented', '1');
      sessionStorage.setItem('privacyConsented', '1');
      sessionStorage.setItem('communityConsented', '1');
    } catch (e) {}
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 200)));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type().toUpperCase() + ': ' + m.text().slice(0, 160));
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);
  await page.mouse.click(640, 400);
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const el = document.getElementById('openingOv');
    if (el) el.remove();
    document.querySelectorAll('body > div').forEach((d) => {
      const z = parseInt(d.style.zIndex || '0', 10);
      if (z >= 400 && z < 9000 && !d.id) d.remove();
    });
  });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true }));
  });
  for (let i = 0; i < 45; i++) {
    await page.waitForTimeout(1000);
    if (await page.evaluate(() => !!window.__avatarLoaded)) break;
  }
  await page.waitForTimeout(2000);
  // 清 UI 层
  await page.evaluate(() => {
    document.querySelectorAll('body > div, body > section, body > aside').forEach((el) => {
      const z = parseInt(el.style.zIndex || getComputedStyle(el).zIndex || '0', 10);
      if (z >= 150 && z < 9000 && el.id !== 'viewBtn') el.remove();
    });
  });
  await page.waitForTimeout(500);

  // ---- 测试1:键盘 W 移动 ----
  const t1 = await page.evaluate(async () => {
    const c = window.__ctx;
    const before = c.player.pl.p.toArray().map((n) => +n.toFixed(3));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
    await new Promise((r) => setTimeout(r, 1500));
    const mid = c.player.pl.p.toArray().map((n) => +n.toFixed(3));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', bubbles: true }));
    return {
      before, mid,
      moved: Math.hypot(mid[0] - before[0], mid[2] - before[2]).toFixed(3),
      smState: c._playerSM && c._playerSM.current ? c._playerSM.current.name : 'NO_SM',
      ksW: !!c.player.ks.w,
      flightLock: !!c.kunlun.flightLock,
      onGround: !!c.player.pl.onGround,
      plY: +c.player.pl.p.y.toFixed(2),
    };
  });
  console.log('【键盘W】', JSON.stringify(t1));

  // ---- 测试2:鼠标拖拽转视角 ----
  const t2 = await page.evaluate(async () => {
    const c = window.__ctx;
    const yBefore = +c.player.pl.y.toFixed(3);
    return { yBefore, canvasId: c.scene.cam ? 'has-cam' : 'no-cam' };
  });
  // 真实鼠标拖拽(canvas 上)
  await page.mouse.move(640, 400);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(640 + i * 15, 400, { steps: 2 });
  await page.mouse.up();
  const t2b = await page.evaluate(() => {
    const c = window.__ctx;
    return { yAfter: +c.player.pl.y.toFixed(3) };
  });
  console.log('【视角拖拽】', JSON.stringify({ ...t2, ...t2b, delta: (t2b.yAfter - t2.yBefore).toFixed(3) }));

  // ---- 测试3:摇杆(jD)移动 ----
  const t3 = await page.evaluate(async () => {
    const c = window.__ctx;
    const before = c.player.pl.p.toArray().map((n) => +n.toFixed(3));
    c.player.jD.x = 0; c.player.jD.z = 1; // 模拟摇杆前推
    await new Promise((r) => setTimeout(r, 1200));
    const mid = c.player.pl.p.toArray().map((n) => +n.toFixed(3));
    c.player.jD.x = 0; c.player.jD.z = 0;
    return {
      before, mid,
      moved: Math.hypot(mid[0] - before[0], mid[2] - before[2]).toFixed(3),
      smState: c._playerSM && c._playerSM.current ? c._playerSM.current.name : 'NO_SM',
    };
  });
  console.log('【摇杆jD】', JSON.stringify(t3));

  // ---- 测试4:动画 mixer 状态 ----
  const t4 = await page.evaluate(() => {
    const c = window.__ctx;
    const out = {};
    out.clips = window.__avatarClips ? Object.keys(window.__avatarClips) : null;
    out.smState = c._playerSM && c._playerSM.current ? c._playerSM.current.name : 'NO_SM';
    // 探测 mixer:THREE 对象上不好拿,但可以从 avatar 内层找
    const av = c.scene.avatar;
    if (av && av.children[0]) out.hasInner = true;
    return out;
  });
  console.log('【动画】', JSON.stringify(t4));

  // ---- 汇总错误 ----
  console.log('\n【页面错误】(去重前 10 条)');
  [...new Set(errs)].slice(0, 10).forEach((e) => console.log('  ' + e));
  if (!errs.length) console.log('  (无)');

  await page.screenshot({ path: 'third-person-move.png' });
  await b.close();
})();
