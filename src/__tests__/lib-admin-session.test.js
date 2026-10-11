// 管理员会话(lib/admin.js + lib/routes.js /admin 入口)契约测试(2026-10-11 凭据治理)
// 钉死这几条行为:
//   ① /admin?token=<TOKEN> 只做一次性引导:签发 HttpOnly/Secure/SameSite=Strict 的 admin_session
//      并 302 到不带任何 query 的 /admin —— 主 TOKEN 绝不进 Set-Cookie,也不留在 Location 里;
//   ② 三条鉴权通道并存不互斥:x-token 头、query.token、admin_session cookie 各自可单独过;
//      移除任何一条都会断 CI/探针/命令行运维,所以三条都得绿;
//   ③ TOKEN_QUERY=0 关掉公网 query 后,后台内嵌元素(/admin-media)靠 cookie 仍然 200
//      —— 这是「TOKEN_QUERY=0 与内嵌元素断图互斥」旧死结的解药;
//   ④ 伪造/畸形/过期 cookie 一律 false(与「不存在」同码,不泄漏「存在但无效」);
//      过期条目被清理,条目数有上限;落盘的是 sha256(sessionId),不是 sessionId 本身。
// 数据落系统临时目录,不碰真实 gate_data.json/db。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { Writable } from 'node:stream';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-adminsess-'));
process.env.GATE_DATA_FILE = path.join(tmpDir, 'gate_data.json'); // 必须在 require store 之前
process.env.TOKEN = 'vitest-admin-token-777';
process.env.MULTI = 'off';
process.env.PORT = '0';

const require = createRequire(import.meta.url);
const { TOKEN } = require('../../lib/config.js');
const {
  gateData,
  saveGateData,
  issueSession,
  getApplicant,
  revokeSession,
} = require('../../lib/store.js');
const admin = require('../../lib/admin.js');
const { dispatch, ROUTES } = require('../../lib/routes.js');

const {
  tokenOk,
  tokenOkPage,
  adminSessionOk,
  adminSessionCookie,
  issueAdminSession,
  ADMIN_COOKIE,
} = admin;

const UA = 'Mozilla/5.0 (admin-session-test)';

function reqOf(headers, remote) {
  return {
    method: 'GET',
    headers: { 'user-agent': UA, host: 'localhost:3000', ...(headers || {}) },
    url: '',
    socket: { remoteAddress: remote || '127.0.0.1' },
    on() {},
    destroy() {},
  };
}
function cookieReq(sid, extra) {
  return reqOf({ cookie: `${ADMIN_COOKIE}=${sid}`, ...(extra || {}) });
}
// 可写 mock:/admin 与 /admin-media 命中后走 serveStatic(fs.createReadStream().pipe(res)),
// 必须是真 Writable 才不会把管道甩飞
function mockRes() {
  const chunks = [];
  const res = new Writable({
    write(c, e, cb) {
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c)));
      cb();
    },
  });
  res.headers = {};
  res.code = 0;
  res.setHeader = (k, v) => {
    res.headers[k] = v;
  };
  res.getHeader = (k) => res.headers[k];
  res.writeHead = (code, h) => {
    res.code = code;
    if (h) Object.assign(res.headers, h);
    return res;
  };
  res.finished = new Promise((r) => res.once('finish', r));
  // serveStatic 是 fs.stat 回调里才 writeHead 的异步链路:断言 code 前先收束(超时兜底防挂测)
  res.settle = () => Promise.race([res.finished, new Promise((r) => setTimeout(r, 1500))]);
  res.text = async () => {
    await res.finished;
    return Buffer.concat(chunks).toString('utf8');
  };
  res.jsonBody = async () => {
    const t = await res.text();
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  };
  return res;
}
function hit(method, url, headers) {
  const u = new URL(url, 'http://localhost:3000');
  const req = reqOf(headers);
  req.method = method;
  req.url = url;
  const res = mockRes();
  const handled = dispatch(
    req,
    res,
    decodeURIComponent(u.pathname),
    Object.fromEntries(u.searchParams)
  );
  return { handled, res, req };
}
function cookieOf(res) {
  const raw = res.headers['Set-Cookie'];
  return Array.isArray(raw) ? raw[0] : String(raw || '');
}
function sidOf(setCookie) {
  const m = /admin_session=([0-9a-f]+)/.exec(setCookie || '');
  return m ? m[1] : '';
}

