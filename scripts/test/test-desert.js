// test-desert.js — 西域沙海整合专项验证
// 1) 白天场景截图 2) 行走至沙丘区截图 3) 跳跃/滑翔 Y 轨迹 4) 夜晚场景截图 5) 帧率粗测
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('[PAGE_ERROR]', e.message));

  const readY = async () => {
    const t = await page.evaluate(() => (document.getElementById('posD') || {}).textContent || '');
    const m = t.match(/Y:([\d.-]+)/);
    return m ? parseFloat(m[1]) : NaN;
  };

  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000); // t≈4s → hour≈12.8 正午
  console.log('t=4s Y=', await readY());
  await page.screenshot({ path: 'test-day-spawn.png' });

  // 跳跃/滑翔:按住空格,150ms 采样一次 Y,持续 2.5s
  await page.keyboard.down('Space');
  let maxY = 0, yAt08 = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 2500) {
    await page.waitForTimeout(150);
    const y = await readY();
    if (y > maxY) maxY = y;
    if (Date.now() - t0 >= 750 && Date.now() - t0 < 900) yAt08 = y;
  }
  await page.keyboard.up('Space');
  console.log(`跳跃: maxY=${maxY.toFixed(2)} (原版限速6m/s,预期≈6.5~8), 0.8s时Y=${yAt08.toFixed(2)} (滑翔中应>2)`);
  console.log(maxY > 3 && maxY < 9 ? '✓ 跳跃+原版上升限速生效' : '✗ 手感异常(期望 3<maxY<9)');
  console.log(yAt08 > 2 ? '✓ 滑翔生效(缓降)' : '✗ 滑翔未生效');

  // 行走至沙丘区(W 持续 18s ≈ 58m,出压平区)
  await page.keyboard.down('w');
  await page.waitForTimeout(18000);
  await page.keyboard.up('w');
  const posT = await page.evaluate(() => (document.getElementById('posD') || {}).textContent || '');
  console.log('行走后位置:', posT);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-dunes.png' });

  // 帧率粗测(3s 内 rAF 次数)
  const fps = await page.evaluate(() => new Promise(res => {
    let n = 0; const s = performance.now();
    (function f() { n++; if (performance.now() - s < 3000) requestAnimationFrame(f); else res((n / 3).toFixed(1)); })();
  }));
  console.log('沙丘区 FPS ≈', fps);

  // 等到夜晚(t≥45s → hour≥21)再截图验证昼夜
  await page.waitForTimeout(18000);
  await page.screenshot({ path: 'test-night.png' });
  console.log('夜晚截图完成');

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
