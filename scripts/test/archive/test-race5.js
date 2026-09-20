// test-race5.js — 干净版:迟到令牌被重试拾起+真图绘制(一次性)
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const reqs = [];
  page.on('response', q => { if (q.url().includes('race-red')) reqs.push(q.status() + ' ' + q.url()); });
  await page.addInitScript(() => {
    localStorage.setItem('galleryNick','探针');
    sessionStorage.setItem('agreementConsented','1');sessionStorage.setItem('privacyConsented','1');sessionStorage.setItem('communityConsented','1');
  });
  await page.route('**/api/quiz/state*', r => r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({passed:true}) }));
  await page.goto('http://127.0.0.1:3000/', { waitUntil:'domcontentloaded', timeout:30000 });
  await page.waitForTimeout(5000);
  await page.evaluate(() => { window.__ctx.texAllowed=null; window.__tex = window.__ctx.loadTexCapped('photos/race-red.png'); });
  await page.waitForTimeout(1500);
  await page.evaluate((m) => { window.__ctx.myUploadTokens = window.__ctx.myUploadTokens || {}; window.__ctx.myUploadTokens['race-red.png'] = m; }, 'cf5f8126919525d857cb');
  await page.waitForTimeout(6000);
  const px = await page.evaluate(() => {
    const c = window.__tex.image.getContext('2d');
    const d = c.getImageData(256, 256, 1, 1).data;
    return [d[0], d[1], d[2]];
  });
  console.log('纹理中心像素(应红色 255,0,0 而非占位):', JSON.stringify(px));
  reqs.forEach(u => console.log('  ', decodeURIComponent(u).slice(0, 100)));
  await browser.close();
})().catch(e => { console.error('失败:', e); process.exit(1); });
