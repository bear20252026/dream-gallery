const { chromium } = require('playwright-core');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto('https://cloudbear.cloud/room.html?code=LIVE&name=Me', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));
  const s = await p.evaluate(() => {
    const c = document.querySelector('#room-c canvas');
    if (!c) return { error: 'no canvas' };
    const t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
    const g = t.getContext('2d'); g.drawImage(c, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const col = new Set(); let bright = 0, nonBg = 0; const bg = [36,16,41];
    for (let i = 0; i < d.length; i += 4*97) {
      const r=d[i],gg=d[i+1],bl=d[i+2];
      col.add((r>>4)+','+(gg>>4)+','+(bl>>4));
      if (r+gg+bl>520) bright++;
      if (Math.abs(r-bg[0])+Math.abs(gg-bg[1])+Math.abs(bl-bg[2])>24) nonBg++;
    }
    const hint = document.querySelector('#roomHint');
    return { distinctColors: col.size, brightSamples: bright, nonBgSamples: nonBg, hintVisible: hint && getComputedStyle(hint).display, hintText: hint && hint.textContent };
  });
  console.log(JSON.stringify(s));
  await b.close();
})().catch(e => { console.log('ERR '+e.message); process.exit(1); });
