// probe-stair-shot.cjs — 传送到大堂楼梯区多角度截图,确认视觉楼梯形态
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
    sessionStorage.setItem('nickPopOff', '1'); // 预防昵称落款弹窗(空名点落款不关闭)
  });
  await page.goto('http://localhost:3282/?noopening&noprologue', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__ctx && window.__ctx.player && window.__ctx.player.pl, { timeout: 60000 });
  // 跳过残镜序章(若在播)
  try {
    await page.getByText('跳过序章', { exact: false }).click({ timeout: 5000 });
    console.log('clicked skip-prologue');
  } catch (e) { /* 无序章则忽略 */ }
  await page.waitForTimeout(1500);
  // 誓约书弹窗:选性别 -> 先逛逛 (页内 JS 模糊匹配 BUTTON)
  const clickBtn = (kw) => page.evaluate((k) => {
    const el = [...document.querySelectorAll('button')].find(b => (b.textContent || '').replace(/\s/g, '').includes(k));
    if (!el) return 'no-match:' + k;
    const r = el.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    for (const type of ['pointerdown', 'pointerup', 'click']) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    }
    return 'clicked:' + el.textContent.trim();
  }, kw);
  console.log(await clickBtn('男'));
  await page.waitForTimeout(1500);
  console.log(await clickBtn('先逛逛'));
  await page.waitForTimeout(1500);
  // 落款:真实鼠标点击(合成事件不触发其处理器)
  const rect = await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find(b => (b.textContent || '').replace(/\s/g, '').includes('落款'));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (rect) { await page.mouse.click(rect.x, rect.y); console.log('mouse-clicked 落款', rect); }
  else console.log('no 落款 button');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__ctx.player.pl.p.set(6, window.__ctx.player.pl.p.y, 24.9));
  await page.waitForTimeout(9000);

  const shots = [
    { name: 'east-1f-lookwest', x: -150, z: -190, yaw: -Math.PI / 2, pit: 0 },   // 1F 向西看楼梯
    { name: 'on-pit-look-south', x: -176, z: -192, yaw: Math.PI / 2, pit: 22.4 },// 坑底朝南
    { name: 'on-pit-look-north', x: -176, z: -192, yaw: -Math.PI / 2, pit: 22.4 },// 坑底朝北
    { name: 'southflight-look-north', x: -180, z: -178, yaw: -Math.PI / 2, pit: 31 },// 南段上朝北看
    { name: 'northflight-look-south', x: -180, y: -206, z: -206, yaw: Math.PI / 2, pit: 31 },
  ];
  for (const s of shots) {
    await page.evaluate((s) => {
      const pl = window.__ctx.player.pl;
      const y = (s.pit || 20.8) + 1.6;
      pl.p.set(s.x, y, s.z !== undefined ? s.z : s.y);
      pl.y = s.yaw; pl.pi = 0.1; pl.vy = 0; pl.onGround = true;
      window.__ctx.scene.cam.position.copy(pl.p);
      window.__ctx.scene.cam.rotation.y = s.yaw;
      window.__ctx.scene.cam.rotation.x = 0.1;
    }, s);
    // 每次截图前清一遍可能弹出的对话框
    await page.evaluate((k) => {
      const click = (t) => {
        const el = [...document.querySelectorAll('button')].find(b => (b.textContent || '').replace(/\s/g, '').includes(t));
        if (el) { const r = el.getBoundingClientRect(); el.click(); }
        return !!el;
      };
      click('跳过序章'); click('男'); click('先逛逛'); click('落款');
    });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `scripts/artifacts/stair-${s.name}.png` });
    console.log('shot:', s.name);
  }
  await b.close();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
