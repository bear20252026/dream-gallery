// test-audio2.js — 深入验证音视频是否真正在播放（非仅调用 play()）
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[PAGE_ERROR] ${err.message}`));

  // 监控 Audio/Video play() 调用
  await page.addInitScript(() => {
    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function() {
      console.log(`[AUDIT] ${this.tagName}.play() called, src=${(this.src||'(no src)').substring(0,80)}, muted=${this.muted}, paused=${this.paused}`);
      const p = origPlay.apply(this, arguments);
      if (p && p.then) {
        p.then(() => console.log(`[AUDIT] ${this.tagName} PLAY OK: ${(this.src||'').substring(0,60)}`))
         .catch(e => console.log(`[AUDIT] ${this.tagName} PLAY REJECTED: ${e.name}`));
      }
      return p;
    };
  });

  console.log('1. 打开网站...');
  await page.goto('https://cloudbear.cloud/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);

  console.log('2. 检查页面状态...');
  const state1 = await page.evaluate(() => {
    const ctx = window.__ctx;
    const media = ctx && ctx.media;
    return {
      hasCtx: !!ctx,
      hasVidEl: !!(media && media.vidEl),
      vidElReadyState: media && media.vidEl ? media.vidEl.readyState : -1,
      vidElPaused: media && media.vidEl ? media.vidEl.paused : null,
      hasStartVidSeq: typeof (ctx && ctx.startVidSeq) === 'function',
    };
  });
  console.log('   状态:', JSON.stringify(state1));

  console.log('3. 检查协议弹窗...');
  const overlayInfo = await page.evaluate(() => {
    const ov = document.querySelector('#prologueOv');
    const agreement = document.querySelector('.agree-overlay, #agreementOv, [id*="greement"]');
    return {
      prologueOverlay: !!ov,
      agreementOverlay: !!agreement,
      bodyText: document.body.innerText.substring(0, 100),
    };
  });
  console.log('   弹窗:', JSON.stringify(overlayInfo));

  console.log('4. 模拟点击触发序列...');
  // 点击页面多个位置，确保触发
  for (let i = 0; i < 3; i++) {
    await page.mouse.click(200 + i * 150, 300);
    await page.waitForTimeout(1000);
  }

  console.log('5. 手动调用 ctx.startVidSeq()...');
  const manualResult = await page.evaluate(() => {
    try {
      window.__ctx.startVidSeq();
      return 'OK';
    } catch (e) {
      return 'ERR: ' + e.message;
    }
  });
  console.log('   结果:', manualResult);

  await page.waitForTimeout(6000);

  console.log('6. 检查播放状态...');
  const state2 = await page.evaluate(() => {
    const media = window.__ctx && window.__ctx.media;
    if (!media || !media.vidEl) return { error: 'no vidEl' };
    const vidEl = media.vidEl;
    return {
      vidElSrc: vidEl.src ? vidEl.src.substring(0, 60) : '(empty)',
      vidElReadyState: vidEl.readyState,
      vidElPaused: vidEl.paused,
      vidElCurrentTime: vidEl.currentTime,
      vidElMuted: vidEl.muted,
      vidElError: vidEl.error ? vidEl.error.code + ':' + vidEl.error.message : null,
      hasAudioManager: !!(media.audioManager),
      mA: media.mA ? media.mA.src : '(none)',
    };
  });
  console.log('   视频状态:', JSON.stringify(state2));

  // 检查是否有任何 Audio 元素在播放
  const audioState = await page.evaluate(() => {
    const audios = document.querySelectorAll('audio');
    const videos = document.querySelectorAll('video');
    const audioInfo = Array.from(audios).map(a => ({
      src: a.src ? a.src.substring(0, 60) : '(no src)',
      paused: a.paused,
      currentTime: a.currentTime.toFixed(1),
      muted: a.muted,
      readyState: a.readyState,
      error: a.error ? a.error.code : null,
    }));
    const videoInfo = Array.from(videos).map(v => ({
      src: v.src ? v.src.substring(0, 60) : '(no src)',
      paused: v.paused,
      currentTime: v.currentTime.toFixed(1),
      muted: v.muted,
      readyState: v.readyState,
      error: v.error ? v.error.code : null,
    }));
    return { audioInfo, videoInfo };
  });
  console.log('   页面媒体元素:', JSON.stringify(audioState, null, 2));

  // 输出关键日志
  console.log('\n=== 关键日志 ===');
  logs.filter(l => l.includes('[AUDIT]') || l.includes('[media]') || l.includes('play failed') || l.includes('PAGE_ERROR') || l.includes('启动')).forEach(l => console.log(' ', l));

  await browser.close();
  console.log('\n测试完成');
})();
