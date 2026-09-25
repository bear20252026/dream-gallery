// tts-single-line-probe.cjs — 单行聚焦诊断(2026-09-26):一行台词从 play 到出声的全时序
// 背景:truth3 全链探针 0/4,但 diag 探针单播同 URL 正常 —— 中间还隔着什么?
// 本探针:开一行对话后不点击、不推进,盯 15s,采样 readyState/currentTime,
// 收尾用 PerformanceResourceTiming 拿每个 tts URL 的状态码/耗时/传输量(决定性证据)。
const pw = (() => { try { return require('playwright'); } catch (e) { return require('playwright-core'); } })();
(async () => {
  const URL = process.env.PROBE_URL || 'https://cloudbear.cloud';
  const b = await pw.chromium.launch({
    headless: false,
    executablePath: process.env.PW_EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.addInitScript(() => {
    for (const k of ['agreementConsented', 'privacyConsented', 'communityConsented'])
      sessionStorage.setItem('1' && k, '1');
    window.__playLog = [];
    window.__samples = [];
    const origPlay = Audio.prototype.play;
    Audio.prototype.play = function () {
      const rec = { src: String(this.currentSrc || this.src || ''), t: Date.now(), el: this };
      window.__playLog.push(rec);
      const p = origPlay.call(this);
      p.then(() => { rec.result = 'resolved'; }).catch((e) => { rec.result = 'rejected:' + e.name; });
      return p;
    };
  });
  await page.goto(URL + '/?noopening&noprologue', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#b612Gate', { timeout: 90000 });
  await page.check('#b612Gate #gAgreeChk');
  await page.click('#b612Gate .gEnter');
  await page.waitForFunction(() => window.__ctx && window.__ctx.player && window.__ctx.player.pl, { timeout: 90000 });
  await page.waitForFunction(() => window.__bootCheck && window.__bootCheck.ok === true, null, { timeout: 120000 });
  console.log('世界就绪(不等预热,缓存已煮热),立刻开一行对话');
  await page.evaluate(() => {
    window.__ctx.ui.openDialog({
      speaker: '小王子', speakerType: 'prince',
      lines: ['请你——给我画一只羊！'],
      autoHide: 60000,
    });
  });
  // 每 500ms 采样当前音频元素状态 + 捕获新 play 调用,盯 15s
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(500);
    const s = await page.evaluate(() => {
      const cur = window.__playLog[window.__playLog.length - 1];
      if (!cur) return null;
      const el = cur.el;
      return {
        src: String(el.src || '').slice(-24),
        rs: el.readyState,
        ns: el.networkState,
        cur: +el.currentTime.toFixed(2),
        paused: el.paused,
        result: cur.result || 'pending',
        plays: window.__playLog.length,
      };
    });
    if (s && (i % 2 === 0 || (s.result !== 'pending' && i < 4))) console.log(JSON.stringify({ t: '+' + i * 500 + 'ms', ...s }));
  }
  const res = await page.evaluate(() => ({
    plays: window.__playLog.map((r) => ({
      src: String(r.src || '').slice(-30),
      result: r.result || 'pending',
      currentTime: +r.el.currentTime.toFixed(2),
      duration: r.el.duration,
    })),
    perf: performance
      .getEntriesByType('resource')
      .filter((e) => e.name.includes('tts'))
      .map((e) => ({
        url: e.name.slice(-30),
        status: e.responseStatus,
        ms: Math.round(e.duration),
        bytes: e.transferSize,
        proto: e.nextHopProtocol,
      })),
  }));
  console.log('=== play 收尾 ===');
  console.log(JSON.stringify(res.plays, null, 1));
  console.log('=== PerformanceResourceTiming(tts 相关) ===');
  console.log(JSON.stringify(res.perf, null, 1));
  await b.close();
  const audible = res.plays.some((r) => r.result === 'resolved' && r.currentTime > 0);
  console.log('=== 结论: ' + (audible ? '单行真出声 ✓' : '单行无声 ✗') + ' ===');
  process.exit(audible ? 0 : 1);
})().catch((e) => { console.error('探针异常:', e.message); process.exit(2); });
