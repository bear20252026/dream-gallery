// earth-day-visit-probe.cjs — 地球之日(沙漠第 10 场)的「每一趟进入」生命周期探针(2026-10-17 C4 批次配套)
// 机制单测在 src/__tests__/visit-timers.test.js,接线判据在 src/__tests__/earth-day-visit.test.js;
// 这两层都够不到的那一层是本探针要的东西 —— 真沙漠、真对话框、真计时器。
// 它测的缺陷形状(比 late-planets 那一族更绕,值得先读一遍再读判据):
//   旧写法只有一只模块级 `speakTimer`,三句链共用同一只槽,离场时没人摘它(它只在"自己那一拍"里
//   `inDesert()` 早退 —— 早退不等于取消)。重返后重新到站,新世开新链、把新心跳写进**同一只槽**。
//   坏不坏取决于旧那一拍到期那一刻:
//     · 有对话框开着 ⇒ 白跑一趟(无事发生);
//     · 空档(人已回来但还没走到站点)⇒ 旧 `finish()` 落地 ⇒ 它先 `clearTimeout(speakTimer)` 把
//       **新世那条心跳**摘掉,再 `speakSeq(i+1)` 替旧世把下一句开出来 ⇒ 同一站两条链同时在讲,
//       `advance()` 走两遍 = earthStep 一次跳两站(advance 写的是**存档**,不只是画面重播)。
//   ⇒ 所以本探针必须**故意留那段空档**(③):走进站点讲上第 1 句后,先把人挪到 44m 外、再离开沙漠
//     (回程 restore 的是"离开那一刻"的快照,所以挪必须在离场之前 —— 反过来一落地就被按回 4m 内,
//     新链 0.1s 内开讲,窗口根本不存在),空档等 9.5s 后才把人摆回站点。
//     这条窗口是照着旧心跳的到期时刻算的:flower 第 0 句 hold=max(4600,18*65)=4600ms,心跳 4600+2600=7200ms,
//     空档 9500ms 覆盖它且仍在新链开讲之前。判据不依赖这些毫秒成立与否 —— 它只问"空档里上屏了几句"。
// 判据:
//   ① 摆进 flower 站真的开讲:第 0 句上屏(mode=talking、window.__earth=flower、采样序列首元素=0)
//   ② ★讲到一半离开沙漠:当场换世(gen 变大)且在飞计时器清空(pending=0)
//   ③ ★重返后站在 44m 外的空档里,flower 一句都不许上屏(旧写法旧世心跳正是在这里把第 1 句弹出来)
//   ④ 重新走进站点:从第 0 句重讲,且整段索引严格 +1(两条链同时在讲就会跳号或重复)
//   ⑤ ★这一站走完 earthStep 恰好 +1(1→2)、下一站是 echo(旧写法两条链各 advance 一次 ⇒ 跳到 3/roses)
// 用法:node scripts/probe/earth-day-visit-probe.cjs(自起 :3298 服务,数据根隔离到临时目录)
//       BASE_URL=http://host:port/ 可打远端;PW_BROWSER=chromium 换浏览器;EARTH_VISIT_PORT 换端口
//       PROBE_WAIT_MS=200 把预算放大到 2 倍(机器忙时用,判据一个字不动)
// 退出码 0=全绿。任一条红都会打出实测值,不是只打"失败"。
//
// 判据自证注射口(与 late-planets-visit-probe 同一套纪律:正常验收不要设):
//   PROBE_BREAK=<name> 在页面上造出该判据本该拦住的那个现象,逼对应那条变红;红了才算它会咬。
//     · pending ⇒ 把 earthDayApi.state() 的 pending 读数改成 1        ⇒ ② 必须红 〔读数级〕
//     · gap     ⇒ 空档里往对话框写进 flower 第 1 句的指纹              ⇒ ③ 必须红 〔现象级:旧世的尾巴上屏〕
//     · double  ⇒ B 链讲到第 1 句后再把第 0 句打上一次                 ⇒ ④ 必须红 〔现象级:索引不再严格 +1〕
//     · skip    ⇒ 这一站走完时把 earthStep 多推一格                    ⇒ ⑤ 必须红 〔现象级:一次跳两站正是缺陷的损害面〕
//   注射模式下退出码反过来:0=目标确实红了,1=⚠️ 目标仍绿(这条判据不咬),3=注射没打进去(元素不在场/路线没走到)。
//   ⚠️ pending 那条只是读数级:它证明 ② 真在读 pending 字段,不证明"bump 一定发生";后者的证据在
//      接线判据的源码扫描(earth-day-visit.test.js ④:离场换世且 bump 早于 return)与单测级注射。
const path = require('path'),
  fs = require('fs'),
  os = require('os'),
  url = require('url'),
  { spawn } = require('child_process');
