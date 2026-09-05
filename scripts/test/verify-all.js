// verify-all.js — 云端大版本全链路验收
const { chromium } = require('playwright-core');
const BASE = 'http://101.133.235.110:3000';
const TOKEN = process.env.ADMIN_TOKEN || ''; // 后台密码走环境变量(2026-07-28 脱敏:不入库)
const api = (p) => { const u = new URL(p, BASE); u.searchParams.set('token', TOKEN); return u; };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ProbeUA/4.0 KimiVerify';
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: false });
  const ctx = await browser.newContext({ userAgent: UA });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[PAGE_ERROR]', e.message.slice(0, 150)));

  console.log('[1] 门禁:邀请函页 → 开启即放行');
  await page.goto(BASE + '/', { waitUntil: 'commit', timeout: 120000 });
  await page.waitForTimeout(2500);
  const gateHtml = await page.content();
  ok(gateHtml.includes('开启邀请函'), '首页是邀请函页');
  await page.click('button');
  await page.waitForTimeout(6000);
  const inGallery = await page.evaluate(() => !!window.__ctx && !!document.querySelector('canvas'));
  ok(inGallery, '开启后进入画廊(有 canvas)');

  console.log('[2] 普通模式:图库隐藏,演示照片可见');
  await page.waitForTimeout(12000);
  const modeInfo = await page.evaluate(() => {
    const c = window.__ctx;
    const groups = (c.paintGroups || []).map(g => ({ src: (g.userData.src || '').split('/').pop(), vis: g.visible }));
    return { mode: c.siteMode, total: groups.length, visible: groups.filter(g => g.vis).map(g => g.src) };
  });
  ok(modeInfo.mode === 'normal', '模式=normal(实际:' + modeInfo.mode + ')');
  ok(modeInfo.visible.length > 0 && modeInfo.visible.every(n => /^20[1-5]\./.test(n)), '可见的只有演示照片: ' + JSON.stringify(modeInfo.visible));

  console.log('[3] 答题低分 → 特别邀请函 → 接受进馆');
  const quizRes = await page.evaluate(async () => {
    const r1 = await fetch('/api/quiz/start?track=li');
    const d1 = await r1.json();
    const r2 = await fetch('/api/quiz/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: d1.sessionId, answers: Array(9).fill('A'), qaText: '随便写写,不够分数线。' }) });
    return r2.json();
  });
  ok(quizRes.passed === false && quizRes.invite === true, '低分返回 invite=true');
  const inv = await page.evaluate(async () => {
    const r = await fetch('/api/quiz/invite', { method: 'POST' });
    return r.json();
  });
  ok(inv.passed === true, '接受邀请函后 passed=true');
  await page.waitForTimeout(3000);
  const passed = await page.evaluate(() => window.__ctx.quizPassed);
  ok(passed === true, '前端已解锁(quizPassed=true)');

  console.log('[4] 后台授予特殊访问 → 图库恢复可见');
  const list = await (await fetch(api('/api/admin/list'))).json();
  const me = list.applicants.find(a => (a.ua || '').includes('ProbeUA'));
  ok(!!me, '后台有探针设备记录');
  const dec = await fetch(api('/api/admin/decide'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: me.id, action: 'special' }) });
  ok(dec.status === 200, '授予特殊访问操作成功');
  await page.evaluate(() => window.__ctx.refreshMode && window.__ctx.refreshMode());
  await page.waitForTimeout(2500);
  const modeInfo2 = await page.evaluate(() => {
    const c = window.__ctx;
    return { mode: c.siteMode, visCount: (c.paintGroups || []).filter(g => g.visible).length, total: (c.paintGroups || []).length };
  });
  ok(modeInfo2.mode === 'special', '模式=special(实际:' + modeInfo2.mode + ')');
  ok(modeInfo2.visCount > modeInfo2.total * 0.5, `图库恢复可见(${modeInfo2.visCount}/${modeInfo2.total})`);

  console.log('[5] 昆仑巅彩蛋(传送玩家)');
  await page.evaluate(() => { window.__ctx.pl.p.set(800, 95, 600); });
  await page.waitForTimeout(2500);
  const audioPlaying = await page.evaluate(() => {
    const audios = performance.getEntriesByType('resource').filter(e => e.name.includes('.m4a'));
    return audios.length > 0;
  });
  ok(audioPlaying, '90m 触发《登飞来峰》音频加载');
  await page.evaluate(() => { window.__ctx.pl.p.set(800, 105, 600); });
  await page.waitForTimeout(3500);
  const peakVid = await page.evaluate(() => {
    let found = false;
    window.__ctx.s.traverse(o => { if (o.material && o.material.map && o.material.map.isVideoTexture && o.geometry && o.geometry.type === 'PlaneGeometry' && o.visible !== false && o.position.y > 50) found = true; });
    return found;
  });
  ok(peakVid, '100m 彩蛋视频屏已生成');
  const hold = await page.evaluate(() => !!window.__ctx.bigScreenHold);
  ok(hold, '彩蛋期间大屏已挂起(bigScreenHold)');

  // 收尾:取消特殊访问,避免探针设备留在特殊名单
  await fetch(api('/api/admin/decide'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: me.id, action: 'unspecial' }) });
  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
