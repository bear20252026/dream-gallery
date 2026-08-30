// 线上塔楼验证探针:按 6 个圆周坐标精确匹配,输出数量与子节点
const { BASE_URL, launch } = require('./browser.js');
(async () => {
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(14000);
  const r = await page.evaluate(() => {
    const s = window.__ctx && window.__ctx.scene && window.__ctx.scene.s;
    if (!s) return { err: 'no scene' };
    const expected = [];
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + Math.PI / 6;
      expected.push([Math.sin(ang) * 30, 8 + Math.cos(ang) * 30]);
    }
    const hits = expected.map(([ex, ez]) => {
      const o = s.children.find(
        (c) => Math.abs(c.position.x - ex) < 2 && Math.abs(c.position.z - ez) < 2
      );
      if (!o) return null;
      // 立起验证:用递归世界包围盒算 Y 高度(立起≈8.5m,躺倒只有≈3.5m)
      let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
      o.traverse((m) => {
        if (!m.isMesh) return;
        m.geometry.computeBoundingBox();
        const g = m.geometry.boundingBox, w = m.matrixWorld.elements;
        // 8 个角点变换到世界系
        for (const [px, py, pz] of [
          [g.min.x, g.min.y, g.min.z], [g.max.x, g.min.y, g.min.z],
          [g.min.x, g.max.y, g.min.z], [g.max.x, g.max.y, g.min.z],
          [g.min.x, g.min.y, g.max.z], [g.max.x, g.min.y, g.max.z],
          [g.min.x, g.max.y, g.max.z], [g.max.x, g.max.y, g.max.z],
        ]) {
          const wx = w[0] * px + w[4] * py + w[8] * pz + w[12];
          const wy = w[1] * px + w[5] * py + w[9] * pz + w[13];
          const wz = w[2] * px + w[6] * py + w[10] * pz + w[14];
          minY = Math.min(minY, wy); maxY = Math.max(maxY, wy);
          minX = Math.min(minX, wx); maxX = Math.max(maxX, wx);
        }
      });
      return {
        pos: [+o.position.x.toFixed(1), +o.position.z.toFixed(1)],
        worldH: +(maxY - minY).toFixed(2),
        worldW: +(maxX - minX).toFixed(2),
        baseY: +minY.toFixed(2),
      };
    });
    const up = hits.filter(Boolean).filter((h) => h.worldH > 7 && Math.abs(h.baseY) < 1).length;
    return { towers: hits.filter(Boolean).length, standing: up, detail: hits };
  });
  console.log(JSON.stringify(r, null, 1));
  await page.screenshot({ path: 'scripts/artifacts/dome-towers-live.png' });
  await b.close();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
