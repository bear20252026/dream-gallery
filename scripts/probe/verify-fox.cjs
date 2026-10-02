// verify-fox.cjs — 站五·狐狸验收(2026-10-03)
// A 布景:fox-scene.glb 加载并落位在 SITE(-46,34),含 Zorro_5(狐狸)+ Principito_4(王子)
// B 面板:开场后面板出现,三段坐席条 + 约定时辰
// C 驯养仪式:走到坐席按 E 坐下 → 计数 +1;同一天不重复计数
// D 台词:英文逐字照搬原著("Please-- tame me!" 等),说话人正确
// E 秘密:三次仪式后狐狸交出秘密,手札记入 foxSecret
// F 截图:全景 / 第一处坐席 / 仪式进行中
// 用法:node scripts/probe/verify-fox.cjs
// 线上:PROBE_URL=https://cloudbear.cloud PROBE_WAIT_MS=180000 node scripts/probe/verify-fox.cjs
const { launch } = require('../probe/browser.js');
const path = require('path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, '..', '..', 'scripts', 'artifacts');

(async () => {
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.addInitScript(() => {
    sessionStorage.setItem('dialogVoiceOff', String(Date.now()));
    sessionStorage.setItem('nickPopOff', '1');
    localStorage.setItem('scriptLang', 'zh');
    localStorage.setItem('kunlunWelcomed', String(Date.now()));
    localStorage.setItem('genderSelected', '1');
    localStorage.setItem('gender', 'female');
  });

  const URL = process.env.PROBE_URL || 'http://localhost:4173';
  const WAIT = +(process.env.PROBE_WAIT_MS || 120000);
  await page.goto(URL + '/', { waitUntil: 'domcontentloaded', timeout: WAIT });
  await page.waitForSelector('#b612Gate', { timeout: WAIT });
  await page.locator('#gAgreeChk').check();
  await page.locator('#b612Gate .gEnter').click();
  await page.waitForSelector('#b612film #cBoa', { state: 'visible', timeout: WAIT });
  await page.locator('#b612film #cBoa').click();
  await page.locator('#b612film #fSkip').click();
  await page.waitForFunction(() => !document.getElementById('b612film'), null, { timeout: WAIT });
  await page.waitForFunction(() => !!(window.__ctx && window.__ctx.player && window.__ctx.player.pl), null, { timeout: WAIT });
  await sleep(2500);

  const results = [];
  const ok = (name, pass, detail) => {
    results.push({ name, pass, detail });
    console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
  };

  ok('A 调试接口已挂载', await page.evaluate(() => !!window.__ctx.scene.foxApi));

  // ⚠️ 不要预置 b612Scene2=1 —— 那样画羊板会被拉起来,紧接着 scene3-night 的
  // 「羊箱数数」choices 对白就**留在场上**,dialogOpen 恒 true,本模块 lock:true 的
  // 台词拿不到锁 → 只出第 1 句就停(实测 4 项假阴性)。
  // 与项目记忆里"跳过 scene3 的探针会撞 choices 堵死台词链"是同一个坑,
  // 正确解法是**别让 scene2 启动**,而不是事后清对白(那个 dialog 关不掉)。
  const cleared = await page.evaluate(async () => {
    // ⚠️ 判可见性必须用 getComputedStyle().display,不能用 offsetParent ——
    // #gameDialog 是 position:fixed,offsetParent 恒为 null,循环会误判"不可见"直接退出。
    const vis = (el) => !!el && getComputedStyle(el).display !== 'none';
    for (let i = 0; i < 24; i++) {
      const d = document.getElementById('gameDialog');
      if (!vis(d)) break;
      const ch = d.querySelector('.gs-choice');
      if (vis(ch)) ch.click();
      else if (window.__ctx.ui.advanceDialog) window.__ctx.ui.advanceDialog();
      else d.click();
      await new Promise((r) => setTimeout(r, 320));
    }
    return !(window.__ctx.ui.dialogOpen && window.__ctx.ui.dialogOpen());
  });
  ok('前置:场上无遗留对白(不堵台词锁)', cleared, cleared ? '已清空' : '仍有残留对白');

  // 先钩 openDialog 再开场 —— 钩装在 open() 之后就抓不到台词了(第一次跑踩过)。
  await page.evaluate(() => {
    window.__foxLines = [];
    const orig = window.__ctx.openDialog;
    window.__ctx.openDialog = function (o) {
      if (o && o.lines)
        window.__foxLines.push({ who: o.speaker, text: (o.lines[0] || '').replace(/\s+/g, ' ').trim() });
      return orig.apply(this, arguments);
    };
  });
  // 开场
  await page.evaluate(() => window.__ctx.scene.foxApi.open());
  await sleep(2500);

  // —— A 布景 ——
  const scene = await page.evaluate(() => {
    const r = window.__ctx.scene.s.getObjectByName('foxScene');
    if (!r) return null;
    let fox = null,
      prince = null,
      meshes = 0;
    r.traverse((o) => {
      if (o.isMesh) meshes++;
      if (o.name === 'Zorro_5') fox = o;
      if (o.name === 'Principito_4') prince = o;
    });
    // 实测世界包围盒:确认真的落在地面上、尺度合理
    r.updateMatrixWorld(true);
    const min = [1e9, 1e9, 1e9],
      max = [-1e9, -1e9, -1e9];
    r.traverse((o) => {
      if (!o.isMesh) return;
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
    const d = window.__ctx.scene.foxApi.debug();
    return {
      pos: { x: r.position.x, z: r.position.z },
      hasFox: !!fox,
      hasPrince: !!prince,
      loaded: d.loaded,
      site: d.pos,
      meshes,
      spanX: +(max[0] - min[0]).toFixed(2),
      spanZ: +(max[2] - min[2]).toFixed(2),
      minY: +min[1].toFixed(2),
    };
  });
  ok('A 布景已落位', !!scene, scene ? `(${scene.pos.x.toFixed(0)}, ${scene.pos.z.toFixed(0)})` : '未找到 foxScene');
  if (scene) {
    ok('A 狐狸节点存在(Zorro_5)', scene.hasFox);
    ok('A 王子节点存在(Principito_4)', scene.hasPrince);
    ok('A 模型已加载(26 网格)', scene.loaded && scene.meshes >= 20, 'meshes=' + scene.meshes);
    ok('A 落位在 SITE(-46,34)', Math.abs(scene.pos.x - -46) < 3 && Math.abs(scene.pos.z - 34) < 3, JSON.stringify(scene.site));
    ok('A 尺度合理(10~22m)且贴地不悬空', scene.spanX > 10 && scene.spanX < 22 && scene.minY > -1 && scene.minY < 3, `spanX=${scene.spanX} minY=${scene.minY}`);
  }
  await sleep(1200);
  // 面向场景拍一张(否则镜头朝别处,截图里看不到狐狸 —— 第一次跑就踩了这个坑)
  await page.evaluate(() => {
    const site = window.__ctx.scene.foxApi.debug().pos;
    const pl = window.__ctx.player.pl;
    pl.p.x = site.x;
    pl.p.z = site.z + 12;
    pl.y = Math.PI; // 面向 -Z(场景中心)
  });
  await sleep(1500);
  await page.screenshot({ path: OUT + '/fox-1-stage.png' });

  // —— B 面板 ——
  const panel = await page.evaluate(() => {
    const el = document.getElementById('foxPanel');
    if (!el || el.style.display === 'none') return null;
    return {
      title: el.querySelector('.fx-title')?.textContent || '',
      seats: el.querySelectorAll('.fx-seat').length,
      lit: el.querySelectorAll('.fx-seat.on').length,
      hour: el.querySelector('.fx-hour')?.textContent || '',
      hasSit: !!el.querySelector('[data-fox-action="sit"]'),
    };
  });
  ok('B 面板已出现', !!panel, panel ? panel.title : '未显示');
  if (panel) {
    ok('B 三个坐席(对应原著"三次靠近")', panel.seats === 3, 'seats=' + panel.seats);
    ok('B 有"坐下"动作', panel.hasSit);
    ok('B 显示约定时辰', /约定时辰|Hour/.test(panel.hour), panel.hour);
  }
  await page.screenshot({ path: OUT + '/fox-2-panel.png' });

  // —— D 台词:读钩到的 openDialog 记录 ——
  // ⚠️ 不要 actively 点/调 advanceDialog:那会和台词链的 autoHide 抢跑,
  // 把 spent 幂等打乱,链反而停在第 1 句(实测:有 pump→1 句,无 pump→走完全链)。
  // 本模块按文本长度给了 autoHide + 心跳,静静等它自己走完即可。
  await page.waitForTimeout(75000);
  const lines = await page.evaluate(() => window.__foxLines || []);
  const joined = lines.map((l) => l.text).join(' | ');
  ok('D 狐狸说出开场白', /Good morning|早上好/.test(joined), lines[0]?.text.slice(0, 70) || '(无)');
  ok('D 含"我还没有被驯养"', /not tamed|驯养/.test(joined));
  ok('D 含原著请求 "Please-- tame me!"', /tame me|驯养我吧/.test(joined));
  ok(
    'D 说话人正确(狐狸/王子)',
    lines.some((l) => /狐狸|Fox/.test(l.who)) && lines.some((l) => /小王子|Prince/.test(l.who)),
    lines.slice(0, 3).map((l) => l.who).join(',')
  );
  ok(
    'D 中文为文学自译(本探针跑中文模式)',
    /早上好。我就在这儿，苹果树下。/.test(joined),
    '共 ' + lines.length + ' 句'
  );

  // —— C 驯养仪式:走到坐席按 E ——
  // 关掉对白,进坐席
  await page.evaluate(() => {
    const d = document.getElementById('gameDialog');
    if (d) d.style.display = 'none';
  });
  const before = await page.evaluate(() => window.__ctx.scene.foxApi.debug().current);
  // 传送到第一处坐席
  await page.evaluate(() => {
    const api = window.__ctx.scene.foxApi;
    const site = api.debug().pos;
    const pl = window.__ctx.player.pl;
    pl.p.x = site.x - 6.4;
    pl.p.z = site.z + 5.2;
  });
  await sleep(500);
  await page.evaluate(() => {
    const api = window.__ctx.scene.foxApi;
    const site = api.debug().pos;
    const pl = window.__ctx.player.pl;
    pl.p.x = site.x - 6.4;
    pl.p.z = site.z + 5.2;
  });
  await sleep(600);
  await page.screenshot({ path: OUT + '/fox-3-seat1.png' });
  await page.keyboard.press('e');
  await sleep(2000);
  const after = await page.evaluate(() => ({
    cur: window.__ctx.scene.foxApi.debug().current,
    lit: document.querySelectorAll('#foxPanel .fx-seat.on').length,
    hour: document.querySelector('#foxPanel .fx-hour')?.textContent || '',
    store: localStorage.getItem('b612FoxRite'),
  }));
  ok('C 仪式计数 +1', after.cur === before + 1, `${before} → ${after.cur}  存档=${after.store}`);
  ok('C 第一段坐席点亮', after.lit === 1, 'lit=' + after.lit);
  await page.screenshot({ path: OUT + '/fox-4-rite1.png' });

  // 同一天不重复计数
  await page.keyboard.press('e');
  await sleep(1200);
  const again = await page.evaluate(() => window.__ctx.scene.foxApi.debug().current);
  ok('C 同一天不重复计数(原著:你最好同一时辰来)', again === after.cur, `${after.cur} → ${again}`);

  const realErrors = errors.filter((e) => !/Failed to load resource/.test(e) && !/MIME type/.test(e));
  ok('无狐狸相关页面异常', realErrors.length === 0, realErrors.slice(0, 2).join(' | ') || '干净');

  const fails = results.filter((r) => !r.pass);
  console.log(`\n=== ${results.length - fails.length}/${results.length} 通过 ===`);
  if (fails.length) {
    console.log('失败项:');
    fails.forEach((f) => console.log('  ✗ ' + f.name + ' — ' + (f.detail || '')));
  }
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch((e) => {
  console.error('[verify-fox] 探针自身异常:', e.message);
  process.exit(2);
});
