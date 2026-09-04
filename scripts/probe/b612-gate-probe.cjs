// b612-gate-probe.cjs — 入口闸门+开幕电影全链路自验(临时服务器,一次性探针归档)
// 场景:首访闸门 → 协议点开/返回 → ENTER → 开幕电影(画帽→选择→交接)→ skip 直落定
//      → 标记写齐 → 刷新:闸门与电影都不再出现(老访客直进)
// 用法: node scripts/probe/b612-gate-probe.cjs
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { launch } = require('./browser.js');

const ROOT = path.join(__dirname, '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'b612gate-'));
const PORT = process.env.GATE_PROBE_PORT || 3228;

function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port), GATE_DATA_FILE: path.join(TMP, 'gate_data.json') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => { if (d.toString().includes('服务器已启动')) resolve(child); });
    child.on('error', reject);
    setTimeout(() => reject(new Error('服务器启动超时')), 12000);
  });
}

(async () => {
  const child = await startServer(PORT);
  const base = 'http://localhost:' + PORT + '/';
  const art = path.join(__dirname, '..', 'artifacts');
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  // 1. 首访:闸门出现
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b612Gate', { timeout: 90000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(art, 'b612-gate-1-gate.png') });
  console.log('✓ 首访:闸门出现');

  // 2. 协议点开 → ‹返回 → 闸门恢复
  await page.click('#b612Gate .gLegal a[data-doc="privacy.html"]');
  await page.waitForFunction(() => {
    const p = document.getElementById('panelOv');
    return p && p.style.display === 'flex';
  }, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(art, 'b612-gate-2-privacy.png') });
  await page.frameLocator('#panelFrame').locator('button:has-text("‹ 返回")').click();
  await page.waitForFunction(() => {
    const g = document.getElementById('b612Gate');
    return g && getComputedStyle(g).opacity === '1';
  }, null, { timeout: 10000 });
  console.log('✓ 协议点开可读,‹返回 退回闸门(状态不丢)');

  // 3. ENTER → 开幕电影出现
  await page.click('#b612Gate .gEnter');
  await page.waitForFunction(() => !document.getElementById('b612Gate'), null, { timeout: 15000 });
  await page.waitForSelector('#b612film', { timeout: 20000 });
  await page.waitForTimeout(5500); // 画帽进行中
  await page.screenshot({ path: path.join(art, 'b612-film-1-hat.png') });
  console.log('✓ ENTER:闸门揭幕,开幕电影开播');

  // 4. 选择 → 交接幕(act2)→ skip 直落定
  await page.waitForSelector('#b612film #fChoice.show', { timeout: 30000 });
  await page.click('#b612film #cBoa');
  await page.waitForFunction(() => document.getElementById('b612film').classList.contains('act2'),
    null, { timeout: 45000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(art, 'b612-film-2-seam.png') });
  await page.click('#b612film #fSkip');
  await page.waitForFunction(() => !document.getElementById('b612film'), null, { timeout: 20000 });
  const marks = await page.evaluate(() => ({
    a: sessionStorage.getItem('agreementConsented'),
    p: sessionStorage.getItem('privacyConsented'),
    c: sessionStorage.getItem('communityConsented'),
    gate: localStorage.getItem('b612GateEntered'),
    prologue: localStorage.getItem('kunlunPrologueDone'),
  }));
  if (marks.a && marks.p && marks.c && marks.gate && marks.prologue)
    console.log('✓ skip 直落定:电影移除,协议+闸门+序章标记全部写齐');
  else { console.error('✗ 标记缺失:', JSON.stringify(marks)); process.exit(1); }
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(art, 'b612-film-3-game.png') });

  // 5. 刷新:老访客——闸门与电影都不再出现
  await page.goto(base + '?r=1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(12000);
  const gone = await page.evaluate(() => !document.getElementById('b612Gate') && !document.getElementById('b612film'));
  if (gone) console.log('✓ 刷新:闸门与电影均不再出现(老访客直进)');
  else { console.error('✗ 刷新后仍有开场层'); process.exit(1); }
  await page.screenshot({ path: path.join(art, 'b612-gate-4-return.png') });

  // 已知环境噪音:裸 server.js 下 gallery-v2/rose-gallery 动态模块偶发 404
  // (生产=vite 打包、npm run dev=vite 管道,均不经过此路径;与本闸门/电影无关)
  const noise = errors.filter((e) => /dynamically imported module/.test(e));
  const real = errors.filter((e) => !/dynamically imported module/.test(e));
  if (noise.length) console.log('(环境噪音 ' + noise.length + ' 条:裸服动态模块偶发 404,已忽略)');
  console.log(real.length ? 'ERRORS:\n' + real.join('\n') : 'NO JS ERRORS');
  await browser.close();
  child.kill();
  setTimeout(function () {
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* Windows 文件占用,留给系统清理 */ }
    process.exit(real.length ? 1 : 0);
  }, 600);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
