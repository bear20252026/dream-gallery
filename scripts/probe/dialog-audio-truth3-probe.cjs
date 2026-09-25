// dialog-audio-truth3-probe.cjs — 终极听感级验证(2026-09-26):每行「真的出声」吗?
// 前置:prewarm 已把台词煮进服务端缓存(部署后等待);本探针模拟主人真实玩法:
//   开对话 → 每行停留 5s(阅读节奏)→ 点击推进 → 逐行验证:
//   ① play() resolved(不是 reject/AbortError) ② 该 Audio 的 currentTime > 0(真的在走)
const { launch } = require('./browser.js');
const pw = (() => { try { return require('playwright'); } catch (e) { return require('playwright-core'); } })();
(async () => {
  const URL = process.env.PROBE_URL || 'https://cloudbear.cloud';
  const b = await pw.chromium.launch({
    headless: false, // 有头真实渲染(最接近主人浏览器)
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
      const rec = { src: String(this.currentSrc || this.src || ''), t: Date.now(), el: this };
      window.__playLog.push(rec);
      const p = origPlay.call(this);
      p.then(() => { rec.result = 'resolved'; })
        .catch((e) => { rec.result = 'rejected:' + e.name; });
      return p;
    };
  });
  const netlog = [];
  page.on('response', (r) => {
    if (r.url().includes('/api/tts') && !r.url().includes('batch'))
      netlog.push({ u: decodeURIComponent(r.url()).slice(-46), st: r.status(), ms: Date.now() });
  });
  page.on('requestfailed', (r) => {
    if (r.url().includes('/api/tts') && !r.url().includes('batch'))
      netlog.push({ u: decodeURIComponent(r.url()).slice(-46), fail: r.failure() && r.failure().errorText });
  });
  await page.goto(URL + '/?noopening&noprologue', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#b612Gate', { timeout: 90000 });
  await page.check('#b612Gate #gAgreeChk');
  await page.click('#b612Gate .gEnter');
  await page.waitForFunction(() => window.__ctx && window.__ctx.player && window.__ctx.player.pl, { timeout: 90000 });
  await page.waitForFunction(() => window.__bootCheck && window.__bootCheck.ok === true, null, { timeout: 120000 });
  console.log('世界就绪,等 prewarm 煮缓存 60s…');
  await page.waitForTimeout(60000);

  await page.evaluate(() => {
    window.__playLog.length = 0;
    window.__ctx.ui.openDialog({
      speaker: '小王子', speakerType: 'prince',
      lines: ['请你——给我画一只羊！', '这是我的文件。', '把这本书，写完。'],
      autoHide: 60000,
    });
  });
  await page.waitForTimeout(600);
  const pre = await page.evaluate(() => ({
    box: (() => { const b = document.getElementById('gameDialog'); return b ? b.style.display : 'no-el'; })(),
    text: (() => { const b = document.getElementById('gameDialog'); const t = b && b.querySelector('.gs-text'); return t ? t.textContent.slice(0, 20) : null; })(),
    voiceOff: sessionStorage.getItem('dialogVoiceOff'),
    playAll: window.__playLog.map((r) => ({ src: r.src, result: r.result || 'pending' })),
  }));
  console.log('openDialog 后 600ms:', JSON.stringify(pre, null, 1));
  // 模拟主人阅读节奏:每行停 5s 再点击推进(gameshell-dialog advance)
  for (const wait of [5000, 5000]) {
    await page.waitForTimeout(wait);
    await page.evaluate(() => {
      const dlgBox = document.getElementById('gameDialog');
      if (dlgBox && dlgBox.style.display !== 'none') dlgBox.click(); // 推进=点击对话框
    });
  }
  await page.waitForTimeout(4000);
  const report = await page.evaluate(() => {
    return window.__playLog
      .filter((r) => r.src.includes('tts') && !r.src.includes('batch'))
      .map((r) => ({
        line: decodeURIComponent((r.src.match(/text=([^&]*)/) || [])[1] || '').slice(0, 16),
        result: r.result || 'pending',
        currentTime: r.el ? +r.el.currentTime.toFixed(2) : null, // >0 = 真的在播
        paused: r.el ? r.el.paused : null,
      }));
  // 全量 playLog(诊断用)
  console.log('全量 playLog:', JSON.stringify(window.__playLog_full || 'skip'));
  });
  console.log('逐行真实播放取证:', JSON.stringify(report, null, 1));
  console.log('网络层 tts 响应(近 10 条):', JSON.stringify(netlog.slice(-10), null, 1));
  const audible = report.filter((r) => r.result === 'resolved' && r.currentTime > 0).length;
  console.log('=== 真出声行数: ' + audible + ' / ' + report.length + ' ===');
  await b.close();
  process.exit(report.length && audible === report.length ? 0 : audible > 0 ? 1 : 2);
})().catch((e) => { console.error('探针异常:', e.message); process.exit(2); });
