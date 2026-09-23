// b612-pact-probe.cjs — 线上探针:三协议并列面板(P1-1,2026-09-23)
//
// 验收什么:
//   ① 闸门底行三个协议名点开的是**并列面板**,不是整页跳转;
//   ② 面板内三标签切换正常,每份各自勾选,进度计数 1/3 → 2/3 → 3/3;
//   ③ 三份勾完返回闸门,闸门总勾选框被自动勾上、ENTER 点亮;
//   ④ 全程 **零整页 reload**(用 performance.navigation 与 page 的 framenavigated 计数验证);
//   ⑤ 内嵌文档带 ?embed=1,自带的 consentBar 与返回按钮已隐藏;
//   ⑥ 关闭面板(‹ 返回闸门 / Esc)后闸门恢复,签收状态不丢。
//
// 用法:PROBE_URL=https://cloudbear.cloud node scripts/probe/b612-pact-probe.cjs
const { launch } = require('../probe/browser.js');

const URL = process.env.PROBE_URL || 'http://localhost:5173';
const WAIT = +(process.env.PROBE_WAIT_MS || 60000);

let pass = 0,
  fail = 0;
function ok(name, cond, extra) {
  if (cond) {
    pass++;
    console.log('  ✅ ' + name);
  } else {
    fail++;
    console.log('  ❌ ' + name + (extra ? '  → ' + extra : ''));
  }
}

