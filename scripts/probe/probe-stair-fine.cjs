// probe-stair-fine.cjs — 1米精度扫描西端楼梯区,输出 ASCII 高度图
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
      rc.set(new T.Vector3(x, 35, z), new T.Vector3(0, -1, 0));
      const hits = rc.intersectObjects(meshes, false);
      for (const h of hits) if (h.point.y < 35) return +h.point.y.toFixed(1);
      return null;
    }
    // 行=z(北-212 → 南-166),列=x(西-205 → 东-157),步长 1m
    const rows = [];
    for (let z = -212; z <= -166; z += 1) {
      const cells = [];
      for (let x = -205; x <= -157; x += 1) {
        const h = surf(x + 0.5, z + 0.5);
        if (h === null) cells.push(' ');
        else if (h < 22.5) cells.push('.');      // 1F 地板 ~20.8
        else if (h < 25) cells.push('1');
        else if (h < 27.5) cells.push('2');
        else if (h < 30) cells.push('3');
        else if (h < 32) cells.push('4');
        else if (h < 34.5) cells.push('#');      // 2F 楼板 ~32-33.6
        else cells.push('^');                     // 更高(装饰/墙顶)
      }
      rows.push('z=' + String(z).padStart(4) + ' ' + cells.join(''));
    }
    // 列头(x 坐标标注,每 5m 一个)
    let head = '       ';
    for (let x = -205; x <= -157; x += 1) head += (x % 5 === 0 ? Math.abs(x) % 10 : ' ');
    return head + '\n' + rows.join('\n');
  });
  console.log(map);

  // 额外:楼梯中心线上逐点打印精确高度(x=-181,z -212..-166)
  const prof = await page.evaluate(async () => {
    const obj = window.__museum.cache.get('/models/hall/hall.glb');
    obj.updateMatrixWorld(true);
    const meshes = [];
    obj.traverse((m) => { if (m.isMesh && m.geometry) meshes.push(m); });
    const T = await import('/vendor/three.module.js');
    const rc = new T.Raycaster();
    function surf(x, z) {
      rc.set(new T.Vector3(x, 35, z), new T.Vector3(0, -1, 0));
      const hits = rc.intersectObjects(meshes, false);
      for (const h of hits) if (h.point.y < 35) return +h.point.y.toFixed(2);
      return null;
    }
    const out = [];
    for (let z = -212; z <= -166; z += 2) {
      out.push('x=-181 z=' + z + ' -> ' + surf(-181, z));
    }
    return out.join('\n');
  });
  console.log('--- 中心剖面 x=-181 ---\n' + prof);

  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
