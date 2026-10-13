// lib-geoip.test.js — 访客归属地改走 Cloudflare 国家码之后的不变量(2026-10-14 第五轮审计 F)
// 钉住四件事:
//   ① **绝不出网**:本模块与 lib/admin.js 都不再有任何 fetch / ip-api 调用;
//   ② 头只在**可信代理来源**才采信(公网直连伪造 cf-ipcountry 必须无效);
//   ③ 拿不到国家码时**不留占位**(旧版用「未知」把失败永久钉死,是这次读数为空的根因);
//   ④ 失败原因分开计数,规模有上限。
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-geoip-'));
process.env.GATE_DATA_FILE = path.join(tmp, 'gate_data.json');
process.env.USE_SQLITE = '0';
process.env.RETENTION_DISABLED = '1';
process.env.TOKEN = 'geoip-t0ken';

const require = createRequire(import.meta.url);
const { gateData, saveGateData } = require('../../lib/store.js');
const geoip = require('../../lib/geoip.js');
const admin = require('../../lib/admin.js');
const ROOT = path.resolve(__dirname, '..', '..');

const CF_SOCK = '104.16.0.7'; // Cloudflare 公布段内 ⇒ 代理头可信
const OPEN_SOCK = '203.0.113.9'; // 公网直连 ⇒ 头一律不可信

function req(opts) {
  const o = opts || {};
  const sock = o.sock || CF_SOCK;
  return {
    method: 'GET',
    url: '/',
    headers: {
      'user-agent': 'Mozilla/5.0 (geoip-test)',
      host: 'cloudbear.cloud',
      // 经 CF 回源时才有 cf-connecting-ip(realIP 的既有序列:不可信来源一律不读代理头)
      ...(sock === CF_SOCK ? { 'cf-connecting-ip': o.visitor || '198.51.100.24' } : {}),
      ...(o.country ? { 'cf-ipcountry': o.country } : {}),
    },
    socket: { remoteAddress: sock },
  };
}

let fetchCalls = 0;
const realFetch = global.fetch;
beforeAll(() => {
  global.fetch = (...a) => {
    fetchCalls++;
    return realFetch(...a);
  };
});
afterAll(() => {
  global.fetch = realFetch;
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* 临时目录清不掉不影响结论 */
  }
});

describe('lib/geoip.js — 国家码读数', () => {
  it('①可信代理 + 有效国家码 ⇒ 写中文标签,且全程零 fetch', () => {
    const before = fetchCalls;
    expect(geoip.note(req({ country: 'CN', visitor: '198.51.100.24' }))).toBe('header');
    expect(geoip.labelOf('198.51.100.24')).toContain('中国');
    expect(fetchCalls).toBe(before);
  });

  it('②公网直连伪造 cf-ipcountry ⇒ 一律不采信、不写表', () => {
    expect(geoip.note(req({ sock: OPEN_SOCK, country: 'US' }))).toBe('no-proxy');
    expect(geoip.labelOf(OPEN_SOCK)).toBe('');
    expect(gateData.geo && gateData.geo[OPEN_SOCK]).toBeUndefined();
  });

  it('③拿不到国家码时不留占位:同一个人下次从 CF 进来还能补上', () => {
    const ip = '203.0.113.55';
    const r = req({ visitor: ip, sock: CF_SOCK });
    expect(geoip.note(r)).toBe('no-header');
    expect(gateData.geo[ip]).toBeUndefined(); // 旧版在这里写 null/「未知」→ 之后永远不再尝试
    expect(geoip.note(req({ visitor: ip, country: 'jp' }))).toBe('header'); // 小写也认
    expect(geoip.labelOf(ip)).toContain('日本');
  });

  it('XX / T1 / 畸形码不当成归属地', () => {
    for (const c of ['XX', 'T1', 'CHN', '12', '']) {
      expect(geoip.note(req({ visitor: '198.51.100.' + (c.length * 7 + 3), country: c }))).toBe(
        'no-header'
      );
    }
  });

  it('本机/回环来源不写表(否则测试地址会冒充真访客)', () => {
    expect(
      geoip.note({ headers: { 'cf-ipcountry': 'CN' }, socket: { remoteAddress: '127.0.0.1' } })
    ).toBe('local');
    expect(geoip.note({ headers: {}, socket: {} })).toBe('local');
  });

  it('④规模有上限,超了淘汰最旧(与旧实现同一数量级)', () => {
    for (let i = 0; i < geoip.GEO_MAX + 5; i++)
      geoip.note(req({ country: 'CN', visitor: '192.0.2.' + (i % 200) + 'x' + i }));
    expect(Object.keys(gateData.geo).length).toBeLessThanOrEqual(geoip.GEO_MAX);
  });

  it('值没变时不重复落盘(全量快照写盘很贵)', () => {
    const ip = '198.51.100.99';
    expect(geoip.note(req({ visitor: ip, country: 'DE' }))).toBe('header');
    let writes = 0;
    const real = fs.writeFileSync;
    fs.writeFileSync = (...a) => {
      writes++;
      return real(...a);
    };
    try {
      geoip.note(req({ visitor: ip, country: 'DE' }));
    } finally {
      fs.writeFileSync = real;
    }
    expect(writes).toBe(0);
    expect(geoip.labelOf(ip)).toContain('德国');
  });

  it('失败原因分开计数(旧版只有一个「未知」,查一次为什么空要翻代码)', () => {
    const s = geoip.geoStats();
    for (const k of ['header', 'noHeader', 'noProxy', 'local']) expect(typeof s[k]).toBe('number');
    expect(s.outbound).toBe(false);
    expect(s.source).toBe('cloudflare-cf-ipcountry');
  });
});

