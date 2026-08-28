// live-verify.cjs — 生产环境无头验证(msedge + playwright-core)
// 判据: P0 PAGE_ERRORS=0; P1 组合根含 ui/state/effects/media 系统;
//       P2 game-state 种子可用; P3 effects 烟花逐帧动画(单循环未破)
const { chromium } = require('playwright-core');

const MSEGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'https://cloudbear.cloud/';

(async () => {
  const browser = await chromium.launch({
    executablePath: MSEGE,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('crash', () => errors.push('PAGE_CRASH'));

  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  // 等待首帧 + 组合根装配 + 异步神话层(2s)
  await page.waitForTimeout(9000);

  const reg = await page.evaluate(() => {
    const out = { sys: [], hasGameState: false, snap: null, hasUiSys: false, effects: false };
    try {
      const cr = window.__compositionRoot;
      if (cr && typeof cr.list === 'function') {
        const list = cr.list();
        out.sys = Array.isArray(list) ? list : [];
        out.hasUiSys = JSON.stringify(out.sys).includes('ui');
        out.hasEffects = JSON.stringify(out.sys).includes('effects');
        out.hasMedia = JSON.stringify(out.sys).includes('media');
        out.hasState = JSON.stringify(out.sys).includes('state');
      }
      const gs = window.__gameState;
      if (gs && typeof gs.get === 'function') {
        out.hasGameState = true;
        try { out.snap = gs.snapshot ? gs.snapshot() : null; } catch (e) {}
      }
    } catch (e) { out.evalErr = String(e.message || e); }
    return out;
  });

  // 采样 effects 烟花:带 size 属性的 Points,比较两次 position 校验和
  const sampleFx = async () => page.evaluate(() => {
    try {
      const s = window.__ctx && window.__ctx.scene && window.__ctx.scene.s;
      if (!s) return null;
      let target = null;
      s.traverse((o) => {
        if (target) return;
        if (o.isPoints && o.geometry && o.geometry.attributes && o.geometry.attributes.size) target = o;
      });
      if (!target) return null;
      const pos = target.geometry.attributes.position;
      let sum = 0;
      const n = Math.min(pos.count, 2000);
      for (let i = 0; i < n; i++) {
        sum += pos.getX(i) + pos.getY(i) * 1.7 + pos.getZ(i) * 2.3;
      }
      const dr = target.geometry.drawRange;
      return { sum: Math.round(sum * 1000), drawRange: (dr && dr.count !== undefined) ? dr.count : null };
    } catch (e) { return { err: String(e.message || e) }; }
  });

  const fx1 = await sampleFx();
  await page.waitForTimeout(1500);
  const fx2 = await sampleFx();
  const fxAnimating = fx1 && fx2 && !fx1.err && !fx2.err && fx1.sum !== fx2.sum;

  // Stage 4 写回探针:__gameState.set(ns,'__probe__') 应 write-through 到 __ctx.<ns>.*,
  // 证明 mode/player 运行期写路径已收归 gameState.set 且读者零改动拿到新值。
  const probe = await page.evaluate(() => {
    try {
      const gs = window.__gameState, ctx = window.__ctx;
      if (!gs || !ctx || !ctx.mode || !ctx.player) return { skip: true };
      // mode
      const oS = gs.get('siteMode');
      gs.set('siteMode', '__probe__');
      const modeThrough = ctx.mode.siteMode === '__probe__';
      const modeStored = gs.get('siteMode') === '__probe__';
      gs.set('siteMode', oS);
      const modeRestored = ctx.mode.siteMode === oS && gs.get('siteMode') === oS;
      // player.quizPassed
      const oQ = gs.get('quizPassed');
      gs.set('quizPassed', !oQ);
      const qThrough = ctx.player.quizPassed === !oQ;
      const qStored = gs.get('quizPassed') === !oQ;
      gs.set('quizPassed', oQ);
      const qRestored = ctx.player.quizPassed === oQ && gs.get('quizPassed') === oQ;
      // player.viewMode
      const oV = gs.get('viewMode');
      const vFlip = oV === 1 ? 0 : 1;
      gs.set('viewMode', vFlip);
      const vThrough = ctx.player.viewMode === vFlip;
      const vStored = gs.get('viewMode') === vFlip;
      gs.set('viewMode', oV);
      const vRestored = ctx.player.viewMode === oV && gs.get('viewMode') === oV;
      // kunlun.flightLock
      const oF = gs.get('flightLock');
      gs.set('flightLock', !oF);
      const fThrough = ctx.kunlun.flightLock === !oF;
      const fStored = gs.get('flightLock') === !oF;
      gs.set('flightLock', oF);
      const fRestored = ctx.kunlun.flightLock === oF && gs.get('flightLock') === oF;
      return { modeThrough, modeStored, modeRestored, qThrough, qStored, qRestored, vThrough, vStored, vRestored, fThrough, fStored, fRestored, oS, oQ, oV, oF };
    } catch (e) { return { err: String(e.message || e) }; }
  });

  // Stage 4 冻结探针:legacy 直写 ctx.<ns>.<prop>=v 必须收归 gameState.set 单入口
  // (isBound 命中→set 陷阱委托 gameState.set)。验证:直写后 gs.get 立即拿到新值 + 事件已发。
  const legacy = await page.evaluate(() => {
    try {
      const gs = window.__gameState, ctx = window.__ctx;
      if (!gs || !ctx || !ctx.mode || !ctx.player || !ctx.kunlun || !ctx.events) return { skip: true };
      const ev = { mode: 0, player: 0, kunlun: 0 };
      const offM = ctx.events.on('mode:changed', () => ev.mode++);
      const offP = ctx.events.on('player:changed', () => ev.player++);
      const offK = ctx.events.on('kunlun:changed', () => ev.kunlun++);
      const oS = gs.get('siteMode');
      ctx.mode.siteMode = '__legacy__';
      const modeFunnel = gs.get('siteMode') === '__legacy__' && ctx.mode.siteMode === '__legacy__';
      const modeEvt = ev.mode >= 1;
      ctx.mode.siteMode = oS;
      const oQ = gs.get('quizPassed');
      const qNew = !oQ;
      ctx.player.quizPassed = qNew;
      const quizFunnel = gs.get('quizPassed') === qNew && ctx.player.quizPassed === qNew;
      const quizEvt = ev.player >= 1;
      ctx.player.quizPassed = oQ;
      const oV = gs.get('viewMode');
      const vNew = oV === 1 ? 0 : 1;
      ctx.player.viewMode = vNew;
      const viewFunnel = gs.get('viewMode') === vNew && ctx.player.viewMode === vNew;
      const viewEvt = ev.player >= 2;
      ctx.player.viewMode = oV;
      const oF = gs.get('flightLock');
      const fNew = !oF;
      ctx.kunlun.flightLock = fNew;
      const flightFunnel = gs.get('flightLock') === fNew && ctx.kunlun.flightLock === fNew;
      const flightEvt = ev.kunlun >= 1;
      ctx.kunlun.flightLock = oF;
      offM(); offP(); offK();
      const restored = gs.get('siteMode') === oS && gs.get('quizPassed') === oQ && gs.get('viewMode') === oV && gs.get('flightLock') === oF;
      return { modeFunnel, modeEvt, quizFunnel, quizEvt, viewFunnel, viewEvt, flightFunnel, flightEvt, restored };
    } catch (e) { return { err: String(e.message || e) }; }
  });

  // ===================== 交互冒烟(2026-08-29 新增) =====================
  // 为什么需要:此前本探针**零交互**(只验证加载/系统注册/状态探针/烟花动画),
  // 导致 spiritCount 无限递归(栈溢出)长期在生产潜伏——它的调用点在飞舟可见性判定路径,
  // 只有用户真正登舟才触发,而本探针从不触发,故一直报 PAGE_ERRORS=0。
  // 做法:新开一页,用 localStorage 播种「六灵蕴已集齐 + 已首飞」,真实走一遍
  //   传送山巅 → 登舟 → 进入自由飞,断言全程零 pageerror。
  // 安全性:全部为客户端动作(传送/点击登舟/Esc),不上传、不发言、不改服务端数据;
  //   arkFFSeen=1 跳过首次大字与 TTS,避免占用线上 30 次/天/设备 的语音配额;
  //   播种只影响本临时浏览器会话的 localStorage,不影响任何真实用户。
  const smoke = { err: null, clicked: false, boarded: false, flightLock: false, hud: null, pageErrors: [] };
  try {
    const p2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    p2.on('pageerror', (e) => smoke.pageErrors.push(String(e.message || e).slice(0, 300)));
    await p2.addInitScript(() => {
      try {
        localStorage.setItem('kunlunSpiritsKeys', JSON.stringify(['sprout', 'flame', 'leaf', 'snow', 'dawn', 'dusk']));
        localStorage.setItem('kunlunSpirits', '6');
        localStorage.setItem('kunlunSpiritsDone', '1');
        localStorage.setItem('kunlunSpiritsIntro', '1');
        localStorage.setItem('kunlunSkyMs', '100');
        localStorage.setItem('kunlunPrologueDone', '1');
        localStorage.setItem('arkFlew', '1'); // 已首飞 → 登舟直接进自由飞(而非电影巡礼)
        localStorage.setItem('arkFFSeen', '1'); // 跳过首次大字/TTS,保持安静
        sessionStorage.setItem('agreementConsented', '1');
        sessionStorage.setItem('privacyConsented', '1');
        sessionStorage.setItem('communityConsented', '1');
        sessionStorage.setItem('kunlunWelcomed', '1');
        sessionStorage.setItem('nickPopOff', '1');
        sessionStorage.setItem('skipOpening', '1'); // 跳过首页流动开场层,避免盖住画廊交互探针(2026-08-29)
      } catch (e) {}
    });
    await p2.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p2.waitForFunction(
      () => window.__ctx && window.__ctx.desert && window.__ctx.pl && window.__arkFF,
      null,
      { timeout: 60000 }
    );
    await p2.waitForTimeout(6000);
    // 传送到山巅泊位旁(KX=800 / 泊位 z=585)
    await p2.evaluate(() => {
      const c = window.__ctx;
      c.pl.p.x = 800;
      c.pl.p.z = 588;
      c.pl.p.y = c.desert.getH(800, 588) + 1.6;
    });
    await p2.waitForTimeout(1500);
    // 点登舟
    smoke.clicked = await p2.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(
        (x) => x.textContent.replace(/\s/g, '').includes('飞舟') && x.style.display !== 'none'
      );
      if (!b) return false;
      b.click();
      return true;
    });
    await p2.waitForTimeout(2000);
    const st = await p2.evaluate(() => {
      const hud = document.getElementById('arkHud');
      return {
        on: !!(window.__arkFF && window.__arkFF.on),
        lock: window.__ctx ? window.__ctx.flightLock : null,
        hud: hud ? hud.style.display : null,
      };
    });
    smoke.boarded = st.on;
    smoke.flightLock = st.lock === true;
    smoke.hud = st.hud;
    // 收尾:Esc 关闭可能打开的弹层;本页随后直接丢弃,不影响线上任何状态
    await p2.keyboard.press('Escape');
    await p2.waitForTimeout(500);
    await p2.close();
  } catch (e) {
    smoke.err = String(e.message || e).slice(0, 300);
  }

  // ===================== 首页开场层验证(2026-08-29) =====================
  // 三个协议签完后,流动背景开场层(#openingOv)应出现;点「进入画廊」后应淡出移除。
  // 不置 skipOpening,真实走一遍开场弹出→进入流程,断言零 pageerror。
  const opening = { err: null, shown: false, dismissed: false, pageErrors: [] };
  try {
    const p3 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    p3.on('pageerror', (e) => opening.pageErrors.push(String(e.message || e).slice(0, 300)));
    await p3.addInitScript(() => {
      try {
        sessionStorage.setItem('agreementConsented', '1');
        sessionStorage.setItem('privacyConsented', '1');
        sessionStorage.setItem('communityConsented', '1');
        localStorage.setItem('kunlunPrologueDone', '1'); // 仅验证开场层,跳过序章接管干扰
      } catch (e) {}
    });
    await p3.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    opening.shown = await p3
      .waitForSelector('#openingOv', { timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    if (opening.shown) {
      await p3.waitForTimeout(700);
      await p3.evaluate(() => {
        const b = document.querySelector('#openingOv button');
        if (b) b.click();
      });
      await p3.waitForTimeout(1600);
      opening.dismissed = await p3.evaluate(() => !document.getElementById('openingOv'));
    }
    await p3.close();
  } catch (e) {
    opening.err = String(e.message || e).slice(0, 300);
  }

  await browser.close();

  const result = {
    PAGE_ERRORS: errors.length,
    errors: errors.slice(0, 8),
    systems_registered: reg.sys,
    ui_system: reg.hasUiSys,
    state_system: reg.hasState,
    effects_system: reg.hasEffects,
    media_system: reg.hasMedia,
    game_state: reg.hasGameState,
    game_state_seed: reg.snap,
    effects_animating: fxAnimating,
    fx_sample: { t1: fx1, t2: fx2 },
    stage4_write_through: probe,
    stage4_legacy_funnel: legacy,
    interaction_smoke: smoke,
    opening_layer: opening,
  };
  console.log('=== LIVE VERIFY RESULT ===');
  console.log(JSON.stringify(result, null, 2));
  const p = result.stage4_write_through;
  const l = result.stage4_legacy_funnel;
  // 交互冒烟判定:① 登舟按钮点到 ② 进入自由飞(FF.on) ③ flightLock 上锁
  //   ④ **全程零 pageerror**(最关键——spiritCount 栈溢出正是栽在这一项上)
  const s = result.interaction_smoke;
  const smokeOk = !!s && s.clicked && s.boarded && s.flightLock && s.pageErrors.length === 0 && !s.err;
  const o = result.opening_layer;
  const openingOk = !!o && o.shown && o.dismissed && o.pageErrors.length === 0 && !o.err;
  const ok = result.PAGE_ERRORS === 0 && result.ui_system && result.state_system && result.effects_system && result.media_system && result.game_state && result.effects_animating && p && p.modeThrough && p.modeStored && p.modeRestored && p.qThrough && p.qStored && p.qRestored && p.vThrough && p.vStored && p.vRestored && p.fThrough && p.fStored && p.fRestored && l && l.modeFunnel && l.modeEvt && l.quizFunnel && l.quizEvt && l.viewFunnel && l.viewEvt && l.flightFunnel && l.flightEvt && l.restored && smokeOk && openingOk;
  console.log('EXIT=' + (ok ? '0' : '1'));
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
