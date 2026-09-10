// b612-story-chain-probe.cjs — 剧本对话链专项探针(2026-09-09 容错改造验收)
// 覆盖:crash-site 叫醒词(prince 视觉类型)→ 第2场画羊四轮(doneBtn 驱动)
//   → 满意对话链(pilot/sheep 视觉类型)→ lock 互斥 / 非 lock 打断后链自恢复
//   → 转夜计数链(sheep 类型)。场景3回忆层四站走位另经 b612-world-probe 语义覆盖。
// 用法:node scripts/probe/b612-story-chain-probe.cjs   (自起 :3219 server)
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const { launch } = require('./browser.js');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3219;
const TMP = path.join(os.tmpdir(), 'b612-story-probe-' + Date.now());
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
  // 点按推进当前对话(点 #gameDialog 本体);返回是否曾可见
  const clickThrough = async (maxClicks) => {
    for (let i = 0; i < maxClicks; i++) {
      const visible = await page.evaluate(() => {
        const d = document.getElementById('gameDialog');
        if (!d || d.style.display === 'none') return false;
        d.click();
        return true;
      });
      if (!visible) return i > 0;
      await page.waitForTimeout(450);
    }
    return false;
  };
  const waitForDialog = async (spkRe, timeout) => {
    await page.waitForFunction(
      (re) => {
        const d = document.getElementById('gameDialog');
        return d && d.style.display !== 'none' && (!re || re.test(d.dataset.spk || ''));
      },
      spkRe ? new RegExp(spkRe) : null,
      { timeout }
    );
  };

  const b = await launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => {
    sessionStorage.setItem('nickPopOff', '1');
    try { localStorage.setItem('kunlunWelcomed', String(Date.now())); } catch (e) {}
  });
  await page.goto(ORIGIN + '/?noopening', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#b612Gate', { timeout: 90000 });
  await page.evaluate(() => {
    const c = document.getElementById('gAgreeChk');
    c.checked = true;
    c.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('#b612Gate .gEnter');
  await page.waitForFunction(
    () => window.__ctx && window.__ctx.loopManager && window.__ctx.loopManager.getFPS() > 0,
    null,
    { timeout: 90000 }
  );
  console.log('— 开机完成,等叫醒词 —');

  // ① 叫醒词:prince 视觉类型
  await waitForDialog('prince', 30000);
  ok('[叫醒词] data-spk=prince', true);
  const wakeName = await page.evaluate(() => document.querySelector('#gameDialog .gs-name').textContent);
  ok('[叫醒词] 说话人名', /^(小王子|The Little Prince)$/.test(wakeName), 'name=' + wakeName);

  // ② 点按推进 → __crashWakeDone → 画板淡入
  ok('[叫醒词] 点按可推进', await clickThrough(4));
  await page.waitForFunction(() => window.__crashWakeDone === true, null, { timeout: 8000 });
  await page.waitForSelector('#scene2Board', { timeout: 20000 });
  ok('[第2场] 画板淡入', true);

  // ③ 四轮:r1 用真实指针手绘(两笔,笔间 0.8s)驱动,r2~r4 点「画好了」
  //    回归(2026-09-10 主人报「无法画羊」):落笔不清定稿倒计时 → 第二笔画到一半
  //    被上一笔的 1.6s 停笔倒计时拦腰截断,多笔画羊永远画不完
  for (let r = 1; r <= 4; r++) {
    if (r === 1) {
      const bb = await page.locator('#scene2Board svg').boundingBox();
      const cx = bb.x + bb.width / 2;
      const cy = bb.y + bb.height / 2;
      const drag = async (x1, y1, x2, y2, stepMs) => {
        await page.mouse.move(x1, y1);
        await page.mouse.down();
        for (let i = 1; i <= 8; i++) {
          await page.mouse.move(x1 + ((x2 - x1) * i) / 8, y1 + ((y2 - y1) * i) / 8);
          if (stepMs) await page.waitForTimeout(stepMs);
        }
        await page.mouse.up();
      };
      await drag(cx - 120, cy - 60, cx + 120, cy + 60); // 第一笔(快笔)
      await page.waitForTimeout(800); // 0.8s 后落第二笔(<1.6s 停笔窗,故意踩倒计时)
      await drag(cx - 100, cy + 80, cx + 100, cy - 70, 250); // 第二笔拖 ~2s:旧代码此处会被炸断
      const ink = await page.evaluate(
        () => document.querySelectorAll('#scene2Board svg g:nth-of-type(2) path').length
      );
      ok('[画羊 r1] 真实手绘出墨(≥2 笔)', ink >= 2, 'ink=' + ink);
      const cut = await page.evaluate(() => {
        const d = document.getElementById('gameDialog');
        return (d && d.style.display !== 'none') || !document.getElementById('scene2Board');
      });
      ok('[画羊 r1] 第二笔画完仍未被定稿截断', !cut);
      await waitForDialog('prince', 15000); // 停笔 1.6s 后自动定稿进王子台词
      ok(`[第2场 r${r}] 台词 spk=prince`, true);
    } else {
      await page.click('#scene2Done');
      await waitForDialog('prince', 15000);
      ok(`[第2场 r${r}] 台词 spk=prince`, true);
    }
    if (r < 4) {
      ok(`[第2场 r${r}] 点按推进`, await clickThrough(4));
      await page.waitForFunction(
        (n) => document.getElementById('scene2Round') && document.getElementById('scene2Round').textContent.includes(String(n)),
        r + 1,
        { timeout: 15000 }
      ).catch(() => {});
    } else {
      await clickThrough(4); // 推进进满意链
    }
  }

  // ④ 满意对话链(prince→pilot→sheep):边点边抓类型;链尾存 scene2 标记+画板淡出
  const seen = await page.evaluate(() =>
    new Promise((res) => {
      const hit = new Set();
      const t0 = Date.now();
      const iv = setInterval(() => {
        const d = document.getElementById('gameDialog');
        if (d && d.style.display !== 'none' && d.dataset.spk) {
          hit.add(d.dataset.spk);
          d.click(); // 点按加速推进
        }
        if (window.__ctx.store.flag('scene2') || Date.now() - t0 > 60000) {
          clearInterval(iv);
          res([...hit]);
        }
      }, 300);
    })
  );
  for (const s of ['prince', 'pilot', 'sheep']) ok(`[满意链] 出现 spk=${s}`, seen.includes(s), `seen=${seen.join(',')}`);
  await page.waitForFunction(() => window.__ctx.store.flag('scene2'), null, { timeout: 15000 });
  ok('[第2场] scene2 存档标记', true);
  await page.waitForFunction(() => !document.getElementById('scene2Board'), null, { timeout: 20000 });
  ok('[第2场] 画板淡出', true);

  // ⑤ 转夜计数链(sheep):出生点离羊箱 1.1m,armNight 后 tick 立即触发,无需走位
  await waitForDialog('sheep', 20000);
  ok('[转夜] 计数链 spk=sheep', true);
  await clickThrough(8); // 数数声 + 门光提示,点按清链(链尾点亮石门呼吸光)
  await page.waitForFunction(() => !window.__ctx.dialogOpen || !window.__ctx.dialogOpen(), null, { timeout: 15000 });
  ok('[转夜] 计数链收束', true);

  // ⑥ lock 互斥 / 非 lock 打断后 onDone 补发(单元式断言;前置:故事链空闲)
  const lockTest = await page.evaluate(() =>
    new Promise((res) => {
      const ctx = window.__ctx;
      const log = [];
      ctx.openDialog({ speaker: 'A', speakerType: 'pilot', lines: ['chain-1'], autoHide: 3200, lock: true, onDone: () => log.push('done1') });
      ctx.openDialog({ speaker: 'B', lines: ['intruder-lock'], lock: true }); // 应被忽略
      setTimeout(() => {
        const t1 = document.querySelector('#gameDialog .gs-text').textContent;
        const kept = t1 === 'chain-1'; // 等 400ms:7 字符×38ms 打字机已收笔
        const spkKept = document.getElementById('gameDialog').dataset.spk === 'pilot';
        ctx.openDialog({ speaker: 'C', lines: ['intruder-free'] }); // 非 lock:打断
        setTimeout(() => {
          const t2 = document.querySelector('#gameDialog .gs-text').textContent;
          const spkCleared = !document.getElementById('gameDialog').dataset.spk;
          const interrupted = t2 === 'intruder-free'; // 等 650ms:13 字符打字机已收笔
          setTimeout(() => res({ kept, spkKept, interrupted, spkCleared, log }), 300);
        }, 650);
      }, 400);
    })
  );
  ok('[互斥] lock 对话忽略后来 lock', lockTest.kept);
  ok('[互斥] 打断者不带 spk 时清视觉类型', lockTest.spkKept && lockTest.spkCleared);
  ok('[容错] 非 lock 可打断', lockTest.interrupted);
  ok('[容错] 被打断链 onDone 补发', lockTest.log.includes('done1'), 'log=' + JSON.stringify(lockTest.log));
  await clickThrough(1); // 只关 C(intruder-free);B 在锁空后 60ms 补播,先等它现身再清

  // ⑥b 排队补播:⑥里被 lock 挡下的 intruder-lock 应在锁空后补播(而非丢弃)
  await page.waitForFunction(() => {
    const d = document.getElementById('gameDialog');
    return d && d.style.display !== 'none' && d.querySelector('.gs-text').textContent === 'intruder-lock';
  }, null, { timeout: 15000 });
  ok('[衔接] 被挡 lock 对话排队补播', true);
  await clickThrough(4);

  // ===== 场景二:旧档开机(b612Scene2+b612Page1 已标记)= 主人报「无衔接无触发」的存档形态 =====
  // 断言:叫醒词与桥段台词(转夜链)两段都出现(排队补播而非相丢);画板被进度守卫跳过
  const page2 = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs2 = [];
  page2.on('pageerror', (e) => errs2.push(String(e).slice(0, 200)));
  await page2.addInitScript(() => {
    sessionStorage.setItem('nickPopOff', '1');
    try {
      localStorage.setItem('kunlunWelcomed', String(Date.now()));
      localStorage.setItem('b612Scene2', '1'); // store SCHEMA: scene2 → b612Scene2
      localStorage.setItem('b612Page1', '1'); // store SCHEMA: page1 → b612Page1
    } catch (e) {}
  });
  await page2.goto(ORIGIN + '/?noopening', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page2.waitForSelector('#b612Gate', { timeout: 90000 });
  await page2.evaluate(() => {
    const c = document.getElementById('gAgreeChk');
    c.checked = true;
    c.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page2.click('#b612Gate .gEnter');
  await page2.waitForFunction(() => window.__ctx && window.__ctx.loopManager && window.__ctx.loopManager.getFPS() > 0, null, { timeout: 90000 });

  const texts2 = await page2.evaluate(
    () =>
      new Promise((res) => {
        const seen = [];
        let last = '';
        const t0 = Date.now();
        const iv = setInterval(() => {
          const d = document.getElementById('gameDialog');
          if (d && d.style.display !== 'none') {
            const t = d.querySelector('.gs-text').textContent;
            if (t && t !== last) {
              seen.push(t);
              last = t;
            }
            d.click(); // 点按加速链推进
          } else {
            last = '';
          }
          if (Date.now() - t0 > 30000) {
            clearInterval(iv);
            res(seen);
          }
        }, 350);
      })
  );
  const all2 = texts2.join(' § ');
  ok('[旧档] 叫醒词出现', /draw me a sheep|画一只羊/.test(all2), all2.slice(0, 120));
  ok('[旧档] 桥段台词补播(不再被吞)', /There you are|走了好远/.test(all2));
  const board2 = await page2.evaluate(() => !!document.getElementById('scene2Board'));
  ok('[旧档] 画板被进度守卫跳过', !board2);
  ok('[旧档] 无页面异常', errs2.length === 0, errs2.slice(0, 3).join(' || '));

  console.log(fail ? 'FAIL ' + fail : 'PASS 全部通过(两场景)');
  await b.close();
  child.kill();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
