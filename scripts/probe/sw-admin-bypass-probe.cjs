// sw-admin-bypass-probe.cjs — SW 对 /admin 系列绕过 + 凭据永不落盘 验收(2026-09-25 建;2026-10-11 补真实场景)
// 背景:/admin 不带 .html,曾被 sw.js 当静态资源走 SWR,后台更新后主人首屏仍是旧 admin.html
//   (「报错反馈 文件不存在」久修不愈真凶);且 /admin?token= 整 URL 落盘 = 管理凭据持久化到磁盘。
// 2026-10-11 关键闭环(审计点名「检测规则对但测试场景少一步」):旧版只在报错 tab 上打转,
//   全程零 /admin-media 请求 ⇒ 「缓存里没有任何 /admin* 条目」是空集上的真话(假绿)。
//   本版真正走「开后台 → 切文件管理 tab → 缩略图请求必须 200 → 读 Cache Storage 全量 keys」,
//   并先伪造一个被 v14 污染过的旧池(带 ?token= 的 /admin-media 条目),验证升版清池真的生效。
// 断言:①旧池清空只剩 VER 池 ②/admin-media 缩略图确实发过且全 200(非空过)
//       ③缓存内零 /admin* 与 /admin-media* 条目 ④缓存内零带 token/mt/sig 的条目
//       ⑤带令牌查询串的非后台资源也不被缓存(通用凭据规则) ⑥页面内 <img src> 不含 token
//       ⑦后台功能完好(报错 tab 可切可读)+ 无 pageerror
// 用法: [ADMIN_TOKEN=<token>] [PROBE_URL=https://cloudbear.cloud] node scripts/probe/sw-admin-bypass-probe.cjs
//   默认本地起服:令牌取环境变量 ADMIN_TOKEN,没给就本进程随机生成(严禁把令牌硬编码进文件,2026-07-28 脱敏口径)。
const { launch } = require('./browser.js');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'swbypass-'));
const PORT = process.env.SW_BYPASS_PORT || 3252;
// 线上模式:设了 PROBE_URL 就不起本地服,直接测线上
const ONLINE = Boolean(process.env.PROBE_URL);
const BASE = (process.env.PROBE_URL || 'http://localhost:' + PORT).replace(/\/+$/, '');
const TOKEN = process.env.ADMIN_TOKEN || 'swprobe-' + crypto.randomBytes(8).toString('hex');
// 2026-10-10:改为从 public/sw.js 源码直读 VER——升版只改 sw.js 一处,探针不再手工跟
const VER = (() => {
  const m = require('fs').readFileSync(require('path').join(__dirname, '../../public/sw.js'), 'utf8').match(/const VER = ['"]([^'"]+)['"]/);
  if (!m) throw new Error('public/sw.js 里找不到 VER 常量');
  return m[1];
})();
const LEGACY_POOL = 'gallery-v14'; // 被旧版 SW 污染过的池(曾把带 token 的 URL 落盘)

function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        TOKEN,
        GATE_DATA_FILE: path.join(TMP, 'gate_data.json'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => { if (d.toString().includes('服务器已启动')) resolve(child); });
    child.on('error', reject);
    setTimeout(() => reject(new Error('服务器启动超时')), 12000);
  });
}

