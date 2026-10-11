// lib-whiteboard-overwrite.test.js — 白板展品的归属闸门(2026-10-12 DG-SEC-001)
// 钉住:
//   ① 甲(有效访客会话)新建白板 ⇒ 201,名字由**服务端签发**(不是前端拼的那个),归属落 aid=本人 vid;
//   ② 甲拿这个签发名反复保存 ⇒ 仍 201(合法"同一幅画重保存覆盖"),内容更新、aid 与 mt 不被换走;
//   ③ 乙(另一个有效会话,哪怕与甲同一 UA)用甲的文件名保存 ⇒ 409,原文件字节与 sha256 一字不变,
//      归属元数据(aid/mt/dk/pending)不被改;
//   ④ 无 Cookie 请求尝试覆盖 ⇒ 401(没表明身份,与"身份对不上"的 409 分开),且不留半成品文件;
//   ⑤ 后台 token 直传仍可覆盖(既有设计不回退),且不落匿名归属;
//   ⑥ 存量作品(有文件无归属记录)匿名覆盖 ⇒ 409,主人以前的画不会被扰动;
//   ⑦ 匿名侧只能写 photos 的白板名(dir=videos|music ⇒ 403);
//   ⑧ 并发:同名双请求只有一个能写入;两个新作品各自独立、互不覆盖;
//   ⑨ 审核不可用时的 pending 语义不被削弱(文件保留 + uploads.pending + 决策表不上墙)。
// 约定同 lib-upload-overwrite.test.js / lib-vision-guard.test.js:lib/*.js 是 CJS,用 createRequire;
//   aichannels/r2sync 在 require 任何 lib 之前打 require.cache 桩 ⇒ 零真网络、零真 AI 调用。
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);
// 数据与 R2 台账都落到系统临时目录:否则本套件会写仓库真实的 gate_data.json / .r2-outbox.json,
// 全量 vitest 并发时与其他套件抢同一个文件(Windows EPERM rename → hook 超时假红)。
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-wbdata-'));
process.env.GATE_DATA_FILE = path.join(tmpDir, 'gate_data.json');
process.env.R2_OUTBOX_FILE = path.join(tmpDir, 'r2-outbox.json');
// TOKEN 必须在 require lib/config.js 之前设好:后台 token 直传这一支要在任何机器上可判定地通过
const TEST_TOKEN = 'wb-test-token-' + crypto.randomBytes(4).toString('hex');
process.env.TOKEN = TEST_TOKEN;

const chatVisionMock = vi.fn();
const stubModule = (rel, exports) => {
  const id = nodeRequire.resolve(rel);
  nodeRequire.cache[id] = { id, filename: id, loaded: true, path: path.dirname(id), exports };
  return exports;
};
stubModule('../../lib/aichannels.js', {
  chatVision: chatVisionMock,
  chatText: vi.fn(),
  synthTts: vi.fn(),
});
const r2PutMock = stubModule('../../lib/r2sync.js', {
  r2Put: vi.fn(() => Promise.resolve(true)),
  r2Delete: vi.fn(() => Promise.resolve(true)),
  r2Stats: () => ({ ok: 0, fail: 0, retry: 0 }),
}).r2Put;

const { ROOT } = nodeRequire('../../lib/config.js');
const { gateData, saveGateData } = nodeRequire('../../lib/store.js');
gateData.uploads = gateData.uploads || {};
gateData.photoCaptions = gateData.photoCaptions || {};
gateData.alerts = gateData.alerts || [];
gateData.applicants = gateData.applicants || {};
const { handleUpload, newWhiteboardName } = nodeRequire('../../lib/files-upload.js');
const abuse = nodeRequire('../../lib/abuse.js');
const { ROUTES } = nodeRequire('../../lib/routes.js');

const PHOTOS = path.join(ROOT, 'photos');
const TAG = 'lib-wb-overwrite-';
const UA_JIA = TAG + 'ua-jia';
const UA_YI = TAG + 'ua-yi';
const VID_A = 'vid-A-' + TAG;
const VID_B = 'vid-B-' + TAG;

