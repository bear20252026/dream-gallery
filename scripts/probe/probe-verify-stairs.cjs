// probe-verify-stairs.cjs — 楼梯修复+移位后的端到端验证:
// 高度场采样 / 高度感知护栏就位 / 楼梯与回廊真实站立(物理核吸附)
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
  await page.waitForTimeout(1500);
  const clickBtn = (kw) => page.evaluate((k) => {
    const el = [...document.querySelectorAll('button')].find(b => (b.textContent || '').replace(/\s/g, '').includes(k));
    if (!el) return 'no-match:' + k;
    const r = el.getBoundingClientRect();
    for (const type of ['pointerdown', 'pointerup', 'click'])
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
    return 'clicked:' + el.textContent.trim();
  }, kw);
  console.log(await clickBtn('男'));
  await page.waitForTimeout(1200);
  console.log(await clickBtn('先逛逛'));
  await page.waitForTimeout(1200);
  const rect = await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find(b => (b.textContent || '').replace(/\s/g, '').includes('落款'));
    return el ? { x: el.getBoundingClientRect().x + el.getBoundingClientRect().width / 2, y: el.getBoundingClientRect().y + el.getBoundingClientRect().height / 2 } : null;
  });
  if (rect) await page.mouse.click(rect.x, rect.y);
  await page.waitForTimeout(2000);

  // 进大堂
  await page.evaluate(() => window.__ctx.player.pl.p.set(6, window.__ctx.player.pl.p.y, 24.9));
  await page.waitForTimeout(9000);
  const cur = await page.evaluate(() => window.__museum && window.__museum.current);
  if (cur !== 'hall') { console.log('ERR 没进大堂:', cur); await b.close(); process.exit(1); }

  // 1) 高度场采样(本地坐标 → 世界)
  const ground = await page.evaluate(() => {
    const H = { X: -300, Z: -190 };
    const g = window.__ctx.kunlun.groundOverride;
    const pts = {
      '1F 中央(0,0)': [0, 0],
      '1F 东侧(30,0)': [30, 0],
      '中央平台(-46,0)': [-46, 0],
      '东翼中段(-33,0)': [-33, 0],
      '东翼底(-28.5,0)': [-28.5, 0],
      '北翼中段(-46,-11)': [-46, -11],
      '南翼中段(-46,11)': [-46, 11],
      '北回廊(0,-17.75)': [0, -17.75],
      '南回廊(0,17.75)': [0, 17.75],
      '东回廊(50,0)': [50, 0],
      '旧假二层区(10,-2)': [10, -2],
    };
    const out = {};
    for (const [k, [lx, lz]] of Object.entries(pts)) out[k] = g(H.X + lx, H.Z + lz);
    return out;
  });
  console.log('=== 高度场采样 ===');
  for (const [k, v] of Object.entries(ground)) console.log(`  ${k}: ${v}`);

  // 2) 高度感知护栏统计
  const wallInfo = await page.evaluate(() => {
    const bs = window.__ctx.scene.bounds;
    return {
      total: bs.length,
      heightAware: bs.filter(b => b.mnY !== undefined).length,
      balconyRails: bs.filter(b => b.mnY === 30.4).length,
      stairRails: bs.filter(b => b.mnY === 20.5).length,
      lowOuterWalls: bs.filter(b => b.mnY === 0 && b.mxY === 30.3).length,
    };
  });
  console.log('=== 护栏 ===', JSON.stringify(wallInfo));

  // 3) 真实站立测试(物理核吸附):传送到各点,等 2.5s 读实际 y
  const spots = [
    ['1F 东侧', 30, 0, 20.8],
    ['中央平台', -46, 0, 25.4],
    ['东翼中段', -33, 0, 22.66],
    ['北回廊', 0, -17.75, 30.45],
    ['东回廊', 50, 0, 30.45],
    ['南回廊', 0, 17.75, 30.45],
  ];
  console.log('=== 站立实测(期望 y = 场高 + 1.6) ===');
  for (const [name, lx, lz, expectH] of spots) {
    await page.evaluate(([lx, lz, h]) => {
      const pl = window.__ctx.player.pl;
      pl.p.set(-300 + lx, h + 1.6, -190 + lz);
      pl.vy = 0; pl.onGround = true;
    }, [lx, lz, expectH]);
    await page.waitForTimeout(2500);
    const y = await page.evaluate(() => +window.__ctx.player.pl.p.y.toFixed(2));
    const ok = Math.abs(y - (expectH + 1.6)) < 0.35 ? 'OK' : 'FAIL';
    console.log(`  ${name}: 期望 ${+(expectH + 1.6).toFixed(2)} 实际 ${y} [${ok}]`);
  }

  // 4) 截图:回廊上回望双分楼梯
  await page.evaluate(() => {
    const pl = window.__ctx.player.pl;
    pl.p.set(-300 + 0, 30.45 + 1.6, -190 - 17.75);
    pl.y = Math.PI / 2; pl.pi = 0.05; pl.vy = 0; pl.onGround = true;
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'scripts/artifacts/verify-balcony-look-west.png' });
  await page.evaluate(() => {
    const pl = window.__ctx.player.pl;
    pl.p.set(-300 + 30, 20.8 + 1.6, -190);
    pl.y = -Math.PI / 2; pl.pi = 0.05; pl.vy = 0; pl.onGround = true;
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'scripts/artifacts/verify-1f-look-stairs.png' });
  console.log('screenshots saved');
  await b.close();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
