// prince-pos-probe.cjs — 精量小王子位置偏差(rigged GLB 基准点取证,2026-09-25)
const { launch } = require('./browser.js');
(async () => {
  const URL = process.env.PROBE_URL || 'https://cloudbear.cloud';
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.goto(URL + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#b612Gate', { timeout: 90000 });
  await page.waitForTimeout(1200);
  await page.check('#b612Gate #gAgreeChk');
  await page.click('#b612Gate .gEnter');
  await page.waitForSelector('#b612film', { timeout: 30000 });
  await page.waitForSelector('#cHat', { timeout: 30000 });
  await page.waitForTimeout(400);
  await page.click('#cHat').catch(() => {});
  await page.waitForFunction(() => !document.getElementById('b612film'), null, { timeout: 150000 });
  await page.waitForFunction(() => window.__ctx && window.__ctx.scene && window.__princeDebug, null, { timeout: 30000 });
  await page.waitForTimeout(9000); // 等王子走完 idle

  const m = await page.evaluate(() => {
    const s = window.__ctx.scene.s;
    const V = Object.getPrototypeOf(window.__ctx.player.pl.p).constructor; // THREE.Vector3
    let wrap = null;
    s.traverse((o) => { if (o.name === 'littlePrince') wrap = o; });
    if (!wrap) return { found: false };
    const inner = wrap.children[0];
    function calc(o) {
      const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      o.traverse((c) => {
        if (!c.isMesh) return;
        c.geometry.computeBoundingBox();
        const bb = c.geometry.boundingBox;
        const cs = [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z];
        for (const [x, y, z] of [[cs[0], cs[1], cs[2]], [cs[3], cs[4], cs[5]], [cs[0], cs[4], cs[2]], [cs[3], cs[1], cs[5]]]) {
          const w = c.localToWorld(new V(x, y, z));
          mn[0] = Math.min(mn[0], w.x); mx[0] = Math.max(mx[0], w.x);
          mn[1] = Math.min(mn[1], w.y); mx[1] = Math.max(mx[1], w.y);
          mn[2] = Math.min(mn[2], w.z); mx[2] = Math.max(mx[2], w.z);
        }
      });
      return { mn: mn.map((v) => +v.toFixed(2)), mx: mx.map((v) => +v.toFixed(2)) };
    }
    const wp = wrap.position;
    return {
      found: true,
      wrapPos: { x: +wp.x.toFixed(2), y: +wp.y.toFixed(2), z: +wp.z.toFixed(2) },
      wrapWorldBBox: calc(wrap),
      innerScale: inner.scale.x,
      innerPos: { x: +inner.position.x.toFixed(3), y: +inner.position.y.toFixed(3), z: +inner.position.z.toFixed(3) },
      state: window.__princeDebug.state(),
    };
  });
  console.log(JSON.stringify(m, null, 1));
  process.exit(0);
})().catch((e) => { console.error('探针异常:', e.message); process.exit(2); });