const { launch } = require('./browser.js');

const ROOT = path.join(__dirname, '..', '..');
const PORT = process.env.EARTH_VISIT_PORT || 3298;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'earth-visit-'));
const WAIT = (ms) =>
  process.env.PROBE_WAIT_MS ? Math.ceil((ms * Number(process.env.PROBE_WAIT_MS)) / 100) : ms;
const BREAK = process.env.PROBE_BREAK || '';
const BREAK_TARGET = { pending: '②', gap: '③', double: '④', skip: '⑤' };
// 这一趟测的是 flower 站(第 2 站,2 句、约 18s 走完):snake 有 19 句(约 100s),测一条链用不着它,
// 而本缺陷的观察面对"链还没走完"这件事敏感,短链反而把窗口拉得更好摆。earthStep=1 ⇒ stopKey()='flower'。
const STATION = 'flower';
const NEXT_STATION = 'echo'; // 走完 flower 应该指到第 3 站
const GAP_MS = 9500; // 空档:必须跨过旧心跳的 7200ms,又必须停在重新到站之前
const AWAY = { x: -38, z: 20 }; // 离 flower 站(-38,64)44m ≫ REACH=4
const NEAR = { x: -38, z: 63 };

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
      (d) => process.env.EARTH_VISIT_DEBUG && console.log('[srv] ' + d.toString().slice(0, 200))
    );
    c.on('error', reject);
    setTimeout(() => reject(Error('server timeout')), 20000);
  });
}

// 台词指纹:归一化(去全部空白)后取每句前 18 字,en/zh 都收。从 story-text.mjs 现取,不在本文件复制一份。
async function fingerprints() {
  const m = await import(url.pathToFileURL(path.join(ROOT, 'src/shared/story-text.mjs')).href);
  const norm = (s) =>
    String(s || '')
      .replace(/\s+/g, '')
      .slice(0, 18);
  return m.SCENE10[STATION].map((it, i) => ({
    i,
    keys: [norm(it.en), norm(it.zh)].filter(Boolean),
  }));
}

// 出沙漠那一趟要带 spawn 快照,且**坐标从单一源取**:`shared/planet-logic.mjs` 的 `spawnFor('b612')`
// —— 石门按钮(gallery/portal.js:61)与统一走法(ui/world-travel.js:41)进 B612 时传的就是它。
// 裸 `enterWorld('b612')` 不带快照 ⇒ 玩家被留在沙漠坐标里(B612 地表之下),这一趟走得不干净;
// 2026-10-17 第 3 跑实测:切号发生在 commit 中间、回程被 transitioning 拒掉,"在外"窗口一帧都没跑过
// ⇒ 离场分支从未执行 ⇒ ②③④ 一起红(而 ⑤ 反而绿,因为根本没有第二条链)。
async function b612Spawn() {
  const m = await import(url.pathToFileURL(path.join(ROOT, 'src/shared/planet-logic.mjs')).href);
  return m.spawnFor('b612');
}

