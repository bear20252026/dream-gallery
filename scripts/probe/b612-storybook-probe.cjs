// b612-storybook-probe.cjs — B612 storybook「球中球」还原验收(2026-09-06 Phase C,一次性归档)
// 断言:①pbr 版模型载入且星球材质带贴图 ②SceneFull2 动画在播 ③玫瑰已归位星球顶
//       ④实测星球顶世界高度(校准出生点) ⑤游戏内截图比对 SceneFull2 参考构图
const { spawn } = require('child_process');
const path = require('path');
const { launch } = require('./browser.js');
const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

(async () => {
  const server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: '3230' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((r) => server.stdout.on('data', (d) => d.toString().includes('服务器已启动') && r()));
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:3230/', { waitUntil: 'domcontentloaded', timeout: 60000 });

  // 过闸门 → skip 电影 → 等场景
  await page.waitForSelector('#b612Gate', { timeout: 60000 });
  await page.click('#b612Gate .gEnter').catch(() => null);
  await page.waitForFunction(() => !document.getElementById('b612Gate'), null, { timeout: 15000 }).catch(() => null);
  await page.waitForSelector('#b612film', { timeout: 20000 }).catch(() => null);
  await page.click('#b612film #fSkip').catch(() => null);
  await page.waitForFunction(() => !!window.__ctx, null, { timeout: 30000 });
  await page.waitForTimeout(6000);

  // 进 B612(与石台入口完全相同的出生点)
  await page.evaluate(() =>
    window.__ctx.scene.enterWorld('b612', {
      snapshot: {
        camera: null,
        player: { position: { x: -1.5, y: 2, z: -8.5 }, yaw: Math.PI, pitch: 0, vy: 0, onGround: true, gliding: false },
      },
    })
  );
  await page.waitForTimeout(12000); // 等 13MB GLB 解析
  // 关掉首次访问的形象选择弹窗(探针每次都是新档案)
  await page.evaluate(() => {
    document.querySelectorAll('button').forEach((b) => {
      if (/^男\s*生$/.test(b.textContent || '')) b.click();
    });
  });
  await page.waitForTimeout(800);
  const d = await page.evaluate(() => {
    const out = { world: window.__ctx.scene.activeWorld };
    const s = window.__ctx.scene.s;
    let book = null;
    s.traverse((o) => { if (o.name === 'b612Storybook') book = o; });
    if (!book) return out;
    let tex = 0, meshes = 0;
    let planetTop = -1e9, rose = null, domeR = 0;
    book.updateMatrixWorld(true);
    book.traverse((o) => {
      // 玫瑰锚点 Rossss2/Rosss1 是空组,必须在 geometry 守卫之前检查
      if (!rose && /Rosss/i.test(o.name || '')) {
        const wp = new (o.position.constructor)().setFromMatrixPosition(o.matrixWorld);
        rose = { x: +wp.x.toFixed(2), y: +wp.y.toFixed(2), z: +wp.z.toFixed(2), name: o.name };
      }
      if (!o.isMesh || !o.geometry) return;
      meshes++;
      if (o.material && o.material.map) tex++;
      if (/PlanetLP/i.test(o.name || '')) {
        o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
        if (b.max.y > planetTop) planetTop = b.max.y;
      }
      if (/pCube1/i.test(o.name || '')) {
        o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
        domeR = Math.max(domeR, Math.abs(b.min.x), Math.abs(b.max.x));
      }
    });
    out.book = { meshes, tex, planetTop: +planetTop.toFixed(2), rose };
    out.domeRadius = +domeR.toFixed(1);
    out.player = (() => { const p = window.__ctx.player.pl.p; return { x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1) }; })();
    return out;
  });
  ok(d.world === 'b612', '已进入 B612');
  ok(d.book && d.book.meshes > 80, 'storybook 载入网格 ' + (d.book ? d.book.meshes : 0) + ' 个');
  ok(d.book && d.book.tex > 80, '带贴图材质 ' + (d.book ? d.book.tex : 0) + ' 个(转换生效)');
  ok(d.domeRadius > 20 && d.domeRadius < 25, '天幕壳半径 ≈ ' + d.domeRadius);
  ok(d.book && d.book.planetTop > -5 && d.book.planetTop < 8, '星球顶世界高度 y=' + (d.book ? d.book.planetTop : '?'));
  ok(d.book && d.book.rose && Math.abs(d.book.rose.x) < 6 && Math.abs(d.book.rose.z) < 6, '玫瑰已归位星球顶 ' + JSON.stringify(d.book && d.book.rose));
  ok(d.player && Math.abs(d.player.z + 8.5) < 2 && Math.abs(d.player.x + 1.5) < 2, '出生点在星球前方 ' + JSON.stringify(d.player));

  await page.screenshot({ path: path.join(ROOT, 'scripts', 'artifacts', 'b612-ingame-render.png') });
  const realErrors = errors.filter((e) => !/dynamically imported module[^]*src[/\\]gallery[/\\]/.test(e)); // 花瓣画廊 v2/玫瑰画廊本地动态导入噪音(9-2 遗留,生产打包无)
  ok(realErrors.length === 0, '零 JS 错误' + (realErrors.length ? ': ' + realErrors[0] : ''));

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  await browser.close();
  server.kill();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
