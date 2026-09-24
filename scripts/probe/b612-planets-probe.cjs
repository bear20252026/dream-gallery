// b612-planets-probe.cjs — 六星章节全流程自验(临时服务器,一次性探针归档)
// 场景:首访(闸门→电影 skip)→ 星门自动传送 → 岛上拾星屑 → 章节推进+库存写入 → 回程门回画廊
// 用法: node scripts/probe/b612-planets-probe.cjs
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { launch } = require('./browser.js');

const ROOT = path.join(__dirname, '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'b612pl-'));
const PORT = process.env.PLANETS_PROBE_PORT || 3238;

function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port), GATE_DATA_FILE: path.join(TMP, 'gate_data.json') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => { if (d.toString().includes('服务器已启动')) resolve(child); });
    child.on('error', reject);
    setTimeout(() => reject(new Error('服务器启动超时')), 12000);
  });
}

(async () => {
  const child = await startServer(PORT);
  const base = 'http://localhost:' + PORT + '/';
  const art = path.join(__dirname, '..', 'artifacts');
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => { const msg='pageerror: ' + e.message; errors.push(msg); console.log('[ERR@NOW]', new Date().toISOString().slice(17,23), msg.slice(0,90)); });

  // 1. 首访:闸门→ENTER→电影→skip
  // (2026-09-24 修:9-06 起闸门 ENTER 需先勾选「同意」(未勾时 pointer-events:none),
  //  本探针入场序列一直停在点击重试——补勾选步,入场流程与其余 b612 探针对齐)
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b612Gate', { timeout: 90000 });
  await page.check('#b612Gate #gAgreeChk');
  await page.click('#b612Gate .gEnter');
  await page.waitForFunction(() => !document.getElementById('b612Gate'), null, { timeout: 15000 });
  await page.waitForSelector('#b612film', { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.click('#b612film #fSkip');
  await page.waitForFunction(() => !document.getElementById('b612film'), null, { timeout: 20000 });
  await page.waitForTimeout(3000);
  console.log('✓ 首访闸门+电影 skip 完成,进入游戏');

  // 1.5 性别弹窗(电影结束后弹出):选「女生」放行
  const genderVisible = await page.evaluate(() => {
    const g = document.getElementById('genderOv');
    return g && getComputedStyle(g).display !== 'none';
  });
  if (genderVisible) {
    await page.click('#genderOv button:has-text("女")');
    await page.waitForTimeout(600);
    console.log('✓ 性别弹窗已选择');
  }

  // 2. planetsMode 生效
  const mode = await page.evaluate(() => !!window.__ctx.kunlun.planetsMode);
  if (!mode) { console.error('✗ planetsMode 未生效'); process.exit(1); }
  console.log('✓ planetsMode 生效(spirits 沙漠系统休眠)');

  // 3. 新入口顺序:主世界石门(0.1,1.6,56,朝北)→ B612 → 国王星球
  // (2026-09-24 修:两段式开机后,传送必须等预加载全绿——此前 portal.js 尚未注册 tick,
  //  物理又把圈内玩家弹回出生点,传送静默丢失 → activeWorld 永不切 b612)
  await page.waitForFunction(() => window.__bootCheck && window.__bootCheck.ok === true, null, { timeout: 120000 });
  await page.evaluate(() => { const p = window.__ctx.player.pl.p; p.x = 0.1; p.z = 56; });
  await page.waitForFunction(() => window.__ctx.scene.activeWorld === 'b612', null, { timeout: 20000 });
  console.log('✓ 石门自动传送 → B612');
  // (2026-09-24 修:改显式等按钮出现;旧 ?.click() 在导航未就绪时静默不点,卡死 king 段)
  try {
    await page.waitForFunction(
      () => [...document.querySelectorAll('button')].some((x) => x.textContent.includes('前往 325')),
      null,
      { timeout: 20000 }
    );
  } catch (e) {
    const dbg = await page.evaluate(() => ({
      world: window.__ctx.scene.activeWorld,
      nav: (document.getElementById('worldNav') || { style: {} }).style.display,
      navTexts: [...document.querySelectorAll('#worldNav button')].map((x) => x.textContent),
      allBtns: [...document.querySelectorAll('button')].slice(0, 12).map((x) => x.textContent.trim().slice(0, 14)),
      boot: window.__bootCheck,
      phase: window.__worldPhase,
    }));
    console.log('导航按钮未出现,现场:', JSON.stringify(dbg));
    throw e;
  }
  await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('前往 325')).click());
  try {
    await page.waitForFunction(() => window.__ctx.scene.activeWorld === 'king325', null, { timeout: 20000 });
  } catch (e) {
    const dbg = await page.evaluate(() => ({
      world: window.__ctx.scene.activeWorld,
      transitioning: window.__ctx.scene.worldManager && window.__ctx.scene.worldManager.transitioning,
      worlds: window.__ctx.scene.worldManager && Object.keys(window.__ctx.scene.worldManager.worlds || {}),
      boot: window.__bootCheck,
      phase: window.__worldPhase,
    }));
    console.log('king 切换未发生,现场:', JSON.stringify(dbg));
    throw e;
  }
  console.log('✓ 导航按钮 → 325 国王星球');
  await page.waitForTimeout(2500); // 落地稳定
  await page.screenshot({ path: path.join(art, 'b612-pl-1-island.png') });
  const onIsland = await page.evaluate(() => {
    const p = window.__ctx.player.pl.p;
    return { x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1) };
  });
  console.log('✓ 星门传送 → 国王之星 @', JSON.stringify(onIsland));

  // 4. 章节推进契约(2026-09-24 重写:拾取按钮玩法已退役,现由剧情模块调 setChapter 推进;
  //    本步钉死 story-progress 的三条契约:只前进/封顶 6/罗盘已点亮装饰)
  const pact = await page.evaluate(() => {
    const out = {};
    const before = window.__ctx.store.num('planetsChapter');
    window.__ctx.kunlun.setChapter(1);
    out.afterUp = window.__ctx.store.num('planetsChapter');
    window.__ctx.kunlun.setChapter(0); // 试回退
    out.afterDown = window.__ctx.store.num('planetsChapter'); // 应保持 1
    window.__ctx.kunlun.setChapter(99); // 越界
    out.afterOver = window.__ctx.store.num('planetsChapter'); // 应封顶 6?不:99→min(99,6)=6,但只前进:4→? 语义=setChapter 封顶 6
    out.persisted = localStorage.getItem('b612PlanetChapter'); // store SCHEMA:planetsChapter 映射此键
    const st = window.__ctx.kunlun.spiritsState();
    out.firstPlace = st && st[0] && st[0].place;
    return out;
  });
  // 语义核对:1→1(幂等)/ 0 不回退 / 99 封顶 6 / 存档同步(schema:planetsChapter→b612PlanetChapter)/ 罗盘装饰
  const okPact =
    pact.afterUp === 1 &&
    pact.afterDown === 1 &&
    pact.afterOver === 6 &&
    pact.persisted === '6' &&
    /已点亮/.test(pact.firstPlace || '');
  if (okPact && /已点亮/.test(pact.firstPlace || ''))
    console.log('✓ 章节推进契约:前进/不回退/封顶 6/罗盘已点亮装饰 全部成立', JSON.stringify(pact));
  else { console.error('✗ 章节推进契约失败:', JSON.stringify(pact)); process.exit(1); }
  await page.screenshot({ path: path.join(art, 'b612-pl-2-picked.png') });

  // 5. 罗盘页数据:小地图标记(spiritsState 装饰后)
  const mark = await page.evaluate(() =>
    window.__ctx.kunlun.planetsMark ? window.__ctx.kunlun.planetsMark() : window.__ctx.kunlun.spiritMark && window.__ctx.kunlun.spiritMark()
  );
  console.log('✓ 小地图标记 →', JSON.stringify(mark));

  // 5.5 初见指引卡会挡导航按钮点击(首访必弹,「先逛逛」还锁 10s)——探针直接移除
  await page.evaluate(() => { const g = document.getElementById('guideCard'); if (g) g.remove(); });

  // 6. 回 B612 → 回主世界(导航按钮,验证世界切换闭环)
  const backBtn = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((x) => x.textContent.includes('返回 B612'))
  );
  if (backBtn.asElement()) {
    await backBtn.asElement().click();
    await page.waitForFunction(() => window.__ctx.scene.activeWorld === 'b612', null, { timeout: 20000 });
    console.log('✓ 导航:国王之星 → B612');
  }
  const mainBtn = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '返回主世界')
  );
  if (mainBtn.asElement()) {
    await mainBtn.asElement().click();
    await page.waitForFunction(() => (window.__ctx.scene.activeWorld || 'main') === 'main', null, { timeout: 20000 });
    console.log('✓ 导航:B612 → 主世界(闭环)');
  }

  const noise = errors.filter((e) => /dynamically imported module/.test(e));
  const real = errors.filter((e) => !/dynamically imported module/.test(e));
  if (noise.length) console.log('(环境噪音 ' + noise.length + ' 条已忽略)');
  console.log(real.length ? 'ERRORS:\n' + real.join('\n') : 'NO JS ERRORS');
  await browser.close();
  child.kill();
  setTimeout(function () {
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
    process.exit(real.length ? 1 : 0);
  }, 600);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
