// probe-stair-down.cjs — 复现"下楼被卡住":真实键盘驱动,从二楼回廊走楼梯回一楼
// 方向约定(loop-manager.js): forward = (-sin yaw, -cos yaw)
//   yaw=0 → 北(-Z) | yaw=π → 南(+Z) | yaw=-π/2 → 东(+X) | yaw=π/2 → 西(-X)
// 阶段A: 北翼下行(回廊 → 平台)  B: 东翼下行(平台 → 1F)  C: 东翼上行  D: 北翼上行
const { launch } = require('../probe/browser.js');

(async () => {
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.addInitScript(() => {
    sessionStorage.setItem('agreementConsented', '1');
    sessionStorage.setItem('privacyConsented', '1');
    sessionStorage.setItem('communityConsented', '1');
    sessionStorage.setItem('skipOpening', '1');
    sessionStorage.setItem('prologueDone', '1');
    sessionStorage.setItem('nickPopOff', '1');
  });
  await page.goto('http://localhost:3282/?noopening&noprologue', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__ctx && window.__ctx.player && window.__ctx.player.pl, { timeout: 60000 });
  try { await page.getByText('跳过序章', { exact: false }).click({ timeout: 4000 }); } catch (e) {}
  await page.waitForTimeout(1200);
  const clickBtn = (kw) => page.evaluate((k) => {
    const el = [...document.querySelectorAll('button')].find(b => (b.textContent || '').replace(/\s/g, '').includes(k));
    if (!el) return 'no-match:' + k;
    const r = el.getBoundingClientRect();
    for (const type of ['pointerdown', 'pointerup', 'click'])
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
    return 'clicked:' + el.textContent.trim();
  }, kw);
  console.log(await clickBtn('男'));
  await page.waitForTimeout(1200);
  console.log(await clickBtn('先逛逛'));
  await page.waitForTimeout(1200);
  const rect = await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find(b => (b.textContent || '').replace(/\s/g, '').includes('落款'));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (rect) await page.mouse.click(rect.x, rect.y);
  await page.waitForTimeout(2000);

  await page.evaluate(() => window.__ctx.player.pl.p.set(6, window.__ctx.player.pl.p.y, 24.9));
  await page.waitForFunction(() => window.__museum && window.__museum.current === 'hall', { timeout: 60000 });
  console.log('entered hall, viewMode=', await page.evaluate(() => window.__ctx.player.viewMode));
  await page.waitForTimeout(6000); // 等进馆开场传送(goldenTeleport → 本地(30,0))完全落地,避免竞态拽人

  // 页内工具:轨迹采样 + 卡点墙识别
  await page.evaluate(() => {
    window.__log = [];
    setInterval(() => {
      const pl = window.__ctx.player.pl;
      window.__log.push({
        t: Date.now(), x: +pl.p.x.toFixed(2), z: +pl.p.z.toFixed(2),
        footY: +(pl.p.y - 1.6).toFixed(2), g: pl.onGround ? 1 : 0,
      });
    }, 200);
    window.__blockers = (dirX, dirZ) => {
      const pl = window.__ctx.player.pl;
      const footY = pl.p.y - 1.6, r = pl.r;
      const res = [];
      for (const off of [0.05, 0.15, 0.3]) {
        const x = pl.p.x + dirX * off, z = pl.p.z + dirZ * off;
        for (const b of window.__ctx.scene.bounds) {
          const cx = Math.max(b.mnX, Math.min(x, b.mxX));
          const cz = Math.max(b.mnZ, Math.min(z, b.mxZ));
          const dx = x - cx, dz = z - cz;
          if (dx * dx + dz * dz >= r * r) continue;
          if (b.mnY !== undefined && !(footY < b.mxY && footY + 1.8 > b.mnY)) continue;
          res.push({ off, mnX: +b.mnX.toFixed(1), mxX: +b.mxX.toFixed(1), mnZ: +b.mnZ.toFixed(1), mxZ: +b.mxZ.toFixed(1), mnY: b.mnY ?? '-', mxY: b.mxY ?? '-' });
        }
        if (res.length) break;
      }
      return res;
    };
  });

  const setYaw = (yaw) => page.evaluate((y) => {
    window.__ctx.player.pl.y = y;
    if (window.__ctx._orbit) window.__ctx._orbit.yaw = y;
  }, yaw);
  const teleport = async (lx, lz, yaw, footY) => {
    await page.evaluate(([lx, lz, yaw, fy]) => {
      const pl = window.__ctx.player.pl;
      pl.p.set(-300 + lx, fy + 1.6, -190 + lz);
      pl.y = yaw; pl.vy = 0; pl.onGround = true;
      window.__ctx.scene.cam.position.copy(pl.p);
    }, [lx, lz, yaw, footY]);
    await setYaw(yaw);
  };
  const key = (k, down) => page.evaluate(([k, d]) => {
    document.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { key: k, bubbles: true }));
  }, [k, down]);
  const clearModals = () => page.evaluate(() => {
    for (const t of ['跳过序章', '男', '先逛逛', '落款']) {
      const el = [...document.querySelectorAll('button')].find(b => (b.textContent || '').replace(/\s/g, '').includes(t));
      if (el) el.click();
    }
  });
  const summary = async (tag, dirX, dirZ) => {
    const out = await page.evaluate(([dx, dz]) => {
      const log = window.__log.splice(0);
      if (log.length < 2) return 'no-log';
      const stuck = [];
      for (let i = 0; i + 5 < log.length; i += 5) {
        const a = log[i], b2 = log[i + 5];
        if (Math.hypot(b2.x - a.x, b2.z - a.z) < 0.12)
          stuck.push({ lx: +(a.x + 300).toFixed(1), lz: +(a.z + 190).toFixed(1), footY: a.footY });
      }
      const last = log[log.length - 1];
      const path = log.filter((_, i) => i % 10 === 0)
        .map(s => `(${(s.x + 300).toFixed(0)},${(s.z + 190).toFixed(0)},${s.footY.toFixed(1)})`).join(' ');
      return {
        last: { lx: +(last.x + 300).toFixed(1), lz: +(last.z + 190).toFixed(1), footY: last.footY },
        stuckCount: stuck.length, stuckSample: stuck.slice(0, 3),
        blockers: stuck.length ? window.__blockers(dx, dz) : [], path,
      };
    }, [dirX, dirZ]);
    console.log(tag, JSON.stringify(out));
  };

  // ===== 阶段A: 回廊北带 → 北翼楼梯下行 → 中央平台(yaw=π 面南) =====
  await teleport(-46, -17.8, Math.PI, 30.45);
  await page.waitForTimeout(1000);
  await clearModals();
  await key('w', true);
  await page.waitForTimeout(9000);
  await key('w', false);
  await summary('A-下行北翼:', 0, 1);

  // ===== 阶段B: 平台 → 东翼下行 → 1F(yaw=-π/2 面东) =====
  await teleport(-46, 0, -Math.PI / 2, 25.4); // 先回平台中央
  await page.waitForTimeout(800);
  await clearModals();
  await setYaw(-Math.PI / 2);
  await key('w', true);
  await page.waitForTimeout(26000);
  await key('w', false);
  await summary('B-下行东翼:', 1, 0);

  // ===== 阶段C: 1F → 东翼上行 → 平台(yaw=π/2 面西) =====
  await teleport(-20, 0, Math.PI / 2, 20.8);
  await page.waitForTimeout(800);
  await clearModals();
  await key('w', true);
  await page.waitForTimeout(10000);
  await key('w', false);
  await summary('C-上行东翼:', -1, 0);

  // ===== 阶段D: 平台 → 北翼上行 → 回廊(修复前会卡在 footY 30.18;yaw=0 面北) =====
  await clearModals();
  await setYaw(0);
  await key('w', true);
  await page.waitForTimeout(10000);
  await key('w', false);
  await summary('D-上行北翼:', 0, -1);

  await b.close();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
