// late-planets-visit-probe.cjs — C4 专项探针:328/329/330 这三颗星「每一趟进入」的生命周期
// 覆盖(2026-10-17 外部审计 C4;机制单测在 src/__tests__/visit-timers.test.js,接线判据在 late-planets-visit.test.js,
// 本探针补的是它们都够不到的那一层 —— 真场景、真 DOM、真计时器):
//   ① 328 chainA 说到第 1 句时 ctx.scene.leaveWorld() ⇒ 后续台词不许出现在 B612(M-03 那一族,回归护栏)
//   ② 离场即换世:gen 变大、pending 归零(旧写法只有一只模块级 speakTimer,三颗星共用,清不到玩法内部的计时器)
//   ③ 重返同一颗星(chainA 重新从第 0 句起,且索引序列严格 +1)——同世界快返时旧世代的尾巴若还在跑,
//      这条会跳号或重复(两条链同时在讲就是它)
//   ④ ★329 玩法进行中 lampHead.userData.manual === true;中途离场后必须回 false
//      旧写法只有"通关"那一条路归还(late-planets.js 原 :385),中途走掉 ⇒ 329 的路灯本会话永久不再听昼夜
// 判据用台词指纹(从 shared/story-text.mjs 现取 chainA 各句,不在本文件复制一份,防漂移)。
// 用法:node scripts/probe/late-planets-visit-probe.cjs(自起 :3299 服务,数据根隔离到临时目录)
//       BASE_URL=http://host:port/ 可打远端;PW_BROWSER=chromium 换浏览器
// 退出码 0=全绿。任一条红都会打出实测值,不是只打"失败"。
const path = require('path'),
  fs = require('fs'),
  os = require('os'),
  url = require('url'),
  { spawn } = require('child_process');
const { launch } = require('./browser.js');

const ROOT = path.join(__dirname, '..', '..');
const PORT = process.env.LATE_VISIT_PORT || 3299;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-visit-'));
const WAIT = (ms) =>
  process.env.PROBE_WAIT_MS ? Math.ceil((ms * Number(process.env.PROBE_WAIT_MS)) / 100) : ms;

function start() {
  return new Promise((resolve, reject) => {
    const c = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT), GATE_DATA_FILE: path.join(TMP, 'g.json') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    c.stdout.on('data', (d) => d.toString().includes('服务器已启动') && resolve(c));
    c.stderr.on(
      'data',
      (d) => process.env.LATE_VISIT_DEBUG && console.log('[srv] ' + d.toString().slice(0, 200))
    );
    c.on('error', reject);
    setTimeout(() => reject(Error('server timeout')), 20000);
  });
}

// 台词指纹:归一化(去全部空白)后取 chainA 每句前 18 字,en/zh 都收 —— 闸门默认英文,但双语玩家会走 zh。
async function fingerprints(mod) {
  const m = await import(url.pathToFileURL(path.join(ROOT, 'src/shared/story-text.mjs')).href);
  const norm = (s) =>
    String(s || '')
      .replace(/\s+/g, '')
      .slice(0, 18);
  return m[mod].chainA.map((it, i) => ({ i, keys: [norm(it.en), norm(it.zh)].filter(Boolean) }));
}

