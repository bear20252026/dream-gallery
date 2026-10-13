#!/usr/bin/env node
// chapter-map-undo-probe.cjs — 存档码「导入前快照 + 撤销上一次载入」的站点级验证(2026-10-14 第五轮审计 G)
// 为什么要有它:这条功能直接动玩家的存档(localStorage),而且带一个"再点一次就覆盖进度"的按钮;
// 纯逻辑单测(chapter-map-logic.test.js)钉得住钳位与快照内容,钉不住**接线**(按钮出没出现、
// 两步确认有没有走通、reload 之后快照还在不在)。存档搞坏是没有第二次机会的那类错误。
// 用法:node scripts/probe/chapter-map-undo-probe.cjs          (自起临时服务器 + 一次性数据文件)
//      BASE_URL=https://cloudbear.cloud KEEP_PROFILE=1 node ...(直测线上;会真的写那个浏览器的档)
// 退出码:0 全绿 / 1 有失败 / 2 前置条件不满足(没 dist、起不了服、缺浏览器)
const path = require('path'),
  fs = require('fs'),
  os = require('os');
const { spawn } = require('child_process');
const { launch } = require('./browser.js');
const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.UNDO_PROBE_PORT || 3288);
const ORIGIN = process.env.BASE_URL || 'http://127.0.0.1:' + PORT;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'chmapundo-'));

// 一份"玩家已有的进度":两个字段都能从码里读出、也都能被撤销复原
const MINE = { scene2: 1, page1: 1, planetsChapter: 2, endingAnswer: 'mine', homeMemoryStep: 5 };
// 一份故意要导进去的"陌生进度":章节号与答案都被改掉,撤销必须把它俩还原
const THEIRS = { planetsChapter: 0, endingAnswer: '', homeMemoryStep: 1 };
const CODE_PREFIX = 'B612-1-';
const theirCode = CODE_PREFIX + Buffer.from(JSON.stringify(THEIRS)).toString('base64');

function log(...a) {
  console.log(...a);
}
function die2(msg) {
  console.log('❌ ' + msg);
  process.exit(2);
}
if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) die2('没有 dist/index.html —— 先 npm run build');
if (!process.env.BASE_URL && !fs.existsSync(path.join(ROOT, 'server.js'))) die2('没有 server.js');

let server = null;
function startServer() {
  return new Promise((resolve, reject) => {
    const c = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        HOST: '127.0.0.1',
        GATE_DATA_FILE: path.join(TMP, 'gate_data.json'),
        SQLITE_PATH: path.join(TMP, 'gate_data.db'),
        USE_SQLITE: '0',
        RETENTION_DISABLED: '1',
        R2_OUTBOX_DISABLE: '1',
        NODE_ENV: '',
        MULTI: 'off',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    c.stdout.on('data', (d) => {
      out += d.toString();
      if (/服务器已启动|listening/i.test(out)) resolve(c);
    });
    c.stderr.on('data', (d) => {
      out += d.toString();
    });
    c.on('exit', (code) => reject(new Error('服务器提前退出 code=' + code + '\n' + out.slice(-500))));
    setTimeout(() => reject(new Error('服务器起不来(端口 ' + PORT + ' 被占?)\n' + out.slice(-500))), 25000);
  });
}
function cleanup() {
  try {
    if (server) server.kill('SIGTERM');
  } catch (e) {}
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch (e) {}
}
process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});

// 进世界的固定前戏:闸门 ENTER →(没有电影,?noopening)→ 点掉性别弹层与回访台词
// ⇒ 判"世界接棒"用 预加载 done ∧ 主画布显形,不用第一帧 FPS(headless 无 GPU,着色器编译 15-45s)
async function bootToWorld(page) {
  await page.goto(ORIGIN + '/?noopening', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#b612Gate', { timeout: 90000 });
  await page.evaluate(() => {
    const c = document.getElementById('gAgreeChk') || document.createElement('input');
    c.checked = true;
    c.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('#b612Gate .gEnter');
  await page.waitForFunction(
    () =>
      window.__preloadState &&
      window.__preloadState() === 'done' &&
      (document.getElementById('c') || { style: {} }).style.visibility === 'visible',
    null,
    { timeout: 120000 }
  );
  await page.click('#genderOv button').catch(() => {});
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 20; i++) {
      if (!window.__ctx.ui.dialogOpen || !window.__ctx.ui.dialogOpen()) break;
      const d = document.getElementById('gameDialog');
      if (!d) break;
      (d.querySelector('.gs-next') || d).click();
      await sleep(200);
    }
  });
}
const readBack = (page) =>
  page.evaluate(() => ({
    chapter: window.__ctx.store.num('planetsChapter'),
    answer: window.__ctx.store.str('endingAnswer'),
    step: window.__ctx.store.num('homeMemoryStep'),
    backup: JSON.stringify(window.__ctx.store.json('saveBackup', null)),
  }));

