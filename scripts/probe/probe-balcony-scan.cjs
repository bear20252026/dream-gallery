// probe-balcony-scan.cjs — 1m 数值扫描三条回廊边带 + 楼梯两翼,确定可行走区精确边界
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
    rc.far = 100;
    function surf(x, z) {
      rc.set(new T.Vector3(x, 33.5, z), new T.Vector3(0, -1, 0));
      const hits = rc.intersectObjects(meshes, false);
      for (const h of hits) if (h.point.y < 33.5) return +h.point.y.toFixed(2);
      return null; // 射到 33.5 以下无面(空洞/1F 之下不算,从 33.5 起射只会命中回廊)
    }
    // 北回廊: x -196→-82 步4, z -208→-198 步1
    const lines = [];
    lines.push('=== 北回廊 (行=z -208→-198 步1, 列=x -196→-82 步4, .=33.5以下无面) ===');
    let head = 'z\\\\x ';
    for (let x = -196; x <= -82; x += 4) head += String(x).slice(-4).padStart(6);
    lines.push(head);
    for (let z = -208; z <= -198; z++) {
      let row = String(z).padStart(4) + ' ';
      for (let x = -196; x <= -82; x += 4) {
        const h = surf(x, z);
        row += (h === null ? '     .' : String(h).padStart(6));
      }
      lines.push(row);
    }
    // 南回廊: z -182→-172
    lines.push('=== 南回廊 (行=z -182→-172 步1) ===');
    for (let z = -182; z <= -172; z++) {
      let row = String(z).padStart(4) + ' ';
      for (let x = -196; x <= -82; x += 4) {
        const h = surf(x, z);
        row += (h === null ? '     .' : String(h).padStart(6));
      }
      lines.push(row);
    }
    // 东回廊: x -104→-78 步1, z -206→-174 步4
    lines.push('=== 东回廊 (行=x -104→-78 步1, 列=z -206→-174 步4) ===');
    head = 'x\\\\z ';
    for (let z = -206; z <= -174; z += 4) head += String(z).padStart(6);
    lines.push(head);
    for (let x = -104; x <= -78; x++) {
      let row = String(x).padStart(4) + ' ';
      for (let z = -206; z <= -174; z += 4) {
        const h = surf(x, z);
        row += (h === null ? '     .' : String(h).padStart(6));
      }
      lines.push(row);
    }
    // 楼梯两翼: x -194→-166 步2, z -208→-172 步2 (数值)
    lines.push('=== 楼梯区数值图 (行=z -208→-172 步2, 列=x -194→-166 步2) ===');
    head = 'z\\\\x ';
    for (let x = -194; x <= -166; x += 2) head += String(x).slice(-4).padStart(6);
    lines.push(head);
    for (let z = -208; z <= -172; z += 2) {
      let row = String(z).padStart(4) + ' ';
      for (let x = -194; x <= -166; x += 2) {
        const h = surf(x, z);
        row += (h === null ? '     .' : String(h).padStart(6));
      }
      lines.push(row);
    }
    return lines;
  });
  console.log(out.join('\n'));

  await b.close();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
