// probe-stair-diag.cjs — 诊断大堂楼梯掉落:采样视觉几何高度 + 实测掉落路径
// 输出:①楼梯区射线采样(视觉表面高度网格) ②二楼边缘行走是否掉落 ③截图
const { launch } = require('../probe/browser.js');

(async () => {
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 150)));
  await page.goto('http://localhost:3282/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__ctx && window.__ctx.player && window.__ctx.player.pl, { timeout: 60000 });
  // 进大堂
  await page.evaluate(() => window.__ctx.player.pl.p.set(6, window.__ctx.player.pl.p.y, 24.9));
  await page.waitForTimeout(9000);
  const cur = await page.evaluate(() => window.__museum && window.__museum.current);
  if (cur !== 'hall') { console.log('ERR 没进大堂:', cur, 'errors:', errors); await b.close(); process.exit(1); }

  // ① 视觉表面高度网格:在楼梯区上方 60m 向下射线,取首个命中(模型 mesh)
  const grid = await page.evaluate(async () => {
    const obj = window.__museum.cache.get('/models/hall/hall.glb');
    if (!obj) return { err: 'no hall' };
    obj.updateMatrixWorld(true);
    const meshes = [];
    obj.traverse((m) => { if (m.isMesh && m.geometry) meshes.push(m); });
    const T = await import('/vendor/three.module.js');
    const rc = new T.Raycaster();
    function visHeight(x, z) {
      const dir = new T.Vector3(0, -1, 0);
      rc.set(new T.Vector3(x, 60, z), dir);
      rc.far = 100;
      const hits = rc.intersectObjects(meshes, false);
      return hits.length ? +hits[0].point.y.toFixed(2) : null;
    }
    const out = [];
    for (let zi = 0; zi < 5; zi++) {
      const z = -192 + zi * 3;
      const row = [];
      for (let xi = 0; xi < 7; xi++) {
        const x = -179 + (xi * 57) / 6;
        row.push({ x: +x.toFixed(0), z, h: visHeight(x, z) });
      }
      out.push(row);
    }
    return out;
  });
  console.log('=== 楼梯区视觉表面网格(y=60 向下射线) ===');
  for (const row of grid) console.log(JSON.stringify(row));

  // ② 二楼边缘掉落实测:传送到二楼东段 (x=-100, z=-176),向 +z 走 10 秒
  const walkTest = await page.evaluate(async () => {
    const pl = window.__ctx.player.pl;
    const mv = window.__ctx.player.mv;
    const dt = 1 / 60;
    pl.p.set(-100, 33.6 + 1.6, -176); pl.vy = 0; pl.onGround = true; pl.y = -Math.PI / 2; pl.pi = 0;
    const log = [];
    for (let i = 0; i < 600; i++) {
      mv(0, 1, dt);
      if (i % 60 === 0) log.push({ i, x: +pl.p.x.toFixed(1), z: +pl.p.z.toFixed(1), y: +pl.p.y.toFixed(2), g: pl.onGround });
    }
    return log;
  });
  console.log('=== 二楼东段(x=-100)向 +z 走 10 秒 ===');
  for (const l of walkTest) console.log(JSON.stringify(l));

  // ③ groundOverride 采样
  const sample = await page.evaluate(() => {
    const g = window.__ctx.kunlun.groundOverride;
    const pts = [[-140, -190], [-150, -186], [-150, -183], [-150, -181], [-100, -176], [-100, -179], [-150, -176]];
    return { heights: pts.map(([x, z]) => ({ x, z, g: g ? g(x, z) : null })) };
  });
  console.log('=== groundOverride 采样 ===');
  console.log(JSON.stringify(sample.heights));

  await page.screenshot({ path: 'scripts/artifacts/stair-diag-hall.png' });
  console.log('pageerrors:', errors.length ? errors : '无');
  await b.close();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
