// 游戏卡顿归因探针:实测 rAF 帧率 / 长任务 / 渲染统计 / 角色开销
// 用法: node scripts/probe/perf-catwalk.js [采样秒数]
const { chromium } = require('playwright-core');

const SECONDS = parseInt(process.argv[2] || '15', 10);
const URL = 'https://cloudbear.cloud/';

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // 跳过协议门禁
  await ctx.addInitScript(() => {
    try {
      sessionStorage.setItem('agreementConsented', '1');
      sessionStorage.setItem('privacyConsented', '1');
      sessionStorage.setItem('communityConsented', '1');
    } catch (e) {}
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  page.on('console', (m) => {
    const t = m.text();
    if (/lost|WebGL|error|Error/i.test(t) && !/cloudflareinsights/.test(t)) errs.push(`[${m.type()}] ${t.slice(0, 160)}`);
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#avatar-demo-btn', { timeout: 40000 });
  console.log('✓ 页面就绪,加载角色…');

  // 加载角色
  await page.click('#avatar-demo-btn');
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000);
    if (await page.evaluate(() => !!window.__avatarLoaded)) break;
  }
  const loaded = await page.evaluate(() => !!window.__avatarLoaded);
  console.log('角色已加载:', loaded);

  // 进第三人称 + 跳过序章/开屏
  await page.click('#avatar-demo-btn');
  await page.waitForTimeout(2000);
  for (let i = 0; i < 10; i++) {
    await page.mouse.click(640, 400);
    await page.waitForTimeout(1800);
    const eb = await page.$('button[aria-label="进入画廊"]');
    if (eb) { await eb.click(); await page.waitForTimeout(2000); }
  }
  await page.waitForTimeout(3000);

  // === 采样 FPS + 长任务 ===
  const perf = await page.evaluate(async (secs) => {
    const frames = [];
    let last = performance.now();
    let raf = 0;
    const longTasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) longTasks.push(+e.duration.toFixed(1));
      }).observe({ entryTypes: ['longtask'] });
    } catch (e) {}

    await new Promise((resolve) => {
      function tick(now) {
        frames.push(now - last);
        last = now;
        raf++;
        if (performance.now() - startAt < secs * 1000) requestAnimationFrame(tick);
        else resolve();
      }
      const startAt = performance.now();
      requestAnimationFrame(tick);
    });

    const sorted = [...frames].sort((a, b) => a - b);
    const avg = frames.reduce((s, f) => s + f, 0) / frames.length;
    const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    return {
      frames: frames.length,
      avgMs: +avg.toFixed(1),
      fps: +(1000 / avg).toFixed(1),
      p50Ms: +p50.toFixed(1),
      p95Ms: +p95.toFixed(1),
      maxMs: +Math.max(...frames).toFixed(1),
      longTasks: longTasks.slice(0, 12),
      longTaskCount: longTasks.length,
    };
  }, SECONDS);

  // === 渲染统计 ===
  const stats = await page.evaluate(() => {
    const out = {};
    const c = window.__ctx;
    // 找 renderer
    let rnd = null;
    if (c && c.scene) rnd = c.scene.__rnd || c.scene.rnd || c.rnd;
    // 兜底:全局搜
    if (!rnd && window.__renderer) rnd = window.__renderer;
    if (rnd && rnd.info) {
      out.render = {
        calls: rnd.info.render.calls,
        triangles: rnd.info.render.triangles,
        points: rnd.info.render.points,
        lines: rnd.info.render.lines,
        frame: rnd.info.render.frame,
      };
      out.memory = {
        geometries: rnd.info.memory.geometries,
        textures: rnd.info.memory.textures,
      };
      out.programs = rnd.info.programs ? rnd.info.programs.length : null;
    } else {
      out.renderNote = '未找到 renderer.info';
    }
    // 场景规模
    if (c && c.scene && c.scene.s) {
      let meshes = 0, skinned = 0, verts = 0, bones = 0, lights = 0, mats = new Set(), texs = new Set();
      c.scene.s.traverse((o) => {
        if (o.isLight) lights++;
        if (o.isBone) bones++;
        if (o.isMesh) {
          meshes++;
          if (o.isSkinnedMesh) skinned++;
          if (o.geometry && o.geometry.attributes.position) verts += o.geometry.attributes.position.count;
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach((m) => {
            if (!m) return;
            mats.add(m.uuid);
            ['map', 'normalMap', 'alphaMap', 'emissiveMap'].forEach((s) => { if (m[s]) texs.add(m[s].uuid); });
          });
        }
      });
      out.scene = { meshes, skinned, verts, bones, lights, materials: mats.size, textures: texs.size };
    }
    // 角色
    if (c && c.scene && c.scene.avatar) {
      const a = c.scene.avatar;
      out.avatar = {
        visible: a.visible,
        children: a.children.length,
        castShadow: (() => { let n = 0; a.traverse((o) => { if (o.isMesh && o.castShadow) n++; }); return n; })(),
      };
    }
    return out;
  });

  console.log('\n=== 性能采样 (' + SECONDS + 's) ===');
  console.log(JSON.stringify(perf, null, 2));
  console.log('\n=== 渲染统计 ===');
  console.log(JSON.stringify(stats, null, 2));
  if (errs.length) {
    console.log('\n=== 错误/警告 ===');
    [...new Set(errs)].slice(0, 12).forEach((e) => console.log('  ' + e));
  }
  await page.screenshot({ path: 'perf-catwalk.png' });
  console.log('\n截图: perf-catwalk.png');
  await browser.close();
})();
