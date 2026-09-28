// b612-king325-guidance-probe.cjs — 325 国王星「行动指引三件套」验收(2026-09-26 指引规矩②③ 扩展到 325 章)
// 全链真走:开机(新访客)→ 石门进 B612 → 导航按钮进 king325 → chain1 → 日落 → chain2 →
//   ① 星屑光柱信标立起(storyBeaconMote,零 PointLight 规制)
//   ② modeToast 直说下一步(「去拾起它」,双语)
//   ③ 玩家到位即拾:信标撤 + 拾获 toast + 章节推进 planetsChapter=1 + 完成 toast
// 默认本地起服实测;BASE_URL=https://... 直测线上。sessionStorage dialogVoiceOff 静音走纯文本节奏。
// 退出码 0=全绿。
const path = require('path'),
  fs = require('fs'),
  os = require('os'),
  { spawn } = require('child_process');
const { launch } = require('./browser.js');
const ROOT = path.join(__dirname, '..', '..'),
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'king325-')),
  PORT = process.env.KING325_PROBE_PORT || 3259;
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
  console.log('— 开机完成(新访客,chapter=0)—');

  // 台词收集器:进 325 前挂好(toast 历史 + stage 节拍历史)
  await p.evaluate(() => {
    window.__toastLog = '';
    window.__stageLog = [];
    setInterval(() => {
      const t = document.getElementById('modeToast');
      if (t && t.textContent) window.__toastLog += t.textContent + '\n';
      const st = window.__scene6 && window.__scene6.state && window.__scene6.state.stage;
      if (st && window.__stageLog[window.__stageLog.length - 1] !== st) window.__stageLog.push(st);
    }, 300);
    // 同 327 探针:探针跳过 scene3,途经羊箱触发的「数数行 + 等玩家开口」带 choices 永不
    // 自动关闭,lock 队列会堵死后续台词链 —— 模拟真实玩家点选消解(scene6 自身无 choices)。
    window.__autoChoice = setInterval(() => {
      const st = window.__scene6 && window.__scene6.state;
      if (st && st.starTaken) return; // 全程最后一拍已到,停手
      const b = document.querySelector('.gs-choice');
      if (b && b.offsetParent) b.click();
    }, 1200);
  });

  // main → B612(石门) → king325(导航按钮)
  // ⚠️ 石门按剧情出场(2026-09-27 起开局恒隐身):探针跳过 scene3,须手动补「石门已亮起」前置。
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
  await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('前往 325'))?.click());
  await p.waitForFunction(() => window.__ctx.scene.activeWorld === 'king325', null, { timeout: 20000 });
  ok('[进 325] activeWorld=king325', true);

  // ⓪ B612 首进「下一步」指引(章节=0 时直说一次;采集器留有历史,进 325 后仍可断言)
  const b612Hint = await p.evaluate(() => window.__toastLog);
  ok(
    '[B612 首进] 「下一步:去 325 国王星球」直说',
    /下一步|Next: the King/i.test(b612Hint),
    (b612Hint.trim().split('\n')[0] || '').slice(0, 40)
  );

  // 全链等收束:chain1 → sunset → chain2 → pickup(20 行台词,静音节奏约 2.5-4 分钟)
  await p
    .waitForFunction(() => window.__scene6 && window.__scene6.state && window.__scene6.state.pickupArmed, null, { timeout: 360000 })
    .catch(() => {});
  // stage 与 pickupArmed 同帧置位,采样器 300ms 一跳:等到 stage 亮出再抓节拍史
  await p
    .waitForFunction(() => window.__scene6 && window.__scene6.state && window.__scene6.state.stage === 'pickup', null, { timeout: 10000 })
    .catch(() => {});
  await p.waitForTimeout(400);
  const armed = await p.evaluate(() => !!(window.__scene6 && window.__scene6.state && window.__scene6.state.pickupArmed));
  const stageLog = await p.evaluate(() => window.__stageLog.slice());
  ok('[剧情链] 四节拍按序走完 chain1→sunset→chain2→pickup', armed && ['chain1', 'sunset', 'chain2', 'pickup'].every((s, i, a) => { const j = stageLog.indexOf(s); return j >= 0 && (i === 0 || stageLog.indexOf(a[i - 1]) < j); }), 'log=' + stageLog.join(','));

  // ① 星屑信标立起(king325 独立世界 scene 内)
  const beaconUp = await p.evaluate(() => {
    const w = window.__ctx.scene.worldManager && window.__ctx.scene.worldManager.getWorld('king325');
    return !!(w && w.scene.getObjectByName('storyBeaconMote'));
  });
  ok('[星屑信标] storyBeaconMote 立起', beaconUp);

  // ② toast 直说下一步(双语任一)
  const toastLog1 = await p.evaluate(() => window.__toastLog);
  ok('[指引 toast] 「去拾起它」直说下一步', /去拾起它|go and pick/i.test(toastLog1), (toastLog1.trim().split('\n').pop() || '').slice(0, 40));

  // ③ 玩家到位即拾:信标撤 + 拾获 toast + 章节 1 + 完成 toast
  // 传送到信标脚下(信标 x/z=星屑 x/z,单一源 planets.js sproutMote)
  await p.evaluate(() => {
    const w = window.__ctx.scene.worldManager.getWorld('king325');
    const b = w.scene.getObjectByName('storyBeaconMote');
    const q = window.__ctx.player.pl.p;
    q.x = b ? b.position.x : 0;
    q.z = b ? b.position.z : 9;
  });
  const taken = await p
    .waitForFunction(() => window.__scene6 && window.__scene6.state && window.__scene6.state.starTaken, null, { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  ok('[拾星] 到位 3m 判定生效 starTaken', taken);
  await p.waitForTimeout(600); // 给 tick 一拍撤信标(完成 toast 延后 1.6s,先让拾获 toast 独立亮)
  const after = await p.evaluate(() => {
    const w = window.__ctx.scene.worldManager && window.__ctx.scene.worldManager.getWorld('king325');
    return {
      beaconGone: !(w && w.scene.getObjectByName('storyBeaconMote')),
      toast: window.__toastLog,
      chapter: window.__ctx.store.num('planetsChapter'),
    };
  });
  ok('[星屑信标] 拾取即撤', after.beaconGone);
  ok('[拾获 toast] 「拾获星屑 · 国王之星」', /拾获星屑|Stardust picked/i.test(after.toast));
  ok('[章节推进] planetsChapter=1(门环换色指向 326)', after.chapter === 1, 'v=' + after.chapter);
  await p.waitForTimeout(1800); // 完成 toast 延后 1.6s 才亮
  const toastLog2 = await p.evaluate(() => window.__toastLog);
  ok('[完成 toast] 「书页四,写完了」', /书页四|Page IV/i.test(toastLog2));

  // ④ 回程石环(2026-09-27 点亮死代码):门亮 + 光柱 + 「怎么回去」toast + 走进传送回 B612
  await p.waitForTimeout(3200); // 返程 toast 在拾星后 4.8s 才亮,等它落进采集器
  const doorState = await p.evaluate(() => {
    const w = window.__ctx.scene.worldManager && window.__ctx.scene.worldManager.getWorld('king325');
    const d = w && w.scene.getObjectByName('sproutDoor');
    return {
      visible: !!(d && d.visible),
      beacon: !!(w && w.scene.getObjectByName('storyBeaconDoor')),
      doorArmed: window.__scene6 && window.__scene6.state && window.__scene6.state.doorArmed,
      toast: window.__toastLog,
    };
  });
  ok('[回程石环] 拾星后亮起', doorState.visible);
  ok('[回程信标] storyBeaconDoor 立起', doorState.beacon);
  ok('[返程就绪] doorArmed 置位', doorState.doorArmed);
  ok('[返程 toast] 「走进石环回 B612」', /回 B612|back to B612/i.test(doorState.toast));
  // 走进石环(石环 x/z=单一源)→ 传送回 B612
  await p.evaluate(() => {
    const w = window.__ctx.scene.worldManager.getWorld('king325');
    const d = w.scene.getObjectByName('sproutDoor');
    const q = window.__ctx.player.pl.p;
    q.x = d ? d.position.x : 0;
    q.z = d ? d.position.z : -3.4;
  });
  const backB612 = await p
    .waitForFunction(() => window.__ctx.scene.activeWorld === 'b612', null, { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  ok('[回程传送] 走进石环回到 B612', backB612);
  const beaconClean = await p.evaluate(() => {
    const w = window.__ctx.scene.worldManager && window.__ctx.scene.worldManager.getWorld('king325');
    return !(w && w.scene.getObjectByName('storyBeaconDoor'));
  });
  ok('[回程信标] 进门即撤', beaconClean);

  ok('[无页面异常]', errs.length === 0, errs.slice(0, 2).join('||'));
  console.log(fail ? 'FAIL ' + fail : 'PASS 325 指引三件套 ' + pass + ' 项全绿');
  await b.close();
  if (child) child.kill();
  setTimeout(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} }, 500);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
