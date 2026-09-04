// lib/routes.js 契约测试(2026-09-02 路由拆分配套)
// 目的:①结构契约 —— 每条路由必须有 method/match/auth/fn,auth 必须是白名单枚举;
//      ②安全契约 —— 所有 /api/admin/* 与写操作(auth=token/write)不允许标注为 public;
//      ③行为抽测 —— dispatch 对 token/write 路由的 401、upload guard 分流、未命中回落。
import { describe, it, expect, beforeAll } from 'vitest';

// 必须在动态 import lib 模块之前设置(ESM import 提升规避,同 store.test.js 模式)
process.env.TOKEN = 'vitest-token-abc';
process.env.MULTI = 'off';
process.env.PORT = '0';

const { ROUTES, dispatch } = await import('../../lib/routes.js');
const { TOKEN } = await import('../../lib/config.js');

function mockRes() {
  const res = {
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    writeHead(code, h) {
      this.code = code;
      Object.assign(this.headers, h || {});
    },
    end(b) {
      this.body = b;
      this.ended = true;
    },
    on() {}, // SSE 等场景占位
  };
  return res;
}

describe('路由表结构契约', () => {
  it('每条路由具备 method/match/auth/fn', () => {
    for (const r of ROUTES) {
      expect(r.method, JSON.stringify(r)).toMatch(/^(GET|POST|DELETE)$/);
      expect(r.match, JSON.stringify(r)).toBeTruthy();
      expect(r.fn, JSON.stringify(r)).toBeTypeOf('function');
    }
  });

  it('auth 只允许 public/token/write 枚举', () => {
    const OK = ['public', 'token', 'write'];
    for (const r of ROUTES) expect(OK, JSON.stringify(r.match)).toContain(r.auth);
  });

  it('安全契约:/api/admin/* 一律不允许 public', () => {
    const offenders = ROUTES.filter(
      (r) =>
        (typeof r.match === 'string' ? r.match : String(r.match)).includes('/api/admin/') &&
        r.auth === 'public'
    );
    expect(offenders).toEqual([]);
  });

  it('安全契约:POST 无 guard 的 public 端点必须命中访客白名单前缀(防新增端点裸公开)', () => {
    // 刻意公开的访客接口前缀(与拆分前 server.js 行为一致)
    const PUBLIC_POST = [
      '/api/entry/',
      '/api/chat',
      '/api/wish',
      '/api/quiz/',
      '/api/track/',
      '/api/vision/',
      '/api/mylinks',
      '/api/client-errors',
      '/api/upload',
    ];
    const offenders = ROUTES.filter((r) => {
      if (r.method !== 'POST' || r.auth !== 'public') return false;
      const m = typeof r.match === 'string' ? r.match : String(r.match);
      return !PUBLIC_POST.some((p) => m.startsWith(p));
    });
    expect(offenders).toEqual([]);
  });

  it('端点总数快照:增删路由必须显式更新本测试(防静默丢失)', () => {
    // 2026-09-05: +4 一念墙(POST/GET wish(es) 公开×2 + admin 拉取/删除 token×2)
    expect(ROUTES.length).toBe(52);
  });
});

describe('dispatch 鉴权行为', () => {
  beforeAll(() => {
    expect(TOKEN).toBe('vitest-token-abc');
  });

  function hit(method, url, headers) {
    const u = new URL(url, 'http://x');
    const req = { method, headers: headers || {}, url };
    const res = mockRes();
    const handled = dispatch(
      req,
      res,
      decodeURIComponent(u.pathname),
      Object.fromEntries(u.searchParams)
    );
    return { handled, res };
  }

  it('token 路由:无 token → 401(fail-closed,即使 TOKEN 未配置也拒)', () => {
    const { handled, res } = hit('GET', '/api/admin/list');
    expect(handled).toBe(true);
    expect(res.code).toBe(401);
  });

  it('token 路由:错误 token → 401', () => {
    const { res } = hit('GET', '/api/admin/list?token=wrong');
    expect(res.code).toBe(401);
  });

  it('token 路由:正确 token(query)→ 放行(处理器接管)', () => {
    const { res } = hit('GET', '/api/admin/list?token=vitest-token-abc');
    expect(res.code).not.toBe(401);
  });

  it('token 路由:正确 token(x-token 头)→ 放行', () => {
    const { res } = hit('GET', '/api/admin/list', { 'x-token': 'vitest-token-abc' });
    expect(res.code).not.toBe(401);
  });

  it('write 路由:TOKEN 已配置时无 token → 401(删除接口)', () => {
    const { handled, res } = hit('DELETE', '/api/files/photos/x.jpg');
    expect(handled).toBe(true);
    expect(res.code).toBe(401);
  });

  it('public 路由:无 token 也放行', () => {
    const { res } = hit('GET', '/api/siteconfig');
    expect(res.code).not.toBe(401);
  });

  it('upload guard 分流:evil.html 不命中 guard → 落 write 兜底 → 401', () => {
    const { res } = hit('POST', '/api/upload?name=evil.html');
    expect(res.code).toBe(401);
  });

  it('未命中任何路由 → handled=false(回落静态服务)', () => {
    const { handled } = hit('GET', '/some-static-page.html');
    expect(handled).toBe(false);
  });
});
