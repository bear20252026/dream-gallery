// b612-prod-worlds.cjs — 生产世界切换验证:入场→石门进 B612→国王星球→回主世界
// 断言:activeWorld 切换 / 小地图隐藏 / storybook 模型入景 / 双向回程 / 零 JS 错误
const { chromium } = require('playwright-core');
const BASE = 'https://cloudbear.cloud/';
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };
const errors = [];

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // 闸门→协议→进电影→skip(与 b612-prod-verify 同路径)
  await page.waitForSelector('#b612Gate', { timeout: 60000 });
  await page.click('#b612Gate .gEnter').catch(() => null);
  await page.waitForFunction(() => !document.getElementById('b612Gate'), null, { timeout: 15000 }).catch(() => null);
  await page.waitForSelector('#b612film', { timeout: 20000 }).catch(() => null);
  await page.click('#b612film #fSkip').catch(() => null);
  await page.waitForFunction(() => !!window.__ctx, null, { timeout: 30000 });
  await page.waitForTimeout(8000); // 等场景与 GLB 就绪

  // ① 初始在主世界
  let w = await page.evaluate(() => window.__ctx.scene.activeWorld);
  ok(w === 'main' || w === undefined || w === null, '初始主世界(activeWorld=' + w + ')');

  // ② 进入 B612 独立世界
  await page.evaluate(() => window.__ctx.scene.enterWorld('b612'));
  await page.waitForTimeout(6000);
  w = await page.evaluate(() => window.__ctx.scene.activeWorld);
  ok(w === 'b612', '进入 B612(activeWorld=' + w + ')');
  const mapHidden = await page.evaluate(() => {
    const m = document.getElementById('m'); // 小地图真实容器(index.html:128)
    return document.body.dataset.world === 'b612' && m && m.style.display === 'none';
  });
  ok(mapHidden, '非主世界小地图已隐藏(data-world=b612 + #m none)');
  const hasStory = await page.evaluate(() => {
    const s = window.__ctx.scene.s; if (!s) return false;
    let found = null;
    s.traverse(o => { if (o.name === 'b612Storybook') found = o; });
    return !!found;
  });
  ok(hasStory, 'B612 storybook 模型已入景');

  // ③ B612→国王星球
  await page.evaluate(() => window.__ctx.scene.enterWorld('king325'));
  await page.waitForTimeout(5000);
  w = await page.evaluate(() => window.__ctx.scene.activeWorld);
  ok(w === 'king325', '进入国王星球(activeWorld=' + w + ')');
  const hasKing = await page.evaluate(() => {
    const s = window.__ctx.scene.s; if (!s) return false;
    let found = null;
    s.traverse(o => { if (o.name === 'kingStoryScene') found = o; });
    return !!found;
  });
  ok(hasKing, '国王场景模型已入景');

  // ④ 回主世界
  await page.evaluate(() => window.__ctx.scene.toMainWorld());
  await page.waitForTimeout(4000);
  w = await page.evaluate(() => window.__ctx.scene.activeWorld);
  ok(w === 'main', '回主世界(activeWorld=' + w + ')');
  const mapBack = await page.evaluate(() => {
    const m = document.getElementById('m');
    return document.body.dataset.world === 'main' && m && m.style.display !== 'none';
  });
  ok(mapBack, '主世界小地图恢复(data-world=main)');

  ok(errors.length === 0, '零 JS 错误' + (errors.length ? ': ' + errors[0] : ''));
  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
