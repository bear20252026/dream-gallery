// hill-ending-probe.cjs — after the story, the end screen leads to the faraway hill (public/hill/).
// Run: PW_BROWSER=chromium node scripts/probe/hill-ending-probe.cjs   (build the hill first:
//      cd hill-src && pnpm install && pnpm build)
// Checks:
//   - the final screen shows "Walk on to the faraway hill" first, with the hill note
//   - the button goes to /hill/?lang=<story language>
//   - the hill page starts (title card, its canvas) with no page errors and no requests off the site
// The local server serves the repo root, where the built hill lives in public/hill/; production serves
// dist/ (public/ copied to the root), so this probe answers /hill/* from public/hill/ itself.
const path = require('path'),
  fs = require('fs'),
  os = require('os'),
  { spawn } = require('child_process');
const { launch } = require('./browser.js');
const ROOT = path.join(__dirname, '..', '..'),
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hill-')),
  PORT = process.env.HILL_PORT || 3294,
  HILL = path.join(ROOT, 'public', 'hill'),
  OUT = path.join(ROOT, 'scripts', 'artifacts');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };

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

async function run(browser, lang) {
  const p = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [];
  const offsite = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.route('**/hill/**', (route) => {
    const u = new URL(route.request().url());
    let rel = decodeURIComponent(u.pathname.replace(/^\/hill\/?/, '')) || 'index.html';
    const file = path.join(HILL, rel);
    if (!file.startsWith(HILL) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    route.fulfill({ status: 200, body: fs.readFileSync(file), contentType: TYPES[path.extname(file)] || 'application/octet-stream' });
  });
  await p.addInitScript((lang) => {
    try {
      sessionStorage.setItem('nickPopOff', '1');
      localStorage.setItem('kunlunWelcomed', String(Date.now()));
      localStorage.setItem('b612Scene2', '1');
      localStorage.setItem('b612Page1', '1');
      localStorage.setItem('b612PlanetChapter', '6');
      if (lang === 'zh') localStorage.setItem('scriptLang', 'zh');
    } catch (e) {}
  }, lang);
  await p.goto('http://localhost:' + PORT + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('#b612Gate', { timeout: 90000 });
  await p.click('#b612Gate .gEnter');
  await p.waitForFunction(() => !document.getElementById('b612Gate'), null, { timeout: 15000 });
  await p.waitForSelector('#b612film', { timeout: 20000 });
  await p.waitForTimeout(800);
  await p.click('#b612film #fSkip');
  await p.waitForFunction(() => !document.getElementById('b612film'), null, { timeout: 20000 });
  await p.waitForFunction(() => window.__ctx?.scene?.endingApi, null, { timeout: 60000 });
  const storyLang = await p.evaluate(() => document.body.dataset.scriptLang || 'en');
  await p.evaluate(() => {
    setTimeout(() => window.__ctx.scene.endingApi.epilogue(), 50);
  });
  // Click through the captions (and the question) until the final screen shows.
  let fin = false;
  for (let i = 0; i < 120 && !fin; i++) {
    await p.waitForTimeout(700);
    fin = await p.evaluate(() => !!document.querySelector('#endStage [data-e="hill"]'));
    if (fin) break;
    const choice = await p.$('#endStage .btns.on button:not([data-e])');
    if (choice) await choice.click().catch(() => {});
    else await p.click('#endStage', { force: true }).catch(() => {});
  }
  check(lang + ': reached the final screen', fin);
  if (!fin) return p.close();
  await p.waitForTimeout(1200);
  const end = await p.evaluate(() => ({
    first: document.querySelector('#endStage .btns button')?.dataset.e,
    label: document.querySelector('#endStage [data-e="hill"]')?.textContent || '',
    note: [...document.querySelectorAll('#endStage .pf-note')].map((n) => n.textContent).join(' | '),
  }));
  await p.screenshot({ path: path.join(OUT, `hill-ending-${lang}-final.png`) });
  check(lang + ': the hill button comes first', end.first === 'hill', end.label);
  check(lang + ': the hill note is shown', /hill|山丘/.test(end.note), end.note.slice(0, 80));
  p.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('http://localhost:' + PORT + '/') && !u.startsWith('data:') && !u.startsWith('blob:')) offsite.push(u);
  });
  await p.click('#endStage [data-e="hill"]');
  await p.waitForURL(/\/hill\/\?lang=/, { timeout: 15000 });
  const want = storyLang === 'zh' ? 'zh' : 'en';
  check(lang + ': went to /hill/ with the story language', p.url().endsWith('/hill/?lang=' + want), p.url());
  await p.waitForSelector('.name-input', { state: 'visible', timeout: 90000 }).catch(() => {});
  await p.waitForTimeout(4000);
  const hill = await p.evaluate(() => ({
    title: !!document.querySelector('.screen-title.is-active'),
    solo: document.body.hasAttribute('data-solo'),
    account: getComputedStyle(document.querySelector('.account') || document.body).display,
    lang: document.documentElement.lang,
  }));
  // Software GL in CI renders the cloud sea slowly; a missing shot is not a failure.
  await p.screenshot({ path: path.join(OUT, `hill-ending-${lang}-hill.png`), timeout: 90000 }).catch(() => console.log('  (hill screenshot timed out)'));
  check(lang + ': the hill title card is up', hill.title, JSON.stringify(hill));
  check(lang + ': no sign-in or online parts on the hill', hill.solo && hill.account === 'none');
  check(lang + ': no requests off the site', offsite.length === 0, offsite.slice(0, 2).join(' | '));
  check(lang + ': no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await p.close();
}

(async () => {
  if (!fs.existsSync(path.join(HILL, 'index.html'))) {
    console.error('public/hill/ is not built: cd hill-src && pnpm install && pnpm build');
    process.exit(2);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const child = await start();
  const b = await launch(['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']);
  try {
    await run(b, 'en');
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
