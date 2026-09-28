// b612-327-guidance-probe.cjs — 第7场(326 虚荣 + 327 酒鬼)全链验收(2026-09-27 情节阶段二)
// 流程:chapter=1 预置(跳过 325,直测第7场)→ B612 导航「前往 326」→ 登场四句 →
//   拍手蒙太奇 → 帽子六句 → 星屑信标 + 「去拾起它」→ 拾取即撤 + 章节=2 +
//   「326,写完了」→ 回程石环 → 回 B612 → 导航「前往 327」→ 十问答链 → 沉默演出 →
//   星屑信标 + 「去拾起它」→ 拾取即撤 + 章节=3 + 「书页五,写完了」→ 回程石环 → 回 B612。
// 默认本地起服实测;BASE_URL=https://... 直测线上。台词静音走纯文本节奏。
// 退出码 0=全绿。
const path = require('path'),
  fs = require('fs'),
  os = require('os'),
  { spawn } = require('child_process');
const { launch } = require('./browser.js');
const ROOT = path.join(__dirname, '..', '..'),
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'scene7-')),
  PORT = process.env.SCENE7_PROBE_PORT || 3279;
function start() {
  return new Promise((resolve, reject) => {
    const c = spawn(
      process.execPath,
      ['server.js'],
      { cwd: ROOT, env: { ...process.env, PORT: String(PORT), GATE_DATA_FILE: path.join(TMP, 'g.json') }, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    c.stdout.on('data', (d) => {
      if (d.toString().includes('服务器已启动')) resolve(c);
    });
    c.on('error', reject);
    setTimeout(() => reject(Error('server timeout')), 12000);
  });
}
(async () => {
  const local = !process.env.BASE_URL;
  const URL = process.env.BASE_URL || 'http://localhost:' + PORT + '/';
  const child = local ? await start() : null;
  let pass = 0,
    fail = 0;
  const ok = (name, cond, extra) => {
    if (cond) { pass++; console.log('✓ ' + name + (extra ? ' | ' + extra : '')); }
    else { fail++; console.log('✗ ' + name + (extra ? ' | ' + extra : '')); }
  };
  const b = await launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  p.on('pageerror', (e) => { if (!/dynamically imported module/.test(e.message)) errs.push(e.message); });
  await p.addInitScript(() => {
    try {
      sessionStorage.setItem('nickPopOff', '1');
      sessionStorage.setItem('dialogVoiceOff', String(Date.now())); // 台词静音:纯 autoHide 节奏,探针确定性
      localStorage.setItem('kunlunWelcomed', String(Date.now()));
      localStorage.setItem('b612Scene2', '1');
      localStorage.setItem('b612Page1', '1');
      localStorage.setItem('b612PlanetChapter', '1'); // 325 已完成,直测第7场交接(键名见 store-api SCHEMA)
    } catch (e) {}
  });
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('#b612Gate', { timeout: 90000 });
  await p.evaluate(() => {
    const c = document.getElementById('gAgreeChk');
    c.checked = true;
    c.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.click('#b612Gate .gEnter');
  await p.waitForFunction(() => !document.getElementById('b612Gate'), null, { timeout: 15000 });
  await p.waitForSelector('#b612film', { timeout: 20000 });
  await p.waitForTimeout(1200);
  await p.click('#b612film #fSkip');
  await p.waitForFunction(() => !document.getElementById('b612film'), null, { timeout: 20000 });
  await p.waitForTimeout(2200);
  await p.click('#genderOv button:has-text("女")').catch(() => {});
  console.log('— 开机完成(chapter=1 预置)—');

  // 台词收集器:进 326 前挂好(toast 历史 + 双节拍历史)
  await p.evaluate(() => {
    window.__toastLog = '';
    window.__stageLogA = [];
    window.__stageLogB = [];
    setInterval(() => {
      const t = document.getElementById('modeToast');
      if (t && t.textContent) window.__toastLog += t.textContent + '\n';
      const sa = window.__scene7a && window.__scene7a.state && window.__scene7a.state.stage;
      if (sa && window.__stageLogA[window.__stageLogA.length - 1] !== sa) window.__stageLogA.push(sa);
      const sb = window.__scene7b && window.__scene7b.state && window.__scene7b.state.stage;
      if (sb && window.__stageLogB[window.__stageLogB.length - 1] !== sb) window.__stageLogB.push(sb);
    }, 300);
    // 探针跳过 scene3,途经羊箱会触发「数数行 + 等玩家开口」(带 choices,永不自动关闭),
    // lock 队列会把它之后的第7场台词链全堵死 —— 模拟真实玩家点选消解。
    // 第7场自身无 choices(已核实 scene7-vanity/tippler 零 choices),自动点选不会误伤。
    window.__autoChoice = setInterval(() => {
      const st = window.__scene7b && window.__scene7b.state;
      if (st && st.starTaken) return; // 全程最后一拍已到,停手
      const b = document.querySelector('.gs-choice');
      if (b && b.offsetParent) b.click();
    }, 1200);
  });

  // main → B612(石门) → king326(导航按钮;chapter=1 时应指 326)
  // ⚠️ 石门按剧情出场(2026-09-27 起开局恒隐身,scene3-night 台词点才现身):
  //    探针直测第7场,跳过了 scene3,须手动补「石门已亮起」这一前置,否则 portal.js 守卫不传。
  await p.evaluate(() => {
    window.__ctx.kunlun.revealStarGate && window.__ctx.kunlun.revealStarGate();
  });
  await p.waitForTimeout(800);
  await p.evaluate(() => {
    const q = window.__ctx.player.pl.p;
    q.x = 0.1;
    q.z = 56;
  });
  await p.waitForFunction(() => window.__ctx.scene.activeWorld === 'b612', null, { timeout: 20000 });
  console.log('PASS main → b612');
  // 导航按钮由 planets tick 按帧装配,world 切换同帧采样必空 —— 等 flex 再读
  await p
    .waitForFunction(() => (document.getElementById('worldNav') || {}).style.display === 'flex', null, { timeout: 15000 })
    .catch(() => {});
  const navLabel1 = await p.evaluate(
    () => [...document.querySelectorAll('#worldNav button')].map((x) => x.textContent).join(' / ').slice(0, 80)
  );
  ok('[交接] chapter=1 时导航指 326(连夜双星先上半)', /前往 326/.test(navLabel1), navLabel1);
  await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('前往 326'))?.click());
  await p.waitForFunction(() => window.__ctx.scene.activeWorld === 'king326', null, { timeout: 20000 });
  ok('[进 326] activeWorld=king326', true);

  // 326 全链:chainA → clap → chainB → pickup(静音节奏约 1.5-2 分钟)
  await p
    .waitForFunction(() => window.__scene7a && window.__scene7a.state && window.__scene7a.state.pickupArmed, null, { timeout: 360000 })
    .catch(() => {});
  await p
    .waitForFunction(() => window.__scene7a && window.__scene7a.state && window.__scene7a.state.stage === 'pickup', null, { timeout: 10000 })
    .catch(() => {});
  await p.waitForTimeout(400);
  const armedA = await p.evaluate(() => !!(window.__scene7a && window.__scene7a.state && window.__scene7a.state.pickupArmed));
  const stageLogA = await p.evaluate(() => window.__stageLogA.slice());
  ok('[326 剧情链] chainA→clap→chainB→pickup 按序走完', armedA && ['chainA', 'clap', 'chainB', 'pickup'].every((s, i, a) => { const j = stageLogA.indexOf(s); return j >= 0 && (i === 0 || stageLogA.indexOf(a[i - 1]) < j); }), 'log=' + stageLogA.join(','));
  const clapToast = await p.evaluate(() => window.__toastLog);
  // 闸门默认英文,toast 双语任一即过(此前只写中文 pattern,英文链上必挂)
  ok('[拍手蒙太奇] 「啪。啪。啪」toast', /啪|Clap/i.test(clapToast));
  const beaconA = await p.evaluate(() => {
    const w = window.__ctx.scene.worldManager && window.__ctx.scene.worldManager.getWorld('king326');
    return !!(w && w.scene.getObjectByName('storyBeaconMote'));
  });
  ok('[326 星屑信标] storyBeaconMote 立起', beaconA);
  await p.evaluate(() => {
    const w = window.__ctx.scene.worldManager.getWorld('king326');
    const m = w.scene.getObjectByName('sproutMote');
    const q = window.__ctx.player.pl.p;
    q.x = m ? m.position.x : 0;
    q.z = m ? m.position.z : 9;
  });
  const takenA = await p
    .waitForFunction(() => window.__scene7a && window.__scene7a.state && window.__scene7a.state.starTaken, null, { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  ok('[326 拾星] 到位 3m 判定生效 starTaken', takenA);
  await p.waitForTimeout(600);
  const afterA = await p.evaluate(() => {
    const w = window.__ctx.scene.worldManager && window.__ctx.scene.worldManager.getWorld('king326');
    return {
      beaconGone: !(w && w.scene.getObjectByName('storyBeaconMote')),
      moteGone: !(w.scene.getObjectByName('sproutMote') || {}).visible,
      toast: window.__toastLog,
      chapter: window.__ctx.store.num('planetsChapter'),
    };
  });
  ok('[326 信标] 拾取即撤', afterA.beaconGone);
  ok('[326 星屑隐藏] sproutMote 藏起', afterA.moteGone);
  ok('[326 拾获 toast] 「拾获星屑 · 虚荣之星」', /虚荣|Conceited/i.test(afterA.toast));
  ok('[326 章节推进] planetsChapter=2(今晚还有一颗星)', afterA.chapter === 2, 'v=' + afterA.chapter);
  await p.waitForTimeout(1800);
  const toastA = await p.evaluate(() => window.__toastLog);
  ok('[326 完成 toast] 「326,写完了」', /326.*写完|326 is written/i.test(toastA));
  await p.waitForTimeout(3200);
  await p.evaluate(() => {
    const w = window.__ctx.scene.worldManager.getWorld('king326');
    const d = w.scene.getObjectByName('sproutDoor');
    const q = window.__ctx.player.pl.p;
    q.x = d ? d.position.x : 0;
    q.z = d ? d.position.z : -3.4;
  });
  const backA = await p
    .waitForFunction(() => window.__ctx.scene.activeWorld === 'b612', null, { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  ok('[326 回程] 走进石环回到 B612', backA);

  // B612 导航应变 327(诚实指引自动跟随;同上等 flex 再读)
  await p
    .waitForFunction(() => (document.getElementById('worldNav') || {}).style.display === 'flex', null, { timeout: 15000 })
    .catch(() => {});
  const navLabel2 = await p.evaluate(
    () => [...document.querySelectorAll('#worldNav button')].map((x) => x.textContent).join(' / ').slice(0, 80)
  );
  ok('[交接] chapter=2 时导航指 327', /前往 327/.test(navLabel2), navLabel2);
  await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('前往 327'))?.click());
  await p.waitForFunction(() => window.__ctx.scene.activeWorld === 'king327', null, { timeout: 20000 });
  ok('[进 327] activeWorld=king327', true);

  // 酒鬼布景三件套挂载(瓶组/酒鬼/天幕)
  const setMounted = await p
    .waitForFunction(() => {
      const w = window.__ctx.scene.worldManager && window.__ctx.scene.worldManager.getWorld('king327');
      return !!(
        w &&
        w.scene.getObjectByName('tipplerBottles') &&
        w.scene.getObjectByName('tipplerMan') &&
        w.scene.getObjectByName('tipplerSky')
      );
    }, null, { timeout: 60000 })
    .then(() => true)
    .catch(() => false);
  ok('[布景] 瓶组+酒鬼+天幕挂载', setMounted);

  // 327 全链:chain(十问答) → silence(2.2s) → pickup(静音节奏约 1.5-2.5 分钟)
  await p
    .waitForFunction(() => window.__scene7b && window.__scene7b.state && window.__scene7b.state.pickupArmed, null, { timeout: 360000 })
    .catch(() => {});
  await p
    .waitForFunction(() => window.__scene7b && window.__scene7b.state && window.__scene7b.state.stage === 'pickup', null, { timeout: 10000 })
    .catch(() => {});
  await p.waitForTimeout(400);
  const armed = await p.evaluate(() => !!(window.__scene7b && window.__scene7b.state && window.__scene7b.state.pickupArmed));
  const stageLog = await p.evaluate(() => window.__stageLogB.slice());
  ok('[327 剧情链] 三节拍按序走完 chain→silence→pickup', armed && ['chain', 'silence', 'pickup'].every((s, i, a) => { const j = stageLog.indexOf(s); return j >= 0 && (i === 0 || stageLog.indexOf(a[i - 1]) < j); }), 'log=' + stageLog.join(','));
  const beaconUp = await p.evaluate(() => {
    const w = window.__ctx.scene.worldManager && window.__ctx.scene.worldManager.getWorld('king327');
    return !!(w && w.scene.getObjectByName('storyBeaconMote'));
  });
  ok('[327 星屑信标] storyBeaconMote 立起', beaconUp);
  const toastLog1 = await p.evaluate(() => window.__toastLog);
  ok('[327 指引 toast] 「去拾起它」直说下一步', /去拾起它|go and pick/i.test(toastLog1), (toastLog1.trim().split('\n').pop() || '').slice(0, 40));
  await p.evaluate(() => {
    const w = window.__ctx.scene.worldManager.getWorld('king327');
    const m = w.scene.getObjectByName('sproutMote');
    const q = window.__ctx.player.pl.p;
    q.x = m ? m.position.x : 0;
    q.z = m ? m.position.z : 9;
  });
  const taken = await p
    .waitForFunction(() => window.__scene7b && window.__scene7b.state && window.__scene7b.state.starTaken, null, { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  ok('[327 拾星] 到位 3m 判定生效 starTaken', taken);
  await p.waitForTimeout(600);
  const after = await p.evaluate(() => {
    const w = window.__ctx.scene.worldManager && window.__ctx.scene.worldManager.getWorld('king327');
    return {
      beaconGone: !(w && w.scene.getObjectByName('storyBeaconMote')),
      moteGone: !(w.scene.getObjectByName('sproutMote') || {}).visible,
      toast: window.__toastLog,
      chapter: window.__ctx.store.num('planetsChapter'),
    };
  });
  ok('[327 信标] 拾取即撤', after.beaconGone);
  ok('[327 星屑隐藏] sproutMote 藏起(hidePlanetMote)', after.moteGone);
  ok('[327 拾获 toast] 「拾获星屑 · 酒鬼之星」', /酒鬼|Tippler/i.test(after.toast));
  ok('[327 章节推进] planetsChapter=3(书页五完成)', after.chapter === 3, 'v=' + after.chapter);
  await p.waitForTimeout(1800);
  const toastLog2 = await p.evaluate(() => window.__toastLog);
  ok('[327 完成 toast] 「书页五,写完了」', /书页五|Page V/i.test(toastLog2));
  await p.waitForTimeout(3200);
  const doorState = await p.evaluate(() => {
    const w = window.__ctx.scene.worldManager && window.__ctx.scene.worldManager.getWorld('king327');
    const d = w && w.scene.getObjectByName('sproutDoor');
    return {
      visible: !!(d && d.visible),
      beacon: !!(w && w.scene.getObjectByName('storyBeaconDoor')),
      doorArmed: window.__scene7b && window.__scene7b.state && window.__scene7b.state.doorArmed,
      toast: window.__toastLog,
    };
  });
  ok('[327 回程石环] 拾星后亮起', doorState.visible);
  ok('[327 回程信标] storyBeaconDoor 立起', doorState.beacon);
  ok('[327 返程就绪] doorArmed 置位', doorState.doorArmed);
  ok('[327 返程 toast] 「走进石环回 B612」', /回 B612|back to B612/i.test(doorState.toast));
  await p.evaluate(() => {
    const w = window.__ctx.scene.worldManager.getWorld('king327');
    const d = w.scene.getObjectByName('sproutDoor');
    const q = window.__ctx.player.pl.p;
    q.x = d ? d.position.x : 0;
    q.z = d ? d.position.z : -3.4;
  });
  const backB612 = await p
    .waitForFunction(() => window.__ctx.scene.activeWorld === 'b612', null, { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  ok('[327 回程传送] 走进石环回到 B612', backB612);
  const beaconClean = await p.evaluate(() => {
    const w = window.__ctx.scene.worldManager && window.__ctx.scene.worldManager.getWorld('king327');
    return !(w && w.scene.getObjectByName('storyBeaconDoor'));
  });
  ok('[327 回程信标] 进门即撤', beaconClean);

  ok('[无页面异常]', errs.length === 0, errs.slice(0, 2).join('||'));
  console.log(fail ? 'FAIL ' + fail : 'PASS 第7场全夜 ' + pass + ' 项全绿');
  await b.close();
  if (child) child.kill();
  setTimeout(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} }, 500);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
