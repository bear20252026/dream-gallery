// fox-ground-probe.cjs — the fox diorama (scene 10) rests on the sand, nothing hovers (2026-10-04).
// Run: PW_BROWSER=chromium node scripts/probe/fox-ground-probe.cjs   (starts its own local server)
// Measures each part of the diorama in world space against the terrain height under it.
const path = require('path'),
  fs = require('fs'),
  os = require('os'),
  { spawn } = require('child_process');
const { launch } = require('./browser.js');
const ROOT = path.join(__dirname, '..', '..'),
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'foxg-')),
  PORT = process.env.FOXG_PORT || 3299;

function start() {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT), GATE_DATA_FILE: path.join(TMP, 'g.json') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    c.stdout.on('data', (d) => {
      if (/服务器已启动|listening|started/i.test(d.toString())) resolve(c);
    });
    setTimeout(() => resolve(c), 12000);
  });
}
let fails = 0;
const check = (name, ok, extra) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!ok) fails++;
};

(async () => {
  const child = await start();
  const b = await launch(['--autoplay-policy=no-user-gesture-required']);
  try {
    const p = await b.newPage({ viewport: { width: 640, height: 400 } });
    p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));
    await p.addInitScript(() => {
      try {
        sessionStorage.setItem('nickPopOff', '1');
        localStorage.setItem('kunlunWelcomed', String(Date.now()));
        localStorage.setItem('b612Scene2', '1');
        localStorage.setItem('b612Page1', '1');
      } catch (e) {}
    });
    await p.goto('http://localhost:' + PORT + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForSelector('#b612Gate', { timeout: 90000 });
    await p.click('#b612Gate .gEnter');
    await p.waitForSelector('#b612film', { timeout: 20000 });
    await p.waitForTimeout(800);
    await p.click('#b612film #fSkip');
    await p.waitForFunction(() => !document.getElementById('b612film'), null, { timeout: 20000 });
    await p.waitForFunction(() => window.__ctx?.scene?.foxApi, null, { timeout: 60000 });
    // wait for the diorama model to be in place
    await p.waitForFunction(() => window.__ctx.scene.s.getObjectByName('foxScene')?.getObjectByName('Zorro_5'), null, { timeout: 60000 });
    await p.waitForTimeout(1500);
    const parts = await p.evaluate(async () => {
      const THREE = await import('three');
      const root = window.__ctx.scene.s.getObjectByName('foxScene');
      root.updateMatrixWorld(true);
      const gh = (x, z) => window.__ctx.media.desert.getH(x, z);
      const out = {};
      for (const n of ['Escenario_0', 'Nubes_2', 'Hojas_3', 'Principito_4', 'Zorro_5', 'Pasto_8', 'Trigo_9']) {
        const o = root.getObjectByName(n);
        if (!o) continue;
        const bx = new THREE.Box3().setFromObject(o);
        const c = bx.getCenter(new THREE.Vector3());
        out[n] = { minY: bx.min.y, ground: gh(c.x, c.z) };
      }
      const seat = window.__ctx.scene.foxApi.seat();
      const orb = root.children.find((o) => o.isMesh && o.geometry?.type === 'SphereGeometry');
      if (orb) {
        const wp = orb.getWorldPosition(new THREE.Vector3());
        out.seatOrb = { minY: wp.y, ground: gh(seat.x, seat.z) };
      }
      return out;
    });
    for (const n of ['Principito_4', 'Zorro_5', 'Pasto_8', 'Trigo_9']) {
      const g = parts[n].minY - parts[n].ground;
      check(`${n} rests on the sand`, Math.abs(g) < 0.05, 'gap=' + g.toFixed(2));
    }
    const stage = parts.Escenario_0.minY - parts.Escenario_0.ground;
    check('stage (rocky "map") is not hovering', stage <= 0.05, 'gap=' + stage.toFixed(2));
    const cloud = parts.Nubes_2.minY - parts.Nubes_2.ground;
    check('clouds are down near the sand, not up in the air', cloud < 0.6, 'gap=' + cloud.toFixed(2));
    const leaves = parts.Hojas_3.minY - parts.Hojas_3.ground;
    check('trees are not hovering', leaves <= 0.1, 'gap=' + leaves.toFixed(2));
    if (parts.seatOrb) {
      const g = parts.seatOrb.minY - parts.seatOrb.ground;
      check('seat marker is a low lantern, not an orb in the air', g > 0 && g < 0.8, 'height=' + g.toFixed(2));
    }
  } finally {
    await b.close();
    child.kill();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
