// b612-prod-worlds.cjs — 生产世界切换验证(2026-09-10 重写适配两段式开机)
// 路径:闸门→电影 skip→主世界 → 石门传送进 B612 → 导航钮进国王星球 → 返回 B612 → 返回主世界
// 断言:activeWorld 链 / 小地图隐藏与恢复 / storybook+king 模型入景 / ▼隐藏 ⌂恢复 / 零 JS 错误
// 用法:node scripts/probe/b612-prod-worlds.cjs            (自起本地 :3259)
//       BASE_URL=https://cloudbear.cloud node ...          (直测生产)
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const { launch } = require('./browser.js');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3259;
const EXTERNAL = process.env.BASE_URL;
let child = null;
const TMP = path.join(os.tmpdir(), 'b612-prod-worlds-' + Date.now());

function startServer() {
  fs.mkdirSync(TMP, { recursive: true });
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT), GATE_DATA_FILE: path.join(TMP, 'g.json') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => {
      if (d.toString().includes('服务器已启动')) resolve(child);
    });
    child.on('error', reject);
    setTimeout(() => reject(Error('server timeout')), 12000);
  });
}

(async () => {
  if (!EXTERNAL) await startServer();
  const ORIGIN = EXTERNAL || 'http://localhost:' + PORT;
  let pass = 0,
    fail = 0;
  const ok = (c, n, extra) => {
    if (c) {
      pass++;
      console.log('  ✓ ' + n + (extra ? ' | ' + extra : ''));
    } else {
      fail++;
      console.log('  ✗ ' + n + (extra ? ' | ' + extra : ''));
    }
  };
  const errors = [];

  const b = await launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => {
    if (!/dynamically imported module/.test(e.message)) errors.push(String(e).slice(0, 200));
  });
  await page.addInitScript(() => {
    sessionStorage.setItem('nickPopOff', '1');
    try { localStorage.setItem('kunlunWelcomed', String(Date.now())); } catch (e) {}
  });
  await page.goto(ORIGIN + '/?noopening', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#b612Gate', { timeout: 90000 });
  await page.evaluate(() => {
    const c = document.getElementById('gAgreeChk');
    c.checked = true;
    c.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('#b612Gate .gEnter');
  await page.waitForFunction(
    () => window.__ctx && window.__ctx.loopManager && window.__ctx.loopManager.getFPS() > 0,
    null,
    { timeout: 90000 }
  );
  await page.waitForTimeout(1000); // 场景装配稳定

  // ① 初始主世界
  let w = await page.evaluate(() => window.__ctx.scene.activeWorld);
  ok(w === 'main', '初始主世界(activeWorld=' + w + ')');
  const mapShown0 = await page.evaluate(() => {
    const m = document.getElementById('m');
    return document.body.dataset.world === 'main' && m && m.style.display !== 'none';
  });
  ok(mapShown0, '主世界小地图在场(data-world=main)');

  // ② 石门传送 → B612(与玩家真实路径一致:走到 (0.1,56) 触发自动传送)
  await page.evaluate(() => {
    const q = window.__ctx.player.pl.p;
    q.x = 0.1;
    q.z = 56;
  });
  await page.waitForFunction(() => window.__ctx.scene.activeWorld === 'b612', null, { timeout: 25000 });
  ok(true, '进入 B612(activeWorld=b612)');
  const mapHidden = await page.evaluate(() => {
    const m = document.getElementById('m');
    return document.body.dataset.world === 'b612' && m && m.style.display === 'none';
  });
  ok(mapHidden, '非主世界小地图已隐藏');
  // storybook GLB 生产走网络,给有界等待(本地秒过)
  await page.waitForFunction(
    () => {
      let found = null;
      const s = window.__ctx.scene.s;
      if (s) s.traverse((o) => { if (o.name === 'b612Storybook') found = o; });
      return !!found;
    },
    null,
    { timeout: 30000 }
  ).catch(() => {});
  const hasStory = await page.evaluate(() => {
    let found = null;
    const s = window.__ctx.scene.s;
    if (s) s.traverse((o) => { if (o.name === 'b612Storybook') found = o; });
    return !!found;
  });
  ok(hasStory, 'B612 storybook 模型已入景');

  // ③ B612 → 国王星球(导航钮,与玩家真实路径一致)
  await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('前往 325'))?.click());
  await page.waitForFunction(() => /^king325$/.test(window.__ctx.scene.activeWorld), null, { timeout: 25000 });
  await page.waitForFunction(
    () => {
      let found = null;
      const s = window.__ctx.scene.s;
      if (s) s.traverse((o) => { if (o.name === 'kingStoryScene') found = o; });
      return !!found;
    },
    null,
    { timeout: 30000 }
  ).catch(() => {});
  const hasKing = await page.evaluate(() => {
    let found = null;
    const s = window.__ctx.scene.s;
    if (s) s.traverse((o) => { if (o.name === 'kingStoryScene') found = o; });
    return !!found;
  });
  ok(hasKing, '进入国王星球 + kingStoryScene 入景');

  // ④ 国王星球 → B612(星球原点出现返回钮)
  await page.evaluate(() => { const q = window.__ctx.player.pl.p; q.x = 0; q.z = 0; });
  await page.waitForFunction(
    () => [...document.querySelectorAll('button')].some((x) => x.textContent.includes('返回 B612') && x.style.display === 'block'),
    null,
    { timeout: 25000 }
  );
  await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('返回 B612') && x.style.display === 'block')?.click());
  await page.waitForFunction(() => window.__ctx.scene.activeWorld === 'b612', null, { timeout: 25000 });
  ok(true, '国王星球 → B612');

  // ⑤ B612 → 主世界(官方返回入口)
  await page.evaluate(async () => {
    try {
      await window.__ctx.scene.toMainWorld();
    } catch (e) {}
  });
  await page.waitForFunction(() => window.__ctx.scene.activeWorld === 'main', null, { timeout: 25000 });
  const backMain = await page.evaluate(() => {
    const m = document.getElementById('m');
    const d = document.getElementById('descendBtnSpace');
    const h = document.getElementById('homeBtn');
    return (
      document.body.dataset.world === 'main' &&
      m && m.style.display !== 'none' && // 小地图恢复
      d && d.style.display === 'none' && // ▼ 太空下降键隐藏
      h && h.style.display !== 'none' // ⌂ 回家键恢复
    );
  });
  ok(backMain, '回主世界:小地图恢复、▼隐藏、⌂恢复');

  ok(errors.length === 0, '零 JS 错误', errors.length ? errors[0] : '');
  console.log(`\n结果: ${pass} 通过, ${fail} 失败` + (EXTERNAL ? ' [生产]' : ' [本地]'));
  await b.close();
  if (child) child.kill();
  setTimeout(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} }, 500);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
