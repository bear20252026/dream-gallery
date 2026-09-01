// probe-stair-numeric.cjs — 数值化精扫楼梯区,输出原始高度(1m x 2m 网格)
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

  const out = await page.evaluate(async () => {
    const obj = window.__museum.cache.get('/models/hall/hall.glb');
    obj.updateMatrixWorld(true);
    const meshes = [];
    obj.traverse((m) => { if (m.isMesh && m.geometry) meshes.push(m); });
    const T = await import('/vendor/three.module.js');
    const rc = new T.Raycaster();
    rc.far = 120;
    function surf(x, z) {
      rc.set(new T.Vector3(x, 36, z), new T.Vector3(0, -1, 0));
      const hits = rc.intersectObjects(meshes, false);
      for (const h of hits) if (h.point.y < 36 && h.point.y > 19) return +h.point.y.toFixed(1);
      return null;
    }
    const lines = [];
    // 1) 沿 x 的横剖面(每 2m),在 z=-186/-190/-194 三条线
    for (const z of [-184, -188, -192, -196]) {
      const row = [];
      for (let x = -196; x <= -164; x += 2) row.push(x + ':' + surf(x, z));
      lines.push('z=' + z + '  ' + row.join(' '));
    }
    // 2) 沿 z 的纵剖面(每 1m),在 x=-186/-178/-172 三条线
    for (const x of [-188, -184, -178, -172]) {
      const col = [];
      for (let z = -208; z <= -172; z += 1) col.push(z + ':' + surf(x, z));
      lines.push('x=' + x + '  ' + col.join(' '));
    }
    return lines.join('\n');
  });
  console.log(out);
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
