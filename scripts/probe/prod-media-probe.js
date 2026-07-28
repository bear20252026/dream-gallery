// prod-media-probe.js — 实测官网大屏视频/背景音乐真实播放状态(只读,不改任何状态)
// 用法: export PATH="/c/Program Files/nodejs:$PATH" && node scripts/probe/prod-media-probe.js [url]
const { chromium } = require('playwright-core');
const URL0 = process.argv[2] || 'https://cloudbear.cloud/';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const fails = [];
  page.on('requestfailed', r => { if (/videos|music/.test(r.url())) fails.push(r.url() + ' → ' + (r.failure() || {}).errorText); });
  page.on('response', r => { if (/videos|music/.test(r.url()) && r.status() >= 400) fails.push(r.url() + ' → HTTP ' + r.status()); });
  await page.goto(URL0, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__ctx && window.__ctx.desert, null, { timeout: 60000 });
  await page.waitForTimeout(12000); // 给视频 12 秒起播
  const st = await page.evaluate(() => {
    const pick = el => el ? {
      src: (el.currentSrc || el.src || '').slice(0, 90), readyState: el.readyState,
      currentTime: +el.currentTime.toFixed(1), paused: el.paused, muted: el.muted,
      error: el.error ? el.error.code : null, w: el.videoWidth, h: el.videoHeight,
    } : null;
    return { vid: pick(window.__vidEl), v45: pick(window.__v45El) };
  });
  await page.waitForTimeout(3000);
  const st2 = await page.evaluate(() => ({
    t1: window.__vidEl ? +window.__vidEl.currentTime.toFixed(1) : null,
  }));
  console.log('大屏1号:', JSON.stringify(st.vid, null, 1));
  console.log('大屏4/5号:', JSON.stringify(st.v45, null, 1));
  console.log('3秒后 currentTime 前进:', st.vid && st2.t1 !== null ? (st2.t1 > st.vid.currentTime ? '是(在播)' : '否(卡住)') : '无元素');
  console.log('媒体请求失败:', fails.length ? fails : '无');
  await browser.close();
})().catch(e => { console.error('探针失败:', e.message); process.exit(1); });