(async () => {
  if (!process.env.BASE_URL) server = await startServer();
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript((mine) => {
    sessionStorage.setItem('nickPopOff', '1');
    // ⚠️ addInitScript 在**每次文档加载前**都会跑一遍 —— 不挡一下就会在导入后的那次 reload 里
    //    把"玩家原有进度"重新写回去,于是"导入没生效""撤销成功"两边都是假的(2026-10-14 就这么被骗过一次)。
    //    用 sessionStorage 做一次性闸门:同一个标签页内的 reload 只播一次种。
    if (sessionStorage.getItem('chmapUndoSeeded') === '1') return;
    try {
      localStorage.setItem('kunlunWelcomed', String(Date.now()));
      localStorage.setItem('scriptLang', 'zh'); // 按钮文案按中文找,语言得钉住
      localStorage.setItem('b612Scene2', String(mine.scene2));
      localStorage.setItem('b612Page1', String(mine.page1));
      localStorage.setItem('b612PlanetChapter', String(mine.planetsChapter));
      localStorage.setItem('b612EndingAnswer', mine.endingAnswer);
      localStorage.setItem('b612HomeMemoryStep', String(mine.homeMemoryStep));
      sessionStorage.setItem('chmapUndoSeeded', '1');
    } catch (e) {}
  }, MINE);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message || e).slice(0, 180)));
  let fail = 0;
  const ok = (name, cond, extra) => {
    if (cond) {
      pass++;
      log('  ✓ ' + name + (extra ? ' | ' + extra : ''));
    } else {
      fail++;
      log('  ✗ ' + name + (extra ? ' | ' + extra : ''));
    }
  };
  let pass = 0;

  await bootToWorld(page);
  const before = await readBack(page);
  ok(
    '进世界时玩家进度就位',
    before.chapter === MINE.planetsChapter && before.answer === MINE.endingAnswer,
    JSON.stringify(before)
  );
  ok('没导入过 ⇒ 不该有备份', before.backup === 'null', before.backup);

  // ① 打开章节地图 → 粘贴存档码 → 两步确认 → 载入
  await page.evaluate(() => window.__ctx.ui.chapterMap.open());
  await page.waitForSelector('button[data-save="load"]', { timeout: 15000 });
  await page.click('button[data-save="load"]');
  await page.evaluate(
    (code) => {
      const box = [...document.querySelectorAll('textarea')].find((t) => t.style.display !== 'none');
      box.value = code;
    },
    theirCode
  );
  const applySel = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((x) => /载入这份存档|确定,载入/.test(x.textContent));
    if (!btn) return null;
    btn.dataset.probeApply = '1';
    return btn.textContent;
  });
  ok('载入按钮在位', !!applySel, String(applySel));
  await page.click('button[data-probe-apply="1"]'); // 第一次:只武装,不写档
  const armedOnly = await readBack(page);
  ok(
    '第一次点击不改存档(页内二次确认必须是真的)',
    armedOnly.chapter === MINE.planetsChapter && armedOnly.backup === 'null',
    JSON.stringify(armedOnly)
  );
  await page.click('button[data-probe-apply="1"]'); // 第二次:拍快照 + 落盘 + reload
  await page.waitForLoadState('domcontentloaded', { timeout: 60000 });
  await bootToWorld(page);
  const imported = await readBack(page);
  ok(
    '导入生效(章节号与答案变成那份存档码的内容)',
    imported.chapter === THEIRS.planetsChapter && imported.answer === THEIRS.endingAnswer,
    JSON.stringify(imported)
  );
  const bk = JSON.parse(imported.backup || 'null');
  ok(
    '载入前的快照已落盘,且存的是字段值而不是码',
    !!(bk && bk.data && bk.data.planetsChapter === MINE.planetsChapter && bk.data.endingAnswer === MINE.endingAnswer),
    imported.backup
  );

  // ② 撤销:地图上应出现「撤销上一次载入」,两步确认后回到导入前
  await page.evaluate(() => window.__ctx.ui.chapterMap.open());
  await page.waitForSelector('button[data-save="undo"]', { timeout: 15000 });
  const undoLabel = await page.textContent('button[data-save="undo"]');
  ok('撤销按钮出现了', !!undoLabel, String(undoLabel).trim());
  await page.click('button[data-save="undo"]');
  await page.waitForTimeout(600);
  const undoStill = await readBack(page);
  ok(
    '撤销的第一击也只武装、不改档',
    undoStill.chapter === THEIRS.planetsChapter,
    JSON.stringify(undoStill)
  );
  await page.click('button[data-save="undo"]');
  await page.waitForLoadState('domcontentloaded', { timeout: 60000 });
  await bootToWorld(page);
  const undone = await readBack(page);
  ok(
    '撤销把进度还原成导入前(不是钳位后的近似值)',
    undone.chapter === MINE.planetsChapter &&
      undone.answer === MINE.endingAnswer &&
      undone.step === MINE.homeMemoryStep,
    JSON.stringify(undone)
  );
  ok('撤销是一次性的:用完即清', undone.backup === 'null', undone.backup);

  // ③ 超长存档码必须在**解码之前**就被拒(不卡主线程,也不写任何档)
  await page.evaluate(() => window.__ctx.ui.chapterMap.open());
  await page.click('button[data-save="load"]');
  await page.evaluate(() => {
    const box = [...document.querySelectorAll('textarea')].find((t) => t.style.display !== 'none');
    box.value = 'B612-1-' + 'A'.repeat(400000); // 40 万字符的假码
  });
  const t0 = Date.now();
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((x) => /载入这份存档/.test(x.textContent));
    btn.click();
  });
  const badMsg = await page.textContent('.cm-msg');
  const spent = Date.now() - t0;
  ok('超长码被判为坏码', /读不出来/.test(badMsg || ''), (badMsg || '').trim() + ' / ' + spent + 'ms');
  ok('超长码没有把主线程吃掉(<1500ms)', spent < 1500, spent + 'ms');
  const afterBad = await readBack(page);
  ok('坏码不改档、也不写快照', afterBad.backup === 'null', afterBad.backup);

  ok('零未捕获页面异常', errs.length === 0, errs.slice(0, 3).join(' | '));
  log('\n=== 存档码快照/撤销验收:' + pass + ' 通过 / ' + fail + ' 失败 ===');
  await b.close();
  cleanup();
  process.exit(fail ? 1 : 0);
})()
  .catch((e) => {
    log('探针异常:' + (e && e.stack) || e);
    cleanup();
    process.exit(2);
  });
