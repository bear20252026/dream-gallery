// b612-planets-probe.cjs — 六星章节全流程自验(临时服务器,一次性探针归档)
// 场景:首访(闸门→电影 skip)→ 星门自动传送 → 岛上拾星屑 → 章节推进+库存写入 → 回程门回画廊
// 用法: node scripts/probe/b612-planets-probe.cjs
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { launch } = require('./browser.js');

const ROOT = path.join(__dirname, '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'b612pl-'));
const PORT = process.env.PLANETS_PROBE_PORT || 3238;

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
  page.on('pageerror', (e) => { const msg='pageerror: ' + e.message; errors.push(msg); console.log('[ERR@NOW]', new Date().toISOString().slice(17,23), msg.slice(0,90)); });

  // 1. 首访:闸门→ENTER→电影→skip
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b612Gate', { timeout: 90000 });
  await page.click('#b612Gate .gEnter');
  await page.waitForFunction(() => !document.getElementById('b612Gate'), null, { timeout: 15000 });
  await page.waitForSelector('#b612film', { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.click('#b612film #fSkip');
  await page.waitForFunction(() => !document.getElementById('b612film'), null, { timeout: 20000 });
  await page.waitForTimeout(3000);
  console.log('✓ 首访闸门+电影 skip 完成,进入游戏');

  // 1.5 性别弹窗(电影结束后弹出):选「女生」放行
  const genderVisible = await page.evaluate(() => {
    const g = document.getElementById('genderOv');
    return g && getComputedStyle(g).display !== 'none';
  });
  if (genderVisible) {
    await page.click('#genderOv button:has-text("女")');
    await page.waitForTimeout(600);
    console.log('✓ 性别弹窗已选择');
  }

  // 2. planetsMode 生效
  const mode = await page.evaluate(() => !!window.__ctx.kunlun.planetsMode);
  if (!mode) { console.error('✗ planetsMode 未生效'); process.exit(1); }
  console.log('✓ planetsMode 生效(spirits 沙漠系统休眠)');

  // 3. 新入口顺序:主世界石门(0.1,1.6,56,朝北)→ B612 → 国王星球
  await page.evaluate(() => { const p = window.__ctx.player.pl.p; p.x = 0.1; p.z = 56; });
  await page.waitForFunction(() => window.__ctx.scene.activeWorld === 'b612', null, { timeout: 20000 });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('前往 325'))?.click());
  await page.waitForFunction(() => window.__ctx.scene.activeWorld === 'king', null, { timeout: 20000 });
  await page.waitForTimeout(2500); // 落地稳定
  await page.screenshot({ path: path.join(art, 'b612-pl-1-island.png') });
  const onIsland = await page.evaluate(() => {
    const p = window.__ctx.player.pl.p;
    return { x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1) };
  });
  console.log('✓ 星门传送 → 国王之星 @', JSON.stringify(onIsland));

  // 4. 走到星屑旁 → 拾取
  await page.evaluate(() => { const p = window.__ctx.player.pl.p; p.x = 120; p.z = -67.4; });
  await page.waitForSelector('#b612film + * , button', { timeout: 500 }).catch(() => {});
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('拾取星屑'));
    return b && b.style.display === 'block';
  }, null, { timeout: 10000 });
  const pickBtn = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((x) => x.textContent.includes('拾取星屑'))
  );
  await pickBtn.asElement().click();
  await page.waitForTimeout(3200); // 收集流程 2s + 缓冲
  const saved = await page.evaluate(() => ({
    keys: JSON.parse(localStorage.getItem('kunlunSpiritsKeys') || '[]'),
    ch: localStorage.getItem('b612PlanetChapter'),
  }));
  if (saved.keys.includes('sprout') && saved.ch === '1')
    console.log('✓ 拾取:星屑 sprout 入库,章节推进至 1');
  else { console.error('✗ 拾取失败:', JSON.stringify(saved)); process.exit(1); }
  await page.screenshot({ path: path.join(art, 'b612-pl-2-picked.png') });

  // 5. 回程门 → 返回画廊
  await page.evaluate(() => { const p = window.__ctx.player.pl.p; p.x = 120; p.z = -73.4; });
  try {
    await page.waitForFunction(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '返回画廊');
      return b && b.style.display === 'block';
    }, null, { timeout: 20101 });
  } catch (e) {
    const dump = await page.evaluate(() => ({
      p: { x: window.__ctx.player.pl.p.x, z: window.__ctx.player.pl.p.z, y: window.__ctx.player.pl.p.y },
      ch: localStorage.getItem('b612PlanetChapter'),
      mode: !!window.__ctx.kunlun.planetsMode,
      btns: [...document.querySelectorAll('button')]
        .filter((b) => b.textContent.includes('返回画廊') || b.textContent.includes('拾取'))
        .map((b) => b.textContent.trim().slice(0, 12) + '|disp:' + (b.style.display || '(css)')),
    }));
    console.log('DOOR-DUMP:', JSON.stringify(dump));
    throw e;
  }
  const doorBtn = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '返回画廊')
  );
  await doorBtn.asElement().click();
  await page.waitForFunction(() => Math.abs(window.__ctx.player.pl.p.z - 52) < 8, null, { timeout: 20106 });
  console.log('✓ 回程门:已返回画廊');

  // 6. 罗盘页数据:星门换色指向第二章
  const mark = await page.evaluate(() => window.__ctx.kunlun.spiritMark());
  console.log('✓ 小地图标记 →', JSON.stringify(mark));

  const noise = errors.filter((e) => /dynamically imported module/.test(e));
  const real = errors.filter((e) => !/dynamically imported module/.test(e));
  if (noise.length) console.log('(环境噪音 ' + noise.length + ' 条已忽略)');
  console.log(real.length ? 'ERRORS:\n' + real.join('\n') : 'NO JS ERRORS');
  await browser.close();
  child.kill();
  setTimeout(function () {
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
    process.exit(real.length ? 1 : 0);
  }, 600);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
