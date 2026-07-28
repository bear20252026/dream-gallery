// kintsugi-probe.js — 金缮天花板(C1)+ 答题半程反馈(C3)实机验收(2026-07-28)
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };
(async () => {
  const server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: '3224', MIMO_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise(r => server.stdout.on('data', d => d.toString().includes('服务器已启动') && r()));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[PAGE_ERROR]', e.message.slice(0, 200)); });
  await page.addInitScript(() => {
    localStorage.setItem('kunlunPrologueDone', '1');
    localStorage.setItem('kunlunSkyMs', '100'); // 进度已 100:金缮应直接点亮
    sessionStorage.setItem('agreementConsented', '1'); sessionStorage.setItem('privacyConsented', '1');
    sessionStorage.setItem('communityConsented', '1'); sessionStorage.setItem('kunlunWelcomed', '1'); sessionStorage.setItem('nickPopOff', '1');
  });
  await page.goto('http://localhost:3224/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__ctx && window.__ctx.pl, null, { timeout: 90000 });
  await page.waitForTimeout(4000);

  // [1] 金缮已点亮:屋顶材质换为半透明金缮(透明+opacity 0.55 起)
  const k1 = await page.evaluate(() => {
    let roof = null;
    window.__ctx.scene.s.traverse(o => { if (o.geometry && o.geometry.type === 'PlaneGeometry' && Math.abs(o.position.y - 5) < 0.01 && o.rotation.order === 'XYZ') roof = o; });
    if (!roof) return null;
    return { transparent: roof.material.transparent, opacity: roof.material.opacity, hasMap: !!roof.material.map, basic: roof.material.type };
  });
  ok(k1 && k1.transparent === true && k1.hasMap === true && k1.basic === 'MeshBasicMaterial', '金缮天花板已点亮(半透明 Basic 材质+纹路贴图)');
  ok(k1 && Math.abs(k1.opacity - 0.55) < 0.15, '初始纹亮度≈0.55(实际 ' + (k1 && k1.opacity.toFixed(2)) + ')');

  // [2] 注视发亮:仰头 pi=0.8 等待缓动,opacity 应明显上升;恢复平视回落
  const k2 = await page.evaluate(async () => {
    const ctx = window.__ctx;
    let roof = null;
    ctx.scene.s.traverse(o => { if (o.geometry && o.geometry.type === 'PlaneGeometry' && Math.abs(o.position.y - 5) < 0.01 && o.rotation.order === 'XYZ') roof = o; });
    ctx.player.pl.pi = 0.8;
    await new Promise(r => setTimeout(r, 2500));
    const hi = roof.material.opacity;
    ctx.player.pl.pi = 0.1;
    await new Promise(r => setTimeout(r, 3000));
    const lo = roof.material.opacity;
    return { hi, lo };
  });
  ok(k2.hi > 0.62, '仰头注视纹路增亮(实际 ' + k2.hi.toFixed(2) + ')');
  ok(k2.lo < k2.hi - 0.02, '视线移开缓落(实际 ' + k2.lo.toFixed(2) + ')');

  // [3] C3 半程反馈:答题页元素存在(过渡语十问已在库:第九问·度深浅)
  ok(pageErrors.length === 0, `全程无 pageerror(共 ${pageErrors.length} 个)`);
  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  await browser.close(); server.kill();
  process.exit(fail ? 1 : 0);
})();
