// kimi-extract.cjs — 提取 Kimi 分享页 iframe 内的完整应用源码(一次性探针)
// 用法: node scripts/probe/kimi-extract.cjs
const fs = require('fs');
const path = require('path');
const { launch } = require('./browser.js');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto('https://hkp5iqfo2i4gk.ok.kimi.link?sharetype=link', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(12000); // 等 Kimi 壳渲染 + iframe 装载

  const info = await page.evaluate(() => {
    const frames = [];
    document.querySelectorAll('iframe').forEach((f, i) => {
      frames.push({
        i,
        src: (f.src || '').slice(0, 200),
        srcdocLen: (f.getAttribute('srcdoc') || '').length,
        w: f.offsetWidth, h: f.offsetHeight,
      });
    });
    return { frames, url: location.href };
  });
  console.log('iframes:', JSON.stringify(info, null, 1));

  // 优先:srcdoc 内联源码
  const srcdoc = await page.evaluate(() => {
    const f = [...document.querySelectorAll('iframe')].find((x) => (x.getAttribute('srcdoc') || '').length > 2000);
    return f ? f.getAttribute('srcdoc') : null;
  });
  const outDir = path.join(__dirname, '..', '..', 'dev', 'kimi-planets');
  fs.mkdirSync(outDir, { recursive: true });
  if (srcdoc) {
    fs.writeFileSync(path.join(outDir, 'planet4-solar-system.html'), srcdoc);
    console.log('SAVED srcdoc → dev/kimi-planets/planet4-solar-system.html (' + srcdoc.length + ' chars)');
    await browser.close();
    return;
  }

  // 其次:逐个同源 iframe 抓 contentDocument
  for (let i = 0; i < info.frames.length; i++) {
    try {
      const fr = page.frames()[i + 1] || page.frames()[i];
      if (!fr || fr === page.mainFrame()) continue;
      const html = await fr.evaluate(() => '<!DOCTYPE html>\n' + document.documentElement.outerHTML);
      if (html.length > 5000) {
        const name = 'planet4-iframe' + i + '.html';
        fs.writeFileSync(path.join(outDir, name), html);
        console.log('SAVED frame ' + i + ' → dev/kimi-planets/' + name + ' (' + html.length + ' chars)');
      }
    } catch (e) { console.log('frame ' + i + ' 跨域或读取失败: ' + e.message.slice(0, 80)); }
  }

  // 兜底:记录页面里所有外链 script(预览地址通常带独立 asset URL)
  const scripts = await page.evaluate(() => [...document.querySelectorAll('script[src]')].map((s) => s.src));
  console.log('scripts:', JSON.stringify(scripts, null, 1));
  fs.writeFileSync(path.join(outDir, 'scripts.json'), JSON.stringify(scripts, null, 1));
  await browser.close();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