(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  // 数整页导航次数 —— 这正是 P1-1 要消灭的东西
  let navCount = 0;
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) navCount++;
  });

  console.log('=== 三协议并列面板验收 (P1-1) ===');
  console.log('URL: ' + URL + '\n');

  await page.goto(URL + '/', { waitUntil: 'domcontentloaded', timeout: WAIT });

  // 闸门是开场第一屏 —— 等它出现
  await page.waitForSelector('#b612Gate', { timeout: WAIT });
  await page.waitForTimeout(800);
  ok('A. 闸门已显示 (#b612Gate)', true);

  const navBefore = navCount;

  // ---- B: 点第一个协议名,应打开并列面板而非跳转 ----
  await page.evaluate(() => {
    const a = document.querySelector('#b612Gate .gLegal a[data-doc="agreement.html"]');
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await page.waitForSelector('#b612Pact', { timeout: 8000 }).catch(() => {});
  const hasPact = await page.evaluate(() => !!document.getElementById('b612Pact'));
  ok('B. 点协议名打开并列面板 (#b612Pact)', hasPact);
  ok('B2. 未发生整页导航', navCount === navBefore, 'navCount ' + navBefore + ' → ' + navCount);

  if (!hasPact) {
    console.log('\n面板未出现,后续用例跳过');
    await b.close();
    process.exit(1);
  }

  const tabInfo = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('#b612Pact .pTab')].map((t) => t.textContent.trim());
    const frame = document.querySelector('#b612Pact .pDoc');
    return { tabs, src: frame ? frame.getAttribute('src') : null, n: tabs.length };
  });
  ok('C. 三个标签页就位', tabInfo.n === 3, JSON.stringify(tabInfo.tabs));
  ok('C2. 首个文档带 ?embed=1', /embed=1/.test(tabInfo.src || ''), tabInfo.src);

  // ---- D: iframe 内文档的 consentBar / 返回键应被隐藏 ----
  await page.waitForTimeout(2500);
  const frameEl = await page.$('#b612Pact .pDoc');
  const fr = await frameEl.contentFrame();
  let embedOk = false,
    cbHidden = null;
  if (fr) {
    const inDoc = await fr
      .evaluate(() => {
        const cb = document.getElementById('consentBar');
        const fixedBack = [...document.querySelectorAll('button')].filter(
          (x) => (x.textContent || '').indexOf('返回') >= 0 && x.style.position === 'fixed'
        ).length;
        return {
          hasCb: !!cb,
          cbDisplay: cb ? getComputedStyle(cb).display : null,
          fixedBack,
        };
      })
      .catch(() => null);
    if (inDoc) {
      cbHidden = inDoc.cbDisplay === 'none';
      embedOk = cbHidden && inDoc.fixedBack === 0;
      console.log('     · iframe 内:consentBar display=' + inDoc.cbDisplay + ', 固定返回键=' + inDoc.fixedBack);
    }
  }
  ok('D. 内嵌文档隐藏自带 consentBar 与返回键', embedOk, 'frame=' + !!fr);

  // ---- E: 三份依次勾选,进度 1/3 → 2/3 → 3/3 ----
  async function tickCurrent() {
    await page.evaluate(() => {
      const c = document.getElementById('pChk');
      c.checked = true;
      c.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(300);
  }
  async function next() {
    await page.evaluate(() => document.getElementById('pNext').click());
    await page.waitForTimeout(1200);
  }

  const prog = () =>
    page.evaluate(() => (document.getElementById('pProg') || {}).textContent || '');
  const nextDisabled = () =>
    page.evaluate(() => {
      const n = document.getElementById('pNext');
      return n ? n.disabled : null;
    });

  ok('E0. 未勾选时「下一份」禁用', (await nextDisabled()) === true);

  await tickCurrent();
  ok('E1. 第一份勾选后进度 1/3', /1\s*\/\s*3/.test(await prog()), await prog());
  await next();

  const tab2on = await page.evaluate(
    () => document.querySelectorAll('#b612Pact .pTab')[1].classList.contains('on')
  );
  ok('E2. 切到第二份(privacy)', tab2on);
  const checkedReset = await page.evaluate(() => document.getElementById('pChk').checked);
  ok('E3. 换文档后勾选框复位(三份独立签署)', checkedReset === false);

  await tickCurrent();
  ok('E4. 第二份勾选后进度 2/3', /2\s*\/\s*3/.test(await prog()), await prog());
  await next();

  await tickCurrent();
  ok('E5. 第三份勾选后进度 3/3', /3\s*\/\s*3/.test(await prog()), await prog());
  const lastBtnText = await page.evaluate(() => document.getElementById('pNext').textContent);
  // 文案语言由 scriptLang() 决定(默认 en,切中文后为 zh)—— 两种都接受
  ok(
    'E6. 末份按钮文案为「返回闸门 / back to gate」',
    /返回闸门|back to gate/i.test(lastBtnText),
    lastBtnText
  );

  // ---- F: 三份签毕 → 面板关闭 + 闸门勾选自动点亮 ----
  await next();
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => {
    const pact = document.getElementById('b612Pact');
    return {
      pactHidden: pact ? getComputedStyle(pact).display === 'none' : true,
      gateChk: (document.getElementById('gAgreeChk') || {}).checked,
      enterReady: (document.querySelector('#b612Gate .gEnter') || { classList: { contains: () => false } }).classList.contains('ready'),
      consents: [
        sessionStorage.getItem('agreementConsented'),
        sessionStorage.getItem('privacyConsented'),
        sessionStorage.getItem('communityConsented'),
      ],
    };
  });
  ok('F1. 面板已关闭', after.pactHidden);
  ok('F2. 闸门总勾选框被自动勾上', after.gateChk === true);
  ok('F3. ENTER 点亮', after.enterReady === true);
  ok('F4. 三个会话签收键均已写', after.consents.every((x) => x === '1'), JSON.stringify(after.consents));

  // ---- G: 全程零整页 reload(核心指标) ----
  ok('G. 全程零整页 reload', navCount === navBefore, 'navCount ' + navBefore + ' → ' + navCount);

  // ---- H: 关面板(重开后 Esc)闸门恢复 ----
  await page.evaluate(() => {
    const a = document.querySelector('#b612Gate .gLegal a[data-doc="privacy.html"]');
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(700);
  const reopened = await page.evaluate(() => {
    const p = document.getElementById('b612Pact');
    return {
      shown: p && getComputedStyle(p).display !== 'none',
      onIdx: [...document.querySelectorAll('#b612Pact .pTab')].findIndex((t) =>
        t.classList.contains('on')
      ),
      dots: [...document.querySelectorAll('#b612Pact .pTab')].map((t) =>
        t.classList.contains('signed')
      ),
    };
  });
  ok('H1. 面板可重开', reopened.shown === true);
  ok('H2. 三份签收标记(绿点)保留', reopened.dots.every(Boolean), JSON.stringify(reopened.dots));

  await page.keyboard.press('Escape');
  // 闸门恢复有 1.2s opacity 过渡(#b612Gate{transition:opacity 1.2s ease}),
  // 采样过早会拿到中间值 → 等过渡跑完再读
  await page.waitForTimeout(1800);
  const escRes = await page.evaluate(() => {
    const p = document.getElementById('b612Pact');
    const g = document.getElementById('b612Gate');
    return {
      pactHidden: p ? getComputedStyle(p).display === 'none' : true,
      gateOpacity: g ? getComputedStyle(g).opacity : null,
    };
  });
  ok('H3. Esc 关闭面板', escRes.pactHidden === true);
  ok('H4. 闸门恢复显示', Number(escRes.gateOpacity) > 0.99, 'opacity=' + escRes.gateOpacity);

  ok('I. 无 JS 报错', errors.length === 0, errors.slice(0, 3).join(' | '));

  console.log('\n=== 结果:' + pass + ' 通过 / ' + fail + ' 失败 ===');
  await b.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('探针异常:', e.message);
  process.exit(1);
});
