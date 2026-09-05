// gate-media-probe.js — 验证媒体加载新规:未过答题→室内媒体静默;授 VIP 后→放行
const { chromium } = require('playwright-core');
const BASE = 'http://101.133.235.110:3000';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const api = (p) => { const u = new URL(p, BASE); u.searchParams.set('token', ADMIN_TOKEN); return u; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: false });
  const page = await browser.newPage();
  const photoReqs = [], videoReqs = [];
  page.on('request', r => {
    const u = r.url();
    if (u.includes('/photos/')) photoReqs.push(u.split('/').pop());
    if (u.includes('.mp4')) videoReqs.push(u.split('/').pop());
  });
  page.on('pageerror', e => console.log('[PAGE_ERROR]', e.message));
  await page.goto(BASE + '/', { waitUntil: 'commit', timeout: 120000 });
  await page.bringToFront();
  await page.mouse.click(10, 10);

  console.log('--- 阶段1:未过答题,观察 25 秒 ---');
  await page.waitForTimeout(25000);
  const s1 = await page.evaluate(() => {
    const v = window.__vidEl;
    return { 大屏进度: v ? v.currentTime.toFixed(1) : 'N/A', 大屏paused: v ? v.paused : 'N/A' };
  });
  console.log('大屏(室外,应播放):', JSON.stringify(s1));
  console.log('室内图片请求数(应为0):', photoReqs.length);
  const wallPlaying1 = await page.evaluate(() => {
    // vE 不在 window,用 performance 资源数粗判:videos/ 根目录 mp4(室内挂画)请求数
    return performance.getEntriesByType('resource').filter(e => /videos\/(?!%E6)[^/]*\.mp4/i.test(e.name)).length;
  });
  console.log('室内挂画视频请求数(应为0):', wallPlaying1);

  console.log('--- 阶段2:后台授予 VIP 免答 ---');
  const list = await (await fetch(api('/api/admin/list'))).json();
  const me = list.applicants.find(a => a.answer === '性能探针');
  if (!me) { console.log('找不到探针设备记录!'); await browser.close(); return; }
  const r = await fetch(api('/api/admin/decide'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: me.id, action: 'vip' })
  });
  console.log('授予 VIP:', r.status, await r.text());

  console.log('--- 阶段3:等待 20 秒看放行 ---');
  await page.waitForTimeout(20000);
  console.log('室内图片请求数(应>0):', photoReqs.length, photoReqs.slice(0, 3));
  const s3 = await page.evaluate(() => {
    const v = window.__vidEl;
    return { 大屏进度: v ? v.currentTime.toFixed(1) : 'N/A', 大屏paused: v ? v.paused : 'N/A' };
  });
  console.log('大屏(应仍在播):', JSON.stringify(s3));
  // 恢复:撤销 VIP,避免影响真实规则
  await fetch(api('/api/admin/decide'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: me.id, action: 'unvip' })
  });
  console.log('已撤销探针 VIP');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
