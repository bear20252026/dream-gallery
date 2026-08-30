// 移动端全流程触摸验证:轻触启程 → 标题层 → 进入画廊(2026-08-30 卡死修复回归)
const { BASE_URL, launch } = require('./browser');
(async () => {
  const b = await launch(['--use-gl=swiftshader', '--enable-unsafe-swiftshader']);
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => {
    try {
      sessionStorage.setItem('agreementConsented', '1');
      sessionStorage.setItem('privacyConsented', '1');
      sessionStorage.setItem('communityConsented', '1');
      sessionStorage.setItem('nickPopOff', '1');
    } catch (e) {}
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 150)));
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5500); // 等逐字引言播完

  // 真实触摸点 introEl(非按钮,验证合成 click 通道)
  const stageA = await page.evaluate(() => {
    const intro = document.getElementById('obIntro');
    return { intro: !!intro, obWrap: !!document.getElementById('obWrap') };
  });
  console.log('阶段A(轻触启程)存在:', stageA.intro, '| 标题层:', stageA.obWrap);
  // 找到 introEl:z-index:3 的全屏 div
  await page.touchscreen.tap(195, 100); // 上半屏任意点(intro 全屏)
  await page.waitForTimeout(2200);
  const stageB = await page.evaluate(() => ({
    introGone: !document.getElementById('obIntro'),
    wrapVisible: (() => { const w = document.getElementById('obWrap'); return !!w && w.style.opacity === '1'; })(),
  }));
  console.log('轻触后 → 仪式层移除:', stageB.introGone, '| 标题层显示:', stageB.wrapVisible,
    stageB.introGone && stageB.wrapVisible ? '✓ 修复生效' : '✗ 仍卡死');

  // 触摸"进入画廊"按钮(等可见,重试 3 次)
  let tapped = false;
  for (let i = 0; i < 3 && !tapped; i++) {
    try {
      await page.waitForSelector('button[aria-label="进入画廊"]', { state: 'visible', timeout: 6000 });
      const bb = await (await page.$('button[aria-label="进入画廊"]')).boundingBox();
      await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
      tapped = true;
      console.log('✓ 触摸进入画廊按钮');
      await page.waitForTimeout(2500);
    } catch (e) {
      console.log('  按钮 tap 重试', i + 1, String(e).slice(0, 100));
      await page.waitForTimeout(2000);
    }
  }
  // 触摸跳过序章/弹窗
  for (let r = 0; r < 6; r++) {
    const ok = await page.evaluate(() => {
      const kws = ['先逛逛', '跳过', '关闭', '取消'];
      const btns = [...document.querySelectorAll('button')].filter((x) => {
        const t = (x.textContent || '').trim();
        return t && kws.some((k) => t.includes(k)) && x.offsetParent !== null;
      });
      if (btns.length) { btns[0].click(); return btns[0].textContent.trim().slice(0, 10); }
      return null;
    });
    if (!ok) break;
    await page.waitForTimeout(1200);
  }
  const game = await page.evaluate(() => ({
    entered: !!document.getElementById('viewBtn'),
    ctx: !!window.__ctx,
    canvas: !!document.querySelector('#c canvas'),
    lights: (() => { let n = 0; if (window.__ctx && window.__ctx.scene) window.__ctx.scene.s.traverse((o) => { if (o.isPointLight || o.isSpotLight) n++; }); return n; })(),
  }));
  console.log('游戏就绪:', JSON.stringify(game));
  console.log('页面异常:', errs.length ? errs.slice(0, 3) : '无');
  await page.screenshot({ path: 'mobile-flow.png' });
  await b.close();
})();
