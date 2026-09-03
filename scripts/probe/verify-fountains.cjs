// verify-fountains.cjs — 户外画板移除 + 四座喷泉落位验收(2026-09-03)
// A 白板区清零:z 37~48 不应残留任何可见 mesh(原白板/说明牌/光圈/展示墙 6 画位)
// B 四座喷泉:name=fountainS/N/E/W,直径应≈8.04m(原比例)、底面贴地
// C 碰撞:喷泉实心水池应新增 4 个 AABB,池心不可穿
// D 台基与池周地形:池底须坐在台面上,不埋沙
// E 流动水材质:5 个 BezierCurve 部件须换成半透明水材质,uTime 须随帧推进
// F 截图:出生点南望 / 空中俯瞰 / 南喷泉近景 / 同机位连拍两张(验证水在动)
const { launch } = require('../probe/browser.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const logs = [];
  const errors = [];
  page.on('console', (m) => {
    const t = m.text();
    if (t.includes('[fountain]')) logs.push(t);
    // shader 编译失败走 console.error,不是 pageerror,必须单独抓
    if (m.type() === 'error' && /shader|program|glsl|webgl/i.test(t)) errors.push('GL: ' + t.slice(0, 300));
  });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
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
  await page.waitForTimeout(4500);
  await page.evaluate(() => {
    const gc = document.getElementById('guideCard');
    if (gc) {
      const b = [...gc.querySelectorAll('button')].find((x) => /先逛逛/.test(x.textContent || ''));
      if (b) b.click();
      else gc.remove();
    }
  });
  await sleep(1500); // 等 GLB 加载完

  const shot = async (name, x, y, z, yaw, pit) => {
    await page.evaluate(
      (a) => {
        const pl = window.__ctx.player.pl;
        pl.p.set(a.x, a.y, a.z);
        pl.y = a.yaw;
        pl.pi = a.pit;
        window.__ctx.cam.position.copy(pl.p);
        window.__ctx.cam.rotation.set(a.pit, a.yaw, 0, 'YXZ');
      },
      { x, y, z, yaw, pit }
    );
    await sleep(1400);
    await page.screenshot({ path: 'scripts/artifacts/fn-' + name + '.png' });
    console.log('shot:', name);
  };

  const report = await page.evaluate(() => {
    const s = window.__ctx.scene.s;
    const out = { fountains: [], wbZoneLeft: [], bounds: 0 };
    const bbOf = (root) => {
      const bb = { mnX: 1e9, mnY: 1e9, mnZ: 1e9, mxX: -1e9, mxY: -1e9, mxZ: -1e9 };
      root.updateWorldMatrix(true, true);
      root.traverse((o) => {
        if (!o.isMesh) return;
        const pos = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
        if (!pos) return;
        const st = Math.max(1, Math.floor(pos.count / 300));
        const e = o.matrixWorld.elements;
        for (let i = 0; i < pos.count; i += st) {
          const vx = pos.getX(i),
            vy = pos.getY(i),
            vz = pos.getZ(i);
          const wx = e[0] * vx + e[4] * vy + e[8] * vz + e[12];
          const wy = e[1] * vx + e[5] * vy + e[9] * vz + e[13];
          const wz = e[2] * vx + e[6] * vy + e[10] * vz + e[14];
          bb.mnX = Math.min(bb.mnX, wx);
          bb.mxX = Math.max(bb.mxX, wx);
          bb.mnY = Math.min(bb.mnY, wy);
          bb.mxY = Math.max(bb.mxY, wy);
          bb.mnZ = Math.min(bb.mnZ, wz);
          bb.mxZ = Math.max(bb.mxZ, wz);
        }
      });
      return bb;
    };
    s.children.forEach((o) => {
      if (o.name && /^fountain[SN EW]?$/.test(o.name)) {
        const bb = bbOf(o);
        out.fountains.push({
          name: o.name,
          pos: [+o.position.x.toFixed(1), +o.position.y.toFixed(2), +o.position.z.toFixed(1)],
          diaX: +(bb.mxX - bb.mnX).toFixed(2),
          diaZ: +(bb.mxZ - bb.mnZ).toFixed(2),
          yBottom: +bb.mnY.toFixed(2),
          yTop: +bb.mxY.toFixed(2),
          children: o.children.length,
        });
      }
    });
    // 白板区残留(z 37~48,且不是喷泉)
    s.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      o.updateWorldMatrix(true, false);
      const e = o.matrixWorld.elements;
      const wz = e[14];
      if (wz >= 37 && wz <= 48) {
        let anc = o,
          isFn = false;
        while (anc) {
          if (anc.name && anc.name.startsWith('fountain')) isFn = true;
          anc = anc.parent;
        }
        if (!isFn) out.wbZoneLeft.push({ geo: o.geometry.type, z: +wz.toFixed(1) });
      }
    });
    // 池心是否落在碰撞盒内(喷泉实心,玩家应被挡住)
    const SPOTS = [
      ['fountainS', 0, 42],
      ['fountainN', 0, -26],
      ['fountainE', 32, 8],
      ['fountainW', -32, 8],
    ];
    const all = window.__ctx.scene.bounds || [];
    out.bounds = all.length;
    out.fountainHits = SPOTS.map(([n, x, z]) => ({
      name: n,
      blocked: all.some((b) => x > b.mnX && x < b.mxX && z > b.mnZ && z < b.mxZ),
    }));
    // 池周地形起伏(在 C 段统一采样)
    const getH = (x, z) => {
      try {
        const h = window.__ctx.media.desert ? window.__ctx.media.desert.getH(x, z) : 0;
        return typeof h === 'number' && isFinite(h) ? h : 0;
      } catch (e) {
        return 0;
      }
    };
    // ---- E 流动水材质 ----
    const wm = [];
    s.traverse((o) => {
      if (!o.isMesh || !o.material || !o.material.userData || !o.material.userData.isFountainWater)
        return;
      const m = o.material;
      wm.push({
        owner: o.name || '(无名)',
        mat: m.name,
        kind: m.userData.waterKind ? 'jet 水柱' : 'veil 水帘',
        transparent: m.transparent === true,
        depthWrite: m.depthWrite === false,
        doubleSide: m.side === 2,
        uTime: m.userData.waterU ? +m.userData.waterU.uTime.value.toFixed(3) : null,
        uSpeed: m.userData.waterU ? m.userData.waterU.uSpeed.value : null,
        uFreq: m.userData.waterU ? m.userData.waterU.uFreq.value : null,
        // 材质实例是否在四座之间共享(共享=只需 1 份 GPU program)
        uuid: m.uuid,
      });
    });
    out.water = wm;
    out.waterMatUnique = [...new Set(wm.map((w) => w.uuid))].length;
    // 未改造的隐形水部件(alpha=0 残留)= 应当为 0
    out.hiddenWaterLeft = 0;
    s.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (/bezier/i.test((o.name || '') + (o.material.name || '')) && !o.material.userData.isFountainWater)
        out.hiddenWaterLeft++;
    });
    const R = 4.4; // 台基半径(8.04m 原比例)
    const terr = SPOTS.map(([n, x, z]) => {
      const sm = [
        [0, 0],
        [R, 0],
        [-R, 0],
        [0, R],
        [0, -R],
        [R * 0.7, R * 0.7],
        [R * 0.7, -R * 0.7],
        [-R * 0.7, R * 0.7],
        [-R * 0.7, -R * 0.7],
      ].map(([dx, dz]) => getH(x + dx, z + dz));
      return {
        name: n,
        center: +getH(x, z).toFixed(2),
        edgeMin: +Math.min.apply(null, sm).toFixed(2),
        edgeMax: +Math.max.apply(null, sm).toFixed(2),
      };
    });
    // 台基:应存在,且池底世界 y 须 >= 池周地形最高点(否则沙会穿过池底)
    const pedestals = s.children
      .filter((o) => o.name && o.name.endsWith('-base'))
      .map((o) => ({
        name: o.name,
        y: +o.position.y.toFixed(2),
        topY: +(o.position.y + o.geometry.parameters.height / 2).toFixed(2),
        r: +o.geometry.parameters.radiusTop.toFixed(2),
      }));
    out.terrain = terr.map((t) => {
      const f = out.fountains.find((x) => x.name === t.name);
      const pd = pedestals.find((x) => x.name === t.name + '-base');
      return {
        name: t.name,
        center: t.center,
        edgeMin: t.edgeMin,
        edgeMax: t.edgeMax,
        spread: +(t.edgeMax - t.edgeMin).toFixed(2),
        poolBottom: f ? f.yBottom : null,
        pedestalTop: pd ? pd.topY : null,
        // 池底应坐在台面上(台面 = edgeMax + 0.08)
        ok: f && pd ? f.yBottom >= t.edgeMax - 0.05 : false,
      };
    });
    out.pedestals = pedestals;
    return out;
  });

  console.log('fountain-logs:', logs.length ? logs : 'none');
  console.log('--- A 白板区残留(z 37~48) ---');
  console.log(report.wbZoneLeft.length === 0 ? '✅ 清零' : '❌ 残留 ' + report.wbZoneLeft.length + ' 个');
  if (report.wbZoneLeft.length) console.log(JSON.stringify(report.wbZoneLeft.slice(0, 8)));
  console.log('--- B 四座喷泉 ---');
  report.fountains.forEach((f) =>
    console.log(
      ' ' + f.name,
      'pos' + JSON.stringify(f.pos),
      '直径 X' + f.diaX + '/Z' + f.diaZ,
      'y ' + f.yBottom + '~' + f.yTop,
      '子节点' + f.children
    )
  );
  console.log('喷泉数量:', report.fountains.length, report.fountains.length === 4 ? '✅' : '❌');
  console.log('--- C 碰撞盒总数:', report.bounds);
  (report.fountainHits || []).forEach((h) =>
    console.log(' ' + h.name, '池心被挡:', h.blocked ? '✅ 实心不可穿' : '❌ 缺碰撞')
  );
  console.log('--- D 台基与池周地形 ---');
  (report.pedestals || []).forEach((p) =>
    console.log(' ' + p.name, '顶面 y' + p.topY, '半径' + p.r)
  );
  (report.terrain || []).forEach((t) =>
    console.log(
      ' ' + t.name,
      '地形 ' + t.edgeMin + '~' + t.edgeMax + '(高差' + t.spread + ')',
      '台面' + t.pedestalTop,
      '池底' + t.poolBottom,
      t.ok ? '✅ 池底高于最高地形,不埋沙' : '❌ 池底低于地形,沙会穿池'
    )
  );

  // ---- E 流动水材质 ----
  console.log('--- E 流动水材质 ---');
  const w = report.water || [];
  console.log(
    ' 水部件改造数: ' + w.length + ' 个  (期望 20 = 4 座 × 5 部件)  ' + (w.length === 20 ? '✅' : '❌')
  );
  console.log(
    ' 材质实例数: ' + report.waterMatUnique + ' 个 (每座独立 5 个,共 20) ' + (report.waterMatUnique === 20 ? '✅' : '❌')
  );
  const kinds = {};
  w.forEach((x) => (kinds[x.kind] = (kinds[x.kind] || 0) + 1));
  console.log(' 类型分布: ' + JSON.stringify(kinds));
  const bad = w.filter((x) => !x.transparent || !x.depthWrite || !x.doubleSide);
  console.log(
    ' 渲染属性(transparent/depthWrite=false/DoubleSide): ' +
      (bad.length === 0 ? '✅ 全部正确' : '❌ ' + bad.length + ' 个异常')
  );
  console.log(' 残留未改造的隐形水部件: ' + (report.hiddenWaterLeft === 0 ? '✅ 0' : '❌ ' + report.hiddenWaterLeft));
  console.log(' 抽样(前 5 个):');
  w.slice(0, 5).forEach((x) =>
    console.log(
      '   ' + x.owner.padEnd(22) + x.kind + '  speed=' + x.uSpeed + ' freq=' + x.uFreq + ' uTime=' + x.uTime
    )
  );
  // uTime 是否在推进:间隔 1s 采样两次
  const readT = () =>
    page.evaluate(() => {
      let t = null;
      window.__ctx.scene.s.traverse((o) => {
        if (
          o.isMesh &&
          o.material &&
          o.material.userData &&
          o.material.userData.isFountainWater &&
          o.material.userData.waterU
        )
          t = +o.material.userData.waterU.uTime.value.toFixed(3);
      });
      return t;
    });
  const t1 = await readT();
  await sleep(1200);
  const t2 = await readT();
  const moved = t1 !== null && t2 !== null && t2 - t1 > 0.5;
  console.log(
    ' uTime 推进: ' + t1 + ' → ' + t2 + ' (+' + (t2 - t1).toFixed(2) + 's)  ' + (moved ? '✅ 水在流动' : '❌ 时间没走')
  );

  console.log('errors:', errors.length ? errors.slice(0, 4) : 'none');

  // F 截图(HUD 八方位:yaw 0=北 / π/2=西 / π=南 / 3π/2=东)
  await shot('south-view', -0.1, 1.6, 27, (182 * Math.PI) / 180, 0); // 出生点南望(距南池心 15m)
  await shot('aerial', 0, 70, 8, Math.PI, -1.35); // 高空俯瞰全景
  await shot('close-s', 0, 2.2, 31, Math.PI, 0.1); // 南喷泉近景(距池心 11m,朝南看)
  // 同机位连拍两张:用于像素级比对,证明水真的在动(静态物体两图应完全一致)
  await shot('flow-a', 0, 2.2, 34, Math.PI, 0.14); // 距池心 8m,对准中央水柱
  await shot('flow-b', 0, 2.2, 34, Math.PI, 0.14);
  // 东喷泉在 x=32,须站在西侧(x=23)朝东看 → yaw=3π/2(上一版用 π/2 朝西,拍到的是建筑)
  await shot('close-e', 23, 2.2, 8, (3 * Math.PI) / 2, 0.1);
  await b.close();
})();
