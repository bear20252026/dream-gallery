// test-audio4.js — 模拟老用户（已过序章），验证 00002 音乐 + 视频能否播放
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[PAGE_ERROR] ${err.message}`));

  await page.addInitScript(() => {
    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function() {
      console.log(`[AUDIT] ${this.tagName}.play() src=${(this.src||'').substring(0,70)} muted=${this.muted}`);
      const p = origPlay.apply(this, arguments);
      if (p && p.then) {
        p.then(() => console.log(`[AUDIT] PLAY OK: ${(this.src||'').substring(0,50)}`))
         .catch(e => console.log(`[AUDIT] PLAY FAIL: ${e.name}`));
      }
      return p;
    };
  });

  console.log('1. 设置老用户标记（跳过序章）...');
  await page.goto('https://cloudbear.cloud/?noprologue', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => {
    localStorage.setItem('kunlunPrologueDone', '1');
    sessionStorage.setItem('agreementConsented', '1');
    sessionStorage.setItem('privacyConsented', '1');
    sessionStorage.setItem('communityConsented', '1');
  });
  await page.waitForTimeout(3000);

  console.log('2. 刷新页面（老用户直接进入画廊）...');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);

  console.log('3. 模拟真实用户点击页面...');
  await page.mouse.click(400, 300);
  await page.waitForTimeout(2000);
  await page.mouse.click(400, 300);
  await page.waitForTimeout(4000);

  console.log('4. 检查 AUDIT 日志...');
  const audioCalls = logs.filter(l => l.includes('[AUDIT]'));
  console.log('   AUDIT 日志数:', audioCalls.length);
  audioCalls.forEach(l => console.log('   ', l));

  console.log('5. 等待序列推进...');
  await page.waitForTimeout(10000);

  console.log('6. 检查媒体播放状态...');
  const final = await page.evaluate(() => {
    const audios = Array.from(document.querySelectorAll('audio'));
    const videos = Array.from(document.querySelectorAll('video'));
    return {
      audioCount: audios.length,
      audioDetail: audios.map(a => ({src:(a.src||'').substring(0,50), paused:a.paused, t:a.currentTime.toFixed(1), muted:a.muted, err:a.error?a.error.code:null})),
      videoPlaying: videos.filter(v => !v.paused && v.currentTime > 0).length,
      videoDetail: videos.filter(v => !v.paused && v.currentTime > 0).map(v => (v.src||'').substring(0,50)),
    };
  });
  console.log('   最终状态:', JSON.stringify(final, null, 2));

  await browser.close();
  console.log('\n测试完成');
})();
