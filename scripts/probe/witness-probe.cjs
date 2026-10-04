// witness-probe.cjs — witness cards for the 325 / 326 / 327 memories (2026-10-04).
// Run: PW_BROWSER=chromium node scripts/probe/witness-probe.cjs   (starts its own local server)
// Part A checks the card UI on its own (choice / clap / count, skip, language, dialogue hiding, saving).
// Part B enters the real 326 scene and checks the clap card appears after the dialogue and the chain continues;
//   the real 327 scene (bottle count), then the real 325 scene resumed at its last step and checks the choice card appears before the stardust pickup.
// Worlds are entered with worldManager.enter(), not through the stone gate, so no gate models are needed.
const path = require('path'),
  fs = require('fs'),
  os = require('os'),
  { spawn } = require('child_process');
const { launch } = require('./browser.js');
const ROOT = path.join(__dirname, '..', '..'),
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'witness-')),
  PORT = process.env.WITNESS_PORT || 3296,
  OUT = path.join(ROOT, 'scripts', 'artifacts');

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

async function boot(browser, presets) {
  const p = await browser.newPage({ viewport: { width: 640, height: 400 } });
  p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));
  await p.addInitScript((pre) => {
    try {
      sessionStorage.setItem('nickPopOff', '1');
      sessionStorage.setItem('dialogVoiceOff', '1');
      localStorage.setItem('kunlunWelcomed', String(Date.now()));
      localStorage.setItem('b612Scene2', '1');
      localStorage.setItem('b612Page1', '1');
      for (const k in pre) localStorage.setItem(k, pre[k]);
    } catch (e) {}
  }, presets);
  await p.goto('http://localhost:' + PORT + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('#b612Gate', { timeout: 90000 });
  await p.click('#b612Gate .gEnter');
  await p.waitForSelector('#b612film', { timeout: 20000 });
  await p.waitForTimeout(800);
  await p.click('#b612film #fSkip');
  await p.waitForFunction(() => !document.getElementById('b612film'), null, { timeout: 20000 });
  await p.waitForFunction(() => window.__ctx?.ui?.witness && window.__ctx.scene.worldManager, null, { timeout: 60000 });
  // Like a player, answer the "say something" choices that other scenes may raise.
  await p.evaluate(() => {
    setInterval(() => {
      const b = document.querySelector('.gs-choice');
      if (b && b.offsetParent) b.click();
      // The boot state offers the next voyage card; "Stay a little longer" keeps it out of the way.
      const stay = document.querySelector('#voyage .vy-stay');
      if (stay) stay.click();
    }, 700);
  });
  return p;
}
// The opening dialogues hide the card (by design). Advance them with E, like a player, until none is open.
async function clearDialogs(p) {
  for (let i = 0; i < 150; i++) {
    const open = await p.evaluate(() => document.body.hasAttribute('data-dialog-open'));
    if (!open) {
      await p.waitForTimeout(600);
      if (!(await p.evaluate(() => document.body.hasAttribute('data-dialog-open')))) return;
    }
    await p.keyboard.press('e');
    await p.waitForTimeout(400);
  }
}
// Press E (Continue) like a player until the page-side condition holds or the time runs out.
async function pressUntil(p, fn, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await p.evaluate(fn)) return true;
    await p.keyboard.press('e');
    await p.waitForTimeout(600);
  }
  return p.evaluate(fn);
}
const visible = (p) =>
  p.evaluate(() => {
    const el = document.getElementById('witnessCard');
    return !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
  });

