// tippler-set-shot.cjs — 327 酒鬼星布景截图自查(2026-09-30 四件资产全量上岛)
// 验什么:①全套 15 组酒瓶 + 8 罐 + 酒鬼本人 + 银河天幕都真的挂进 king327;
//        ②摆位在岛面上(不飞天不沉地);③截图供人眼判断朝向/比例。
const path = require('path'),
  fs = require('fs'),
  os = require('os'),
  { spawn } = require('child_process');
const { launch } = require('./browser.js');
const ROOT = path.join(__dirname, '..', '..'),
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tipset-')),
  PORT = process.env.TIP_SHOT_PORT || 3293;

function start() {
  return new Promise((resolve, reject) => {
    const c = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT), GATE_DATA_FILE: path.join(TMP, 'g.json') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    c.stdout.on('data', (d) => {
      if (d.toString().includes('服务器已启动')) resolve(c);
    });
    c.on('error', reject);
    setTimeout(() => reject(Error('server timeout')), 12000);
  });
}

(async () => {
  const local = !process.env.BASE_URL;
  const URL = process.env.BASE_URL || 'http://localhost:' + PORT + '/';
  const child = local ? await start() : null;
  const b = await launch(['--autoplay-policy=no-user-gesture-required']);
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const logs = [];
  p.on('console', (m) => {
    const t = m.text();
    if (/scene7/.test(t)) logs.push(t);
  });
  p.on('response', (r) => {
    if (/tippler/.test(r.url())) {
      const h = r.headers();
      logs.push(
        'NET ' + r.status() + ' ' + r.url().slice(-60) + ' len=' + (h['content-length'] || '?') + ' cc=' + (h['cache-control'] || '?')
      );
    }
  });
  await p.addInitScript(() => {
    try {
      sessionStorage.setItem('nickPopOff', '1');
      localStorage.setItem('kunlunWelcomed', String(Date.now()));
      localStorage.setItem('b612Scene2', '1');
      localStorage.setItem('b612Page1', '1');
      localStorage.setItem('b612PlanetChapter', '2');
    } catch (e) {}
  });
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // 审讯 Service Worker:缓存里有没有旧版 tippler 模型
  try {
    const sw = await p.evaluate(async () => {
      if (!navigator.serviceWorker) return { sw: false };
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return { sw: false };
      const keys = await caches.keys();
      const out = { sw: true, ver: keys, entries: [] };
      for (const k of keys) {
        const c = await caches.open(k);
        const reqs = await c.keys();
        reqs.forEach((r) => {
          if (/tippler/.test(r.url)) out.entries.push(r.url.slice(-70));
        });
      }
      return out;
    });
    console.log('SW 审计:', JSON.stringify(sw));
  } catch (e) {
    console.log('SW 审计失败:', e.message);
  }
  await p.waitForSelector('#b612Gate', { timeout: 90000 });
  await p.evaluate(() => {
    const c = document.getElementById('gAgreeChk');
    c.checked = true;
    c.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.click('#b612Gate .gEnter');
  await p.waitForFunction(() => !document.getElementById('b612Gate'), null, { timeout: 15000 });
  await p.waitForSelector('#b612film', { timeout: 20000 });
  await p.waitForTimeout(1000);
  await p.click('#b612film #fSkip');
  await p.waitForFunction(() => !document.getElementById('b612film'), null, { timeout: 20000 });
  await p.waitForTimeout(2000);
  await p.click('#genderOv button:has-text("女")').catch(() => {});
  await p.evaluate(() => {
    window.__autoChoice = setInterval(() => {
      const el = document.querySelector('.gs-choice');
      if (el && el.offsetParent) el.click();
    }, 1200);
  });
  // 线上加载慢:玩家对象就绪后再传送(否则 pl undefined)
  await p.waitForFunction(() => window.__ctx && window.__ctx.player && window.__ctx.player.pl, null, {
    timeout: 60000,
  });
  await p.evaluate(() => window.__ctx.kunlun.revealStarGate && window.__ctx.kunlun.revealStarGate());
  await p.waitForTimeout(800);
  await p.evaluate(() => {
    const q = window.__ctx.player.pl.p;
    q.x = 0.1;
    q.z = 56;
  });
  await p.waitForFunction(() => window.__ctx.scene.activeWorld === 'b612', null, { timeout: 25000 });
  await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('前往 327'))?.click());
  await p.waitForFunction(() => window.__ctx.scene.activeWorld === 'king327', null, { timeout: 25000 });
  await p.waitForTimeout(8000); // 等模型下载+挂载
  await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(1000);
  await p.screenshot({ path: path.join(TMP, 'tippler-spawn.png') });
  // 近看:走到酒鬼身边
  await p.evaluate(() => {
    const q = window.__ctx.player.pl;
    q.p.x = -0.6;
    q.p.z = 3.2;
  });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(TMP, 'tippler-near.png') });
  // 断言:四件都在场景里
  const stat = await p.evaluate(() => {
    const sc = window.__ctx.scene.worldManager.getWorld('king327').scene;
    const out = {};
    ['tipplerBottles', 'tipplerCans', 'tipplerMan', 'tipplerSky'].forEach((n) => {
      out[n] = !!sc.getObjectByName(n);
    });
    return out;
  });
  console.log('世界对象:', JSON.stringify(stat));
  console.log('日志:', logs.join(' | ') || '(none)');
  console.log('shot1:', path.join(TMP, 'tippler-spawn.png'));
  console.log('shot2:', path.join(TMP, 'tippler-near.png'));
  if (child) child.kill();
  process.exit(0);
})().catch((e) => {
  console.error('PROBE FAIL', e.message);
  process.exit(1);
});
