// 专项同伴验收：独立浏览器旧档夹具；不替代真实画羊→入梦的旅途探针。
const path = require('path');
const { pathToFileURL } = require('url');
const { launch } = require('./browser.js');
const BASE = process.env.PROBE_URL || 'http://localhost:3263';
const MOBILE = process.env.SHEEP_MOBILE === '1';
let browser,
  page,
  checks = 0;
const errors = [];
const assert = (value, name) => {
  if (!value) throw Error(name);
  console.log('PASS ' + name);
  checks++;
};
const wait = (fn) => page.waitForFunction(fn, null, { timeout: 60000 });
async function enter(world) {
  const { spawnFor } = await import(
    pathToFileURL(path.resolve(__dirname, '../../src/shared/planet-logic.mjs')).href
  );
  await page.evaluate(
    async ({ world, player }) => {
      await window.__deferredWorldReady;
      await window.__ctx.scene.worldManager.enter(world, { player });
    },
    { world, player: spawnFor(world) }
  );
}
const click = async (selector) =>
  MOBILE ? page.locator(selector).tap() : page.locator(selector).click();
const snap = (name) =>
  page.screenshot({
    path: path.resolve(
      __dirname,
      '../artifacts/sheep-' + (MOBILE ? 'mobile-' : '') + name + '.png'
    ),
  });
const info = () =>
  page.evaluate(() => {
    const c = window.__ctx,
      root = c.scene.s.getObjectByName('sheepCompanion');
    return root
      ? {
          visible: root.visible,
          p: root.position.toArray(),
          ground: c.scene.getActiveGround(root.position.x, root.position.z),
          state: root.userData.companion,
        }
      : null;
  });
