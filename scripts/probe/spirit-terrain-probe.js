// spirit-terrain-probe.js — 灵蕴位置可达性探测:采样六颗灵蕴坐标的地形高度与坡度
// 用法: node scripts/probe/spirit-terrain-probe.js
// 判定:坡度 = 半径 2m 内最大高差;>2.2m 视为陡峭难立足,>1.2m 需注意(跳跃/滑翔可弥补)
const { spawn } = require('child_process');
const path = require('path');
const { chromium, devices } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..');
const KX = 800, KZ = 600;
const SPIRITS = [
  ['春生之芽', KX - 150, KZ], ['夏炽之焰', KX, KZ], ['秋思之叶', KX + 80, KZ - 140],
  ['冬藏之雪', KX - 60, KZ + 170], ['朝露之珠', KX - 110, KZ - 80], ['暮光之尘', KX + 170, KZ + 60],
];

(async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: '3215' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise(r => server.stdout.on('data', d => d.toString().includes('服务器已启动') && r()));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage(devices['iPhone 12']);
  await page.goto('http://localhost:3215/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__ctx && window.__ctx.desert, null, { timeout: 60000 });
  await page.waitForTimeout(3000);

  const rows = await page.evaluate((S) => {
    const getH = window.__ctx.desert.getH;
    return S.map(([name, x, z]) => {
      const h = getH(x, z);
      let min = h, max = h;
      for (let a = 0; a < 8; a++) {
        const hx = x + Math.cos(a * Math.PI / 4) * 2, hz = z + Math.sin(a * Math.PI / 4) * 2;
        const hh = getH(hx, hz);
        if (hh < min) min = hh; if (hh > max) max = hh;
      }
      return { name, x, z, h: +h.toFixed(1), slope: +(max - min).toFixed(1) };
    });
  }, SPIRITS);

  console.log('灵蕴      | 高度   | 2m内坡度 | 判定');
  for (const r of rows) {
    const verdict = r.slope > 2.2 ? '⚠️ 陡峭,建议挪位' : (r.slope > 1.2 ? '△ 偏陡,可到达' : '✓ 平缓易达');
    console.log(`${r.name} | ${String(r.h).padStart(6)} | ${String(r.slope).padStart(8)} | ${verdict}`);
  }
  await browser.close();
  server.kill();
  process.exit(0);
})();