async function partA(browser) {
  const p = await boot(browser, {});
  await clearDialogs(p);
  // choice
  await p.evaluate(() => { window.__r = null; window.__ctx.ui.witness.ask('king325').then((r) => (window.__r = r)); });
  await p.waitForSelector('#witnessCard button[data-value]');
  check(
    'A choice: compass and lesson card step aside while it is open',
    await p.evaluate(() =>
      ['storyCompass', 'ctlLesson', 'j'].every((id) => {
        const el = document.getElementById(id);
        return !el || getComputedStyle(el).visibility === 'hidden';
      })
    )
  );
  check('A choice: shows three options and a skip', (await p.locator('#witnessCard button[data-value]').count()) === 3 && (await p.locator('#witnessCard .wc-skip').count()) === 1);
  await p.screenshot({ path: path.join(OUT, 'witness-choice.png') });
  await p.evaluate(async () => (await import('/src/ui/lang-toggle.js')).toggleLang());
  check('A choice: re-renders in Chinese on language change', /立刻照办/.test(await p.locator('#witnessCard').innerText()));
  await p.evaluate(async () => (await import('/src/ui/lang-toggle.js')).toggleLang());
  await p.evaluate(() => document.body.setAttribute('data-dialog-open', '1'));
  check('A choice: hidden while a dialogue is open', !(await visible(p)));
  await p.evaluate(() => document.body.removeAttribute('data-dialog-open'));
  await p.click('#witnessCard button[data-value="ask"]');
  await p.waitForFunction(() => window.__r);
  const r1 = await p.evaluate(() => window.__r);
  check('A choice: resolves with the picked value', r1.skipped === false && r1.value === 'ask');
  await p.waitForFunction(() => getComputedStyle(document.getElementById('witnessCard')).display === 'none', null, { timeout: 4000 });
  // clap
  await p.evaluate(() => { window.__r = null; window.__ctx.ui.witness.ask('vain326').then((r) => (window.__r = r)); });
  await p.waitForSelector('#witnessCard .wc-tap');
  const target = await p.locator('#witnessCard .wc-meter i').count();
  for (let i = 0; i < target; i++) await p.click('#witnessCard .wc-tap');
  await p.waitForFunction(() => window.__r);
  const r2 = await p.evaluate(() => window.__r);
  check('A clap: needs exactly the full meter, then resolves', r2.skipped === false && r2.taps === target, 'target=' + target);
  await p.waitForFunction(() => getComputedStyle(document.getElementById('witnessCard')).display === 'none', null, { timeout: 4000 });
  // count + skip leaves the earlier answers alone
  await p.evaluate(() => { window.__r = null; window.__ctx.ui.witness.ask('tippler327', { target: 3 }).then((r) => (window.__r = r)); });
  await p.waitForSelector('#witnessCard .wc-tap');
  await p.click('#witnessCard .wc-tap');
  await p.click('#witnessCard .wc-skip');
  await p.waitForFunction(() => window.__r);
  const r3 = await p.evaluate(() => window.__r);
  const saved = await p.evaluate(() => window.__ctx.store.json('witness', {}));
  check('A count: skipping resolves skipped and saves nothing for it', r3.skipped === true && !saved.tippler327);
  check('A saved: earlier answers kept', saved.king325?.value === 'ask' && saved.vain326?.taps === target, JSON.stringify(saved));
  // a world change cancels an open card
  await p.evaluate(() => { window.__r = null; window.__ctx.ui.witness.ask('king325').then((r) => (window.__r = r)); });
  await p.waitForSelector('#witnessCard button[data-value]');
  await p.evaluate(() => window.__ctx.events.emit('world:changed', { from: 'king325', to: 'b612' }));
  await p.waitForFunction(() => window.__r);
  check('A world change: open card is cancelled as skipped', (await p.evaluate(() => window.__r)).skipped === true && !(await visible(p)));
  await p.close();
}

async function partB326(browser) {
  const p = await boot(browser, { b612PlanetChapter: '1' });
  await p.evaluate(() => { window.__enter = window.__ctx.scene.worldManager.enter('king326'); });
  await p.waitForFunction(() => window.__ctx.scene.activeWorld === 'king326', null, { timeout: 30000 });
  check('B326: entered king326', true);
  const sawClap = await pressUntil(p, () => window.__scene7a?.stage === 'clap' || window.__scene7a?.stage === 'chainB', 120000);
  check('B326: dialogue chain reached the clap moment', sawClap, 'stage=' + (await p.evaluate(() => window.__scene7a?.stage)));
  if (sawClap) {
    await p.waitForSelector('#witnessCard .wc-tap', { timeout: 8000 }).catch(() => {});
    const shown = await p.locator('#witnessCard .wc-tap').count();
    check('B326: clap card shown after the Vain Man asks for applause', shown === 1);
    await p.screenshot({ path: path.join(OUT, 'witness-326.png') });
    const before = await p.evaluate(() => window.__scene7a.stage);
    check('B326: chain waits for the card (still on clap)', before === 'clap', 'stage=' + before);
    await p.click('#witnessCard .wc-skip');
    const cont = await pressUntil(p, () => ['chainB', 'pickup'].includes(window.__scene7a?.stage), 15000);
    check('B326: skipping continues into the hat lines', cont);
    const pick = await pressUntil(p, () => !!window.__scene7a?.state?.pickupArmed, 120000);
    check('B326: chain still reaches the stardust pickup', pick);
  }
  await p.close();
}