describe('回归钉子:ip-api 这条链路必须真的消失', () => {
  it('admin.js 里一个 fetch 都没有;写 gateData.geo 条目的地方只有 lib/geoip.js', () => {
    const adminSrc = fs.readFileSync(path.join(ROOT, 'lib/admin.js'), 'utf8');
    expect(adminSrc).not.toMatch(/[\s(.,]fetch\s*\(/); // 注释里提 ip-api 是历史说明,判「有没有外呼」要看作真调用
    const writers = [];
    for (const f of fs.readdirSync(path.join(ROOT, 'lib'))) {
      if (!f.endsWith('.js')) continue;
      const t = fs.readFileSync(path.join(ROOT, 'lib', f), 'utf8');
      if (/\.geo\s*\[[^\]]+\]\s*=/.test(t)) writers.push(f);
    }
    expect(writers).toEqual(['geoip.js']); // 占位/失败写入回到别处 = 又养出一个永久「未知」
    expect(typeof admin.geoLabel).toBe('function');
    expect(admin.geoLookup).toBeUndefined(); // 旧的外呼入口已摘掉,不留同名不同义的兼容壳
  });

  it('后台列表接口是只读的:列一次访客不会触发任何外呼也不会改 geo 表', () => {
    const AIP = '198.51.100.24';
    gateData.applicants = {
      v1: { answer: '访客', status: 'approved', ip: AIP, applyTime: 1, ua: 'x', dk: 'd' },
    };
    // 上面那条容量用例会把最旧条目淘汰掉(正是它该做的事),这里自己把读数补回来再断言
    geoip.note(req({ visitor: AIP, country: 'CN' }));
    saveGateData();
    const before = fetchCalls;
    const snapshot = JSON.stringify(gateData.geo || {});
    const res = {
      headers: {},
      setHeader(k, v) {
        this.headers[k] = v;
      },
      writeHead(c) {
        this.code = c;
      },
      end(b) {
        this.body = b;
      },
    };
    admin.handleAdminList(
      {
        method: 'GET',
        url: '/api/admin/list',
        headers: { 'x-token': 'geoip-t0ken', host: 'cloudbear.cloud' },
        socket: { remoteAddress: '127.0.0.1' },
      },
      res,
      {}
    );
    expect(res.code).toBe(200);
    expect(fetchCalls).toBe(before);
    expect(JSON.stringify(gateData.geo || {})).toBe(snapshot);
    const body = JSON.parse(res.body);
    expect(body.geo.source).toBe('cloudflare-cf-ipcountry'); // 读数与失败原因随载荷一起给出
    expect(body.applicants[0].geo).toContain('中国');
  });
});
