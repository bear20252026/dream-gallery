// test-audio3.js — 通过真实页面点击触发序列，验证音频视频播放
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

  console.log('1. 打开网站...');
  await page.goto('https://cloudbear.cloud/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);

  console.log('2. 检查是否已有协议弹窗，尝试关闭/同意...');
  // 尝试找到并点击"同意并进入"按钮
  const clicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, a, .agree-btn, [onclick*="close"], [onclick*="agree"]'));
    const target = btns.find(b => /同意|进入|返回|✕/.test(b.textContent || ''));
    if (target) { target.click(); return 'clicked:' + target.textContent.trim().substring(0,20); }
    return 'no-button';
  });
  console.log('   点击结果:', clicked);
  await page.waitForTimeout(3000);

  console.log('3. 通过真实 mouse.click 模拟用户点击页面');
  await page.mouse.click(400, 300);
  await page.waitForTimeout(2000);
  await page.mouse.click(400, 300);
  await page.waitForTimeout(3000);

  console.log('4. 检查是否触发了序列（Audio play 调用）...');
  const audioCalls = logs.filter(l => l.includes('[AUDIT]'));
  console.log('   AUDIT 日志数:', audioCalls.length);
  audioCalls.forEach(l => console.log('   ', l));

  console.log('5. 等待播放...');
  await page.waitForTimeout(8000);

  console.log('6. 最终检查...');
  const final = await page.evaluate(() => {
    const audios = Array.from(document.querySelectorAll('audio'));
    const videos = Array.from(document.querySelectorAll('video'));
    return {
      audioCount: audios.length,
      audioPlaying: audios.filter(a => !a.paused && a.currentTime > 0).length,
      videoCount: videos.length,
      videoPlaying: videos.filter(v => !v.paused && v.currentTime > 0).length,
    };
  });
  console.log('   最终状态:', JSON.stringify(final));

  await browser.close();
  console.log('\n测试完成');
})();
