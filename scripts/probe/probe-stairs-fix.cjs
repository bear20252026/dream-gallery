// probe-stairs-fix.cjs — 验证大堂中央楼梯前的方柱问题修复后,玩家可自由走过去
const { launch } = require('../probe/browser.js');

(async () => {
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

  await page.goto('http://localhost:3282/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__ctx && window.__ctx.player && window.__ctx.player.pl, { timeout: 60000 });
  await page.evaluate(() => window.__ctx.player.pl.p.set(6, window.__ctx.player.pl.p.y, 24.9));
  await page.waitForTimeout(8000);

  let cur = await page.evaluate(() => window.__museum && window.__museum.current);
  if (cur !== 'hall') { console.log('ERR 没进大堂:', cur); await b.close(); process.exit(1); }

  const HX = -140, HZ = -190;
  // 把玩家放到东端
  await page.evaluate((args) => {
    const pl = window.__ctx.player.pl;
    pl.p.set(args.x, 20.8 + 1.6, args.z);
    pl.y = args.yaw;
    pl.pi = 0;
    pl.vy = 0;
    pl.onGround = true;
  }, { x: HX + 30, z: HZ, yaw: -Math.PI / 2 });
  await page.waitForTimeout(500);

  // 测试 1:朝 -X 走 60 秒,期望能到达中央楼梯前(x ~= -135)
  const result = await page.evaluate(async () => {
    const pl = window.__ctx.player.pl;
    const mv = window.__ctx.player.mv;
    const dt = 1 / 60;
    let blocked = false;
    let blockedAt = null;
    let lastMove = 999;
    for (let i = 0; i < 1500; i++) {
      const before = { x: pl.p.x, z: pl.p.z };
      mv(-1, 0, dt);
      if (Math.hypot(pl.p.x - before.x, pl.p.z - before.z) < 1e-4) {
        if (lastMove > i - 1) { lastMove = i; }
      }
      if (lastMove < i - 240) { // 停住 4 秒确认卡死
        blocked = true;
        blockedAt = { x: pl.p.x, z: pl.p.z, frame: i };
        break;
      }
    }
    return { endX: pl.p.x, endZ: pl.p.z, blocked, blockedAt };
  });
  console.log('朝 -X 走结果:', JSON.stringify(result));

  // 测试 2:大堂内不再有沙漠岩石 bounds
  const desertInHall = await page.evaluate(() => {
    return window.__ctx.scene.bounds.filter((b) => b._desert === true)
      .filter((b) => b.mnX >= -200 && b.mxX <= -80 && b.mnZ >= -210 && b.mxZ <= -173).length;
  });
  console.log('大堂范围内沙漠岩石 bounds:', desertInHall);

  // 测试 3:total bounds 数量与过往对比
  const totalBounds = await page.evaluate(() => window.__ctx.scene.bounds.length);
  console.log('总 bounds 数量:', totalBounds);

  await page.screenshot({ path: 'scripts/artifacts/stairs-fix-verified.png' });
  await b.close();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
