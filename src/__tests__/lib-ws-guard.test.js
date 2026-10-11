// lib-ws-guard.test.js — WebSocket 不再是「绕过 HTTP 门禁的另一扇门」(2026-10-11 DG-RT-001)
// Node 对 Upgrade 请求不 emit request ⇒ server.js 的 handler(entryGate/staticDenied/安全头)对 /ws
// 完全不执行。这里用真实 ws 客户端连本地临时服务器,钉住新加的 upgrade 期守卫与三条资源闸:
//  ① Origin 必须是本站;② 访客身份(vid 档案存在、会话有效、非被踢状态);③ 拉黑 IP 一律拒握手;
//  ④ maxPayload(ws@8 默认 100MB)收到 16KB;⑤ move 洪水被每连接令牌桶限住;⑥ 单 IP 并发上限。
// ⚠️ 项目已知坑:测试里起的服务器/定时器会泄漏导致下次 EADDRINUSE —— 每个连接都 await 关闭,
//    afterAll 里 wss.close()(心跳 interval 在它的 'close' 里清)+ server.close() 一个都不能少。
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

process.env.TOKEN = 'vitest-token-abc';
process.env.PORT = '0';
process.env.MULTI = 'off';
process.env.USE_SQLITE = '0';
const tmpGate = path.join(os.tmpdir(), 'gallery-ws-guard-gate.json');
process.env.GATE_DATA_FILE = tmpGate;
try {
  fs.unlinkSync(tmpGate);
} catch {}

const nodeRequire = createRequire(import.meta.url);
const { WebSocket } = nodeRequire('ws');
const store = nodeRequire('../../lib/store.js');
const attachMultiplayer = nodeRequire('../../lib/multiplayer.js');

let server = null;
let wss = null;
let port = 0;
const openSockets = [];

function addApplicant(id, status) {
  const now = Date.now();
  store.gateData.applicants[id] = {
    id,
    status: status || 'approved',
    applyTime: now,
    lastAccess: now,
    answer: '访客',
    sess: {
      issuedAt: now,
      lastSeen: now,
      expiresAt: now + 3600000,
      revoked: false,
      authVersion: 0,
    },
  };
}

// 每个用例自带一个「访客 IP」:socket 是 127.0.0.1(可信回环)⇒ store.realIP 采用 cf-connecting-ip,
// 于是单 IP 并发上限/拉黑判定都按这个伪造头分桶,用例之间不互相挤占连接配额。
function headersFor(over = {}) {
  const h = {
    origin: 'http://127.0.0.1:' + port,
    cookie: 'vid=vid-good',
    'cf-connecting-ip': '203.0.113.1',
  };
  const out = { ...h, ...over };
  if (over.ip) out['cf-connecting-ip'] = over.ip;
  if (out.origin === '') delete out.origin;
  if (out.cookie === '') delete out.cookie;
  if (out['cf-connecting-ip'] === '') delete out['cf-connecting-ip'];
  return out;
}

// 握手成功 → resolve(ws);被拒 → reject(客户端收到 error 或 close)
function connect(over = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws', { headers: headersFor(over) });
    openSockets.push(ws);
    let opened = false;
    ws.on('open', () => {
      opened = true;
      resolve(ws);
    });
    ws.on('error', (e) => reject(e || new Error('握手失败')));
    ws.on('close', (code) => {
      if (!opened) reject(new Error('握手被关闭 code=' + code));
    });
  });
}

function joinRoom(ws, msg) {
  ws.send(JSON.stringify(msg));
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('等待 welcome 超时')), 3000);
    const onMsg = (raw) => {
      let m;
      try {
        m = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (m.t === 'welcome') {
        clearTimeout(to);
        ws.off('message', onMsg);
        resolve(m);
      }
    };
    ws.on('message', onMsg);
  });
}

async function closeSocket(ws) {
  if (!ws || ws.readyState > WebSocket.OPEN) return;
  await new Promise((resolve) => {
    ws.once('close', resolve);
    ws.once('error', resolve);
    try {
      ws.close(1000, 'bye');
    } catch {
      resolve();
    }
  });
}

async function closeAll() {
  while (openSockets.length) await closeSocket(openSockets.pop());
  await new Promise((r) => setTimeout(r, 80)); // 让服务端的 close→连接计数归位
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    res.writeHead(404);
    res.end();
  });
  wss = attachMultiplayer(server, { path: '/ws' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
  addApplicant('vid-good');
  addApplicant('vid-b');
  addApplicant('vid-kicked', 'kicked');
  store.gateData.blockedIps.length = 0;
});

