// late-planets-visit-probe.cjs — C4 专项探针:328/329/330 这三颗星「每一趟进入」的生命周期
// 覆盖(2026-10-17 外部审计 C4;机制单测在 src/__tests__/visit-timers.test.js,接线判据在 late-planets-visit.test.js,
// 本探针补的是它们都够不到的那一层 —— 真场景、真 DOM、真计时器):
//   ① 328 chainA 说到第 1 句时 ctx.scene.leaveWorld() ⇒ 后续台词不许出现在 B612(M-03 那一族,回归护栏)
//      ②b 按"上屏那一刻 activeWorld 是哪个"判,不按"采样器见过这句没有"判 —— 见 ②b 那段注释
//   ② 离场即换世:gen 变大、pending 归零(旧写法只有一只模块级 speakTimer,三颗星共用,清不到玩法内部的计时器)
//   ③ 重返同一颗星(chainA 重新从第 0 句起,且索引序列严格 +1)——同世界快返时旧世代的尾巴若还在跑,
//      这条会跳号或重复(两条链同时在讲就是它)
//   ④ ★329 玩法进行中 lampHead.userData.manual === true;中途离场后必须回 false
//      旧写法只有"通关"那一条路归还(late-planets.js 原 :385),中途走掉 ⇒ 329 的路灯本会话永久不再听昼夜
//   ⑤ ★330 讲到一半走掉 ⇒ 面板从 DOM 摘掉、换世、计时器清空;重返 ⇒ 账本是空的
//      (4 件里点到第 1 件就摞下走人,旧世那半本账若回魂,重返时读到的按钮是 disabled 的)
// 判据用台词指纹(从 shared/story-text.mjs 现取 chainA 各句,不在本文件复制一份,防漂移)。
// 用法:node scripts/probe/late-planets-visit-probe.cjs(自起 :3299 服务,数据根隔离到临时目录)
//       BASE_URL=http://host:port/ 可打远端;PW_BROWSER=chromium 换浏览器
// 退出码 0=全绿。任一条红都会打出实测值,不是只打"失败"。
//
// 判据自证注射口(2026-10-17 补,治"这条探针会不会恒绿"那句欠账):
//   PROBE_BREAK=<name> 在页面上**造出该判据本该拦住的那个现象**,逼对应那条变红;红了才算它会咬。
//   正常验收不要设。跑到目标判据就地收尾,后面的段落与目标无关(省 5~8 分钟)。
//     · pending ⇒ 把 __latePlanets.state 的 pending 读数改成 1      ⇒ ②a 必须红 〔读数级〕
//     · leak    ⇒ 回 B612 后往对话框塞进 328 第 3 句的指纹          ⇒ ②b 必须红 〔现象级:台词真漏到别的星〕
//     · double  ⇒ 328 重返观察窗里塞进第 3 句(只讲到第 1 句)      ⇒ ③c 必须红 〔现象级:索引不再严格 +1〕
//     · manual  ⇒ 329 离场后把 lampHead.userData.manual 改回 true   ⇒ ④c 必须红 〔现象级:归还没发生〕
//     · ledger  ⇒ 330 重返后把账本第一颗按钮置 disabled             ⇒ ⑤e 必须红 〔现象级:旧世半本账回魂〕
//   注射模式下退出码反过来:0 = 目标确实红了,1 = ⚠️ 目标仍绿(这条判据不咬),
//   3 = 注射没打进去(目标元素不在场或路线没走到) —— 这三种结论分得很清,不会互相冒充。
//   ⚠️ pending 那条只是读数级:它证明 ②a 真在读 pending 字段,不证明"bump 一定发生"。
//      后者的证据在单测级注射(AGENTS.md 那 15 条),探针在页面上造不出"机制没跑"这个现象。
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
const BREAK = process.env.PROBE_BREAK || '';
// 每个注射名 → 它必须打红的那条判据的编号前缀(②a/②b/…,由 ok() 从判据名里摘出来对)
const BREAK_TARGET = { pending: '②a', leak: '②b', double: '③c', manual: '④c', ledger: '⑤e' };

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
const story = () => import(url.pathToFileURL(path.join(ROOT, 'src/shared/story-text.mjs')).href);
async function fingerprints(mod) {
  const m = await story();
  const norm = (s) =>
    String(s || '')
      .replace(/\s+/g, '')
      .slice(0, 18);
  return m[mod].chainA.map((it, i) => ({ i, keys: [norm(it.en), norm(it.zh)].filter(Boolean) }));
}

