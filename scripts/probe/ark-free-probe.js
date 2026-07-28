// ark-free-probe.js — 灵蕴飞舟·自由飞实机验收(2026-07-27 P2)
// 预置:六灵蕴已齐 + 已首飞(arkFlew=1)→ 登舟应进入自由飞(而非电影巡礼)
// 断言:登舟分流 / HUD / W 爬升 / 撞地钳制 / 疆域回推 / 返回地面
// 用法: node scripts/probe/ark-free-probe.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

(async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: '3217' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise(r => server.stdout.on('data', d => d.toString().includes('服务器已启动') && r()));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[PAGE_ERROR]', e.message.slice(0, 200)); });
  page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') console.log('[CONSOLE_' + m.type().toUpperCase() + ']', m.text().slice(0, 300)); });

  await page.addInitScript(() => {
    localStorage.setItem('kunlunSpiritsKeys', JSON.stringify(['sprout','flame','leaf','snow','dawn','dusk']));
    localStorage.setItem('kunlunSpirits', '6');
    localStorage.setItem('kunlunSpiritsDone', '1');
    localStorage.setItem('kunlunSpiritsIntro', '1');
    localStorage.setItem('kunlunSkyMs', '100');
    localStorage.setItem('kunlunPrologueDone', '1');
    localStorage.setItem('arkFlew', '1');   // 关键:已首飞 → 登舟进自由飞
    localStorage.setItem('arkFFSeen', '1'); // 跳过首次大字/TTS,保持探针安静
    sessionStorage.setItem('agreementConsented', '1');
    sessionStorage.setItem('privacyConsented', '1');
    sessionStorage.setItem('communityConsented', '1');
    sessionStorage.setItem('kunlunWelcomed', '1');
    sessionStorage.setItem('nickPopOff', '1');
  });
  await page.goto('http://localhost:3217/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__ctx && window.__ctx.desert && window.__ctx.pl && window.__arkFF, null, { timeout: 90000 });
  await page.waitForTimeout(6000);

  // [1] 传送到山巅泊位附近,登舟按钮出现
  await page.evaluate(() => {
    const ctx = window.__ctx;
    ctx.pl.p.x = 800; ctx.pl.p.z = 588; ctx.pl.p.y = ctx.desert.getH(800, 588) + 1.6;
  });
  await page.waitForTimeout(800);
  const diag = await page.evaluate(() => {
    const ctx = window.__ctx;
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.replace(/\s/g, '').includes('飞舟'));
    return {
      pl: { x: +ctx.pl.p.x.toFixed(1), y: +ctx.pl.p.y.toFixed(1), z: +ctx.pl.p.z.toFixed(1) },
      spiritsGot: ctx.spiritsGot ? ctx.spiritsGot() : null,
      isDone: ctx.isDone ? ctx.isDone() : null,
      btn: b ? { display: b.style.display, text: b.textContent } : null,
      overlays: [...document.querySelectorAll('div')].filter(d => d.style.position === 'fixed' && +d.style.zIndex > 100 && d.style.display !== 'none' && d.offsetParent !== null).map(d => d.id || d.textContent.slice(0, 20)),
    };
  });
  console.log('  [diag]', JSON.stringify(diag));
  const diag2 = await page.evaluate(() => {
    const ctx = window.__ctx;
    const btns = [...document.querySelectorAll('button')].map(b => ({ t: b.textContent.slice(0, 14), d: b.style.display, bot: b.style.bottom, z: b.style.zIndex }));
    return { tickers: ctx.tickers.length, btnCount: btns.length, btns: btns.filter(b => b.bot === '160px' || b.t.includes('飞') || b.t.includes('舟')) };
  });
  console.log('  [diag2]', JSON.stringify(diag2));
  const btn = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.replace(/\s/g, '').includes('飞舟'));
    return b && b.style.display === 'block' ? b.textContent : null;
  });
  ok(btn && btn.replace(/\s/g, '').includes('登'), '山巅泊位旁出现登舟按钮: ' + btn);

  // [2] 点击登舟 → 进入自由飞(不是电影巡礼)
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.textContent.replace(/\s/g, '').includes('飞舟')).click(); });
  await page.waitForTimeout(600);
  const st1 = await page.evaluate(() => ({
    on: window.__arkFF.on, lock: window.__ctx.flightLock,
    hud: document.getElementById('arkHud') && document.getElementById('arkHud').style.display,
  }));
  ok(st1.on === true, '已首飞 → 登舟进入自由飞(FF.on=true)');
  ok(st1.lock === true, 'flightLock 已上锁');
  ok(st1.hud === 'block', '#arkHud 已显示');

  // [2.5] 初始机头方向诊断:应为 (0,0,-1) 朝北
  const h0 = await page.evaluate(() => {
    const FF = window.__arkFF;
    const v = new FF.pos.constructor(0, 0, 1).applyQuaternion(FF.quat);
    const q = FF.quat;
    return { fwd: [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)], quat: [+q.x.toFixed(3), +q.y.toFixed(3), +q.z.toFixed(3), +q.w.toFixed(3)] };
  });
  console.log('  [heading]', JSON.stringify(h0));

  // [3] 按住 W:轮询等物理收敛(无头环境帧率暴跌时 dt clamp 会压缩物理时间,等墙钟不可靠)
  const fly = await page.evaluate(async () => {
    const FF = window.__arkFF;
    const y0 = FF.pos.y, t0 = performance.now();
    window.__ctx.ks.w = true;
    let v;
    do {
      await new Promise(r => setTimeout(r, 200));
      v = new FF.pos.constructor(0, 0, 1).applyQuaternion(FF.quat);
    } while ((FF.vel.length() < 18 || v.y < 0.5 || FF.pos.y - y0 < 5) && performance.now() - t0 < 15000);
    window.__ctx.ks.w = false;
    return { dy: FF.pos.y - y0, spd: FF.vel.length(), pitch: Math.asin(Math.max(-1, Math.min(1, v.y))), ms: performance.now() - t0 };
  });
  ok(fly.dy > 5, `W 爬升生效(升高 ${fly.dy.toFixed(1)}m)`);
  ok(fly.spd > 12, `自动油门提速中(速度 ${fly.spd.toFixed(1)} m/s,耗时 ${(fly.ms / 1000).toFixed(1)}s)`);
  ok(fly.pitch > 0.5, `爬升姿态建立(仰角 ${(fly.pitch * 57.3).toFixed(0)}°,限幅 60°)`);

  // 松开 W 等姿态自动改平(轮询:慢帧率环境等墙钟不可靠),平飞视角截图
  await page.evaluate(async () => {
    const FF = window.__arkFF, t0 = performance.now();
    let v;
    do {
      await new Promise(r => setTimeout(r, 200));
      v = new FF.pos.constructor(0, 0, 1).applyQuaternion(FF.quat);
    } while (Math.abs(v.y) > 0.15 && performance.now() - t0 < 10000);
  });
  const camDiag = await page.evaluate(() => {
    const ctx = window.__ctx, FF = window.__arkFF;
    const cam = ctx.cam.position;
    let arkWorld = null, arkVisible = null;
    ctx.s.traverse(o => { if (!arkWorld && o.type === 'Group' && o.children.some(c => c.geometry && c.geometry.type === 'CylinderGeometry')) { const p = new o.position.constructor(); o.getWorldPosition(p); arkWorld = { x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1) }; arkVisible = o.visible; } });
    return { ff: { x: +FF.pos.x.toFixed(1), y: +FF.pos.y.toFixed(1), z: +FF.pos.z.toFixed(1) }, cam: { x: +cam.x.toFixed(1), y: +cam.y.toFixed(1), z: +cam.z.toFixed(1) }, dist: +cam.distanceTo(FF.pos).toFixed(1), arkWorld, arkVisible, fov: ctx.cam.fov };
  });
  console.log('  [camDiag]', JSON.stringify(camDiag));
  fs.mkdirSync(path.join(ROOT, 'scripts', 'artifacts'), { recursive: true });
  await page.screenshot({ path: path.join(ROOT, 'scripts', 'artifacts', 'ark-free.png') });

  // [4] 实心山铁律:压低到地面以下,应被钳回 getH+3(轮询等钳制生效)
  const clamp = await page.evaluate(async () => {
    const ctx = window.__ctx, FF = window.__arkFF;
    FF.pos.x = 800; FF.pos.z = 590;
    const gh = ctx.desert.getH(800, 590);
    const t0 = performance.now();
    do {
      FF.pos.y = gh + 1; // 持续往山里按,等钳制把它顶回来
      await new Promise(r => setTimeout(r, 150));
    } while (FF.pos.y < gh + 2.9 && performance.now() - t0 < 8000);
    return { y: FF.pos.y, gh };
  });
  ok(clamp.y >= clamp.gh + 2.9, `撞地钳制生效(y=${clamp.y.toFixed(1)} ≥ 地面${clamp.gh.toFixed(1)}+3)`);

  // [5] 疆域:扔到 720m 外,应被软回推(轮询等回推生效)
  const bound = await page.evaluate(async () => {
    const FF = window.__arkFF;
    FF.pos.x = 800 + 800; FF.pos.z = 600; FF.pos.y = 200;
    const t0 = performance.now();
    let r;
    do {
      await new Promise(r2 => setTimeout(r2, 150));
      r = Math.hypot(FF.pos.x - 800, FF.pos.z - 600);
    } while (r > 730 && performance.now() - t0 < 8000);
    return r;
  });
  ok(bound <= 730, `疆域软回推生效(距昆仑 ${bound.toFixed(0)}m ≤ 730)`);

  // [6] 返回地面:人回山巅,锁解除,HUD 隐藏
  await page.evaluate(() => document.getElementById('ffHomeBtn').click());
  await page.waitForTimeout(600);
  const st2 = await page.evaluate(() => {
    const ctx = window.__ctx;
    return {
      on: window.__arkFF.on, lock: ctx.flightLock,
      hud: document.getElementById('arkHud').style.display,
      dx: ctx.pl.p.x - 800, dz: ctx.pl.p.z - 588,
      arkVisible: (() => { let a = null; ctx.s.traverse(o => { if (o.type === 'Group' && !a) {} }); return true; })(),
    };
  });
  ok(st2.on === false && st2.lock === false, '返回地面:FF.on=false 且 flightLock 解除');
  ok(st2.hud === 'none', '#arkHud 已隐藏');
  ok(Math.hypot(st2.dx, st2.dz) < 10, `人已回山巅泊位附近(偏差 ${Math.hypot(st2.dx, st2.dz).toFixed(1)}m)`);

  ok(pageErrors.length === 0, `全程无 pageerror(共 ${pageErrors.length} 个)`);

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  await browser.close();
  server.kill();
  process.exit(fail ? 1 : 0);
})();
