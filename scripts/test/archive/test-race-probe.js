// test-race-probe.js — 令牌延迟到达竞态验证(一次性)
// /api/siteconfig 延迟 6s → 上传照前 3 次重试全部无令牌 → 第 6 秒令牌到达 → 重试必须带上并加载成功
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('galleryNick', '探针');
    sessionStorage.setItem('agreementConsented', '1');
    sessionStorage.setItem('privacyConsented', '1');
    sessionStorage.setItem('communityConsented', '1');
  });
  await page.route('**/api/quiz/state*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ passed: true }) }));
  await page.route('**/api/siteconfig*', async r => { await new Promise(res => setTimeout(res, 6000)); r.continue(); }); // 延迟 6 秒
  const reqs = [];
  page.on('request', q => { if (q.url().includes('uRace.png')) reqs.push(q.url()); });
  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);
  await page.evaluate(async () => {
    const cv = document.createElement('canvas'); cv.width = 200; cv.height = 120;
    cv.getContext('2d').fillStyle = '#3a7bd5'; cv.getContext('2d').fillRect(0, 0, 200, 120);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    const name = 'uRace.png';
    const d = await (await fetch('/api/upload?dir=photos&name=' + name, { method: 'POST', body: blob })).json();
    const c = window.__ctx;
    if (d.mt) { c.myUploadTokens = c.myUploadTokens || {}; c.myUploadTokens[name] = d.mt; }
    c.hangOne('photos/' + name, '探针', null);
    if (c.myUploads && !c.myUploads.includes(name)) c.myUploads.push(name);
    if (c.applyPaintMode) c.applyPaintMode();
    // 模拟 refreshMode 未回:立刻抹掉令牌,制造"令牌未到达"窗口
    delete c.myUploadTokens[name];
  });
  await page.waitForTimeout(11000);
  const r = await page.evaluate(() => {
    const g = (window.__ctx.paintGroups || []).find(g => (g.userData.src || '').endsWith('uRace.png'));
    if (!g) return { found: false };
    const m = g.children[3].material.map;
    const px = m.image.getContext('2d').getImageData(100, 60, 1, 1).data;
    return { found: true, center: [px[0], px[1], px[2]] };
  });
  console.log('竞态后纹理(应非 232,224,228 占位):', JSON.stringify(r));
  console.log('uRace 请求序列(前几次裸奔,后面必须带 mt):');
  reqs.forEach(u => console.log('  ', decodeURIComponent(u).replace('http://127.0.0.1:3000', '')));
  await browser.close();
})().catch(e => { console.error('失败:', e); process.exit(1); });
