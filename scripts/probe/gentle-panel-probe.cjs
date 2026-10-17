// gentle-panel-probe.cjs — 温柔度面板(#gtP)接线的实机验收(2026-10-16)
//
// 这块 UI 从 2026-07-28 基线起是死的(index.html 写裸全局名、实现只经 expose() 落了 `__` 前缀,
// 且全仓没有一处给它加过 `.show`),所以**这道探针是它第一次被真浏览器跑到**。
// 断言分三组:
//  ① 接线本身:菜单条目可见可点 → #gtP display:flex + .show + 面积非 0(旧现场是 display:none、rect 0×0);
//     五题真点通 → 结果页 / 判词 / store 落库 {at,score,pct,answers};✕ 与 Esc 两条关闭路;重开回到封面。
//  ② 搁置令仍在:第二遍不带 ?legacy=1 ⇒ 服务不存在、菜单条目不显示、面板本体 display:none。
//  ③ 零未捕获异常单独计数(与本机缺媒体/贴图的 404 分开 —— 判据混类就会自己造红,AGENTS 已记过)。
//
// 用法:
//   自起隔离服(默认):PW_BROWSER=chromium node scripts/probe/gentle-panel-probe.cjs
//     端口 GENTLE_PORT(默认 3318);数据根落系统临时目录(probe-isolation-guard 的规矩)。
//   直测线上/既有服:  BASE_URL=https://cloudbear.cloud node scripts/probe/gentle-panel-probe.cjs
//     ⚠️线上按"只读"纪律跑:只点菜单与面板内的按钮,写的全是**浏览器自己的 localStorage**
//     (gentleTest 键不落服务端),不发任何写请求、不切世界、不碰后台。
// 退出码:0 = 全绿;1 = 有断言红;2 = 崩(两种失败分开,别把崩读成红)。
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { launch } = require('./browser.js');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.GENTLE_PORT || 3318);
const REMOTE = process.env.BASE_URL || process.env.PROBE_URL || '';
const BASE = REMOTE || 'http://127.0.0.1:' + PORT;
const DATA = path.join(os.tmpdir(), 'dg-gentle-probe', 'gate_data.json');
const WAIT = Number(process.env.PROBE_WAIT_MS || 0); // 线上跨域慢,加大启动等待

let fail = 0;
let ran = 0;
const ok = (name, cond, extra) => {
  ran++;
  console.log((cond ? '✓' : '✗') + ' ' + name + (extra === undefined ? '' : '  → ' + extra));
  if (!cond) fail++;
};

function resetDataDir() {
  fs.rmSync(path.dirname(DATA), { recursive: true, force: true });
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
}

async function enterWorld(page, label) {
  await page.waitForSelector('#b612Gate', { timeout: 120000 + WAIT });
  await page.evaluate(() => document.querySelector('#b612Gate .gEnter').click());
  // 判据取"世界接棒"而不是 FPS>0 的秒级值:无 GPU 时全站着色器编译 16-40s(AGENTS 已记)
  await page.waitForFunction(
    () =>
      window.__ctx &&
      window.__ctx.loopManager &&
      window.__ctx.loopManager.getFPS &&
      window.__ctx.loopManager.getFPS() > 0,
    null,
    { timeout: 150000 + WAIT }
  );
  await page.waitForTimeout(3000 + WAIT);
  console.log('[参考] 已入世:' + label);
}

