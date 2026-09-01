// probe-stair-map.cjs — 2米网格精细扫描,输出楼梯区 ASCII 高度图
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

  const map = await page.evaluate(async () => {
    const obj = window.__museum.cache.get('/models/hall/hall.glb');
    obj.updateMatrixWorld(true);
    const meshes = [];
    obj.traverse((m) => { if (m.isMesh && m.geometry) meshes.push(m); });
    const T = await import('/vendor/three.module.js');
    const rc = new T.Raycaster();
    rc.far = 100;
    function surf(x, z) {
      rc.set(new T.Vector3(x, 34, z), new T.Vector3(0, -1, 0));
      const hits = rc.intersectObjects(meshes, false);
      for (const h of hits) if (h.point.y < 34) return +h.point.y.toFixed(1);
      return null;
    }
    // 行=z(北-208 → 南-172),列=x(西-200 → 东-80),步长 2m
    const rows = [];
    for (let z = -208; z <= -172; z += 2) {
      const row = [];
      for (let x = -200; x <= -80; x += 2) {
        const h = surf(x, z);
        if (h === null) row.push('  .');        // 无面(空洞)
        else if (h <= 21.3) row.push('  _');     // 一楼地板(20.8~21.3)
        else if (h >= 33.2) row.push('  #');     // 二楼面(33.6)
        else row.push((h >= 30 ? '+' : h >= 26 ? '*' : h >= 23.5 ? '-' : '.' ) + String(Math.round(h)).padStart(2));
      }
      rows.push({ z, row: row.join(' ') });
    }
    return rows;
  });
  console.log('=== 楼梯区 ASCII 高度图(x:-200→-80 每2m;  _=1F地板 .<23.5 - <26 * <30 + <33.2 #=2F) ===');
  console.log('x:   ' + Array.from({length: 61}, (_, i) => (-200 + i * 2)).map(v => String(v).slice(-3).padStart(3)).join(''));
  for (const r of map) console.log('z' + String(r.z).padStart(4) + ': ' + r.row);

  await b.close();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
