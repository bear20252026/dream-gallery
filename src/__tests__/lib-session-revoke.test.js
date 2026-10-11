// lib 会话吊销永久性测试(DG-AUTH-002)
// 钉死这几条行为:
//   ① 吊销 = authVersion + 1 且 sess 写成永不匹配的旧版本号 → sessionValid 永久 false;
//   ② touchSession 只在会话已有效时续期,绝不重新签发、绝不复位 revoked(旧实现在此复活);
//   ③ 重新取得会话只有两条正常入口:管理员批准(admin approve)与访客完成重新验证(resumeSession);
//   ④ kick(踢出)链路行为一字不变——那是另一回事;
//   ⑤ 存量数据护栏:线上历史 sess 没有 authVersion 字段,必须仍按 0 解读(否则部署即全员掉登录)。
// 数据落系统临时目录,不碰真实 gate_data.json/db。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-revoke-'));
process.env.GATE_DATA_FILE = path.join(tmpDir, 'gate_data.json'); // 必须在 require store 之前
process.env.TOKEN = process.env.TOKEN || 'vitest-token-abc';

const require = createRequire(import.meta.url);
const { TOKEN } = require('../../lib/config.js');
const store = require('../../lib/store.js');
const {
  gateData,
  deviceKey,
  sessionValid,
  touchSession,
  issueSession,
  resumeSession,
  revokeSession,
  authVid,
  isUnclaimedProfile,
  sessionRevoked,
} = store;
const { autoAdmit, handleCollect } = require('../../lib/gate.js');
const { handleAdminDecide } = require('../../lib/admin.js');

const UA = 'Mozilla/5.0 (session-revoke-visitor)';
const DK = deviceKey({ headers: { 'user-agent': UA } });
const DAY = 24 * 3600 * 1000;

