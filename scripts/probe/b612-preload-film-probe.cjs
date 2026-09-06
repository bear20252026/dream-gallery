// b612-preload-film-probe.cjs — 预加载与电影并行的站点级验证(2026-09-06)
// 主人定「恢复预加载,只加载不展示」:
//   ① 闸门 ENTER(电影开播)后,世界模块在后台预加载,__preloadState 应在电影期间到 'done'
//   ② 预加载期间零渲染:主循环 FPS=0、#c 画布 visibility=hidden
//   ③ 电影 skip 后世界秒启(FPS>0 且 activeWorld=main)
// 用法:node scripts/probe/b612-preload-film-probe.cjs (自起临时服务器)
const path = require('path'), fs = require('fs'), os = require('os');
const { spawn } = require('child_process');
const { launch } = require('./browser.js');
const ROOT = path.join(__dirname, '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'b612pre-'));
const PORT = process.env.PRE_PROBE_PORT || 3263;

function startServer() {
  return new Promise((resolve, reject) => {
    const c = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT), GATE_DATA_FILE: path.join(TMP, 'g.json') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    c.stdout.on('data', (d) => { if (d.toString().includes('服务器已启动')) resolve(c); });
    c.on('error', reject);
    setTimeout(() => reject(Error('server timeout')), 12000);
  });
}

(async () => {
  const child = await startServer();
  const b = await launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => { if (!/dynamically imported module/.test(e.message)) errs.push(String(e).slice(0, 200)); });
  await page.goto('http://localhost:' + PORT + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#b612Gate', { timeout: 90000 });
  await page.evaluate(() => {
    const c = document.getElementById('gAgreeChk');
    c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('#b612Gate .gEnter');

  // ① 等电影开播
  await page.waitForSelector('#b612film', { timeout: 30000 });
  let fail = 0;
  const ok = (name, cond, extra) => { console.log((cond ? '✓' : '✓'.replace('✓', cond ? '✓' : '✗')) + ' ' + name + (extra ? ' | ' + extra : '')); if (!cond) fail++; };
  ok('电影已开播', true);

  // ② 电影期间轮询预加载状态(最多 75s),同时断言零渲染
  const filmStart = Date.now();
  let preDoneAt = 0, zeroRender = true, samples = 0;
  while (Date.now() - filmStart < 75000) {
    const st = await page.evaluate(() => ({
      pre: window.__preloadState ? window.__preloadState() : 'no-hook',
      fps: window.__ctx && window.__ctx.loopManager && window.__ctx.loopManager.getFPS ? window.__ctx.loopManager.getFPS() : 0,
      vis: (document.getElementById('c') || {}).style ? document.getElementById('c').style.visibility : '?',
      film: !!document.getElementById('b612film'),
    }));
    samples++;
    if (st.film && (st.fps > 0 || st.vis === 'visible')) { zeroRender = false; console.log('  违规采样:', JSON.stringify(st)); }
    if (st.pre === 'done') { preDoneAt = Date.now() - filmStart; break; }
    if (!st.film) break; // 电影提前结束(短机器)也退出
    await page.waitForTimeout(500);
  }
  ok('预加载在电影期间完成(≤75s)', preDoneAt > 0, '完成于开播后 ' + preDoneAt + 'ms');
  ok('预加载期间零渲染(FPS=0 且画布隐藏)', zeroRender, '采样 ' + samples + ' 次');

  // ③ skip 电影 → 世界应秒启
  await page.click('#b612film #fSkip').catch(() => {});
  const skipAt = Date.now();
  await page.waitForFunction(
    () => window.__ctx && window.__ctx.loopManager && window.__ctx.loopManager.getFPS && window.__ctx.loopManager.getFPS() > 0,
    null, { timeout: 60000 }
  );
  const bootMs = Date.now() - skipAt;
  const world = await page.evaluate(() => window.__ctx.scene.activeWorld);
  ok('skip 后世界启动(' + bootMs + 'ms,activeWorld=' + world + ')', bootMs < 15000 && world === 'main');

  ok('无未捕获页面异常', errs.length === 0);
  if (errs.length) console.log('页面异常:\n' + errs.slice(0, 6).join('\n'));
  await b.close(); child.kill();
  setTimeout(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} }, 500);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('探针失败:', e && e.message); process.exit(1); });
