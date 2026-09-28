// b612-327-voice-probe.cjs — 327 台词语音端到端验收(2026-09-28 声线分层上线)
// 验什么:①台词逐句真的发起了朗读(hook Audio.play 抓 R2 tts-audio src);
//         ②声线正确(src key ∈ 预期集合,预期=story-text 文本 × dialog-voice 新声线本地复算);
//         ③全部命中缓存(无 legacy /api/tts 回退 = 不吃跨境合成延迟)。
// 流程:chapter=2 预置(直进 327)→ 王子/酒鬼十问答(语音驱动节奏,约 3-5 分钟)→ 抓取比对。
// 退出码 0=全绿。默认本地起服;BASE_URL=https://... 直测线上。
const path = require('path'),
  fs = require('fs'),
  os = require('os'),
  crypto = require('crypto'),
  { spawn } = require('child_process');
const { launch } = require('./browser.js');
const ROOT = path.join(__dirname, '..', '..'),
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 's7voice-')),
  PORT = process.env.SCENE7_VOICE_PORT || 3287;

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
const keyOf = (voice, text) =>
  crypto.createHash('sha256').update('tts1|' + voice + '|' + String(text).slice(0, 220)).digest('hex').slice(0, 20);

(async () => {
  // —— 预计算预期 key 集合(story-text × dialog-voice 本地复算,与线上同算法) ——
  const { pathToFileURL } = require('url');
  const st = await import(pathToFileURL(path.join(ROOT, 'src', 'shared', 'story-text.mjs')).href);
  const dv = await import(pathToFileURL(path.join(ROOT, 'src', 'core', 'dialog-voice.mjs')).href);
  const expectKeys = new Set();
  const enKeys = new Set(); // 327 朗读走英文轨(闸门默认 en),此集合=十句×各自声线
  const expectByWho = {};
  for (const line of st.SCENE7_TIPPLER.chain) {
    const spk = st.whoSpk(line.who || {});
    const vEn = dv.voiceFor(spk, line.en);
    const vZh = dv.voiceFor(spk, line.zh);
    expectKeys.add(keyOf(vEn, line.en));
    expectKeys.add(keyOf(vZh, line.zh));
    enKeys.add(keyOf(vEn, line.en));
    (expectByWho[spk] = expectByWho[spk] || new Set()).add(vEn);
  }
  console.log('预期声线:', Object.entries(expectByWho).map(([k, v]) => k + '=' + [...v].join('/')).join(' '));

  const local = !process.env.BASE_URL;
  const URL = process.env.BASE_URL || 'http://localhost:' + PORT + '/';
  const child = local ? await start() : null;
  let pass = 0,
    fail = 0;
  const ok = (name, cond, extra) => {
    if (cond) { pass++; console.log('✓ ' + name + (extra ? ' | ' + extra : '')); }
    else { fail++; console.log('✗ ' + name + (extra ? ' | ' + extra : '')); }
  };
  const b = await launch(['--autoplay-policy=no-user-gesture-required']);
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  p.on('pageerror', (e) => { if (!/dynamically imported module/.test(e.message)) errs.push(e.message); });
  await p.addInitScript(() => {
    try {
      sessionStorage.setItem('nickPopOff', '1');
      // ⚠️ 不设 dialogVoiceOff —— 本探针就是要验语音真的响
      localStorage.setItem('kunlunWelcomed', String(Date.now()));
      localStorage.setItem('b612Scene2', '1');
      localStorage.setItem('b612Page1', '1');
      localStorage.setItem('b612PlanetChapter', '2');
      // hook Audio:记录每次 play 的 src(台词朗读 = blob:/cdn tts-audio /api/tts)
      window.__audioLog = [];
      const origPlay = Audio.prototype.play;
      Audio.prototype.play = function () {
        try { window.__audioLog.push({ src: String(this.src || ''), t: Date.now() }); } catch (e) {}
        return origPlay.apply(this, arguments);
      };
      // hook fetch:blob 常驻的源 URL 才带 key(warmBlobByKey fetch R2 tts-audio/<key>.mp3)
      window.__fetchLog = [];
      const origFetch = window.fetch;
      window.fetch = function (input) {
        try {
          const u = typeof input === 'string' ? input : (input && input.url) || '';
          if (/tts-audio\/[0-9a-f]{20}\.mp3/.test(u)) window.__fetchLog.push(u);
        } catch (e) {}
        return origFetch.apply(this, arguments);
      };
    } catch (e) {}
  });
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('#b612Gate', { timeout: 90000 });
  await p.evaluate(() => {
    const c = document.getElementById('gAgreeChk');
    c.checked = true;
    c.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.click('#b612Gate .gEnter');
  await p.waitForFunction(() => !document.getElementById('b612Gate'), null, { timeout: 15000 });
  await p.waitForSelector('#b612film', { timeout: 20000 });
  await p.waitForTimeout(1200);
  await p.click('#b612film #fSkip');
  await p.waitForFunction(() => !document.getElementById('b612film'), null, { timeout: 20000 });
  await p.waitForTimeout(2200);
  await p.click('#genderOv button:has-text("女")').catch(() => {});
  // 羊箱计数行带 choices(探针跳过 scene3):自动点选消解,防 lock 队列堵死
  await p.evaluate(() => {
    window.__autoChoice = setInterval(() => {
      const el = document.querySelector('.gs-choice');
      if (el && el.offsetParent) el.click();
    }, 1200);
  });
  await p.evaluate(() => window.__ctx.kunlun.revealStarGate && window.__ctx.kunlun.revealStarGate());
  await p.waitForTimeout(800);
  await p.evaluate(() => {
    const q = window.__ctx.player.pl.p;
    q.x = 0.1;
    q.z = 56;
  });
  await p.waitForFunction(() => window.__ctx.scene.activeWorld === 'b612', null, { timeout: 25000 });
  await p.waitForFunction(() => (document.getElementById('worldNav') || {}).style.display === 'flex', null, { timeout: 15000 }).catch(() => {});
  await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('前往 327'))?.click());
  await p.waitForFunction(() => window.__ctx.scene.activeWorld === 'king327', null, { timeout: 25000 });
  console.log('— 已进入 king327(语音模式,等全链播完 ≈3-5 分钟)—');
  await p
    .waitForFunction(() => window.__scene7b && window.__scene7b.state && window.__scene7b.state.pickupArmed, null, { timeout: 600000 })
    .catch(() => {});
  await p.waitForTimeout(1500);

  const log = await p.evaluate(() => window.__audioLog.slice());
  const fetchLog = await p.evaluate(() => window.__fetchLog.slice());
  const st7 = await p.evaluate(() => window.__scene7b && window.__scene7b.state);
  console.log('== audioLog 全量(' + log.length + ') ==');
  log.slice(0, 20).forEach((a, i) => console.log('  ' + i + '. ' + a.src.slice(0, 90)));
  // 台词播放 = blob(内存常驻,源是 R2 key)/R2 直链/legacy;排除导语等经典通道按需再判
  const tts = log.filter((a) => /tts-audio|\/api\/tts|blob:/.test(a.src));
  const r2 = tts.filter((a) => /tts-audio/.test(a.src));
  const blobN = tts.filter((a) => /^blob:/.test(a.src)).length;
  // 声线验证:fetchLog 是全会话预取(含开机链),正确口径 = 327 十句的英文 key
  // 全部被按预期声线抓到(fetch 到的 key = blob 播放的源 = 真实采用的声线)
  const fKeys = new Set(fetchLog.map((u) => (u.match(/([0-9a-f]{20})\.mp3$/) || [])[1]).filter(Boolean));
  const hitEn = [...enKeys].filter((k) => fKeys.has(k));
  const missEn = [...enKeys].filter((k) => !fKeys.has(k));
  const legacy = tts.filter((a) => a.src.indexOf('/api/tts?') === 0);
  ok('语音模式走完 327 全链(pickupArmed)', !!(st7 && st7.pickupArmed), JSON.stringify(st7));
  ok('台词逐句发起朗读(blob+R2 ≥10 次)', tts.length >= 10, '共 ' + tts.length + ' 次(blob ' + blobN + ' / R2 ' + r2.length + ')');
  ok('声线正确(327 十句英文 key 全部按新声线命中 fetch 记录)', hitEn.length === enKeys.size, hitEn.length + '/' + enKeys.size + (missEn.length ? ' 缺:' + missEn.join(',') : ''));
  ok('全部走边缘缓存/blob(零 legacy /api/tts 回退)', legacy.length === 0, 'legacy=' + legacy.length);
  ok('无页面异常', errs.length === 0, errs.slice(0, 2).join(' | '));

  if (child) child.kill();
  console.log(fail ? 'FAIL ' + fail + ' 项未过' : 'PASS 327 语音端到端 ' + pass + ' 项全绿');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('PROBE FAIL', e.message);
  process.exit(1);
});
