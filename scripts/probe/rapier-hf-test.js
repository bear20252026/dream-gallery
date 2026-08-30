// 定位 Rapier heightfield 可用参数组合(spike2)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '../..');
const PORT = 5211;
const MIME = { '.mjs': 'text/javascript', '.html': 'text/html', '.wasm': 'application/wasm' };

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
const out = { ready:false, error:null, cases:[] };
try {
  const RAPIER = await import('/rapier/rapier.mjs');
  await RAPIER.init();

  function tryHF(label, nrows, ncols, hLen, scale, gen) {
    const world = new RAPIER.World({ x:0, y:-9.81, z:0 });
    const heights = new Float32Array(hLen);
    for (let i = 0; i < hLen; i++) heights[i] = gen ? gen(i) : 0;
    try {
      const desc = RAPIER.ColliderDesc.heightfield(nrows, ncols, heights, scale);
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      world.createCollider(desc, body);
      world.step();
      out.cases.push({ label, nrows, ncols, hLen, scale, ok: true });
    } catch (e) {
      out.cases.push({ label, nrows, ncols, hLen, scale, ok: false, err: String(e && e.message || e).slice(0, 90) });
    }
  }

  // 验证规律: heights 长度 = (nrows+1) * (ncols+1) —— 顶点网格,比 cell 数多一行一列
  tryHF('9x9 len=100', 9, 9, 10 * 10, { x:20, y:2, z:20 }, () => 0);
  tryHF('17x17 len=324', 17, 17, 18 * 18, { x:40, y:8, z:40 }, () => 0);
  tryHF('65x65 len=4356', 65, 65, 66 * 66, { x:100, y:20, z:100 }, () => 0);
  tryHF('17x17 起伏 324', 17, 17, 18 * 18, { x:40, y:8, z:40 }, (i) => {
    const row = Math.floor(i / 18), col = i % 18;
    const dx = (col - 9) / 9, dz = (row - 9) / 9;
    return Math.max(0, 3 * (1 - (dx * dx + dz * dz)));
  });
  tryHF('9x9 len=81 对照', 9, 9, 81, { x:20, y:2, z:20 }, () => 0);
} catch (e) {
  out.error = String(e && e.stack || e).slice(0, 500);
}
out.ready = true;
window.__out = out;
document.title = 'READY';
</script></body></html>`;

(async () => {
  const htmlPath = path.join(__dirname, 'rapier-hf.html');
  fs.writeFileSync(htmlPath, HTML);
  await new Promise((r) => server.listen(PORT, r));
  const b = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true, args: ['--no-sandbox'],
  });
  const page = await b.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/rapier-hf.html`, { waitUntil: 'domcontentloaded' });
  let ready = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1000);
    ready = await page.evaluate(() => document.title === 'READY');
    if (ready) break;
  }
  const out = ready ? await page.evaluate(() => window.__out) : null;
  await b.close(); server.close();
  fs.unlinkSync(htmlPath);

  if (!out) { console.log('超时'); process.exit(1); }
  if (out.error) console.log('顶层错误:', out.error);
  console.log('=== heightfield 参数矩阵 ===');
  (out.cases || []).forEach((c) => {
    const s = `scale(${c.scale.x},${c.scale.y},${c.scale.z})`;
    console.log(`  ${c.ok ? '✓' : '✗'} ${c.label.padEnd(16)} ${c.nrows}x${c.ncols} len=${String(c.hLen).padStart(5)} ${s.padEnd(22)} ${c.ok ? '' : c.err}`);
  });
})();
