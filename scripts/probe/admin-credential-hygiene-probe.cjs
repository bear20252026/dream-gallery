// admin-credential-hygiene-probe.cjs — 管理员凭据卫生验收(2026-10-11 新建)
// 主题:主 TOKEN 不再出现在 URL(不再进地址栏/浏览器历史/反代与访问日志),
//       后台鉴权改由 HttpOnly admin_session cookie 承载,内嵌元素(<img>)也靠它。
// 断言:①带 token 打开 /admin 后**最终 URL 不含 token**(服务端 302 去凭据)
//       ②后台任意时刻 document 与 performance.getEntriesByType('resource') 里没有 /admin-media/*?token=
//       ③/admin-media:带 cookie → 200;无 cookie 无 token → 401/403
//       ④主 token 不出现在任何 <img src>、localStorage/sessionStorage、document.cookie
//       ⑤TOKEN_QUERY=0(公网禁 query 传 token)时:query 通道 401 而 cookie 通道 200
//         —— 旧死结「打开 TOKEN_QUERY=0 必断图」就此解除;顺带验 x-token 头通道仍可用(CI/探针依赖)
// 只在 HTTPS/真浏览器才成立的项(Secure cookie 的落盘)在本地 http://localhost 下按 WARN 降级,不假绿。
// 用法: [ADMIN_TOKEN=<token>] [PROBE_URL=https://cloudbear.cloud] node scripts/probe/admin-credential-hygiene-probe.cjs
//   本地默认自起 server.js 服务仓库根;令牌走环境变量,没给就本进程随机生成(严禁硬编码进文件,2026-07-28 脱敏口径)。
const { launch } = require('./browser.js');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'credhygiene-'));
const PORT = Number(process.env.CRED_HYGIENE_PORT || 3254);
const ONLINE = Boolean(process.env.PROBE_URL);
const BASE = process.env.PROBE_URL || 'http://localhost:' + PORT;
const HOST_HEADER = ONLINE ? new URL(BASE).host : 'cloudbear.cloud'; // 伪装公网 Host:TOKEN_QUERY=0 的判定只认非本地
const TOKEN = process.env.ADMIN_TOKEN || 'hygiene-' + crypto.randomBytes(8).toString('hex');

function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        TOKEN,
        TOKEN_QUERY: '0', // 本次改造的关键互斥项:公网禁 query 传 token + 内嵌元素仍能显示,必须同时成立
        GATE_DATA_FILE: path.join(TMP, 'gate_data.json'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => { if (d.toString().includes('服务器已启动')) resolve(child); });
    child.on('error', reject);
    setTimeout(() => reject(new Error('服务器启动超时')), 12000);
  });
}

