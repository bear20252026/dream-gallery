// probe-stair-diag2.cjs — 全厅视觉表面扫描(只看 y<35 的命中,找楼梯真实位置)
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

  const scan = await page.evaluate(async () => {
    const obj = window.__museum.cache.get('/models/hall/hall.glb');
    obj.updateMatrixWorld(true);
    const meshes = [];
    obj.traverse((m) => { if (m.isMesh && m.geometry) meshes.push(m); });
    const T = await import('/vendor/three.module.js');
    const rc = new T.Raycaster();
    rc.far = 100;
    function surf(x, z) {
      rc.set(new T.Vector3(x, 35, z), new T.Vector3(0, -1, 0));
      const hits = rc.intersectObjects(meshes, false);
      // 只要 y<35 的最高命中(排除穹顶装饰)
      for (const h of hits) if (h.point.y < 35) return { h: +h.point.y.toFixed(2), mesh: (h.object.name || '?').slice(0, 24) };
      return { h: null, mesh: 'void' };
    }
    const rows = [];
    for (let z = -208; z <= -172; z += 4) {
      const row = [];
      for (let x = -204; x <= -76; x += 8) {
        const r = surf(x, z);
        // 只记录"非常规地板"的点(高度介于 21~33 之间=斜坡/楼梯,或空洞)
        if (r.h !== null && r.h > 21.5 && r.h < 33) row.push({ x, z, h: r.h, m: r.mesh });
        else if (r.h === null) row.push({ x, z, h: 'void' });
      }
      if (row.length) rows.push(row);
    }
    return rows;
  });
  console.log('=== 高度 21.5~33 的视觉表面点(楼梯斜面候选) + 空洞点 ===');
  for (const row of scan) console.log(JSON.stringify(row));

  // 二楼楼板高度确认 + 二楼北行走(穿越 z=-180 悬崖实测)
  const t2 = await page.evaluate(async () => {
    const pl = window.__ctx.player.pl;
    const mv = window.__ctx.player.mv;
    const dt = 1 / 60;
    pl.p.set(-100, 33.6 + 1.6, -176); pl.vy = 0; pl.onGround = true; pl.y = Math.PI / 2; pl.pi = 0;
    const log = [];
    for (let i = 0; i < 900; i++) {
      mv(0, -1, dt); // 朝 -z(北)走,穿越 z=-180
      if (i % 60 === 0) log.push({ i, z: +pl.p.z.toFixed(1), y: +pl.p.y.toFixed(2), g: pl.onGround });
    }
    return log;
  });
  console.log('=== 二楼东段(x=-100)向 -z(北)走 15 秒:实测穿越 z=-180 悬崖 ===');
  for (const l of t2) console.log(JSON.stringify(l));

  await page.screenshot({ path: 'scripts/artifacts/stair-diag2.png' });
  await b.close();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
