// light-compile-bench.js — 点光源数量 vs 着色器编译耗时(主线程阻塞)实测
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: false });
  const page = await browser.newPage();
  page.on('console', m => console.log('  [页面]', m.text()));
  await page.goto('http://localhost:3100/three.mjs', { waitUntil: 'domcontentloaded' }); // 随便拿个同源页面
  const res = await page.evaluate(async () => {
    const THREE = await import('./three.mjs');
    const out = [];
    for (const N of [4, 8, 13, 24, 59]) {
      const s = new THREE.Scene();
      s.add(new THREE.AmbientLight('#fff', 0.5));
      for (let i = 0; i < N; i++) { const l = new THREE.PointLight('#fff', 1, 30, 1.5); l.position.set(i, 2, 0); s.add(l); }
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#a86' }));
      s.add(mesh);
      const rnd = new THREE.WebGLRenderer();
      rnd.setSize(64, 64); rnd.debug.checkShaderErrors = false;
      const cam = new THREE.PerspectiveCamera(75, 1, 0.1, 100); cam.position.z = 3;
      // 计时:编译+首次渲染的同步阻塞
      const t0 = performance.now();
      if (rnd.compileAsync) await rnd.compileAsync(s, cam); else rnd.compile(s, cam);
      rnd.render(s, cam);
      const dt = performance.now() - t0;
      out.push({ lights: N, ms: Math.round(dt) });
      rnd.dispose();
    }
    return out;
  });
  console.log('点光源数 → 编译+首渲主线程阻塞:');
  for (const r of res) console.log(`  ${r.lights} 盏 → ${r.ms} ms`);
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