// 裸 HTTP 请求(要能自填 Host 头与 Cookie,绕开浏览器以验服务端判定)
function raw(pathname, opts) {
  const o = opts || {};
  const u = new URL(BASE);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        method: o.method || 'GET',
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: pathname,
        headers: { Host: o.host || HOST_HEADER, 'User-Agent': 'cred-hygiene-probe', 'x-probe': '1', ...(o.headers || {}) },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (d) => (body += d));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  if (ONLINE && !process.env.ADMIN_TOKEN) {
    console.log('❌ 线上模式必须给 ADMIN_TOKEN 环境变量(不硬编码令牌)');
    process.exit(2);
  }
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
  let sid = ''; // 浏览器拿到的会话号(HttpOnly,页面读不到,只能从 cookie jar 取)
  try {
    if (!ONLINE) child = await startServer(PORT);

    // ---------- 服务端判定(裸 HTTP,公网 Host) ----------
    const anonMedia = await raw('/admin-media/photos/201.jpg');
    ok('③a 无 cookie 无 token 的 /admin-media 被拒(401/403)', anonMedia.status === 401 || anonMedia.status === 403, 'status=' + anonMedia.status);
    // 引导跳转的响应头只能裸看(浏览器 goto 拿到的是 302 之后的最终响应)
    const boot = await raw('/admin?token=' + encodeURIComponent(TOKEN));
    ok('①b 带 token 打开 /admin → 302 到不带任何 query 的 /admin', boot.status === 302 && boot.headers.location === '/admin',
      'status=' + boot.status + ' location=' + boot.headers.location);
    const setCookie = String(boot.headers['set-cookie'] || '');
    ok('②b 下发的 cookie 里没有主 TOKEN', !setCookie.includes(TOKEN), setCookie.slice(0, 80));
    // TOKEN_QUERY=0 是本次要一并解决的互斥项:本地服由探针设;线上要看服务器 .env
    const tqCheck = ONLINE ? soft : ok;
    const queryMedia = await raw('/admin-media/photos/201.jpg?token=' + encodeURIComponent(TOKEN));
    tqCheck('⑤a TOKEN_QUERY=0:公网 query 传 token 被拒(401)' + (ONLINE ? '(线上未确认该环境变量,降级 WARN)' : ''),
      queryMedia.status === 401, 'status=' + queryMedia.status);
    const headerApi = await raw('/api/admin/list', { headers: { 'x-token': TOKEN } });
    ok('⑤b x-token 请求头通道仍然可用(CI/探针/命令行运维未断)', headerApi.status === 200, 'status=' + headerApi.status);
    const pageAnon = await raw('/admin');
    ok('③b 无凭据直开 /admin 被拒(401,fail-closed)', pageAnon.status === 401, 'status=' + pageAnon.status);

    // ---------- 浏览器:真实使用路径 ----------
    const b = await launch();
    const ctx = await b.newContext();
    const page = await ctx.newPage();
    const errors = [];
    const mediaReqs = []; // 缩略图发出的请求(证明场景不是空跑)
    const mediaRes = []; // 对应状态码
    const httpErrors = [];
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
    page.on('request', (r) => {
      const u = r.url();
      if (/\/admin-media\//.test(u)) mediaReqs.push({ url: u, leaked: /[?&]token=/.test(u) });
    });
    page.on('response', (res) => {
      const u = res.url();
      if (/\/admin-media\//.test(u)) mediaRes.push({ url: u, status: res.status() });
      if (res.status() >= 400) httpErrors.push(res.status() + ' ' + u);
    });
    await page.goto(BASE + '/admin?token=' + encodeURIComponent(TOKEN), { waitUntil: 'domcontentloaded', timeout: 60000 });
    ok('① 带 token 打开 /admin 后最终 URL 不含 token(302 去凭据)', !/[?&]token=/.test(page.url()), page.url());
    soft('②a Set-Cookie 带 HttpOnly/Secure/SameSite=Strict/Max-Age=8h',
      /HttpOnly/i.test(setCookie) && /Secure/i.test(setCookie) && /SameSite=Strict/i.test(setCookie) && /Max-Age=28800/.test(setCookie),
      setCookie.slice(0, 120));

    const jar = await ctx.cookies();
    const ck = jar.find((c) => c.name === 'admin_session');
    sid = (ck && ck.value) || '';
    ok('②c 浏览器确实持有 admin_session cookie(会话已建立)', Boolean(sid) && /^[0-9a-f]{64}$/.test(sid), JSON.stringify(jar.map((c) => c.name)));
    if (!ONLINE) {
      soft('②d 本地 http://localhost 下 Secure cookie 被浏览器接受(线上 HTTPS 必然成立)', Boolean(ck && ck.secure), ck && 'secure=' + ck.secure);
    }

    // 切「文件管理」让缩略图真发请求(旧探针的空跑教训)
    await page.evaluate(() => {
      const t = document.querySelector('.tab[data-tab="files"]');
      if (t) t.click(); else if (typeof window.switchTab === 'function') window.switchTab('files');
    });
    await page.waitForTimeout(4000);

    const dom = await page.evaluate((mainToken) => {
      const imgs = [...document.querySelectorAll('img')].map((i) => i.getAttribute('src') || '');
      const res = performance.getEntriesByType('resource').map((e) => e.name);
      return {
        imgs,
        adminMediaImgs: imgs.filter((s) => s.indexOf('/admin-media/') === 0),
        imgsWithToken: imgs.filter((s) => /token=/i.test(s)),
        mediaWithTokenResource: res.filter((n) => /\/admin-media\/[^?]*\?[^#]*token=/i.test(n)),
        anyTokenResource: res.filter((n) => n.indexOf(mainToken) >= 0),
        urlHasToken: /[?&]token=/.test(location.search),
        storageWithToken: (() => {
          const hit = [];
          for (const store of ['localStorage', 'sessionStorage']) {
            try {
              const s = window[store];
              for (let i = 0; i < s.length; i++) {
                const k = s.key(i);
                if (String(s.getItem(k)).indexOf(mainToken) >= 0 || String(k).indexOf(mainToken) >= 0) hit.push(store + ':' + k);
              }
            } catch (e) {}
          }
          return hit;
        })(),
        documentCookieHasSid: document.cookie.indexOf('admin_session') >= 0,
        bodyText: (document.body.innerText || '').slice(0, 200),
      };
    }, TOKEN);

    ok('②e 资源计时里没有任何 /admin-media/*?token=', dom.mediaWithTokenResource.length === 0, JSON.stringify(dom.mediaWithTokenResource.slice(0, 3)));
    ok('②f 资源计时里绝不出现主 TOKEN 字面量', dom.anyTokenResource.length === 0, JSON.stringify(dom.anyTokenResource.slice(0, 3)));
    ok('③c 缩略图确实请求过 /admin-media 且请求 URL 不带 token(场景非空跑)',
      mediaReqs.length > 0 && mediaReqs.every((m) => !m.leaked), JSON.stringify(mediaReqs.slice(0, 3)));
    ok('③e 全部 /admin-media 响应 200(cookie 鉴权成功,不是断图复现)',
      mediaRes.length > 0 && mediaRes.every((m) => m.status === 200), JSON.stringify(mediaRes.filter((m) => m.status !== 200).slice(0, 3)));
    ok('③f 后台加载过程中零 401/403 响应', !httpErrors.some((e) => /^40[13]\s/.test(e)), JSON.stringify(httpErrors.slice(0, 3)));
    ok('④ 主 token 不出现在任何 <img src>', dom.imgsWithToken.length === 0, JSON.stringify(dom.imgsWithToken.slice(0, 3)));
    ok('④b 后台 <img src> 是裸 /admin-media 路径(无查询串)',
      dom.adminMediaImgs.length === 0 || dom.adminMediaImgs.every((s) => !s.includes('?')),
      JSON.stringify(dom.adminMediaImgs.slice(0, 2)));
    ok('④c 主 token 不在 localStorage/sessionStorage 里', dom.storageWithToken.length === 0, JSON.stringify(dom.storageWithToken));
    ok('④d 会话 cookie 是 HttpOnly(页面 document.cookie 读不到)', !dom.documentCookieHasSid, dom.documentCookieHasSid);
    ok('④e 页面仍无 token(URL 干净)', !dom.urlHasToken, page.url());
    ok('⑤c 后台数据真的加载了(不是 401 空白页)', !/401/.test(dom.bodyText.slice(0, 60)), dom.bodyText.slice(0, 60));

    // 带 cookie 的 /admin-media 由浏览器验过(上面缩略图全 200);这里再用会话号从裸 HTTP 复一次
    if (sid) {
      const byCookie = await raw('/admin-media/photos/201.jpg', { headers: { cookie: 'admin_session=' + sid } });
      ok('③d 裸 HTTP 带 cookie 的 /admin-media → 200(Path=/ SameSite=Strict)', byCookie.status === 200, 'status=' + byCookie.status);
      const apiByCookie = await raw('/api/admin/list', { headers: { cookie: 'admin_session=' + sid } });
      ok('⑤d 后台 API 也认 cookie(不必再塞 x-token)', apiByCookie.status === 200, 'status=' + apiByCookie.status);
    } else {
      console.log('  ⚠️ 未取到 admin_session cookie,跳过裸 HTTP 会话复测');
    }

    ok('N. 无 JS 未捕获异常', errors.length === 0, errors.slice(0, 2).join(' | '));
    await b.close();
  } finally {
    if (child) child.kill();
  }
  console.log('\n=== 管理员凭据卫生验收:' + pass + ' 通过 / ' + fail + ' 失败 / ' + warn + ' WARN ===');
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('探针崩了: ' + e.message); process.exit(2); });
