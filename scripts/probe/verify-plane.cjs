// verify-plane.cjs — 可驾驶 Piper PA-18 验收(2026-10-03)
// A 模型:piper-pa18-full.glb 加载成功(0.31MB 压缩版,非旧 245KB 简化残骸)
// B 尺寸:真机量级 —— 翼展 ≈6.7m、长度 ≈7.3m、贴地不悬空
// C 站位:在坠机点 (-9,76),与原残骸同位;碰撞盒已注册(座舱段)
// D 登机:走近 5.5m 内出现提示;E 登机后 HUD 出现、玩家被 flightLock 冻结
// E 物理:加油门 → 速度升;过阈值拉杆 → 离地;HUD 显示 km/h 与失速态
// F 截图:停机近景 / 驾驶舱视角 / 空中三视角
// 用法:node scripts/probe/verify-plane.cjs
// 线上:PROBE_URL=https://cloudbear.cloud PROBE_WAIT_MS=180000 node scripts/probe/verify-plane.cjs
const { launch } = require('../probe/browser.js');
const path = require('path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, '..', '..', 'scripts', 'artifacts');

(async () => {
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 260));
  });
  // 入口序列照 b612-journey-probe.cjs(已验证):闸门勾选 → ENTER → 电影选蟒蛇 → 跳过。
  // ⚠️ localStorage 用 b612* 前缀的真实键名,不是 sessionStorage 的 '1'。
  await page.addInitScript(() => {
    sessionStorage.setItem('dialogVoiceOff', String(Date.now()));
    sessionStorage.setItem('nickPopOff', '1');
    localStorage.setItem('scriptLang', 'zh');
    localStorage.setItem('kunlunWelcomed', String(Date.now()));
    localStorage.setItem('genderSelected', '1');
    localStorage.setItem('gender', 'female');
    // 直接落在"已画完羊"的存档,跳过画羊四笔(与本探针无关)
    localStorage.setItem('b612Scene2', '1');
    localStorage.setItem('b612Page1', '1');
    localStorage.setItem('b612PlanetChapter', '1'); // 飞行属于完成首次国王章节后的自由探索
  });

  const URL = process.env.PROBE_URL || 'http://localhost:5173';
  const WAIT = +(process.env.PROBE_WAIT_MS || 90000);
  // ⚠️ page.waitForFunction 有自己的 30s 默认超时,会盖掉外部传入的 WAIT。
  // 线上要下 3D 模型,必须显式把 timeout 传进每一次等待。
  await page.goto(URL + '/', { waitUntil: 'domcontentloaded', timeout: WAIT });
  await page.waitForSelector('#b612Gate', { timeout: WAIT });
  if (await page.locator('#gAgreeChk').count()) if (await page.locator('#gAgreeChk').count()) await page.locator('#gAgreeChk').check(); // 2026-10-03 起可无勾选框 // 2026-10-03 起可无勾选框
  await page.locator('#b612Gate .gEnter').click();
  await page.waitForSelector('#b612film #cBoa', { state: 'visible', timeout: WAIT });
  await page.locator('#b612film #cBoa').click();
  await page.locator('#b612film #fSkip').click();
  await page.waitForFunction(() => !document.getElementById('b612film'), null, { timeout: WAIT });
  await page.waitForFunction(
    () => !!window.__ctx && !!window.__ctx.player && !!window.__ctx.player.pl,
    null,
    { timeout: WAIT }
  );
  await sleep(2500);
  await page.waitForFunction(() => window.__ctx.scene.planeApi.debug().modelLoaded, null, {
    timeout: WAIT,
  });
  for (let i = 0; i < 40; i++) {
    if (!(await page.locator('#gameDialog').isVisible())) break;
    const choice = page.locator('#gameDialog .gs-choice').first();
    if (await choice.isVisible()) await choice.click();
    else await page.locator('#gameDialog').click();
    await sleep(300);
  }

  const results = [];
  const ok = (name, pass, detail) => {
    results.push({ name, pass, detail });
    console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
  };

  // 把玩家挪到飞机旁。
  // ⚠️ 不能只改一次 pl.p —— player 的物理 tick 每帧按输入重算位置,单帧赋值会被覆盖。
  // 改两次并在中间等一帧,再实测距离(2026-10-03 实测:改完立刻读会拿到旧值)。
  await page.evaluate(() => {
    const d = window.__ctx.scene.planeApi.debug();
    window.__planeTarget = { x: d.state.pos.x + 2.5, z: d.state.pos.z + 2.5 };
    const pl = window.__ctx.player.pl;
    pl.p.x = window.__planeTarget.x;
    pl.p.z = window.__planeTarget.z;
  });
  await sleep(400);
  await page.evaluate(() => {
    const pl = window.__ctx.player.pl;
    pl.p.x = window.__planeTarget.x;
    pl.p.z = window.__planeTarget.z;
  });
  await sleep(700);
  const distNow = await page.evaluate(() => {
    const d = window.__ctx.scene.planeApi.debug();
    const pl = window.__ctx.player.pl;
    return Math.hypot(pl.p.x - d.state.pos.x, pl.p.z - d.state.pos.z);
  });
  ok('D 玩家已靠近飞机(<5.5m)', distNow < 5.5, '距离=' + distNow.toFixed(2) + 'm');

  // ——— A/B/C 模型与站位 ———
  const model = await page.evaluate(() => {
    const root = window.__ctx.scene.s.getObjectByName('piperPA18');
    if (!root) return null;
    // ⚠️ 只量机身子节点,不量影子圆盘(直径 12.8m,会把尺寸断言撑爆)。
    const body = root.children.find((c) => c.name !== '' && c.type === 'Group') || root;
    const min = [1e9, 1e9, 1e9],
      max = [-1e9, -1e9, -1e9];
    root.updateMatrixWorld(true);
    body.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      o.geometry.computeBoundingBox?.();
      const bb = o.geometry.boundingBox;
      if (!bb) return;
      for (const c of [
        [bb.min.x, bb.min.y, bb.min.z],
        [bb.max.x, bb.max.y, bb.max.z],
      ]) {
        const v = new o.position.constructor(c[0], c[1], c[2]).applyMatrix4(o.matrixWorld);
        for (let k = 0; k < 3; k++) {
          if (v.getComponent(k) < min[k]) min[k] = v.getComponent(k);
          if (v.getComponent(k) > max[k]) max[k] = v.getComponent(k);
        }
      }
    });
    return {
      pos: { x: root.position.x, y: root.position.y, z: root.position.z },
      size: { x: max[0] - min[0], y: max[1] - min[1], z: max[2] - min[2] },
      childCount: root.children.length,
      hasModel: !!window.__ctx.scene.planeApi.debug().modelLoaded,
    };
  });
  ok(
    'A 真机模型已加载',
    !!model && model.hasModel,
    model ? 'modelLoaded=' + model.hasModel : '未找到 piperPA18'
  );
  if (model) {
    // Piper PA-18 真机:翼展 11.0m / 机长 7.3m。取"最长水平轴"判量级。
    const span = Math.max(model.size.x, model.size.z);
    ok(
      'B 尺寸接近真机(最长水平轴 6~12m)',
      span > 6 && span < 12.5,
      'span=' +
        span.toFixed(2) +
        'm  (x=' +
        model.size.x.toFixed(1) +
        ' z=' +
        model.size.z.toFixed(1) +
        ')'
    );
    ok(
      'C 站位在坠机点 (-9,76)',
      Math.abs(model.pos.x - -9) < 1.5 && Math.abs(model.pos.z - 76) < 1.5,
      `(${model.pos.x.toFixed(1)}, ${model.pos.z.toFixed(1)})`
    );
  }

  // ——— D 登机 ———
  const promptShown = await page.evaluate(() => {
    const el = document.getElementById('planePrompt');
    return el && el.style.display !== 'none' ? el.textContent : null;
  });
  ok('D 靠近出现登机提示', !!promptShown, promptShown || '未显示');
  await page.screenshot({ path: OUT + '/plane-1-parked.png' });

  await page.keyboard.press('e');
  await sleep(600);
  const boarded = await page.evaluate(() => {
    const hud = document.getElementById('planeHud');
    return {
      flying: document.body.dataset.flying === '1',
      hudVisible: !!hud && hud.style.display !== 'none',
      lock: !!window.__ctx.kunlun.flightLock,
    };
  });
  ok(
    'D 登机成功(flying + HUD + flightLock)',
    boarded.flying && boarded.hudVisible && boarded.lock,
    JSON.stringify(boarded)
  );
  await sleep(1200);
  await page.screenshot({ path: OUT + '/plane-2-cockpit.png' });

  // ——— E 物理:加油门 → 加速 ———
  const accel = await page.evaluate(async () => {
    const pf = window.__ctx.scene.planeApi;
    // 按住 W 加油门，使用玩家输入推进物理。
    const before = pf.debug().state.speed;
    return { before };
  });
  await page.keyboard.down('w');
  await sleep(2500);
  await page.keyboard.up('w');
  const afterAccel = await page.evaluate(() => window.__ctx.scene.planeApi.debug().state.speed);
  ok(
    'E 加油门加速',
    afterAccel > accel.before + 2,
    `${accel.before.toFixed(1)} → ${afterAccel.toFixed(1)} m/s`
  );

  // 拉杆起飞。断言读系统自记的飞行历程(everFlew/maxAltitude),
  // 不靠外部轮询 —— 轮询会漏掉刚离地那几帧,实测过一次假阴性。
  await page.evaluate(() => window.__ctx.scene.planeApi.resetFlight());
  // 滑跑要留足时间:浏览器实测全油门 3.5s 才到 25 m/s(纯物理核 2.6s 到 18.5),
  // 因为沙地有地形起伏与滚动阻力。给 4.5s 再拉杆,确保越过 LIFT_ON=13。
  await page.keyboard.down('w');
  await sleep(4500);
  const roll = await page.evaluate(() => window.__ctx.scene.planeApi.debug());
  ok(
    'E 滑跑速度过起飞阈值(>13 m/s)',
    roll.state.speed > 13,
    '滑跑末速=' + roll.state.speed.toFixed(1) + ' m/s'
  );
  await page.keyboard.down('ArrowUp'); // 拉杆抬头(ArrowUp = pitchIn -1)
  await sleep(2200);
  await page.keyboard.up('ArrowUp');
  await sleep(1800);
  await page.keyboard.up('w');
  // ⚠️ 先让飞机再飞一会儿再读:松杆瞬间还在爬升途中,早读会拿到爬升途中的高度
  // (实测读到 2.8m,再等 1.2s 就已是 9.8m —— 数值本身没错,是采样时机不对)。
  await sleep(1400);
  const air = await page.evaluate(() => window.__ctx.scene.planeApi.debug());
  ok(
    'E 离地并爬升(everFlew 且最高点>地面 3m)',
    air.everFlew && air.maxAltitude > 3,
    `最高 y=${air.maxAltitude}m  末态 y=${air.state.pos.y.toFixed(1)} spd=${air.state.speed.toFixed(1)}`
  );
  await page.screenshot({ path: OUT + '/plane-3-air.png' });

  // 三视角
  for (const [i, name] of [
    [1, 'cockpit'],
    [2, 'side'],
  ]) {
    await page.evaluate((m) => window.__ctx.scene.planeApi.setCam(m), i);
    await sleep(900);
    await page.screenshot({ path: `${OUT}/plane-4-view-${i}-${name}.png` });
  }
  await page.evaluate(() => window.__ctx.scene.planeApi.setCam(0));

  const final = await page.evaluate(() => window.__ctx.scene.planeApi.debug());
  ok('E 空中状态合理(高度>地面)', final.state.pos.y > 3, 'y=' + final.state.pos.y.toFixed(1));

  // 下机
  await page.keyboard.press('Escape');
  await sleep(600);
  const left = await page.evaluate(() => ({
    flying: document.body.dataset.flying === '1',
    lock: !!window.__ctx.kunlun.flightLock,
  }));
  ok('D 下机恢复控制', !left.flying && !left.lock, JSON.stringify(left));

  // 只关心飞机相关的异常。资源 404(音频/字体)与 MIME 警告(探针自己 import
  // JSON 路由留下的痕迹)都与本模块无关,不算失败。
  const realErrors = errors.filter(
    (e) =>
      !/Failed to load resource/.test(e) && !/MIME type/.test(e) && !/404/.test(e) && !/502/.test(e)
  );
  ok('无飞机相关页面异常', realErrors.length === 0, realErrors.slice(0, 3).join(' | ') || '干净');

  const fails = results.filter((r) => !r.pass);
  console.log(`\n=== ${results.length - fails.length}/${results.length} 通过 ===`);
  if (fails.length) {
    console.log('失败项:');
    fails.forEach((f) => console.log('  ✗ ' + f.name + ' — ' + (f.detail || '')));
  }
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch((e) => {
  console.error('[verify-plane] 探针自身异常:', e.message);
  process.exit(2);
});
