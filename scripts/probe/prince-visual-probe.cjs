// prince-visual-probe.cjs — 小王子位置/语音/卡顿三合一现场取证(2026-09-25)
const { launch } = require('./browser.js');
(async () => {
  const URL = process.env.PROBE_URL || 'https://cloudbear.cloud';
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const t0 = Date.now();
  await page.goto(URL + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#b612Gate', { timeout: 90000 });
  console.log('闸门出现 @', Date.now() - t0, 'ms');
  await page.waitForTimeout(1200);
  await page.check('#b612Gate #gAgreeChk');
  await page.click('#b612Gate .gEnter');
  await page.waitForSelector('#b612film', { timeout: 30000 });
  await page.waitForSelector('#cHat', { timeout: 30000 });
  await page.waitForTimeout(400);
  await page.click('#cHat').catch(() => {});
  await page.waitForFunction(() => !document.getElementById('b612film'), null, { timeout: 150000 });
  console.log('世界揭幕 @', Date.now() - t0, 'ms');

  // 揭幕后连续截图(王子:走路→idle→小动作)
  for (const ms of [1500, 3500, 6000, 9000, 12000]) {
    await page.waitForTimeout(ms === 1500 ? 1500 : ms - (await page.evaluate(() => window.__lastShot || 0)));
    await page.evaluate((ms) => { window.__lastShot = ms; }, ms);
    await page.screenshot({ path: 'scripts/artifacts/pv_' + ms + 'ms.png' }).catch(() => {});
  }
  // 王子内部状态 + 世界坐标 + 帧率采样
  const stat = await page.evaluate(async () => {
    const d = window.__princeDebug;
    // 帧率采样 2s(卡顿取证)
    const frames = [];
    let last = performance.now();
    await new Promise((res) => {
      let n = 0;
      function tick(t) { frames.push(t - last); last = t; if (++n < 120) requestAnimationFrame(tick); else res(); }
      requestAnimationFrame(tick);
    });
    const gaps = frames.slice(1).sort((a, b) => b - a);
    return {
      prince: d ? { state: d.state(), clip: d.clip(), rigged: d.rigged() } : null,
      fpsApprox: Math.round(1000 / (frames.slice(1).reduce((a, b) => a + b, 0) / (frames.length - 1))),
      worstGapsMs: gaps.slice(0, 5).map((x) => Math.round(x)),
      dpr: window.devicePixelRatio,
    };
  });
  console.log('状态:', JSON.stringify(stat));

  // 游戏内 Audio 播放取证(kunlunSpeak 同路径)
  const audio = await page.evaluate(async () => {
    const a = new Audio('/api/tts?text=' + encodeURIComponent('语音链路浏览器取证'));
    a.preload = 'auto';
    return await new Promise((res) => {
      const done = {};
      a.addEventListener('canplay', () => { if (!done.c) { done.c = 1; a.play().then(() => res({ play: 'resolved' })).catch((e) => res({ play: 'rejected:' + e.name })); } });
      a.addEventListener('error', () => res({ error: (a.error && a.error.code) + '/' + a.currentSrc.slice(-40) }));
      setTimeout(() => res({ timeout: true, readyState: a.readyState }), 15000);
      a.load();
    });
  });
  console.log('游戏内 Audio:', JSON.stringify(audio));
  console.log('页面报错:', errors.length ? errors.slice(0, 3).join(' | ') : '无');
  process.exit(0);
})().catch((e) => { console.error('探针异常:', e.message); process.exit(2); });
