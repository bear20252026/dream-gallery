// E2E:博物馆全链路 —— 走近入口门→大堂加载→房间门→进房间→返回大堂
const { launch } = require('./browser.js');
(async () => {
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await page.goto('http://localhost:3282/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  // 等玩家系统就绪(模块链加载完才有 ctx.player.pl)
  await page.waitForFunction(() => {
    const p = window.__ctx && window.__ctx.player && window.__ctx.player.pl;
    return !!(p && p.p);
  }, { timeout: 45000 });
  await page.waitForTimeout(4000); // 场景资源就绪
  const pos = () => page.evaluate(() => { const p = window.__ctx && window.__ctx.player && window.__ctx.player.pl; return p ? { x: +p.p.x.toFixed(1), y: +p.p.y.toFixed(1), z: +p.p.z.toFixed(1) } : null; });
  console.log('初始位置:', JSON.stringify(await pos()));
  // 传送到博物馆之门旁
  await page.evaluate(() => { const p = window.__ctx.player.pl; p.p.set(6, p.p.y, 24.9); });
  await page.waitForTimeout(3500); // 距离触发 enterHall + 23.9MB 加载(本地快)
  console.log('触发后位置:', JSON.stringify(await pos()));
  await page.waitForTimeout(2500);
  const p2 = await pos();
  console.log('大堂内位置:', JSON.stringify(p2));
  const inHall = p2 && p2.x < -1100;
  console.log(inHall ? '✓ 已进入大堂世界' : '✗ 未进入大堂');
  // 传送到陈列馆门框旁(HALL.X-6, HALL.Z-7 = -1206,-907;玩家在 -1198,-896 附近)
  await page.evaluate(() => { const p = window.__ctx.player.pl; p.p.set(-1206, p.p.y, -906.5); });
  await page.waitForTimeout(6000); // 加载 22MB 房间
  const p3 = await pos();
  console.log('房间内位置:', JSON.stringify(p3));
  const inRoom = p3 && Math.abs(p3.x - (-1200)) < 15 && Math.abs(p3.z - (-300)) < 15 && p3.y > 0;
  console.log(inRoom ? '✓ 已进入图片陈列馆' : '✗ 未进入房间');
  await page.screenshot({ path: 'scripts/artifacts/museum-room.png' });
  // 走到返回门(HALL? 不——返回门在房间内 Z-WALK.hz+1.5 = -304.5,X=-1200)
  await page.evaluate(() => { const p = window.__ctx.player.pl; p.p.set(-1200, p.p.y, -308.5); });
  await page.waitForTimeout(4000);
  const p4 = await pos();
  console.log('返回大堂后:', JSON.stringify(p4));
  console.log('JS 错误:', errs.length ? errs : '无');
  await page.screenshot({ path: 'scripts/artifacts/museum-hall-back.png' });
  await b.close();
  process.exit(errs.length ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
