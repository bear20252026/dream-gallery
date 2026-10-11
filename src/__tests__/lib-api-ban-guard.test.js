// lib-api-ban-guard.test.js — 统一 API 黑名单与封禁校验(2026-10-12 外部审计第四轮 Batch1)
//
// 洞:server.js 先跑 dispatch(整张声明式路由表),再跑 entryGate ⇒ entryGate 里唯一的
// blockedIps / kicked 设备判定对 **所有 auth:'public' 的 /api 接口形同虚设**:被拉黑的 IP、
// 被管理员踢出/封禁的设备照样能发聊天、写一念、匿名上传、改名、打 vision/TTS/上报……
// 管理员的「踢出」只藏住了画廊页面,没切断 API。
//
// 修法:lib/gate.js 收出一个单一裁决源(banDecision/apiBanGuard),server.js 在 dispatch **之前**调用;
// lib/multiplayer.js 的 upgrade 守卫改用它导出的 isIpBlocked/isProfileBanned,不再各写一份。
// 本测试钉死:
//   ① 拉黑 IP / 被踢设备 → 任意公开 API 一律 403 JSON(先于 dispatch)+ Cache-Control: no-store;
//   ② 仅入口/重进流四端点豁免(含 SSE /api/entry/watch —— 拦了踢出就隐身),/api/entry/rename 不豁免;
//   ③ 干净设备/干净 IP 照旧放行(实测 dispatch 200);
//   ④ 守卫严格只读:不新增档案、不改 blockedIps、不落盘;
//   ⑤ lib/multiplayer 的 ws 拒绝与 API 守卫同源于同一裁决(同 req 同结论);
//   ⑥ 不带访客 Cookie / 名下无档案的后台 API 调用不被误封(但 IP 在名单里就连后台一起拒,属有意)。
// ⚠️ 必须把 GATE_DATA_FILE 重定向到临时目录(多套同类测试此前打崩过 CI),USE_SQLITE=0 不建库文件。
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-api-ban-guard-'));
process.env.GATE_DATA_FILE = path.join(tmpDir, 'gate_data.json'); // 必须在 require store 之前
process.env.SQLITE_PATH = path.join(tmpDir, 'gate_data.db');
process.env.USE_SQLITE = '0';
process.env.RETENTION_DISABLED = '1';
process.env.TOKEN = 'vitest-token-abc';
process.env.NODE_ENV = '';
process.env.MULTI = 'off';
process.env.PORT = '0';
process.env.CORS_ORIGIN = 'https://cloudbear.cloud';

const require = createRequire(import.meta.url);
const { gateData, deviceKey } = require('../../lib/store.js');
const {
  apiBanGuard,
  banDecision,
  isIpBlocked,
  isProfileBanned,
  REJECT_STATUSES,
  API_BAN_EXEMPT,
} = require('../../lib/gate.js');
const { dispatch } = require('../../lib/routes.js');
const { upgradeRejectReason } = require('../../lib/multiplayer.js');

const UA = 'Mozilla/5.0 (api-ban-guard-test)'; // 真实浏览器 UA:非自动化流量,走完整身份判定
const BAD_IP = '203.0.113.66';
const CLEAN_IP = '203.0.113.77';

function mkReq({
  cookie = '',
  ip = CLEAN_IP,
  ua = UA,
  method = 'GET',
  host = 'cloudbear.cloud',
} = {}) {
  return {
    method,
    url: '/api/chat',
    headers: { 'user-agent': ua, host, ...(cookie ? { cookie } : {}) },
    socket: { remoteAddress: ip },
    on() {},
    destroy() {},
  };
}

function mkRes() {
  const res = {
    code: 0,
    headers: {},
    body: null,
    setHeader(k, v) {
      res.headers[k] = v;
    },
    getHeader(k) {
      return res.headers[k];
    },
    writeHead(c, h) {
      res.code = c;
      Object.assign(res.headers, h || {});
    },
    end(b) {
      res.body = b;
    },
    on() {},
  };
  return res;
}

