// test-upload-flow.js — 上传全链路复现探针(一次性)
// 真上传一张图 → 走与 upload.js 相同顺序 → 检查换芯帧状态/纹理像素/报错
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [], warns = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') warns.push(m.text().slice(0, 150)); });
  await page.addInitScript(() => {
    localStorage.setItem('galleryNick', '探针');
    sessionStorage.setItem('agreementConsented', '1');
    sessionStorage.setItem('privacyConsented', '1');
    sessionStorage.setItem('communityConsented', '1');
  });
  await page.route('**/api/quiz/state*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ passed: true }) }));
  await page.goto('https://cloudbear.cloud/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(7000);
  // 构造 200x120 彩色 PNG 并真实上传(完全按 upload.js 顺序:先存令牌→hangOne→push myUploads→applyPaintMode)
  const r = await page.evaluate(async () => {
    const cv = document.createElement('canvas'); cv.width = 200; cv.height = 120;
    const x = cv.getContext('2d');
    x.fillStyle = '#3a7bd5'; x.fillRect(0, 0, 200, 120);
    x.fillStyle = '#ffd76a'; x.font = 'bold 40px sans-serif'; x.fillText('探针', 60, 75);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    const name = 'uProbeProd.png';
    const up = await fetch('/api/upload?dir=photos&name=' + name, { method: 'POST', body: blob });
    const d = await up.json();
    if (!up.ok) return { fail: d };
    const c = window.__ctx;
    if (d.mt) { c.myUploadTokens = c.myUploadTokens || {}; c.myUploadTokens[name] = d.mt; }
    const g = c.hangOne('photos/' + name, '探针测试', '生机');
    if (c.myUploads && !c.myUploads.includes(name)) c.myUploads.push(name);
    if (c.applyPaintMode) c.applyPaintMode();
    return {
      ok: true, mt: !!d.mt,
      took: g.userData.src,
      pos: [g.userData.ox, g.userData.oz],
      empty: !!g.userData.empty,
      visible: g.visible,
      contentVisible: g.children[3] ? g.children[3].visible : 'N/A'
    };
  });
  console.log('上传+换芯结果:', JSON.stringify(r));
  await page.waitForTimeout(3000);
  const tex = await page.evaluate(() => {
    const c = window.__ctx;
    const g = (c.paintGroups || []).find(g => (g.userData.src || '').endsWith('uProbeProd.png'));
    if (!g) return { found: false };
    const m = g.children[3].material.map;
    const px = m.image.getContext('2d').getImageData(100, 60, 1, 1).data;
    return { found: true, center: [px[0], px[1], px[2]], empty: !!g.userData.empty, visible: g.visible, cmVisible: g.children[3].visible };
  });
  console.log('纹理中心像素(非占位 232,224,228 即已加载):', JSON.stringify(tex));
  console.log('页面错误:', errs.length ? errs : '无', '| 控制台错误:', warns.length ? warns.slice(0, 5) : '无');
  await browser.close();
})().catch(e => { console.error('探针失败:', e); process.exit(1); });
