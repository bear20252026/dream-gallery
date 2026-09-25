// dialog-audio-truth2-probe.cjs — 决定性取证 v2:请求发起者调用栈(2026-09-26)
// v1 发现:对话链 play() 记录为 0,但 /api/tts 请求存在、音频内容有声、直接 play resolved。
// v2 用 CDP Network.initiator 拿到每个 /api/tts 请求的 JS 调用栈 —— 谁发的请求一目了然;
//    同时 hook Audio 构造函数,区分 new Audio(url)(speakLine) vs a.src=url;a.load()(prefetch)。
const { launch } = require('./browser.js');
(async () => {
  const URL = process.env.PROBE_URL || 'https://cloudbear.cloud';
  const b = await launch([]);
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.addInitScript(() => {
    for (const k of ['agreementConsented', 'privacyConsented', 'communityConsented'])
      sessionStorage.setItem(k, '1');
    window.__playLog = [];
    window.__audioLog = [];
    const OrigAudio = window.Audio;
    window.Audio = function (...a) {
      const inst = new OrigAudio(...a);
      try { window.__audioLog.push({ src: String(a[0] || '').slice(-70), t: Date.now() }); } catch (e) {}
      return inst;
    };
    window.Audio.prototype = OrigAudio.prototype;
    const origPlay = OrigAudio.prototype.play;
    OrigAudio.prototype.play = function () {
      const src = String(this.currentSrc || this.src || '').slice(-70);
      const rec = { src, t: Date.now() };
      try { window.__playLog.push(rec); } catch (e) {}
      const p = origPlay.call(this);
      p.then(() => { rec.result = 'resolved'; }).catch((e) => { rec.result = 'rejected:' + e.name; });
      return p;
    };
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  const net = [];
  cdp.on('Network.requestWillBeSent', (e) => {
    if (e.request.url.includes('/api/tts')) {
      const frames = e.initiator && e.initiator.stack && e.initiator.stack.callFrames
        ? e.initiator.stack.callFrames.slice(0, 6).map((f) => (f.functionName || '?') + '@' + (f.url || '').split('/').pop() + ':' + f.lineNumber)
        : [String(e.initiator && e.initiator.type)];
      net.push({ url: decodeURIComponent(e.request.url).slice(-70), by: frames });
    }
  });
  await page.goto(URL + '/?noopening&noprologue', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#b612Gate', { timeout: 90000 });
  await page.check('#b612Gate #gAgreeChk');
  await page.click('#b612Gate .gEnter');
  await page.waitForFunction(() => window.__ctx && window.__ctx.player && window.__ctx.player.pl, { timeout: 90000 });
  await page.waitForFunction(() => window.__bootCheck && window.__bootCheck.ok === true, null, { timeout: 120000 });
  net.length = 0; // 丢弃开机期的杂音,只看 openDialog 之后

  const vo = await page.evaluate(() => sessionStorage.getItem('dialogVoiceOff'));
  await page.evaluate(() => {
    window.__ctx.ui.openDialog({
      speaker: '小王子', speakerType: 'prince',
      lines: ['请你——给我画一只羊！', '这是我的文件。'],
      autoHide: 60000,
    });
  });
  await page.waitForTimeout(3000);
  const snap1 = await page.evaluate(() => ({ play: window.__playLog, audio: window.__audioLog }));
  await page.waitForTimeout(6000);
  const snap2 = await page.evaluate(() => ({ play: window.__playLog, audio: window.__audioLog }));
  console.log('dialogVoiceOff:', vo);
  console.log('3s 后 play 调用:', JSON.stringify(snap1.play, null, 1));
  console.log('3s 后 new Audio:', JSON.stringify(snap1.audio, null, 1));
  console.log('9s 后 play 调用:', JSON.stringify(snap2.play, null, 1));
  console.log('9s 后 new Audio:', JSON.stringify(snap2.audio, null, 1));
  console.log('CDP 网络层(发起调用栈):', JSON.stringify(net, null, 1));
  await b.close();
  process.exit(0);
})().catch((e) => { console.error('探针异常:', e.message); process.exit(2); });