(async () => {
  let srv = null;
  const srvErr = [];
  if (!REMOTE) {
    resetDataDir();
    srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
      cwd: ROOT,
      env: Object.assign({}, process.env, { PORT: String(PORT), GATE_DATA_FILE: DATA }),
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    srv.stderr.on('data', (d) => srvErr.push(String(d)));
    for (let i = 0; i < 80; i++) {
      const up = await fetch(BASE + '/healthz')
        .then((r) => r.ok)
        .catch(() => false);
      if (up) break;
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const b = await launch(['--use-gl=swiftshader', '--enable-unsafe-swiftshader']);

  // ============ 第一遍:?legacy=1(旧玩法开) ============
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const pageerrs = [];
  const consoleErrs = [];
  const http4xx = [];
  page.on('pageerror', (e) => {
    const m = String(e);
    if (m.includes('beacon') || m.includes('cloudflareinsights')) return; // CF 统计脚本被 CSP 拦属预期
    pageerrs.push(m.slice(0, 200));
  });
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 160));
  });
  page.on('response', (r) => {
    if (r.status() >= 400) http4xx.push(r.status() + ' ' + r.url().slice(-70));
  });

  await page.addInitScript(() => {
    try {
      localStorage.setItem('scriptLang', 'zh');
      localStorage.setItem('kunlunWelcomed', String(Date.now()));
    } catch (e) {}
  });
  await page.goto(BASE + '/?legacy=1&noopening', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await enterWorld(page, 'legacy=1');

  const shape = await page.evaluate(() => {
    const g = window.__ctx && window.__ctx.ui && window.__ctx.ui.gentleTest;
    return {
      on: !!g,
      members: g ? Object.keys(g).sort() : [],
      types: g ? [typeof g.open, typeof g.close, typeof g.isOpen] : [],
    };
  });
  ok('ctx.ui.gentleTest 已装配', shape.on, JSON.stringify(shape.members));
  ok(
    '门面三件齐(open/close/isOpen)',
    JSON.stringify(shape.members) === '["close","isOpen","open"]'
  );
  ok(
    '三件都是函数',
    shape.types.every((t) => t === 'function'),
    shape.types.join(',')
  );

  await page.evaluate(() => document.getElementById('gsMenuBtn').click());
  await page.waitForTimeout(400);
  const menuState = await page.evaluate(() => {
    const btn = document.querySelector('#gameMenu [data-act="gentle"]');
    return {
      exists: !!btn,
      label: btn ? btn.textContent : null,
      shown: btn ? getComputedStyle(btn).display !== 'none' : false,
    };
  });
  ok('菜单里有温柔度条目', menuState.exists && menuState.shown, JSON.stringify(menuState));
  await page.evaluate(() => document.querySelector('#gameMenu [data-act="gentle"]').click());
  await page.waitForTimeout(700); // opacity 过渡 0.5s

  const opened = await page.evaluate(() => {
    const p = document.getElementById('gtP');
    const cs = getComputedStyle(p);
    const rect = p.getBoundingClientRect();
    return {
      display: cs.display,
      opacity: cs.opacity,
      hasShow: p.classList.contains('show'),
      area: Math.round(rect.width * rect.height),
      isOpen: window.__ctx.ui.gentleTest.isOpen(),
      startVisible: getComputedStyle(document.getElementById('gtStart')).display,
      quizVisible: getComputedStyle(document.getElementById('gtQuiz')).display,
    };
  });
  ok('#gtP 计算样式 display:flex', opened.display === 'flex', opened.display);
  ok('#gtP 已加 .show 且不透明', opened.hasShow && Number(opened.opacity) > 0.9, opened.opacity);
  ok('#gtP 占住面积(不是 0×0)', opened.area > 100000, opened.area);
  ok('isOpen() 与现场一致', opened.isOpen === true);
  ok(
    '首屏是封面(不是直接跳题目)',
    opened.startVisible === 'block' && opened.quizVisible === 'none'
  );

  await page.evaluate(() => document.getElementById('gtStartBtn').click());
  await page.waitForTimeout(150);
  const first = await page.evaluate(() => ({
    opts: [...document.querySelectorAll('#gtQD .gtO')].length,
    label: (document.querySelector('#gtQD .gtQL') || {}).textContent,
    nextHidden: getComputedStyle(document.getElementById('gtNext')).display === 'none',
  }));
  ok('题目渲染出四个选项', first.opts === 4, first.label);
  ok('未选时「下一题」不出现', first.nextHidden);

  const trace = [];
  for (let qi = 0; qi < 5; qi++) {
    const step = await page.evaluate(() => {
      const before = [...document.querySelectorAll('#gtQD .gtO')];
      if (!before.length) return { err: '没有选项按钮' };
      const label = (document.querySelector('#gtQD .gtQL') || {}).textContent;
      before[0].click(); // 选 A ⇒ renderQuestion() 会**重建这批节点**,选中态必须重查
      const after = [...document.querySelectorAll('#gtQD .gtO')];
      const sel = after.filter((x) => x.classList.contains('sel')).length;
      const next = document.getElementById('gtNext');
      const nextShown = getComputedStyle(next).display !== 'none';
      next.click();
      return {
        sel,
        after: after.length,
        nextShown,
        prog: document.getElementById('gtProgF').style.width,
        label,
      };
    });
    trace.push(step);
    await page.waitForTimeout(150);
  }
  ok(
    '五题各选中一项(重查渲染出的 .sel)',
    trace.every((t) => t.sel === 1 && t.after === 4 && t.nextShown),
    JSON.stringify(trace.map((t) => t.sel))
  );
  // prog 是在 next.click() 之后读的 ⇒ 读到的是下一题的百分比(第 5 题进结果页,进度条不再动)
  ok(
    '进度条按题推进 20→80%',
    JSON.stringify(trace.map((t) => t.prog)) ===
      JSON.stringify(['20%', '40%', '60%', '80%', '80%']),
    trace.map((t) => t.prog).join(' ')
  );

  const t0 = Date.now();
  let scoreText = '';
  for (let i = 0; i < 80; i++) {
    scoreText = await page.evaluate(() => document.getElementById('gtScore').textContent);
    if (scoreText === '100') break;
    await page.waitForTimeout(100);
  }
  const animMs = Date.now() - t0;
  const res = await page.evaluate(() => ({
    resultShown: getComputedStyle(document.getElementById('gtResult')).display === 'block',
    title: document.getElementById('gtRT').textContent,
    mark: document.getElementById('gtRH').textContent,
    raw: localStorage.getItem('b612GentleTest'),
  }));
  ok('结果页出现', res.resultShown);
  ok('全选 A 最终数到 100', scoreText === '100', scoreText + ' / 用时 ' + animMs + 'ms');
  ok('计数动画按墙钟收敛(旧写法实测 21090ms 才数完)', animMs < 8000, animMs + 'ms');
  ok('判词取最高档', res.title === '你是温柔本身', res.title + ' ' + res.mark);
  let rec = null;
  try {
    rec = JSON.parse(res.raw);
  } catch (e) {}
  ok(
    '落库形状正确 {at,score,pct,answers}',
    !!rec && rec.pct === 100 && rec.score === 100 && rec.answers.join() === '0,0,0,0,0',
    res.raw
  );

  await page.evaluate(() => document.querySelector('#gtP .gtClose').click());
  await page.waitForTimeout(300);
  const byX = await page.evaluate(() => ({
    display: getComputedStyle(document.getElementById('gtP')).display,
    hasShow: document.getElementById('gtP').classList.contains('show'),
    isOpen: window.__ctx.ui.gentleTest.isOpen(),
  }));
  ok('点 ✕ 关得掉(overlay 委托)', byX.display === 'none' && !byX.hasShow && !byX.isOpen);

  await page.evaluate(() => window.__ctx.ui.gentleTest.open());
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const byEsc = await page.evaluate(() => ({
    display: getComputedStyle(document.getElementById('gtP')).display,
    isOpen: window.__ctx.ui.gentleTest.isOpen(),
  }));
  ok('Esc 也关得掉(弹层栈)', byEsc.display === 'none' && !byEsc.isOpen);

  await page.evaluate(() => window.__ctx.ui.gentleTest.open());
  await page.waitForTimeout(200);
  const reopen = await page.evaluate(() => ({
    start: getComputedStyle(document.getElementById('gtStart')).display,
    result: getComputedStyle(document.getElementById('gtResult')).display,
  }));
  ok('重开回到封面(不带上一次的选择)', reopen.start === 'block' && reopen.result === 'none');
  await page.evaluate(() => window.__ctx.ui.gentleTest.close());

  // ============ 第 1.5 遍:3D 墙面那半张面板(同一份题表,改过取数与落库) ============
  // ⚠️这里直接喂 mesh.userData.handleClick(uv),**不是** paintings.js 的射线拾取那条路;
  // 走的是同一个 handleClick 与同一份 GENTLE_QUESTIONS,但"墙能点中"这件事它证明不了。
  // 归属靠答案区分:这条全选 D = 25,上面 DOM 那条全选 A = 100 ⇒ 记录只可能来自墙面。
  await page.evaluate(() => {
    try {
      localStorage.removeItem('b612GentleTest');
    } catch (e) {}
  });
  const wall = await page.evaluate(() => {
    const list = (window.__ctx.scene && window.__ctx.scene.iG) || [];
    const mesh = list.find((o) => o.userData && o.userData.isWallQuiz);
    if (!mesh || typeof mesh.userData.handleClick !== 'function') return { found: false };
    const W = 1024;
    const H = 1536;
    const uv = (px, py) => ({ x: px / W, y: 1 - py / H });
    const h = mesh.userData.handleClick;
    h(uv(512, 1020)); // 标题页「点击开始」(260..764 × 960..1080)
    for (let qi = 0; qi < 5; qi++) {
      h(uv(512, 550 + 230 * 3)); // 选项 D 那一行(行 i 矩形 460+230i .. 640+230i)
      h(uv(512, 1464)); // 下一题 / 查看结果(320..704 × 1420..1508)
    }
    const raw = localStorage.getItem('b612GentleTest');
    h(uv(512, 1295)); // 结果页「再测一次」(260..764 × 1240..1350)
    return { found: true, raw };
  });
  ok('墙面面板的 mesh 在交互表里且带 handleClick', wall.found === true);
  let wrec = null;
  try {
    wrec = JSON.parse(wall.raw);
  } catch (e) {}
  ok(
    '墙面那条落的是同一条记录,全选 D 算出 25',
    !!wrec && wrec.pct === 25 && wrec.score === 25 && wrec.answers.join() === '3,3,3,3,3',
    wall.raw
  );
  ok('墙面这条跑完仍零未捕获异常', pageerrs.length === 0, pageerrs.slice(0, 3).join(' | '));

  // ============ 第二遍:默认模式(?legacy=0,搁置令照旧) ============
  const p2 = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const pageerrs2 = [];
  p2.on('pageerror', (e) => {
    const m = String(e);
    if (m.includes('beacon') || m.includes('cloudflareinsights')) return;
    pageerrs2.push(m.slice(0, 200));
  });
  await p2.goto(BASE + '/?legacy=0&noopening', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await enterWorld(p2, 'legacy=0');
  const def = await p2.evaluate(() => {
    document.getElementById('gsMenuBtn').click();
    const btn = document.querySelector('#gameMenu [data-act="gentle"]');
    return {
      service: !!(window.__ctx.ui && window.__ctx.ui.gentleTest),
      markup: !!document.getElementById('gtP'),
      itemShown: btn ? getComputedStyle(btn).display !== 'none' : null,
      panelDisplay: getComputedStyle(document.getElementById('gtP')).display,
    };
  });
  ok('默认模式没有这个服务(旧玩法仍搁置)', def.service === false);
  ok('默认模式菜单条目不显示', def.itemShown === false, 'markup 在=' + def.markup);
  ok('默认模式面板本体仍 display:none', def.panelDisplay === 'none');
  ok('默认模式零未捕获异常', pageerrs2.length === 0, pageerrs2.slice(0, 3).join(' | '));
  ok('第一遍零未捕获异常', pageerrs.length === 0, pageerrs.slice(0, 4).join(' | '));

  console.log(
    '\n[参考] console.error ' +
      consoleErrs.length +
      ' 条 / HTTP>=400 ' +
      http4xx.length +
      ' 条(本机缺媒体与贴图属已知,不参与判定):'
  );
  console.log([...new Set(consoleErrs)].slice(0, 8).join('\n'));
  console.log([...new Set(http4xx)].slice(0, 8).join('\n'));
  if (srvErr.length) console.log('[参考] 后端 stderr 前 3 行:\n' + srvErr.slice(0, 3).join(''));

  await b.close();
  if (srv) {
    try {
      srv.kill('SIGKILL');
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 600));
    fs.rmSync(path.dirname(DATA), { recursive: true, force: true });
  }

  console.log(
    fail ? '\nGENTLE_PROBE_FAIL ' + fail + ' / ' + ran : '\nGENTLE_PROBE_OK ' + ran + '/' + ran
  );
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('GENTLE_PROBE_CRASH', e);
  process.exit(2);
});
