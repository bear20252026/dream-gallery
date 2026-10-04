// ending-portfolio-probe.cjs — the epilogue brings back the player's own drawings.
// Run: PW_BROWSER=chromium node scripts/probe/ending-portfolio-probe.cjs
// Checks, with and without a saved portfolio:
//   - the epilogue question screen shows the player's box (and nothing when it was never drawn)
//   - the final screen shows one keepsake thumbnail per drawing the player made
const path = require('path'),
  fs = require('fs'),
  os = require('os'),
  { spawn } = require('child_process');
const { launch } = require('./browser.js');
const ROOT = path.join(__dirname, '..', '..'),
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'endpf-')),
  PORT = process.env.ENDPF_PORT || 3293,
  OUT = path.join(ROOT, 'scripts', 'artifacts');

function start() {
  return new Promise((resolve, reject) => {
    const c = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT), GATE_DATA_FILE: path.join(TMP, 'g.json') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    c.stdout.on('data', (d) => {
      if (/服务器已启动|listening|started/i.test(d.toString())) resolve(c);
    });
    c.on('error', reject);
    setTimeout(() => resolve(c), 12000);
  });
}

let fails = 0;
const check = (name, ok, extra) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!ok) fails++;
};

async function run(browser, label, portfolio) {
  const p = await browser.newPage({ viewport: { width: 640, height: 400 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('crash', () => console.log('PAGE CRASHED'));
  p.on('close', () => console.log('page closed'));
  if (process.env.PROBE_LOG) p.on('console', (m) => console.log('[console]', m.type(), m.text().slice(0, 200)));
  await p.addInitScript((pf) => {
    try {
      sessionStorage.setItem('nickPopOff', '1');
      localStorage.setItem('kunlunWelcomed', String(Date.now()));
      localStorage.setItem('b612Scene2', '1');
      localStorage.setItem('b612Page1', '1');
      localStorage.setItem('b612PlanetChapter', '6');
      localStorage.setItem('b612Portfolio', JSON.stringify(pf));
    } catch (e) {}
  }, portfolio);
  await p.goto('http://localhost:' + PORT + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('#b612Gate', { timeout: 90000 });
  await p.click('#b612Gate .gEnter');
  await p.waitForFunction(() => !document.getElementById('b612Gate'), null, { timeout: 15000 });
  await p.waitForSelector('#b612film', { timeout: 20000 });
  await p.waitForTimeout(800);
  await p.click('#b612film #fSkip');
  await p.waitForFunction(() => !document.getElementById('b612film'), null, { timeout: 20000 });
  await p.waitForFunction(() => window.__ctx?.scene?.endingApi, null, { timeout: 60000 });
  // epilogue() resolves only when the whole sequence ends, so start it without awaiting.
  await p.evaluate(() => {
    setTimeout(() => window.__ctx.scene.endingApi.epilogue(), 50);
  });

  // Click through the captions until the question (choices) shows.
  let own = null;
  for (let i = 0; i < 60; i++) {
    await p.waitForTimeout(700);
    const st = await p.evaluate(() => ({
      choices: !!document.querySelector('#endStage .btns.on button'),
      own: document.querySelectorAll('#endStage .own svg').length,
      ownPaths: document.querySelectorAll('#endStage .own svg path').length,
      note: document.querySelector('#endStage .own-note')?.textContent || '',
    }));
    if (st.choices) {
      own = st;
      break;
    }
    await p.click('#endStage', { force: true }).catch(() => {});
  }
  check(label + ': reached the epilogue question', !!own);
  if (own) {
    await p.screenshot({ path: path.join(OUT, `ending-portfolio-${label}-question.png`) });
    if (portfolio.box && portfolio.box.strokes.length) {
      check(label + ': question shows the player box', own.own === 1 && own.ownPaths > portfolio.box.strokes.length - 1, own.note);
    } else {
      check(label + ': question shows no empty frame', own.own === 0 && own.note === '');
    }
  }
  // Answer, then click through to the final screen.
  await p.click('#endStage .btns.on button').catch(() => {});
  let fin = null;
  for (let i = 0; i < 80; i++) {
    await p.waitForTimeout(800);
    fin = await p.evaluate(() => ({
      end: !!document.querySelector('#endStage [data-e="portfolio"]'),
      thumbs: document.querySelectorAll('#endStage .pf-strip button svg').length,
    }));
    if (process.env.PROBE_LOG) console.log('  waiting final', i, JSON.stringify(await p.evaluate(() => ({ mode: document.querySelector('#endStage .txt')?.textContent?.slice(0, 40), cls: document.getElementById('endStage')?.className }))));
    if (fin.end) break;
    await p.click('#endStage', { force: true }).catch(() => {});
  }
  check(label + ': reached the final screen', !!(fin && fin.end));
  if (fin && fin.end) {
    await p.waitForTimeout(600);
    await p.screenshot({ path: path.join(OUT, `ending-portfolio-${label}-final.png`) });
    const want = Object.values(portfolio).filter((e) => e.strokes.length).length;
    check(label + ': keepsake thumbnails = drawings made', fin.thumbs === want, `${fin.thumbs}/${want}`);
  }
  check(label + ': no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await p.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const child = await start();
  const b = await launch(['--autoplay-policy=no-user-gesture-required']);
  try {
    const stroke = 'M10,10 Q40,5 80,30 L120,60';
    await run(b, 'with-drawings', {
      boa: { strokes: [stroke, stroke], at: 1 },
      box: { strokes: [stroke, 'M20,80 L120,80 L120,140 L20,140 Z'], at: 2 },
    });
    await run(b, 'no-drawings', {});
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