// 访客档案:默认带有效会话(否则 authVid 不认,findVisitorId 也走不到「本人 Cookie→被踢档案」那一跳)
function addApplicant(id, over = {}) {
  const now = Date.now();
  gateData.applicants[id] = {
    answer: '访客',
    ua: UA,
    dk: deviceKey({ headers: { 'user-agent': UA } }),
    applyTime: now,
    lastAccess: now,
    visits: 0,
    note: '',
    localId: 'lid-' + id,
    fpSet: { h: id }, // 已认领档案:不会被别人的 dk 归并
    ips: [],
    authVersion: 0,
    status: 'approved',
    sess: {
      issuedAt: now,
      lastSeen: now,
      expiresAt: now + 3600000,
      authVersion: 0,
      revoked: false,
    },
    ...over,
  };
  return id;
}

let kicked;
beforeEach(() => {
  gateData.applicants = {};
  gateData.blockedIps = [];
  gateData.chat = [];
  gateData.userLinks = [];
  gateData.uploads = {};
  kicked = addApplicant('vid-kicked', { status: 'kicked', kickedTime: Date.now() });
  addApplicant('vid-clean', { status: 'approved' });
});

describe('裁决源:两个信号', () => {
  it('拒绝集与 entryGate/ws 同口径', () => {
    expect(REJECT_STATUSES).toEqual(['kicked', 'denied', 'history', 'reapply']);
    for (const s of REJECT_STATUSES) expect(isProfileBanned({ status: s }), s).toBe(true);
    expect(isProfileBanned({ status: 'approved' })).toBe(false);
    expect(isProfileBanned({ status: 'reapply' })).toBe(true);
    expect(isProfileBanned(null)).toBe(false);
  });

  it('kickedTime 只在「状态缺失」时才作踢出凭据:批准后的审计线索不得继续封人', () => {
    // 后台 approve 只把 status 改回 approved,kickedTime/kickReason 永久留档
    expect(
      isProfileBanned({ status: 'approved', kickedTime: Date.now() - 86400000, kickReason: '曾经' })
    ).toBe(false);
    expect(isProfileBanned({ kickedTime: Date.now() })).toBe(true); // 无状态的畸形/历史档案:autoAdmit 同口径
    expect(isProfileBanned({ status: 'approved' })).toBe(false);
    const id = addApplicant('vid-reapproved', {
      status: 'approved',
      kickedTime: Date.now() - 1000,
    });
    expect(banDecision(mkReq({ cookie: 'vid=' + id })).blocked).toBe(false);
    expect(apiBanGuard(mkReq({ cookie: 'vid=' + id }), mkRes(), '/api/chat')).toBe(false);
    expect(
      upgradeRejectReason({
        headers: {
          origin: 'http://localhost:3000',
          'user-agent': UA,
          host: 'localhost:3000',
          cookie: 'vid=' + id,
        },
        socket: { remoteAddress: '127.0.0.1' },
      })
    ).toBe(null);
  });

  it('blockedIps 命中 realIP 即封;档案查不到(陌生设备/无访客 Cookie)不因设备信号被封', () => {
    expect(isIpBlocked(mkReq({ ip: CLEAN_IP }))).toBe(false);
    gateData.blockedIps.push(BAD_IP);
    expect(isIpBlocked(mkReq({ ip: BAD_IP }))).toBe(true);
    expect(banDecision(mkReq({ ip: BAD_IP })).reason).toBe('blocked-ip');
    // 同 UA 但没有任何档案:findVisitorId 只许并入「完全匿名未认领」档案,不冒领他人被踢身份
    expect(banDecision(mkReq({ cookie: 'vid=vid-unknown' })).blocked).toBe(false);
  });
});

