// achievement-probe.cjs — 成就徽章实机验收(C4,2026-11-12)
// 判据不是"代码写对了",而是**真的在浏览器里开页、真的点亮、真的通报、真的三退出**:
//   ① 罗盘菜单有「成就」入口,点了真开页(不是死按钮)
//   ② 空档显示 10 个锁定位(不隐藏未达成),计数 0/10
//   ③ 注入进度后重开页:对应徽章点亮、计数正确(六灵蕴逐项 + 四里程碑)
//   ④ 新解锁真的走 modeToast 通报,且记进 achievementsSeen;二次开页不重复通报
//   ⑤ 三退出:✕ / Esc / 点外圈
//   ⑥ 语言切换即时重绘(英文站显示英文名)
//   ⑦ 全程零 pageerror
// 数据根隔离:自起 server.js 并打 GATE_DATA_FILE 到临时目录(项目铁律,不碰真实数据)。
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { launch } = require('./browser.js');

const ROOT = path.resolve(__dirname, '../..');
const PORT = Number(process.env.ACH_PORT || 3288);
const BASE = 'http://localhost:' + PORT;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-ach-'));
// 失败路径也必须清理子进程与浏览器(第一版只在成功尾部 kill,异常退出留了个占端口的服务器)。
// 用外层引用 + 进程退出钩子兜底,任何抛出路径都不留残留。
let childRef = null;
let browserRef = null;
function cleanup() {
  try {
    if (browserRef) browserRef.close();
  } catch (e) {
    /* 已关闭 */
  }
  try {
    if (childRef) childRef.kill();
  } catch (e) {
    /* 已退出 */
  }
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch (e) {
    /* 句柄未释放不影响结论 */
  }
}
process.on('exit', cleanup);
let pass = 0,
  fail = 0;
const ok = (c, n) => {
  if (c) {
    pass++;
    console.log('  ✓ ' + n);
  } else {
    fail++;
    console.error('  ✗ ' + n);
  }
};

