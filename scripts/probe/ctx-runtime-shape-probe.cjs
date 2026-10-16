// ctx-runtime-shape-probe.cjs — 「ctx 成员声明 ≡ 运行期实物」的线上实机探针(2026-10-16,第九刀上线后补)
//
// 为什么要它:第九刀那批把 `ctx.media.audioManager` / `ctx.media.scrollLink` / `ctx.scene.worldChanged` /
// `ctx.kunlun.eternalHandlers` 从 `unknown` 接回了各自行事人(写入方)的真实形状。类型侧有
// `src/__tests__/ctx-writer-shapes.test.js` 钉"声明 ≡ 写入方的**源码**",但那钉的是文本;
// 线上跑起来的那个对象**是不是同一个形状**,以前只有我本地一次性探针 `.tmp/n9-inworld.cjs` 量过一次 ⇒
// 按第八刀立的口径,这属于"跑进去了"不等于"点过了"。本探针把这四条变成常驻验收,下次能直接
// `BASE_URL=https://cloudbear.cloud` 拿到线上证据,而不是只靠 chunk 短哈希。
//
// 四条判据(每条都对应第九刀的一处声明,红了就说明那处声明与实物分了家):
//   C1 audioManager 的**必需成员都在场**(playHint/playOne/pauseAll/resumeAll/registerVideo/unregisterVideo
//      + videoSound/hintSound/isHintPlaying + hintQueue)—— 只要求"声明用到的键不缺",新增键不红(那是写入方的自由)。
//   C2 `playHint` 三个分支的**实际返回与回调次数**:总闸默认全静 ⇒ `(a, cb)` 必为 'skipped' 且 cb 恰好一次;
//      `(a, cb, true)` 豁免 ⇒ 进队列(非 'skipped');`playOne()` **空参不抛**(它就是为 `= {}` 这个默认值活的)。
//   C3 `scrollLink.redraw` 是函数且 **arity === 2** —— ctx.d.ts 里手写的 `(title, sub?)` 说的就是两个形参。
//   C4 走一次真世界切换(main → b612),订阅者**实际收到的载荷**键集合 === `from,to` 且值 === 'main'/'b612'。
//      这条是 WorldChangedPayload 的运行对面:emit 那边若多加一个键,这里立刻红。
//   C0 全程零未捕获异常(排除 `dynamically imported module` 这类弱网既有噪声,与 b612-prod-worlds 同一口径)。
//
// 用法:
//   node scripts/probe/ctx-runtime-shape-probe.cjs                    # 自起临时服(数据根隔离在系统临时目录)
//   BASE_URL=https://cloudbear.cloud node scripts/probe/ctx-runtime-shape-probe.cjs   # 直测线上
//   PROBE_BREAK=keys|arity|payload node ...                            # 验判据不空转的注射口(正常跑**不要设**)
//     · keys    ⇒ 断言前删掉 ctx.media.audioManager.playHint          ⇒ C1 必须红
//     · arity   ⇒ 把 scrollLink.redraw 换成三参函数                    ⇒ C3 必须红
//     · payload ⇒ 等切换**之后**才订阅 worldChanged(错过载荷)        ⇒ C4 必须红
//   退出码 0 = 全绿;非 0 = 有红(打印 `PROBE_FAILED n/m`)。
//
// ⚠️ 依赖入世流程(与 b612-prod-worlds 同一套:回访档 + 点完台词 + 走近石门自动传送),
//    无头环境编全站着色器要 15-45s,所以判定等的是"世界接棒"而不是首帧。
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const { launch } = require('./browser.js');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.CTX_SHAPE_PORT || 3302);
const EXTERNAL = process.env.BASE_URL;
const WAIT_MS = Number(process.env.PROBE_WAIT_MS || 60000);
const BREAK = process.env.PROBE_BREAK || '';
const TMP = path.join(os.tmpdir(), 'ctx-runtime-shape-' + Date.now());
let child = null;

function startServer() {
  fs.mkdirSync(TMP, { recursive: true });
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      // 数据根必须隔离:lib/store.js:9 默认拿仓库根 gate_data.json,而 server.js 一启动就跑保留期清扫
      env: { ...process.env, PORT: String(PORT), GATE_DATA_FILE: path.join(TMP, 'g.json') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => {
      if (d.toString().includes('服务器已启动')) resolve(child);
    });
    child.on('error', reject);
    setTimeout(() => reject(Error('server timeout')), 20000);
  });
}

