// verify-arch-walk.cjs — 拱廊"玻璃可穿 / 柱子不可穿"验收(2026-09-03)
// 三段验证:
//   A 落位报告:三段实例的真实世界包围盒(顺带核对段缝与南北外挑)
//   B 静态碰撞采样:柱子中心=挡、落地窗中心=通、馆外沙漠=通
//   C 真实键盘行走:朝窗外走能否走出去;朝柱子走是否被挡住
const { launch } = require('../probe/browser.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const logs = [];
  const errors = [];
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') errors.push(t);
    if (t.includes('[wedding]')) logs.push(t);
  });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
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
      if (!el) return 'no-match';
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
  await page.waitForTimeout(3500);
  // 关掉可能弹出的"先逛逛"引导卡(z=75,会遮住左上角坐标 HUD)
  await page.evaluate(() => {
    const gc = document.getElementById('guideCard');
    if (gc) {
      const b = [...gc.querySelectorAll('button')].find((x) => /先逛逛/.test(x.textContent || ''));
      if (b) b.click();
      else gc.remove();
    }
  });
  await sleep(500);

  const key = (k, down) =>
    page.evaluate(
      ([k, d]) => document.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { key: k, bubbles: true })),
      [k, down]
    );
  const teleport = (x, z, yaw) =>
    page.evaluate(
      ([x, z, yaw]) => {
        const pl = window.__ctx.player.pl;
        pl.p.set(x, pl.p.y, z);
        pl.y = yaw;
        pl.vy = 0;
        if (window.__ctx._orbit) window.__ctx._orbit.yaw = yaw;
      },
      [x, z, yaw]
    );
  const pos = () =>
    page.evaluate(() => {
      const p = window.__ctx.player.pl.p;
      return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) };
    });

  console.log('=== A 落位 + B 静态碰撞采样 ===');
  const report = await page.evaluate(() => {
    const s = window.__ctx.scene.s;
    const shells = [];
    s.traverse((o) => {
      if (/^weddingShell\d/.test(o.name || '')) shells.push(o);
    });
    s.updateMatrixWorld(true);
    const bboxOf = (o) => {
      const g = o.geometry;
      const p = g && g.attributes.position;
      if (!p) return null;
      const step = Math.max(1, Math.floor(p.count / 200));
      const mn = [Infinity, Infinity, Infinity],
        mx = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < p.count; i += step) {
        const e = o.matrixWorld.elements;
        const vx = p.getX(i),
          vy = p.getY(i),
          vz = p.getZ(i);
        const w = [
          e[0] * vx + e[4] * vy + e[8] * vz + e[12],
          e[1] * vx + e[5] * vy + e[9] * vz + e[13],
          e[2] * vx + e[6] * vy + e[10] * vz + e[14],
        ];
        for (let j = 0; j < 3; j++) {
          if (w[j] < mn[j]) mn[j] = w[j];
          if (w[j] > mx[j]) mx[j] = w[j];
        }
      }
      return { mn: mn.map((n) => +n.toFixed(2)), mx: mx.map((n) => +n.toFixed(2)) };
    };
    // 段包围盒
    const segs = shells.map((sh) => {
      let mn = [Infinity, Infinity, Infinity],
        mx = [-Infinity, -Infinity, -Infinity];
      sh.traverse((o) => {
        if (!o.isMesh) return;
        const bb = bboxOf(o);
        if (!bb) return;
        for (let j = 0; j < 3; j++) {
          mn[j] = Math.min(mn[j], bb.mn[j]);
          mx[j] = Math.max(mx[j], bb.mx[j]);
        }
      });
      return { name: sh.name, posZ: +sh.position.z.toFixed(2), mn, mx };
    });
    // 收集:柱子中心 / 落地窗(Line+Shape)中心
    const pillars = [],
      windows = [];
    shells[0].traverse((o) => {
      if (!o.isMesh) return;
      const bb = bboxOf(o);
      if (!bb) return;
      const c = [0, 1, 2].map((j) => (bb.mn[j] + bb.mx[j]) / 2);
      if (/^Square_Pillar/.test(o.name || '')) pillars.push({ name: o.name, c, bb });
      else if (/^(Line|Shape)/.test(o.name || '')) windows.push({ name: o.name, c, bb });
    });
    // 静态碰撞判定(复制 collision-resolve.js 的 hitsAny 语义)
    const BODY_H = 1.8,
      R = 0.35;
    const bounds = window.__ctx.scene.bounds || [];
    const hits = (x, z, footY) => {
      for (const bd of bounds) {
        if (bd.mnY !== undefined && (footY >= bd.mxY || footY + BODY_H <= bd.mnY)) continue;
        const cx = Math.max(bd.mnX, Math.min(x, bd.mxX));
        const cz = Math.max(bd.mnZ, Math.min(z, bd.mxZ));
        const dx = x - cx,
          dz = z - cz;
        if (dx * dx + dz * dz < R * R) return true;
      }
      return false;
    };
    const footY = 0;
    window.__hits = hits; // 供后续行走测试挑选合法起点(起点若落在碰撞盒内会被完全卡死)
    const pillarHits = pillars.slice(0, 5).map((p) => ({
      c: p.c.map((n) => +n.toFixed(2)),
      blocked: hits(p.c[0], p.c[2], footY),
    }));
    const winHits = windows
      .sort((a, b) => a.c[2] - b.c[2])
      .slice(0, 5)
      .map((w) => ({ name: w.name, c: w.c.map((n) => +n.toFixed(2)), blocked: hits(w.c[0], w.c[2], footY) }));
    // 最北的窗(段0 北立面)用于行走测试
    const northWin = windows.slice().sort((a, b) => a.c[2] - b.c[2])[0];
    const perim = bounds.filter((bd) => bd.perim).length;
    const archB = bounds.filter((bd) => bd.mnY !== undefined).length;
    return {
      boundsTotal: bounds.length,
      perimLeft: perim,
      archBoxes: archB,
      segs: segs.map((s) => ({ name: s.name, posZ: s.posZ, z: [s.mn[2], s.mx[2]], x: [s.mn[0], s.mx[0]], yMax: s.mx[1] })),
      pillarSample: pillarHits,
      windowSample: winHits,
      northWin: northWin ? northWin.c.map((n) => +n.toFixed(2)) : null,
      outsideTest: { z: -20, blocked: hits(0, -20, footY) },
    };
  });
  console.log(JSON.stringify(report, null, 1));

  console.log('=== C 真实行走 ===');
  // C1:朝北面落地窗走 → 应穿出去
  const nw = report.northWin;
  if (nw) {
    // 截一:站窗前(馆内侧)
    await teleport(nw[0], nw[2] + 3.0, 0);
    await sleep(500);
    await page.screenshot({ path: 'scripts/artifacts/walk-1-inside.png' });
    await key('w', true);
    await sleep(4000);
    await key('w', false);
    await sleep(400);
    const after = await pos();
    await page.screenshot({ path: 'scripts/artifacts/walk-2-outside.png' });
    console.log(
      'C1 穿窗: Δz=',
      (after.z - (nw[2] + 3.0)).toFixed(2),
      after.z < -18 ? '✅ 已走到馆外' : '❌ 仍被挡在馆内'
    );
  }
  // C2:朝柱子走 → 应被挡住(起点自动挑选:柱心四周找一个不卡在碰撞盒内的落脚点)
  const spot = await page.evaluate(() => {
    const hits = window.__hits;
    const pillars = [];
    const s = window.__ctx.scene.s;
    s.updateMatrixWorld(true);
    let shell = null;
    s.traverse((o) => {
      if (/^weddingShell0/.test(o.name || '')) shell = o;
    });
    if (!shell) return null;
    const bboxOf = (o) => {
      const p = o.geometry && o.geometry.attributes.position;
      if (!p) return null;
      const step = Math.max(1, Math.floor(p.count / 200));
      const mn = [Infinity, Infinity, Infinity],
        mx = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < p.count; i += step) {
        const e = o.matrixWorld.elements;
        const vx = p.getX(i),
          vy = p.getY(i),
          vz = p.getZ(i);
        const w = [
          e[0] * vx + e[4] * vy + e[8] * vz + e[12],
          e[1] * vx + e[5] * vy + e[9] * vz + e[13],
          e[2] * vx + e[6] * vy + e[10] * vz + e[14],
        ];
        for (let j = 0; j < 3; j++) {
          if (w[j] < mn[j]) mn[j] = w[j];
          if (w[j] > mx[j]) mx[j] = w[j];
        }
      }
      return { mn, mx };
    };
    shell.traverse((o) => {
      if (!o.isMesh || !/^Square_Pillar/.test(o.name || '')) return;
      const bb = bboxOf(o);
      if (bb) pillars.push([(bb.mn[0] + bb.mx[0]) / 2, (bb.mn[2] + bb.mx[2]) / 2]);
    });
    for (const [px, pz] of pillars) {
      // 四个方向各退 2.2m,挑一个起点可站、且朝柱心方向确实存在障碍的
      for (const [dx, dz] of [
        [0, 2.2],
        [0, -2.2],
        [2.2, 0],
        [-2.2, 0],
      ]) {
        const sx = px + dx,
          sz = pz + dz;
        if (hits(sx, sz, 0)) continue;
        // 朝向:视线=(-sin yaw,-cos yaw),要指向柱心方向 (-dx,-dz) → yaw=atan2(dx,dz)
        return { pillar: [+px.toFixed(2), +pz.toFixed(2)], start: [+sx.toFixed(2), +sz.toFixed(2)], yaw: Math.atan2(dx, dz) };
      }
    }
    return null;
  });
  if (spot) {
    await teleport(spot.start[0], spot.start[1], spot.yaw);
    await sleep(400);
    const before = await pos();
    await key('w', true);
    await sleep(3000);
    await key('w', false);
    await sleep(300);
    const after = await pos();
    const moved = Math.hypot(after.x - before.x, after.z - before.z);
    const gap = Math.hypot(after.x - spot.pillar[0], after.z - spot.pillar[1]);
    console.log(
      'C2 撞柱: 柱心',
      JSON.stringify(spot.pillar),
      '起点',
      JSON.stringify(before),
      '→',
      JSON.stringify(after),
      '| 走了',
      moved.toFixed(2),
      'm,距柱心',
      gap.toFixed(2),
      'm',
      gap > 0.55 ? '✅ 被柱子挡住(未穿模)' : '❌ 穿过去了'
    );
    await page.screenshot({ path: 'scripts/artifacts/walk-3-pillar.png' });
  } else {
    console.log('C2 撞柱: 找不到合法起点');
  }

  console.log('wedding-logs:', logs.length ? logs : 'none');
  console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
  await b.close();
})();