// 路由 guard 是白板这条路的另一半(名字形态);直接吃 routes.js 里的真 guard,别在测试里抄一份正则
const wbGuard = (
  ROUTES.find(
    (r) =>
      r.method === 'POST' &&
      r.match === '/api/upload' &&
      r.guard &&
      String(r.guard).includes('whiteboard')
  ) || {}
).guard;

// ---------- 假 req/res(照 lib-upload-overwrite.test.js 的形状,补 setHeader 记录) ----------
function fakeRes() {
  const res = new Writable({
    write(chunk, enc, cb) {
      res.chunks.push(chunk);
      cb();
    },
  });
  res.chunks = [];
  res.code = 0;
  res.headers = null;
  res.sentHeaders = {};
  res.writeHead = (code, headers) => {
    res.code = code;
    res.headers = headers;
    return res;
  };
  res.setHeader = (k, v) => {
    res.sentHeaders[String(k).toLowerCase()] = v;
    return res;
  };
  res.getHeader = (k) => res.sentHeaders[String(k).toLowerCase()];
  res.json = () => {
    try {
      return JSON.parse(Buffer.concat(res.chunks).toString());
    } catch {
      return null;
    }
  };
  return res;
}
function waitRes(res) {
  return new Promise((r) => res.on('finish', r).on('close', r));
}
function saveReq(body, { ua = UA_JIA, vid = null, token = null, headers = {} } = {}) {
  const h = { 'user-agent': ua, 'content-length': String(Buffer.byteLength(body)), ...headers };
  if (vid) h.cookie = 'vid=' + vid;
  if (token) h['x-token'] = token;
  const req = new Readable({ read() {} });
  req.headers = h;
  req.socket = { remoteAddress: '203.0.113.40' }; // 公网来源:未配 TOKEN 时的"仅本地写权"不会被误触发
  req.push(body);
  req.push(null);
  return req;
}
// 白板保存一律走路由的公开条目(handleUpload 第 4 参 isPublic 不传 = 非公开分支)
const createdFiles = []; // 服务端签发名不带 TAG,必须逐条登记才能扫干净(绝不在仓库 photos/ 里留测试产物)
function trackResult(res, dir = 'photos') {
  const data = res.json() || {};
  if ((res.code === 201 || res.code === 202) && typeof data.name === 'string') {
    createdFiles.push(path.join(ROOT, dir, data.name));
  }
  return data;
}
async function save(body, opts = {}, query = null) {
  const req = saveReq(body, opts);
  const res = fakeRes();
  const asked = opts.name || proposeName();
  const q = query || { dir: 'photos', name: asked };
  handleUpload(req, res, q);
  await waitRes(res);
  trackResult(res, q.dir);
  return { res, req, body };
}
let seqNo = 0;
const uniq = () => `${TAG}${Date.now().toString(36)}-${(seqNo++).toString(36)}`;
// 老版前端会自己拼这样一个名字(本页现在仍然这么拟,只是服务端会换成它签发的名字)
const proposeName = () => `whiteboard-${uniq()}.png`;
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
// 只数"服务端签发形态"的文件:仓库 photos/ 是全套件共用的,数总数会被并行套件抖来抖去(2026-10-11 假红同型)
const issuedCount = () =>
  fs.readdirSync(PHOTOS).filter((f) => /^whiteboard-\d{8}-\d{6}-[0-9a-f]{8}\.png$/.test(f)).length;
const trackFile = (p) => {
  createdFiles.push(p);
  return p;
};

// ---------- 访客档案:两个都有效的会话(不带 sess ⇒ 走"存量档案无会话视为有效"的兼容护栏) ----------
function seedVisitors() {
  gateData.applicants[VID_A] = { id: VID_A, status: 'approved', answer: '甲' };
  gateData.applicants[VID_B] = { id: VID_B, status: 'approved', answer: '乙' };
}

