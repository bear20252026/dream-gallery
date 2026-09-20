// test-upload-flow2.js — 抓 403 的精确 URL(一次性)
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const bad = [];
  page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + decodeURIComponent(r.url()).slice(0, 110)); });
  await page.addInitScript(() => {
    localStorage.setItem('galleryNick', '探针');
    sessionStorage.setItem('agreementConsented', '1');
    sessionStorage.setItem('privacyConsented', '1');
    sessionStorage.setItem('communityConsented', '1');
  });
  await page.route('**/api/quiz/state*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ passed: true }) }));
  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(7000);
  await page.evaluate(async () => {
    const cv = document.createElement('canvas'); cv.width = 200; cv.height = 120;
    cv.getContext('2d').fillStyle = '#3a7bd5'; cv.getContext('2d').fillRect(0, 0, 200, 120);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    const name = 'uProbeFlow2.png';
    const d = await (await fetch('/api/upload?dir=photos&name=' + name, { method: 'POST', body: blob })).json();
    const c = window.__ctx;
    if (d.mt) { c.myUploadTokens = c.myUploadTokens || {}; c.myUploadTokens[name] = d.mt; }
    c.hangOne('photos/' + name, '探针', '生机');
    if (c.myUploads && !c.myUploads.includes(name)) c.myUploads.push(name);
    if (c.applyPaintMode) c.applyPaintMode();
  });
  await page.waitForTimeout(4000);
  console.log(bad.filter(u => u.includes('uProbe') || u.includes('403')).join('\n') || '(无 uProbe 相关 4xx)');
  await browser.close();
})().catch(e => { console.error('失败:', e); process.exit(1); });