async function partB327(browser) {
  const p = await boot(browser, { b612PlanetChapter: '2' });
  await p.evaluate(() => { window.__enter = window.__ctx.scene.worldManager.enter('king327'); });
  await p.waitForFunction(() => window.__ctx.scene.activeWorld === 'king327', null, { timeout: 30000 });
  check('B327: entered king327', true);
  const got = await pressUntil(p, () => window.__scene7b?.stage === 'witness', 180000);
  check('B327: dialogue chain reached the bottle count', got, 'stage=' + (await p.evaluate(() => window.__scene7b?.stage)));
  if (got) {
    await p.waitForSelector('#witnessCard .wc-tap', { timeout: 8000 }).catch(() => {});
    check('B327: count card shows three marks', (await p.locator('#witnessCard .wc-meter i').count()) === 3);
    await p.screenshot({ path: path.join(OUT, 'witness-327.png') });
    check('B327: pickup waits for the card', !(await p.evaluate(() => window.__scene7b.state.pickupArmed)));
    for (let i = 0; i < 3; i++) await p.click('#witnessCard .wc-tap');
    const armed = await p.waitForFunction(() => window.__scene7b.state.pickupArmed, null, { timeout: 8000 }).then(() => true, () => false);
    check('B327: finishing the count arms the pickup', armed);
    const saved = await p.evaluate(() => window.__ctx.store.json('witness', {}));
    check('B327: count saved', saved.tippler327?.taps === 3, JSON.stringify(saved));
  }
  await p.close();
}

async function partB325(browser) {
  const p = await boot(browser, { b612KingMemoryStep: '5', b612PlanetChapter: '0' });
  await p.evaluate(() => { window.__enter = window.__ctx.scene.worldManager.enter('king325'); });
  await p.waitForFunction(() => window.__ctx.scene.activeWorld === 'king325', null, { timeout: 30000 });
  check('B325: entered king325', true);
  // The resume transition card may ask the player to press a button.
  const seen = await p
    .waitForFunction(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /Resume the visit|Begin the visit|继续|开始拜访|从上次/.test(x.textContent) && x.offsetParent);
      if (b && !document.querySelector('#witnessCard button[data-value]')) b.click();
      return window.__scene6?.state?.stage === 'witness' || window.__scene6?.stage === 'witness';
    }, null, { timeout: 60000, polling: 700 })
    .then(() => true, () => false);
  check('B325: last step shows the choice card before the pickup', seen && (await p.locator('#witnessCard button[data-value]').count()) === 3, 'stage=' + (await p.evaluate(() => window.__scene6?.stage)));
  if (seen) {
    check('B325: pickup is not armed until the card is answered', !(await p.evaluate(() => window.__scene6.state.pickupArmed)));
    await p.screenshot({ path: path.join(OUT, 'witness-325.png') });
    await p.click('#witnessCard button[data-value="refuse"]');
    const armed = await p.waitForFunction(() => window.__scene6.state.pickupArmed, null, { timeout: 8000 }).then(() => true, () => false);
    check('B325: answering arms the stardust pickup', armed);
    const saved = await p.evaluate(() => window.__ctx.store.json('witness', {}));
    check('B325: answer saved', saved.king325?.value === 'refuse', JSON.stringify(saved));
  }
  await p.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const child = await start();
  const b = await launch(['--autoplay-policy=no-user-gesture-required']);
  try {
    await partA(b);
    await partB326(b);
    await partB327(b);
    await partB325(b);
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
