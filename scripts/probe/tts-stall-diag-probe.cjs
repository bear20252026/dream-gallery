// tts-stall-diag-probe.cjs — 台词音频卡在哪一环?(2026-09-26 一次性诊断)
// 在真实生产页面里直接 new Audio() 播一条源站已缓存的台词 URL,逐事件打时间戳,
// 对照组:普通静态资源。回答:是「网络慢」「媒体元素卡」还是「别的东西拦了」。
const pw = (() => { try { return require('playwright'); } catch (e) { return require('playwright-core'); } })();
(async () => {
  const URL = process.env.PROBE_URL || 'https://cloudbear.cloud';
  const TTS_URL =
    process.env.TTS_URL ||
    URL + '/api/tts?text=' + encodeURIComponent('If you please-- draw me a sheep!') + '&voice=Milo';
  const CTRL_URL = URL + '/data.js'; // 对照组:同站静态 JS(应该快)
  const b = await pw.chromium.launch({
    headless: false,
    executablePath: process.env.PW_EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.goto(URL + '/?noopening&noprologue', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000); // 让 SW 注册好(模拟主人真实环境)

  const run = async (label, url) => {
    return page.evaluate(async ({ label, url }) => {
      const log = [];
      const t0 = performance.now();
      const ts = () => '+' + Math.round(performance.now() - t0) + 'ms';
      const a = new Audio();
      const evs = ['loadstart', 'progress', 'loadedmetadata', 'loadeddata', 'canplay', 'playing', 'stalled', 'suspend', 'abort', 'error', 'waiting', 'timeupdate'];
      for (const ev of evs)
        a.addEventListener(ev, () => {
          const last = log[log.length - 1];
          if (ev === 'timeupdate' && last && last.startsWith('timeupdate')) return; // 压缩 timeupdate 刷屏
          log.push(ev === 'timeupdate' ? `timeupdate t=${a.currentTime.toFixed(2)}` : `${ev} rs=${a.readyState} ns=${a.networkState} @${ts()}`);
        });
      a.src = url;
      let playResult = 'pending';
      const p = a.play();
      p.then(() => (playResult = 'resolved@' + ts()), (e) => (playResult = 'rejected:' + e.name + '@' + ts()));
      // 最长盯 20s
      await new Promise((r) => setTimeout(r, 20000));
      const rt = performance.getEntriesByName(url).pop();
      return {
        label,
        playResult,
        finalCurrentTime: +a.currentTime.toFixed(2),
        paused: a.paused,
        readyState: a.readyState,
        networkState: a.networkState,
        duration: a.duration,
        transfer: rt ? { dur: Math.round(rt.duration), size: rt.transferSize } : 'no-entry',
        events: log.slice(0, 25),
      };
    }, { label, url });
  };

  const ctrl = await run('对照:静态 data.js', CTRL_URL);
  console.log('对照组:', JSON.stringify(ctrl, null, 1));
  const r1 = await run('台词1(源站已缓存,首拉)', TTS_URL);
  console.log('台词1:', JSON.stringify(r1, null, 1));
  const r2 = await run('台词2(同URL重播,吃HTTP缓存)', TTS_URL);
  console.log('台词2:', JSON.stringify(r2, null, 1));
  await b.close();
  const ok = r1.finalCurrentTime > 0 || r2.finalCurrentTime > 0;
  console.log('=== 结论: ' + (ok ? '音频能播(慢但通)' : '音频播不出(卡死实锤)') + ' ===');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('探针异常:', e.message); process.exit(2); });