let snapSessions;
let snapApplicants;
beforeEach(() => {
  snapSessions = gateData.adminSessions;
  snapApplicants = gateData.applicants;
  gateData.adminSessions = {};
  gateData.applicants = {};
});
afterEach(() => {
  gateData.adminSessions = snapSessions;
  gateData.applicants = snapApplicants;
  delete process.env.TOKEN_QUERY;
});

describe('cookie 签发与判定', () => {
  it('issueAdminSession 返回 32 字节随机 hex,落盘的是 sha256 而不是会话号本身', () => {
    const sid = issueAdminSession();
    expect(sid).toMatch(/^[0-9a-f]{64}$/);
    const map = gateData.adminSessions;
    expect(Object.keys(map)).toEqual([crypto.createHash('sha256').update(sid).digest('hex')]);
    expect(JSON.stringify(map)).not.toContain(sid);
    expect(map[Object.keys(map)[0]]).toBeGreaterThan(Date.now());
  });

  it('Set-Cookie 属性齐备:HttpOnly + Secure + SameSite=Strict + Path=/ + Max-Age=8h,且不含主 TOKEN', () => {
    const sid = issueAdminSession();
    const c = adminSessionCookie(sid);
    expect(c).toContain(`${ADMIN_COOKIE}=${sid}`);
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
    expect(c).toContain('SameSite=Strict');
    expect(c).toContain('Path=/');
    expect(c).toContain('Max-Age=28800');
    expect(c).not.toContain(TOKEN);
  });

  it('有效 cookie 即鉴权通过;伪造、畸形、空值一律 false', () => {
    const sid = issueAdminSession();
    expect(adminSessionOk(cookieReq(sid))).toBe(true);
    expect(adminSessionOk(cookieReq('f'.repeat(64)))).toBe(false);
    expect(adminSessionOk(cookieReq('not-hex'))).toBe(false);
    expect(adminSessionOk(cookieReq(''))).toBe(false);
    expect(adminSessionOk(reqOf({}))).toBe(false);
  });

  it('过期会话 false 并从表里清掉(不会被复活)', () => {
    const sid = issueAdminSession();
    const h = Object.keys(gateData.adminSessions)[0];
    gateData.adminSessions[h] = Date.now() - 1000;
    expect(adminSessionOk(cookieReq(sid))).toBe(false);
    expect(gateData.adminSessions[h]).toBeUndefined();
  });

  it('会话条目数封顶(引导链接被反复打开也不无界增长)', () => {
    for (let i = 0; i < 60; i++) issueAdminSession();
    expect(Object.keys(gateData.adminSessions).length).toBeLessThanOrEqual(50);
  });
});

describe('三条鉴权通道并存', () => {
  it('x-token 头 / query.token / cookie 各自单独可过', () => {
    expect(tokenOk(reqOf({ 'x-token': TOKEN }), {})).toBe(true);
    expect(tokenOk(reqOf({}), { token: TOKEN })).toBe(true);
    expect(tokenOk(cookieReq(issueAdminSession()), {})).toBe(true);
    expect(tokenOkPage(reqOf({ 'x-token': TOKEN }), {})).toBe(true);
    expect(tokenOkPage(reqOf({}), { token: TOKEN })).toBe(true);
    expect(tokenOkPage(cookieReq(issueAdminSession()), {})).toBe(true);
  });

  it('错值不放行,长度不同不比较(常量时间比较的边界)', () => {
    expect(tokenOk(reqOf({ 'x-token': 'wrong' }), {})).toBe(false);
    expect(tokenOk(reqOf({}), { token: 'wrong' })).toBe(false);
    expect(tokenOk(reqOf({}), { token: TOKEN + 'x' })).toBe(false);
    expect(tokenOk(reqOf({}), {})).toBe(false);
  });

  it('带了 x-token 头就不再认 query(头优先,不被低优先级通道绕过)', () => {
    expect(tokenOk(reqOf({ 'x-token': 'wrong' }), { token: TOKEN })).toBe(false);
  });

  it('TOKEN_QUERY=0:公网 query 被拒,但 cookie 照过 —— 后台内嵌元素不再需要查询令牌', () => {
    process.env.TOKEN_QUERY = '0';
    const publicHost = reqOf({ host: 'cloudbear.cloud' }, '203.0.113.7');
    expect(tokenOk(publicHost, { token: TOKEN })).toBe(false);
    expect(tokenOk(cookieReq(issueAdminSession()), { host: 'cloudbear.cloud' })).toBe(true);
    expect(tokenOk(reqOf({ 'x-token': TOKEN, host: 'cloudbear.cloud' }, '203.0.113.7'))).toBe(true);
  });

  it('TOKEN_QUERY=0 时本地 query 仍放行(本地开发/测试不破)', () => {
    process.env.TOKEN_QUERY = '0';
    expect(tokenOk(reqOf({}), { token: TOKEN })).toBe(true);
  });

  it('空凭据一律拒:无凭据 / 空 cookie / 空头都不算过', () => {
    expect(tokenOk(reqOf({}), { token: '' })).toBe(false);
    expect(tokenOkPage(reqOf({}), {})).toBe(false);
    expect(adminSessionOk(reqOf({ cookie: 'admin_session=' }))).toBe(false);
    expect(adminSessionOk(reqOf({ cookie: 'other=1' }))).toBe(false);
  });
});

