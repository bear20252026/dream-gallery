// b612-fold-debug.cjs — 折纸淡出失效诊断(一次性)
const path = require('path');
const { launch } = require('./browser.js');
(async () => {
  const file = path.join(__dirname, '..', '..', 'dev', 'b612-opening-sample.html');
  const url = 'file:///' + file.replace(/\\/g, '/');
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto(url);
  await page.click('#start');
  await page.waitForSelector('#choice.show', { timeout: 30000 });
  await page.click('#cBoa');
  await page.waitForSelector('#tFly2.show', { timeout: 60000 });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => {
    const p = document.getElementById('paper');
    return {
      computedOpacity: getComputedStyle(p).opacity,
      computedTransform: getComputedStyle(p).transform,
      classAttr: p.className,
      styleOpacity: p.style.opacity,
      anims: p.getAnimations().map(a => ({
        state: a.playState,
        fill: a.effect && a.effect.getTiming ? a.effect.getTiming().fill : '?',
        cssName: a.animationName || undefined,
        kfs: a.effect && a.effect.getKeyframes ? a.effect.getKeyframes().map(k => ({
          op: k.opacity, tr: k.transform ? String(k.transform).slice(0, 40) : undefined,
        })) : [],
      })),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
