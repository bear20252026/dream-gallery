// 对比第一/第三人称 FPS:确认角色渲染开销
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
      sessionStorage.setItem('nickPopOff', '1');
    } catch (e) {}
  });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);
  await page.mouse.click(640, 400);
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const el = document.getElementById('openingOv');
    if (el) el.remove();
    document.querySelectorAll('body > div, body > section, body > aside').forEach((el) => {
      const z = parseInt(el.style.zIndex || getComputedStyle(el).zIndex || '0', 10);
      if (z >= 80 && z < 9000 && el.id !== 'viewBtn') el.remove();
    });
  });
  await page.waitForTimeout(1500);

  async function fps(sec) {
    return await page.evaluate((s) => new Promise((res) => {
      let n = 0; const t0 = performance.now();
      function f() { n++; if (performance.now() - t0 < s * 1000) requestAnimationFrame(f); else res(+(n / s).toFixed(1)); }
      requestAnimationFrame(f);
    }), sec);
  }

  const fps1st = await fps(6);
  console.log('第一人称 FPS:', fps1st);

  // 切第三人称(触发模型加载)
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true }));
  });
  for (let i = 0; i < 45; i++) {
    await page.waitForTimeout(1000);
    if (await page.evaluate(() => !!window.__avatarLoaded)) break;
  }
  await page.waitForTimeout(3000);
  const fps3rd = await fps(8);
  console.log('第三人称 FPS:', fps3rd);

  // 关掉角色阴影再测
  const fpsNoShadow = await page.evaluate((s) => new Promise((res) => {
    const c = window.__ctx;
    c.scene.avatar.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    let n = 0; const t0 = performance.now();
    function f() { n++; if (performance.now() - t0 < s * 1000) requestAnimationFrame(f); else res(+(n / s).toFixed(1)); }
    requestAnimationFrame(f);
  }), 8);
  console.log('第三人称(无阴影) FPS:', fpsNoShadow);

  // renderer 统计
  const info = await page.evaluate(() => {
    const i = window.__rnd.info.render;
    return { calls: i.calls, tris: i.triangles };
  });
  console.log('渲染统计:', JSON.stringify(info));
  await b.close();
})();
