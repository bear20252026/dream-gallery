// lib-local-request.test.js — 「仅本地」判定与 CORS 单一裁决的契约(2026-10-11 DG-AUTH-001 / DG-CORS-001/002 / OPS-004)
// 钉住四件事:
//  ① 本地=TCP 来源地址,Host 头**永远不能换来**本地特权(伪造 Host: localhost 的公网请求必须非本地并 401);
//  ② 经 Cloudflare 回源(socket 是 CF 公网段)一律非本地;
//  ③ CORS 预检与真响应共用 corsOriginFor,allowlist 命中才回显该 Origin(逗号串不再被当单值回显);
//  ④ 根级 `*.bak-<时间戳>`/`*.tmp`/`*~` 这类不以任何已知后缀结尾的文件一律 404。
import { describe, it, expect, beforeAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';

// 必须在动态 import lib 模块之前设置:TOKEN 留空才走「未配置 ⇒ 仅本地」那一档
process.env.TOKEN = '';
process.env.NODE_ENV = '';
process.env.CORS_ORIGIN = 'https://a.test,https://b.test';
process.env.MULTI = 'off';
process.env.PORT = '0';
process.env.USE_SQLITE = '0';
process.env.GATE_DATA_FILE = path.join(os.tmpdir(), 'gallery-local-request-gate.json');

let security, routes, config;
beforeAll(async () => {
  security = await import('../../lib/security.js');
  routes = await import('../../lib/routes.js');
  config = await import('../../lib/config.js');
});

const mkReq = (remoteAddress, headers) => ({
  socket: remoteAddress ? { remoteAddress } : undefined,
  headers: headers || {},
});

describe('isLocalRequest:本地只认 socket 来源', () => {
  it('伪造 Host: localhost 但来源是公网 → 非本地', () => {
    expect(security.isLocalRequest(mkReq('203.0.113.9', { host: 'localhost:3000' }))).toBe(false);
    expect(security.isLocalRequest(mkReq('8.8.8.8', { host: 'localhost' }))).toBe(false);
  });

  it('回环来源 + localhost Host → 本地', () => {
    for (const addr of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '127.0.0.2']) {
      expect(security.isLocalRequest(mkReq(addr, { host: 'localhost:3000' })), addr).toBe(true);
    }
    expect(security.isLocalRequest(mkReq('127.0.0.1', { host: '127.0.0.1:3210' }))).toBe(true);
  });

  it('经 Cloudflare 回源(socket 是 CF 公网段) → 非本地', () => {
    expect(security.isLocalRequest(mkReq('172.64.0.1', { host: 'cloudbear.cloud' }))).toBe(false);
    expect(security.isLocalRequest(mkReq('104.16.1.2', { host: 'cloudbear.cloud' }))).toBe(false);
    expect(security.isLocalRequest(mkReq('108.162.192.1', { host: 'cloudbear.cloud' }))).toBe(
      false
    );
  });

  it('回环来源但 Host 是公网域名(本机反代/CF Tunnel 回源) → 非本地(Host 只做否决,不做放行)', () => {
    expect(security.isLocalRequest(mkReq('::1', { host: 'cloudbear.cloud' }))).toBe(false);
    expect(security.isLocalRequest(mkReq('127.0.0.1', { host: 'evil.test' }))).toBe(false);
  });

  it('拿不到来源地址(Unix socket / socket 已销毁) → 非本地(fail-closed)', () => {
    expect(security.isLocalRequest({ headers: { host: 'localhost' } })).toBe(false);
    expect(security.isLocalRequest({ socket: {}, headers: {} })).toBe(false);
    expect(security.isLocalRequest(undefined)).toBe(false);
  });

  it('routes 的 auth:write 档:公网伪造 Host 一律 401(不再被 Host 放行)', () => {
    const mk = (remoteAddress) => {
      const res = {
        headers: {},
        setHeader(k, v) {
          this.headers[k] = v;
        },
        writeHead(c, h) {
          this.code = c;
          Object.assign(this.headers, h || {});
        },
        end(b) {
          this.body = b;
        },
        getHeader(k) {
          return this.headers[k];
        },
        on() {},
      };
      const handled = routes.dispatch(
        {
          method: 'DELETE',
          url: '/api/files/photos/x.jpg',
          headers: { host: 'localhost:3000' },
          socket: { remoteAddress },
        },
        res,
        '/api/files/photos/x.jpg',
        {}
      );
      return { handled, res };
    };
    const pub = mk('203.0.113.5');
    expect(pub.handled).toBe(true);
    expect(pub.res.code).toBe(401);
    expect(JSON.parse(pub.res.body).error).toContain('仅限本地');
  });
});

