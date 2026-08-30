// 三输入交互矩阵(2026-08-30):键盘/鼠标/触屏 × 开屏与视角切换,逐项断言
const { BASE_URL, launch } = require('./browser');

(async () => {
  const results = [];
  const ok = (name, cond) => {
    results.push((cond ? '✓' : '✗') + ' ' + name);
    return cond;
  };

  // ===== 桌面环境:键盘 + 鼠标 =====
  {
    const b = await launch(['--use-gl=swiftshader', '--enable-unsafe-swiftshader']);
    const dctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    await dctx.addInitScript(() => {
      try {
        sessionStorage.setItem('agreementConsented', '1');
        sessionStorage.setItem('privacyConsented', '1');
        sessionStorage.setItem('communityConsented', '1');
        sessionStorage.setItem('nickPopOff', '1');
      } catch (e) {}
    });
    const page = await dctx.newPage();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);

    // 1) 键盘 Enter 过开屏
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    ok('键盘:Enter 通过开屏仪式', !(await page.$('#obIntro')));

    // 2) 鼠标点击「进入画廊」按钮
    await page.waitForSelector('button[aria-label="进入画廊"]', { state: 'visible', timeout: 8000 });
    await page.click('button[aria-label="进入画廊"]');
    await page.waitForTimeout(2000);
    ok('鼠标:点击「进入画廊」', true);

    // 3) 鼠标点击「人称」按钮 → viewMode 切换(先处理性别选择弹窗)
    await page.waitForTimeout(3000);
    const gM = await page.$('#genderOv button');
    if (gM) { await gM.click(); console.log('  (桌面:已选性别)'); await page.waitForTimeout(1200); }
    const vm0 = await page.evaluate(() => window.__ctx.player.viewMode);
    await page.click('#viewBtn');
    await page.waitForTimeout(600);
    const vm1 = await page.evaluate(() => window.__ctx.player.viewMode);
    ok('鼠标:点击「人称」切换视角', vm1 !== vm0);

    // 4) 键盘 V → 切回
    await page.keyboard.press('v');
    await page.waitForTimeout(600);
    const vm2 = await page.evaluate(() => window.__ctx.player.viewMode);
    ok('键盘:V 切回视角', vm2 === vm0);

    await b.close();
  }

  // ===== 触屏环境:触摸 + 键盘(混合设备) =====
  {
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
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);

    // 5) 触屏 tap 过开屏(非按钮区域)
    await page.touchscreen.tap(195, 100);
    await page.waitForTimeout(2000);
    ok('触屏:tap 通过开屏仪式', !(await page.$('#obIntro')));

    // 6) 触屏 tap「进入画廊」
    let tapped = false;
    for (let i = 0; i < 2 && !tapped; i++) {
      try {
        await page.waitForSelector('button[aria-label="进入画廊"]', { state: 'visible', timeout: 6000 });
        const bb = await (await page.$('button[aria-label="进入画廊"]')).boundingBox();
        await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
        tapped = true;
      } catch (e) {
        await page.waitForTimeout(2000);
      }
    }
    ok('触屏:tap「进入画廊」', tapped);
    await page.waitForTimeout(2000);
    // 序章覆盖层:点右下角「跳过」按钮关闭(序章是自动播放+手动跳过设计)
    for (let i = 0; i < 6; i++) {
      if (!(await page.$('#prologueOv'))) break;
      const skipBtn = await page.$('#prologueOv button');
      if (skipBtn) { await skipBtn.click(); } else { await page.touchscreen.tap(195, 400); }
      await page.waitForTimeout(1500);
    }
    ok('触屏:关闭序章完成', !(await page.$('#prologueOv')));
    // 清答题门等可见弹窗(先逛逛/关闭)
    for (let r = 0; r < 6; r++) {
      const hit = await page.evaluate(() => {
        const kws = ['先逛逛', '跳过', '关闭', '取消'];
        const btns = [...document.querySelectorAll('button')].filter((x) => {
          if (x.id === 'viewBtn') return false;
          const t = (x.textContent || '').trim();
          return t && kws.some((k) => t.includes(k)) && x.offsetParent !== null;
        });
        if (btns.length) { btns[0].click(); return true; }
        return false;
      });
      if (!hit) break;
      await page.waitForTimeout(1200);
    }

    // 7) 触屏 tap「人称」按钮 → viewMode 切换(先处理性别选择)
    const gT = await page.$('#genderOv button');
    if (gT) {
      const gb = await gT.boundingBox();
      await page.touchscreen.tap(gb.x + gb.width / 2, gb.y + gb.height / 2);
      console.log('  (触屏:已选性别)');
      await page.waitForTimeout(1200);
    }
    const vm0 = await page.evaluate(() => window.__ctx.player.viewMode);
    const vb = await page.$('#viewBtn');
    const vbBox = await vb.boundingBox();
    await page.touchscreen.tap(vbBox.x + vbBox.width / 2, vbBox.y + vbBox.height / 2);
    await page.waitForTimeout(800);
    const vm1 = await page.evaluate(() => window.__ctx.player.viewMode);
    ok('触屏:tap「人称」切换视角', vm1 !== vm0);

    // 8) 混合设备键盘 V → 切回
    await page.keyboard.press('v');
    await page.waitForTimeout(800);
    const vm2 = await page.evaluate(() => window.__ctx.player.viewMode);
    ok('混合:键盘 V 切回视角', vm2 === vm0);

    await b.close();
  }

  console.log('\n===== 三输入交互矩阵 =====');
  results.forEach((r) => console.log(r));
  const fail = results.filter((r) => r.startsWith('✗')).length;
  console.log(`\n通过 ${results.length - fail}/${results.length}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('矩阵执行失败:', e && e.message);
  process.exit(1);
});