(async () => {
  if (BREAK && !BREAK_TARGET[BREAK]) {
    console.log(
      'PROBE_BREAK 取值不认识:' + BREAK + '(可用 ' + Object.keys(BREAK_TARGET).join('|') + ')'
    );
    process.exit(2);
  }
  const FP = await fingerprints();
  const SP = await b612Spawn();
  const GUARD = FP.flatMap((f) => f.keys); // 本链的指纹:探针一律不点它(见 addInitScript 那段)
  const local = !process.env.BASE_URL;
  const BASE = process.env.BASE_URL || 'http://localhost:' + PORT + '/';
  const child = local ? await start() : null;
  let pass = 0,
    fail = 0;
  let injected = false;
  const tagOf = (name) => {
    const m = /^([①②③④⑤][a-e]?)/.exec(name);
    return m ? m[1] : '';
  };
  const reds = new Set();
  const ok = (name, cond, extra) => {
    if (cond) {
      pass++;
      console.log('✓ ' + name + (extra ? ' | ' + extra : ''));
    } else {
      fail++;
      const t = tagOf(name);
      if (t) reds.add(t);
      console.log('✗ ' + name + (extra ? ' | ' + extra : ''));
    }
  };
  const b = await launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  p.on('pageerror', (e) => console.log('  [pageerror] ' + e.message.slice(0, 160)));

  const finish = async (code) => {
    await b.close().catch(() => {});
    if (child) child.kill();
    // 隔离用的临时数据根跑完就还回去;刚 kill 的 server 还攥着 g.json ⇒ Windows 上第一刀常 EPERM,半秒后再试
    let rmErr = null;
    for (let i = 0; i < 2; i++) {
      try {
        fs.rmSync(TMP, { recursive: true, force: true });
        rmErr = null;
        break;
      } catch (e) {
        rmErr = e;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    if (rmErr)
      console.log(
        '  [cleanup] 临时数据根没删掉(子进程还攥着文件):' +
          String(rmErr.message).slice(0, 60) +
          ' | ' +
          TMP
      );
    if (BREAK) {
      const t = BREAK_TARGET[BREAK];
      console.log(
        code === 0
          ? 'INJECT_OK ★注射把 ' + t + ' 打红了 ⇒ 这条判据会咬'
          : code === 3
            ? 'INJECT_MISS 注射没打进去(元素不在场 / 路线没走到)⇒ 这条注射未证实,不算判据的结论'
            : 'INJECT_DEAD ⚠️ 注射打进去了而 ' + t + ' 仍绿 ⇒ 这条判据不咬,得改'
      );
    }
    process.exit(code);
  };
  const stopAfterBreak = async (id) => {
    if (!BREAK || BREAK !== id) return;
    if (!injected) await finish(3);
    await finish(reds.has(BREAK_TARGET[BREAK]) ? 0 : 1);
  };

  console.log('指纹:' + STATION + ' 共 ' + FP.length + ' 句 ' + JSON.stringify(GUARD));
  console.log(
    BREAK
      ? '⚠️ 注射模式 PROBE_BREAK=' + BREAK + ' ⇒ 目标 ' + BREAK_TARGET[BREAK] + ' 必须红'
      : '注射模式:无'
  );

  // 存档预设分两段,**顺序是硬的**:
  //  · 开机段只给 page1/scene2,章节必须留 0 —— scene3-night.js 的 armB612() 在
  //    `planetsChapter >= ENDING_GATE_CHAPTER(6)` 时直接 `removeB612()` 把石门收走
  //    (2026-10-03 起「327 之后石门不再是下一步」),预设成 6 等于把本探针自己的跳板拆掉
  //    (2026-10-17 首跑实测:✗ 跳板 … world=main,0 通过 / 6 失败,后面全无从测起)。
  //  · 进了 B612 之后再 setChapter(6) + earthStep=1 ⇒ earthDue 成立、且从 flower 这一站起。
  // ⚠️ __dismiss 只关**与本链无关**的对话(选项式对话永不自动关,它把 lock 队列堵死 —— 见 late-planets 探针),
  //    本链那两句一律不点:这一支探针的全部判据都建立在"每句按 hold 那么久自己关"之上,
  //    探针伸手点一下就把被测对象的时长改短了(旧探针里正是那个 600ms 节拍把 chainA 提前推完的)。
  await p.addInitScript(
    (init) => {
      try {
        sessionStorage.setItem('nickPopOff', '1');
        sessionStorage.setItem('dialogVoiceOff', String(Date.now())); // 静音:纯文本节奏,探针可确定
        localStorage.setItem('kunlunWelcomed', String(Date.now()));
        localStorage.setItem('b612Scene2', '1');
        localStorage.setItem('b612Page1', '1');
        localStorage.setItem('b612PlanetChapter', '0'); // ← 留 0 才保得住石门跳板(见上面那段)
        localStorage.removeItem('b612EarthDay');
        localStorage.removeItem('b612EndingStep');
        localStorage.removeItem('b612EarthStep');
      } catch (e) {}
      window.__guard = init.keys;
      window.__isChain = () => {
        const d = document.getElementById('gameDialog');
        if (!d || d.style.display === 'none') return false;
        const n = String(d.textContent || '').replace(/\s+/g, '');
        return !!n && window.__guard.some((k) => n.includes(k));
      };
      setInterval(() => document.querySelector('#witnessCard .wc-skip')?.click(), 500);
      setInterval(() => document.querySelector('#voyage .vy-stay')?.click(), 800);
      window.__dismiss = setInterval(() => {
        const d = document.getElementById('gameDialog');
        if (!d || d.style.display === 'none') return;
        if (window.__isChain()) return; // 本链的一句:让它的 hold 走完
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
    },
    { keys: GUARD }
  );

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
  await p.click('#genderOv button:has-text("女")').catch(() => {});
  await p.waitForFunction(() => !!window.__ctx && !!window.__ctx.scene, null, {
    timeout: WAIT(40000),
  });
  await p.waitForFunction(() => window.__bootCheck && window.__bootCheck.ok === true, null, {
    timeout: WAIT(150000),
  });

  const st = () =>
    p.evaluate(() =>
      window.__ctx.scene.earthDayApi
        ? window.__ctx.scene.earthDayApi.state()
        : { missing: 'earthDayApi' }
    );
  const world = () => p.evaluate(() => window.__ctx.scene.activeWorld);
  const where = (x, z) =>
    p.evaluate(({ x, z }) => ((window.__ctx.player.pl.p.x = x), (window.__ctx.player.pl.p.z = z)), {
      x,
      z,
    });
  // 路线没走通时要把"为什么"打出来:门在不在、按钮亮不亮、bootCheck 绿没绿、有没有对话/旅途卡压着、
  // 导航挂的什么按钮、人在哪儿。跳了板不报原因,下一次排查就只能从零再跑四分钟(2026-10-17 首跑学的)。
  const dump = (tag) =>
    p
      .evaluate(() => ({
        w: window.__ctx.scene.activeWorld,
        boot: window.__bootCheck ? window.__bootCheck.ok : null,
        pad: (() => {
          const b = document.getElementById('gateBtn');
          return b ? b.style.display : '-';
        })(),
        gateReady: document.body.dataset.gateReady || null,
        dialog: (() => {
          const d = document.getElementById('gameDialog');
          return d && d.style.display !== 'none' ? String(d.textContent || '').slice(0, 24) : null;
        })(),
        voyage: document.body.dataset.voyage || null,
        nav: [...document.querySelectorAll('#worldNav button')]
          .map((x) => (x.textContent || '').trim())
          .filter(Boolean)
          .join(' / '),
        pos: (() => {
          const q = window.__ctx.player.pl.p;
          return q.x.toFixed(1) + ',' + q.z.toFixed(1);
        })(),
      }))
      .catch((e) => ({ err: String(e.message).slice(0, 100) }))
      .then((s) => console.log('  [dump ' + tag + '] ' + JSON.stringify(s)));

  // 采样器:每 120ms 读一次对话框,把可见文本映射成本站台词索引,并连带记下 sighting 那一刻在哪个世界、几点。
  // ③ 靠的就是这个时间戳:空档窗 = [重返那一刻, 重新走进站点那一刻),落在窗内的任何 sighting 都是旧世的尾巴。
  const installSampler = () =>
    p.evaluate((fp) => {
      const keys = fp.map((f) => ({ i: f.i, k: f.keys }));
      const match = (norm) => {
        for (const f of keys) if (f.k.some((kk) => norm.includes(kk))) return f.i;
        return -1;
      };
      window.__s = { seq: [], full: [], last: '' };
      clearInterval(window.__sTimer);
      window.__sTimer = setInterval(() => {
        const d = document.getElementById('gameDialog');
        const vis = d && d.style.display !== 'none';
        const norm = vis ? String(d.textContent || '').replace(/\s+/g, '') : '';
        if (!norm) return;
        const idx = match(norm);
        if (idx < 0) return;
        const w = (window.__ctx && window.__ctx.scene && window.__ctx.scene.activeWorld) || '?';
        const tag = 'L' + idx + '@' + w;
        if (tag !== window.__s.last) {
          window.__s.last = tag;
          window.__s.seq.push(idx);
          window.__s.full.push({ t: Date.now(), i: idx, w });
        }
      }, 120);
    }, FP);
  const sample = () =>
    p.evaluate(() => ({ seq: window.__s.seq, full: window.__s.full })).catch(() => null);
  const at = (a) => JSON.stringify((a || []).map((x) => x.i + '@' + x.w));

  // 现象级注射:直接在采样器读的那块 DOM 上造出"本站某一句上了屏"。
  // 不走 ctx.openDialog —— 那条路有剧情感忙判定,注射可能被静默丢弃,那时"判据没红"就分不清
  // 是【判据不咬】还是【注射没打进去】,而这两者必须分得开(与 late-planets 探针同一条理由)。
  const injectLine = (idx) =>
    p
      .evaluate((txt) => {
        window.__stopDismiss && window.__stopDismiss();
        const d = document.getElementById('gameDialog');
        if (!d) return 'miss';
        d.style.display = 'block';
        d.textContent = txt;
        return 'ok';
      }, FP[idx].keys[0])
      .then((r) => r === 'ok');

  // ============ 跳板:沙漠 → B612(石门)→ 返回沙漠 ============
  // 走真路线而不是直写 activeWorld:②③④ 全部依赖"世界真的切换过",enterWorld/back 才走 cancelWorld 那套。
  await p.evaluate(
    () => window.__ctx.kunlun.revealStarGate && window.__ctx.kunlun.revealStarGate()
  );
  await p.waitForTimeout(WAIT(800));
  await p.evaluate(() => {
    window.__ctx.player.pl.p.x = 0.1;
    window.__ctx.player.pl.p.z = 20;
  });
  await p.waitForTimeout(WAIT(1000));
  await p.evaluate(() => {
    window.__ctx.player.pl.p.x = 0.1;
    window.__ctx.player.pl.p.z = 55.2;
  });
  await p.waitForTimeout(WAIT(2500));
  await dump('pre-pad-click');
  await p.evaluate(() => {
    const b = document.getElementById('gateBtn');
    if (b && b.style.display !== 'none') b.click();
  });
  let inB612 = await p
    .waitForFunction(() => window.__ctx.scene.activeWorld === 'b612', null, {
      timeout: WAIT(60000),
    })
    .then(() => true)
    .catch(() => false);
  await dump('post-pad-click');
  ok('跳板:石门传送进 B612(为了走「返回沙漠」这条真人路)', inB612, 'world=' + (await world()));
  if (!inB612) {
    console.log('结果: ' + pass + ' 通过, ' + (fail + 5) + ' 失败(进不了 B612,后面全无从测起)');
    await finish(BREAK ? 3 : 1);
  }
  await p.waitForTimeout(WAIT(4000));
  // 进了 B612 才把章节推到 6 并落 earthStep —— 顺序反了就把上面那道石门跳板拆了(见 addInitScript 那段)
  await p.evaluate(() => {
    window.__ctx.kunlun.setChapter(6); // 封顶 6 = ENDING_GATE_CHAPTER ⇒ earthDue 的门开了
    window.__ctx.store.setNum('earthStep', 1); // 从 flower(第 2 站)起:2 句、约 18s 一条链
  });
  // 点「返回沙漠」(nav-buttons.js 在 page1 之后挂的那颗主按钮)
  await dump('in-b612-after-setChapter');
  const backLabel = await p
    .waitForFunction(
      () => {
        const b = [...document.querySelectorAll('#worldNav button')].find((x) =>
          /返回沙漠|Back to the desert/.test(x.textContent || '')
        );
        return b ? (b.textContent || '').trim() : null;
      },
      null,
      { timeout: WAIT(25000) }
    )
    .then((h) => h.jsonValue())
    .catch(() => null);
  if (backLabel)
    await p.evaluate((t) => {
      const b = [...document.querySelectorAll('#worldNav button')].find(
        (x) => (x.textContent || '').trim() === t
      );
      if (b) b.click();
    }, backLabel);
  const inDesert = await p
    .waitForFunction(() => window.__ctx.scene.activeWorld === 'main', null, {
      timeout: WAIT(60000),
    })
    .then(() => true)
    .catch(() => false);
  ok('「返回沙漠」把玩家送回了沙漠(地球之日的场地)', inDesert, '按钮=' + JSON.stringify(backLabel));
  if (!inDesert) {
    console.log('结果: ' + pass + ' 通过, ' + (fail + 4) + ' 失败(回不了沙漠,后面全无从测起)');
    await finish(BREAK ? 3 : 1);
  }
  const s0 = await st();
  ok(
    'earthDue 认这份存档:模块已接管且指向 ' + STATION + ' 站',
    !s0.missing && s0.due === true && s0.step === 1 && s0.stop === STATION,
    JSON.stringify(s0)
  );
  if (s0.missing || s0.stop !== STATION) {
    console.log('结果: ' + pass + ' 通过, ' + (fail + 3) + ' 失败(场地不对,后面全无从测起)');
    await finish(BREAK ? 3 : 1);
  }

  // ============ ① 走进站点真的开讲 ============
  await installSampler();
  const genBefore = (await st()).gen;
  await where(NEAR.x, NEAR.z);
  const spoke0 = await p
    .waitForFunction(
      () => window.__s.seq.length >= 1 && window.__ctx.scene.earthDayApi.state().mode === 'talking',
      null,
      { timeout: WAIT(30000) }
    )
    .then(() => true)
    .catch(() => false);
  const sA = await st();
  ok(
    '① 走进 ' + STATION + ' 站第 0 句真的上了屏(不是只在源码里排好了)',
    spoke0 && (await sample()).seq[0] === 0 && sA.stop === STATION,
    'seq=' +
      JSON.stringify((await sample()).seq) +
      ' ' +
      JSON.stringify(sA) +
      ' __earth=' +
      (await p.evaluate(() => window.__earth))
  );
  if (!spoke0) {
    console.log('结果: ' + pass + ' 通过, ' + (fail + 4) + ' 失败(第 0 句没上屏,后面全无从测起)');
    await finish(BREAK ? 3 : 1);
  }

  // ============ ② 讲到一半离开沙漠:当场换世 + 在飞计时器清空 ============
  await p.waitForTimeout(WAIT(900)); // 先让这一句的旧心跳落进槽里(arm 时刻 + hold + 2600 = 7200ms),再离场才测得到"有没有人摘它"
  // ⚠️ 离站必须发生在"被存档"之前:回程是 restore(离开那一刻的快照),所以要旧世那条链的到期落点
  //    正好掉进空档,就得先把人挪到站外、再离开 —— 反过来(先离场、回来再挪)会被 restore 按回 4m 内,
  //    新链在落地后 0.1s 就开讲,窗口根本不存在(2026-10-17 第一版就是这么写的,③ 恒绿是假绿)。
  await where(AWAY.x, AWAY.z);
  const enterRc = await p.evaluate(
    (sp) => window.__ctx.scene.enterWorld('b612', { snapshot: { camera: null, player: sp } }),
    SP
  );
  // ⚠️ 这里等的**不是**"activeWorld 变成 b612"(那句在 commit 中间就成立,切换其实还没跑完),
  // 而是"这一趟真的落地":transitioning 归 false ∧ 模块的离场分支确实执行过(mode 从 talking 变 idle)。
  // 只等前者的那版(2026-10-17 第 3 跑)会拿到一次假的离开:回程被 transitioning 拒掉,
  // "在外"窗口一帧都没跑过 ⇒ bump 从未发生 ⇒ ②③④ 连红而 ⑤ 假绿。路线没走到就不得给判据下结论。
  const settled = await p
    .waitForFunction(
      () =>
        !window.__ctx.scene.worldManager.transitioning &&
        window.__ctx.scene.activeWorld === 'b612' &&
        window.__ctx.scene.earthDayApi.state().mode === 'idle',
      null,
      { timeout: WAIT(30000) }
    )
    .then(() => true)
    .catch(() => false);
  const goneB612 = settled;
  ok(
    '路线:这一趟真的离开了沙漠(切换跑完,且模块的离场分支确实执行过)',
    goneB612,
    'enterWorld=' +
      JSON.stringify(enterRc) +
      ' ' +
      JSON.stringify(await st()) +
      ' spawn=' +
      JSON.stringify(SP.position)
  );
  if (!settled) {
    console.log(
      '结果: ' + pass + ' 通过, ' + (fail + 4) + ' 失败(没真离开沙漠 ⇒ ②③④ 无从测起,不给判据下结论)'
    );
    await finish(BREAK ? 3 : 1);
  }
  if (BREAK === 'pending') {
    // 读数级注射:把 pending 改成"还有 1 只在飞"(机制上等价于 bump 没掐干净)⇒ ② 必须因此红
    injected = await p.evaluate(() => {
      const api = window.__ctx.scene.earthDayApi;
      if (!api || typeof api.state !== 'function' || api.__stubbed) return false;
      const real = api.state;
      api.__stubbed = true;
      api.state = () => Object.assign({}, real(), { pending: 1 });
      return true;
    });
  }
  const sLeft = await st();
  ok(
    '② ★讲到一半离开沙漠:当场换世(gen 变大)且在飞计时器清空(pending=0)',
    goneB612 && sLeft.gen > genBefore && sLeft.pending === 0,
    'gen ' + genBefore + '→' + sLeft.gen + ' pending=' + sLeft.pending + ' mode=' + sLeft.mode
  );
  await stopAfterBreak('pending');

  // ============ ③ 空档:重返后人在 44m 外,旧世的一句都不许上屏 ============
  await p.evaluate(() => window.__ctx.scene.toMainWorld());
  const cameHome = await p
    .waitForFunction(
      () =>
        window.__ctx.scene.activeWorld === 'main' && !window.__ctx.scene.worldManager.transitioning,
      null,
      { timeout: WAIT(60000) }
    )
    .then(() => true)
    .catch(() => false);
  const gapStart = Date.now();
  const homePos = await p.evaluate(() => {
    const q = window.__ctx.player.pl.p;
    return { x: Math.round(q.x), z: Math.round(q.z) };
  });
  ok(
    '③a 重返沙漠且 restore 把人落在站外(4m 内才开讲 ⇒ 这段空档里这一站不该有任何一句)',
    cameHome && Math.hypot(homePos.x - NEAR.x, homePos.z - NEAR.z) > 10,
    'pos=' +
      JSON.stringify(homePos) +
      ' 距站=' +
      Math.hypot(homePos.x - NEAR.x, homePos.z - NEAR.z).toFixed(1) +
      'm ' +
      JSON.stringify(await st())
  );
  await p.waitForTimeout(WAIT(GAP_MS));
  if (BREAK === 'gap') injected = await injectLine(1); // 造出"旧世心跳在空档里把第 1 句弹上屏"
  const gapEnd = Date.now();
  const gapSample = await sample();
  const inGap = (gapSample.full || []).filter((x) => x.t >= gapStart && x.t <= gapEnd);
  ok(
    '③ ★重返后那 ' + GAP_MS + 'ms 空档里,' + STATION + ' 一句都没上屏(旧写法正是这里冒头)',
    inGap.length === 0,
    '窗内=' + at(inGap) + ' 全部=' + at(gapSample.full)
  );
  await stopAfterBreak('gap');

  // ============ ④ 重新走进站点:从第 0 句重讲,索引严格 +1 ============
  await p.evaluate(() => {
    window.__s.seq = [];
    window.__s.full = [];
    window.__s.last = '';
  });
  await where(NEAR.x, NEAR.z);
  const rear = await p
    .waitForFunction(() => window.__ctx.scene.earthDayApi.state().mode === 'talking', null, {
      timeout: WAIT(20000),
    })
    .then(() => true)
    .catch(() => false);
  const genB = (await st()).gen;
  await p
    .waitForFunction(() => window.__s.seq.length >= 1, null, { timeout: WAIT(20000) })
    .catch(() => {});
  // 观察窗覆盖整条链(2 句 ≈ 18.3s):注射点在"第 1 句已经上了屏"之后,那正是旧世尾巴会插进来的位置
  const t0 = Date.now();
  let doubled = false;
  while (Date.now() - t0 < WAIT(26000)) {
    const sq = (await sample()).seq;
    if (BREAK === 'double' && !doubled && sq.length >= 2) {
      doubled = true;
      injected = await injectLine(0);
    }
    await p.waitForTimeout(1000);
  }
  const seqB = (await sample()).seq;
  const mono = seqB.every((v, i) => i === 0 || v === seqB[i - 1] + 1);
  ok(
    '④a 重返用的是与首访不同的一世:gen 大于离场前',
    genB > genBefore,
    'gen 首访=' + genBefore + ' 离场后=' + sLeft.gen + ' 重返=' + genB
  );
  ok('④b 重返从第 0 句重新讲起', rear && seqB[0] === 0, 'seq=' + JSON.stringify(seqB));
  ok(
    '④ ★整段观察里台词索引严格 +1(两条链同时在讲就会跳号或重复)',
    mono && seqB.length >= 2,
    'seq=' + JSON.stringify(seqB) + ' 长度=' + seqB.length
  );
  await stopAfterBreak('double');

  // ============ ⑤ 走完这一站:存档恰好 +1,下一站是第 3 站 ============
  // 等的是终态(step 真的动了),不是"再睡 20s"—— 与 lib-ws-guard / gltf-cdn-fallback 那两条同一套纪律。
  const stepped = await p
    .waitForFunction(() => window.__ctx.scene.earthDayApi.state().step >= 2, null, {
      timeout: WAIT(45000),
    })
    .then(() => true)
    .catch(() => false);
  const s5pre = await st();
  if (BREAK === 'skip') {
    // 现象级注射:advance 已经跑过,再把存档多推一格 ⇒ 观测面就是"一次跳两站"。
    // 路线没走到(step 还不是 2)时绝不硬打 —— 那属于 INJECT_MISS,不许冒充"判据不咬"。
    if (stepped && s5pre.step === 2) {
      injected = await p.evaluate((n) => {
        if (!window.__ctx.store || typeof window.__ctx.store.setNum !== 'function') return false;
        window.__ctx.store.setNum('earthStep', n);
        return true;
      }, s5pre.step + 1);
    }
  }
  const s5 = await st();
  ok(
    '⑤ ★这一站走完:earthStep 恰好 +1(1→2)、下一站指到 ' +
      NEXT_STATION +
      '(跳两站就是旧世那条链也 advance 了一遍)',
    stepped && s5.step === 2 && s5.stop === NEXT_STATION && s5.mode === 'walking',
    JSON.stringify(s5)
  );
  await stopAfterBreak('skip');

  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  await finish(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('探针异常: ' + (e && e.message ? e.message : e));
  process.exit(2);
});
