// 诊断:dump 婚礼拱廊每段实例下所有网格的世界 AABB / 名称 / 材质 / 是否半透明
// 目的:为"玻璃可穿、柱子不可穿"的碰撞规则提供真实尺寸数据
const { launch } = require('../probe/browser.js');

(async () => {
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const logs = [];
  page.on('console', (m) => logs.push(m.text()));
  await page.addInitScript(() => {
    for (const [k, v] of Object.entries({
      agreementConsented: '1',
      privacyConsented: '1',
      communityConsented: '1',
      skipOpening: '1',
      prologueDone: '1',
      nickPopOff: '1',
    }))
      sessionStorage.setItem(k, v);
  });
  await page.goto('http://localhost:5173/?noopening&noprologue', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForFunction(() => window.__ctx && window.__ctx.player && window.__ctx.player.pl, {
    timeout: 60000,
  });
  const clickBtn = (kw) =>
    page.evaluate((k) => {
      const el = [...document.querySelectorAll('button')].find((b) =>
        (b.textContent || '').replace(/\s/g, '').includes(k)
      );
      if (!el) return 'no-match:' + k;
      const r = el.getBoundingClientRect();
      for (const type of ['pointerdown', 'pointerup', 'click'])
        el.dispatchEvent(
          new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: r.x + r.width / 2,
            clientY: r.y + r.height / 2,
          })
        );
      return 'ok';
    }, kw);
  try {
    await clickBtn('男');
  } catch (e) {}
  await page.waitForTimeout(1200);
  try {
    await clickBtn('先逛逛');
  } catch (e) {}
  await page.waitForTimeout(2500);
  try {
    await page.getByText('跳过序章', { exact: false }).click({ timeout: 6000 });
  } catch (e) {}
  await page.waitForTimeout(3000);

  const out = await page.evaluate(() => {
    const s = window.__ctx.scene.s;
    const shells = [];
    s.traverse((o) => {
      if (o.name && /^weddingShell/.test(o.name)) shells.push(o);
    });
    if (!shells.length) return { err: 'no shell found' };
    // 只分析第 0 段(几何与其他段完全一致)
    const root = shells[0];
    root.updateMatrixWorld(true);
    const groups = new Map();
    let visible = 0;
    root.traverse((o) => {
      if (!o.isMesh) return;
      visible++;
      // 世界 AABB:遍历几何顶点采样
      const g = o.geometry;
      const pos = g.attributes.position;
      if (!pos) return;
      const step = Math.max(1, Math.floor(pos.count / 400));
      const mn = [Infinity, Infinity, Infinity];
      const mx = [-Infinity, -Infinity, -Infinity];
      const v = { x: 0, y: 0, z: 0 };
      for (let i = 0; i < pos.count; i += step) {
        v.x = pos.getX(i);
        v.y = pos.getY(i);
        v.z = pos.getZ(i);
        // 手动套 matrixWorld
        const e = o.matrixWorld.elements;
        const wx = e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12];
        const wy = e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13];
        const wz = e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14];
        if (wx < mn[0]) mn[0] = wx;
        if (wy < mn[1]) mn[1] = wy;
        if (wz < mn[2]) mn[2] = wz;
        if (wx > mx[0]) mx[0] = wx;
        if (wy > mx[1]) mx[1] = wy;
        if (wz > mx[2]) mx[2] = wz;
      }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const m0 = mats[0];
      const isGlass = mats.some((m) => m.transparent === true || (m.opacity !== undefined && m.opacity < 1));
      const grp = (o.name || '?').replace(/[0-9]+.*$/, '').replace(/_$/, '') || '?';
      if (!groups.has(grp))
        groups.set(grp, {
          n: 0,
          glass: 0,
          matName: m0.name,
          alpha: m0.transparent ? 'TRANSP' : 'OPAQUE',
          sxMax: 0,
          syMax: 0,
          szMax: 0,
          yMinAll: Infinity,
          yMaxAll: -Infinity,
          samples: [],
        });
      const e = groups.get(grp);
      e.n++;
      if (isGlass) e.glass++;
      e.sxMax = Math.max(e.sxMax, mx[0] - mn[0]);
      e.syMax = Math.max(e.syMax, mx[1] - mn[1]);
      e.szMax = Math.max(e.szMax, mx[2] - mn[2]);
      e.yMinAll = Math.min(e.yMinAll, mn[1]);
      e.yMaxAll = Math.max(e.yMaxAll, mx[1]);
      if (e.samples.length < 2)
        e.samples.push({
          name: o.name,
          mn: mn.map((n) => +n.toFixed(2)),
          mx: mx.map((n) => +n.toFixed(2)),
        });
    });
    return {
      shellCount: shells.length,
      meshCount: visible,
      groups: [...groups.entries()].map(([k, v]) => ({
        group: k,
        n: v.n,
        glass: v.glass,
        mat: v.matName,
        alpha: v.alpha,
        sizeMax: [+v.sxMax.toFixed(2), +v.syMax.toFixed(2), +v.szMax.toFixed(2)],
        yRange: [+v.yMinAll.toFixed(2), +v.yMaxAll.toFixed(2)],
        samples: v.samples,
      })),
    };
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
