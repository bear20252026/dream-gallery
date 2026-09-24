// load-timing-probe.cjs — 3D 加载全链路计时(2026-09-24,主人问"加载能否更快")
// 抓:导航时序 / 闸门就绪 / 世界就绪 各阶段耗时 + 资源 Top(按耗时/体积)+ 资源域分布。
const { launch } = require('./browser.js');
(async () => {
  const URL = process.env.PROBE_URL || 'http://localhost:5173';
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const t0 = Date.now();
  let gateReadyAt = 0,
    worldReadyAt = 0;
  page.on('response', () => {});
  await page.addInitScript(() => {
    for (const k of ['agreementConsented', 'privacyConsented', 'communityConsented'])
      sessionStorage.setItem(k, '1');
  });
  await page.goto(URL + '/?noopening&noprologue', { waitUntil: 'domcontentloaded' });
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    return {
      ttfb: Math.round(n.responseStart),
      domContentLoaded: Math.round(n.domContentLoadedEventEnd),
      load: Math.round(n.loadEventEnd || 0),
    };
  });
  await page.waitForSelector('#b612Gate', { timeout: 60000 });
  gateReadyAt = Date.now() - t0;
  await page.check('#b612Gate #gAgreeChk');
  await page.click('#b612Gate .gEnter');
  try {
    await page.waitForFunction(
      () => window.__bootCheck && window.__bootCheck.ok === true,
      null,
      { timeout: 240000 }
    );
    worldReadyAt = Date.now() - t0;
  } catch (e) {
    console.log('!! 世界就绪超时');
  }
  await page.waitForTimeout(4000); // 让尾部资源进 ResourceTiming
  const stats = await page.evaluate(() => {
    const rs = performance.getEntriesByType('resource').map((r) => ({
      url: r.name.replace(location.origin, ''),
      ms: Math.round(r.duration),
      kb: Math.round((r.transferSize || 0) / 1024),
      dom: r.domainLookupEnd - r.domainLookupStart,
      tls: Math.round(r.secureConnectionStart ? r.connectEnd - r.secureConnectionStart : 0),
    }));
    const top = rs.slice().sort((a, b) => b.ms - a.ms).slice(0, 15);
    const big = rs.slice().sort((a, b) => b.kb - a.kb).slice(0, 10);
    const byHost = {};
    for (const r of rs) {
      const h = r.url.startsWith('http') ? new URL(r.url).host : '(same-origin)';
      byHost[h] = byHost[h] || { n: 0, kb: 0, ms: 0 };
      byHost[h].n++;
      byHost[h].kb += r.kb;
      byHost[h].ms = Math.max(byHost[h].ms, r.ms);
    }
    const models = rs.filter((r) => /models\/|\.glb/.test(r.url));
    return {
      total: rs.length,
      totalKB: rs.reduce((s, r) => s + r.kb, 0),
      top,
      big,
      byHost,
      models: models.sort((a, b) => b.ms - a.ms),
    };
  });
  console.log('=== 阶段耗时(ms) ===');
  console.log('TTFB:', nav.ttfb, '| DCL:', nav.domContentLoaded, '| 闸门就绪:', gateReadyAt, '| 世界就绪:', worldReadyAt || '超时');
  // 后台链状态(2026-09-24 渐进加载):核心链完成即进图,后台链随后补载
  const deferred = await page.evaluate(async () => {
    const phase = window.__worldPhase || '(无)';
    let dOK = '超时';
    try {
      await Promise.race([window.__deferredWorldReady || Promise.resolve(), new Promise((r) => setTimeout(r, 20000))]);
      dOK = '完成';
    } catch (e) { dOK = '异常'; }
    return { phase, deferredReady: dOK, boot: window.__bootCheck };
  });
  console.log('世界相位:', deferred.phase, '| 后台链:', deferred.deferredReady, '| bootCheck:', JSON.stringify(deferred.boot));
  console.log('=== 资源总览 ===', stats.total, '个,', Math.round(stats.totalKB / 1024) + 'MB');
  console.log('=== 按域 ===');
  for (const [h, v] of Object.entries(stats.byHost))
    console.log(`  ${h}: ${v.n}个 / ${Math.round(v.kb / 1024)}MB / 最慢单个 ${v.ms}ms`);
  console.log('=== 最慢 Top15 ===');
  for (const r of stats.top) console.log(`  ${r.ms}ms ${r.kb}KB ${r.url.slice(0, 110)}`);
  console.log('=== 最大 Top10 ===');
  for (const r of stats.big) console.log(`  ${r.kb}KB ${r.ms}ms ${r.url.slice(0, 110)}`);
  console.log('=== 模型清单(' + stats.models.length + ') ===');
  for (const r of stats.models) console.log(`  ${r.ms}ms ${r.kb}KB ${r.url.slice(0, 110)}`);
  await b.close();
})();
