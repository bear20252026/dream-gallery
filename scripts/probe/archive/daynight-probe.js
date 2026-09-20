// daynight-probe.js — 昼夜相位 × 卡顿关联实验
// 90 秒(1.5 个昼夜)连续采样: rAF 帧间隔 / 长任务 / 着色器程序数 / 视频丢帧,按昼夜相位分桶
const { chromium } = require('playwright-core');
const URL_ARG = process.argv[2] || 'http://101.133.235.110:3000/';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: false });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('[PAGE_ERROR]', e.message));
  await page.goto(URL_ARG, { waitUntil: 'commit', timeout: 150000 });
  await page.bringToFront();
  await page.mouse.click(10, 10);
  await page.waitForTimeout(35000); // 等预编译+纹理加载完

  await page.evaluate(() => {
    window.__dn = { frames: [], longTasks: [] };
    let last = performance.now();
    (function loop() {
      const now = performance.now();
      const ph = (document.getElementById('dtPhase') || {}).textContent || '?';
      const dt = document.getElementById('dtText');
      window.__dn.frames.push({ t: now, d: now - last, ph, hour: dt ? dt.textContent : '' });
      last = now;
      requestAnimationFrame(loop);
    })();
    try {
      new PerformanceObserver(l => {
        for (const e of l.getEntries()) {
          const ph = (document.getElementById('dtPhase') || {}).textContent || '?';
          window.__dn.longTasks.push({ dur: Math.round(e.duration), ph });
        }
      }).observe({ entryTypes: ['longtask'] });
    } catch (e) {}
  });

  const progLog = [];
  for (let i = 0; i < 15; i++) {
    const info = await page.evaluate(() => ({
      programs: window.__rnd ? window.__rnd.info.programs.length : -1,
      ph: (document.getElementById('dtPhase') || {}).textContent || '?',
      hour: (document.getElementById('dtText') || {}).textContent || '',
    }));
    progLog.push(info);
    await page.waitForTimeout(6000);
  }

  const out = await page.evaluate(() => {
    const d = window.__dn;
    const byPhase = {};
    for (const f of d.frames.slice(1)) {
      (byPhase[f.ph] = byPhase[f.ph] || []).push(f.d);
    }
    const stat = a => {
      const s = [...a].sort((x, y) => x - y);
      return { n: a.length, p95: Math.round(s[Math.floor(a.length * 0.95)] || 0), max: Math.round(s[s.length - 1] || 0), over100: a.filter(x => x > 100).length };
    };
    const r = {};
    for (const k in byPhase) r[k] = stat(byPhase[k]);
    const lt = {};
    for (const e of d.longTasks) { (lt[e.ph] = lt[e.ph] || []).push(e.dur); }
    return { byPhase: r, longTasks: lt, total: d.frames.length };
  });
  console.log('=== 各相位帧间隔统计(ms) ===');
  for (const k in out.byPhase) console.log(`  ${k}: n=${out.byPhase[k].n} p95=${out.byPhase[k].p95} max=${out.byPhase[k].max} >100ms×${out.byPhase[k].over100}`);
  console.log('=== 长任务按相位 ===', JSON.stringify(out.longTasks));
  console.log('=== 着色器程序数随相位变化 ===');
  for (const p of progLog) console.log(`  ${p.hour} ${p.ph} programs=${p.programs}`);
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
