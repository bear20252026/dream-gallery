// pixel-probe.js — 采样 #room-c 画布像素,判断 3D 场景是否真的渲染出东西(而非空白)
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const out = [];
const log = (s) => { out.push(s); console.log(s); };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => log('[PAGE_ERROR] ' + e.message));
  await page.goto('http://localhost:4178/room.html?code=TEST&name=Me', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3500));

  const stats = await page.evaluate(() => {
    const c = document.querySelector('#room-c canvas');
    if (!c) return { error: 'no canvas' };
    const tmp = document.createElement('canvas');
    tmp.width = c.width; tmp.height = c.height;
    const g = tmp.getContext('2d');
    g.drawImage(c, 0, 0);
    let data;
    try { data = g.getImageData(0, 0, c.width, c.height).data; }
    catch (e) { return { error: 'readback failed: ' + e.message }; }
    const colors = new Set();
    let bright = 0, nonBg = 0;
    const bg = [36, 16, 41]; // #241029 场景背景
    for (let i = 0; i < data.length; i += 4 * 97) { // 采样
      const r = data[i], gg = data[i + 1], b = data[i + 2];
      colors.add((r >> 4) + ',' + (gg >> 4) + ',' + (b >> 4));
      if (r + gg + b > 520) bright++;
      if (Math.abs(r - bg[0]) + Math.abs(gg - bg[1]) + Math.abs(b - bg[2]) > 24) nonBg++;
    }
    return { w: c.width, h: c.height, distinctColors: colors.size, brightSamples: bright, nonBgSamples: nonBg, totalSamples: Math.floor(data.length / (4 * 97)) };
  });
  log('[PIXELS] ' + JSON.stringify(stats));

  await browser.close();
  fs.writeFileSync(path.join(__dirname, 'pixel-probe.log'), out.join('\n') + '\n');
})().catch((e) => { log('FATAL ' + e.message); process.exit(1); });