function cleanup() {
  if (child) child.kill();
  try {
    if (TMP && fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
  } catch (e) {}
}

(async () => {
  if (BREAK && !['keys', 'arity', 'payload'].includes(BREAK)) {
    console.log(`PROBE_BREAK 取值不认识:${BREAK}(可用 keys|arity|payload)`);
    process.exit(2);
  }
  if (!EXTERNAL) await startServer();
  const ORIGIN = (EXTERNAL || 'http://localhost:' + PORT).replace(/\/$/, '');
  let pass = 0;
  let fail = 0;
  const ok = (cond, name, extra) => {
    if (cond) {
      pass++;
      console.log('  ✓ ' + name + (extra ? ' | ' + extra : ''));
    } else {
      fail++;
      console.log('  ✗ ' + name + (extra ? ' | ' + extra : ''));
    }
  };
  const errors = [];

  console.log(
    `目标: ${ORIGIN}${EXTERNAL ? '(外部)' : '(自起临时服 :' + PORT + ',数据根 ' + TMP + ')'}`
  );
  console.log(
    BREAK ? `⚠️ 注射模式 PROBE_BREAK=${BREAK}(这是验判据用的,不是正常验收)` : '注射模式:无'
  );

  const b = await launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => {
    if (!/dynamically imported module/.test(e.message)) errors.push(String(e).slice(0, 200));
  });
  await page.addInitScript(() => {
    sessionStorage.setItem('nickPopOff', '1');
    try {
      // 回访档:石门按剧情出场,新档在沙漠里看不到门(与 b612-prod-worlds 同一前置)
      localStorage.setItem('kunlunWelcomed', String(Date.now()));
      localStorage.setItem('b612Scene2', '1');
      localStorage.setItem('b612Page1', '1');
      localStorage.setItem('scriptLang', 'zh'); // 本探针不靠中文文案选择器,但钉语言比"跟着浏览器走"稳
    } catch (e) {}
  });

  await page.goto(ORIGIN + '/?noopening', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#b612Gate', { timeout: WAIT_MS });
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
    { timeout: WAIT_MS }
  );
  await page.click('#genderOv button:has-text("女")').catch(() => {});
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 40; i++) {
      if (!window.__ctx.ui.dialogOpen || !window.__ctx.ui.dialogOpen()) break;
      const d = document.getElementById('gameDialog');
      if (!d) break;
      (d.querySelector('.gs-next') || d).click();
      await sleep(250);
    }
  });
  await page.waitForTimeout(1200);

  // ── C1 / C2 / C3:主世界里读声明用到的那些成员 ─────────────────────────
  if (BREAK === 'keys') {
    await page.evaluate(() => delete window.__ctx.media.audioManager.playHint);
  }
  if (BREAK === 'arity') {
    await page.evaluate(() => {
      window.__ctx.media.scrollLink.redraw = function (a, b, c) {};
    });
  }
  const shape = await page.evaluate(() => {
    const am = window.__ctx.media.audioManager;
    const sl = window.__ctx.media.scrollLink;
    const REQUIRED = [
      'videoSound',
      'hintSound',
      'isHintPlaying',
      'hintQueue',
      'registerVideo',
      'unregisterVideo',
      'playOne',
      'playHint',
      'pauseAll',
      'resumeAll',
    ];
    return {
      amType: typeof am,
      amKeys: am ? Object.keys(am).sort().join(',') : '',
      missing: am ? REQUIRED.filter((k) => !(k in am)) : REQUIRED,
      playOneArity: am && am.playOne ? am.playOne.length : null,
      playHintArity: am && am.playHint ? am.playHint.length : null,
      queueIsArray: !!(am && Array.isArray(am.hintQueue)),
      redrawType: sl ? typeof sl.redraw : 'no-scrollLink',
      redrawArity: sl && sl.redraw ? sl.redraw.length : null,
    };
  });
  ok(shape.amType === 'object', 'C1 ctx.media.audioManager 在场', '键集=' + shape.amKeys);
  ok(shape.missing.length === 0, 'C1 声明用到的成员都不缺', shape.missing.join('/') || '无缺失');
  ok(
    shape.playHintArity === 3,
    'C1 playHint 收 3 个形参(与三个 @param 对齐)',
    '实=' + shape.playHintArity
  );
  ok(
    shape.playOneArity === 0,
    'C1 playOne arity 为 0(形参带默认值 ⇒ 可选,这条正是 [item] 的实物证据)',
    '实=' + shape.playOneArity
  );
  ok(shape.queueIsArray, 'C1 hintQueue 读出来是数组(只读视图 getter)');
  ok(shape.redrawType === 'function', 'C3 ctx.media.scrollLink.redraw 是函数');
  ok(
    shape.redrawArity === 2,
    'C3 redraw arity === 2(ctx.d.ts 手写的是 (title, sub?))',
    '实=' + shape.redrawArity
  );

  // 整段包在 try 里:注射模式会把 playHint 删掉,那时**必须是几条红**,
  // 不能让整个 evaluate 抛出去变成 PROBE_CRASH(红与崩是两种结论,前者才可归因)。
  const hint = await page.evaluate(async () => {
    const am = window.__ctx.media.audioManager;
    let c1 = 0;
    let c2 = 0;
    let r1;
    let r2;
    let r3 = null;
    let threw = null;
    try {
      r1 = am.playHint(new Audio(), () => c1++, undefined);
      r2 = am.playHint(new Audio(), () => c2++, true);
      r3 = am.playOne(); // 空参这条是 playOne 的默认值 {} 的实物证据
    } catch (e) {
      threw = String(e && e.message).slice(0, 80);
    }
    await new Promise((r) => setTimeout(r, 200));
    try {
      am.pauseAll(); // 收掉豁免那条(空 src 的 Audio 会挂到看门狗,别让它在页面里悬着)
    } catch (e) {}
    return { r1: String(r1), r2: String(r2), r3: String(r3), c1, c2, threw };
  });
  ok(hint.r1 === 'skipped', 'C2 总闸全静时 playHint 返回 skipped', '实=' + hint.r1);
  ok(hint.c1 === 1, 'C2 被跳过的那条 onEnd 恰好回调一次(队列语义)', '实=' + hint.c1);
  ok(hint.r2 !== 'skipped', 'C2 bypassSwitch=true 不进"跳过"分支', '实=' + hint.r2);
  ok(
    hint.threw === null,
    'C2 playOne() 空参不抛(默认值 {} 那条分支)',
    hint.threw || '返回 ' + hint.r3
  );

  // ── C4:载荷必须来自一次**真**世界切换 ────────────────────────────────
  if (BREAK !== 'payload') {
    await page.evaluate(() => {
      window.__wd = null;
      const off = window.__ctx.scene.worldChanged((d) => {
        window.__wd = {
          keys: Object.keys(d || {})
            .sort()
            .join(','),
          from: d && d.from,
          to: d && d.to,
        };
      });
      window.__wdOff = typeof off;
    });
  }
  await page.waitForFunction(() => window.__starGate && window.__starGate.visible(), null, {
    timeout: 45000,
  });
  await page.evaluate(() => {
    const q = window.__ctx.player.pl.p;
    q.x = 0.1;
    q.z = 46; // 距门 10m:>4m 不算进圈,<15m 该亮按钮(自动传送是"武装"的,一步瞬移不触发)
  });
  await page.waitForFunction(
    () => {
      const e = document.getElementById('gateBtn');
      return !!e && e.style.display === 'block';
    },
    null,
    { timeout: 30000 }
  );
  await page.evaluate(() => {
    window.__ctx.player.pl.p.z = 56;
  });
  await page.waitForFunction(() => window.__ctx.scene.activeWorld === 'b612', null, {
    timeout: 45000,
  });
  await page.waitForTimeout(1500);

  const wd = await page.evaluate(() => ({ payload: window.__wd, offType: window.__wdOff }));
  // 注射模式下这几条**照常判定**(payload 模式就是"切换之后才订阅",载荷必然没收到),
  // 红就是红 —— 探针不许把"我故意让它错过"写成一条会通过的断言。
  ok(!!wd.payload, 'C4 worldChanged 订阅者真的收到了载荷');
  ok(
    wd.payload && wd.payload.keys === 'from,to',
    'C4 载荷键集合 === from,to(WorldChangedPayload)',
    '实=' + (wd.payload || {}).keys
  );
  ok(
    wd.payload && wd.payload.from === 'main' && wd.payload.to === 'b612',
    'C4 载荷值 === main → b612',
    wd.payload ? wd.payload.from + '→' + wd.payload.to : '无'
  );
  ok(
    wd.offType === 'function',
    'C4 worldChanged 返回取消订阅函数(eventBus.on 契约)',
    '实=' + wd.offType
  );

  ok(
    errors.length === 0,
    'C0 全程零未捕获异常',
    errors.length ? errors.slice(0, 3).join(' ⏐ ') : '0 条'
  );

  console.log(`\n合计:${pass} 通过 / ${fail} 失败`);
  await b.close();
  cleanup();
  if (fail) {
    console.log(`PROBE_FAILED ${fail}/${pass + fail}`);
    process.exit(1);
  }
  console.log(`PROBE_OK ${pass}/${pass + fail}${BREAK ? ' (注射模式 ' + BREAK + ')' : ''}`);
})().catch((e) => {
  console.log('PROBE_CRASH ' + String(e && e.message));
  cleanup();
  process.exit(1);
});
