// 聚焦诊断:为什么鼠标拖拽不能转视角
const { chromium } = require('playwright-core');
const URL = 'https://cloudbear.cloud/';

(async () => {
  const b = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
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
  await page.waitForTimeout(6000);
  await page.evaluate(() => {
    const el = document.getElementById('openingOv');
    if (el) el.remove();
    document.querySelectorAll('body > div, body > section, body > aside').forEach((el) => {
      const z = parseInt(el.style.zIndex || getComputedStyle(el).zIndex || '0', 10);
      if (z >= 150 && z < 9000 && el.id !== 'viewBtn') el.remove();
    });
  });
  await page.waitForTimeout(800);

  const r1 = await page.evaluate(() => {
    const c = document.elementFromPoint(640, 400);
    const cnv = document.querySelector('#c canvas');
    let probeFired = false;
    const probe = () => { probeFired = true; };
    if (cnv) cnv.addEventListener('mousedown', probe, { once: true });
    return {
      ontouchstart: 'ontouchstart' in window,
      maxTouchPoints: navigator.maxTouchPoints,
      atPoint: c ? c.tagName + '#' + (c.id || '') + '.' + (c.className || '').toString().slice(0, 30) : 'null',
      canvasFound: !!cnv,
      canvasIsAtPoint: c === cnv,
    };
  });
  console.log('环境:', JSON.stringify(r1));

  // 真实鼠标拖拽
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await page.mouse.move(800, 400, { steps: 5 });
  await page.mouse.up();
  const r2 = await page.evaluate(() => ({
    plY: +window.__ctx.player.pl.y.toFixed(3),
    probeNote: '见上',
  }));
  console.log('真实拖拽后 plY:', JSON.stringify(r2));

  // 合成事件直接发到 canvas
  const r3 = await page.evaluate(async () => {
    const cnv = document.querySelector('#c canvas');
    const c = window.__ctx;
    const before = +c.player.pl.y.toFixed(3);
    cnv.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 640, clientY: 400, bubbles: true }));
    for (let i = 1; i <= 5; i++) {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 640 + i * 30, clientY: 400, bubbles: true }));
      await new Promise((r2) => setTimeout(r2, 50));
    }
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 790, clientY: 400, bubbles: true }));
    return { before, after: +c.player.pl.y.toFixed(3) };
  });
  console.log('合成拖拽:', JSON.stringify(r3), 'delta=', (r3.after - r3.before).toFixed(3));
  await b.close();
})();
