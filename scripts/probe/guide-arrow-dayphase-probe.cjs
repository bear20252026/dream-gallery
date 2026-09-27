// guide-arrow-dayphase-probe.cjs — 3D 悬浮箭头 + 台词⇔时间联动验收(2026-09-27)
// 新档全链(头 60~90 秒可走完 night 前半):
//   ① 开机天光快切到早晨(dayHour≈7.5,坠机/画羊晨光弧线)
//   ② 叫醒词点选 → 画板 #scene2Board 升起(画羊四笔,自动定稿)
//   ③ scene2 收束 → 转夜快切(dayHour→22)+羊箱信标 storyBeaconBox+悬浮箭 guideArrowBox
//   ④ 走近自动计数 → 点选回应 → 石门信标 storyBeaconGate+悬浮箭 guideArrowGate
// 用法:SMOKE=1 PORT=3311 node server.js & 起服后
//   BASE_URL=http://127.0.0.1:3311 node scripts/probe/guide-arrow-dayphase-probe.cjs
// 退出码 0=全绿。重剧情探针,本地跑,不进 CI 门禁。
const pw = (() => {
  try {
    return require('playwright');
  } catch (e) {
    return require('playwright-core');
  }
})();
let _browser = null; // 失败兜底关浏览器(防孤儿进程),成功路径照常 close
(async () => {
  const URL = process.env.BASE_URL || 'http://127.0.0.1:3311';
  let pass = 0,
    fail = 0;
  const ok = (name, cond, extra) => {
    if (cond) {
      pass++;
      console.log('✓ ' + name + (extra ? ' | ' + extra : ''));
    } else {
      fail++;
      console.log('✗ ' + name + (extra ? ' | ' + extra : ''));
    }
  };
  const b = await pw.chromium.launch({
    headless: false,
    executablePath:
      process.env.PW_EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'],
  });
  _browser = b;
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => {
    sessionStorage.setItem('nickPopOff', '1');
    // 台词静音(2026-09-27):本探针验箭头+天光,不验语音;本地无语音 key 时每行等
    // onVoiceEnd 守卫(30s+)会把链条拖到超时,静音走即时定时器按剧本速度跑
    sessionStorage.setItem('dialogVoiceOff', String(Date.now()));
    try {
      localStorage.removeItem('b612Scene2');
      localStorage.removeItem('b612Page1');
      localStorage.setItem('kunlunWelcomed', String(Date.now()));
    } catch (e) {}
    // 箭头历史钩子:羊箱信标在出生点旁只存活几秒(建成即被计数收走),
    // 事后查场景必输 —— 包一层 add,记录「曾立起」
    window.__arrowSeen = { boxBeacon: false, boxArrow: false };
    setInterval(() => {
      try {
        const s = window.__ctx && window.__ctx.scene && window.__ctx.scene.s;
        if (!s || s.__arrowHooked) return;
        s.__arrowHooked = true;
        const origAdd = s.add.bind(s);
        s.add = function (...o) {
          for (const x of o) {
            if (x && x.name === 'storyBeaconBox') window.__arrowSeen.boxBeacon = true;
            if (x && x.name === 'guideArrowBox') window.__arrowSeen.boxArrow = true;
          }
          return origAdd(...o);
        };
      } catch (e) {}
    }, 100);
  });
  await page.goto(URL + '/?noopening', { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log('…等闸门');
  await page.waitForSelector('#b612Gate', { timeout: 150000 });
  await page.evaluate(() => {
    const c = document.getElementById('gAgreeChk');
    c.checked = true;
    c.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('#b612Gate .gEnter');
  console.log('…等主循环(本地软渲染首帧慢,放宽到 150s)');
  await page.waitForFunction(
    () => window.__ctx && window.__ctx.loopManager && window.__ctx.loopManager.getFPS() > 0,
    null,
    { timeout: 150000 }
  );
  console.log('— 开机完成(新档)—');

  // ⓪ 石门隐身:新档开局石门实体不出场(等台词到"石门亮起"才现身)
  const gateHidden = await page.evaluate(
    () => window.__starGate && window.__starGate.visible() === false
  );
  ok('[石门隐身] 新档开局石门不出场', !!gateHidden);

  // ① 开场天光:3 秒快切到早晨 7.5(坠机睁眼=荒漠早晨)
  const morning = await page
    .waitForFunction(
      () => {
        const h = window.__ctx && window.__ctx.media && window.__ctx.media.dayHour;
        return typeof h === 'number' && Math.abs(h - 7.5) < 1.5 ? h : false;
      },
      null,
      { timeout: 30000 }
    )
    .then((h) => h.jsonValue())
    .catch(() => null);
  ok('[晨光快切] dayHour≈7.5', morning !== null, 'h=' + morning);

  // 自动点选:轮到玩家开口的选项出现就点(叫醒/drawn/night 三节点通用,不 await,页内自转 7 分钟)
  page
    .evaluate(() => {
      const iv = setInterval(() => {
        try {
          const d = document.getElementById('gameDialog');
          const c = d && d.style.display !== 'none' && d.querySelector('.gs-choice');
          if (c) c.click();
        } catch (e) {}
      }, 1000);
      setTimeout(() => clearInterval(iv), 420000);
    })
    .catch(() => {});

  // ② 画板升起(叫醒词收束→scene2 事件可靠投递)
  const board = await page
    .waitForSelector('#scene2Board', { timeout: 120000 })
    .then(() => true)
    .catch(() => false);
  ok('[画板] #scene2Board 升起', board);

  // ③ scene2 收束 → 转夜:羊箱信标+悬浮箭「曾立起」(历史钩子,建成即被计数收走),
  // 天光滑向 22(5 秒暮→夜快切)
  const night = await page
    .waitForFunction(() => window.__arrowSeen && window.__arrowSeen.boxBeacon, null, {
      timeout: 300000,
    })
    .then(() => true)
    .catch(() => false);
  ok('[羊箱信标] storyBeaconBox 曾立起', night);
  const nightArrow = await page.evaluate(() => window.__arrowSeen && window.__arrowSeen.boxArrow);
  ok('[羊箱悬浮箭] guideArrowBox 曾立起(与信标同立同撤)', !!nightArrow);
  const nightHour = await page
    .waitForFunction(
      () => {
        const h = window.__ctx && window.__ctx.media && window.__ctx.media.dayHour;
        return typeof h === 'number' && Math.abs(h - 22) < 1.5 ? h : false;
      },
      null,
      { timeout: 60000 }
    )
    .then((h) => h.jsonValue())
    .catch(() => null);
  ok('[转夜快切] dayHour≈22', nightHour !== null, 'h=' + nightHour);

  // ④ 石门亮:信标+悬浮箭(计数对话在出生点旁自动触发,点选后 doorGlowHint→armGateGlow)
  const gate = await page
    .waitForFunction(
      () => {
        const s = window.__ctx && window.__ctx.scene && window.__ctx.scene.s;
        if (!s) return false;
        const gb = s.getObjectByName('storyBeaconGate');
        const ga = s.getObjectByName('guideArrowGate');
        return gb && ga ? true : false;
      },
      null,
      { timeout: 180000 }
    )
    .then(() => true)
    .catch(() => false);
  ok('[石门指引] storyBeaconGate+guideArrowGate 同立', gate);
  // 石门现身:台词到"石门亮起",门实体才出现(之前走近看不见摸不着)
  const gateOut = await page.evaluate(
    () => window.__starGate && window.__starGate.visible() === true
  );
  ok('[石门现身] 石门亮起后实体出现', !!gateOut);

  ok('[无页面异常]', errs.length === 0, errs.slice(0, 3).join('||'));
  console.log(fail ? 'FAIL ' + fail : 'PASS 箭头+昼夜石门 ' + pass + ' 项全绿');
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('FAIL:', e.message);
  try {
    if (_browser) await _browser.close();
  } catch (_) {}
  process.exit(1);
});