let snap;
beforeAll(() => {
  fs.mkdirSync(PHOTOS, { recursive: true });
  expect(typeof wbGuard).toBe('function'); // 路由 guard 找不到就说明契约变了,本文件全部失效
});
beforeEach(() => {
  delete process.env.NSFW_MODERATE;
  chatVisionMock.mockReset().mockResolvedValue({ text: 'PASS' });
  r2PutMock.mockClear();
  seedVisitors();
  snap = JSON.stringify({
    uploads: gateData.uploads,
    applicants: gateData.applicants,
    alerts: gateData.alerts,
  });
  // 磁盘与总量走可控读数:本文件只测归属闸门,不测水位(水位在 lib-disk-guard.test.js 钉)
  abuse._resetUploadSlots();
  abuse._setDiskFreeBytes(64 * 1024 * 1024 * 1024);
  abuse._setMediaBytes(0);
});
afterEach(() => {
  const s = JSON.parse(snap);
  gateData.uploads = s.uploads;
  gateData.applicants = s.applicants;
  gateData.alerts = s.alerts;
  abuse._resetUploadSlots();
  for (const p of createdFiles.splice(0, createdFiles.length)) {
    try {
      fs.unlinkSync(p);
    } catch {}
  }
  try {
    saveGateData();
  } catch {}
});
afterAll(() => {
  for (const p of createdFiles.splice(0, createdFiles.length)) {
    try {
      fs.unlinkSync(p);
    } catch {}
  }
  try {
    for (const f of fs.readdirSync(PHOTOS))
      if (f.includes(TAG)) fs.unlinkSync(path.join(PHOTOS, f));
  } catch {}
});

describe('DG-SEC-001 服务端签发作品名', () => {
  it('甲新建:201 + 名字由服务端签发(不是前端拼的) + 归属 aid=本人 vid + 内容落盘', async () => {
    const asked = proposeName();
    const { res } = await save(Buffer.from('JIA-ORIGINAL'), {
      vid: VID_A,
      ua: UA_JIA,
      name: asked,
    });
    expect(res.code).toBe(201);
    const issued = res.json().name;
    expect(issued).toBeTruthy();
    expect(issued).not.toBe(asked); // 名字是服务端给的,前端拼的那一个从未被采用
    expect(res.json().issued).toBe(true);
    expect(wbGuard({ query: { name: issued } })).toBe(true); // 签发名必须仍在路由 guard 白名单内
    expect(/\.png$/i.test(issued)).toBe(true);
    const p = path.join(PHOTOS, issued);
    expect(fs.readFileSync(p, 'utf8')).toBe('JIA-ORIGINAL');
    expect(gateData.uploads[issued].aid).toBe(VID_A);
    expect(typeof gateData.uploads[issued].mt).toBe('string');
    expect(gateData.uploads[issued].dk).toBe(
      nodeRequire('../../lib/store.js').deviceKey(saveReq(Buffer.from('x'), { ua: UA_JIA }))
    );
    expect(gateData.uploads[asked]).toBeUndefined();
  });

  it('签发名形态:newWhiteboardName() 产出 whiteboard-<日期时间>-<随机>.png 且随机不重复', () => {
    const a = newWhiteboardName();
    const b = newWhiteboardName();
    expect(a).not.toBe(b);
    expect(/^whiteboard-\d{8}-\d{6}-[0-9a-f]{8}\.png$/.test(a)).toBe(true);
    expect(wbGuard({ query: { name: a } })).toBe(true);
  });

  it('甲用签发名重保存(合法覆盖自己):201、内容更新、aid 与 mt 不被换走、不多出一个文件', async () => {
    const first = await save(Buffer.from('V1'), { vid: VID_A, ua: UA_JIA, name: proposeName() });
    const issued = first.res.json().name;
    const recBefore = { ...gateData.uploads[issued] };
    const countBefore = issuedCount();

    const second = await save(Buffer.from('V2-REPAINTED'), {
      vid: VID_A,
      ua: UA_JIA,
      name: issued,
    });
    expect(second.res.code).toBe(201);
    expect(second.res.json().name).toBe(issued);
    expect(second.res.json().overwritten).toBe(true);
    expect(fs.readFileSync(path.join(PHOTOS, issued), 'utf8')).toBe('V2-REPAINTED');
    expect(gateData.uploads[issued].aid).toBe(VID_A);
    expect(gateData.uploads[issued].mt).toBe(recBefore.mt); // 已分享出去的 ?mt= URL 不能因为重保存而失效
    expect(issuedCount()).toBe(countBefore); // 反复保存同一幅 = 覆盖,不是往墙上堆第二份
  });
});

