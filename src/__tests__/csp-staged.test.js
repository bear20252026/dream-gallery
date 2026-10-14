// csp-staged.test.js — 分阶段 CSP 的头部分支(第五轮审计 H,2026-10-14)
// 钉住五件事:
//  ① 不在登记表里的页面:只有原来那条 CSP,'unsafe-inline' 一字不动(不顺手收紧别人);
//  ② 登记表里的页面:原 CSP 照旧发,另外多一条 **Report-Only**,且它的 script-src **没有** 'unsafe-inline';
//  ③ 只认精确路径:query 要剥掉,但 /hill/ 之下多一段路径不算命中(登记表是按页量出来的);
//  ④ CSP_STRICT_MODE=enforce 时换成真策略:同名头被严格版**覆盖**,且不再重复发 Report-Only;
//  ⑤ 开发档 CSP_UNSAFE_EVAL=1 时严格版也照样摘掉 unsafe-inline(它摘的是内联授权,与 eval 无关)。
import { describe, it, expect, beforeAll } from 'vitest';

// 与 src/__tests__/lib-local-request.test.js 同款:lib 是 CJS,走动态 import 拿命名导出
let security;
beforeAll(async () => {
  security = await import('../../lib/security.js');
});

const mkRes = () => ({
  h: {},
  setHeader(k, v) {
    this.h[k] = v;
  },
  getHeader(k) {
    return this.h[k];
  },
});
const mkReq = (url) => ({ url, socket: { remoteAddress: '203.0.113.9' }, headers: {} });

const scriptSrcOf = (policy) => (policy.match(/script-src[^;]*/) || [''])[0];

describe('分阶段 CSP:按页摘 unsafe-inline', () => {
  const savedStrict = process.env.CSP_STRICT_MODE;
  const savedEval = process.env.CSP_UNSAFE_EVAL;
  const restore = () => {
    if (savedStrict === undefined) delete process.env.CSP_STRICT_MODE;
    else process.env.CSP_STRICT_MODE = savedStrict;
    if (savedEval === undefined) delete process.env.CSP_UNSAFE_EVAL;
    else process.env.CSP_UNSAFE_EVAL = savedEval;
  };

  it('① 未登记的页面完全不受影响', () => {
    delete process.env.CSP_STRICT_MODE;
    const res = mkRes();
    security.applySecurityHeaders(mkReq('/index.html'), res);
    expect(res.h['Content-Security-Policy']).toContain("'unsafe-inline'");
    expect(res.h['Content-Security-Policy-Report-Only']).toBeUndefined();
    restore();
  });

  it('② 登记表页面:原策略照发,严格版走 Report-Only', () => {
    delete process.env.CSP_STRICT_MODE;
    for (const url of ['/hill/', '/lobby.html', '/room.html']) {
      const res = mkRes();
      security.applySecurityHeaders(mkReq(url), res);
      expect(res.h['Content-Security-Policy'], url).toContain("'unsafe-inline'");
      const ro = res.h['Content-Security-Policy-Report-Only'];
      expect(ro, url + ' 应有 Report-Only').toBeTruthy();
      expect(scriptSrcOf(ro), url + ' 的 script-src 不该再有 unsafe-inline').not.toContain(
        "'unsafe-inline'"
      );
      expect(scriptSrcOf(ro)).toContain("'self'");
      // 除了 script-src,其余指令必须与全站那条逐字一致(收紧一处不能顺带改别的)
      const baseOthers = res.h['Content-Security-Policy']
        .split(';')
        .filter((s) => !s.trim().startsWith('script-src'))
        .sort()
        .join('|');
      const roOthers = ro
        .split(';')
        .filter((s) => !s.trim().startsWith('script-src'))
        .sort()
        .join('|');
      expect(roOthers, url + ' 非 script-src 指令被顺带改了').toBe(baseOthers);
    }
    restore();
  });

  it('③ 只认精确路径:带 query 命中,多一段路径不命中', () => {
    const withQuery = mkRes();
    security.applySecurityHeaders(mkReq('/hill/?v=3'), withQuery);
    expect(withQuery.h['Content-Security-Policy-Report-Only']).toBeTruthy();

    for (const url of ['/hill/deep/nested', '/lobby.htmlx', '/HILL/', '/hill', '/room.html/../x']) {
      const res = mkRes();
      security.applySecurityHeaders(mkReq(url), res);
      if (url === '/hill')
        expect(res.h['Content-Security-Policy-Report-Only'], url + ' 在登记表里').toBeTruthy();
      else expect(res.h['Content-Security-Policy-Report-Only'], url + ' 不该命中').toBeUndefined();
    }
    restore();
  });

  it('④ enforce 档:同名头被严格版覆盖,不再发 Report-Only', () => {
    process.env.CSP_STRICT_MODE = 'enforce';
    const res = mkRes();
    security.applySecurityHeaders(mkReq('/room.html'), res);
    expect(scriptSrcOf(res.h['Content-Security-Policy'])).not.toContain("'unsafe-inline'");
    expect(res.h['Content-Security-Policy-Report-Only']).toBeUndefined();

    const other = mkRes();
    security.applySecurityHeaders(mkReq('/index.html'), other);
    expect(other.h['Content-Security-Policy']).toContain("'unsafe-inline'"); // 别的页面不受这个开关影响
    delete process.env.CSP_STRICT_MODE;
    restore();
  });

  it('⑤ 开发档(unsafe-eval)下严格版仍然摘掉 unsafe-inline', () => {
    delete process.env.CSP_STRICT_MODE;
    process.env.CSP_UNSAFE_EVAL = '1';
    const res = mkRes();
    security.applySecurityHeaders(mkReq('/hill/'), res);
    expect(res.h['Content-Security-Policy']).toContain("'unsafe-eval'");
    const ro = res.h['Content-Security-Policy-Report-Only'];
    expect(scriptSrcOf(ro)).not.toContain("'unsafe-inline'");
    expect(scriptSrcOf(ro)).toContain("'unsafe-eval'"); // 这一档该留的还留着
    delete process.env.CSP_UNSAFE_EVAL;
    restore();
  });

  it('登记表非空(空登记表 = 机制是空的,不许悄悄留着)', () => {
    expect(Array.isArray(security.CSP_INLINE_FREE_PAGES)).toBe(true);
    expect(security.CSP_INLINE_FREE_PAGES.length).toBeGreaterThan(0);
    for (const e of security.CSP_INLINE_FREE_PAGES)
      expect(e.path.startsWith('/'), e.path).toBe(true);
  });
});
