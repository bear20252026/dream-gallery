// 开场→真实沙漠画羊→B612四站→退梦再穿门→国王互动→回B612。
// 不改时间、不跳剧情进度；点击加速读对白。服务与访客数据隔离。
const fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const { launch } = require('./browser.js');
const { pathToFileURL } = require('url');
const ROOT = path.resolve(__dirname, '../..');
const PORT = Number(process.env.JOURNEY_PORT || 3261);
const EXTERNAL = process.env.PROBE_URL || process.env.JOURNEY_BASE_URL;
const ORIGIN = (EXTERNAL || 'http://localhost:' + PORT).replace(/\/$/, '');
const PROBE_WAIT = Number(process.env.PROBE_WAIT_MS || 60000);
const MOBILE = process.env.JOURNEY_MOBILE === '1';
const UI_ONLY = process.env.JOURNEY_UI_ONLY === '1'; // 补测最终UI，完整主线默认仍从开场开始
const WALK = process.env.JOURNEY_WALK === '1'; // 小世界用真正W移动，禁止设置位置来替代导航
const HOME_ONLY = process.env.JOURNEY_HOME_ONLY === '1'; // 收尾补测入场全景及曲面镜头，不替代完整路线
const shot = (name) => path.join(ROOT, 'scripts/artifacts/journey-' + (EXTERNAL ? 'online-' : '') + (MOBILE ? 'mobile-' : '') + name + '.png');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'b612-journey-'));
let child, browser, lastPage, checks = 0;
function assert(value, label) {
  if (!value) throw Error(label);
  checks++; console.log('PASS ' + label);
}
async function startServer() {
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, ['server.js'], { cwd: ROOT,
      env: { ...process.env, PORT: String(PORT), USE_SQLITE: '0', GATE_DATA_FILE: path.join(TMP, 'gate.json') },
      stdio: ['ignore', 'pipe', 'pipe'] });
    const timeout = setTimeout(() => reject(Error('server timeout')), 12000);
    child.once('error', reject);
    child.stdout.on('data', (d) => { if (d.toString().includes('服务器已启动')) { clearTimeout(timeout); resolve(); } });
  });
}
async function wait(p, predicate, timeout = PROBE_WAIT) { await p.waitForFunction(predicate, null, { timeout: Math.max(timeout, PROBE_WAIT) }); }
async function move(p, x, z) {
  if (WALK && await p.evaluate(() => window.__ctx.scene.activeWorld !== 'main')) {
    const started = Date.now();
    try {
      while (Date.now() - started < 90000) {
        const d = await p.evaluate(({ x, z }) => {
          const pl = window.__ctx.player.pl;
          const distance = Math.hypot(pl.p.x-x, pl.p.z-z);
          // 转望只调整镜头，不修改角色位置；位移完全交给真实移动输入。
          if (!window.__ctx.ui.dialogOpen() && !window.__ctx.overlay.anyOpen()) {
            pl.y = Math.atan2(-(x-pl.p.x), -(z-pl.p.z)); pl.pi = -.1;
          }
          return distance;
        }, { x, z });
        if (d <= 1.4) return;
        await p.keyboard.down('w'); await p.waitForTimeout(200);
      }
      throw Error('真实步行未到目标 ' + x + ',' + z);
    } finally { await p.keyboard.up('w'); }
  }
  await p.evaluate(({ x, z }) => { const q = window.__ctx.player.pl.p; q.x = x; q.z = z; }, { x, z });
  await p.waitForTimeout(300);
}
async function gate(p) {
  const { GATE_POS } = await import(pathToFileURL(path.join(ROOT, 'src/shared/planet-logic.mjs')).href);
  await move(p, -3.5, 70.5);
  await p.waitForTimeout(800);
  await move(p, GATE_POS.x, GATE_POS.z);
  await wait(p, () => window.__ctx.scene.activeWorld === 'b612');
}
async function task(p, id) {
  await wait(p, () => !!window.__ctx.ui.journey.state());
  assert(await p.evaluate((id) => window.__ctx.ui.journey.state().id === id, id), '任务 ' + id);
  // 最后一行的closeDialog同帧打开任务；等隐藏旅行钮和可点击区域同步。
  await p.waitForTimeout(400);
  if (MOBILE && await p.locator('#journeyTask').isVisible()) assert(await p.locator('#journeyTask').evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.left >= 0 && r.top >= 100 && r.right <= innerWidth && r.bottom <= innerHeight - 100;
  }), '手机任务卡留出目标条和移动按钮');
}
async function observe(p, x, z) {
  await move(p, x, z);
  const button = p.locator('#journeyTask [data-journey-action="observe"]');
  if (MOBILE) await button.tap(); else await button.click();
}
async function checkFinalUi(p) {
  // 旧存档仍有现实中的重逢对白，先像玩家一样读完再进入测试场。
  await p.waitForTimeout(5000);
  for (let i = 0; i < 30; i++) {
    const open = await p.evaluate(() => {
      const d = document.getElementById('gameDialog');
      if (!d || getComputedStyle(d).display === 'none') return false;
      const choice = d.querySelector('.gs-choice');
      if (choice) choice.click(); else d.click();
      return true;
    });
    if (!open) break;
    await p.waitForTimeout(250);
  }
  await p.evaluate(async () => {
    window.__ctx.store.setNum('planetsChapter', 1);
    window.__ctx.store.setJson('journeyMemories', ['volcano','baobab','sunset','rose','almanac','rat','king'].map(id => ({ id, choice: null })));
    await window.__ctx.scene.worldManager.enter('king325');
  });
  await p.waitForTimeout(2000);
  await wait(p, () => !window.__ctx.ui.dialogOpen());
  await p.evaluate(() => window.__ctx.ui.openDialog({ speaker: '剧情验收', lines: ['这句对白等待玩家确认。'], autoHide: 0, lock: true, scope: 'ui-manual-probe', world: 'king325' }));
  await p.locator('#gameDialog .gs-next').tap();
  const line = await p.locator('#gameDialog .gs-text').textContent();
  await p.waitForTimeout(10000);
  assert(await p.locator('#gameDialog').isVisible() && await p.locator('#gameDialog .gs-text').textContent() === line, '对白读完后持续等待玩家确认');
  await p.evaluate(() => window.__ctx.ui.kunlunSpeak('背景提示不应替换主线对白'));
  assert(await p.locator('#gameDialog .gs-text').textContent() === line, '背景提示不会打断主线对白');
  await p.evaluate(() => window.__ctx.ui.journey.openHelp());
  await p.locator('.jn-close').tap();
  assert(await p.locator('#gameDialog .gs-text').textContent() === line, '打开帮助后仍停留在同一句对白');
  await p.evaluate(async () => {
    window.__ctx.ui.openDialog({ speaker: '待播旧世界', lines: ['这句不应跨世界补播。'], autoHide: 0, lock: true, scope: 'ui-manual-probe', world: 'king325' });
    await window.__ctx.scene.worldManager.back();
    await window.__ctx.scene.worldManager.enter('king325');
  });
  await p.waitForTimeout(1500);
  assert(await p.locator('#gameDialog').isHidden(), '切换世界取消当前和待播的旧世界对白');
  await p.evaluate(() => { window.__ctx.ui.journey.beginTask('ui-probe', 'almanac'); });
  await task(p, 'almanac');
  assert(await p.locator('.jt-clock').evaluate(el => {
    const r = el.getBoundingClientRect(), label = document.querySelector('.jt-dial-label').getBoundingClientRect();
    return r.bottom <= label.top + 1;
  }), '时间大字与刻度标签没有重叠');
  await p.locator('#journeyClock').focus(); await p.keyboard.press('ArrowRight');
  assert(await p.locator('.jt-clock').textContent() === '18:35', '时间刻度支持键盘调整');
  await p.locator('#journeyClock').fill('1180');
  await p.screenshot({ path: shot('king') });
  await p.locator('[data-journey-action="confirm-time"]').tap();
  assert(await p.evaluate(() => window.__ctx.ui.journey.state() === null), '触摸确认可以完成任务');
  await p.evaluate(() => window.__ctx.ui.journey.openNotebook());
  const before = await p.evaluate(() => ({...window.__ctx.player.pl.p}));
  await p.keyboard.down('w'); await p.waitForTimeout(500); await p.keyboard.up('w');
  assert(await p.evaluate(before => {
    const p = window.__ctx.player.pl.p; return Math.hypot(p.x-before.x,p.y-before.y,p.z-before.z) < .01;
  }, before), '读手札期间角色停止移动');
  await p.locator('.jn-book').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await p.locator('.jn-close').tap();
  assert(await p.locator('#journeyNotebook').isHidden(), '手机末页仍可触摸关闭手札');
  await p.evaluate(() => window.__ctx.ui.journey.openNotebook());
  await p.screenshot({ path: shot('notebook') });
}
async function run() {
  if (!EXTERNAL) await startServer();
  browser = await launch();
  const context = await browser.newContext(MOBILE
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }
    : { viewport: { width: 1280, height: 800 } });
  const p = await context.newPage();
  context.setDefaultTimeout(PROBE_WAIT);
  lastPage = p;
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.addInitScript(() => {
    sessionStorage.setItem('dialogVoiceOff', String(Date.now()));
    sessionStorage.setItem('nickPopOff', '1');
    localStorage.setItem('scriptLang', 'zh');
    localStorage.setItem('kunlunWelcomed', String(Date.now()));
    localStorage.setItem('genderSelected', '1'); localStorage.setItem('gender', 'female');
  });
  if (UI_ONLY) await p.addInitScript(() => {
    localStorage.setItem('b612Scene2', '1'); localStorage.setItem('b612Page1', '1');
    localStorage.setItem('b612PlanetChapter', '1');
  });
  await p.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: PROBE_WAIT });
  await p.waitForSelector('#b612Gate');
  await p.locator('#gAgreeChk').check();
  await p.locator('#b612Gate .gEnter').click();
  await p.waitForSelector('#b612film #cBoa', { state: 'visible', timeout: 60000 });
  await p.locator('#b612film #cBoa').click();
  assert(await p.evaluate(() => !window.__bootState.worldStarted && document.getElementById('c').style.visibility === 'hidden'), '电影期间主地图预加载但尚未揭幕');
  if (process.env.FULL_OPENING !== '1') await p.locator('#b612film #fSkip').click();
  await wait(p, () => !document.getElementById('b612film'), 90000);
  await wait(p, () => !!window.__ctx.ui.journey && !!window.__ctx.scene.worldManager, 90000);
  if (UI_ONLY) {
    await checkFinalUi(p);
    assert(errors.length === 0, 'UI操作无页面异常');
    console.log('PASS final UI ' + checks + ' checks'); return;
  }
  assert(await p.evaluate(() => window.__ctx.scene.activeWorld === 'main'), '电影后首先进入沙漠主地图');
  assert(await p.locator('#coordHud').isHidden(), '游玩画面默认隐藏坐标');
  assert(await p.evaluate(() => document.getElementById('questHud').classList.contains('folded')), '目标条默认紧凑');
  await p.evaluate(() => {
    // 模拟玩家点击“继续”，不抢有选项的互动。
    window.__journeyPump = setInterval(() => {
      if (window.__journeyPause) return;
      if (window.__journeyTransitionsAllowed) document.querySelector('#journeyTransition [data-journey-action="continue"]')?.click();
      const d = document.getElementById('gameDialog');
      if (!d || getComputedStyle(d).display === 'none') return;
      const choice = d.querySelector('.gs-choice');
      if (choice && choice.offsetParent && window.__ctx.scene.activeWorld === 'main') choice.click();
      else if (!choice) d.click();
    }, 220);
  });
  await p.waitForSelector('#scene2Board', { timeout: 60000 });
  const round = await p.locator('#scene2Round').textContent();
  await p.waitForTimeout(6500);
  assert(await p.locator('#scene2Round').textContent() === round, '没有落笔时画纸持续等待，不自动替玩家提交');
  for (let i = 1; i <= 4; i++) {
    await wait(p, () => {
      const d = document.getElementById('scene2Done');
      return d && d.offsetParent && getComputedStyle(d).pointerEvents !== 'none';
    });
    const box = await p.locator('#scene2Board svg').boundingBox();
    await p.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
    await p.mouse.down();
    await p.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.45, { steps: 5 });
    await p.mouse.up();
    await p.locator('#scene2Done').click();
    if (i < 4) await p.waitForFunction((i) => document.getElementById('scene2Round')?.textContent.startsWith(String(i + 1)), i);
  }
  await wait(p, () => window.__ctx.store.flag('scene2'));
  assert(true, '沙漠里亲手完成四笔画羊');
  await wait(p, () => window.__starGate.visible());
  await gate(p);
  assert(await p.evaluate(() => !window.__ctx.store.flag('page1')), '初访B612先经历家的回忆');
  assert(!(await p.locator('#worldNav').textContent()).includes('前往 325'), '家的回忆未完成，不能跳到国王星');
  await wait(p, () => !!window.__ctx.scene.worldManager.getWorld('b612').meta.surface);
  assert(await p.evaluate(() => {
    const w = window.__ctx.scene.worldManager.getWorld('b612');
    return !w.scene.getObjectByName('homeWalkGround') && !!w.scene.getObjectByName('b612Storybook');
  }), '保留原星球模型，平坦圆盘已撤除');
  assert(await p.evaluate(() => {
    const w = window.__ctx.scene.worldManager.getWorld('b612');
    return [[-4.6,-5.2],[-.8,-6.6],[3.8,-5.4],[3.4,-2.6],[-3.6,-.6],[-5.8,-.6],[-5.1,3.1],[-1.4,4.5],[2.46,-1.56]].every(([x,z]) => Number.isFinite(w.ground(x,z)));
  }), '全部观察站位落在原模型真实曲面上');
  await wait(p, () => !!document.body.dataset.homeReveal);
  // 入场状态由回忆ticker建立，机位在下一帧的星球ticker更新；等待实际渲染机位。
  await p.waitForFunction(() => {
    const c = window.__ctx.scene.cam, p = window.__ctx.player.pl.p;
    return !!document.body.dataset.homeReveal && Math.hypot(c.position.x-p.x, c.position.z-p.z) > 20;
  }, null, { timeout: 5000 });
  assert(await p.evaluate(() => {
    const c = window.__ctx.scene.cam, p = window.__ctx.player.pl.p;
    return Math.hypot(c.position.x-p.x, c.position.z-p.z) > 20;
  }), '首次入场镜头实际拉远展示原星球');
  await p.screenshot({path: shot('planet-overview')});
  await p.locator('#journeyTransition').waitFor({state:'visible'});
  await p.waitForTimeout(3000);
  assert(await p.evaluate(() => window.__homeMemory.state().step === -1), '进入回忆前明确交接，未确认不自行推进');
  await p.screenshot({path: shot('chapter')});
  await p.evaluate(() => { window.__journeyTransitionsAllowed = true; });
  await wait(p, () => window.__homeMemory?.state().step === 0);
  await p.locator('#viewBtn').click();
  await p.evaluate(() => { window.__ctx.player.orbit.pitch = .12; window.__ctx.player.orbit.dist = 3; });
  await p.waitForTimeout(900);
  assert(await p.evaluate(() => {
    const c = window.__ctx, p = c.player.pl.p, w = c.scene.worldManager.getWorld('b612');
    return c.player.viewMode === 1 && Math.abs(p.y - 1.6 - w.ground(p.x,p.z)) < .03;
  }), '第三人称的脚底同样贴合原星球地表');
  assert(await p.evaluate(() => window.__ctx.scene.cam.position.y < 0), '坡面上的第三人称镜头不再被错误抬到0m平面');
  await p.screenshot({path: shot('curved-walk')});
  await p.locator('#viewBtn').click();
  if (MOBILE) {
    const before = await p.evaluate(() => ({...window.__ctx.player.pl.p}));
    const b = await p.locator('#jb').boundingBox(), touch = await context.newCDPSession(p);
    const x = b.x + b.width/2, y = b.y + b.height/2;
    await touch.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[{x,y,id:17}]});
    await touch.send('Input.dispatchTouchEvent', {type:'touchMove', touchPoints:[{x,y:y-30,id:17}]});
    await p.waitForTimeout(500);
    await touch.send('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints:[]});
    await touch.detach();
    assert(await p.evaluate(before => {
      const p = window.__ctx.player.pl.p; return Math.hypot(p.x-before.x,p.z-before.z) > .05;
    }, before), '手机真实触摸摇杆能在原星球上移动');
    assert(await p.evaluate(() => {
      const c = window.__ctx, p = c.player.pl.p;
      return Math.abs(p.y - 1.6 - c.scene.worldManager.getWorld('b612').ground(p.x,p.z)) < .03;
    }), '触摸移动后仍贴合曲面');
  }
  if (WALK) {
    await p.locator('[data-journey-action="face-target"]').click();
    await p.waitForFunction(() => document.getElementById('storyCompass').textContent.includes('向前走'));
    assert(await p.locator('#storyCompass').textContent().then(t => t.includes('向前走')), '看向目标后方向提示为向前走');
  }
  await move(p, -4.6, -5.2);
  assert(await p.evaluate(() => {
    const p = window.__ctx.player.pl.p, w = window.__ctx.scene.worldManager.getWorld('b612');
    return Math.abs(p.y - w.ground(p.x,p.z) - 1.6) < .03;
  }), '步行时脚下高度跟随坡面，不悬空或穿地');
  assert(await p.evaluate(() => {
    const c = window.__ctx, p = c.player.pl.p;
    return c.player.viewMode === 0 && c.scene.cam.position.distanceTo(p) < .03;
  }), '曲面步行后第一人称镜头与角色同帧同步');
  if (HOME_ONLY) {
    assert(errors.length === 0, '全景与曲面镜头无页面异常');
    console.log('PASS home camera ' + checks + ' checks'); return;
  }
  await task(p, 'volcano');
  assert(await p.locator('#journeyTask [data-journey-action="observe"]').isEnabled(), '真实走近第一座火山才能观察');
  await observe(p, -4.6, -5.2);
  assert(await p.locator('#journeyTask').isHidden(), '下一观察点较远时收起卡片，让出探索视野');
  assert(await p.evaluate(() => window.__ctx.ui.journey.goal().zh === '中间火山'), '光点和导航跟随当前火山，不再被旧站名覆盖');
  await observe(p, -0.8, -6.6);
  await observe(p, 3.8, -5.4);
  await p.locator('[data-journey-action="volcano-0"]').click();
  assert(await p.evaluate(() => window.__ctx.ui.journey.state()?.id === 'volcano'), '错误圈选给线索，尚未奖励记忆');
  await p.locator('[data-journey-action="volcano-2"]').click();
  await move(p, 3.4, -2.6); await task(p, 'baobab');
  await p.locator('[data-journey-action="mark"]').click();
  assert(await p.evaluate(() => window.__ctx.ui.journey.state().step === 0), '树苗误认不推进');
  await p.locator('[data-journey-action="keep"]').click();
  await p.locator('[data-journey-action="mark"]').click();
  assert(await p.evaluate(() => window.__ctx.store.num('homeMemoryStep') === 2), '家的完成站位有检查点，不用从头读');
  await move(p, -3.6, -0.6); await task(p, 'sunset');
  await observe(p, -5.8, -0.6);
  await observe(p, -5.1, 3.1);
  await observe(p, -1.4, 4.5);
  await move(p, 2.46, -1.56); await task(p, 'rose');
  fs.mkdirSync(path.join(ROOT, 'scripts/artifacts'), { recursive: true });
  await p.screenshot({ path: shot('home') });
  await p.locator('[data-journey-action="keep-2"]').click();
  await wait(p, () => window.__ctx.store.flag('page1') && window.__ctx.scene.activeWorld === 'main');
  assert(await p.evaluate(() => window.__ctx.store.json('journeyMemories', []).length === 4), '家的四段观察已存档，完成后退梦回沙漠');
  await gate(p);
  await p.getByRole('button', { name: /前往 325/ }).click();
  await wait(p, () => window.__ctx.scene.activeWorld === 'king325');
  await task(p, 'almanac');
  await p.locator('[data-journey-action="confirm-time"]').click();
  assert(await p.evaluate(() => window.__scene6.state.stage === 'almanac'), '错误的历书时刻不会触发日落');
  // 中途退出必须清理当前互动；再次进岛重新完整执行，不残留旧链。
  await p.evaluate(() => window.__ctx.scene.worldManager.back());
  await wait(p, () => window.__ctx.scene.activeWorld === 'b612');
  assert(await p.evaluate(() => window.__ctx.ui.journey.state() === null), '离开国王星取消尚未完成的互动');
  await p.getByRole('button', { name: /前往 325/ }).click();
  await task(p, 'almanac');
  await p.locator('#journeyClock').fill('1180');
  await p.screenshot({ path: shot('king') });
  await p.locator('[data-journey-action="confirm-time"]').click();
  await task(p, 'rat');
  assert(await p.evaluate(() => window.__ctx.store.num('kingMemoryStep') === 3), '历书与已读对白的段落已保存');
  await observe(p, 4.5, 1); await observe(p, -4.5, -1);
  await wait(p, () => window.__scene6.state.pickupArmed);
  await move(p, 0, 9);
  await wait(p, () => window.__ctx.store.num('planetsChapter') === 1);
  assert(await p.evaluate(() => window.__ctx.store.json('journeyMemories', []).length === 7), '国王两次观察与星屑纪念页齐备');
  await p.waitForTimeout(2500);
  const door = await p.evaluate(() => {
    const d = window.__ctx.scene.worldManager.getWorld('king325').scene.getObjectByName('sproutDoor');
    return { x: d.position.x, z: d.position.z };
  });
  await move(p, door.x, door.z);
  await wait(p, () => window.__ctx.scene.activeWorld === 'b612');
  await p.getByRole('button', { name: /前往 326/ }).waitFor({ state: 'visible' });
  assert(await p.getByRole('button', { name: /前往 326/ }).count() === 1, '回程沿原主线继续326，不伪造全书结局');
  await p.evaluate(() => window.__ctx.ui.journey.openNotebook());
  assert(await p.locator('.jn-memory').count() === 7, '手札显示七张已获得的插画记忆');
  if (MOBILE) assert(await p.locator('.jn-book').evaluate(el => el.scrollHeight > el.clientHeight && el.clientWidth <= innerWidth), '手机手札单列滚动且没有横向溢出');
  await p.screenshot({ path: shot('notebook') });
  if (MOBILE) {
    await p.locator('.jn-book').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await p.locator('.jn-close').tap();
    assert(await p.locator('#journeyNotebook').isHidden(), '手机翻到末页后仍能点关闭');
    await p.evaluate(() => window.__ctx.ui.journey.openNotebook());
  }
  await p.keyboard.press('Escape');
  assert(await p.locator('#journeyNotebook').isHidden(), '手札支持Esc关闭');
  await p.evaluate(() => {
    window.__ctx.store.setStr('lang', 'en');
    document.querySelector('button[aria-label="切换语言 / toggle language"]')?.click();
  });
  await p.evaluate(() => window.__ctx.ui.journey.openNotebook());
  assert((await p.locator('.jn-title').textContent()) === 'Travel notebook', '手札支持英文切换');
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#b612Gate');
  await p.locator('#gAgreeChk').check(); await p.locator('#b612Gate .gEnter').click();
  await p.waitForSelector('#b612film #fSkip', { state: 'visible' });
  await p.locator('#b612film #fSkip').click();
  await wait(p, () => !!window.__ctx.ui.journey, 90000);
  assert(await p.evaluate(() => window.__ctx.store.json('journeyMemories', []).length === 7), '刷新后记忆仍保留');
  assert(errors.length === 0, '完整路线无页面异常: ' + errors.join(' | '));
  console.log('PASS journey ' + checks + ' checks');
}
run().catch(async (e) => {
  console.error('FAIL ' + e.stack); process.exitCode = 1;
  if (lastPage) {
    fs.mkdirSync(path.join(ROOT, 'scripts/artifacts'), { recursive: true });
    await lastPage.screenshot({ path: path.join(ROOT, 'scripts/artifacts/journey-failure.png') }).catch(() => {});
    console.log(await lastPage.evaluate(() => ({
      world: window.__ctx?.scene.activeWorld, home: window.__homeMemory?.state(), king: window.__scene6?.state,
      task: window.__ctx?.ui.journey?.state(), dialog: document.getElementById('gameDialog')?.textContent,
    })).catch(() => null));
  }
}).finally(async () => {
  if (browser) await browser.close();
  if (child) child.kill();
  // 临时数据保留给系统临时目录清理，避免Windows文件句柄关闭竞态。
});
