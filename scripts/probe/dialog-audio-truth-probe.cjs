// dialog-audio-truth-probe.cjs — 「真的有声音吗」三重真实取证(2026-09-26 主人质询)
// 之前的探针只证明「服务器返回了音频」,主人质询「你能通过真实测试得出有声音的结论?」
// 本探针三重取证:
//   T1. 音频内容本身非静音:fetch → AudioContext.decodeAudioData → 算峰值/RMS
//   T2. 浏览器真的在播:hook Audio.prototype.play 记录 resolve/reject 原因 + currentTime 前进
//   T3. 严格自动播放策略(--autoplay-policy=user-gesture-required,模拟主人浏览器若设了
//       「不允许自动播放」):剧情触发链里 play() 会不会被 NotAllowedError 拒掉
//       —— 若 T3 被拒,即为主人「没有声音」的真根因(对白推进正常但无声,且被静默吞掉)。
const { launch } = require('./browser.js');
(async () => {
  const URL = process.env.PROBE_URL || 'https://cloudbear.cloud';
  const results = {};

  async function probe(mode) {
    const b = await launch(mode === 'strict' ? ['--autoplay-policy=user-gesture-required'] : []);
    const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await page.addInitScript(() => {
      for (const k of ['agreementConsented', 'privacyConsented', 'communityConsented'])
        sessionStorage.setItem(k, '1');
      // T2 取证:hook Audio.play 记录每次结果与原因
      window.__playLog = [];
      const origPlay = Audio.prototype.play;
      Audio.prototype.play = function () {
        const src = (this.currentSrc || this.src || '').slice(-60);
        const p = origPlay.call(this);
        const rec = { src, t: Date.now() };
        window.__playLog.push(rec);
        p.then(() => { rec.result = 'resolved'; }).catch((e) => { rec.result = 'rejected:' + e.name; });
        return p;
      };
    });
    await page.goto(URL + '/?noopening&noprologue', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#b612Gate', { timeout: 90000 });
    await page.check('#b612Gate #gAgreeChk');
    await page.click('#b612Gate .gEnter'); // 真实手势
    await page.waitForFunction(() => window.__ctx && window.__ctx.player && window.__ctx.player.pl, { timeout: 90000 });
    await page.waitForFunction(() => window.__bootCheck && window.__bootCheck.ok === true, null, { timeout: 120000 });

    // T1: 音频内容非静音(解码取峰值)
    const t1 = await page.evaluate(async () => {
      try {
        const r = await fetch('/api/tts?text=' + encodeURIComponent('真实取证,请给我画一只羊') + '&voice=' + encodeURIComponent('苏打'));
        const buf = await r.arrayBuffer();
        const ac = new AudioContext();
        const audio = await ac.decodeAudioData(buf.slice(0));
        let peak = 0, sum = 0, n = 0;
        for (let i = 0; i < audio.numberOfChannels; i++) {
          const d = audio.getChannelData(i);
          for (let j = 0; j < d.length; j += 16) { const v = Math.abs(d[j]); if (v > peak) peak = v; sum += v * v; n++; }
        }
        return { bytes: buf.byteLength, durationS: +audio.duration.toFixed(2), peak: +peak.toFixed(3), rms: +Math.sqrt(sum / n).toFixed(4) };
      } catch (e) { return { error: e.message }; }
    });

    // T2: 剧情对话真实触发链里的播放结果
    await page.evaluate(() => {
      window.__ctx.ui.openDialog({
        speaker: '小王子', speakerType: 'prince',
        lines: ['请你——给我画一只羊！', '这是我的文件。'],
        autoHide: 60000,
      });
    });
    await page.waitForTimeout(9000); // 等第一行真的播(合成~4s + 播放)
    const t2 = await page.evaluate(() => {
      const log = window.__playLog.filter((r) => r.src.includes('tts'));
      return { count: log.length, log };
    });

    // T2b: 手势内直接播放(对照:闸门点击的手势上下文早已失效,验证当前状态能否播)
    const t2b = await page.evaluate(() => {
      const a = new Audio('/api/tts?text=' + encodeURIComponent('对照测试') + '&voice=' + encodeURIComponent('苏打'));
      return a.play().then(() => ({ direct: 'resolved' })).catch((e) => ({ direct: 'rejected:' + e.name }));
    });

    await b.close();
    return { t1, t2, t2b };
  }

  results.lenient = await probe('lenient');
  console.log('--- 宽松策略(Playwright 默认) ---');
  console.log('T1 音频内容:', JSON.stringify(results.lenient.t1));
  console.log('T2 对话链播放:', JSON.stringify(results.lenient.t2));
  console.log('T2b 直播对照:', JSON.stringify(results.lenient.t2b));

  results.strict = await probe('strict');
  console.log('--- 严格策略(user-gesture-required,模拟主人浏览器若禁自动播放) ---');
  console.log('T1 音频内容:', JSON.stringify(results.strict.t1));
  console.log('T2 对话链播放:', JSON.stringify(results.strict.t2));
  console.log('T2b 直播对照:', JSON.stringify(results.strict.t2b));

  process.exit(0);
})().catch((e) => { console.error('探针异常:', e.message); process.exit(2); });