describe('/admin 入口:一次性引导 + 302 去凭据', () => {
  it('路由表没被改动:GET /admin 仍只有一条,端点总数不变(58)', () => {
    const adminRoutes = ROUTES.filter((r) => r.match === '/admin');
    expect(adminRoutes.length).toBe(1);
    expect(adminRoutes[0].auth).toBe('adminPage');
    expect(ROUTES.length).toBe(58);
  });

  it('带 token 打开 → 302 到不带 query 的 /admin + Set-Cookie 全属性 + Vary 含 Cookie', async () => {
    const { res } = hit('GET', '/admin?token=' + encodeURIComponent(TOKEN));
    expect(res.code).toBe(302);
    expect(res.headers.Location).toBe('/admin');
    const c = cookieOf(res);
    expect(c).toContain('HttpOnly');
    expect(c).toContain('SameSite=Strict');
    expect(sidOf(c)).toMatch(/^[0-9a-f]{64}$/);
    expect(String(res.headers['Cache-Control'])).toContain('no-store');
    expect(String(res.headers.Vary)).toContain('Cookie');
    expect(await res.text()).toBe('');
  });

  it('Location 与响应头里都不出现主 TOKEN;重复引导会换发新会话(旧会话仍在 8h 窗口内并存)', () => {
    const a = hit('GET', '/admin?token=' + TOKEN);
    const b = hit('GET', '/admin?token=' + TOKEN);
    const sa = sidOf(cookieOf(a.res));
    const sb = sidOf(cookieOf(b.res));
    expect(sa && sb && sa !== sb).toBe(true);
    expect(JSON.stringify(a.res.headers)).not.toContain(TOKEN);
    expect(Object.keys(gateData.adminSessions).length).toBe(2);
  });

  it('已登录(cookie 有效)时带 token 打开仍被洗成无凭据 URL,且不重复签发', async () => {
    const first = hit('GET', '/admin?token=' + TOKEN);
    const sid = sidOf(cookieOf(first.res));
    const again = hit('GET', '/admin?token=' + TOKEN, { cookie: `${ADMIN_COOKIE}=${sid}` });
    expect(again.res.code).toBe(302);
    expect(again.res.headers.Location).toBe('/admin');
    expect(again.res.headers['Set-Cookie']).toBeUndefined(); // 不重发,避免堆积会话
    expect(await again.res.text()).toBe('');
  });

  it('带 cookie 直接打开 /admin → 出后台页 HTML(200,非 401),响应 Vary 含 Cookie', async () => {
    const boot = hit('GET', '/admin?token=' + TOKEN);
    const sid = sidOf(cookieOf(boot.res));
    expect(sid).toMatch(/^[0-9a-f]{64}$/);
    const { res } = hit('GET', '/admin', { cookie: `${ADMIN_COOKIE}=${sid}` });
    await res.settle();
    expect(res.code).toBe(200);
    expect(String(res.headers.Vary)).toContain('Cookie');
    const html = await res.text();
    expect(html).toContain('梦幻画廊');
  });

  it('无 cookie 无 token → 401(fail-closed);错 token 也 401 且不发 cookie', async () => {
    const none = hit('GET', '/admin');
    await none.res.settle();
    expect(none.res.code).toBe(401);
    const bad = hit('GET', '/admin?token=wrong');
    await bad.res.settle();
    expect(bad.res.code).toBe(401);
    expect(bad.res.headers['Set-Cookie']).toBeUndefined();
  });

  it('x-token 头直开 /admin 不重定向(命令行/探针按老用法仍拿 HTML)', async () => {
    const { res } = hit('GET', '/admin', { 'x-token': TOKEN });
    await res.settle();
    expect(res.code).toBe(200);
    expect(res.headers['Set-Cookie']).toBeUndefined();
    expect(await res.text()).toContain('梦幻画廊');
  });

  it('/admin-media:cookie 通道 200,x-token 通道 200,裸请求 401(通道一条都没少)', async () => {
    const sid = issueAdminSession();
    const byCookie = hit('GET', '/admin-media/photos/201.jpg', {
      cookie: `${ADMIN_COOKIE}=${sid}`,
    });
    await byCookie.res.settle();
    expect(byCookie.res.code).toBe(200);
    expect(String(byCookie.res.headers.Vary)).toContain('Cookie');
    const byHeader = hit('GET', '/admin-media/photos/201.jpg', { 'x-token': TOKEN });
    await byHeader.res.settle();
    expect(byHeader.res.code).toBe(200);
    const anon = hit('GET', '/admin-media/photos/201.jpg');
    await anon.res.settle();
    expect(anon.res.code).toBe(401);
  });

  it('TOKEN_QUERY=0 时 /admin-media 的 cookie 请求照过(旧死结:打开 TOKEN_QUERY 必断图)', async () => {
    process.env.TOKEN_QUERY = '0';
    const sid = issueAdminSession();
    const { res } = hit('GET', '/admin-media/photos/201.jpg', {
      cookie: `${ADMIN_COOKIE}=${sid}`,
      host: 'cloudbear.cloud',
    });
    await res.settle();
    expect(res.code).toBe(200);
    const q = hit('GET', '/admin-media/photos/201.jpg?token=' + TOKEN, { host: 'cloudbear.cloud' });
    await q.res.settle();
    expect(q.res.code).toBe(401);
  });
});