describe('被拉黑 IP:公开 API 一律 403(先于 dispatch)', () => {
  it('GET /api/chat 在 dispatch 之前就被拦:403 JSON + no-store', () => {
    gateData.blockedIps.push(BAD_IP);
    const res = mkRes();
    expect(apiBanGuard(mkReq({ ip: BAD_IP }), res, '/api/chat')).toBe(true);
    expect(res.code).toBe(403);
    expect(res.headers['Content-Type']).toContain('application/json');
    expect(res.headers['Cache-Control']).toContain('no-store');
    expect(JSON.parse(res.body).error).toBeTruthy();
    // 同一条请求若绕过守卫,dispatch 本会公开放行 ⇒ 证明拦在前面的价值
    const res2 = mkRes();
    expect(dispatch(mkReq({ ip: BAD_IP }), res2, '/api/chat', {})).toBe(true);
    expect(res2.code).toBe(200);
  });

  it('写接口与匿名上传路径同样被盖住(POST /api/upload、/api/wish、/api/mylinks、vision)', () => {
    gateData.blockedIps.push(BAD_IP);
    for (const [method, p] of [
      ['POST', '/api/upload'],
      ['POST', '/api/wish'],
      ['POST', '/api/mylinks'],
      ['POST', '/api/vision/analyze'],
      ['GET', '/api/myuploads'],
      ['GET', '/api/tts'],
      ['POST', '/api/client-errors'],
    ]) {
      const res = mkRes();
      expect(apiBanGuard(mkReq({ ip: BAD_IP, method }), res, p), `${method} ${p}`).toBe(true);
      expect(res.code, `${method} ${p}`).toBe(403);
    }
  });
});

describe('被踢/封设备:公开 API 一律 403', () => {
  it('vid Cookie 指向 kicked 档案 ⇒ 403,dispatch 本可放行', () => {
    const req = mkReq({ cookie: 'vid=' + kicked });
    expect(banDecision(req).reason).toBe('kicked');
    const res = mkRes();
    expect(apiBanGuard(req, res, '/api/chat')).toBe(true);
    expect(res.code).toBe(403);
    const res2 = mkRes();
    expect(dispatch(req, res2, '/api/chat', {})).toBe(true);
    expect(res2.code).toBe(200);
  });

  it('denied / history / reapply 三种状态同样被封(拒绝集全覆盖)', () => {
    for (const st of ['denied', 'history', 'reapply']) {
      const id = addApplicant('vid-' + st, { status: st });
      const res = mkRes();
      expect(apiBanGuard(mkReq({ cookie: 'vid=' + id }), res, '/api/wish'), st).toBe(true);
      expect(res.code, st).toBe(403);
    }
  });

  it('会话过期/从未建会话都不影响封禁判定(拒绝态先于会话判定)', () => {
    addApplicant('vid-kicked-nosess', { status: 'kicked', sess: null });
    const a = gateData.applicants['vid-kicked-nosess'];
    delete a.sess;
    const res = mkRes();
    expect(apiBanGuard(mkReq({ cookie: 'vid=vid-kicked-nosess' }), res, '/api/chat')).toBe(true);
    expect(res.code).toBe(403);
    expect(isProfileBanned(a)).toBe(true);
  });
});

describe('豁免清单:只有入口/重进流四端点', () => {
  const EXEMPT = [
    ['POST', '/api/entry/collect'],
    ['POST', '/api/entry/reapply'],
    ['GET', '/api/entry/status'],
    ['GET', '/api/entry/watch'],
  ];

  it('集合内容逐字钉住(不多不少,watch 是 SSE 秒级踢出通道)', () => {
    expect([...API_BAN_EXEMPT].sort()).toEqual(EXEMPT.map(([m, p]) => `${m} ${p}`).sort());
    expect(API_BAN_EXEMPT.has('GET /api/entry/watch')).toBe(true);
    expect(API_BAN_EXEMPT.has('POST /api/entry/rename')).toBe(false);
  });

  it('拉黑 IP 仍能打通四端点(看见自己的状态 + 申请回来)', () => {
    gateData.blockedIps.push(BAD_IP);
    for (const [method, p] of EXEMPT) {
      expect(apiBanGuard(mkReq({ ip: BAD_IP, method }), mkRes(), p), `${method} ${p}`).toBe(false);
    }
  });

  it('被踢设备仍能打通四端点(kick 送达与重进申请不被 API 层挡死)', () => {
    for (const [method, p] of EXEMPT) {
      expect(
        apiBanGuard(mkReq({ cookie: 'vid=' + kicked, method }), mkRes(), p),
        `${method} ${p}`
      ).toBe(false);
    }
  });

  it('/api/entry/rename 刻意不豁免:拉黑 IP 与被踢设备都吃 403', () => {
    gateData.blockedIps.push(BAD_IP);
    const r1 = mkRes();
    expect(apiBanGuard(mkReq({ ip: BAD_IP, method: 'POST' }), r1, '/api/entry/rename')).toBe(true);
    expect(r1.code).toBe(403);
    const r2 = mkRes();
    expect(
      apiBanGuard(mkReq({ cookie: 'vid=' + kicked, method: 'POST' }), r2, '/api/entry/rename')
    ).toBe(true);
    expect(r2.code).toBe(403);
  });

  it('豁免只认 method+path:GET /api/entry/collect 不在名单内 ⇒ 照封', () => {
    gateData.blockedIps.push(BAD_IP);
    expect(apiBanGuard(mkReq({ ip: BAD_IP, method: 'GET' }), mkRes(), '/api/entry/collect')).toBe(
      true
    );
  });
});

