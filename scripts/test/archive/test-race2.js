// test-race2.js — 铁证:迟到的令牌被重试拾起(一次性)
const { chromium } = require('playwright-core');
const UA_OWNER='Mozilla/5.0 (Linux; Android 16; 24129PN74C Build/BP2A.250605.031.A3; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/121.0.6167.71 MQQBrowser/6.2 TBS/047935 Mobile Safari/537.36 V1_AND_SQ_9.3.25_15220_YYB_D QQ/9.3.25.38950 NetType/WIFI WebP/0.3.0 AppId/537375294 Pixel/1200 StatusBarHeight/140 SimpleUISwitch/0 QQTheme/1000 QQExt/0 StudyMode/0 CurrentMode/0 CurrentFontScale/1.0 GlobalDensityScale/0.9230769 AllowLandscape/false InMagicWin/0';
(async () => {
  const sc=await (await fetch('https://cloudbear.cloud/api/siteconfig',{headers:{'User-Agent':UA_OWNER}})).json();
  const mt=sc.myUploadTokens['ums2qrabg45q.jpg'];
  console.log('主人令牌就位');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const reqs=[];
  page.on('response', q => { if (q.url().includes('ums2qrabg45q')) reqs.push(q.status() + ' ' + q.url()); });
  await page.addInitScript(() => {
    localStorage.setItem('galleryNick','探针');
    sessionStorage.setItem('agreementConsented','1');sessionStorage.setItem('privacyConsented','1');sessionStorage.setItem('communityConsented','1');
  });
  await page.route('**/api/quiz/state*', r => r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({passed:true}) }));
  await page.goto('https://cloudbear.cloud/', { waitUntil:'domcontentloaded', timeout:30000 });
  await page.waitForTimeout(5000);
  // 无令牌启动加载(裸奔→403);1.5s 后补令牌(模拟 refreshMode 迟到)
  await page.evaluate(() => { window.__ctx.texAllowed=null; window.__tex = window.__ctx.loadTexCapped('photos/ums2qrabg45q.jpg'); });
  await page.waitForTimeout(1500);
  await page.evaluate((m) => { window.__ctx.myUploadTokens = window.__ctx.myUploadTokens || {}; window.__ctx.myUploadTokens['ums2qrabg45q.jpg'] = m; }, mt);
  await page.waitForTimeout(6000);
  const px = await page.evaluate(() => {
    const c = window.__tex.image.getContext('2d');
    const d = c.getImageData(256, 256, 1, 1).data;
    return [d[0], d[1], d[2]];
  });
  console.log('纹理中心像素(非占位即成功):', JSON.stringify(px));
  console.log('请求序列(状态+URL):');
  reqs.forEach(u => console.log('  ', decodeURIComponent(u).slice(0, 100)));
  await browser.close();
})().catch(e => { console.error('失败:', e); process.exit(1); });
