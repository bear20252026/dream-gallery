// test-audio.js — 模拟用户交互，验证音视频序列是否能正常启动
const { chromium } = require('playwright-core');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  
  // 记录所有 console 输出
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[PAGE_ERROR] ${err.message}`));
  
  // 监控 Audio/Video 播放
  await page.addInitScript(() => {
    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function() {
      const tag = this.tagName;
      const src = this.src || '(no src)';
      console.log(`[AUDIT] ${tag}.play() called, src=${src.substring(0,80)}, muted=${this.muted}`);
      return origPlay.apply(this, arguments);
    };
  });

  console.log('1. 打开网站...');
  await page.goto('https://cloudbear.cloud/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  
  console.log('2. 等待页面加载...');
  
  // 检查 ctx 对象是否就绪
  const ctxReady = await page.evaluate(() => {
    const ctx = window.__ctx;
    if (!ctx) return 'NO_CTX';
    const hasScene = !!ctx.scene && !!ctx.scene.s;
    const hasStartVidSeq = typeof ctx.startVidSeq === 'function';
    const hasMedia = !!ctx.media;
    return JSON.stringify({hasScene, hasStartVidSeq, hasMedia});
  });
  console.log('   ctx 状态:', ctxReady);
  
  // 模拟用户点击页面（触发音频序列）
  console.log('3. 模拟用户点击...');
  await page.click('body', {position: {x: 300, y: 300}});
  await page.waitForTimeout(3000);
  
  // 再次点击（如果第一次没触发）
  console.log('4. 再次点击...');
  await page.click('body', {position: {x: 300, y: 300}});
  await page.waitForTimeout(3000);
  
  // 等待可能触发的音乐
  console.log('5. 等待音频事件...');
  await page.waitForTimeout(5000);
  
  // 检查是否有点击监听器
  const listeners = await page.evaluate(() => {
    const ctx = window.__ctx;
    const seqStarted = typeof ctx.startVidSeq === 'function';
    // 尝试手动触发
    if (seqStarted) {
      try {
        ctx.startVidSeq();
        return 'MANUAL_TRIGGER_OK';
      } catch(e) {
        return 'MANUAL_TRIGGER_ERR:' + e.message;
      }
    }
    return 'NO_START_VID_SEQ';
  });
  console.log('   手动触发结果:', listeners);
  
  await page.waitForTimeout(5000);
  
  // 输出所有日志
  console.log('\n=== 控制台日志 (筛选) ===');
  const filtered = logs.filter(l => 
    l.includes('[AUDIT]') || 
    l.includes('[media]') || 
    l.includes('music') || 
    l.includes('audio') || 
    l.includes('video') || 
    l.includes('PAGE_ERROR') ||
    l.includes('play') ||
    l.includes('startVidSeq')
  );
  if (filtered.length === 0) {
    console.log('  无相关日志');
  } else {
    filtered.forEach(l => console.log(' ', l));
  }
  
  await browser.close();
  console.log('\n测试完成');
})();
