// 诊断:进入大堂后隐藏协议层,截图验证大堂渲染
const { launch } = require('./browser.js');
(async () => {
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.goto('http://localhost:3282/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__ctx && window.__ctx.player && window.__ctx.player.pl, { timeout: 60000 });
  await page.evaluate(() => { window.__ctx.player.pl.p.set(6, window.__ctx.player.pl.p.y, 24.9); });
  await page.waitForTimeout(7000); // 触发 enterHall + 加载
  await page.evaluate(() => { window.__ctx.player.pl.p.set(-138, window.__ctx.player.pl.p.y, -186); });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { const pv = document.getElementById('panelOv'); if (pv) pv.style.display = 'none'; });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'scripts/artifacts/museum-hall-visual.png' });
  const st = await page.evaluate(() => {
    const s = window.__ctx.scene.s;
    const out = { current: window.__museum.current, hits: [] };
    const target = [-138, 1.6, -186];
    for (const o of s.children) {
      if (!o.children || !o.children.length) continue;
      o.updateMatrixWorld(true);
      const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      let meshes = 0;
      const info = [];
      o.traverse((m) => {
        if (!m.isMesh) return;
        meshes++;
        m.geometry.computeBoundingBox();
        const g = m.geometry.boundingBox, w = m.matrixWorld.elements;
        for (const [px, py, pz] of [[g.min.x, g.min.y, g.min.z], [g.max.x, g.max.y, g.max.z]]) {
          const wx = w[0] * px + w[4] * py + w[8] * pz + w[12];
          const wy = w[1] * px + w[5] * py + w[9] * pz + w[13];
          const wz = w[2] * px + w[6] * py + w[10] * pz + w[14];
          mn[0] = Math.min(mn[0], wx); mx[0] = Math.max(mx[0], wx);
          mn[1] = Math.min(mn[1], wy); mx[1] = Math.max(mx[1], wy);
          mn[2] = Math.min(mn[2], wz); mx[2] = Math.max(mx[2], wz);
        }
        if (info.length < 1) {
          const mm = Array.isArray(m.material) ? m.material[0] : m.material;
          info.push({ matType: mm ? mm.type : 'null', hasMap: mm ? !!mm.map : false, side: mm ? mm.side : null });
        }
      });
      const inside = target.every((t, i) => t >= mn[i] - 2 && t <= mx[i] + 2);
      if (inside) out.hits.push({ type: o.type, rootVisible: o.visible, meshes, box: { mn: mn.map((n) => +n.toFixed(0)), mx: mx.map((n) => +n.toFixed(0)) }, info });
    }
    return out;
  });
  console.log(JSON.stringify(st, null, 1).slice(0, 1500));
  await b.close();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
