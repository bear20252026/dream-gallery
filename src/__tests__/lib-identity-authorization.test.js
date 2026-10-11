// lib 身份与可见性授权测试(DG-SEC-001 / DG-SEC-002)
// 钉死这几条行为:
//   ① UA 哈希(dk)不再构成授权——同 UA 的两个陌生访客互相看不到对方的私有媒体与 mt;
//   ② 「同 UA 历史档案」的循环兜底已删除;
//   ③ 存量无 aid 记录仍可按 dk 认领,但必须有本人有效 vid,且当场把 aid 绑上(一次性迁移);
//   ④ autoAdmit 不再把新访客并入他人已认领档案,也不把他人的 kicked 状态经 dk 传下去;
//   ⑤ mt 老化:超 MT_MAX_AGE_MS 在本人下次访问时静默重签,旧值即刻不再匹配(rotateMt 同效)。
// 必须用 createRequire 与被测模块共享同一 Node require 缓存(vitest ESM import 会产生双实例,gateData 改动传不进去)。
// 数据一律落到系统临时目录(照 scripts/test/test-store.js 的做法),不碰真实 gate_data.json/db。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-identity-'));
process.env.GATE_DATA_FILE = path.join(tmpDir, 'gate_data.json'); // 必须在 require store 之前
process.env.TOKEN = process.env.TOKEN || 'vitest-token-abc';

const require = createRequire(import.meta.url);
const {
  gateData,
  deviceKey,
  sessionValid,
  issueSession,
  authVid,
  ownerAid,
  isUnclaimedProfile,
} = require('../../lib/store.js');
const {
  isMineUpload,
  canServeMedia,
  handlePublicConfig,
  rotateMt,
  MT_MAX_AGE_MS,
} = require('../../lib/siteconfig.js');
const { autoAdmit } = require('../../lib/gate.js');

const UA = 'Mozilla/5.0 (identical UA of two strangers)';
const DK = deviceKey({ headers: { 'user-agent': UA } });
const DAY = 24 * 3600 * 1000;

