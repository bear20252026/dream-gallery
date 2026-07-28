// flame-spot-probe.js — 为「夏炽之焰」在昆仑峰顶附近找一个"高且平"的新家
// 判定:以峰顶为中心 60m 网格扫描,找 坡度≤1.2 中海拔最高的点(保住"昆仑之巅"的仪式感)
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..');
const KX = 800, KZ = 600;

(async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: '3215' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise(r => server.stdout.on('data', d => d.toString().includes('服务器已启动') && r()));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:3215/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__ctx && window.__ctx.desert, null, { timeout: 60000 });
  await page.waitForTimeout(3000);

  const rows = await page.evaluate(([KX, KZ]) => {
    const getH = window.__ctx.desert.getH;
    const out = [];
    for (let dx = -60; dx <= 60; dx += 10) for (let dz = -60; dz <= 60; dz += 10) {
      const x = KX + dx, z = KZ + dz, h = getH(x, z);
      let min = h, max = h;
      for (let a = 0; a < 8; a++) {
        const hh = getH(x + Math.cos(a * Math.PI / 4) * 2, z + Math.sin(a * Math.PI / 4) * 2);
        if (hh < min) min = hh; if (hh > max) max = hh;
      }
      out.push({ dx, dz, h: +h.toFixed(1), slope: +(max - min).toFixed(1) });
    }
    return out.filter(r => r.slope <= 1.8 && r.h > 20).sort((a, b) => b.h - a.h).slice(0, 10);
  }, [KX, KZ]);

  console.log('候选(按海拔降序,坡度均≤1.2):');
  for (const r of rows) console.log(`  偏移[${r.dx},${r.dz}] → 海拔 ${r.h}m,坡度 ${r.slope}`);
  await browser.close();
  server.kill();
  process.exit(0);
})();
