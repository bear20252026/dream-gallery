// probe-hall-2f-check.cjs — 检查大堂各点上方所有命中面,确认是否存在 32-33.6 的真实二楼楼板
const { launch } = require('../probe/browser.js');

(async () => {
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.goto('http://localhost:3282/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__ctx && window.__ctx.player && window.__ctx.player.pl, { timeout: 60000 });
  await page.evaluate(() => window.__ctx.player.pl.p.set(6, window.__ctx.player.pl.p.y, 24.9));
  await page.waitForTimeout(9000);
  const cur = await page.evaluate(() => window.__museum && window.__museum.current);
  if (cur !== 'hall') { console.log('ERR 没进大堂:', cur); await b.close(); process.exit(1); }

  const res = await page.evaluate(async () => {
    const obj = window.__museum.cache.get('/models/hall/hall.glb');
    obj.updateMatrixWorld(true);
    const meshes = [];
    obj.traverse((m) => { if (m.isMesh && m.geometry) meshes.push(m); });
    const T = await import('/vendor/three.module.js');
    const rc = new T.Raycaster();
    rc.far = 120;
    // 采样点:假二层中心、假二层东部、真楼梯各关键点、楼梯入口候选
    const pts = [
      ['fake2F-center', -140, -190], ['fake2F-east', -100, -190], ['fake2F-ne', -100, -204],
      ['stair-entry-e', -168, -190], ['stair-entry-e2', -172, -190], ['stair-entry-e3', -175, -192],
      ['stair-landing', -185, -190], ['stair-mid', -181, -195],
      ['west-1f', -198, -190], ['east-1f', -150, -190], ['east-1f2', -120, -190],
      ['s-balcony', -140, -166], ['n-balcony', -140, -212], ['s-balcony-w', -180, -168],
      ['x-entry-s', -172, -180], ['x-entry-n', -172, -200],
    ];
    const out = [];
    for (const [name, x, z] of pts) {
      rc.set(new T.Vector3(x, 60, z), new T.Vector3(0, -1, 0));
      const hits = rc.intersectObjects(meshes, false).map(h => +h.point.y.toFixed(2));
      out.push(name + ' (' + x + ',' + z + '): [' + hits.join(', ') + ']');
    }
    return out.join('\n');
  });
  console.log(res);
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
