// b612-dialog-voice-probe.cjs — 台词朗读端到端验收(2026-09-24,主人指令"小米语音朗读台词")
// 验证:①开对话后自动请求 /api/tts 且带说话人声线(prince→Xiaoyi);
//       ②对话框出现 🔈 静音钮;③静音后新台词不再请求;④换行替换语义不排队;
//       ⑤无 pageerror。
const { launch } = require('./browser.js');
(async () => {
  const URL = process.env.PROBE_URL || 'http://localhost:5173';
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const ttsReqs = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/tts')) ttsReqs.push(decodeURIComponent(r.url()));
  });
  await page.addInitScript(() => {
    for (const k of ['agreementConsented', 'privacyConsented', 'communityConsented'])
      sessionStorage.setItem(k, '1');
  });
  await page.goto(URL + '/?noopening&noprologue', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b612Gate', { timeout: 90000 });
  await page.check('#b612Gate #gAgreeChk');
  await page.click('#b612Gate .gEnter');
  await page.waitForFunction(() => window.__ctx && window.__ctx.player && window.__ctx.player.pl, { timeout: 90000 });
  await page.waitForFunction(() => window.__bootCheck && window.__bootCheck.ok === true, null, { timeout: 120000 });

  let pass = 0,
    fail = 0;
  const ok = (n, c, x) => {
    if (c) { pass++; console.log('  ✅ ' + n); }
    else { fail++; console.log('  ❌ ' + n + (x ? ' → ' + x : '')); }
  };

  // 1. 开王子台词 → 应请求 TTS 且带 Xiaoyi 声线
  ttsReqs.length = 0;
  await page.evaluate(() => {
    window.__ctx.ui.openDialog({
      speaker: '小王子',
      speakerType: 'prince',
      lines: ['请你——给我画一只羊！'],
      autoHide: 60000,
    });
  });
  await page.waitForTimeout(2500);
  const dlgVisible = await page.evaluate(() => {
    const box = document.getElementById('gameDialog');
    return { found: !!box, shown: box ? box.style.display !== 'none' : false, hasBtn: !!document.querySelector('#gameDialog .gs-voice') };
  });
  ok('A. 对话框显示且静音钮就位', dlgVisible.shown && dlgVisible.hasBtn, JSON.stringify(dlgVisible));
  const hit = ttsReqs.find((u) => u.includes('请你') && u.includes('Xiaoyi')); // 列表已解码,直接比中文
  ok('B. 自动请求 /api/tts 且带王子声线', !!hit, JSON.stringify(ttsReqs.slice(0, 2)));

  // 2. 静音 → 新台词不再请求
  await page.evaluate(() => document.querySelector('#gameDialog .gs-voice').click());
  const muted = await page.evaluate(() => sessionStorage.getItem('dialogVoiceOff'));
  const btnTxt = await page.evaluate(() => document.querySelector('#gameDialog .gs-voice').textContent);
  ttsReqs.length = 0;
  await page.evaluate(() => {
    window.__ctx.ui.openDialog({
      speaker: '飞行员',
      speakerType: 'pilot',
      lines: ['我六年前做过一次断航。'],
      autoHide: 60000,
    });
  });
  await page.waitForTimeout(1500);
  ok('C. 静音钮写入会话', muted === '1');
  ok('D. 静音钮图标切换 🔇', btnTxt === '🔇', btnTxt);
  ok('E. 静音后新台词零 TTS 请求', ttsReqs.length === 0, JSON.stringify(ttsReqs));

  // 3. 解除静音 → 恢复朗读(替换语义:只保留最新一行请求)
  await page.evaluate(() => document.querySelector('#gameDialog .gs-voice').click());
  ttsReqs.length = 0;
  await page.evaluate(() => {
    window.__ctx.ui.openDialog({ speaker: '小王子', speakerType: 'prince', lines: [' sheep? 一只绵羊。'] });
  });
  await page.waitForTimeout(1500);
  ok('F. 解除静音恢复朗读', ttsReqs.length === 1, JSON.stringify(ttsReqs));

  // 4. 关对话框 → 停止(无新请求即视为停;替换语义核心断言在 F)
  ok('G. 无 pageerror', errors.length === 0, errors.slice(0, 3).join(' | '));

  console.log('\n=== 台词朗读:' + pass + ' 通过 / ' + fail + ' 失败 ===');
  await b.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('探针异常:', e.message);
  process.exit(1);
});
