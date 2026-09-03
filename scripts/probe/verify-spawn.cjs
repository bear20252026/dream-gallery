// verify-spawn.cjs — 出生点验收(2026-09-03)
// 用户指定出生点:X -0.1 / Y 1.6 / Z 27.0 / 朝南 182°
// 验证:①首次出生落点与朝向 ②⌂ 一键回家是否回到同一点 ③坐标 HUD 读数一致
const { launch } = require('../probe/browser.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.addInitScript(() => {
    for (const k of [
      'agreementConsented',
      'privacyConsented',
      'communityConsented',
      'skipOpening',
      'prologueDone',
      'nickPopOff',
    ])
      sessionStorage.setItem(k, '1');
  });
  await page.goto('http://localhost:5173/?noopening&noprologue', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForFunction(() => window.__ctx && window.__ctx.player && window.__ctx.player.pl, {
    timeout: 60000,
  });
  const clickBtn = (kw) =>
    page.evaluate((k) => {
      const el = [...document.querySelectorAll('button')].find((r) =>
        (r.textContent || '').replace(/\s/g, '').includes(k)
      );
      if (!el) return 'no-match';
      const r = el.getBoundingClientRect();
      for (const t of ['pointerdown', 'pointerup', 'click'])
        el.dispatchEvent(
          new MouseEvent(t, {
            bubbles: true,
            cancelable: true,
            clientX: r.x + r.width / 2,
            clientY: r.y + r.height / 2,
          })
        );
      return 'ok';
    }, kw);
  await clickBtn('男').catch(() => {});
  await page.waitForTimeout(1500);
  await clickBtn('先逛逛').catch(() => {});
  await page.waitForTimeout(2500);
  await page.getByText('跳过序章', { exact: false }).click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    const gc = document.getElementById('guideCard');
    if (gc) {
      const b = [...gc.querySelectorAll('button')].find((x) => /先逛逛/.test(x.textContent || ''));
      if (b) b.click();
      else gc.remove();
    }
  });
  await sleep(600);

  const read = () =>
    page.evaluate(() => {
      const pl = window.__ctx.player.pl;
      const a = ((pl.y % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const DIRS = ['北', '西北', '西', '西南', '南', '东南', '东', '东北'];
      return {
        x: +pl.p.x.toFixed(2),
        y: +pl.p.y.toFixed(2),
        z: +pl.p.z.toFixed(2),
        deg: Math.round((a * 180) / Math.PI),
        dir: DIRS[Math.round(a / (Math.PI / 4)) % 8],
        hud: (document.getElementById('coordHud')?.innerText || '').replace(/\n/g, ' | '),
      };
    });

  const s1 = await read();
  console.log('① 首次出生 :', JSON.stringify(s1));
  await page.screenshot({ path: 'scripts/artifacts/spawn-1.png' });

  // 走开一段再按 ⌂ 回家
  await page.evaluate(() => {
    const pl = window.__ctx.player.pl;
    pl.p.set(20, 1.6, 14);
    window.__ctx.cam.position.copy(pl.p);
  });
  await sleep(600);
  const s2 = await read();
  console.log('② 手动挪走 :', JSON.stringify({ x: s2.x, y: s2.y, z: s2.z }));

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '⌂');
    if (btn) btn.click();
    else throw new Error('home button not found');
  });
  await sleep(2500);
  const s3 = await read();
  console.log('③ ⌂ 回家后 :', JSON.stringify(s3));
  await page.screenshot({ path: 'scripts/artifacts/spawn-2-home.png' });

  const ok =
    Math.abs(s1.x - -0.1) < 0.3 &&
    Math.abs(s1.z - 27.0) < 0.3 &&
    Math.abs(s1.deg - 182) <= 3 &&
    Math.abs(s3.x - -0.1) < 0.3 &&
    Math.abs(s3.z - 27.0) < 0.3 &&
    Math.abs(s3.deg - 182) <= 3;
  console.log(
    ok ? '✅ 出生点已生效(出生 + 回家均落位)' : '❌ 未生效,检查 SPAWN 常量或进馆流程是否有二次传送'
  );
  console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
  await b.close();
})();
