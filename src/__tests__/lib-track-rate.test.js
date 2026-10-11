// lib-track-rate.test.js — 埋点限流与批量落库的契约(2026-10-11 DG-DOS-001)
// 钉住三件事:
//  ① 洪水打 /api/track/click 不再「每条一次整库写盘」:60 条连发只产生个位数的 saveGateData;
//  ② 超限仍回 200 {ok:true,throttled:true}(埋点不对浏览器报错,也不引发前端重试风暴);
//  ③ linkClicks 的 5000 上限行为保持;flushTrack() 是唯一的批量出口(SIGTERM 时由 server.js 调)。
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

process.env.TOKEN = 'vitest-token-abc';
process.env.MULTI = 'off';
process.env.PORT = '0';
process.env.USE_SQLITE = '0'; // 纯 JSON 镜像,避免测试碰 SQLite
const tmpGate = path.join(os.tmpdir(), 'gallery-track-rate-gate.json');
process.env.GATE_DATA_FILE = tmpGate;
try {
  fs.unlinkSync(tmpGate);
} catch {}

const nodeRequire = createRequire(import.meta.url);
let store, track, ratelimit;
let saveCalls = 0;
let realSave;

beforeAll(() => {
  store = nodeRequire('../../lib/store.js');
  ratelimit = nodeRequire('../../lib/ratelimit.js');
  track = nodeRequire('../../lib/track.js');
  // 计数 spy:track.js 通过 store 命名空间调 saveGateData,替换导出生效
  realSave = store.saveGateData;
  store.saveGateData = function counted(...a) {
    saveCalls++;
    return realSave.apply(store, a);
  };
});

afterAll(() => {
  try {
    track.flushTrack();
  } catch {}
  if (store) store.saveGateData = realSave;
  try {
    fs.unlinkSync(tmpGate);
  } catch {}
});

// 造假请求:readBody 只用到 on('data'/'end'),公网直连 socket 让 realIP 不走代理头
function mkReq(ip, payload) {
  const handlers = {};
  return {
    socket: { remoteAddress: ip },
    headers: { 'user-agent': 'vitest-track-agent', 'content-type': 'application/json' },
    on(ev, cb) {
      (handlers[ev] = handlers[ev] || []).push(cb);
    },
    destroy() {},
    emit(ev, arg) {
      (handlers[ev] || []).forEach((f) => f(arg));
    },
    fire() {
      this.emit('data', Buffer.from(JSON.stringify(payload)));
      this.emit('end');
    },
  };
}

// 一次完整投递:handleTrackClick 先挂 data/end 监听,再由 fire() 触发
function post(ip, payload) {
  const r = mkReq(ip, payload);
  const res = mkRes();
  track.handleTrackClick(r, res);
  r.fire();
  return res;
}

function mkRes() {
  return {
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
}

describe('track/click 限流 + 攒批落库', () => {
  beforeEach(() => {
    ratelimit._reset();
    track.flushTrack(); // 清掉上一用例的在途批次
    store.gateData.linkClicks.length = 0;
    saveCalls = 0;
  });

  it('60 次连发:全部 200,整库写盘从 60 次塌缩到个位数', () => {
    const ip = '203.0.113.60';
    const codes = [];
    for (let i = 0; i < 60; i++) codes.push(post(ip, { link: 'L' + i }).code);
    expect(codes.every((c) => c === 200)).toBe(true);
    expect(store.gateData.linkClicks.length).toBe(60);
    // 每攒够 20 条落一次库 ⇒ 60 条只 3 次整库写(整改前每条一次 = 60 次)
    expect(saveCalls).toBeGreaterThan(0);
    expect(saveCalls).toBeLessThanOrEqual(4);
    expect(track.flushTrack()).toBe(0); // 满批即落,无尾批
    // 同窗口再打:超限仍 200 且 {throttled:true},不再入库、不再写盘
    const before = saveCalls;
    for (let i = 0; i < 15; i++) {
      const res = post(ip, { link: 'T' + i });
      expect(res.code).toBe(200);
      expect(res.body).toContain('throttled');
    }
    expect(saveCalls).toBe(before);
    expect(store.gateData.linkClicks.length).toBe(60);
  });

  it('超限不报错:回 200 {ok:true,throttled:true} 且不再入库', () => {
    const ip = '203.0.113.61';
    let throttled = 0;
    const codes = [];
    for (let i = 0; i < 90; i++) {
      const res = post(ip, { link: 'X' + i });
      codes.push(res.code);
      if (/throttled/.test(res.body || '')) throttled++;
    }
    expect(codes.every((c) => c === 200)).toBe(true);
    expect(throttled).toBeGreaterThan(0);
    expect(store.gateData.linkClicks.length + track.flushTrack()).toBeLessThanOrEqual(60);
  });

  it('不同 IP 各自计数,互不牵连', () => {
    for (let i = 0; i < 61; i++) post('203.0.113.62', { link: 'a' });
    const res = post('203.0.113.63', { link: 'b' });
    expect(res.code).toBe(200);
    expect(/throttled/.test(res.body || '')).toBe(false);
  });

  it('不足一批先留在内存,flushTrack 才落库(埋点专用豁免:窗口 2s/20 条)', () => {
    const ip = '203.0.113.64';
    for (let i = 0; i < 5; i++) post(ip, { link: 'p' + i });
    expect(store.gateData.linkClicks.length).toBe(0); // 还没落库
    expect(saveCalls).toBe(0);
    expect(track.flushTrack()).toBe(5);
    expect(store.gateData.linkClicks.length).toBe(5);
    expect(saveCalls).toBe(1);
    expect(track.flushTrack()).toBe(0); // 空批不再写盘
    expect(saveCalls).toBe(1);
  });

  it('5000 条上限行为保持(超限截断最旧)', () => {
    const arr = store.gateData.linkClicks;
    arr.length = 0;
    for (let i = 0; i < 4995; i++) arr.push({ t: i, link: 'old' + i });
    const ip = '203.0.113.65';
    for (let i = 0; i < 20; i++) post(ip, { link: 'new' + i });
    track.flushTrack();
    expect(arr.length).toBe(5000);
    expect(arr[0].link).toBe('old15'); // 最旧的 15 条被挤出(5015→5000)
    expect(arr[arr.length - 1].link).toBe('new19');
  });
});