(async () => {
  if (BREAK && !BREAK_TARGET[BREAK]) {
    console.log(
      'PROBE_BREAK 取值不认识:' + BREAK + '(可用 ' + Object.keys(BREAK_TARGET).join('|') + ')'
    );
    process.exit(2);
  }
  const local = !process.env.BASE_URL;
  const BASE = process.env.BASE_URL || 'http://localhost:' + PORT + '/';
  const child = local ? await start() : null;
  let pass = 0,
    fail = 0;
  // 注射打了但目标没红 ≠ 注射没打进去 ≠ 判据不咬,三种结论各走各的退出码,不许互相冒充
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
    // 隔离用的临时数据根跑完就还回去(原先每次跑都留一地)。刚 kill 的 server 还攥着 g.json,
    // Windows 上第一刀常 EPERM ⇒ 半秒后重试一次;还不掉就把实值打出来,不静默吞。
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
  // 注射模式跑到目标判据就地收尾:后面那些段落与目标无关,等它们只是白烧几分钟
  const stopAfterBreak = async (id) => {
    if (!BREAK || BREAK !== id) return;
    if (!injected) await finish(3);
    await finish(reds.has(BREAK_TARGET[BREAK]) ? 0 : 1);
  };

  const BP = await fingerprints('SCENE8_BUSINESS', 1); // 328 chainA
  const LP = await fingerprints('SCENE8_LAMP', 1); // 329 chainA
  const GEO_ITEMS = (await story()).SCENE9_GEO.game.items.length; // 330 账本几件
  console.log(
    '指纹:328 chainA ' +
      BP.length +
      ' 句 / 329 chainA ' +
      LP.length +
      ' 句 / 330 账本 ' +
      GEO_ITEMS +
      ' 件'
  );
  console.log(
    BREAK
      ? '⚠️ 注射模式 PROBE_BREAK=' + BREAK + ' ⇒ 目标 ' + BREAK_TARGET[BREAK] + ' 必须红'
      : '注射模式:无'
  );

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
    await finish(BREAK ? 3 : 1);
  }
  await p.waitForTimeout(WAIT(6000)); // 首轮 tick + 世界资源就位

  // 采样器:每 120ms 看一次对话框,把可见文本映射成 chainA 索引,并**连带记下 sighting 那一刻在哪个世界**;
  // 同一句在同一世界只记一次(换成另一个世界还开着 ⇒ 再记一次,那正是"漏白"要看的那一下)。
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
          const w = (window.__ctx && window.__ctx.scene && window.__ctx.scene.activeWorld) || '?';
          const tag = 'L' + idx + '@' + w;
          if (tag !== window.__s.last) {
            window.__s.last = tag;
            window.__s.seq.push({ t: Date.now(), i: idx, w });
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
    p
      .evaluate(() => ({ seq: window.__s.seq.map((x) => x.i), full: window.__s.seq }))
      .catch(() => null);
  const state = (w) => p.evaluate((x) => window.__latePlanets.state(x), w);
  const resetSampler = () => p.evaluate(() => (window.__s.seq = []));
  // 现象级注射:直接在采样器读的那块 DOM 上造出"本链某一句上了屏"。
  // 故意不走 ctx.openDialog —— 那条路有 allowJourneyDialog 的剧情忙判定,注射可能被静默丢弃,
  // 那时"判据没红"就分不清是【判据不咬】还是【注射没打进去】,而这两者必须分得开。
  const injectLine = async (fp) =>
    p
      .evaluate((txt) => {
        window.__stopDismiss && window.__stopDismiss();
        const d = document.getElementById('gameDialog');
        if (!d) return 'miss';
        d.style.display = 'block';
        d.textContent = txt;
        return 'ok';
      }, fp.keys[0])
      .then((r) => r === 'ok');

  async function navTo(num) {
    // 等的是**这一章该出现的那颗按钮**,不是"导航里有没有按钮":后者在 setChapter 之前就已成立,
    // 抢跑一次就拿到 null 并且谁也没点 ⇒ 后面整段无从测起(2026-10-17 复跑就在这儿 flake)。
    const label = await p
      .waitForFunction(
        (n) => {
          const b = [...document.querySelectorAll('#worldNav button')].find((x) =>
            new RegExp('前往 ' + n + '|Visit ' + n + '|重返 ' + n + '|Revisit ' + n).test(
              x.textContent || ''
            )
          );
          return b ? (b.textContent || '').trim() : null;
        },
        num,
        { timeout: WAIT(25000) }
      )
      .then((h) => h.jsonValue())
      .catch(() => null);
    if (!label) return null;
    await p.evaluate((t) => {
      const b = [...document.querySelectorAll('#worldNav button')].find(
        (x) => (x.textContent || '').trim() === t
      );
      if (b) b.click();
    }, label);
    return label;
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
    await finish(BREAK ? 3 : 1);
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
  if (BREAK === 'pending') {
    // 读数级注射:把 pending 改成"还有 1 只在飞"(机制上等价于 bump 没掐干净),②a 必须因此红
    injected = await p.evaluate(() => {
      const h = window.__latePlanets;
      if (!h || typeof h.state !== 'function' || h.__stubbed) return false;
      const real = h.state;
      h.__stubbed = true;
      h.state = (w) => Object.assign({}, real(w), { pending: 1 });
      return true;
    });
  }
  const justLeft = await state('king328');
  await p.waitForFunction(() => window.__ctx.scene.activeWorld === 'b612', null, {
    timeout: WAIT(40000),
  });
  ok(
    '②a 离场即换世:gen 变大、pending 归零(计时器不再飞在外面)',
    justLeft.gen > genBefore && justLeft.pending === 0,
    'gen ' + genBefore + '→' + justLeft.gen + ' pending=' + justLeft.pending
  );
  await stopAfterBreak('pending');
  if (BREAK === 'leak') injected = await injectLine(BP[2]); // 造出"328 第 3 句漏到了 B612 的屏幕上"
  await p.waitForTimeout(WAIT(14000)); // 老写法:第 1 句 hold 16s,足够让尾巴在新场景里冒头
  const leaked = await readSampler();
  // 这条判据测的是命题本身,不是"采样器看见过这句没有":按下 leaveWorld 那一瞬,328 的第 N 句可能正开着,
  // 那句话是**在这颗星上**上的屏,不是漏白(2026-10-17 三个注射并发跑时 ②b 自己红了两次,实测 `seq=[1]`
  // 就是这个形状 —— 旧判据比它宣称的命题更严,是个 flake 源,不是隔离失效)。
  // 真漏白的形状:世界已经换成 b612,那句话还在屏上 ⇒ 采样器按 (句, 世界) 去重,会带 @b612 再记一次。
  const leakIn = (leaked.full || []).filter((x) => x.w !== 'king328');
  const at = (a) => JSON.stringify(a.map((x) => x.i + '@' + x.w));
  ok(
    '②b ★回到 B612 后 14s 内,328 的 chainA 后续一句都没在别的世界上屏',
    leakIn.length === 0,
    '窗外=' + at(leakIn) + ' 全部=' + at(leaked.full || [])
  );
  await stopAfterBreak('leak');

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
  let doubled = false;
  while (Date.now() - t0 < WAIT(26000)) {
    // 把第 3 句的指纹再打上屏一次 ⇒ 索引序列出现非 +1 的跳号,正是"两条链同时在讲"的观测面
    // (实测:探针自己的 600ms 点击节拍会把 chainA 推完 0..4,注射落在它后面 ⇒ [0,1,2,3,4,2])
    if (BREAK === 'double' && !doubled && Date.now() - t0 > WAIT(12000)) {
      doubled = true;
      injected = await injectLine(BP[2]);
    }
    await p.waitForTimeout(1000);
  }
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
  await stopAfterBreak('double');

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
    if (BREAK === 'manual') {
      // 现象级注射:离场已经跑过 teardown 了,再把这盏灯的 manual 摁回 true ⇒ 观测面就是"没归还"
      injected = await p.evaluate(() => {
        const w = window.__ctx.scene.worldManager.getWorld('king329');
        const head = w && w.scene.getObjectByName('lampHead');
        if (!head) return false;
        head.userData.manual = true;
        return true;
      });
    }
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
    await stopAfterBreak('manual');
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
    // 路线没走到 329 ⇒ 注射无处可打,这里不能把"无从测起"混报成"判据不咬"
    await stopAfterBreak('manual');
  }

  // ============ ⑤ 330 地理学家:讲到一半走掉 ⇒ 面板摘除;重返 ⇒ 账本必须是空的 ============
  // 这一段的动机:上一批只把 330 测到"接线判据"那一层(源码扫描),真玩法一次没走过。
  // 面板由模块级 `gameEl` 承载,离场时靠 tick 里那次 closePanel —— 它属于"每一趟进入"的收尾,
  // 归因与 ④ 那条路灯一样:旧世那半本账若跟着回来,重返读到的就是 disabled 的按钮 + 已写的旁注。
  await p.evaluate(() => window.__ctx.kunlun.setChapter(5)); // 330 的 cfg.idx
  const label330 = await navTo(330);
  const in330 = await p
    .waitForFunction(() => window.__ctx.scene.activeWorld === 'king330', null, {
      timeout: WAIT(45000),
    })
    .then(() => true)
    .catch(() => false);
  ok('导航进入 330 地理学家之星', in330, '按钮=' + JSON.stringify(label330));
  if (in330) {
    const gen330 = (await state('king330')).gen;
    const toGeo = await p
      .waitForFunction(() => window.__late.king330 === 'game', null, { timeout: WAIT(120000) })
      .then(() => true)
      .catch(() => false);
    ok(
      '⑤a 330 讲 B612 的账本玩法真的开了(等 stage=game;chainA 有 9 句,这里等的是真时长)',
      toGeo,
      'stage=' + (await p.evaluate(() => window.__late.king330))
    );
    const ledger0 = await p.evaluate((n) => {
      const btns = [...document.querySelectorAll('#planetGame button[data-item]')];
      return {
        present: !!document.getElementById('planetGame'),
        count: btns.length,
        expect: n,
        disabled: btns.filter((x) => x.disabled).length,
      };
    }, GEO_ITEMS);
    ok(
      '⑤b 账本 ' + GEO_ITEMS + ' 件真摆到了 DOM 上(不只是状态字段在动)',
      ledger0.present && ledger0.count === ledger0.expect && ledger0.disabled === 0,
      JSON.stringify(ledger0)
    );
    const clicked = await p.evaluate(() => {
      const b = document.querySelector('#planetGame button[data-item]');
      if (!b) return false;
      b.click();
      return true;
    });
    await p.waitForTimeout(WAIT(700));
    const led1 = await p.evaluate(() => ({
      stage: window.__late.king330,
      disabled: [...document.querySelectorAll('#planetGame button[data-item]')].filter(
        (x) => x.disabled
      ).length,
      marks: document.querySelectorAll('#planetGame .pg-ledger span').length,
    }));
    ok(
      '⑤c ★点一件记一件:stage 进 game:1、那颗按钮按下后 disabled、旁注落进账本',
      clicked && led1.stage === 'game:1' && led1.disabled === 1 && led1.marks === 1,
      JSON.stringify(led1)
    );
    await p.evaluate(() => window.__ctx.scene.leaveWorld());
    await p.waitForFunction(() => window.__ctx.scene.activeWorld === 'b612', null, {
      timeout: WAIT(40000),
    });
    await p.waitForTimeout(WAIT(1500));
    const gone = await p.evaluate(() => {
      const s = window.__latePlanets.state('king330');
      return {
        panel: !!document.getElementById('planetGame'),
        flag: document.body.dataset.planetGame || null,
        gen: s.gen,
        pending: s.pending,
      };
    });
    ok(
      '⑤d ★讲到一半走掉:面板从 DOM 摘掉、换世、在飞计时器清空',
      !gone.panel && !gone.flag && gone.pending === 0 && gone.gen > gen330,
      JSON.stringify(gone) + ' gen ' + gen330 + '→' + gone.gen
    );
    const backLabel = await navTo(330);
    const back = await p
      .waitForFunction(
        () => {
          const el = document.getElementById('planetGame');
          return !!(el && el.querySelector('button[data-item]'));
        },
        null,
        { timeout: WAIT(120000) }
      )
      .then(() => true)
      .catch(() => false);
    if (BREAK === 'ledger') {
      // 现象级注射:新一世的面板已经摆好,把第一颗摁成 disabled ⇒ 观测面就是"旧世半本账回魂"
      injected = await p.evaluate(() => {
        const b = document.querySelector('#planetGame button[data-item]');
        if (!b) return false;
        b.disabled = true;
        return true;
      });
    }
    const led2 = await p.evaluate(() => {
      const btns = [...document.querySelectorAll('#planetGame button[data-item]')];
      return {
        count: btns.length,
        disabled: btns.filter((x) => x.disabled).length,
        marks: document.querySelectorAll('#planetGame .pg-ledger span').length,
      };
    });
    ok(
      '⑤e ★重返的面板是一世的新账本:按钮全可用、零旁注(讲到第 1 件那一世不许跟着回来)',
      back && led2.count === GEO_ITEMS && led2.disabled === 0 && led2.marks === 0,
      JSON.stringify(led2) + ' 按钮=' + JSON.stringify(backLabel)
    );
    await stopAfterBreak('ledger');
  } else {
    ok('⑤a 330 讲 B612 的账本玩法真的开了', false, '没进得去 330');
    ok('⑤b 账本 ' + GEO_ITEMS + ' 件真摆到了 DOM 上', false, '没进得去 330');
    ok('⑤c ★点一件记一件', false, '没进得去 330');
    ok('⑤d ★讲到一半走掉:面板摘除、换世、计时器清空', false, '没进得去 330');
    ok('⑤e ★重返的面板是一世的新账本', false, '没进得去 330');
    await stopAfterBreak('ledger');
  }

  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  await finish(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('探针异常: ' + (e && e.message ? e.message : e));
  process.exit(2);
});
