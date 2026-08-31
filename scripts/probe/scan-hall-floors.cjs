// scan-hall-floors.cjs — 扫描大堂各 XZ 位置的地板高度,找一楼/二楼地板与楼梯斜面
const { launch } = require('../probe/browser.js');
(async () => {
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.goto('http://localhost:3282/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__ctx && window.__ctx.player && window.__ctx.player.pl, { timeout: 60000 });
  // 触发进大堂
  await page.evaluate(() => { window.__ctx.player.pl.p.set(6, window.__ctx.player.pl.p.y, 24.9); });
  await page.waitForTimeout(10000);
  const res = await page.evaluate(() => {
    const out = { hall: null, samples: [] };
    let obj = null;
    for (const [url, o] of window.__museum.cache) { obj = o; out.hall = url; break; }
    if (!obj) return { err: 'no hall loaded' };
    obj.updateMatrixWorld(true);
    // 收集所有 mesh
    const meshes = [];
    obj.traverse(m => { if (m.isMesh && m.geometry) meshes.push(m); });
    out.meshCount = meshes.length;
    // 用射线从高处向下打,采样地板高度
    const THREE_Raycaster = obj.children[0] ? null : null;
    // 手动射线-三角形太慢,改用简化方法:统计每个 mesh 的 bbox 高度分层
    const layers = [];
    for (const m of meshes) {
      m.geometry.computeBoundingBox();
      const g = m.geometry.boundingBox;
      const w = m.matrixWorld.elements;
      // 变换 8 个角点取世界 AABB
      let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      for (const px of [g.min.x, g.max.x]) for (const py of [g.min.y, g.max.y]) for (const pz of [g.min.z, g.max.z]) {
        const wx = w[0] * px + w[4] * py + w[8] * pz + w[12];
        const wy = w[1] * px + w[5] * py + w[9] * pz + w[13];
        const wz = w[2] * px + w[6] * py + w[10] * pz + w[14];
        mn[0] = Math.min(mn[0], wx); mx[0] = Math.max(mx[0], wx);
        mn[1] = Math.min(mn[1], wy); mx[1] = Math.max(mx[1], wy);
        mn[2] = Math.min(mn[2], wz); mx[2] = Math.max(mx[2], wz);
      }
      layers.push({ name: (m.name || m.parent?.name || '?').slice(0, 30), yMin: +mn[1].toFixed(1), yMax: +mx[1].toFixed(1), xMin: +mn[0].toFixed(0), xMax: +mx[0].toFixed(0), zMin: +mn[2].toFixed(0), zMax: +mx[2].toFixed(0) });
    }
    layers.sort((a, c) => a.yMin - c.yMin);
    out.layers = layers;
    return out;
  });
  console.log(JSON.stringify(res));
  await b.close();
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });