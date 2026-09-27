// b612-script-fill-probe.cjs — 剧本补齐验收(2026-09-27 定稿全本 v2 对稿)
// 老档直进(main 夜 + scene2 标记,page1 未做):穿石门 → 回忆四站走完,
// 断言补齐的三段 строительной都在链上播出:
//   面包树大祸句 / 日落四问 / 第4场开篇诘问+眼泪字幕+玫瑰初醒。
// 对话文本全程采集去重,最后统一断言(站与站之间只认签名行,不赌时序)。
// 用法:本地起服后 BASE_URL=http://127.0.0.1:3000 node scripts/probe/b612-script-fill-probe.cjs
// 退出码 0=全绿。重剧情探针,本地跑,不进 CI 门禁。
const pw = (() => {
  try {
    return require('playwright');
  } catch (e) {
    return require('playwright-core');
  }
})();
let _browser = null;
(async () => {
  const URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
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
  _browser = await pw.chromium.launch({
    headless: false,
    executablePath:
      process.env.PW_EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'],
  });
  const b = _browser;
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => {
    sessionStorage.setItem('nickPopOff', '1');
    sessionStorage.setItem('dialogVoiceOff', String(Date.now())); // 只验台词链,不验语音
    try {
      localStorage.setItem('kunlunWelcomed', String(Date.now()));
      localStorage.setItem('b612Scene2', '1'); // 夜流程已走完,石门可进
      localStorage.removeItem('b612Page1'); // 回忆未做,进门即入梦
      localStorage.setItem('planetsChapter', '0');
    } catch (e) {}
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
  console.log('…等主循环');
  await page.waitForFunction(
    () => window.__ctx && window.__ctx.loopManager && window.__ctx.loopManager.getFPS() > 0,
    null,
    { timeout: 150000 }
  );
  // 自动点选:数羊仪式的回应选项出现就点(不 await,页内自转到探针结束)
  page
    .evaluate(() => {
      const iv = setInterval(() => {
        try {
          const d = document.getElementById('gameDialog');
          const c = d && d.style.display !== 'none' && d.querySelector('.gs-choice');
          if (c) c.click();
        } catch (e) {}
      }, 1000);
      setTimeout(() => clearInterval(iv), 540000);
    })
    .catch(() => {});
  // 台词采集:每秒记一行(相邻去重),全程攒成语料库
  await page.evaluate(() => {
    window.__lines = [];
    window.__lastLine = '';
    setInterval(() => {
      try {
        const d = document.getElementById('gameDialog');
        if (!d || d.style.display === 'none') return;
        const t = ((d.querySelector('.gs-text') || {}).textContent || '').replace(/✎/g, '');
        if (t && t !== window.__lastLine && !/^\s*$/.test(t)) {
          window.__lastLine = t;
          window.__lines.push(t);
        }
      } catch (e) {}
    }, 1000);
  });
  // exitBridge 重播收束 → 石门现身 → 摆进门圈 → 入梦
  console.log('…等石门现身');
  await page.waitForFunction(() => window.__starGate && window.__starGate.visible(), null, {
    timeout: 120000,
  });
  await page.evaluate(() => {
    const pl = window.__ctx && window.__ctx.player && window.__ctx.player.pl;
    if (pl) {
      pl.p.x = 0.1;
      pl.p.z = 56.0;
    }
  });
  console.log('…等入梦 B612');
  await page.waitForFunction(() => (window.__ctx.scene.activeWorld || '') === 'b612', null, {
    timeout: 120000,
  });
  // 到达演出(4 行)播完再跑站,免得和 arrival 抢位置
  await page.waitForFunction(
    () => (window.__lines || []).join('\n').indexOf('Which is your planet') >= 0,
    null,
    { timeout: 120000 }
  );
  console.log('— 到达演出播出,开始跑站 —');
  const go = async (x, z) => {
    await page.evaluate(
      ([sx, sz]) => {
        const pl = window.__ctx && window.__ctx.player && window.__ctx.player.pl;
        if (pl) {
          pl.p.x = sx;
          pl.p.z = sz;
        }
      },
      [x, z]
    );
  };
  const waitText = async (re, timeout, label) => {
    const found = await page
      .waitForFunction(
        (pat) => (window.__lines || []).join('\n').search(new RegExp(pat)) >= 0,
        re,
        { timeout }
      )
      .then(() => true)
      .catch(() => false);
    ok(label, found, re);
    return found;
  };
  await go(-4.6, -5.2); // 0 火山
  await waitText('never knows', 60000, '[火山站] 走完');
  await go(3.4, -2.6); // 1 面包树苗
  await waitText('catastrophe', 120000, '[面包树] 大祸句播出(补齐)');
  await go(-3.6, -0.6); // 2 小椅子·日落
  await waitText('must wait', 120000, '[日落] 等待四问播出(补齐)');
  await waitText('forty-four', 120000, '[日落] 四十四次收束');
  await go(1.23, -0.78); // 3 玫瑰坛
  await waitText('mushroom', 180000, '[玫瑰] 蘑菇诘问播出(补齐)');
  await waitText('land of tears', 180000, '[玫瑰] 眼泪字幕播出(补齐)');
  await waitText('scarcely awake', 180000, '[玫瑰] 初醒播出(补齐)');
  await waitText('proud flower', 240000, '[玫瑰] 终章字幕,全链收束');
  ok('[无页面异常]', errs.length === 0, errs.slice(0, 3).join('||'));
  const corpus = await page.evaluate(() => (window.__lines || []).length);
  console.log('语料行数:', corpus);
  console.log(fail ? 'FAIL ' + fail : 'PASS 剧本补齐 ' + pass + ' 项全绿');
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('FAIL:', e.message);
  try {
    if (_browser) await _browser.close();
  } catch (_) {}
  process.exit(1);
});
