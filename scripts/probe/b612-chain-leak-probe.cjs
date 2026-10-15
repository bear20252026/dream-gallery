// b612-chain-leak-probe.cjs — M-03 专项探针:故事链在"中途离场"后不许把台词漏到新场景
// 覆盖(2026-10-14 第六轮外部审计整改):
//   进 326 → chainA 第一句正开着对话框 → ctx.scene.leaveWorld() 回 B612。
//   离开时 cancelWorld 会关掉对话框且**跳过 onDone**,所以"这句说完了"只能由心跳守护判定;
//   老写法的心跳是裸 setTimeout,不认世界 ⇒ 到点就在新场景(B612)里弹出下一句台词。
//   票据化后 bump() 清掉心跳,那句台词永远不该出现。
// 判据用台词指纹(从 story-text.mjs 直接读 chainA 剩余各句的 en),不用"有没有对话框"——
// B612 自己也会说话,拿"任意对话"当泄漏会误报。
// 用法:node scripts/probe/b612-chain-leak-probe.cjs(自起 :3281 服务;PW_BROWSER=chromium 换浏览器)
// 退出码 0=全绿。
const path = require('path'),
  fs = require('fs'),
  os = require('os'),
  { spawn } = require('child_process');
const { launch } = require('./browser.js');

const ROOT = path.join(__dirname, '..', '..');
const PORT = process.env.LEAK_PROBE_PORT || 3281;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'm03-leak-'));

// 泄漏指纹:chainA/chainB 里"离场时正开着的那一句"之后的每一句(闸门默认英文,双语都认)
const LEAK_PATTERNS = [
  'queer hat|帽子真古怪',
  'hat for salutes|致意用的帽子',
  'Clap your hands|双手合起来拍',
  'make the hat come down|才会放下来',
];
const FIRST_LINE = 'admirer|仰慕者'; // 离场前应当正开着的那句