describe('revoke-session 响应语义(后台文案据此显示)', () => {
  function bodyReq(body, sid) {
    return {
      method: 'POST',
      headers: {
        'user-agent': UA,
        host: 'localhost:3000',
        'content-type': 'application/json',
        ...(sid ? { cookie: `${ADMIN_COOKIE}=${sid}` } : { 'x-token': TOKEN }),
      },
      url: '/api/admin/decide',
      socket: { remoteAddress: '127.0.0.1' },
      on(ev, cb) {
        if (ev === 'data') cb(JSON.stringify(body));
        else if (ev === 'end') cb();
        return this;
      },
      destroy() {},
    };
  }

  it('吊销返回 revoked_permanently=true;cookie 通道同样可完成吊销', async () => {
    const a = {
      answer: '访客X',
      ua: UA,
      dk: 'dk-x',
      status: 'approved',
      applyTime: Date.now(),
      ips: [],
    };
    gateData.applicants = { vx: a };
    issueSession(a);
    const res = mockRes();
    admin.handleAdminDecide(
      bodyReq({ id: 'vx', action: 'revoke-session' }, issueAdminSession()),
      res,
      {}
    );
    expect(res.code).toBe(200);
    const body = await res.jsonBody();
    expect(body.revoked_permanently).toBe(true);
    expect(getApplicant('vx').sess.authVersion).toBe(-1);
    expect(revokeSession('vx')).toBe(true); // 幂等可继续吊销(版本号再升)
    await saveGateData();
    const onDisk = JSON.parse(fs.readFileSync(process.env.GATE_DATA_FILE, 'utf8'));
    expect(onDisk.applicants.vx.sess.authVersion).toBe(-1);
  });
});
