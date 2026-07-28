// spirit-hud-probe.js — 灵蕴指引 UX 实机验收:屏顶箭头 HUD / 小地图标记 / 传送过渡
// 用法: node scripts/probe/spirit-hud-probe.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

(async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: '3216' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise(r => server.stdout.on('data', d => d.toString().includes('服务器已启动') && r()));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('[PAGE_ERROR]', e.message.slice(0, 200)));

  // 预置:天穹已 100%(开启灵蕴任务)、答题已通过(跳过门禁干扰)
  await page.addInitScript(() => {
    localStorage.setItem('kunlunSkyMs', '100');
    localStorage.setItem('kunlunSpirits', '0');
    localStorage.setItem('kunlunSpiritsIntro', '1'); // 跳过开场大字,直接看 HUD
  });
  await page.goto('http://localhost:3216/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__ctx && window.__ctx.desert && window.__ctx.pl, null, { timeout: 90000 });
  await page.waitForTimeout(6000);

  // [1] HUD 出现且文本含 名字/地点/距离
  const hud = await page.evaluate(() => {
    const els = [...document.querySelectorAll('div')].filter(d => d.textContent.includes('春生之芽') && d.style.position === 'fixed' && d.style.top === '52px');
    if (!els.length) return null;
    const d = els[els.length - 1];
    return { display: d.style.display, text: d.textContent };
  });
  ok(hud && hud.display === 'flex', '屏顶指引 HUD 已显示');
  ok(hud && /春生之芽 · 昆仑东麓·初阳坡 · \d+m/.test(hud.text), 'HUD 文本含名字/地点/距离: ' + (hud && hud.text));

  // [2] 箭头随朝向旋转:面向目标 vs 背向目标,角度应相差约 180°
  const angles = await page.evaluate(async () => {
    const ctx = window.__ctx;
    const arrow = [...document.querySelectorAll('div')].find(d => d.textContent === '▲' && d.style.fontSize === '18px');
    const read = () => +((arrow.style.transform.match(/rotate\((-?[\d.]+)deg\)/) || [])[1] || 0);
    // 面向目标(灵蕴在玩家 +x 方向远处 → 目标方位角 atan2(dx,dz)≈atan2(+,0)≈π/2;令 yaw 使 fAng≈π/2)
    ctx.pl.p.x = 0; ctx.pl.p.z = 0;
    ctx.pl.y = 0; // 朝 -z
    await new Promise(r => setTimeout(r, 400));
    const a1 = read();
    ctx.pl.y = Math.PI; // 转 180°
    await new Promise(r => setTimeout(r, 400));
    const a2 = read();
    return { a1, a2, diff: Math.abs(a1 - a2) };
  });
  ok(Math.abs(angles.diff - 180) < 10 || Math.abs(360 - angles.diff - 180) < 10, `箭头随朝向旋转(差 ${angles.diff.toFixed(1)}°)`);

  // [3] 小地图沙漠视野内有灵蕴金点(把玩家放到灵蕴附近,检查 drM 不报错且标记函数返回)
  const mark = await page.evaluate(() => {
    const ctx = window.__ctx;
    ctx.pl.p.x = 650; ctx.pl.p.z = 600; // 昆仑东麓附近,灵蕴(650,600) 应进入小地图视野
    return ctx.spiritMark ? ctx.spiritMark() : null;
  });
  ok(mark && mark.name === '春生之芽' && mark.x === 650 && mark.z === 600, 'spiritMark 返回当前目标坐标 ' + JSON.stringify(mark));
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(ROOT, 'scripts', 'artifacts', 'spirit-hud.png') });

  // [4] 传送过渡遮罩存在
  const veil = await page.evaluate(() => !!window.__ctx.fadeTeleport);
  ok(veil, 'fadeTeleport 已挂到 ctx(传送/回家共用过渡)');

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  await browser.close();
  server.kill();
  process.exit(fail ? 1 : 0);
})();
