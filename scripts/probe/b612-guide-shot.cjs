// b612-guide-shot.cjs — B612 岛内截图:确认小王子/星球在画面中的位置,为浮光箭头选锚点
const path = require('path'),
  fs = require('fs'),
  os = require('os'),
  { spawn } = require('child_process');
const { launch } = require('./browser.js');
const ROOT = path.join(__dirname, '..', '..'),
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'b6guide-')),
  PORT = process.env.B6_GUIDE_PORT || 3291;

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
  const child = await start();
  const URL = 'http://localhost:' + PORT + '/';
  const b = await launch(['--autoplay-policy=no-user-gesture-required']);
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.addInitScript(() => {
    try {
      sessionStorage.setItem('nickPopOff', '1');
      localStorage.setItem('kunlunWelcomed', String(Date.now()));
      localStorage.setItem('b612Scene2', '1');
      localStorage.setItem('b612Page1', '1');
      localStorage.setItem('b612PlanetChapter', '2');
    } catch (e) {}
  });
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('#b612Gate', { timeout: 90000 });
  await p.evaluate(() => {
    const c = document.getElementById('gAgreeChk') || document.createElement('input'); // 2026-10-03 起闸门无勾选框
    c.checked = true;
    c.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.click('#b612Gate .gEnter');
  await p.waitForFunction(() => !document.getElementById('b612Gate'), null, { timeout: 15000 });
  await p.waitForSelector('#b612film', { timeout: 20000 });
  await p.waitForTimeout(1000);
  await p.click('#b612film #fSkip');
  await p.waitForFunction(() => !document.getElementById('b612film'), null, { timeout: 20000 });
  await p.waitForTimeout(2000);
  await p.click('#genderOv button:has-text("女")').catch(() => {});
  await p.evaluate(() => {
    window.__autoChoice = setInterval(() => {
      const el = document.querySelector('.gs-choice');
      if (el && el.offsetParent) el.click();
    }, 1200);
  });
  await p.evaluate(() => window.__ctx.kunlun.revealStarGate && window.__ctx.kunlun.revealStarGate());
  await p.waitForTimeout(800);
  // 2026-10-10 预置补丁(坑②/③,return-black 同款):对白开着时进门圈的 fire 被守卫吃掉
  // 一次且 gateArmed 解除;主线对白 autoHide:0 还要点「继续 →」。自愈循环:选项→旅途卡
  // 「再待一会儿」→继续,全收束才进圈,直到入梦。
  await p.evaluate(() => {
    const iv = setInterval(() => {
      try {
        const ctx = window.__ctx;
        if ((ctx.scene.activeWorld || '') !== 'main') {
          clearInterval(iv);
          return;
        }
        const stay = document.querySelector('#voyage .vy-stay');
        if (stay) {
          stay.click();
          return;
        }
        const d = document.getElementById('gameDialog');
        const open = d && d.style.display !== 'none';
        if (open) {
          const c = d.querySelector('.gs-choice');
          if (c) {
            c.click();
            return;
          }
          const n = d.querySelector('.gs-next');
          if (n && n.style.display !== 'none') n.click();
        }
        const q = ctx.player.pl.p;
        const busy = open || !!(ctx.ui.dialogOpen && ctx.ui.dialogOpen()) || !!(ctx.overlay && ctx.overlay.anyOpen());
        q.x = 0.1;
        q.z = busy ? 70 : 56;
      } catch (e) {}
    }, 900);
    setTimeout(() => clearInterval(iv), 120000);
  });
  await p.waitForFunction(() => window.__ctx.scene.activeWorld === 'b612', null, { timeout: 120000 });
  await p.waitForTimeout(6000); // 等模型/相机稳定
  // 断言:B612 岛内小王子信标+悬浮箭已立(出生点距原点 8.5m > 5m)
  const b612Guide = await p.evaluate(() => {
    const sc = window.__ctx.scene.worldManager.getWorld('b612').scene;
    const find = (n) => {
      let f = null;
      sc.traverse((o) => {
        if (o.name === n) f = o;
      });
      return !!f;
    };
    return { beacon: find('storyBeaconPrince'), arrow: find('guideArrowPrince') };
  });
  console.log('b612 guide:', JSON.stringify(b612Guide));
  // 剧情罗盘:B612 内应显示「小王子」+ 距离
  const comp1 = await p.evaluate(() => {
    const el = document.getElementById('storyCompass');
    return el ? { shown: el.style.display !== 'none', text: el.textContent } : null;
  });
  console.log('compass(b612):', JSON.stringify(comp1));
  if (!b612Guide.beacon || !b612Guide.arrow) {
    console.error('FAIL: B612 信标/箭头未立');
    child.kill();
    process.exit(1);
  }
  // 关掉可能挡视线的对话框再截
  await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(TMP, 'b612-spawn.png') });
  console.log('shot1(spawn):', path.join(TMP, 'b612-spawn.png'));
  // 原地环视一周找小王子:转向 origin
  const shots = [];
  for (let i = 0; i < 4; i++) {
    await p.evaluate((k) => {
      const q = window.__ctx.player.pl;
      q.yaw = (k * Math.PI) / 2;
      const qq = q.p;
      qq.x = -1.5;
      qq.z = -8.5;
      qq.y = 2;
    }, i);
    await p.waitForTimeout(1200);
    const f = path.join(TMP, 'b612-look' + i + '.png');
    await p.screenshot({ path: f });
    shots.push(f);
  }
  console.log('shots:', shots.join('\n'));
  // 额外:把玩家放到原点附近近看
  await p.evaluate(() => {
    const q = window.__ctx.player.pl;
    q.p.x = 0;
    q.p.z = 4;
    q.yaw = 0;
  });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: path.join(TMP, 'b612-near.png') });
  console.log('shot-near:', path.join(TMP, 'b612-near.png'));
  // 走近原点 5m 内 → 箭头应自动撤
  const afterNear = await p.evaluate(() => {
    window.__ctx.player.pl.p.x = 0;
    window.__ctx.player.pl.p.z = 2;
    return new Promise((res) =>
      setTimeout(() => {
        const sc = window.__ctx.scene.worldManager.getWorld('b612').scene;
        let f = null;
        sc.traverse((o) => {
          if (o.name === 'guideArrowPrince') f = o;
        });
        res(!!f);
      }, 500)
    );
  });
  console.log('near-origin arrow removed:', !afterNear);
  // 回主世界:远离星门 → 星门信标+箭应立起
  await p.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const back = btns.find(
      (x) =>
        x.style.display !== 'none' &&
        (x.textContent.includes('返回沙漠') || /back to the desert/i.test(x.textContent))
    ); // 2026-10-10:按钮早已改名(返回沙漠/Back to the desert),双语匹配
    if (back) back.click();
  });
  await p.waitForFunction(() => (window.__ctx.scene.activeWorld || 'main') === 'main', null, { timeout: 20000 });
  await p.waitForTimeout(1500);
  // 先传送到出生点(距星门 29m > 12m 阈值),再断言信标+箭立起
  await p.evaluate(() => {
    const q = window.__ctx.player.pl;
    q.p.x = 0;
    q.p.z = 27;
    q.yaw = 0;
  });
  await p.waitForTimeout(600);
  const gateGuide = await p.evaluate(() => {
    let beacon = null,
      arrow = null;
    window.__ctx.scene.s.traverse((o) => {
      if (o.name === 'storyBeaconStarGate') beacon = o;
      if (o.name === 'guideArrowStarGate') arrow = o;
    });
    const q = window.__ctx.player.pl.p;
    return {
      beacon: !!beacon,
      arrow: !!arrow,
      dist: Math.round(Math.hypot(q.x - 0.1, q.z - 56)),
    };
  });
  console.log('gate guide:', JSON.stringify(gateGuide));
  // 进入按钮交接:29m 隐 → 6m 现(与光柱 15m 门控衔接)
  const btnState = () =>
    p.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) =>
        x.textContent.includes('进入 B612')
      );
      return b ? b.style.display : 'missing';
    });
  const btnFar = await btnState();
  await p.evaluate(() => {
    const q = window.__ctx.player.pl;
    q.p.x = 0.1;
    q.p.z = 50;
  });
  await p.waitForTimeout(600);
  const btnNear = await btnState();
  console.log('portal button far(29m):', btnFar, '| near(6m):', btnNear);
  // 剧情罗盘:主世界应显示「石门」+ 距离 ~29m,且方向指针有旋转量
  const comp2 = await p.evaluate(() => {
    const el = document.getElementById('storyCompass');
    if (!el) return null;
    const ar = el.firstElementChild;
    return {
      shown: el.style.display !== 'none',
      text: el.textContent,
      rot: ar ? ar.style.transform : '',
    };
  });
  console.log('compass(main):', JSON.stringify(comp2));
  const f2 = path.join(TMP, 'main-gate-guide.png');
  await p.waitForTimeout(1500);
  await p.screenshot({ path: f2 });
  console.log('shot-gate:', f2);
  const pass = !afterNear && gateGuide.beacon && gateGuide.arrow && btnFar === 'none' && btnNear === 'block';
  console.log(pass ? 'PASS 指引三断言全过' : 'FAIL');
  child.kill();
  process.exit(pass ? 0 : 1);
})().catch((e) => {
  console.error('PROBE FAIL', e.message);
  process.exit(1);
});