(async () => {
  // 本地静态服务不映射 public/,临时把 sw.js 放到根(swcoped '/' 需要 /sw.js 可达)
  const swDst = path.join(ROOT, 'sw.js');
  const swSrc = path.join(ROOT, 'public', 'sw.js');
  if (!ONLINE) fs.copyFileSync(swSrc, swDst);
  let child;
  let pass = 0, fail = 0, warn = 0;
  const ok = (name, cond, extra) => {
    if (cond) { pass++; console.log('  ✅ ' + name); }
    else { fail++; console.log('  ❌ ' + name + (extra ? ' → ' + extra : '')); }
  };
  const soft = (name, cond, extra) => {
    if (cond) { pass++; console.log('  ✅ ' + name); }
    else { warn++; console.log('  ⚠️ WARN ' + name + (extra ? ' → ' + extra : '')); }
  };
  try {
    if (!ONLINE) child = await startServer(PORT);
    const b = await launch();
    const ctx = await b.newContext();
    const page = await ctx.newPage();
    const errors = [];
    const mediaHits = []; // /admin-media 实际发出的请求 + 状态码(证明场景不是空跑)
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
    page.on('response', (r) => {
      const u = r.url();
      if (/\/admin-media\//.test(u)) mediaHits.push({ url: u, status: r.status() });
    });

    // 0) 引导登录:/admin?token= 必须被 302 洗成无凭据 URL(2026-10-11 新语义)
    await page.goto(BASE + '/admin?token=' + encodeURIComponent(TOKEN), { waitUntil: 'domcontentloaded', timeout: 60000 });
    ok('A. 引导后地址栏不含 token(302 去凭据生效)', !/[?&]token=/.test(page.url()), page.url());
    const jar = await ctx.cookies();
    const sessCookie = jar.find((c) => c.name === 'admin_session');
    ok('B. 已签发 admin_session cookie', Boolean(sessCookie), JSON.stringify(jar.map((c) => c.name)));
    soft('C. cookie 属性 HttpOnly(+Secure/SameSite=Strict)', Boolean(sessCookie && sessCookie.httpOnly), sessCookie && JSON.stringify({ httpOnly: sessCookie.httpOnly, secure: sessCookie.secure, sameSite: sessCookie.sameSite }));

    // 1) 注册 SW 之前先造一个「被 v14 污染过的旧池」,里面放着带 token 的后台条目
    await page.evaluate(async (legacy) => {
      const c = await caches.open(legacy);
      await c.put('/admin?token=LEAK', new Response('x'));
      await c.put('/admin-media/photos/201.jpg?token=LEAK', new Response('x'));
    }, LEGACY_POOL);

    // 2) 注册 SW 并等激活(activate 会删掉非 VER 的全部旧池)
    await page.evaluate(() => navigator.serviceWorker.register('/sw.js'));
    await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true), { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500); // install/activate/claim

    // 3) SW 控制下重开 /admin(不带 token,靠 cookie),切「文件管理」让缩略图真发请求
    await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      const t = document.querySelector('.tab[data-tab="files"]');
      if (t) t.click(); else if (typeof window.switchTab === 'function') window.switchTab('files');
    });
    await page.waitForTimeout(4000); // switchTab 里 setTimeout(loadFn,200) + 三次目录列表 + 缩略图加载

    // 4) 带令牌查询串的「非后台」资源也必须绕过 SW(通用凭据规则,不只 admin)
    await page.evaluate(async () => {
      await fetch('/data.js?token=SOMETOKEN');
      await fetch('/photos/201.jpg?token=SOMETOKEN');
      await fetch('/photos/201.jpg'); // 对照组:后台外的普通媒体(是否入库由服务端 Cache-Control 裁决)
    });
    await page.waitForTimeout(1200);

    const st = await page.evaluate(async () => {
      const keys = await caches.keys();
      const entries = [];
      for (const k of keys) {
        const pool = await caches.open(k);
        for (const r of await pool.keys()) {
          const u = new URL(r.url);
          entries.push({ pool: k, pathname: u.pathname, cred: ['token', 'mt', 'sig'].some((p) => u.searchParams.has(p)) });
        }
      }
      const imgs = [...document.querySelectorAll('img')].map((i) => i.getAttribute('src') || '');
      const res = performance.getEntriesByType('resource').map((e) => e.name);
      return {
        controlled: !!navigator.serviceWorker.controller,
        pools: keys,
        entries,
        imgsWithToken: imgs.filter((s) => /token=/.test(s)),
        mediaImgs: imgs.filter((s) => (s || '').startsWith('/admin-media/')),
        credResources: res.filter((n) => /[?&](token|mt|sig)=/.test(n)),
        hasSwitchTab: typeof window.switchTab === 'function',
        stillTokenInUrl: /[?&]token=/.test(location.search),
      };
    });

    ok('D. 重开后页面已被 SW 控制', st.controlled);
    ok('E. 旧缓存池已清,只剩 ' + VER + '(' + LEGACY_POOL + ' 里的 token 条目随之消失)',
      st.pools.length === 1 && st.pools[0] === VER, JSON.stringify(st.pools));
    ok('F. 文件管理缩略图确实请求过 /admin-media 且全部 200(场景非空跑)',
      mediaHits.length > 0 && mediaHits.every((h) => h.status === 200), JSON.stringify(mediaHits.slice(0, 3)));
    ok('G. 缓存池无任何 /admin、/admin/*、/admin-media/* 条目',
      st.entries.every((e) => !(e.pathname === '/admin' || e.pathname === '/admin-media' || e.pathname.startsWith('/admin/') || e.pathname.startsWith('/admin-media/'))),
      JSON.stringify(st.entries));
    ok('H. 缓存池无任何带 token/mt/sig 查询串的条目(含上面两条哨兵请求:带凭据的 URL 一律不落盘)',
      st.entries.every((e) => !e.cred), JSON.stringify(st.entries.filter((e) => e.cred)));
    ok('I. 页面内 <img src> 不带 token,且后台 URL 已无 token',
      st.imgsWithToken.length === 0 && !st.stillTokenInUrl, JSON.stringify(st.imgsWithToken));
    // 哨兵(SOMETOKEN)是第 4 步自己构造的通用凭据规则样本,必须排除后再判定「真实凭据从未出现在请求里」
    const realCred = st.credResources.filter((n) => !/SOMETOKEN/.test(n));
    ok('J. 除探针哨兵外,资源计时里没有任何带 token/mt/sig 的请求', realCred.length === 0, JSON.stringify(realCred.slice(0, 3)));
    soft('K. 后台缩略图走的是裸 /admin-media 路径(cookie 鉴权)', st.mediaImgs.length === mediaHits.length,
      'img=' + st.mediaImgs.length + ' 请求=' + mediaHits.length);

    // 5) SW 控制下后台功能完好:切「报错反馈」tab 能读
    await page.evaluate(() => { const t = document.querySelector('.tab[data-tab="errors"]'); if (t) t.click(); });
    await page.waitForTimeout(2500);
    const tab = await page.evaluate(() => ({
      panel: (() => { const p = document.getElementById('tab-errors'); return p && p.style.display !== 'none'; })(),
      list: ((document.getElementById('errList') || {}).innerHTML || '').length,
      switchTab: typeof window.switchTab === 'function',
    }));
    ok('L. 后台脚本加载(switchTab 全局兜底)', tab.switchTab);
    ok('M. 报错 tab 可切换且 errList 有渲染', tab.panel && tab.list > 0);
    ok('N. 无 JS 未捕获异常', errors.length === 0, errors.slice(0, 2).join(' | '));

    await b.close();
  } finally {
    if (child) child.kill();
    if (!ONLINE) try { fs.unlinkSync(swDst); } catch (e) {}
  }
  console.log('\n=== SW /admin 绕过 + 凭据不落盘验收:' + pass + ' 通过 / ' + fail + ' 失败 / ' + warn + ' WARN ===');
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('探针崩了: ' + e.message); process.exit(2); });