describe('DG-SEC-001 他人覆盖被拒(判定在写入之前)', () => {
  async function seedJiaArt(body = 'JIA-ORIGINAL') {
    const { res } = await save(Buffer.from(body), { vid: VID_A, ua: UA_JIA, name: proposeName() });
    expect(res.code).toBe(201);
    return res.json().name;
  }

  it('乙(另一个有效会话,同一 UA 也一样)用甲的名字保存 → 409,原文件哈希与归属元数据一字不动', async () => {
    const issued = await seedJiaArt();
    const p = path.join(PHOTOS, issued);
    const hashBefore = sha(p);
    const recBefore = JSON.stringify(gateData.uploads[issued]);
    const keysBefore = Object.keys(gateData.uploads).length;

    const { res } = await save(Buffer.from('EVIL-REPLACEMENT'), {
      vid: VID_B,
      ua: UA_JIA, // 故意与甲同 UA:证明 dk 已经不是授权路径
      name: issued,
    });
    expect(res.code).toBe(409);
    expect(String(res.json().error)).toMatch(/不是你的作品/);
    expect(sha(p)).toBe(hashBefore);
    expect(fs.readFileSync(p, 'utf8')).toBe('JIA-ORIGINAL');
    expect(JSON.stringify(gateData.uploads[issued])).toBe(recBefore); // aid/mt/dk/ts/pending 都没被动
    expect(Object.keys(gateData.uploads).length).toBe(keysBefore); // 被拒的尝试不落新账
  });

  it('无 Cookie 请求尝试覆盖 → 401(未表明身份),原文件不变、不留半成品', async () => {
    const issued = await seedJiaArt();
    const p = path.join(PHOTOS, issued);
    const hashBefore = sha(p);
    const filesBefore = issuedCount();

    const { res } = await save(Buffer.from('NO-COOKIE'), { vid: null, name: issued });
    expect(res.code).toBe(401);
    expect(String(res.json().error)).toMatch(/有效的访客身份/);
    expect(sha(p)).toBe(hashBefore);
    expect(issuedCount()).toBe(filesBefore); // 零新增文件、零半成品
  });

  it('会话被吊销(档案过期/session 版本不符)后本人也不能覆盖 → 401,画仍在', async () => {
    const issued = await seedJiaArt();
    const now = Date.now();
    gateData.applicants[VID_A].sess = {
      issuedAt: now,
      lastSeen: now,
      expiresAt: now + 60000,
      authVersion: 0,
    };
    gateData.applicants[VID_A].authVersion = 1; // revokeSession 的形态:版本+1 ⇒ sess 永不匹配
    const { res } = await save(Buffer.from('AFTER-REVOKE'), { vid: VID_A, name: issued });
    expect(res.code).toBe(401);
    expect(fs.readFileSync(path.join(PHOTOS, issued), 'utf8')).toBe('JIA-ORIGINAL');
  });

  it('存量作品(文件在、无归属记录)匿名覆盖 → 409 且哈希不变:主人以前的画不受扰动', async () => {
    const legacy = `whiteboard-${uniq()}-legacy.png`;
    const p = trackFile(path.join(PHOTOS, legacy));
    fs.writeFileSync(p, 'MASTERS-OLD-PICTURE');
    expect(sha(p)).toBeTruthy();
    const { res } = await save(Buffer.from('HIJACK'), { vid: VID_A, name: legacy });
    expect(res.code).toBe(409);
    expect(fs.readFileSync(p, 'utf8')).toBe('MASTERS-OLD-PICTURE');
    expect(gateData.uploads[legacy]).toBeUndefined();
  });

  it('匿名侧不许借白板名写别的目录:dir=videos|music → 403,一个文件都不碰', async () => {
    for (const dir of ['videos', 'music']) {
      const name = `whiteboard-${uniq()}.png`;
      const { res } = await save(Buffer.from('X'), { vid: VID_A, name }, { dir, name });
      expect(res.code).toBe(403);
      expect(fs.existsSync(path.join(ROOT, dir, name))).toBe(false);
    }
  });
});