async function run() {
  browser = await launch();
  const context = await browser.newContext(
    MOBILE
      ? {
          viewport: { width: 390, height: 844 },
          isMobile: true,
          hasTouch: true,
          deviceScaleFactor: 1,
        }
      : { viewport: { width: 1280, height: 800 } }
  );
  page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && /WebGLProgram|Shader Error|uniform/i.test(m.text()))
      errors.push(m.text());
  });
  await page.addInitScript(() => {
    sessionStorage.setItem('dialogVoiceOff', String(Date.now()));
    sessionStorage.setItem('nickPopOff', '1');
    for (const [k, v] of Object.entries({
      scriptLang: 'zh',
      kunlunWelcomed: String(Date.now()),
      genderSelected: '1',
      gender: 'female',
      b612Scene2: '1',
      b612Page1: '1',
      b612HomeMemoryStep: '4',
      b612PlanetChapter: '1',
      b612KingMemoryStep: '6',
      b612JourneyMemories: JSON.stringify(
        ['volcano', 'baobab', 'sunset', 'rose', 'almanac', 'rat', 'king'].map((id) => ({
          id,
          choice: null,
        }))
      ),
    }))
      localStorage.setItem(k, v);
  });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b612Gate');
  await page.locator('#gAgreeChk').check();
  await click('#b612Gate .gEnter');
  await page.waitForSelector('#b612film #cBoa');
  await click('#b612film #cBoa');
  await click('#b612film #fSkip');
  await wait(
    () =>
      !!window.__compositionRoot && !!window.__ctx.ui.journey && !!window.__ctx.scene.worldManager
  );
  await page.evaluate(() => {
    window.__sheepPump = setInterval(() => {
      if (window.__sheepPause) return;
      const d = document.getElementById('gameDialog');
      if (!d || getComputedStyle(d).display === 'none') return;
      const b = d.querySelector('.gs-choice') || d;
      b.click();
    }, 160);
  });
  await wait(
    () => !!window.__ctx.scene.s.getObjectByName('sheepBox') && !window.__ctx.ui.dialogOpen()
  );
  assert((await info()) === null, '现实只保留羊箱，没有实体小羊');
  await page.evaluate(() => {
    const c = window.__ctx,
      b = c.scene.s.getObjectByName('sheepBox');
    c.player.pl.p.set(b.position.x + 1, b.position.y + 1.6, b.position.z);
  });
  await wait(
    () =>
      document.getElementById('sheepCompanion').style.display === 'block' &&
      !window.__ctx.ui.dialogOpen()
  );
  assert(
    (await page.locator('#sheepCompanion button').textContent()) === '摸摸羊箱',
    '现实提供摸摸羊箱'
  );
  await click('#sheepCompanion button');
  await page.waitForTimeout(300);
  assert(await page.locator('#sheepCompanion button').isVisible(), '触摸自身不会误关互动按钮');
  assert(await page.evaluate(() => !window.__ctx.ui.dialogOpen()), '摸羊箱不插入新的剧情对白');
  await enter('b612');
  await wait(() => {
    const r = window.__ctx.scene.s.getObjectByName('sheepCompanion');
    return r?.visible && r.userData.companion;
  });
  await wait(() => document.getElementById('sheepCompanion').style.display === 'block');
  const resting = await info();
  assert(Math.abs(resting.p[1] - resting.ground) < 0.03, '小羊落在原星球实际曲面');
  const original = await page.evaluate(() => {
    let meshes = 0;
    window.__ctx.scene.s.traverse((m) => {
      if (/PlanetLP/.test(m.name)) meshes++;
    });
    return meshes;
  });
  assert(original > 0, '保留原星球地形网格');
  const start = await info();
  await page.keyboard.down('w');
  await page.waitForTimeout(850);
  const walking = await info();
  await page.keyboard.up('w');
  assert(
    Math.hypot(walking.p[0] - start.p[0], walking.p[2] - start.p[2]) > 0.1,
    '真实行走时小羊跟上'
  );
  assert(
    walking.state.walk > 0.2 && walking.state.phase > start.state.phase,
    '四腿迈步随实际位移推进'
  );
  await wait(() => {
    const r = window.__ctx.scene.s.getObjectByName('sheepCompanion');
    return r?.userData.companion.mode === 'idle';
  });
  await wait(
    () =>
      !document.querySelector('#sheepCompanion button').disabled &&
      document.getElementById('sheepCompanion').style.display === 'block'
  );
  await click('#sheepCompanion button');
  await page.waitForTimeout(600);
  await snap('home');
  assert((await info()).state.mode === 'responding', '摸小羊时停步并歪头回应');
  assert(await page.evaluate(() => !window.__ctx.ui.dialogOpen()), '小羊回应不抢剧情对白');
  assert(
    await page.locator('#sheepCompanion').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && r.top >= 100 && r.bottom < innerHeight - 100;
    }),
    '手机/桌面互动按钮在可操作范围'
  );
  await page.evaluate(() => {
    window.__sheepPause = true;
    window.__ctx.ui.openDialog({
      speaker: '剧情验收',
      lines: ['这段话等待你读完。'],
      autoHide: 0,
      lock: true,
      scope: 'sheep-probe',
      world: 'b612',
    });
  });
  await wait(() => document.getElementById('sheepCompanion').style.display === 'none');
  const before = await info();
  await page.waitForTimeout(700);
  assert((await info()).state.mode === 'waiting', '读对白时小羊安静等待');
  assert(
    Math.hypot((await info()).p[0] - before.p[0], (await info()).p[2] - before.p[2]) < 0.01,
    '对白中不绕着玩家乱走'
  );
  await page.evaluate(() => {
    window.__ctx.ui.cancelDialogScope('sheep-probe');
    window.__sheepPause = false;
  });
  await page.evaluate(() => {
    const c = window.__ctx;
    c.ui.journey.beginTask('sheep-probe', 'sunset');
    const goal = c.ui.journey.goal(),
      pl = c.player.pl;
    pl.p.x = goal.x;
    pl.p.z = goal.z;
  });
  await wait(() => document.querySelector('[data-journey-action="observe"]')?.disabled === false);
  await click('[data-journey-action="observe"]');
  await wait(
    () =>
      window.__ctx.scene.s.getObjectByName('sheepCompanion')?.userData.companion.mode === 'sitting'
  );
  await page.waitForTimeout(800);
  await snap('sunset');
  assert(
    await page.evaluate(() => !!window.__ctx.ui.journey.state()?.preview),
    '记录日落前小羊在旁坐下'
  );
  await page.evaluate(() => window.__ctx.ui.journey.cancel('sheep-probe'));
  await page.evaluate(() => window.__ctx.ui.journey.openHelp());
  assert(
    (await page.locator('#journeyNotebook a[href*="sketchfab"]').count()) === 1,
    '帮助中有模型作者署名'
  );
  await click('.jn-close');
  await click('button[aria-label="切换语言 / toggle language"]');
  await wait(
    () => document.querySelector('#sheepCompanion button').textContent === 'Pet your sheep'
  );
  assert(true, '同伴按钮支持中英文');
  await page.evaluate(async () => {
    const listener = window.__ctx.scene.cam.children.find((n) => n.context && n.getInput);
    window.__sheepAudioCount = 0;
    const original = listener.context.createOscillator.bind(listener.context);
    listener.context.createOscillator = () => {
      window.__sheepAudioCount++;
      return original();
    };
    await listener.context.resume();
  });
  await wait(
    () =>
      !document.querySelector('#sheepCompanion button').disabled &&
      document.getElementById('sheepCompanion').style.display === 'block'
  );
  await click('#sheepCompanion button');
  assert(await page.evaluate(() => window.__sheepAudioCount === 0), '静音模式不会擅自播放羊叫');
  await page.evaluate(() => localStorage.setItem('avOn', '1'));
  await wait(() => !document.querySelector('#sheepCompanion button').disabled);
  await click('#sheepCompanion button');
  assert(
    await page.evaluate(() => window.__sheepAudioCount === 2),
    '开启音效后通过共享音频播放轻叫'
  );
  await page.evaluate(() => localStorage.removeItem('avOn'));
  await enter('king325');
  await wait(() => window.__ctx.scene.s.getObjectByName('sheepCompanion')?.visible);
  const king = await info();
  assert(
    Number.isFinite(king.ground) && Math.abs(king.p[1] - king.ground) < 0.03,
    '国王星球的小羊落在既有岛面高度'
  );
  assert(
    await page.evaluate(
      () =>
        !window.__ctx.scene.worldManager.getWorld('b612').scene.getObjectByName('sheepCompanion')
    ),
    '换星球带上同一只羊，不留下副本'
  );
  await page.waitForTimeout(800);
  await snap('king');
  await page.evaluate(async () => window.__ctx.scene.worldManager.toMain());
  await wait(() => window.__ctx.scene.activeWorld === 'main');
  assert((await info()) === null, '退梦后羊回到箱子，现实无投影');
  await enter('b612');
  await wait(() => window.__ctx.scene.s.getObjectByName('sheepCompanion')?.visible);
  assert(
    await page.evaluate(() => {
      let n = 0;
      window.__ctx.scene.s.traverse((o) => {
        if (o.name === 'sheepCompanion') n++;
      });
      return n === 1;
    }),
    '重复入梦只创建一个同伴'
  );
  await page.evaluate(() => {
    window.__compositionRoot.get('sheep-companion').dispose();
  });
  await page.waitForTimeout(400);
  assert(
    (await page.locator('#sheepCompanion').count()) === 0 && (await info()) === null,
    '卸载清除模型和触摸控件'
  );
  assert(errors.length === 0, '无页面、着色器异常');
  console.log('PASS sheep companion ' + checks + ' checks');
}
run()
  .catch(async (e) => {
    console.error(e.stack);
    if (page) {
      console.log(await info().catch(() => null));
      await snap('failure').catch(() => {});
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
  });