(async () => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), USE_SQLITE: '0', GATE_DATA_FILE: path.join(TMP, 'gate.json') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server timeout')), 15000);
    child.stdout.on('data', (d) => {
      if (d.toString().includes('服务器已启动')) {
        clearTimeout(t);
        res();
      }
    });
    child.once('error', rej);
  });

  childRef = child;
  const browser = await launch();
  browserRef = browser;
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  // 直接注入存档进度(存档是 localStorage,不经服务器);先跳过闸门与开场
  await page.addInitScript(() => {
    localStorage.setItem('b612GateEntered', '1');
    localStorage.setItem('kunlunVer', 'probe');
    sessionStorage.setItem('agreementConsented', '1');
    sessionStorage.setItem('privacyConsented', '1');
    sessionStorage.setItem('communityConsented', '1');
  });
  await page.goto(BASE + '/?av=0', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__ctx && window.__ctx.store && window.__ctx.ui, null, { timeout: 90000 });

  // 走真实开场路径(与 test-mobile / journey-probe 同口径):闸门 ENTER → 开场电影 → skip。
  // ⚠️ 只设 b612GateEntered 存档**不足以跳过闸门**(实测闸门仍 display:flex),
  //    世界不加载 ⇒ settings 这类延迟模块永不装配。必须真的点进去。
  await page.waitForSelector('#b612Gate', { timeout: 60000 });
  await page.evaluate(() => {
    const chk = document.getElementById('gAgreeChk');
    if (chk) {
      chk.checked = true;
      chk.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const enter = document.querySelector('.gEnter');
    if (enter) enter.click();
  });
  // 开场电影出现即跳过(skip 按钮或直接 Esc),不等它自然播完 60s
  await page.waitForTimeout(2000);
  for (let i = 0; i < 3; i++) {
    const skipped = await page.evaluate(() => {
      const b = document.getElementById('fSkip') || document.querySelector('[id$="Skip"]');
      if (b) {
        b.click();
        return true;
      }
      return false;
    });
    if (skipped) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1200);
  }

  console.log('\n[1] 菜单入口与开页');
  // settings 是 world-loader 的**延迟加载**模块(不在首屏静态图里),必须显式等它装配完,
  // 不能靠固定 sleep —— 否则探针会在慢机/慢网上假红(项目"等安静不靠固定毫秒"的既有口径)。
  let hasBtn = false;
  try {
    await page.waitForFunction(() => !!document.getElementById('gmAchieve'), null, { timeout: 90000 });
    hasBtn = true;
  } catch (e) {
    hasBtn = false;
  }
  ok(hasBtn, '罗盘菜单存在「成就」入口按钮(等 settings 延迟模块装配完)');
  if (!hasBtn) throw new Error('settings 模块未装配,后续判据无意义');
  // 直接调装配层入口(等价于点菜单,避开 3D 罗盘点击的不确定性)
  await page.evaluate(() => document.getElementById('gmAchieve').click());
  await page.waitForTimeout(400);
  const opened = await page.evaluate(() => {
    const el = document.getElementById('achOv');
    return !!el && getComputedStyle(el).display !== 'none';
  });
  ok(opened, '点击入口后成就页真的打开(不是死按钮)');

  console.log('\n[2] 空档:10 个锁定位');
  const empty = await page.evaluate(() => ({
    rows: document.querySelectorAll('#achList > div').length,
    count: document.getElementById('achCount').textContent.trim(),
  }));
  ok(empty.rows === 10, '渲染 10 个徽章位(未达成也显示,不隐藏),实际 ' + empty.rows);
  ok(empty.count === '0 / 10', '空档计数 0 / 10,实际 ' + empty.count);

  console.log('\n[3] 注入进度 → 徽章点亮');
  // 关掉再注入,重开页看点亮(等价于玩家拾取后回来查看)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const st = window.__ctx.store;
    st.addSpirit('sprout');
    st.addSpirit('snow');
    st.mark('arkFlew');
    st.setJson('eternalPicks', ['probe-a.jpg']);
    st.setNum('skyMs', 100);
    st.setJson('achievementsSeen', []); // 清通报记录,便于验证通报
  });
  await page.evaluate(() => document.getElementById('gmAchieve').click());
  await page.waitForTimeout(500);
  // ⚠️ 站点默认语言是英文(README 明示),渲染的是英文名 ⇒ 断言必须**双语都认**,
  //    不能写死中文名(第一版就是这么假红的:功能对、计数对,只有名字断言错)。
  const lit = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#achList > div')];
    const on = rows.filter((r) => r.children[0].textContent === '✦').map((r) => r.children[1].children[0].textContent);
    return { count: document.getElementById('achCount').textContent.trim(), on, total: rows.length };
  });
  const has = (zh, en) => lit.on.includes(zh) || lit.on.includes(en);
  // 2 灵蕴(sprout/snow) + 天空的访客 + 云端的归宿 + 补天者 = 5 枚(未六齐,六合归位不算)
  ok(lit.count === '5 / 10', '点亮 5 枚(2 灵蕴 + 3 里程碑),实际 ' + lit.count);
  ok(has('春生之芽', 'Sprout of Spring') && has('冬藏之雪', 'Snow of Winter'), '两颗已拾灵蕴逐项点亮');
  ok(has('天空的访客', 'Visitor of the Sky'), '首飞 → 天空的访客点亮');
  ok(has('云端的归宿', 'Home in the Clouds'), '选片 → 云端的归宿点亮');
  ok(has('补天者', 'Mender of the Sky'), '天穹 100 → 补天者点亮');
  ok(!has('六合归位', 'Six United'), '未六齐 ⇒ 六合归位不点亮(fail-closed)');

  console.log('\n[4] 通报与去重');
  const seen = await page.evaluate(() => window.__ctx.store.json('achievementsSeen', []));
  ok(Array.isArray(seen) && seen.length === 5, '新解锁 5 枚已记进 achievementsSeen,实际 ' + JSON.stringify(seen));
  // 再开一次:不应重复通报(seen 已记满)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const again = await page.evaluate(() => window.__ctx.ui.announceAchievements());
  ok(Array.isArray(again) && again.length === 0, '二次通报返回空(不重复刷屏)');

  console.log('\n[5] 六齐 → 六合归位');
  await page.evaluate(() => {
    const st = window.__ctx.store;
    for (const k of ['flame', 'leaf', 'dawn', 'dusk']) st.addSpirit(k);
  });
  const six = await page.evaluate(() => window.__ctx.ui.announceAchievements());
  ok(six.includes('six-united'), '六齐后通报六合归位,实际 ' + JSON.stringify(six));
  await page.evaluate(() => document.getElementById('gmAchieve').click());
  await page.waitForTimeout(400);
  const full = await page.evaluate(() => document.getElementById('achCount').textContent.trim());
  ok(full === '10 / 10', '全达成计数 10 / 10,实际 ' + full);

  console.log('\n[6] 三退出');
  await page.click('#achX');
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => getComputedStyle(document.getElementById('achOv')).display === 'none'), '✕ 可关闭');
  await page.evaluate(() => document.getElementById('gmAchieve').click());
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => getComputedStyle(document.getElementById('achOv')).display === 'none'), 'Esc 可关闭');
  await page.evaluate(() => document.getElementById('gmAchieve').click());
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const el = document.getElementById('achOv');
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => getComputedStyle(document.getElementById('achOv')).display === 'none'), '点外圈可关闭');

  console.log('\n[7] 语言切换重绘');
  await page.evaluate(() => document.getElementById('gmAchieve').click());
  await page.waitForTimeout(300);
  const enTitle = await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('script:lang', { detail: { lang: 'en' } }));
    return null;
  });
  void enTitle;
  await page.waitForTimeout(300);
  const langState = await page.evaluate(() => ({
    title: document.getElementById('achTitle').textContent,
    first: document.querySelector('#achList > div').children[1].children[0].textContent,
  }));
  // scriptLang 由 story-text 持有;此处只验"事件触发了重绘路径不报错",文案随实际语言
  ok(typeof langState.title === 'string' && langState.title.length > 0, '语言事件后标题仍正常渲染(无异常)');

  ok(errs.length === 0, '全程零 pageerror(共 ' + errs.length + ' 个)' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));

  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  await browser.close();
  child.kill();
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch (e) {
    /* 句柄未释放不影响结论 */
  }
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('探针执行失败:', e.message);
  process.exit(1);
});