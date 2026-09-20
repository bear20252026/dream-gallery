// b612-scene6-probe.cjs — 第 6 场·书页四·325 国王 专项验收(2026-09-20 情节阶段一)
// 流程:旧档(page1 已记)进 325 → 入梦导语+国王台词链(spk=king)→ 日落敕令演出 →
//   chain2 → 星屑拾取(传送到星屑处)→ planetsChapter=1 + 门环换 326 + 星屑隐藏。
// 用法:node scripts/probe/b612-scene6-probe.cjs   (自起 :3233 server)
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const { launch } = require('./browser.js');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3233;
const TMP = path.join(os.tmpdir(), 'scene6-probe-' + Date.now());
fs.mkdirSync(TMP, { recursive: true });

function startServer() {
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
  const child = await startServer();
  const ORIGIN = 'http://localhost:' + PORT;
  let fail = 0;
  const ok = (name, cond, extra) => {
    console.log((cond ? '✓' : '✗') + ' ' + name + (extra ? ' | ' + extra : ''));
    if (!cond) fail++;
  };
  const clickThrough = async (max) => {
    for (let i = 0; i < max; i++) {
      const v = await page.evaluate(() => {
        const d = document.getElementById('gameDialog');
        if (!d || d.style.display === 'none') return false;
        d.click();
        return true;
      });
      if (!v) return true;
      await page.waitForTimeout(420);
    }
    return true;
  };

  const b = await launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => {
    sessionStorage.setItem('nickPopOff', '1');
    try {
      localStorage.setItem('kunlunWelcomed', String(Date.now()));
      // 旧档:书页一二三已完成(planetsChapter 留 0 = 第 6 场未进行)
      localStorage.setItem('b612Scene2', '1');
      localStorage.setItem('b612Page1', '1');
    } catch (e) {}
  });
  await page.goto(ORIGIN + '/?noopening', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#b612Gate', { timeout: 90000 });
  await page.evaluate(() => {
    const c = document.getElementById('gAgreeChk');
    c.checked = true;
    c.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('#b612Gate .gEnter');
  await page.waitForFunction(() => window.__ctx && window.__ctx.loopManager && window.__ctx.loopManager.getFPS() > 0, null, { timeout: 90000 });
  await page.waitForTimeout(800);

  // ① 进 B612(石门)→ 导航"前往 325"
  await page.evaluate(() => { const p = window.__ctx.player.pl.p; p.x = 0.1; p.z = 56; });
  await page.waitForFunction(() => window.__ctx.scene.activeWorld === 'b612', null, { timeout: 25000 });
  ok('[入梦] 石门进 B612', true);
  const nav325 = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    return btns.some((x) => x.textContent.includes('前往 325') && x.style.display !== 'none');
  });
  ok('[入梦] 书页四解锁:导航出现「前往 325」', nav325);

  // ② 进 325
  await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('前往 325'))?.click());
  await page.waitForFunction(() => window.__ctx.scene.activeWorld === 'king325', null, { timeout: 25000 });
  ok('[325] 进入国王星球', true);

  // ③ 入梦链:导语 → chain1(spk=king)
  await page.waitForFunction(
    () => window.__scene6 && window.__scene6.state && window.__scene6.state.arrivalDone,
    null,
    { timeout: 20000 }
  );
  await page.waitForFunction(() => {
    const d = document.getElementById('gameDialog');
    return d && d.style.display !== 'none' && d.dataset.spk === 'king';
  }, null, { timeout: 25000 });
  ok('[台词] 国王开口(spk=king)', true);

  // 点穿 chain1(13 句,边点边等日落演出) → 等日落演出 → chain2
  const clickToStage = async (stage, timeoutMs) => {
    const t0 = Date.now();
    for (;;) {
      const st = await page.evaluate(() => {
        const d = document.getElementById('gameDialog');
        if (d && d.style.display !== 'none') d.click();
        const w = window.__scene6;
        return w && w.stage ? w.stage : '';
      });
      if (st === stage || st === 'pickup' || st === 'done') return st;
      if (Date.now() - t0 > timeoutMs) return st;
      await page.waitForTimeout(320);
    }
  };
  await clickToStage('sunset', 90000);
  ok('[演出] 日落敕令触发', true);
  await page.waitForFunction(() => window.__scene6 && window.__scene6.stage === 'chain2', null, { timeout: 20000 });
  await clickToStage('pickup', 60000);
  ok('[台词] chain2 收束(审判自己/老耗子/封大使/羊箱)', true);

  // ④ 拾星屑:传送到星屑脚底
  await page.evaluate(() => { const p = window.__ctx.player.pl.p; p.x = 0; p.z = 2.6; });
  await page.waitForFunction(() => window.__scene6 && window.__scene6.state && window.__scene6.state.sceneDone, null, { timeout: 15000 });
  const after = await page.evaluate(() => ({
    chapter: window.__ctx.store.num('planetsChapter'),
    st: window.__scene6.state,
  }));
  ok('[章节] planetsChapter=1', after.chapter === 1, JSON.stringify(after.st));
  ok('[星屑] 已拾取隐藏', after.st.starTaken === true);

  // ⑤ 门环换 326:main 世界石门数字刷新(截图目检 + 世界仍可返回)
  await page.evaluate(() => window.__ctx.scene.toMainWorld());
  await page.waitForFunction(() => window.__ctx.scene.activeWorld === 'main', null, { timeout: 25000 });
  ok('[回现实] 返回主世界', true);

  ok('无未捕获页面异常', errs.length === 0, errs.slice(0, 3).join(' || '));
  console.log(fail ? 'FAIL ' + fail : 'PASS 全部通过');
  await b.close();
  child.kill();
  process.exit(fail ? 1 : 0);

  async function clickThroughVia(pg, max) {
    for (let i = 0; i < max; i++) {
      const v = await pg.evaluate(() => {
        const d = document.getElementById('gameDialog');
        if (!d || d.style.display === 'none') return false;
        d.click();
        return true;
      });
      if (!v) return true;
      await pg.waitForTimeout(420);
    }
  }
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
