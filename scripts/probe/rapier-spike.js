// Rapier 技术验证(spike):确认能加载、KCC 能让角色贴地走
// 验证点: 1) /rapier/rapier.mjs 动态 import + wasm 同目录自动加载
//         2) world.createCharacterController(offset) 可用
//         3) 角色胶囊在斜坡 heightfield 上能贴地(不陷地/不浮空)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '../..');
const PORT = 5210;
const MIME = {
  '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.html': 'text/html', '.wasm': 'application/wasm',
};

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let fp;
  if (p.startsWith('/rapier/')) fp = path.join(ROOT, 'public', p);
  else fp = path.join(__dirname, p);
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});

const HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<script type="module">
const out = { ready:false, error:null, steps:[], info:{} };
try {
  const t0 = performance.now();
  const RAPIER = await import('/rapier/rapier.mjs');
  out.info.importMs = +(performance.now() - t0).toFixed(0);
  await RAPIER.init();
  out.info.initMs = +(performance.now() - t0).toFixed(0);
  out.info.version = RAPIER.version ? RAPIER.version() : 'unknown';

  // ---- 世界 ----
  const gravity = { x: 0, y: -9.81, z: 0 };
  const world = new RAPIER.World(gravity);

  // ---- 地面:先用平地 cuboid 验证 KCC 核心,再单独验 heightfield ----
  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(10, 0.5, 10), groundBody);
  out.info.flatGround = true;

  // 附带验证 heightfield(单独 try,失败不阻断主流程)
  try {
    const nrows = 9, ncols = 9;
    const heights = new Float32Array(nrows * ncols);
    for (let i = 0; i < nrows; i++) {
      for (let j = 0; j < ncols; j++) {
        const dx = (j - (ncols - 1) / 2) / ((ncols - 1) / 2);
        const dz = (i - (nrows - 1) / 2) / ((nrows - 1) / 2);
        const r = Math.sqrt(dx * dx + dz * dz);
        heights[i * ncols + j] = Math.max(0, 2.5 * (1 - r * r));
      }
    }
    const hfScale = { x: 20, y: 1, z: 20 };
    const hfDesc = RAPIER.ColliderDesc.heightfield(nrows, ncols, heights, hfScale);
    const hfBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(3, 0, 0));
    world.createCollider(hfDesc, hfBody);
    out.info.heightfieldOk = true;
  } catch (e) {
    out.info.heightfieldOk = false;
    out.info.heightfieldErr = String(e && e.message || e).slice(0, 160);
  }

  // ---- 角色:capsule + KCC ----
  const charRadius = 0.3;
  const charHalfHeight = 0.5;  // capsule 半高(总高 ~1.6m)
  const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 5, 0);
  const charBody = world.createRigidBody(bodyDesc);
  const colDesc = RAPIER.ColliderDesc.capsule(charHalfHeight, charRadius);
  const charCollider = world.createCollider(colDesc, charBody);

  const kcc = world.createCharacterController(0.02);
  kcc.enableAutostep(0.5, 0.2, true);
  kcc.enableSnapToGround(0.3);
  kcc.setApplyImpulsesToDynamicBodies(true);
  kcc.setMaxSlopeClimbAngle(50 * Math.PI / 180);
  kcc.setMinSlopeSlideAngle(30 * Math.PI / 180);
  out.info.kccOk = true;

  // ---- 模拟:从空中落下,再水平走 ----
  const dt = 1 / 60;
  let verticalVel = 0;
  let pos = { x: 0, y: 5, z: 0 };

  for (let step = 0; step < 180; step++) {
    // 重力积分
    verticalVel += gravity.y * dt;
    const desired = {
      x: (step > 60 ? 3 * dt : 0),  // 60 帧后开始向 +x 走
      y: verticalVel * dt,
      z: 0,
    };
    kcc.computeColliderMovement(charCollider, desired);
    const corrected = kcc.computedMovement();
    pos.x += corrected.x;
    pos.y += corrected.y;
    pos.z += corrected.z;
    charBody.setNextKinematicTranslation(pos);
    world.step();
    if (kcc.computedGrounded()) verticalVel = 0;
    if (step % 30 === 0 || step === 179) {
      out.steps.push({
        step,
        x: +pos.x.toFixed(3),
        y: +pos.y.toFixed(3),
        grounded: kcc.computedGrounded(),
      });
    }
  }
  out.info.finalY = +pos.y.toFixed(3);
  out.info.finalX = +pos.x.toFixed(3);
} catch (e) {
  out.error = String(e && e.stack || e).slice(0, 600);
}
out.ready = true;
window.__out = out;
document.title = 'READY';
</script></body></html>`;

(async () => {
  const htmlPath = path.join(__dirname, 'rapier-spike.html');
  fs.writeFileSync(htmlPath, HTML);
  await new Promise((r) => server.listen(PORT, r));
  const b = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true, args: ['--no-sandbox'],
  });
  const page = await b.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 200)}`));
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + String(e).slice(0, 300)));
  await page.goto(`http://127.0.0.1:${PORT}/rapier-spike.html`, { waitUntil: 'domcontentloaded' });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1000);
    ready = await page.evaluate(() => document.title === 'READY');
    if (ready) break;
  }
  const out = ready ? await page.evaluate(() => window.__out) : null;
  await b.close(); server.close();
  fs.unlinkSync(htmlPath);

  if (!out) { console.log('超时'); logs.slice(0, 8).forEach((l) => console.log('  ' + l)); process.exit(1); }
  console.log('=== Rapier spike 结果 ===');
  console.log('信息:', JSON.stringify(out.info));
  if (out.error) console.log('错误:', out.error);
  console.log('\n模拟轨迹(每 30 步采样):');
  (out.steps || []).forEach((s) => {
    console.log(`  step ${String(s.step).padStart(3)}  x=${String(s.x).padStart(7)}  y=${String(s.y).padStart(7)}  grounded=${s.grounded}`);
  });
  console.log('\n控制台:');
  logs.slice(0, 8).forEach((l) => console.log('  ' + l));
})();