describe('DG-SEC-001 后台 token 直传语义不回退', () => {
  it('带 token 就能覆盖他人(含甲的)白板作品,且不被要求 aid 匹配', async () => {
    const { res } = await save(Buffer.from('JIA-V1'), { vid: VID_A, name: proposeName() });
    const issued = res.json().name;
    const admin = await save(Buffer.from('ADMIN-REPLACED'), { token: TEST_TOKEN, name: issued });
    expect(admin.res.code).toBe(201);
    expect(fs.readFileSync(path.join(PHOTOS, issued), 'utf8')).toBe('ADMIN-REPLACED');
    expect(admin.res.json().name).toBe(issued); // 后台自己挑的名字照用(不被服务端改名)
    expect(gateData.uploads[issued].aid).toBe(VID_A); // 后台直传不改写匿名归属(语义一字未变)
  });

  it('带 token 的新上传同样照用请求名(主人现有用法不变)', async () => {
    const name = `whiteboard-${uniq()}-admin.png`;
    const { res } = await save(Buffer.from('ADMIN-NEW'), { token: TEST_TOKEN, name });
    expect(res.code).toBe(201);
    expect(res.json().name).toBe(name);
    expect(fs.existsSync(path.join(PHOTOS, name))).toBe(true);
  });

  it('错误 token 不算后台直传:甲的名字照旧受归属保护(409),换个 UA 也一样', async () => {
    const first = await save(Buffer.from('JIA-V1'), { vid: VID_A, name: proposeName() });
    const issued = first.res.json().name;
    const { res } = await save(Buffer.from('FAKE'), {
      vid: VID_B,
      ua: UA_YI, // 乙自己的 UA:换设备换 UA 也越不过归属
      name: issued,
      headers: { 'x-token': 'wrong-token' },
    });
    expect(res.code).toBe(409);
    expect(fs.readFileSync(path.join(PHOTOS, issued), 'utf8')).toBe('JIA-V1');
  });
});

