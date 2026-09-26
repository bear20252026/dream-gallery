// tts-story-walk-probe.cjs — 终验:真实剧情链听感取证(2026-09-26)
// 不注入任何自定义台词(自定义行不在 story-text → 永不被预热,对真实访客无意义)。
// 进世界后静默旁观剧情链自己走 90s,逐秒采样每个 play 的 currentTime:
//   出声 = play resolved 且采样期内 currentTime 曾 > 0。
const pw = (() => { try { return require('playwright'); } catch (e) { return require('playwright-core'); } })();
(async () => {
  const URL = process.env.PROBE_URL || 'https://cloudbear.cloud';
  const WATCH_MS = Number(process.env.WATCH_MS || 90000);
  const b = await pw.chromium.launch({
    headless: false,
    executablePath: process.env.PW_EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.addInitScript(() => {
    for (const k of ['agreementConsented', 'privacyConsented', 'communityConsented'])
      sessionStorage.setItem(k, '1');
    window.__playLog = [];
    const origPlay = Audio.prototype.play;
    Audio.prototype.play = function () {
      const s = String(this.src);
      // blob 常驻版:blob:URL 不含 'tts' 字样,一并记录(via 字段区分通道)
      if (s.includes('tts') || s.startsWith('blob:')) {
        const rec = { src: s, t: Date.now(), el: this, maxCur: 0, startMs: null, result: 'pending' };
        window.__playLog.push(rec);
        this.addEventListener('playing', () => { rec.startMs = Date.now() - rec.t; }, { once: true });
        const p = origPlay.call(this);
        p.then(() => { rec.result = 'resolved'; }).catch((e) => { rec.result = 'rejected:' + e.name; });
        return p;
      }
      return origPlay.call(this);
    };
  });
  const netlog = [];
  page.on('response', (r) => {
    if ((r.url().includes('/tts-audio/') || r.url().includes('/api/tts')) && !r.url().includes('batch'))
      netlog.push({ u: r.url().slice(-34), st: r.status() });
  });
  await page.goto(URL + '/?noopening&noprologue', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#b612Gate', { timeout: 90000 });
  await page.check('#b612Gate #gAgreeChk');
  await page.click('#b612Gate .gEnter');
  await page.waitForFunction(() => window.__ctx && window.__ctx.player && window.__ctx.player.pl, { timeout: 90000 });
  await page.waitForFunction(() => window.__bootCheck && window.__bootCheck.ok === true, null, { timeout: 120000 });
  console.log('世界就绪,旁观剧情链 ' + WATCH_MS / 1000 + 's…(不注入、不点击,纯真实路径)');
  const steps = Math.floor(WATCH_MS / 2000);
  for (let i = 0; i < steps; i++) {
    await page.waitForTimeout(2000);
    const n = await page.evaluate(() => {
      for (const r of window.__playLog) {
        try { r.maxCur = Math.max(r.maxCur, +r.el.currentTime.toFixed(2)); } catch (e) { /* 元素已废 */ }
      }
      return window.__playLog.length;
    });
    if (i % 5 === 0) console.log('  …' + (i * 2) + 's: 已发起 ' + n + ' 行朗读');
  }
  const report = await page.evaluate(() =>
    window.__playLog.map((r) => ({
      key: (r.src.match(/tts-audio\/([0-9a-f]{8})/) || [])[1] || (r.src.match(/text=([^&]{0,10})/) || [])[1] || '?',
      result: r.result,
      startMs: r.startMs,
      maxCur: r.maxCur,
      duration: Number.isFinite(r.el.duration) ? +r.el.duration.toFixed(1) : null,
      truncated: Number.isFinite(r.el.duration) && r.maxCur > 0 && r.maxCur < r.el.duration - 0.5,
      audible: r.result === 'resolved' && r.maxCur > 0,
      via: r.src.startsWith('blob:') ? 'blob' : r.src.includes('/tts-audio/') ? 'edge' : 'legacy',
    }))
  );
  console.log('网络层(近14):', JSON.stringify(netlog.slice(-14)));
  console.log('逐行:', JSON.stringify(report, null, 1));
  const audible = report.filter((r) => r.audible).length;
  const cut = report.filter((r) => r.truncated).length;
  console.log('=== 真出声: ' + audible + ' / ' + report.length + ' 行,截断: ' + cut + ' ===');
  await b.close();
  process.exit(report.length && audible === report.length ? 0 : audible > 0 ? 1 : 2);
})().catch((e) => { console.error('探针异常:', e.message); process.exit(2); });