afterEach(async () => {
  await closeAll();
  store.gateData.blockedIps.length = 0;
  addApplicant('vid-good');
  addApplicant('vid-b');
});

afterAll(async () => {
  await closeAll();
  try {
    wss.close();
  } catch {}
  await new Promise((resolve) => server.close(resolve));
  server.closeAllConnections?.();
  try {
    fs.unlinkSync(tmpGate);
  } catch {}
});

describe('ws upgrade 期守卫', () => {
  it('Origin 不是本站 → 拒握手', async () => {
    await expect(connect({ origin: 'https://evil.test' })).rejects.toThrow();
    await expect(connect({ origin: '' })).rejects.toThrow(); // 无 Origin 按跨源处理
  });

  it('无 vid 档案 / 被踢状态 / 会话过期 → 拒握手(与 entryGate 同口径)', async () => {
    await expect(connect({ cookie: 'vid=vid-unknown' })).rejects.toThrow();
    await expect(connect({ cookie: '' })).rejects.toThrow();
    await expect(connect({ cookie: 'vid=vid-kicked' })).rejects.toThrow();
    store.gateData.applicants['vid-good'].sess.expiresAt = Date.now() - 1000; // 会话过期/吊销
    await expect(connect({})).rejects.toThrow();
  });

  it('被拉黑 IP → 拒握手(即便 Origin 与身份都合法)', async () => {
    store.gateData.blockedIps.push('198.51.100.7');
    await expect(connect({ ip: '198.51.100.7' })).rejects.toThrow();
  });

  it('合法访客 → 握手成功并能进房', async () => {
    const ws = await connect({});
    const welcome = await joinRoom(ws, { t: 'join', code: 'TEST1', name: '甲' });
    expect(welcome.t).toBe('welcome');
    expect(typeof welcome.id).toBe('string');
    expect(welcome.code).toBe('TEST1');
  });

  it('单 IP 并发连接上限 8:第 9 条被拒', async () => {
    const ip = '203.0.113.99';
    const socks = [];
    for (let i = 0; i < 8; i++) socks.push(await connect({ ip }));
    await expect(connect({ ip })).rejects.toThrow();
    // 别的访客不受影响
    const other = await connect({ ip: '203.0.113.98' });
    expect(other.readyState).toBe(WebSocket.OPEN);
  });
});

describe('ws 资源闸', () => {
  it('maxPayload 生效:64KB 帧直接断连(整改前默认 100MB)', async () => {
    const ws = await connect({ ip: '203.0.113.101' });
    await joinRoom(ws, { t: 'join', code: 'BIG1', name: '甲' });
    const code = await new Promise((resolve) => {
      ws.on('close', resolve);
      ws.send('x'.repeat(64 * 1024));
    });
    expect(code).toBe(1009); // 1009 = Message Too Big
  });

  it('move 洪水被每连接令牌桶限住(同房间观察者收到的远少于发出条数)', async () => {
    const a = await connect({ ip: '203.0.113.102' });
    const b = await connect({ ip: '203.0.113.103', cookie: 'vid=vid-b' });
    await joinRoom(a, { t: 'join', code: 'FLOOD', name: '甲' });
    await joinRoom(b, { t: 'join', code: 'FLOOD', name: '乙' });
    let moves = 0;
    b.on('message', (raw) => {
      try {
        if (JSON.parse(raw.toString()).t === 'move') moves++;
      } catch {}
    });
    a.send(JSON.stringify({ t: 'move', x: 1, y: 0, z: 1, ry: 0 })); // 先确认链路通
    await new Promise((r) => setTimeout(r, 150));
    expect(moves).toBe(1);
    for (let i = 0; i < 300; i++)
      a.send(JSON.stringify({ t: 'move', x: i % 10, y: 0, z: i % 10, ry: 0 }));
    await new Promise((r) => setTimeout(r, 250));
    expect(moves).toBeLessThan(60); // 令牌桶 move 20/s:300 条洪水只放行个位数~二十几条
    expect(moves).toBeGreaterThan(1);
  });

  it('join 洪水被限住:同一连接 5/min 之外静默丢弃', async () => {
    const a = await connect({ ip: '203.0.113.104' });
    await joinRoom(a, { t: 'join', code: 'J1', name: '甲' });
    let welcomes = 1;
    a.on('message', (raw) => {
      try {
        if (JSON.parse(raw.toString()).t === 'welcome') welcomes++;
      } catch {}
    });
    for (let i = 0; i < 20; i++)
      a.send(JSON.stringify({ t: 'join', code: 'J' + (i % 5), name: '刷' }));
    await new Promise((r) => setTimeout(r, 200));
    expect(welcomes).toBeLessThanOrEqual(5); // join 5/min
  });
});