describe('corsOriginFor:CORS 单一裁决处', () => {
  it('allowlist 命中 → 回显该 Origin(单值),不是整条逗号串', () => {
    const pub = mkReq('203.0.113.5', { origin: 'https://b.test' });
    expect(security.corsOriginFor(pub)).toEqual({ origin: 'https://b.test', vary: true });
    const c = config.CORS_ORIGIN.split(',');
    expect(c.length).toBe(2); // 模板串确实是多域
    expect(security.corsOriginFor(pub).origin).not.toBe(c.join(','));
  });

  it('不在 allowlist / 不带 Origin → 不设该头', () => {
    expect(security.corsOriginFor(mkReq('203.0.113.5', { origin: 'https://evil.test' }))).toBe(
      null
    );
    expect(security.corsOriginFor(mkReq('203.0.113.5', {}))).toBe(null);
  });

  it('本地连接放行 *', () => {
    expect(
      security.corsOriginFor(
        mkReq('127.0.0.1', { host: 'localhost:3000', origin: 'http://localhost:5173' })
      )
    ).toEqual({ origin: '*', vary: false });
  });

  it('applySecurityHeaders 写 ACAO + Vary: Origin', () => {
    const set = {};
    const res = {
      setHeader(k, v) {
        set[k] = v;
      },
    };
    security.applySecurityHeaders(mkReq('203.0.113.5', { origin: 'https://a.test' }), res);
    expect(set['Access-Control-Allow-Origin']).toBe('https://a.test');
    expect(set['Vary']).toBe('Origin');
    const set2 = {};
    security.applySecurityHeaders(mkReq('203.0.113.5', { origin: 'https://evil.test' }), {
      setHeader(k, v) {
        set2[k] = v;
      },
    });
    expect(set2['Access-Control-Allow-Origin']).toBe(undefined);
  });
});

describe('staticDenied:根级兜底白名单(OPS-004)', () => {
  const pub = mkReq('203.0.113.5', { host: 'cloudbear.cloud' });
  const local = mkReq('127.0.0.1', { host: 'localhost:3000' });

  it('备份/临时/编辑器残留一律拒绝(不靠结尾锚)', () => {
    for (const rel of [
      'server.js.bak-20261010-1',
      'server.js.bak-20261010-123456',
      'gate_data.json.bak-x',
      'index.html.tmp',
      'server.js~',
      'lib/gate.js.bak-1',
      'routes.js.20261010',
    ])
      expect(staticDeniedFor(rel, pub), rel).toBe(true);
  });

  it('公开入口与根级资产照旧放行', () => {
    for (const rel of [
      'index.html',
      'data.js',
      'sw.js',
      'manifest.json',
      'guide.html',
      'room.html',
      'icons/x.png',
    ]) {
      expect(staticDeniedFor(rel, pub), rel).toBe(false);
    }
    expect(staticDeniedFor('index.html', local)).toBe(false);
  });

  it('目录黑名单与 src/vendor 本地口径照旧', () => {
    expect(staticDeniedFor('lib/x.js', pub)).toBe(true);
    expect(staticDeniedFor('lib/x.js', local)).toBe(true);
    expect(staticDeniedFor('scripts/probe/y.cjs', pub)).toBe(true);
    expect(staticDeniedFor('src/main.js', pub)).toBe(true);
    expect(staticDeniedFor('src/main.js', local)).toBe(false);
    expect(staticDeniedFor('.env', pub)).toBe(true);
    expect(staticDeniedFor('package.json', pub)).toBe(true);
    expect(staticDeniedFor('admin.html', pub)).toBe(true);
    expect(staticDeniedFor('eslint.config.mjs', pub)).toBe(true);
  });

  function staticDeniedFor(rel, request) {
    return security.staticDenied(rel, request);
  }
});