function reqOf(ua, vid, url) {
  return {
    headers: { 'user-agent': ua || UA, ...(vid ? { cookie: 'vid=' + vid } : {}) },
    url: url || '',
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
// 建一个访客档案;claimed=true 表示浏览器提交过指纹/改过昵称(真人已认领)
function mkVisitor(id, opts) {
  const o = opts || {};
  const a = {
    answer: o.answer || '访客',
    ua: o.ua || UA,
    dk: o.dk || DK,
    status: 'approved',
    applyTime: Date.now(),
    lastAccess: Date.now(),
    visits: 0,
    note: '',
    localId: o.localId || '',
    fpSet: o.fpSet || {},
    ips: [],
  };
  if (o.kicked) {
    a.status = 'kicked';
    a.kickedTime = Date.now() - 1000;
  }
  gateData.applicants[id] = a;
  issueSession(a); // 会话有效 → 该 vid 可用于授权
  return id;
}
function publicConfig(vid) {
  const res = resMock();
  handlePublicConfig(reqOf(UA, vid), res);
  return res.body;
}

let snap;
beforeEach(() => {
  snap = JSON.stringify({
    uploads: gateData.uploads,
    applicants: gateData.applicants,
    userLinks: gateData.userLinks,
    photoCaptions: gateData.photoCaptions,
    siteConfig: gateData.siteConfig,
  });
  gateData.applicants = {};
  gateData.uploads = {};
  gateData.userLinks = [];
  gateData.photoCaptions = {};
  gateData.siteConfig.demoPhotos = ['201.jpg'];
  gateData.siteConfig.customLinks = [];
});
afterEach(() => {
  const s = JSON.parse(snap);
  gateData.uploads = s.uploads;
  gateData.applicants = s.applicants;
  gateData.userLinks = s.userLinks;
  gateData.photoCaptions = s.photoCaptions;
  gateData.siteConfig = s.siteConfig;
});

describe('UA 哈希不构成授权(DG-SEC-001/002)', () => {
  it('同一 UA 的两个陌生访客:各自只看得见自己的私有媒体与 mt', () => {
    mkVisitor('vidA', { answer: '小A', fpSet: { h1: 1 } });
    mkVisitor('vidB', { answer: '小B', fpSet: { h2: 1 } });
    gateData.uploads = {
      'a.jpg': { dk: DK, aid: 'vidA', ts: Date.now(), mt: 'aaaaaaaaaaaaaaaaaaaa' },
      'b.jpg': { dk: DK, aid: 'vidB', ts: Date.now(), mt: 'bbbbbbbbbbbbbbbbbbbb' },
    };

    const reqB = reqOf(UA, 'vidB');
    expect(isMineUpload(reqB, gateData.uploads['a.jpg'], DK)).toBe(false);
    expect(canServeMedia(reqOf(UA, 'vidB'), 'photos', 'a.jpg')).toBe(false);
    const cb = publicConfig('vidB');
    expect(cb.myUploads).toEqual(['b.jpg']);
    expect(cb.myUploadTokens).toEqual({ 'b.jpg': 'bbbbbbbbbbbbbbbbbbbb' });

    const ca = publicConfig('vidA');
    expect(ca.myUploads).toEqual(['a.jpg']);
    expect(ca.myUploadTokens).toEqual({ 'a.jpg': 'aaaaaaaaaaaaaaaaaaaa' });
  });

  it('同 UA 但拿不到有效 vid(清 Cookie / 无 Cookie 的浏览器):不得因 UA 相同放行私有媒体', () => {
    mkVisitor('vidA', { answer: '小A', fpSet: { h1: 1 } });
    gateData.uploads = {
      'a.jpg': { dk: DK, aid: 'vidA', ts: Date.now(), mt: 'aaaaaaaaaaaaaaaaaaaa' },
    };
    expect(isMineUpload(reqOf(UA), gateData.uploads['a.jpg'], DK)).toBe(false);
    expect(canServeMedia(reqOf(UA), 'photos', 'a.jpg')).toBe(false);
    expect(publicConfig(null).myUploads).toEqual([]);
  });

  it('「同 UA 历史档案」循环兜底已删除:申请人 UA 相同也不再认别人无 aid 的记录', () => {
    // 旧实现:遍历 applicants 里 a.dk===u.dk && a.ua===req UA 即放行——同 UA 陌生人照样命中
    mkVisitor('vidA', { answer: '小A', fpSet: { h1: 1 } });
    gateData.uploads = { 'orphan.jpg': { dk: DK, ts: Date.now() } }; // 无 aid、无 vid 的请求
    expect(isMineUpload(reqOf(UA), gateData.uploads['orphan.jpg'], DK)).toBe(false);
    expect(gateData.uploads['orphan.jpg'].aid).toBeUndefined();
  });

  it('authVid 只认会话有效的本人 Cookie;ownerAid 不再把他人档案判给同 UA 陌生人', () => {
    mkVisitor('vidA', { answer: '小A', fpSet: { h1: 1 } });
    expect(authVid(reqOf(UA, 'vidA'))).toBe('vidA');
    expect(authVid(reqOf(UA, 'no-such-vid'))).toBe(null);
    expect(authVid(reqOf(UA))).toBe(null);
    expect(ownerAid(reqOf(UA))).toBe(null); // 旧实现会返回 vidA
  });
});

describe('存量记录的一次性迁移(允许按 dk 认领,但当场绑 aid)', () => {
  it('2026-09-18 之前的无 aid 记录:本人带有效 vid 时可见,并立刻绑成该 vid', () => {
    mkVisitor('vidC', { answer: '阿 C', fpSet: { h3: 1 } });
    gateData.uploads = { 'legacy.jpg': { dk: DK, ts: Date.now() - 40 * DAY, mt: 'legacytoken' } };
    const req = reqOf(UA, 'vidC');
    expect(isMineUpload(req, gateData.uploads['legacy.jpg'], DK)).toBe(true);
    expect(gateData.uploads['legacy.jpg'].aid).toBe('vidC');
    expect(publicConfig('vidC').myUploads).toContain('legacy.jpg');
    // 绑定生效后,同 UA 的下一个人再也拿不到(不再依赖 UA)
    mkVisitor('vidD', { answer: '阿 D', fpSet: { h4: 1 } });
    expect(isMineUpload(reqOf(UA, 'vidD'), gateData.uploads['legacy.jpg'], DK)).toBe(false);
    expect(publicConfig('vidD').myUploadTokens).toEqual({});
  });

  it('迁移必须有有效 vid:无 vid 的 dk 命中既不放行也不绑定', () => {
    gateData.uploads = { 'legacy2.jpg': { dk: DK, ts: Date.now() } };
    expect(isMineUpload(reqOf(UA), gateData.uploads['legacy2.jpg'], DK)).toBe(false);
    expect(gateData.uploads['legacy2.jpg'].aid).toBeUndefined();
  });

  it('访客链接(userLinks)同样只按 vid 归属,并在本人读取时绑定', () => {
    mkVisitor('vidE', { answer: '阿 E', fpSet: { h5: 1 } });
    gateData.userLinks = [
      { id: 'l1', dk: DK, name: 'E 的秘密链接', url: 'https://e.example' },
      { id: 'l2', dk: DK, aid: 'vidF', name: '别人的链接', url: 'https://f.example' },
    ];
    const body = publicConfig('vidE');
    expect(body.myLinks.map((l) => l.id)).toEqual(['l1']);
    expect(gateData.userLinks[0].aid).toBe('vidE');
  });
});

describe('身份归并收紧:陌生设备不再并入他人档案', () => {
  it('autoAdmit 不再复用「已被认领」或「被踢出」的他人档案', () => {
    const before = Object.keys(gateData.applicants).length;
    mkVisitor('vidA', { answer: '小A', fpSet: { h1: 1 } });
    mkVisitor('vidK', { answer: '被踢者', localId: 'lid-k', kicked: true });
    const res = resMock();
    autoAdmit(reqOf(UA), res, '/api/x');
    const ids = Object.keys(gateData.applicants);
    expect(ids.length).toBe(before + 2 + 1); // A、K 之外只多出一个新档案
    const fresh = ids.find((id) => id !== 'vidA' && id !== 'vidK');
    expect(gateData.applicants[fresh].status).toBe('approved');
    expect(gateData.applicants[fresh].answer).toBe('访客');
    expect(gateData.applicants[fresh].kickedTime).toBeUndefined();
    expect(gateData.applicants.vidK.status).toBe('kicked'); // 他人踢出状态不外传
    expect(sessionValid(gateData.applicants[fresh])).toBe(true); // 新档案当场建会话
    expect(res.headers['Set-Cookie']).toBeTruthy();
  });

  it('完全匿名且从未被认领的档案仍可被同 UA 续用(存量迁移兜底)', () => {
    gateData.applicants.anon1 = {
      answer: '访客',
      ua: UA,
      dk: DK,
      status: 'approved',
      applyTime: Date.now() - DAY,
      localId: '',
      fpSet: {},
    };
    expect(isUnclaimedProfile(gateData.applicants.anon1)).toBe(true);
    expect(isUnclaimedProfile(gateData.applicants.vidA || { answer: '小A' })).toBe(false);
    autoAdmit(reqOf(UA), resMock(), '/api/x');
    expect(gateData.applicants.anon1).toBeTruthy();
    expect(Object.keys(gateData.applicants)).toEqual(['anon1']);
  });
});

describe('mt 令牌老化与轮换(DG-AUTH-003)', () => {
  it('超龄 mt 在本人下次访问时静默重签,旧 URL 当场失效', () => {
    mkVisitor('vidG', { answer: '阿 G', fpSet: { h7: 1 } });
    const old = 'deadbeefdeadbeefdead';
    gateData.uploads = {
      'stale.jpg': {
        dk: DK,
        aid: 'vidG',
        ts: Date.now() - 200 * DAY,
        mt: old,
        mtIssuedAt: Date.now() - 200 * DAY,
      },
      'fresh.jpg': {
        dk: DK,
        aid: 'vidG',
        ts: Date.now(),
        mt: 'cafebabecafebabecafe',
        mtIssuedAt: Date.now() - DAY,
      },
    };
    const body = publicConfig('vidG');
    const newStale = body.myUploadTokens['stale.jpg'];
    expect(newStale).toBeTruthy();
    expect(newStale).not.toBe(old);
    expect(newStale).toMatch(/^[0-9a-f]{20}$/);
    expect(body.myUploadTokens['fresh.jpg']).toBe('cafebabecafebabecafe'); // 未超龄不动
    expect(gateData.uploads['stale.jpg'].mtIssuedAt).toBeGreaterThan(Date.now() - 5000);
    // 旧令牌不再匹配,新令牌仍可放行(canServeMedia 仍是字符串比对)
    expect(
      canServeMedia(reqOf(UA, null, '/photos/stale.jpg?mt=' + old), 'photos', 'stale.jpg')
    ).toBe(false);
    expect(
      canServeMedia(reqOf(UA, null, '/photos/stale.jpg?mt=' + newStale), 'photos', 'stale.jpg')
    ).toBe(true);
  });

  it('存量 mt 无签发时间时按上传时间回填,回填后未超龄则不动', () => {
    mkVisitor('vidH', { answer: '阿 H', fpSet: { h8: 1 } });
    gateData.uploads = {
      'backfill.jpg': { dk: DK, aid: 'vidH', ts: Date.now() - 10 * DAY, mt: 'tokenkeep' },
    };
    const body = publicConfig('vidH');
    expect(body.myUploadTokens['backfill.jpg']).toBe('tokenkeep');
    expect(gateData.uploads['backfill.jpg'].mtIssuedAt).toBeGreaterThan(0);
  });

  it('rotateMt 直接重签并盖时间;未知文件名返回 null', () => {
    mkVisitor('vidI', { answer: '阿 I', fpSet: { h9: 1 } });
    gateData.uploads = {
      'x.jpg': {
        dk: DK,
        aid: 'vidI',
        ts: Date.now(),
        mt: 'origintoken0000000',
        mtIssuedAt: Date.now(),
      },
    };
    const before = gateData.uploads['x.jpg'].mt;
    const after = rotateMt('x.jpg');
    expect(after).toMatch(/^[0-9a-f]{20}$/);
    expect(after).not.toBe(before);
    expect(isMineUpload(reqOf(UA, 'vidI'), gateData.uploads['x.jpg'], DK)).toBe(true); // 轮换不影响归属
    expect(canServeMedia(reqOf(UA, null, '/photos/x.jpg?mt=' + before), 'photos', 'x.jpg')).toBe(
      false
    );
    expect(rotateMt('not-there.jpg')).toBe(null);
  });

  it('MT_MAX_AGE_MS = 180 天', () => {
    expect(MT_MAX_AGE_MS).toBe(180 * DAY);
  });
});

describe('测试隔离', () => {
  it('测试数据写在临时目录,不落真实 gate_data.json', () => {
    expect(fs.existsSync(process.env.GATE_DATA_FILE)).toBe(true);
    expect(process.env.GATE_DATA_FILE).toContain('dg-identity-');
  });
});
