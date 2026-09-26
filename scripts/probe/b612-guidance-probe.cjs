// b612-guidance-probe.cjs — 情节指引三件套验收(2026-09-26「情节推进理解困难」闭环)
// 旧档开机(scene2+page1 标记)一遍走全引导层:
//   ① 任务册「进程」行 = 325 国王(storyBeat 单一权威)
//   ② 互动节点:选项出现 + 「轮到你开口」提示 + gs-await 呼吸动画
//   ③ 转夜:羊箱光柱信标立起(storyBeaconBox),玩家开口后即撤
//   ④ 石门亮:modeToast 直说下一步 + 石门信标立起(storyBeaconGate)
// 支持 BASE_URL 直测线上。退出码 0=全绿。
const pw = (() => { try { return require('playwright'); } catch (e) { return require('playwright-core'); } })();
(async () => {
  const URL = process.env.BASE_URL || 'https://cloudbear.cloud';
  let pass = 0, fail = 0;
  const ok = (name, cond, extra) => {
    if (cond) { pass++; console.log('✓ ' + name + (extra ? ' | ' + extra : '')); }
    else { fail++; console.log('✗ ' + name + (extra ? ' | ' + extra : '')); }
  };
  const b = await pw.chromium.launch({
    headless: false,
    executablePath: process.env.PW_EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 150)));
  await page.addInitScript(() => {
    sessionStorage.setItem('nickPopOff', '1');
    try {
      localStorage.setItem('kunlunWelcomed', String(Date.now()));
      localStorage.setItem('b612Scene2', '1'); // store SCHEMA: scene2
      localStorage.setItem('b612Page1', '1'); // store SCHEMA: page1
    } catch (e) {}
    // 信标历史记录器:羊箱信标在旧档路径只存活几秒(armNight→计数触发即撤),
    // 事后查场景必输 —— 场景一出现就包一层 add/remove,记录信标「曾立起/已撤除」
    window.__beaconSeen = { box: false, boxRemoved: false, gate: false };
    const hook = () => {
      try {
        const s = window.__ctx && window.__ctx.scene && window.__ctx.scene.s;
        if (!s || s.__beaconHooked) return;
        s.__beaconHooked = true;
        const origAdd = s.add.bind(s);
        const origRemove = s.remove.bind(s);
        s.add = function (...o) {
          for (const x of o) {
            if (x && x.name === 'storyBeaconBox') window.__beaconSeen.box = true;
            if (x && x.name === 'storyBeaconGate') window.__beaconSeen.gate = true;
          }
          return origAdd(...o);
        };
        s.remove = function (...o) {
          for (const x of o) {
            if (x && x.name === 'storyBeaconBox') window.__beaconSeen.boxRemoved = true;
          }
          return origRemove(...o);
        };
      } catch (e) {}
    };
    setInterval(hook, 50);
  });
  await page.goto(URL + '/?noopening', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#b612Gate', { timeout: 90000 });
  await page.evaluate(() => {
    const c = document.getElementById('gAgreeChk');
    c.checked = true;
    c.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('#b612Gate .gEnter');
  await page.waitForFunction(
    () => window.__ctx && window.__ctx.loopManager && window.__ctx.loopManager.getFPS() > 0,
    null,
    { timeout: 90000 }
  );
  console.log('— 开机完成(旧档:scene2+page1 已标记)—');

  // ① 任务册「进程」行 = 325 国王(page1 完成、chapter 0 → 下一颗星)
  await page.waitForSelector('#questHud', { timeout: 30000 });
  const beatRow = await page.evaluate(() => {
    const r = [...document.querySelectorAll('#questHud .q-row')].find(
      (x) => x.querySelector('.q-k') && x.querySelector('.q-k').textContent === '进程'
    );
    return r ? r.querySelector('.q-v').textContent : null;
  });
  ok('[进程行] 325 国王之星(storyBeat)', !!beatRow && /325/.test(beatRow), 'v=' + beatRow);

  // ② 转夜:羊箱信标「曾立起」(挂钩记录,不赌存活窗口 —— 计数触发即撤)
  const boxBeacon = await page.waitForFunction(
    () => window.__beaconSeen && window.__beaconSeen.box,
    null,
    { timeout: 30000 }
  ).then(() => true).catch(() => false);
  ok('[羊箱信标] storyBeaconBox 曾立起', boxBeacon);

  // ③ 计数对话(羊,出生点旁自动触发):先等选项渲染完(打字结束才 showChoices),再采样
  await page.waitForFunction(() => {
    const d = document.getElementById('gameDialog');
    return d && d.style.display !== 'none' && d.dataset.spk === 'sheep' && d.querySelector('.gs-choice');
  }, null, { timeout: 45000 });
  const choiceState = await page.evaluate(() => {
    const d = document.getElementById('gameDialog');
    return {
      choices: d.querySelectorAll('.gs-choice').length,
      hint: (d.querySelector('.gs-hint') || {}).textContent || '',
      hintShown: ((d.querySelector('.gs-hint') || {}).style || {}).display === 'block',
      await: d.classList.contains('gs-await'),
    };
  });
  ok('[互动节点] 选项出现', choiceState.choices >= 2, 'n=' + choiceState.choices);
  ok(
    '[互动节点] 「轮到你开口」提示亮出',
    choiceState.hintShown && /轮到你开口|Your turn/.test(choiceState.hint),
    'hint=' + choiceState.hint
  );
  ok('[互动节点] gs-await 呼吸动画挂载', choiceState.await);

  // ④ 点选回应(pilot → 王子 → doorGlowHint → 石门亮):盯 toast + 石门信标
  await page.evaluate(() => {
    const d = document.getElementById('gameDialog');
    const c = d && d.querySelector('.gs-choice');
    if (c) c.click();
  });
  const gateDone = await page.evaluate(
    () =>
      new Promise((res) => {
        const t0 = Date.now();
        const iv = setInterval(() => {
          // 有选项就点(回应链理论上无选项,防御性);链尾 armGateGlow
          const d = document.getElementById('gameDialog');
          const c = d && d.querySelector('.gs-choice');
          if (c) c.click();
          const toast = document.getElementById('modeToast');
          const gate = window.__ctx && window.__ctx.scene && window.__ctx.scene.s.getObjectByName('storyBeaconGate');
          const box = window.__ctx && window.__ctx.scene && window.__ctx.scene.s.getObjectByName('storyBeaconBox');
          if ((toast && /石门亮了|stone door is glowing/i.test(toast.textContent)) || gate) {
            clearInterval(iv);
            res({ toast: toast ? toast.textContent.slice(0, 40) : null, gate: !!gate, boxGone: !box });
          }
          if (Date.now() - t0 > 120000) {
            clearInterval(iv);
            const toast = document.getElementById('modeToast');
            res({ toast: toast ? toast.textContent.slice(0, 40) : null, gate: !!gate, boxGone: !box });
          }
        }, 500);
      })
  );
  ok('[石门亮] modeToast 直说下一步', !!gateDone.toast && /石门亮了|stone door is glowing/i.test(gateDone.toast), 'toast=' + gateDone.toast);
  ok('[石门信标] storyBeaconGate 立起', gateDone.gate);
  const boxLife = await page.evaluate(() => window.__beaconSeen);
  ok('[羊箱信标] 玩家开口后即撤', boxLife.boxRemoved, JSON.stringify(boxLife));

  ok('[无页面异常]', errs.length === 0, errs.slice(0, 2).join('||'));
  console.log(fail ? 'FAIL ' + fail : 'PASS 指引三件套 ' + pass + ' 项全绿');
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
