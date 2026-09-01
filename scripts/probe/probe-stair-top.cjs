// probe-stair-top.cjs — 从高处俯瞰楼梯区,确认视觉楼梯布局
const { launch } = require('../probe/browser.js');

(async () => {
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.addInitScript(() => {
    sessionStorage.setItem('agreementConsented', '1');
    sessionStorage.setItem('privacyConsented', '1');
    sessionStorage.setItem('communityConsented', '1');
    sessionStorage.setItem('skipOpening', '1');
    sessionStorage.setItem('prologueDone', '1');
    sessionStorage.setItem('nickPopOff', '1');
  });
  await page.goto('http://localhost:3282/?noopening&noprologue', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__ctx && window.__ctx.player && window.__ctx.player.pl, { timeout: 60000 });
  try { await page.getByText('跳过序章', { exact: false }).click({ timeout: 5000 }); } catch (e) {}
  await page.waitForTimeout(2500);
  // 弹窗清理
  await page.evaluate(() => {
    const click = (t) => {
      const el = [...document.querySelectorAll('button')].find(b => (b.textContent || '').replace(/\s/g, '').includes(t));
      if (el) el.click();
    };
    click('男'); click('先逛逛');
  });
  await page.waitForTimeout(2000);
  // 复刻进馆流程:先到 (6,24.9) 等待,触发传送门进入大堂
  await page.evaluate(() => window.__ctx.player.pl.p.set(6, window.__ctx.player.pl.p.y, 24.9));
  await page.waitForTimeout(9000);
  console.log('hall bootstrap done, mode=', await page.evaluate(() => window.__ctx.mode && window.__ctx.mode.name || 'unknown'));

  const shots = [
    { name: 'topdown-stairs', x: -156, z: -190, y: 46, yaw: 0, pitch: -1.52 },        // 正上方俯瞰楼梯区
    { name: 'high-east-look-west', x: -110, z: -190, y: 40, yaw: Math.PI / 2, pitch: -0.35 }, // 从东往西俯视
    { name: 'south-high-look-north', x: -156, z: -150, y: 38, yaw: 0, pitch: -0.25 },  // 南侧空中向北看
  ];
  for (const s of shots) {
    await page.evaluate((s) => {
      const pl = window.__ctx.player.pl;
      pl.p.set(s.x, s.y, s.z);
      pl.y = s.yaw; pl.pi = s.pitch; pl.vy = 0; pl.onGround = false;
      window.__ctx.scene.cam.position.copy(pl.p);
      window.__ctx.scene.cam.rotation.order = 'YXZ';
      window.__ctx.scene.cam.rotation.y = s.yaw;
      window.__ctx.scene.cam.rotation.x = s.pitch;
    }, s);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `scripts/artifacts/stair-${s.name}.png` });
    console.log('shot:', s.name);
  }
  await b.close();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
