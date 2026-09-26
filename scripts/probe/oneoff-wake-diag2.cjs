// oneoff2: 修复后代码现场抓取 —— crashWakeDone 后画板为何不来?
const pw = (() => { try { return require('playwright'); } catch (e) { return require('playwright-core'); } })();
(async () => {
  const URL = process.env.BASE_URL || 'https://cloudbear.cloud';
  const b = await pw.chromium.launch({
    headless: false,
    executablePath: process.env.PW_EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
  await page.addInitScript(() => {
    for (const k of ['agreementConsented', 'privacyConsented', 'communityConsented'])
      sessionStorage.setItem(k, '1');
  });
  await page.goto(URL + '/?noopening', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#b612Gate', { timeout: 90000 });
  await page.evaluate(() => {
    const c = document.getElementById('gAgreeChk');
    c.checked = true;
    c.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('#b612Gate .gEnter');
  await page.waitForFunction(() => window.__ctx && window.__ctx.loopManager && window.__ctx.loopManager.getFPS() > 0, null, { timeout: 90000 });
  console.log('— 开机完成,盯到画板或 75s —');
  const t0 = Date.now();
  let seenChoice = false;
  while (Date.now() - t0 < 75000) {
    await page.waitForTimeout(2000);
    const st = await page.evaluate(() => {
      const d = document.getElementById('gameDialog');
      const c = d && d.querySelector('.gs-choice');
      if (c) c.click(); // 模拟玩家:有选项就点
      return {
        t: null,
        dialogOpen: !!(d && d.style.display !== 'none'),
        text: d ? ((d.querySelector('.gs-text') || {}).textContent || '').slice(0, 16) : null,
        spk: d ? d.dataset.spk : null,
        hasChoice: !!c,
        wakeDone: window.__crashWakeDone === true,
        board: !!document.getElementById('scene2Board'),
        activeWorld: window.__ctx && window.__ctx.scene && window.__ctx.scene.activeWorld,
        scene2Flag: window.__ctx && window.__ctx.store && window.__ctx.store.flag('scene2'),
      };
    });
    if (st.hasChoice) seenChoice = true;
    console.log('+' + Math.round((Date.now() - t0) / 1000) + 's', JSON.stringify(st));
    if (st.board) break;
  }
  // 终态深挖:手动再发一次 story:scene2,看监听是否在、画板能否出现
  const deep = await page.evaluate(() => {
    const before = !!document.getElementById('scene2Board');
    try {
      window.__ctx.events.emit('story:scene2');
    } catch (e) {
      return { before, emitErr: String(e).slice(0, 200) };
    }
    return { before, emitErr: null };
  });
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => ({
    board: !!document.getElementById('scene2Board'),
    boardOpacity: (document.getElementById('scene2Board') || {}).style?.opacity,
  }));
  console.log('深挖:', JSON.stringify({ ...deep, after, seenChoice, errs: errs.slice(0, 5) }));
  await b.close();
})().catch((e) => { console.error('诊断异常:', e.message); process.exit(1); });
