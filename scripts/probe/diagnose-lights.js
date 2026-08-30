// 诊断场景灯光构成:列出所有灯的 类型/位置/标记/强度,定位灯光爆炸来源
const { chromium } = require('playwright-core');
const URL = 'https://cloudbear.cloud/';

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => {
    try {
      sessionStorage.setItem('agreementConsented', '1');
      sessionStorage.setItem('privacyConsented', '1');
      sessionStorage.setItem('communityConsented', '1');
    } catch (e) {}
  });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#viewBtn', { timeout: 40000 });
  // 跳过开屏/序章,让场景内容完全加载
  await page.click('#viewBtn');
  await page.waitForTimeout(2000);
  for (let i = 0; i < 8; i++) {
    await page.mouse.click(640, 400);
    await page.waitForTimeout(1800);
    const eb = await page.$('button[aria-label="进入画廊"]');
    if (eb) { await eb.click(); await page.waitForTimeout(2000); }
  }
  await page.waitForTimeout(4000);

  const out = await page.evaluate(() => {
    const c = window.__ctx;
    const s = c && c.scene && c.scene.s;
    if (!s) return { error: 'no scene' };
    const pls = (c.scene.pls || []).map((p) => p.l);
    const lights = [];
    s.traverse((o) => {
      if (!o.isLight) return;
      lights.push({
        type: o.type,
        x: +o.position.x.toFixed(1),
        y: +o.position.y.toFixed(1),
        z: +o.position.z.toFixed(1),
        intensity: o.intensity,
        distance: o.distance !== undefined ? o.distance : null,
        deco: !!o.userData.deco,
        inPls: pls.includes(o),
        name: o.name || '',
      });
    });
    // 分类统计
    const byType = {};
    lights.forEach((l) => { byType[l.type] = (byType[l.type] || 0) + 1; });
    const point = lights.filter((l) => l.type === 'PointLight');
    return {
      total: lights.length,
      byType,
      pointTotal: point.length,
      decoCount: point.filter((l) => l.deco).length,
      plsCount: point.filter((l) => l.inPls).length,
      highUp: point.filter((l) => l.y > 30).length,
      farAway: point.filter((l) => Math.abs(l.x) > 500).length,
      // 既不是 deco 也不是 pls 也不是高空/远方的"漏网之灯"
      leaked: point.filter((l) => !l.deco && !l.inPls && l.y <= 30 && Math.abs(l.x) <= 500),
      sample: point.slice(0, 15),
    };
  });

  console.log('=== 场景灯光诊断 ===');
  console.log(JSON.stringify({
    total: out.total, byType: out.byType, pointTotal: out.pointTotal,
    decoCount: out.decoCount, plsCount: out.plsCount,
    highUp: out.highUp, farAway: out.farAway,
  }, null, 2));
  console.log('\n=== 漏网之灯(非 deco / 非吊顶 / 非高空 / 非远方)共 ' + (out.leaked ? out.leaked.length : 0) + ' 盏 ===');
  (out.leaked || []).slice(0, 25).forEach((l) => {
    console.log(`  (${l.x}, ${l.y}, ${l.z}) i=${l.intensity} d=${l.distance} name="${l.name}"`);
  });
  await browser.close();
})();