function start() {
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
  const local = !process.env.BASE_URL;
  const URL = process.env.BASE_URL || 'http://localhost:' + PORT + '/';
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
  p.on('pageerror', (e) => {
    if (!/dynamically imported module/.test(e.message)) console.log('  [pageerror] ' + e.message);
  });
  await p.addInitScript(() => {
    try {
      sessionStorage.setItem('nickPopOff', '1');
      sessionStorage.setItem('dialogVoiceOff', String(Date.now())); // 静音:autoHide 纯文本节奏,探针确定性
      localStorage.setItem('kunlunWelcomed', String(Date.now()));
      localStorage.setItem('b612Scene2', '1');
      localStorage.setItem('b612Page1', '1');
      localStorage.setItem('b612PlanetChapter', '1'); // 325 已完成 ⇒ 导航直指 326
    } catch (e) {}
    // 目击卡是可选的,探针按"玩家跳过"处理,别让它锁住链子
    setInterval(() => document.querySelector('#witnessCard .wc-skip')?.click(), 500);
  });
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('#b612Gate', { timeout: 90000 });
  await p.evaluate(() => {
    const c = document.getElementById('gAgreeChk') || document.createElement('input');
    c.checked = true;
    c.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.click('#b612Gate .gEnter');
  await p.waitForFunction(() => !document.getElementById('b612Gate'), null, { timeout: 15000 });
  await p.waitForSelector('#b612film', { timeout: 20000 });
  await p.waitForTimeout(1200);
  await p.click('#b612film #fSkip');
  await p.waitForFunction(() => !document.getElementById('b612film'), null, { timeout: 20000 });
  await p.click('#genderOv button:has-text("女")').catch(() => {});

  // 沙漠 → B612(石门;探针跳过 scene3,须手动补「石门已亮」)
  const dump = async (tag) => {
    const s = await p
      .evaluate(() => ({
        w: window.__ctx.scene.activeWorld,
        nav: [...document.querySelectorAll('#worldNav button')]
          .map((x) => x.textContent)
          .join(' / '),
        pad: (() => {
          const b = document.getElementById('gateBtn');
          return b ? b.style.display : '-';
        })(),
        pos: (() => {
          const q = window.__ctx.player.pl.p;
          return q.x.toFixed(1) + ',' + q.z.toFixed(1);
        })(),
        dlg: (() => {
          const d = document.getElementById('gameDialog');
          return d && d.style.display !== 'none'
            ? String(d.textContent || '')
                .replace(/\s+/g, ' ')
                .slice(0, 48)
            : '';
        })(),
      }))
      .catch((e) => ({ err: e.message.slice(0, 120) }));
    console.log('  [dump ' + tag + '] ' + JSON.stringify(s));
  };
  // 清场:开局可能挂着等玩家回应的对话(带选项的永不自动关)。lock 队列一旦被人堵住,
  // 石门按钮不亮、自动传送的 onclick 也被 dialogOpen 挡回 —— 326 的链子更不会有开始的机会。
  await p.evaluate(() => {
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
  await p
    .waitForFunction(() => !(window.__ctx.ui.dialogOpen && window.__ctx.ui.dialogOpen()), null, {
      timeout: 90000,
    })
    .catch(() => {});
  await p.waitForTimeout(1500);
  await dump('boot');
  await p.evaluate(
    () => window.__ctx.kunlun.revealStarGate && window.__ctx.kunlun.revealStarGate()
  );
  await p.waitForTimeout(800);
  // 石门是"从圈外走进来才自动传送"(planet-logic.gateStep:触发即解除)。
  // 开局 world:changed 会把 gateArmed 落回 false,直接把人摆到门上并不传 —— 先退到圈外重新武装。
  await p.evaluate(() => {
    window.__ctx.player.pl.p.x = 0.1;
    window.__ctx.player.pl.p.z = 20;
  });
  await p.waitForTimeout(1000);
  await p.evaluate(() => {
    window.__ctx.player.pl.p.x = 0.1;
    window.__ctx.player.pl.p.z = 55.2;
  });
  await p.waitForTimeout(2500);
  await dump('teleport');
  // 兜底:走近没自动传(半径/帧序变了),就点门前那颗「✦ 进入 B612」——玩家真正会点的按钮
  await p.evaluate(() => {
    const b = document.getElementById('gateBtn');
    if (b && b.style.display !== 'none') b.click();
  });
  await p.waitForFunction(() => window.__ctx.scene.activeWorld === 'b612', null, {
    timeout: 25000,
  });
  await dump('b612');
  await p
    .waitForFunction(
      () => (document.getElementById('worldNav') || {}).style.display === 'flex',
      null,
      {
        timeout: 15000,
      }
    )
    .catch(() => {});
  await p.evaluate(() => {
    [...document.querySelectorAll('#worldNav button')]
      .find((x) => /前往 326|Visit 326/.test(x.textContent))
      ?.click();
  });
  await p.waitForTimeout(2500);
  await dump('after-nav-326');
  await p.waitForFunction(() => window.__ctx.scene.activeWorld === 'king326', null, {
    timeout: 25000,
  });
  // 进了 326 就收手:此后台词是链子自己排的,探针要在"第一句刚上屏"时离场,不是被人点着走
  await p.evaluate(() => window.__stopDismiss && window.__stopDismiss());
  console.log('— 已进 326 —');

  // 采样器:每 200ms 记一次「世界 / 对话框可见 / 文本指纹」,离场后的泄漏全在这里现形
  await p.evaluate(
    ({ pats }) => {
      const re = pats.map((s) => new RegExp(s, 'i'));
      window.__leak = { samples: 0, hit: null, stages: [], dlgOpen: 0 };
      setInterval(() => {
        const w = window.__ctx.scene.activeWorld;
        const d = document.getElementById('gameDialog');
        const vis = !!d && d.style.display !== 'none';
        const txt = vis ? String(d.textContent || '') : '';
        window.__leak.samples++;
        if (vis) window.__leak.dlgOpen++;
        if (txt && re.some((r) => r.test(txt))) {
          if (w !== 'king326' && !window.__leak.hit)
            window.__leak.hit = { w, txt: txt.slice(0, 160) };
        }
        const st = window.__scene7a && window.__scene7a.state && window.__scene7a.state.stage;
        const last = window.__leak.stages[window.__leak.stages.length - 1];
        if (st && st !== last) window.__leak.stages.push(st);
      }, 200);
    },
    { pats: LEAK_PATTERNS }
  );

  // 等 chainA 真的把第一句摆在屏幕上(进 326 先弹的是星球导语,stage 已置 chainA 但台词还没开口 ——
  // 只认 stage 会在导语上误判离场,那时无心跳可炸)
  const opened = await p
    .waitForFunction(
      (first) => {
        const d = document.getElementById('gameDialog');
        const t = d && d.style.display !== 'none' ? String(d.textContent || '') : '';
        return (
          window.__scene7a &&
          window.__scene7a.state &&
          window.__scene7a.state.stage === 'chainA' &&
          new RegExp(first, 'i').test(t)
        );
      },
      FIRST_LINE,
      { timeout: 120000 }
    )
    .then(() => true)
    .catch(() => false);
  ok(
    '[前置] 326 chainA 第一句已上屏',
    opened,
    'stage=' + (await p.evaluate(() => window.__scene7a?.state?.stage))
  );
  if (!opened) {
    console.log('前置不成立,后面的判据没有意义 —— 退出');
    await b.close();
    if (child) child.kill();
    try {
      fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
    } catch (e) {}
    process.exit(1);
  }
  // 离场前最后一眼:直接读 DOM,不靠采样器(200ms 一拍,第一句可能正好落在两拍之间)
  const cur = await p.evaluate(() => {
    const d = document.getElementById('gameDialog');
    return {
      w: window.__ctx.scene.activeWorld,
      vis: !!d && d.style.display !== 'none',
      txt: d ? String(d.textContent || '').replace(/\s+/g, ' ') : '',
      stage: window.__scene7a && window.__scene7a.state && window.__scene7a.state.stage,
    };
  });
  ok(
    '[前置] 离场时开着的就是「仰慕者」那一句(且仍在 326)',
    cur.w === 'king326' && cur.vis && new RegExp(FIRST_LINE, 'i').test(cur.txt),
    'w=' + cur.w + ' stage=' + cur.stage + ' txt=' + cur.txt.slice(0, 60)
  );

  // 中途离场:走玩家真正会走的那条路(导航「← 返回 B612」= worldManager.back())
  await p.evaluate(() => window.__ctx.scene.leaveWorld());
  const back = await p
    .waitForFunction(() => window.__ctx.scene.activeWorld === 'b612', null, { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  ok('[离场] 回到 B612', back);

  // 观察窗:心跳最迟在「句长×65 + 2600」到点,取 16s 覆盖第一句之后的每一拍
  await p.waitForTimeout(16000);
  const after = await p.evaluate(() => ({
    hit: window.__leak.hit,
    stages: window.__leak.stages,
    samples: window.__leak.samples,
    world: window.__ctx.scene.activeWorld,
    stage: window.__scene7a && window.__scene7a.state && window.__scene7a.state.stage,
  }));
  ok(
    '[M-03 主判据] 离场后 16s 内没有把 326 的台词弹到 ' + after.world,
    !after.hit,
    after.hit ? JSON.stringify(after.hit) : ''
  );
  ok(
    '[M-03 链停住] stage 仍停在 chainA(没被心跳推着往下走)',
    after.stage === 'chainA',
    'stages=' + after.stages.join(',')
  );
  ok('[采样有效] 观察窗内至少取到 40 拍', after.samples >= 40, 'samples=' + after.samples);

  // 自愈:再进 326,链子必须从头讲一遍(bump 之后 arrivalDone 复位,别把这一章钉死)
  await p
    .waitForFunction(
      () => (document.getElementById('worldNav') || {}).style.display === 'flex',
      null,
      { timeout: 15000 }
    )
    .catch(() => {});
  await p.evaluate(() => {
    [...document.querySelectorAll('#worldNav button')]
      .find((x) => /前往 326|Visit 326|重返 326|Revisit 326/.test(x.textContent))
      ?.click();
  });
  const reentered = await p
    .waitForFunction(() => window.__ctx.scene.activeWorld === 'king326', null, { timeout: 25000 })
    .then(() => true)
    .catch(() => false);
  const replay = reentered
    ? await p
        .waitForFunction(
          (first) => {
            const d = document.getElementById('gameDialog');
            const t = d && d.style.display !== 'none' ? String(d.textContent || '') : '';
            return (
              window.__scene7a &&
              window.__scene7a.state &&
              window.__scene7a.state.stage === 'chainA' &&
              new RegExp(first, 'i').test(t)
            );
          },
          FIRST_LINE,
          { timeout: 120000 }
        )
        .then(() => true)
        .catch(() => false)
    : false;
  ok(
    '[自愈] 重回 326 后台本从头再讲',
    reentered && replay,
    'reentered=' + reentered + ' replay=' + replay
  );

  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  await b.close();
  if (child) child.kill();
  try {
    fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 });
  } catch (e) {
    console.log('  [清理] 临时目录留待系统回收:' + e.code);
  }
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('探针异常:', e.message);
  process.exit(1);
});
