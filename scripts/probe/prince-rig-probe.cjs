// prince-rig-probe.cjs — 小王子骨骼动画上线验收探针(2026-09-25)
// 剧本:ENTER → 电影(选帽子) → 世界揭幕 → 坠机点剧情自动播放:
//   王子从沙丘走向坠机点(走路动画) → idle 呼吸 → ~9s 后第一次小动作(挥手/小跳)。
// 契约:
//   ① __princeDebug.rigged()=true(骨骼动画版模型加载成功)
//   ② 行走窗内 clip=ChibiWalk
//   ③ 行走结束 clip=ChibiIdle
//   ④ 25s 内观测到至少一次小动作 clip∈{ChibiWave, ChibiHop}
//   ⑤ 无页面报错
const { launch } = require('./browser.js');
(async () => {
  const URL = process.env.PROBE_URL || 'https://cloudbear.cloud';
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#b612Gate', { timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.check('#b612Gate #gAgreeChk');
  await page.click('#b612Gate .gEnter');
  console.log('[probe] 已点 ENTER');
  await page.waitForSelector('#b612film', { timeout: 30000 });
  await page.waitForSelector('#cHat', { timeout: 30000 });
  await page.waitForTimeout(500);
  await page.click('#cHat').catch(() => console.log('!! 帽子点击失败'));
  console.log('[probe] 已选帽子,等电影收束…');
  await page.waitForFunction(() => !document.getElementById('b612film'), null, { timeout: 150000 });
  console.log('[probe] 电影结束,世界揭幕');

  // 轮询王子状态 30s,每 250ms 采样 clip 名
  const seen = await page.evaluate(async () => {
    const out = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) {
      const d = window.__princeDebug;
      out.push({
        t: Date.now() - t0,
        state: d ? d.state() : 'no-debug',
        clip: d ? d.clip() : null,
        rigged: d ? d.rigged() : false,
      });
      await new Promise((r) => setTimeout(r, 250));
    }
    return out;
  });
  const riggedEver = seen.some((s) => s.rigged);
  const walkSeen = seen.some((s) => s.clip === 'ChibiWalk');
  const idleSeen = seen.some((s) => s.clip === 'ChibiIdle' && s.state === 'idle');
  const smallSeen = seen.some((s) => s.clip === 'ChibiWave' || s.clip === 'ChibiHop');
  const firstWalk = seen.find((s) => s.clip === 'ChibiWalk');
  const lastState = seen[seen.length - 1] || {};
  console.log('首段走路 @', firstWalk ? firstWalk.t + 'ms' : '未观测');
  console.log('观测到的 clip 集合:', [...new Set(seen.map((s) => s.clip))].join(', '));
  console.log('末态:', JSON.stringify(lastState));
  await page.screenshot({ path: 'scripts/artifacts/prince-rig-end.png' }).catch(() => {});

  let pass = 0, fail = 0;
  const ok = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? ' → ' + x : '')); } };
  ok('① rigged 骨骼模型加载', riggedEver);
  ok('② 行走动画 ChibiWalk 播放', walkSeen);
  ok('③ 回落待机 ChibiIdle', idleSeen);
  ok('④ 小动作 Wave/Hop 出现', smallSeen, '观测集合见上');
  ok('⑤ 无页面报错', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('探针异常:', e.message); process.exit(2); });
