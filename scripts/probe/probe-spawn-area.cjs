// probe-spawn-area.cjs — 线上探针:扫出生点周边可见物件(2026-09-03)
// 目的:出生点迁到 z=27 后,周围哪些物件过时、错位、不见了?
// 范围:出生点 ±15m(x: -15~15, z: 12~42);逐 mesh 输出 name/worldPos/可见性
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

  const out = await page.evaluate(() => {
    const s = window.__ctx.scene.s; // 真实 THREE.Scene
    const pl = window.__ctx.player.pl;
    // 把出生点放到 SPAWN(z=27 面朝南,pl.p 是 Vector3,pl.y 是 yaw)
    pl.p.set(-0.1, 1.6, 27);
    pl.y = (182 * Math.PI) / 180;
    window.__ctx.scene.cam.position.copy(pl.p);

    const SPAWN = { x: pl.p.x, z: pl.p.z };
    const box = { xMin: SPAWN.x - 15, xMax: SPAWN.x + 15, zMin: 12, zMax: 42 };
    const list = [];
    const tmp = new (Object.getPrototypeOf(pl.p).constructor)(0, 0, 0);
    s.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      o.getWorldPosition(tmp);
      const v = tmp;
      if (v.x < box.xMin || v.x > box.xMax || v.z < box.zMin || v.z > box.zMax) return;
      o.updateWorldMatrix(true, false);
      const lb = o.geometry && o.geometry.boundingBox;
      let sx = 0, sy = 0, sz = 0;
      if (lb) {
        sx = lb.max.x - lb.min.x;
        sy = lb.max.y - lb.min.y;
        sz = lb.max.z - lb.min.z;
        sx *= Math.abs(o.scale.x); sy *= Math.abs(o.scale.y); sz *= Math.abs(o.scale.z);
      }
      if (sx < 0.3 && sy < 0.3 && sz < 0.3) return;
      list.push({
        name: o.name || '(unnamed)',
        mat: (o.material && o.material.name) || (o.material && o.material.type) || '-',
        pos: [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)],
        size: [+sx.toFixed(2), +sy.toFixed(2), +sz.toFixed(2)],
        distFromSpawn: +Math.hypot(v.x - SPAWN.x, v.z - SPAWN.z).toFixed(2),
        angle: +(((Math.atan2(v.x - SPAWN.x, v.z - SPAWN.z)) * 180 / Math.PI + 360) % 360).toFixed(0),
      });
    });
    list.sort((a, b) => a.distFromSpawn - b.distFromSpawn);
    return {
      spawn: [SPAWN.x, SPAWN.z],
      count: list.length,
      nearest: list.slice(0, 30),
      farSampled: list.slice(30, 50),
    };
  });

  console.log('=== 出生点周边物件扫描 (z=27 朝南,范围 x±15 / z 12~42) ===');
  console.log('出生点:', out.spawn, '总物件:', out.count);
  console.log('--- 最近的 30 个 (按距离排序) ---');
  console.table(out.nearest.map(o => ({
    name: (o.name.length > 24 ? o.name.slice(0, 22) + '..' : o.name),
    mat: (o.mat.length > 12 ? o.mat.slice(0, 10) + '..' : o.mat),
    X: o.pos[0], Y: o.pos[1], Z: o.pos[2],
    size: o.size.join('x'),
    dist: o.distFromSpawn,
    angle: o.angle,
  })));
  if (out.farSampled.length) {
    console.log('--- 较远的 20 个 (抽样) ---');
    console.table(out.farSampled.map(o => ({
      name: (o.name.length > 24 ? o.name.slice(0, 22) + '..' : o.name),
      X: o.pos[0], Z: o.pos[2],
      dist: o.distFromSpawn,
    })));
  }
  // 第二次扫描:定向核查"位置可能过时"的物件 —— 地板照片(z=17)、户外牌子(x=23)、
// 以及出生点正前方(z 27~55,玩家一睁眼看到的方向)到底有什么
  const targeted = await page.evaluate(() => {
    const s = window.__ctx.scene.s;
    const pick = [];
    s.traverse((o) => {
      const nm = (o.name || '').toLowerCase();
      const isSign = /sign|guide|准则|智能|post|base/.test(nm) && o.isMesh;
      const isPhoto = /photo|fh|fborder|floor|mark|marker|画/.test(nm) && o.isMesh;
      const isFountain = /fountain|bezier|zsolnay/.test(nm);
      if (!isSign && !isPhoto && !isFountain) return;
      const v = new (Object.getPrototypeOf(window.__ctx.player.pl.p).constructor)(0, 0, 0);
      o.getWorldPosition(v);
      // 可见性:自身 + 所有祖先
      let vis = o.visible, p = o.parent;
      while (p) { if (!p.visible) { vis = false; break; } p = p.parent; }
      pick.push({
        name: o.name || '(unnamed)',
        type: isFountain ? 'fountain' : isSign ? 'sign' : 'photo',
        pos: [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)],
        visible: vis,
        distFromSpawn: +Math.hypot(v.x + 0.1, v.z - 27).toFixed(2),
      });
    });
    // 出生点正前方(z > 27)的全部可见 mesh,看看玩家一睁眼看到什么
    const front = [];
    s.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const v = new (Object.getPrototypeOf(window.__ctx.player.pl.p).constructor)(0, 0, 0);
      o.getWorldPosition(v);
      if (v.z <= 27 || v.z > 55 || v.x < -40 || v.x > 40) return;
      front.push({
        name: (o.name || '(unnamed)').slice(0, 34),
        pos: [+v.x.toFixed(1), +v.y.toFixed(1), +v.z.toFixed(1)],
      });
    });
    front.sort((a, b) => a.pos[2] - b.pos[2]);
    return { pick: pick.slice(0, 40), frontCount: front.length, front: front.slice(0, 18) };
  });

  console.log('=== 定向核查:牌子 / 照片 / 喷泉 ===');
  if (targeted.pick.length) {
    console.table(targeted.pick.map(o => ({
      name: o.name.slice(0, 30), type: o.type,
      X: o.pos[0], Y: o.pos[1], Z: o.pos[2],
      visible: o.visible, dist: o.distFromSpawn,
    })));
  } else console.log('(未匹配到任何 sign/photo/fountain 物件)');

  console.log('=== 出生点正前方 z 27~55 可见物件: ' + targeted.frontCount + ' 个 ===');
  console.table(targeted.front.map(o => ({ name: o.name, X: o.pos[0], Y: o.pos[1], Z: o.pos[2] })));

  console.log('errors:', errors.length ? errors : 'none');
  await b.close();
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });