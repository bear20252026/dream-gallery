// 验证角色贴地:移动玩家到不同地形高度,检查 avatar.y 是否跟随地面
const { BASE_URL: URL, launch } = require('./browser');

(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => {
    try {
      sessionStorage.setItem('agreementConsented', '1');
      sessionStorage.setItem('privacyConsented', '1');
      sessionStorage.setItem('communityConsented', '1');
    } catch (e) {}
  });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#viewBtn', { timeout: 40000 });
  console.log('✓ 页面就绪');

  // 用 V 键切换(避免被开屏层 #openingOv 遮挡按钮)
  await page.keyboard.press('v');
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000);
    if (await page.evaluate(() => !!window.__avatarLoaded)) break;
  }
  const loaded = await page.evaluate(() => !!window.__avatarLoaded);
  console.log('角色已加载:', loaded, '| viewMode:', await page.evaluate(() => window.__ctx.player.viewMode));
  if (!loaded) { await b.close(); process.exit(1); }

  // 采样:把玩家挪到若干坐标,比较 avatar.y 与地面高度 groundY
  const samples = await page.evaluate(async (pts) => {
    const c = window.__ctx;
    const out = [];
    for (const [x, z] of pts) {
      c.player.pl.p.x = x;
      c.player.pl.p.z = z;
      c.player.pl.vy = 0;
      // 等待若干帧让 tickPhysics 把 y 吸附到地面
      await new Promise((r) => setTimeout(r, 420));
      const gy = c.media.desert ? c.media.desert.getH(x, z) : null;
      const av = c.scene.avatar;
      out.push({
        x, z,
        groundY: gy === null ? null : +gy.toFixed(3),
        plY: +c.player.pl.p.y.toFixed(3),
        avatarY: av ? +av.position.y.toFixed(3) : null,
        // 角色脚底与地面的差值(应≈0)
        footVsGround: (gy !== null && av) ? +(av.position.y - gy).toFixed(3) : null,
      });
    }
    return out;
  }, [[20, 14], [0, 0], [40, 20], [-30, -20], [60, 60], [0, 40]]);

  console.log('\n=== 贴地验证(footVsGround 应 ≈ 0) ===');
  console.log('  x,z          地面高度   玩家眼高   角色y     脚底-地面');
  samples.forEach((s) => {
    const ok = s.footVsGround !== null && Math.abs(s.footVsGround) < 0.15;
    console.log(`  (${String(s.x).padStart(3)},${String(s.z).padStart(3)})  ${String(s.groundY).padStart(8)} ${String(s.plY).padStart(9)} ${String(s.avatarY).padStart(8)} ${String(s.footVsGround).padStart(9)}  ${ok ? '✓' : '✗'}`);
  });

  // 跳跃验证
  const jump = await page.evaluate(async () => {
    const c = window.__ctx;
    const before = +c.scene.avatar.position.y.toFixed(3);
    c.player.pl.vy = 9.5;
    c.player.pl.onGround = false;
    await new Promise((r) => setTimeout(r, 260));
    const peak = +c.scene.avatar.position.y.toFixed(3);
    await new Promise((r) => setTimeout(r, 1600));
    const after = +c.scene.avatar.position.y.toFixed(3);
    return { before, peak, after };
  });
  console.log('\n=== 跳跃验证(角色应跟着起跳再落回) ===');
  console.log('  起跳前:', jump.before, '→ 空中:', jump.peak, '→ 落地:', jump.after);
  console.log('  ', jump.peak > jump.before + 0.3 ? '✓ 角色跟着跳起来了' : '✗ 角色没跟着跳');

  await b.close();
})();