function reqOf(vid, extraHeaders) {
  return {
    headers: {
      'user-agent': UA,
      ...(vid ? { cookie: 'vid=' + vid } : {}),
      ...(extraHeaders || {}),
    },
    url: '',
    socket: { remoteAddress: '203.0.113.7' },
    on() {},
    setHeader() {},
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
// util.readBody 只挂 data/end 监听:这里让 on() 立刻回调,同步拿到 body
function bodyReq(body, withToken, cookie) {
  return {
    headers: {
      'user-agent': UA,
      ...(withToken !== false ? { 'x-token': TOKEN } : {}),
      ...(cookie ? { cookie } : {}),
    },
    url: '',
    socket: { remoteAddress: '203.0.113.7' },
    on(ev, cb) {
      if (ev === 'data') cb(JSON.stringify(body));
      else if (ev === 'end') cb();
      return this;
    },
    destroy() {},
  };
}
function decide(body, withToken) {
  const res = resMock();
  handleAdminDecide(bodyReq(body, withToken), res, {});
  return res;
}
function mkProfile(id, opts) {
  const o = opts || {};
  const a = {
    answer: o.answer || '访客',
    ua: UA,
    dk: o.dk || DK,
    status: o.status || 'approved',
    applyTime: Date.now(),
    lastAccess: Date.now(),
    visits: 0,
    note: '',
    localId: o.localId || '',
    fpSet: o.fpSet || {},
    ips: [],
  };
  gateData.applicants[id] = a;
  if (o.sess === false) return id; // 存量档案:从未建过会话
  if (o.sess) a.sess = o.sess;
  else issueSession(a);
  return id;
}

let snap;
beforeEach(() => {
  snap = JSON.stringify({
    applicants: gateData.applicants,
    uploads: gateData.uploads,
    kickLog: gateData.kickLog,
    geo: gateData.geo,
  });
  gateData.applicants = {};
  gateData.uploads = {};
  gateData.kickLog = [];
});
afterEach(() => {
  const s = JSON.parse(snap);
  gateData.applicants = s.applicants;
  gateData.uploads = s.uploads;
  gateData.kickLog = s.kickLog;
  gateData.geo = s.geo;
});

describe('吊销永久(DG-AUTH-002)', () => {
  it('revokeSession 升 authVersion 并写成永不匹配的旧版本号,会话即刻且永久失效', () => {
    mkProfile('rv');
    expect(sessionValid(gateData.applicants.rv)).toBe(true);
    expect(revokeSession('rv')).toBe(true);
    const a = gateData.applicants.rv;
    expect(a.authVersion).toBe(1);
    expect(a.sess.authVersion).toBe(-1);
    expect(a.sess.revokedAt).toBeGreaterThan(0);
    expect(a.sess.expiresAt).toBeUndefined();
    expect(sessionValid(a)).toBe(false);
    expect(authVid(reqOf('rv'))).toBe(null);
  });

  it('吊销后 touchSession 反复调用也不复活(旧实现在这里自动换发)', () => {
    mkProfile('rv2');
    revokeSession('rv2');
    const before = JSON.stringify(gateData.applicants.rv2.sess);
    for (let i = 0; i < 3; i++) touchSession(gateData.applicants.rv2);
    expect(JSON.stringify(gateData.applicants.rv2.sess)).toBe(before);
    expect(sessionValid(gateData.applicants.rv2)).toBe(false);
    expect(gateData.applicants.rv2.sess.expiresAt).toBeUndefined();
    expect(gateData.applicants.rv2.authVersion).toBe(1);
  });

  it('吊销过的匿名档案不再被 dk 续用:autoAdmit 另建身份,老身份保持永久无效', () => {
    mkProfile('rv3'); // 完全匿名、无昵称无指纹
    revokeSession('rv3');
    expect(sessionValid(gateData.applicants.rv3)).toBe(false);
    autoAdmit(reqOf(null), resMock(), '/api/x');
    const ids = Object.keys(gateData.applicants);
    expect(ids.length).toBe(2); // 新建档案,而不是续用被吊销的那个
    expect(sessionValid(gateData.applicants.rv3)).toBe(false); // 吊销状态不会被洗白
    expect(gateData.applicants.rv3.authVersion).toBe(1);
    const fresh = ids.find((id) => id !== 'rv3');
    expect(sessionValid(gateData.applicants[fresh])).toBe(true); // 新访客自带有效会话
    expect(isUnclaimedProfile(gateData.applicants.rv3)).toBe(false); // 毒化身份不再供归并
  });

  it('吊销不存在的档案安全返回 false', () => {
    expect(revokeSession('no-such-id')).toBe(false);
    expect(revokeSession('__proto__')).toBe(false);
  });

  it('多次吊销继续升版本,旧会话永远追不上', () => {
    mkProfile('rv4');
    revokeSession('rv4');
    const a = gateData.applicants.rv4;
    issueSession(a); // 批准等正常入口重发
    expect(sessionValid(a)).toBe(true);
    revokeSession('rv4');
    expect(a.authVersion).toBe(2);
    expect(sessionValid(a)).toBe(false);
  });
});

describe('会话只由正常入口签发(admin 链路)', () => {
  it('无 token → 401(接口鉴权不变)', () => {
    mkProfile('p1');
    expect(decide({ id: 'p1', action: 'revoke-session' }, false).code).toBe(401);
  });

  it('revoke-session 响应带 revoked_permanently,前端文案据此对齐', () => {
    mkProfile('p2', { answer: '小 P' });
    const res = decide({ id: 'p2', action: 'revoke-session' });
    expect(res.code).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.revoked_permanently).toBe(true);
    expect(sessionValid(gateData.applicants.p2)).toBe(false);
  });

  it('approve 给新会话并盖上当前 authVersion —— 吊销后唯一恢复路径', () => {
    mkProfile('p3', { answer: '小 P', status: 'reapply' });
    revokeSession('p3');
    expect(sessionValid(gateData.applicants.p3)).toBe(false);
    const res = decide({ id: 'p3', action: 'approve' });
    expect(res.code).toBe(200);
    const a = gateData.applicants.p3;
    expect(a.status).toBe('approved');
    expect(a.sess.authVersion).toBe(a.authVersion);
    expect(a.sess.expiresAt).toBeGreaterThan(Date.now());
    expect(sessionValid(a)).toBe(true);
    expect(authVid(reqOf('p3'))).toBe('p3');
  });

  it('kick 链路行为不变:置 kicked + 踢出历史 + 返回 ok(不改会话、不复活)', () => {
    mkProfile('k1', { answer: '要被踢的人' });
    const sessBefore = JSON.stringify(gateData.applicants.k1.sess);
    const res = decide({ id: 'k1', action: 'kick', reason: '刷屏' });
    expect(res.code).toBe(200);
    expect(res.body.ok).toBe(true);
    const a = gateData.applicants.k1;
    expect(a.status).toBe('kicked');
    expect(a.kickedTime).toBeGreaterThan(0);
    expect(a.kickReason).toBe('刷屏');
    expect(gateData.kickLog.length).toBe(1);
    expect(gateData.kickLog[0].id).toBe('k1');
    expect(JSON.stringify(a.sess)).toBe(sessBefore); // 踢出不动会话(DG-AUTH-002 之外)
    expect(sessionValid(a)).toBe(true);
  });

  it('未知 action 仍被拒(接口面未扩大)', () => {
    mkProfile('p4');
    const res = decide({ id: 'p4', action: 'nuke' });
    expect(res.code).toBe(400);
    expect(String(res.body.error)).toContain('revoke-session');
  });
});

describe('过期 ≠ 吊销', () => {
  it('过期会话不被 touchSession 自动换发,只能经重新验证(resumeSession)恢复', () => {
    mkProfile('e1', { answer: '归人' });
    gateData.applicants.e1.sess.expiresAt = Date.now() - 1000;
    gateData.applicants.e1.sess.lastSeen = Date.now() - 8 * DAY;
    expect(sessionValid(gateData.applicants.e1)).toBe(false);
    touchSession(gateData.applicants.e1);
    expect(sessionValid(gateData.applicants.e1)).toBe(false); // 旧实现在此直接复活
    const issued = resumeSession(gateData.applicants.e1); // 访客完成重新验证
    expect(issued.expiresAt).toBeGreaterThan(Date.now());
    expect(issued.authVersion).toBe(0); // authVersion 缺省即 0(读时 `a.authVersion || 0`),过期不升版
    expect(sessionValid(gateData.applicants.e1)).toBe(true);
  });

  it('有效会话 touchSession 只续期,不改动 issuedAt/authVersion', () => {
    mkProfile('e2', { answer: '常客' });
    const issuedAt = gateData.applicants.e2.sess.issuedAt;
    gateData.applicants.e2.sess.lastSeen = Date.now() - 2 * DAY; // 越过 1 小时节流
    gateData.applicants.e2.sess.expiresAt = Date.now() + 60000;
    touchSession(gateData.applicants.e2);
    const s = gateData.applicants.e2.sess;
    expect(s.issuedAt).toBe(issuedAt);
    expect(s.authVersion).toBe(0);
    expect(s.expiresAt).toBeGreaterThan(Date.now() + 29 * DAY);
    expect(s.revoked).toBe(false);
  });

  it('存量数据护栏:历史 sess 无 authVersion 字段仍视为有效,部署不掉登录', () => {
    mkProfile('legacy', {
      answer: '老访客',
      sess: {
        issuedAt: Date.now() - DAY,
        lastSeen: Date.now() - DAY,
        expiresAt: Date.now() + DAY,
        revoked: false,
      },
    });
    expect(sessionValid(gateData.applicants.legacy)).toBe(true);
    expect(authVid(reqOf('legacy'))).toBe('legacy');
    expect(ownerAidUnchanged()).toBe('legacy');
  });

  it('存量档案完全没有 sess 视为有效(迁移期兼容)', () => {
    mkProfile('nosess', { answer: '无会话档案', sess: false });
    expect(gateData.applicants.nosess.sess).toBeUndefined();
    expect(sessionValid(gateData.applicants.nosess)).toBe(true);
    expect(authVid(reqOf('nosess'))).toBe('nosess');
    touchSession(gateData.applicants.nosess); // 补建而非复活
    expect(gateData.applicants.nosess.sess.issuedAt).toBeGreaterThan(0);
    expect(sessionValid(gateData.applicants.nosess)).toBe(true);
  });

  it('过期身份仍可续用:handleCollect 完成重新验证 → 同一档案换发会话', () => {
    mkProfile('rec', { answer: '归人', localId: 'lid-rec' });
    gateData.applicants.rec.sess.expiresAt = Date.now() - 1000;
    expect(sessionValid(gateData.applicants.rec)).toBe(false);
    expect(sessionRevoked(gateData.applicants.rec)).toBe(false); // 只是过期,不是吊销
    handleCollect(bodyReq({ lid: 'lid-rec', fp: { scr: '1x1' } }, true, 'vid=rec'), resMock(), {});
    expect(Object.keys(gateData.applicants)).toEqual(['rec']); // 没有另建身份
    expect(sessionValid(gateData.applicants.rec)).toBe(true);
  });

  it('吊销身份不再续用:同一 vid 提交重新验证也不换发,只能另建匿名新档案', () => {
    mkProfile('rev2', { answer: '归人', localId: 'lid-rev' });
    revokeSession('rev2');
    expect(sessionRevoked(gateData.applicants.rev2)).toBe(true);
    handleCollect(bodyReq({ lid: 'lid-rev', fp: { scr: '1x1' } }, true, 'vid=rev2'), resMock(), {});
    const ids = Object.keys(gateData.applicants);
    expect(ids.length).toBe(2); // 老身份保持死档 + 新建匿名档案
    expect(sessionValid(gateData.applicants.rev2)).toBe(false);
    expect(gateData.applicants.rev2.authVersion).toBe(1);
  });

  it('吊销后落盘可复原:重新加载磁盘快照仍判无效', async () => {
    mkProfile('disk', { answer: '落盘检查' });
    revokeSession('disk');
    await store.saveGateData();
    const onDisk = JSON.parse(fs.readFileSync(process.env.GATE_DATA_FILE, 'utf8'));
    expect(onDisk.applicants.disk.sess.authVersion).toBe(-1);
    expect(onDisk.applicants.disk.authVersion).toBe(1);
    expect(sessionValid(onDisk.applicants.disk)).toBe(false);
  });
});

// ownerAid 的会话校验路径(同文件内引用,便于读)
function ownerAidUnchanged() {
  return store.ownerAid(reqOf('legacy'));
}
