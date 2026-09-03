// scan-south.cjs — 扫描出生点以南(z 25~75)的世界物件,确认"户外画板墙"包含哪些组件
const { launch } = require('../probe/browser.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.addInitScript(() => {
    for (const k of [
      'agreementConsented',
      'privacyConsented',
      'communityConsented',
      'skipOpening',
      'prologueDone',
      'nickPopOff',
    ])
      sessionStorage.setItem(k, '1');
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
      const el = [...document.querySelectorAll('button')].find((r) =>
        (r.textContent || '').replace(/\s/g, '').includes(k)
      );
      if (!el) return;
      const r = el.getBoundingClientRect();
      for (const t of ['pointerdown', 'pointerup', 'click'])
        el.dispatchEvent(
          new MouseEvent(t, {
            bubbles: true,
            cancelable: true,
            clientX: r.x + r.width / 2,
            clientY: r.y + r.height / 2,
          })
        );
    }, kw);
  await clickBtn('男').catch(() => {});
  await page.waitForTimeout(1500);
  await clickBtn('先逛逛').catch(() => {});
  await page.waitForTimeout(2500);
  await page.getByText('跳过序章', { exact: false }).click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await sleep(500);

  const out = await page.evaluate(() => {
    const s = window.__ctx.scene.s;
    const res = [];
    const ZMIN = 22,
      ZMAX = 80;
    const box = { mnX: 1e9, mnY: 1e9, mnZ: 1e9, mxX: -1e9, mxY: -1e9, mxZ: -1e9 };
    const upd = (v) => {
      box.mnX = Math.min(box.mnX, v.x);
      box.mxX = Math.max(box.mxX, v.x);
      box.mnY = Math.min(box.mnY, v.y);
      box.mxY = Math.max(box.mxY, v.y);
      box.mnZ = Math.min(box.mnZ, v.z);
      box.mxZ = Math.max(box.mxZ, v.z);
    };
    // 逐 mesh 求世界 AABB(采样顶点,避开 three 实例不可达)
    s.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      o.updateWorldMatrix(true, false);
      const g = o.geometry;
      const pos = g && g.attributes && g.attributes.position;
      if (!pos) return;
      const bb = { mnX: 1e9, mnY: 1e9, mnZ: 1e9, mxX: -1e9, mxY: -1e9, mxZ: -1e9 };
      const st = Math.max(1, Math.floor(pos.count / 400));
      const v = { x: 0, y: 0, z: 0 };
      for (let i = 0; i < pos.count; i += st) {
        v.x = pos.getX(i);
        v.y = pos.getY(i);
        v.z = pos.getZ(i);
        const e = o.matrixWorld.elements;
        const wx = e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12];
        const wy = e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13];
        const wz = e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14];
        bb.mnX = Math.min(bb.mnX, wx);
        bb.mxX = Math.max(bb.mxX, wx);
        bb.mnY = Math.min(bb.mnY, wy);
        bb.mxY = Math.max(bb.mxY, wy);
        bb.mnZ = Math.min(bb.mnZ, wz);
        bb.mxZ = Math.max(bb.mxZ, wz);
      }
      const cz = (bb.mnZ + bb.mxZ) / 2;
      if (cz < ZMIN || cz > ZMAX) return;
      res.push({
        name: o.name || o.type,
        type: o.type,
        geo: g.type,
        ud: Object.keys(o.userData || {}).join(','),
        bbox: [
          [+bb.mnX.toFixed(1), +bb.mxX.toFixed(1)],
          [+bb.mnY.toFixed(1), +bb.mxY.toFixed(1)],
          [+bb.mnZ.toFixed(1), +bb.mxZ.toFixed(1)],
        ],
        size: [
          +(bb.mxX - bb.mnX).toFixed(1),
          +(bb.mxY - bb.mnY).toFixed(1),
          +(bb.mxZ - bb.mnZ).toFixed(1),
        ],
      });
    });
    return res;
  });

  console.log('扫描 z∈[' + 22 + ',' + 80 + '] 可见 mesh 共', out.length);
  out.sort((a, b2) => a.bbox[2][0] - b2.bbox[2][0]);
  out.forEach((r) =>
    console.log(
      (r.name + '                    ').slice(0, 22),
      (r.geo + '            ').slice(0, 14),
      'xz[' + r.bbox[0].join('~') + ' | ' + r.bbox[2].join('~') + ']',
      'y' + r.bbox[1].join('~'),
      'size' + JSON.stringify(r.size),
      r.ud ? '{' + r.ud + '}' : ''
    )
  );
  await page.screenshot({ path: 'scripts/artifacts/scan-south.png' });
  await b.close();
})();