(async () => {
  const local = !process.env.BASE_URL;
  const BASE = process.env.BASE_URL || 'http://localhost:' + PORT + '/';
  const child = local ? await start() : null;
  let pass = 0,
    fail = 0;
  const ok = (name, cond, extra) => {
    if (cond) {
      pass++;
      console.log('✓ ' + name + (extra ? ' | ' + extra : ''));
    } else {
      fail++;
      console.log('✗ ' + name + (extra ? ' | ' + extra : ''));
    }
  };
  const b = await launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  p.on('pageerror', (e) => console.log('  [pageerror] ' + e.message.slice(0, 160)));

  const BP = await fingerprints('SCENE8_BUSINESS', 1); // 328 chainA
  const LP = await fingerprints('SCENE8_LAMP', 1); // 329 chainA
  console.log('指纹:328 chainA ' + BP.length + ' 句 / 329 chainA ' + LP.length + ' 句');

  await p.addInitScript(() => {
    try {
      sessionStorage.setItem('nickPopOff', '1');
      sessionStorage.setItem('dialogVoiceOff', String(Date.now())); // 静音:纯文本节奏,探针可确定
      localStorage.setItem('kunlunWelcomed', String(Date.now()));
      localStorage.setItem('b612Scene2', '1');
      localStorage.setItem('b612Page1', '1');
      localStorage.setItem('b612PlanetChapter', '0'); // 章节由探针用 kunlun.setChapter 播;预设高了 setChapter 只前进,永远回不到 328 那一章
    } catch (e) {}
    setInterval(() => document.querySelector('#witnessCard .wc-skip')?.click(), 500);
    // 旅途卡若挡住到达,按"再等等"关掉(dataset.voyage 会让 begin() 延后一帧)
    setInterval(() => document.querySelector('#voyage .vy-stay')?.click(), 800);
    // 清场(照 b612-chain-leak-probe):开局挂着等玩家回应的对话**永不自动关**,
    // 它把 lock 队列堵死 ⇒ 石门按钮不亮、走近也不传(2026-10-17 实测:isStarGateOut 恒 false、玩家被钉在出生点)
    window.__dismiss = setInterval(() => {
      const d = document.getElementById('gameDialog');
      if (!d || d.style.display === 'none') return;
      const c = d.querySelector('.gs-choice');
      if (c) {
        c.click();
        return;
      }
      d.click();
    }, 600);
    window.__stopDismiss = () => {
      clearInterval(window.__dismiss);
      window.__dismiss = null;
    };
  });
  await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('#b612Gate', { timeout: WAIT(90000) });
  await p.evaluate(() => {
    const c = document.getElementById('gAgreeChk');
    if (c) {
      c.checked = true;
      c.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await p.click('#b612Gate .gEnter');
  await p.waitForFunction(() => !document.getElementById('b612Gate'), null, {
    timeout: WAIT(20000),
  });
  await p.waitForSelector('#b612film', { timeout: WAIT(20000) }).catch(() => {});
  await p.waitForTimeout(WAIT(1500));
  await p.click('#b612film #fSkip').catch(() => {});
  await p
    .waitForFunction(() => !document.getElementById('b612film'), null, { timeout: WAIT(20000) })
    .catch(() => {});
  await p.click('#genderOv button:has-text("女")').catch(() => {}); // 首访形象弹窗,选女生放行
  await p.waitForFunction(() => !!window.__ctx && !!window.__ctx.scene, null, {
    timeout: WAIT(40000),
  });
  // 石门传送必须等预加载全绿:portal 的 tick 未注册时把人摆到门上是白摆(2026-09-24 记过的静默丢失)
  await p.waitForFunction(() => window.__bootCheck && window.__bootCheck.ok === true, null, {
    timeout: WAIT(150000),
  });
  // 主世界石门 → B612(b612-planets-probe / b612-chain-leak-probe 用的那条真人路线;
  // 不用 scene.enterWorld:那是 planets.js 里的 ctx.scene.enterWorld 赋值,开机链没跑到它时它并不存在)
  await p.evaluate(
    () => window.__ctx.kunlun.revealStarGate && window.__ctx.kunlun.revealStarGate()
  );
  await p.waitForTimeout(WAIT(800));
  await p.evaluate(() => {
    window.__ctx.player.pl.p.x = 0.1;
    window.__ctx.player.pl.p.z = 20; // 先退到圈外重新武装(触发即解除)
  });
  await p.waitForTimeout(WAIT(1000));
  await p.evaluate(() => {
    window.__ctx.player.pl.p.x = 0.1;
    window.__ctx.player.pl.p.z = 55.2;
  });
  await p.waitForTimeout(WAIT(2500));
  await p.evaluate(() => {
    const b = document.getElementById('gateBtn'); // 兜底:走近没传就点门前那颗「✦ 进入 B612」
    if (b && b.style.display !== 'none') b.click();
  });
  const dump = (tag) =>
    p
      .evaluate(() => ({
        w: window.__ctx.scene.activeWorld,
        boot: window.__bootCheck ? window.__bootCheck.ok : null,
        pad: (() => {
          const b = document.getElementById('gateBtn');
          return b ? b.style.display : '-';
        })(),
        nav: [...document.querySelectorAll('#worldNav button')]
          .map((x) => (x.textContent || '').trim())
          .join(' / '),
        pos: (() => {
          const q = window.__ctx.player.pl.p;
          return q.x.toFixed(1) + ',' + q.z.toFixed(1);
        })(),
      }))
      .catch((e) => ({ err: String(e.message).slice(0, 100) }))
      .then((s) => console.log('  [dump ' + tag + '] ' + JSON.stringify(s)));
  await dump('pre-teleport');
  const inB612 = await p
    .waitForFunction(() => window.__ctx.scene.activeWorld === 'b612', null, {
      timeout: WAIT(60000),
    })
    .then(() => true)
    .catch(() => false);
  await p.waitForTimeout(WAIT(4000));
  await dump('post-teleport');
  ok('开机走到石门传送进 B612(探针的跳板)', inB612, 'world=' + (inB612 ? 'b612' : '见上面 dump'));
  if (!inB612) {
    console.log('\n结果: ' + pass + ' 通过, ' + (fail + 10) + ' 失败(进不了 B612,后面全无从测起)');
    await b.close();
    if (child) child.kill();
    process.exit(1);
  }
  await p.waitForTimeout(WAIT(6000)); // 首轮 tick + 世界资源就位

  // 采样器:每 120ms 看一次对话框,把可见文本映射成 chainA 索引;同一条只记一次。
  // 另配一道"只关无关的选项式对话":带 .gs-choice 的对话永不自动关(b612-chain-leak-probe 记过),
  // 它压在 lock 队列前面会把本链饿死;命中本链指纹的对话一律不碰。
  const installSampler = (fps) =>
    p.evaluate(
      ({ fp }) => {
        const keys = fp.map((f) => ({ i: f.i, k: f.keys }));
        const match = (norm) => {
          for (const f of keys) if (f.k.some((kk) => norm.includes(kk))) return f.i;
          return -1;
        };
        window.__s = { seq: [], last: '', closed: 0 };
        clearInterval(window.__sTimer);
        clearInterval(window.__cTimer);
        window.__sTimer = setInterval(() => {
          const d = document.getElementById('gameDialog');
          const vis = d && d.style.display !== 'none';
          const norm = vis ? String(d.textContent || '').replace(/\s+/g, '') : '';
          if (!norm) return;
          const idx = match(norm);
          if (idx < 0) return; // 与本链无关(向导/目击/别的场景)不入序列
          const tag = 'L' + idx;
          if (tag !== window.__s.last) {
            window.__s.last = tag;
            window.__s.seq.push({ t: Date.now(), i: idx });
          }
        }, 120);
        window.__cTimer = setInterval(() => {
          const d = document.getElementById('gameDialog');
          if (!d || d.style.display === 'none') return;
          const norm = String(d.textContent || '').replace(/\s+/g, '');
          if (!norm || match(norm) >= 0) return;
          const c = d.querySelector('.gs-choice');
          if (c) {
            window.__s.closed++;
            c.click();
          }
        }, 700);
      },
      { fp: fps }
    );
  const readSampler = () =>
    p.evaluate(() => ({ seq: window.__s.seq.map((x) => x.i) })).catch(() => null);
  const state = (w) => p.evaluate((x) => window.__latePlanets.state(x), w);
  const resetSampler = () => p.evaluate(() => (window.__s.seq = []));

  async function navTo(num) {
    await p.waitForFunction(
      () => [...document.querySelectorAll('#worldNav button')].length > 0,
      null,
      { timeout: WAIT(20000) }
    );
    const hit = await p.evaluate((n) => {
      const b = [...document.querySelectorAll('#worldNav button')].find((x) =>
        new RegExp('前往 ' + n + '|Visit ' + n + '|重返 ' + n + '|Revisit ' + n).test(
          x.textContent || ''
        )
      );
      if (b) b.click();
      return b ? (b.textContent || '').trim() : null;
    }, num);
    return hit;
  }

  // ============ ① 328 首访:chainA 第 1 句上屏 ============
  await p.evaluate(() => {
    // setChapter 一次同步两处:planets.js 的模块级 chapter(导航读它才挂「前往 328」)与 store(本模块 tick 读它)
    window.__ctx.kunlun.setChapter(3); // = 328 的 cfg.idx ⇒ begin() 会跑
  });
  const label328 = await navTo(328);
  const in328 = await p
    .waitForFunction(() => window.__ctx.scene.activeWorld === 'king328', null, {
      timeout: WAIT(45000),
    })
    .then(() => true)
    .catch(() => false);
  ok('导航进入 328 商人之星', in328, '按钮=' + JSON.stringify(label328));
  if (!in328) {
    console.log('结果: ' + pass + ' 通过, ' + (fail + 6) + ' 失败(进不去 328,后续无从测起)');
    await b.close();
    if (child) child.kill();
    process.exit(1);
  }
  await installSampler(BP);
  await p
    .waitForFunction(() => window.__s && window.__s.seq.length >= 1, null, { timeout: WAIT(40000) })
    .catch(() => {});
  let s328 = await state('king328');
  ok(
    '① 328 chainA 第 1 句真的上了屏(不是只在源码里排好了)',
    s328.stage === 'chainA' && (await readSampler()).seq[0] === 0,
    'stage=' + s328.stage + ' seq=' + JSON.stringify((await readSampler()).seq)
  );

  // ============ ② 中途离场:换世 + 不泄漏 ============
  const genBefore = s328.gen;
  await p.evaluate(() => {
    window.__ctx.scene.leaveWorld();
    window.__s.seq = [];
  });
  await p.waitForTimeout(WAIT(1200));
  const justLeft = await state('king328');
  await p.waitForFunction(() => window.__ctx.scene.activeWorld === 'b612', null, {
    timeout: WAIT(40000),
  });
  ok(
    '②a 离场即换世:gen 变大、pending 归零(计时器不再飞在外面)',
    justLeft.gen > genBefore && justLeft.pending === 0,
    'gen ' + genBefore + '→' + justLeft.gen + ' pending=' + justLeft.pending
  );
  await p.waitForTimeout(WAIT(14000)); // 老写法:第 1 句 hold 16s,足够让尾巴在新场景里冒头
  const leaked = await readSampler();
  ok(
    '②b 回到 B612 后 14s 内,328 的 chainA 后续一句都没漏过来',
    leaked.seq.length === 0,
    'seq=' + JSON.stringify(leaked.seq)
  );

  // ============ ③ 重返同一颗星:重新从第 0 句起,且序列严格 +1 ============
  await navTo(328);
  await p.waitForFunction(() => window.__ctx.scene.activeWorld === 'king328', null, {
    timeout: WAIT(45000),
  });
  await installSampler(BP);
  await p.waitForFunction(() => window.__s && window.__s.seq.length >= 1, null, {
    timeout: WAIT(40000),
  });
  const reGen = (await state('king328')).gen;
  // 328 chainA = 5 句,首句 16s、其余 4.6s ⇒ 观察 ~26s 能看到前 3 句推进
  const t0 = Date.now();
  while (Date.now() - t0 < WAIT(26000)) await p.waitForTimeout(1000);
  const seq3 = (await readSampler()).seq;
  const mono = seq3.every((v, i) => i === 0 || v === seq3[i - 1] + 1);
  ok(
    // 判据要按机制的写法来:世代是**离场时**换号的(tick 里 `visits.bump(prevWorld)`),进场只读取现任那号
    // ⇒ 重返读到的一定比首访大(两次进入之间必过一次离场),但不该比"刚离场那一刻"再大。
    // 第一版这里写成 `reGen > justLeft.gen`,实测红在 `gen=0→1→1` —— 那是判据把换世的时机猜错了,不是隔离失效。
    '③a 重返用的是与首访不同的一世:gen 大于首访',
    reGen > genBefore,
    'gen 首访=' + genBefore + ' 离场后=' + justLeft.gen + ' 重返=' + reGen
  );
  ok('③b 重返从 chainA 第 0 句重新讲起', seq3[0] === 0, 'seq=' + JSON.stringify(seq3));
  ok(
    '③c ★整段观察里台词索引严格 +1(两条链同时在讲时会跳号或重复)',
    mono && seq3.length >= 2,
    'seq=' + JSON.stringify(seq3) + ' 长度=' + seq3.length
  );

  // ============ ④ 329 点灯人:玩法接管 ⇒ 中途离场必须归还控制权 ============
  await p.evaluate(() => window.__ctx.scene.leaveWorld());
  await p.waitForFunction(() => window.__ctx.scene.activeWorld === 'b612', null, {
    timeout: WAIT(40000),
  });
  await p.evaluate(() => window.__ctx.kunlun.setChapter(4)); // 导航改指 329,本模块 tick 认它是当前章
  await navTo(329);
  const in329 = await p
    .waitForFunction(() => window.__ctx.scene.activeWorld === 'king329', null, {
      timeout: WAIT(45000),
    })
    .then(() => true)
    .catch(() => false);
  ok('导航进入 329 点灯人之星', in329, 'world=' + (in329 ? 'king329' : '进不去'));
  if (in329) {
    await installSampler(LP);
    // chainA 七句 ≈ 43~60s 才进玩法;玩法一开,window.__late[king329]='game',manual 置 true
    const toGame = await p
      .waitForFunction(() => window.__late.king329 === 'game', null, { timeout: WAIT(90000) })
      .then(() => true)
      .catch(() => false);
    ok(
      '④a 329 玩法人灯真的开了(等 stage=game)',
      toGame,
      'stage=' + (await p.evaluate(() => window.__late.king329))
    );
    const manualOn = await p.evaluate(() => {
      const w = window.__ctx.scene.worldManager.getWorld('king329');
      const head = w && w.scene.getObjectByName('lampHead');
      return head ? { found: true, manual: !!head.userData.manual } : { found: false };
    });
    ok(
      '④b 玩法进行中 lampHead.userData.manual === true(玩法确实接管了那盏灯)',
      manualOn.found && manualOn.manual === true,
      JSON.stringify(manualOn)
    );
    await p.evaluate(() => window.__ctx.scene.leaveWorld());
    await p.waitForFunction(() => window.__ctx.scene.activeWorld === 'b612', null, {
      timeout: WAIT(40000),
    });
    await p.waitForTimeout(WAIT(6000));
    const manualAfter = await p.evaluate(() => {
      const w = window.__ctx.scene.worldManager.getWorld('king329');
      const head = w && w.scene.getObjectByName('lampHead');
      return head ? { found: true, manual: !!head.userData.manual } : { found: false };
    });
    const st329 = await state('king329');
    ok(
      '④c ★中途走掉,路灯控制权归还(manual 回 false)——旧写法只有通关那条会还,此后这盏灯永久不再听昼夜',
      manualAfter.found && manualAfter.manual === false,
      JSON.stringify(manualAfter)
    );
    ok(
      '④d 329 离场后换世且计时器清空',
      st329.pending === 0 && st329.gen > 0,
      'gen=' + st329.gen + ' pending=' + st329.pending
    );
  } else {
    ok('④a 329 玩法人灯真的开了(等 stage=game)', false, '没进得去 329');
    ok('④b 玩法进行中 lampHead.userData.manual === true', false, '没进得去 329');
    ok('④c ★中途走掉,路灯控制权归还', false, '没进得去 329');
    ok('④d 329 离场后换世且计时器清空', false, '没进得去 329');
  }

  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  await b.close();
  if (child) child.kill();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('探针异常: ' + (e && e.message ? e.message : e));
  process.exit(2);
});
