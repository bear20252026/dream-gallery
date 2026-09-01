// probe-covenant-dom.cjs — 诊断誓约书弹窗 DOM 结构
const { launch } = require('../probe/browser.js');

(async () => {
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.addInitScript(() => {
    sessionStorage.setItem('agreementConsented', '1');
    sessionStorage.setItem('privacyConsented', '1');
    sessionStorage.setItem('communityConsented', '1');
    sessionStorage.setItem('skipOpening', '1');
    sessionStorage.setItem('prologueDone', '1');
  });
  await page.goto('http://localhost:3282/?noopening&noprologue', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__ctx && window.__ctx.player && window.__ctx.player.pl, { timeout: 60000 });
  try { await page.getByText('跳过序章', { exact: false }).click({ timeout: 5000 }); } catch (e) {}
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => {
    const hits = [];
    const walk = (root, depth) => {
      for (const el of root.querySelectorAll('*')) {
        const t = (el.textContent || '').trim();
        if (t && (t.includes('男') || t.includes('逛') || t.includes('誓'))) {
          const r = el.getBoundingClientRect();
          hits.push({
            tag: el.tagName, cls: (el.className || '').toString().slice(0, 80),
            text: t.slice(0, 40), kids: el.children.length,
            rect: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
          });
        }
      }
    };
    walk(document, 0);
    const iframes = [...document.querySelectorAll('iframe')].map(f => f.src || '(inline)');
    return { hits: hits.slice(0, 30), iframes };
  });
  console.log(JSON.stringify(info, null, 1));
  await b.close();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