describe('干净设备与干净 IP 不受影响', () => {
  it('有效会话的 approved 档案 + 未拉黑 IP:守卫放行,dispatch 实得 200', () => {
    const req = mkReq({ cookie: 'vid=vid-clean' });
    expect(banDecision(req).blocked).toBe(false);
    expect(apiBanGuard(req, mkRes(), '/api/chat')).toBe(false);
    const res = mkRes();
    expect(dispatch(req, res, '/api/chat', {})).toBe(true);
    expect(res.code).toBe(200);
    expect(JSON.parse(res.body).msgs).toEqual([]);
  });

  it('从未到访过画廊的陌生设备(无任何档案)也不被守卫拦(守卫只封已判定为封禁者,不建档)', () => {
    const req = mkReq({ ua: 'Mozilla/5.0 (brand-new-device-ua)' });
    expect(apiBanGuard(req, mkRes(), '/api/chat')).toBe(false);
  });
});

describe('守卫严格只读:不建档、不改黑名单、不落盘', () => {
  it('拦下被踢设备 / 放行陌生设备 / 拦下拉黑 IP —— gateData 一字节都没写', () => {
    gateData._savedAt = 1; // saveGateData() 首行会把 _savedAt 顶成当前毫秒 ⇒ 仍是 1 = 一次都没落盘
    const ipsLenBefore = gateData.blockedIps.length;
    const snap = JSON.parse(JSON.stringify(gateData));
    delete snap._savedAt;
    delete snap.blockedIps; // 这两项是本测试自己刻意改的,其余一律必须原样

    expect(apiBanGuard(mkReq({ cookie: 'vid=' + kicked }), mkRes(), '/api/chat')).toBe(true);
    expect(
      apiBanGuard(mkReq({ ua: 'Mozilla/5.0 (total-stranger-ua)' }), mkRes(), '/api/chat')
    ).toBe(false);
    gateData.blockedIps.push(BAD_IP);
    expect(apiBanGuard(mkReq({ ip: BAD_IP }), mkRes(), '/api/chat')).toBe(true);
    // 反复调用同一陌生设备:绝不产生第 2、第 3 份档案(entryGate 的 autoAdmit 才会建)
    for (let i = 0; i < 5; i++) {
      expect(
        apiBanGuard(mkReq({ ua: 'Mozilla/5.0 (total-stranger-ua)' }), mkRes(), '/api/chat')
      ).toBe(false);
    }

    const after = JSON.parse(JSON.stringify(gateData));
    delete after._savedAt;
    delete after.blockedIps;
    expect(JSON.stringify(after), '守卫绝不新增访客档案').toBe(JSON.stringify(snap));
    expect(gateData.blockedIps.length).toBe(ipsLenBefore + 1); // 只多我 push 的那一条
    expect(gateData._savedAt, '守卫不得 saveGateData()').toBe(1);
    expect(JSON.stringify(gateData.visits), '守卫不得记访问统计').toBe(JSON.stringify(snap.visits));
  });
});

