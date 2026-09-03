// re-shot.cjs — 关闭开场弹窗后重新拍喷泉截图,看清水流方向与细节(2026-09-03)
const { launch } = require('../probe/browser.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await launch();
  const p = await (
    await b.newContext({ viewport: { width: 1280, height: 800 } })
  ).newPage();
  p.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await p.addInitScript(() => {
    for (const k of [
      'agreementConsented',
      'privacyConsented',
      'communityConsented',
      'skipOpening',
      'prologueDone',
      'nickPopOff',
    ])
      sessionStorage.setItem(k, '1');
  });
  await p.goto('http://localhost:5173/?noopening&noprologue', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await p.waitForFunction(() => window.__ctx && window.__ctx.player && window.__ctx.player.pl, {
    timeout: 60000,
  });
  const clickBtn = (kw) =>
    p.evaluate((k) => {
      const el = [...document.querySelectorAll('button')].find((r) =>
        (r.textContent || '').replace(/\s/g, '').includes(k)
      );
      if (!el) return;
      const r = el.getBoundingClientRect();
      for (const t of ['pointerdown', 'pointerup', 'click'])
        el.dispatchEvent(
          new MouseEvent(t, {
            bubbles: true,
            cancelable: true,
            clientX: r.x + r.width / 2,
            clientY: r.y + r.height / 2,
          })
        );
    }, kw);
  await clickBtn('男').catch(() => {});
  await sleep(1500);
  await clickBtn('先逛逛').catch(() => {});
  await sleep(2500);
  await p.getByText('跳过序章', { exact: false }).click({ timeout: 6000 }).catch(() => {});
  await sleep(4500);
  await p.evaluate(() => {
    const gc = document.getElementById('guideCard');
    if (gc) {
      const b = [...gc.querySelectorAll('button')].find((x) =>
        /先逛逛/.test(x.textContent || '')
      );
      if (b) b.click();
      else gc.remove();
    }
  });
  await sleep(2500);

  // 关键:关掉所有"问你是男生还是女生"这类的开场对话框,避免遮挡
  const dismissOverlays = async () =>
    p.evaluate(() => {
      // 直接扫所有 element,找含"你是男生还是女生"文本的最顶层容器,把它隐藏
      const KILL = ['你是男生还是女生', '男生', '女生', '会影响你的画廊配色方案'];
      const all = [...document.querySelectorAll('*')];
      for (const el of all) {
        if (el.children.length > 0) continue; // 只考虑叶子/最匹配的小元素
        const txt = (el.textContent || '').trim();
        if (txt.length > 200 || txt.length < 2) continue;
        if (!KILL.some((k) => txt.includes(k))) continue;
        // 找到目标后向上找"弹窗容器":直到 parent 包含按钮或 z-index 高
        let p = el;
        for (let i = 0; i < 6 && p; i++) {
          p = p.parentElement;
          if (!p) break;
          const cs = getComputedStyle(p);
          if (parseInt(cs.zIndex || 0) >= 10 || p.querySelector('button')) {
            p.style.display = 'none';
            break;
          }
        }
      }
    });
  const dismiss = async () => {
    await dismissOverlays();
    await dismissOverlays(); // 二次调用,嵌套弹窗也能命中
  };

  const tp = async (x, y, z, yaw, pit) =>
    p.evaluate(
      (a) => {
        const pl = window.__ctx.player.pl;
        pl.p.set(a.x, a.y, a.z);
        pl.y = a.yaw;
        pl.pi = a.pit;
        window.__ctx.cam.position.copy(pl.p);
        window.__ctx.cam.rotation.set(a.pit, a.yaw, 0, 'YXZ');
      },
      { x, y, z, yaw, pit }
    );

  const shot = async (name, x, y, z, yaw, pit, hideOverlays = true) => {
    if (hideOverlays) await dismiss();
    await tp(x, y, z, yaw, pit);
    await sleep(1400);
    await p.screenshot({ path: 'scripts/artifacts/' + name + '.png' });
    console.log('shot:', name);
  };

  // 三张关键截图(站位看清水的细节)
  await shot('flow-clean-a', 0, 1.6, 36, Math.PI, 0.16); // 8m 距离,仰角,水帘/水柱同框
  await sleep(900);
  await shot('flow-clean-b', 0, 1.6, 36, Math.PI, 0.16); // 同机位连拍,用于差异对比
  await shot('aerial-clean', 0, 80, 8, Math.PI, -1.35); // 俯瞰四座全貌(80m 高)
  await shot('close-n-clean', 0, 1.6, -34, 0, 0.16); // 北喷泉近景:站 z=-34 朝北,距喷泉 8m

  await b.close();
})();