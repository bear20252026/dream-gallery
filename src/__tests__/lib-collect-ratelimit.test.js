// 入口采集限流(2026-11-11 全面审计 P2-1 回归):
// /api/entry/collect 每次调用全量 saveGateData 落盘,且在封禁豁免清单里——
// 匿名脚本可反复建新档案造成写放大。现钉死:
//   ① 同一 IP 超过 COLLECT_RATE 次/分钟 ⇒ 429,且拒绝路径一次落盘都不发生;
//   ② 换 IP 仍有额度(限流打洪水,不是封人);
//   ③ 自动化流量(探针/CI)不受限,与 isAutomated 短路同口径。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-collect-rl-'));
process.env.GATE_DATA_FILE = path.join(tmpDir, 'gate_data.json');

const require = createRequire(import.meta.url);
const { gateData } = require('../../lib/store.js');
const { handleCollect } = require('../../lib/gate.js');
const { COLLECT_RATE } = require('../../lib/config.js');
const ratelimit = require('../../lib/ratelimit.js');

const UA = 'Mozilla/5.0 (collect-rl-test-ua)'; // 非机器人 UA:不被 isAutomated 短路

function postReq(ip, extraHeaders) {
  const listeners = {};
  return {
    headers: { 'user-agent': UA, ...(extraHeaders || {}) },
    url: '/api/entry/collect',
    socket: { remoteAddress: ip },
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
function collect(ip, extraHeaders) {
  const res = resMock();
  const req = postReq(ip, extraHeaders);
  handleCollect(req, res);
  req.send({ lid: 'lid-' + ip, fp: { scr: '1920x1080', tz: 8 } });
  return res;
}
// saveGateData 第一行写 gateData._savedAt:压成 1 后任何落盘都会顶成当前毫秒
function noWriteMode() {
  gateData._savedAt = 1;
}

let snap;
beforeEach(() => {
  snap = JSON.stringify({ applicants: gateData.applicants });
  ratelimit._reset();
  gateData.applicants = {};
});
afterEach(() => {
  gateData.applicants = JSON.parse(snap).applicants;
});

describe('COLLECT_RATE 常量', () => {
  it('已登记且为正数(口径改动须连文档一起改)', () => {
    expect(COLLECT_RATE).toBe(12);
  });
});

describe('同一 IP 洪水:429 挡在建档与落盘之前', () => {
  it('前 COLLECT_RATE 次正常,第 COLLECT_RATE+1 次 429 且零落盘', () => {
    const ip = '203.0.113.200';
    for (let i = 0; i < COLLECT_RATE; i++) {
      expect(collect(ip).code).toBe(200);
    }
    noWriteMode();
    const before = Object.keys(gateData.applicants).length;
    const over = collect(ip);
    expect(over.code).toBe(429);
    expect(over.body.retryAfter).toBeGreaterThan(0);
    expect(Object.keys(gateData.applicants).length).toBe(before);
    expect(gateData._savedAt, '429 拒绝路径不得落盘').toBe(1);
  });

  it('换 IP 仍有额度:限流按地址打洪水,不是封身份', () => {
    const ip = '203.0.113.201';
    for (let i = 0; i < COLLECT_RATE; i++) collect(ip);
    expect(collect(ip).code).toBe(429);
    expect(collect('203.0.113.202').code).toBe(200);
  });
});

describe('自动化流量不受限(探针/CI 口径不变)', () => {
  it('x-probe:1 的请求超过阈值仍 200', () => {
    const ip = '203.0.113.203';
    for (let i = 0; i < COLLECT_RATE + 5; i++) {
      expect(collect(ip, { 'x-probe': '1' }).code).toBe(200);
    }
  });
});