describe('DG-SEC-001 并发与归属落账', () => {
  it('同名双请求同时到达:甲的覆盖写入成功,乙同时打同一个名字必 409 且不交错', async () => {
    const seed = await save(Buffer.from('JIA-ORIGINAL'), { vid: VID_A, name: proposeName() });
    const issued = seed.res.json().name;
    const p = path.join(PHOTOS, issued);
    const hashBefore = sha(p);

    const reqJia = saveReq(Buffer.from('JIA-V2'), { vid: VID_A, name: issued });
    const resJia = fakeRes();
    const reqYi = saveReq(Buffer.from('YI-V2'), { vid: VID_B, name: issued });
    const resYi = fakeRes();
    handleUpload(reqJia, resJia, { dir: 'photos', name: issued });
    handleUpload(reqYi, resYi, { dir: 'photos', name: issued });
    await Promise.all([waitRes(resJia), waitRes(resYi)]);
    trackResult(resJia);
    trackResult(resYi);

    // 判定在开文件之前 ⇒ 谁先被 handleUpload 都无所谓:非属主必拒、属主必成
    expect(resJia.code).toBe(201);
    expect(resYi.code).toBe(409);
    expect(fs.readFileSync(p, 'utf8')).toBe('JIA-V2'); // 写入者只有甲一个
    expect(gateData.uploads[issued].aid).toBe(VID_A);
    expect(sha(p)).not.toBe(hashBefore);
  });

  it('两个访客同时新建:各拿一个不同的服务端签发名,互不覆盖(不会有一方被静默截断)', async () => {
    const a = saveReq(Buffer.from('AAA-PIECE'), { vid: VID_A, name: 'whiteboard-same-name.png' });
    const b = saveReq(Buffer.from('BBB-PIECE'), { vid: VID_B, name: 'whiteboard-same-name.png' });
    const ra = fakeRes();
    const rb = fakeRes();
    handleUpload(a, ra, { dir: 'photos', name: 'whiteboard-same-name.png' });
    handleUpload(b, rb, { dir: 'photos', name: 'whiteboard-same-name.png' });
    await Promise.all([waitRes(ra), waitRes(rb)]);
    trackResult(ra);
    trackResult(rb);

    expect(ra.code).toBe(201);
    expect(rb.code).toBe(201);
    const na = ra.json().name;
    const nb = rb.json().name;
    expect(na).not.toBe(nb);
    expect(fs.readFileSync(path.join(PHOTOS, na), 'utf8')).toBe('AAA-PIECE');
    expect(fs.readFileSync(path.join(PHOTOS, nb), 'utf8')).toBe('BBB-PIECE');
    expect(gateData.uploads[na].aid).toBe(VID_A);
    expect(gateData.uploads[nb].aid).toBe(VID_B);
  });

  it('归属落账在 uploads[name].aid:公开分支同款字段,后台据此认作者', async () => {
    const { res } = await save(Buffer.from('AUDIT'), { vid: VID_A, name: proposeName() });
    const issued = res.json().name;
    const rec = gateData.uploads[issued];
    expect(Object.keys(rec).sort().join(',')).toBe('aid,dk,mt,ts');
    expect(rec.aid).toBe(VID_A);
  });
});

describe('DG-SEC-001 pending 语义不被削弱', () => {
  it('审核通道开启却拿不到结论 → 202 + uploads[签发名].pending + 文件保留 + 不镜像 CDN', async () => {
    process.env.NSFW_MODERATE = '1';
    chatVisionMock.mockResolvedValue(null);
    const name = proposeName();
    const { res } = await save(Buffer.alloc(200, 0x66), { vid: VID_A, name });
    expect(res.code).toBe(202);
    expect(res.json().pending).toBe(true);
    const issued = res.json().name;
    const p = path.join(PHOTOS, issued);
    expect(fs.existsSync(p)).toBe(true); // 拒的是"上墙",不是"留档"(数据保留铁律)
    expect(gateData.uploads[issued].pending).toBeTruthy();
    expect(gateData.uploads[issued].aid).toBe(VID_A); // 待审状态也要有归属,本人才能继续改这一幅
    expect(r2PutMock).not.toHaveBeenCalled();
    fs.unlinkSync(p);
  });

  it('待审作品不上墙(决策表单一源):pending 排在"按名字公开"之前短路', async () => {
    const MR = await import('../../src/shared/mediarules.mjs');
    expect(MR.serveDecision({ dir: 'photos', base: 'whiteboard-x.png' })).toEqual({
      allow: true,
      pub: true,
    });
    expect(MR.serveDecision({ dir: 'photos', base: 'whiteboard-x.png', pending: 1 })).toEqual({
      allow: false,
      pub: false,
    });
  });

  it('本人重画且审核通过 → 201 且 pending 被摘掉(重画即重审)', async () => {
    process.env.NSFW_MODERATE = '1';
    chatVisionMock.mockResolvedValue(null);
    const first = await save(Buffer.alloc(120, 0x33), { vid: VID_A, name: proposeName() });
    expect(first.res.code).toBe(202);
    const issued = first.res.json().name;
    expect(gateData.uploads[issued].pending).toBeTruthy();

    chatVisionMock.mockResolvedValue({ text: 'PASS' });
    const again = await save(Buffer.alloc(140, 0x44), { vid: VID_A, name: issued });
    expect(again.res.code).toBe(201);
    expect(gateData.uploads[issued].pending).toBeUndefined();
    expect(gateData.uploads[issued].aid).toBe(VID_A);
    fs.unlinkSync(path.join(PHOTOS, issued));
  });
});
