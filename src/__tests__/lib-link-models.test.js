// 链接模型白名单(2026-11-11 全面审计 P1-2 回归):
// 访客链接 model 字段此前任意字符串可入库,后台把未知 model 原样拼 innerHTML ⇒ 存储型 XSS。
// 现钉死:① 归一函数只认 10 种合法形状,注入载荷一律回落 sphere;
//        ② /api/mylinks 与 /api/admin/links 入库前归一,落库条目里不可能出现载荷;
//        ③ 枚举单一源与前端两张表(几何/显示名)集合一致,改一处漏两处会被这条抓住。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LINK_MODEL_KEYS, DEFAULT_LINK_MODEL, normalizeLinkModel } from '../shared/link-models.mjs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-linkmodels-'));
process.env.GATE_DATA_FILE = path.join(tmpDir, 'gate_data.json');
process.env.TOKEN = process.env.TOKEN || 'vitest-token-abc';

const require = createRequire(import.meta.url);
const { gateData, deviceKey, issueSession } = require('../../lib/store.js');
const { handleMyLinks, handleAdminLinks } = require('../../lib/siteconfig.js');
const { TOKEN } = require('../../lib/config.js');
const ratelimit = require('../../lib/ratelimit.js');

const UA = 'Mozilla/5.0 (link-models-test-ua)';
const XSS = '<img src=x onerror=alert(1)>';

function postReq(url, opts) {
  const o = opts || {};
  const listeners = {};
  return {
    headers: {
      'user-agent': UA,
      ...(o.vid ? { cookie: 'vid=' + o.vid } : {}),
      ...(o.token ? { 'x-token': o.token } : {}),
    },
    url,
    socket: { remoteAddress: o.ip || '203.0.113.77' },
    on(ev, fn) {
      listeners[ev] = fn;
    },
    destroy() {},
    setHeader() {},
    send(b) {
      if (listeners.data) listeners.data(JSON.stringify(b));
      if (listeners.end) listeners.end();
    },
  };
}
function resMock() {
  const res = {
    code: 0,
    body: null,
    headers: {},
    setHeader(k, v) {
      res.headers[k] = v;
    },
    getHeader(k) {
      return res.headers[k];
    },
    writeHead(c, h) {
      res.code = c;
      if (h) Object.assign(res.headers, h);
    },
    end(b) {
      res.body = b ? JSON.parse(b) : null;
    },
    on() {},
  };
  return res;
}
function callMyLinks(body, opts) {
  const res = resMock();
  const req = postReq('/api/mylinks', opts);
  handleMyLinks(req, res);
  req.send(body);
  return res;
}
function callAdminLinks(body) {
  const res = resMock();
  const req = postReq('/api/admin/links', { token: TOKEN });
  handleAdminLinks(req, res, {});
  req.send(body);
  return res;
}

let snap;
beforeEach(() => {
  snap = JSON.stringify({
    applicants: gateData.applicants,
    userLinks: gateData.userLinks,
    siteConfig: gateData.siteConfig,
  });
  ratelimit._reset();
  gateData.applicants = {};
  gateData.userLinks = [];
  gateData.applicants.vidA = {
    answer: '访客A',
    ua: UA,
    dk: deviceKey({ headers: { 'user-agent': UA } }),
    status: 'approved',
    applyTime: Date.now(),
    lastAccess: Date.now(),
    visits: 0,
    note: '',
    localId: 'lid-A',
    fpSet: {},
    ips: [],
  };
  issueSession(gateData.applicants.vidA);
});
afterEach(() => {
  const s = JSON.parse(snap);
  gateData.applicants = s.applicants;
  gateData.userLinks = s.userLinks;
  gateData.siteConfig = s.siteConfig;
});

describe('normalizeLinkModel 归一(注入载荷绝不原样放行)', () => {
  it('10 种合法形状原样通过', () => {
    expect(LINK_MODEL_KEYS.length).toBe(10);
    for (const k of LINK_MODEL_KEYS) expect(normalizeLinkModel(k)).toBe(k);
  });
  it('XSS 载荷/未知值/空值一律回落默认形状', () => {
    for (const bad of [XSS, '"><script>', 'sphere;', 'SPHERE', '', null, undefined, 123, {}]) {
      expect(normalizeLinkModel(bad)).toBe(DEFAULT_LINK_MODEL);
    }
  });
});

describe('/api/mylinks 入库前归一(存储型 XSS 源头封堵)', () => {
  it('model 带注入载荷:落库值回落 sphere,载荷一个字符都不进库', () => {
    const r = callMyLinks(
      { action: 'add', name: 'x', url: 'https://example.com', model: XSS },
      { vid: 'vidA' }
    );
    expect(r.code).toBe(200);
    expect(r.body.item.model).toBe('sphere');
    expect(JSON.stringify(gateData.userLinks)).not.toContain('onerror');
  });
  it('合法形状不受影响', () => {
    const r = callMyLinks(
      { action: 'add', name: 'x', url: 'https://example.com', model: 'knot' },
      { vid: 'vidA' }
    );
    expect(r.code).toBe(200);
    expect(r.body.item.model).toBe('knot');
  });
});

describe('/api/admin/links 同样归一', () => {
  it('后台自定义链接的 model 注入载荷也被回落', () => {
    const r = callAdminLinks({ action: 'add', name: 'x', url: 'https://example.com', model: XSS });
    expect(r.code).toBe(200);
    expect(r.body.item.model).toBe('sphere');
  });
});

describe('枚举单一源与前端两张表集合一致', () => {
  it('src/gallery/mode.js 几何表与 src/admin/admin-content.js 显示名表都恰好覆盖 LINK_MODEL_KEYS', () => {
    const root = path.join(__dirname, '..', '..');
    const modeSrc = fs.readFileSync(path.join(root, 'src/gallery/mode.js'), 'utf8');
    const adminSrc = fs.readFileSync(path.join(root, 'src/admin/admin-content.js'), 'utf8');
    for (const k of LINK_MODEL_KEYS) {
      expect(modeSrc, 'mode.js 缺形状 ' + k).toMatch(new RegExp('\\b' + k + ':\\s*\\{'));
      expect(adminSrc, 'admin-content.js 缺形状 ' + k).toMatch(new RegExp('\\b' + k + ":\\s*'"));
    }
  });
});
