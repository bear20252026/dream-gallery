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
  await page.waitForFunction(() => !document.getElementById('b612film'), null, { timeout: 180000 });
  await page.waitForFunction(() => window.__ctx && window.__princeDebug, null, { timeout: 30000 });
  await page.waitForTimeout(8000);
  const m = await page.evaluate(() => {
    const s = window.__ctx.scene.s;
    const V = Object.getPrototypeOf(window.__ctx.player.pl.p).constructor;
    let wrap = null;
    s.traverse((o) => { if (o.name === 'littlePrince') wrap = o; });
    if (!wrap) return { found: false };
    const inner = wrap.children[0];
    const out = { chunks: [], three: (window.__ctx.scene.s.children[0] && window.__ctx.scene.s.children[0].constructor.name) };
    inner.traverse((c) => {
      if (!c.isMesh) return;
      c.geometry.computeBoundingBox();
      const bb = c.geometry.boundingBox;
      // 蒙皮逐顶点(precise 路径复刻)
      let pmn = [1e9,1e9,1e9], pmx = [-1e9,-1e9,-1e9];
      const v = new V();
      const n = c.geometry.getAttribute('position').count;
      const step = Math.max(1, Math.floor(n / 800));
      for (let i = 0; i < n; i += step) {
        c.getVertexPosition(i, v);
        const w = v.clone().applyMatrix4(c.matrixWorld);
        pmn[0]=Math.min(pmn[0],w.x); pmn[1]=Math.min(pmn[1],w.y); pmn[2]=Math.min(pmn[2],w.z);
        pmx[0]=Math.max(pmx[0],w.x); pmx[1]=Math.max(pmx[1],w.y); pmx[2]=Math.max(pmx[2],w.z);
      }
      out.chunks.push({
        name: c.name || (c.parent && c.parent.name),
        skinned: !!c.isSkinnedMesh,
        visible: c.visible,
        rawMinY: +bb.min.y.toFixed(1), rawMaxY: +bb.max.y.toFixed(1),
        skinnedMinY: +pmn[1].toFixed(2), skinnedMaxY: +pmx[1].toFixed(2),
        verts: n,
      });
    });
    out.innerPos = +inner.position.y.toFixed(3);
    return out;
  });
  console.log(JSON.stringify(m, null, 1));
  process.exit(0);
})().catch((e) => { console.error('探针异常:', e.message); process.exit(2); });