describe('lib/multiplayer 的拒绝判定收拢到同一裁决源', () => {
  function wsReq({ ip = '127.0.0.1', cookie = 'vid=vid-clean' } = {}) {
    return {
      headers: {
        origin: 'http://localhost:3000', // 回环 + localhost Host ⇒ security.isAllowedOrigin 放行
        'user-agent': UA,
        host: 'localhost:3000',
        cookie,
      },
      socket: { remoteAddress: ip },
    };
  }

  it('返回字符串契约原样保留(null / kicked / blocked-ip)', () => {
    expect(upgradeRejectReason(wsReq())).toBe(null);
    expect(upgradeRejectReason(wsReq({ cookie: 'vid=' + kicked }))).toBe('kicked');
    gateData.blockedIps.push('127.0.0.1');
    expect(upgradeRejectReason(wsReq())).toBe('blocked-ip');
  });

  it('同一条请求:API 守卫与 ws 守卫结论同源', () => {
    for (const opts of [{}, { cookie: 'vid=' + kicked }]) {
      const ws = wsReq(opts);
      const apiReq = mkReq({ cookie: opts.cookie });
      expect(banDecision(apiReq).blocked).toBe(
        upgradeRejectReason(ws) !== null,
        JSON.stringify(opts)
      );
    }
    gateData.blockedIps.push('127.0.0.1');
    expect(banDecision(mkReq({ ip: '127.0.0.1' })).blocked).toBe(true);
    expect(isIpBlocked(wsReq())).toBe(true);
  });
});

describe('管理员流量边界', () => {
  it('后台 API 调用不带访客 Cookie、名下无档案 ⇒ 不被误封(IP 不在名单时照旧进 dispatch 走 token 校验)', () => {
    const req = mkReq({ method: 'GET', ip: CLEAN_IP });
    expect(apiBanGuard(req, mkRes(), '/api/admin/list')).toBe(false);
    const res = mkRes();
    expect(dispatch({ ...req, url: '/api/admin/list' }, res, '/api/admin/list', {})).toBe(true);
    expect(res.code).toBe(401); // 无 token:守卫不掺和,仍由原 token 档裁决
    const ok = mkRes();
    expect(
      dispatch({ ...req, url: '/api/admin/list' }, ok, '/api/admin/list', {
        token: 'vitest-token-abc',
      })
    ).toBe(true);
    expect(ok.code).not.toBe(403); // 既不是 401 也不是 403 ⇒ 放行到处理器
  });

  it('IP 确实在黑名单里:后台 API 一并拒(有意行为)', () => {
    gateData.blockedIps.push(CLEAN_IP);
    const res = mkRes();
    expect(apiBanGuard(mkReq({ ip: CLEAN_IP }), res, '/api/admin/list')).toBe(true);
    expect(res.code).toBe(403);
  });

  it('静态/页面请求不归本守卫管(照旧由 entryGate 裁决)', () => {
    gateData.blockedIps.push(BAD_IP);
    for (const p of ['/', '/index.html', '/guide.html', '/models/a.glb']) {
      expect(apiBanGuard(mkReq({ ip: BAD_IP, method: 'GET' }), mkRes(), p), p).toBe(false);
    }
    // 非 /api 的运营端点(/healthz 探活、后台页、后台媒体、台词音频)也不被本守卫改写行为
    for (const [method, p] of [
      ['GET', '/healthz'],
      ['GET', '/admin'],
      ['GET', '/admin-media/photos/a.jpg'],
      ['GET', '/tts-audio/0123456789abcdef0123.mp3'],
    ]) {
      expect(apiBanGuard(mkReq({ ip: BAD_IP, method }), mkRes(), p), `${method} ${p}`).toBe(false);
    }
  });

  it('本地直连开发流量:127.0.0.1 未被拉黑时一律放行(与 entryGate 对回环的宽松口径一致)', () => {
    const res = mkRes();
    expect(apiBanGuard(mkReq({ ip: '127.0.0.1', method: 'POST' }), res, '/api/wish')).toBe(false);
  });
});

describe('测试隔离', () => {
  it('数据写在临时目录,不落真实 gate_data.json/db', () => {
    expect(process.env.GATE_DATA_FILE).toContain('dg-api-ban-guard-');
    expect(path.dirname(process.env.GATE_DATA_FILE)).toBe(tmpDir);
    expect(fs.existsSync(path.join(tmpDir, 'gate_data.db'))).toBe(false); // USE_SQLITE=0
  });
});
