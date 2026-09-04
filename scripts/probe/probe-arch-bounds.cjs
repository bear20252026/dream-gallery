// probe-arch-bounds.cjs — 线上探针:实测三段拱廊整体边界 + 定位过时物件(2026-09-03 v2)
const { launch } = require('../probe/browser.js');

(async () => {
  const URL = process.env.PROBE_URL || 'http://localhost:5173';
  const WAIT = +(process.env.PROBE_WAIT_MS || 60000);
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.addInitScript(() => {
    for (const k of ['agreementConsented','privacyConsented','communityConsented','skipOpening','prologueDone','nickPopOff'])
      sessionStorage.setItem(k, '1');
  });
  await page.goto(URL + '/?noopening&noprologue', { waitUntil: 'domcontentloaded', timeout: WAIT });
  await page.waitForFunction(() => window.__ctx && window.__ctx.player && window.__ctx.player.pl, { timeout: WAIT });
  const clickBtn = (kw) => page.evaluate((k) => {
    const el = [...document.querySelectorAll('button')].find((r) => (r.textContent||'').replace(/\s/g,'').includes(k));
    if (!el) return; const r = el.getBoundingClientRect();
    for (const t of ['pointerdown','pointerup','click'])
      el.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2}));
  }, kw);
  await clickBtn('男').catch(()=>{}); await page.waitForTimeout(1200);
  await clickBtn('先逛逛').catch(()=>{}); await page.waitForTimeout(2000);
  await page.getByText('跳过序章',{exact:false}).click({timeout:6000}).catch(()=>{});
  await page.waitForFunction(() => window.__fountainReady === true, { timeout: WAIT }).catch(()=>{});
  await page.waitForTimeout(1500);

  const r = await page.evaluate(() => {
    const s = window.__ctx.scene.s;
    const V = Object.getPrototypeOf(window.__ctx.player.pl.p).constructor;

    // ---- 1) 三段拱廊整体 bbox(weddingShell*) ----
    const shells = [];
    s.traverse((o) => {
      if (o.isMesh) return;
      if (/weddingShell/i.test(o.name || '')) shells.push(o);
    });
    const shellNames = shells.map((o) => o.name || '(unnamed)');
    let worldBox = null;
    if (shells.length) {
      let mnX = 1e9, mxX = -1e9, mnY = 1e9, mxY = -1e9, mnZ = 1e9, mxZ = -1e9, totalN = 0;
      shells.forEach((sh) => {
        sh.updateMatrixWorld(true);
        sh.traverse((o) => {
          if (!o.isMesh || !o.visible || !o.geometry) return;
          o.geometry.computeBoundingBox();
          const bb = o.geometry.boundingBox;
          for (let i = 0; i < 8; i++) {
            const p = new V(
              i & 1 ? bb.max.x : bb.min.x,
              i & 2 ? bb.max.y : bb.min.y,
              i & 4 ? bb.max.z : bb.min.z
            );
            p.applyMatrix4(o.matrixWorld);
            mnX = Math.min(mnX, p.x); mxX = Math.max(mxX, p.x);
            mnY = Math.min(mnY, p.y); mxY = Math.max(mxY, p.y);
            mnZ = Math.min(mnZ, p.z); mxZ = Math.max(mxZ, p.z);
          }
          totalN++;
        });
      });
      worldBox = {
        x: [+mnX.toFixed(2), +mxX.toFixed(2)],
        y: [+mnY.toFixed(2), +mxY.toFixed(2)],
        z: [+mnZ.toFixed(2), +mxZ.toFixed(2)],
        meshes: totalN,
      };
    }

    // ---- 2) 反查 userData 标记 / 材质特征定位无名物件 ----
    const found = [];
    const v = new V(0, 0, 0);
    s.traverse((o) => {
      if (!o.isMesh) return;
      o.getWorldPosition(v);
      const ud = o.userData || {};
      const mat = o.material || {};
      let tag = null;
      if (ud.isSign) tag = 'sign(isSign)';
      else if (mat.emissive && mat.emissive.getHexString && mat.emissive.getHexString() === 'ff6699') tag = 'sign(emissive)';
      else if (mat.map && mat.map.image && mat.map.image.src && /1000001707/.test(mat.map.image.src)) tag = 'floor-photo(tex)';
      else if (o.geometry && o.geometry.type === 'PlaneGeometry' && v.y < 0.1 && Math.abs(v.z - 17) < 0.5) tag = 'floor-photo(z=17)';
      if (!tag) return;
      let vis = o.visible, p = o.parent;
      while (p) { if (!p.visible) { vis = false; break; } p = p.parent; }
      found.push({
        tag,
        pos: [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)],
        visible: vis,
      });
    });

    // ---- 3) ctx.media 暴露的关键引用 ----
    const mediaPos = {};
    for (const k of ['signMesh', 'guideMesh', 'mpMesh']) {
      const m = window.__ctx.media && window.__ctx.media[k];
      if (m && m.getWorldPosition) {
        const p = new V(0, 0, 0); m.getWorldPosition(p);
        mediaPos[k] = [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)];
      }
    }

    return { shellNames, worldBox, found, mediaPos };
  });

  console.log('=== 三段拱廊整体边界 ===');
  console.log('识别到的 shell 数:', r.shellNames.length, ' 名称:', r.shellNames);
  if (r.worldBox) {
    const wb = r.worldBox;
    console.log('  X ∈', wb.x, ' (宽', (wb.x[1] - wb.x[0]).toFixed(2), 'm)');
    console.log('  Y ∈', wb.y, ' (高', (wb.y[1] - wb.y[0]).toFixed(2), 'm)');
    console.log('  Z ∈', wb.z, ' (深', (wb.z[1] - wb.z[0]).toFixed(2), 'm)');
    console.log('  中心 (', ((wb.x[0] + wb.x[1]) / 2).toFixed(2), ',', ((wb.z[0] + wb.z[1]) / 2).toFixed(2), ')');
    console.log('  共扫描 mesh:', wb.meshes);
    console.log('  → 旧建筑 OL/OR=±18 / OT/OBR=-12~28 / 中心 z=8');
  }
  console.log('=== 反查过时物件(出生点迁移后未跟迁) ===');
  console.table(r.found.map(o => ({ tag: o.tag, X: o.pos[0], Y: o.pos[1], Z: o.pos[2], visible: o.visible })));
  console.log('=== ctx.media 关键引用 ===');
  console.log(r.mediaPos);
  console.log('errors:', errors.length ? errors : 'none');
  await b.close();
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });