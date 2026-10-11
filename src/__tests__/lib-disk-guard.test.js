// lib-disk-guard.test.js — 全局容量与磁盘水位硬闸(2026-10-12 DG-SEC-005)
// 钉住:
//   ① 目标盘剩余低于 DISK_MIN_FREE ⇒ 新的公开上传与白板上传 503(带 Retry-After),零写盘;
//      后台 token 直传仍可写(主人自己要传,也只有他能清盘);
//   ② 媒体总量超 DISK_MAX ⇒ 同样只拒新增匿名上传,而 abuseCheck 的 'storage' 预警照旧落账(不回退);
//   ③ 进程内在途写盘硬闸 UPLOAD_MAX_INFLIGHT:满了拒新的匿名上传,释放一个就恢复;
//   ④ 单次上传预留字节累加超总预算即拒(4 个 700MB 同时进来打不穿盘),释放后可继续;
//   ⑤ 在途计数绝不泄漏:成功 / 同名 409 / 超体积预检 429 / 审核违规 422 / 客户端断连 之后都必须归零;
//   ⑥ fs.statfsSync 不存在时的降级路径不崩、不拦(只用目录总量闸),并告警一次;
//   ⑦ 分片通道同样过水位与在途闸(首片即判,且拒绝时不留 .part 残片)。
// 约定同 lib-upload-overwrite.test.js:lib/*.js 走 createRequire,r2sync/aichannels 先打 require.cache 桩。
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-disk-'));
process.env.GATE_DATA_FILE = path.join(tmpDir, 'gate_data.json');
process.env.R2_OUTBOX_FILE = path.join(tmpDir, 'r2-outbox.json');
process.env.CHUNK_DIR = path.join(tmpDir, 'chunks'); // 别把分片残片写进仓库的 .chunks/
const TEST_TOKEN = 'disk-test-token-' + Math.random().toString(36).slice(2, 8);
process.env.TOKEN = TEST_TOKEN; // require lib/config.js 之前设好:后台 token 分支在任何机器上可判定

const stubModule = (rel, exports) => {
  const id = nodeRequire.resolve(rel);
  nodeRequire.cache[id] = { id, filename: id, loaded: true, path: path.dirname(id), exports };
  return exports;
};
const chatVisionMock = stubModule('../../lib/aichannels.js', {
  chatVision: vi.fn(),
  chatText: vi.fn(),
  synthTts: vi.fn(),
}).chatVision;
stubModule('../../lib/r2sync.js', {
  r2Put: vi.fn(() => Promise.resolve(true)),
  r2Delete: vi.fn(() => Promise.resolve(true)),
  r2Stats: () => ({ ok: 0, fail: 0, retry: 0 }),
});

const { ROOT } = nodeRequire('../../lib/config.js');
const { gateData, saveGateData } = nodeRequire('../../lib/store.js');
gateData.uploads = gateData.uploads || {};
gateData.photoCaptions = gateData.photoCaptions || {};
gateData.alerts = gateData.alerts || [];
gateData.applicants = gateData.applicants || {};
const { handleUpload, handleUploadChunk } = nodeRequire('../../lib/files-upload.js');
const abuse = nodeRequire('../../lib/abuse.js');

const PHOTOS = path.join(ROOT, 'photos');
const GB = 1024 * 1024 * 1024;
const TAG = 'lib-disk-guard-';
let seqNo = 0;
const uniq = () => `${TAG}${Date.now().toString(36)}-${(seqNo++).toString(36)}`;

function fakeRes() {
  const res = new Writable({
    write(chunk, enc, cb) {
      res.chunks.push(chunk);
      cb();
    },
  });
  res.chunks = [];
  res.code = 0;
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
function bodyReq(body, { ua = TAG + 'ua', vid = null, token = null, headers = {} } = {}) {
  const len = body === null || body === undefined ? '0' : String(Buffer.byteLength(body));
  const h = { 'user-agent': ua, 'content-length': len, ...headers };
  if (vid) h.cookie = 'vid=' + vid;
  if (token) h['x-token'] = token;
  const req = new Readable({ read() {} });
  req.headers = h;
  req.socket = { remoteAddress: '203.0.113.40' };
  if (body !== null) {
    req.push(body);
    req.push(null);
  }
  return req;
}
// 公开分支直传(isPublic=true,与 lib/routes.js 的公开上传条目一致)
async function pubUpload(name, body, opts = {}) {
  const res = fakeRes();
  handleUpload(bodyReq(body, opts), res, { dir: 'photos', name }, true);
  await waitRes(res);
  return res;
}
const slots = () => abuse.uploadSlotStats();
const noLeaks = () => {
  expect(slots().inflight).toBe(0);
  expect(slots().reserved).toBe(0);
};

const created = [];
const track = (p) => {
  created.push(p);
  return p;
};
const VID = 'vid-disk-' + TAG;

let snap;
beforeAll(() => {
  fs.mkdirSync(PHOTOS, { recursive: true });
  fs.mkdirSync(process.env.CHUNK_DIR, { recursive: true });
});
beforeEach(() => {
  delete process.env.NSFW_MODERATE;
  chatVisionMock.mockReset().mockResolvedValue({ text: 'PASS' });
  gateData.applicants[VID] = { id: VID, status: 'approved' };
  snap = JSON.stringify({
    uploads: gateData.uploads,
    alerts: gateData.alerts,
    applicants: gateData.applicants,
  });
  abuse._resetUploadSlots();
  abuse._setDiskFreeBytes(64 * GB); // 默认可盘充足:各用例按需把水位调低
  abuse._setMediaBytes(0);
});
afterEach(() => {
  const s = JSON.parse(snap);
  gateData.uploads = s.uploads;
  gateData.alerts = s.alerts;
  gateData.applicants = s.applicants;
  abuse._resetUploadSlots();
  try {
    saveGateData();
  } catch {}
  for (const p of created.splice(0, created.length)) {
    try {
      fs.unlinkSync(p);
    } catch {}
  }
});
afterAll(() => {
  for (const p of created.splice(0, created.length)) {
    try {
      fs.unlinkSync(p);
    } catch {}
  }
  try {
    for (const f of fs.readdirSync(PHOTOS))
      if (f.includes(TAG)) fs.unlinkSync(path.join(PHOTOS, f));
  } catch {}
  try {
    for (const f of fs.readdirSync(process.env.CHUNK_DIR))
      fs.unlinkSync(path.join(process.env.CHUNK_DIR, f));
  } catch {}
});

describe('DG-SEC-005 常量与默认值', () => {
  it('默认:水位 2GB、在途 4、总预算 10GB,且带 Retry-After', () => {
    expect(abuse.DISK_MIN_FREE).toBe(2 * GB);
    expect(abuse.UPLOAD_MAX_INFLIGHT).toBe(4);
    expect(abuse.DISK_MAX).toBe(10 * GB);
    expect(abuse.RETRY_AFTER_S).toBeGreaterThan(0);
    expect(abuse.SLOT_RESERVE_FALLBACK).toBeGreaterThan(0);
  });

  it('水位低于在途上限可以按声明体积预约(预留闸先于写盘)', () => {
    const g = abuse.reserveUploadSlot('public', 1024, PHOTOS);
    expect(g.allow).toBe(true);
    expect(slots().inflight).toBe(1);
    g.done();
    expect(slots().inflight).toBe(0);
  });
});

describe('DG-SEC-005 磁盘水位硬闸', () => {
  it('剩余 1GB(<2GB)⇒ 匿名公开上传 503 + Retry-After + reason=lowdisk,零写盘', () => {
    abuse._setDiskFreeBytes(1 * GB);
    const name = uniq() + '.jpg';
    const p = path.join(PHOTOS, name);
    const res = fakeRes();
    handleUpload(
      bodyReq(Buffer.alloc(2048, 0x41), { ua: TAG + 'a' }),
      res,
      { dir: 'photos', name },
      true
    );
    expect(res.code).toBe(503);
    expect(res.json().reason).toBe('lowdisk');
    expect(String(res.sentHeaders['retry-after'])).toBe(String(abuse.RETRY_AFTER_S));
    expect(fs.existsSync(p)).toBe(false); // 拒绝发生在打开文件之前
    noLeaks();
  });

  it('同一水位下 700MB 级请求按"剩余-本次体积"判(剩 3GB 也放不下 2GB 的单子)', () => {
    abuse._setDiskFreeBytes(3 * GB);
    expect(abuse.reserveUploadSlot('public', 2 * GB, PHOTOS).allow).toBe(false);
    const ok = abuse.reserveUploadSlot('public', 500 * 1024 * 1024, PHOTOS);
    expect(ok.allow).toBe(true);
    ok.done();
    noLeaks();
  });

  it('白板(匿名)同样受水位闸约束:503 且一个文件都不落', async () => {
    abuse._setDiskFreeBytes(1024 * 1024); // 1MB,远低于水位
    const res = await (async () => {
      const r = fakeRes();
      handleUpload(bodyReq(Buffer.alloc(64, 0x42), { vid: VID }), r, {
        dir: 'photos',
        name: 'whiteboard-' + uniq() + '.png',
      });
      await waitRes(r);
      return r;
    })();
    expect(res.code).toBe(503);
    expect(res.json().reason).toBe('lowdisk');
    expect(fs.readdirSync(PHOTOS).filter((f) => f.includes(TAG))).toEqual([]);
    noLeaks();
  });

  it('低水位下后台 token 直传仍可写(201),日志/响应不装作拦住了', async () => {
    abuse._setDiskFreeBytes(1024 * 1024);
    const name = uniq() + '.jpg';
    const p = track(path.join(PHOTOS, name));
    const res = fakeRes();
    handleUpload(bodyReq(Buffer.alloc(64, 0x43), { token: TEST_TOKEN }), res, {
      dir: 'photos',
      name,
    });
    await waitRes(res);
    expect(res.code).toBe(201);
    expect(fs.existsSync(p)).toBe(true);
    noLeaks();
  });
});

describe('DG-SEC-005 总预算与预留', () => {
  it('媒体总量超 DISK_MAX ⇒ 新增匿名公开上传 503(reason=capacity),后台仍可写', async () => {
    abuse._setMediaBytes(abuse.DISK_MAX + GB);
    const pubRes = fakeRes();
    handleUpload(
      bodyReq(Buffer.alloc(64, 0x44), { ua: TAG + 'cap' }),
      pubRes,
      { dir: 'photos', name: uniq() + '.jpg' },
      true
    );
    expect(pubRes.code).toBe(503);
    expect(pubRes.json().reason).toBe('capacity');

    const adminName = uniq() + '.jpg';
    const adminPath = track(path.join(PHOTOS, adminName));
    const adminRes = fakeRes();
    handleUpload(bodyReq(Buffer.alloc(64, 0x45), { token: TEST_TOKEN }), adminRes, {
      dir: 'photos',
      name: adminName,
    });
    await waitRes(adminRes);
    expect(adminRes.code).toBe(201);
    expect(fs.existsSync(adminPath)).toBe(true);
    noLeaks();
  });

  it('超总预算时 abuseCheck 的 storage 预警照旧落账(既有能力不回退)', () => {
    abuse._setMediaBytes(abuse.DISK_MAX + 2 * GB);
    gateData.uploads['a.jpg'] = { dk: TAG + 'dk', ts: Date.now() };
    abuse.abuseCheck(TAG + 'dk', 'a.jpg', 1024);
    const alerts = (gateData.alerts || []).filter((a) => a.type === 'storage' && !a.dismissed);
    expect(alerts.length).toBe(1);
    expect(String(alerts[0].detail)).toMatch(/超过 10GB/);
  });

  it('在途预留累加超阈值即拒:4 个 700MB 挤不进 10GB 预算,释放后恢复', () => {
    const a = abuse.reserveUploadSlot('public', 6 * GB, PHOTOS);
    expect(a.allow).toBe(true);
    const b = abuse.reserveUploadSlot('public', 5 * GB, PHOTOS);
    expect(b.allow).toBe(false);
    expect(b.reason).toBe('capacity');
    a.done();
    const c = abuse.reserveUploadSlot('public', 5 * GB, PHOTOS);
    expect(c.allow).toBe(true);
    c.done();
    noLeaks();
  });
});

describe('DG-SEC-005 在途写盘硬闸', () => {
  it('在途达上限 ⇒ 下一个匿名上传 503(reason=inflight);释放一个立刻恢复', async () => {
    const held = [];
    for (let i = 0; i < abuse.UPLOAD_MAX_INFLIGHT; i++)
      held.push(abuse.reserveUploadSlot('public', 1024, PHOTOS));
    expect(slots().inflight).toBe(abuse.UPLOAD_MAX_INFLIGHT);

    const name = uniq() + '.jpg';
    const p = path.join(PHOTOS, name);
    const res = await pubUpload(name, Buffer.alloc(64, 0x46), { ua: TAG + 'full' });
    expect(res.code).toBe(503);
    expect(res.json().reason).toBe('inflight');
    expect(fs.existsSync(p)).toBe(false);

    held.shift().done();
    const okPath = track(path.join(PHOTOS, name));
    const again = await pubUpload(name, Buffer.alloc(64, 0x47), { ua: TAG + 'full' });
    expect(again.code).toBe(201);
    expect(fs.existsSync(okPath)).toBe(true);
    held.forEach((h) => h.done());
    noLeaks();
  });

  it('done() 幂等:同一路径被多条结束路径调用也不会把计数打成负数或漏还', () => {
    const g = abuse.reserveUploadSlot('public', 4096, PHOTOS);
    g.done();
    g.done();
    expect(abuse.releaseUploadSlot(g.id)).toBe(false); // 还不存在的位 = 不动账
    expect(slots().inflight).toBe(0);
    expect(slots().reserved).toBe(0);
  });

  it('计数不泄漏:成功/同名 409/超单文件预检 429/审核违规 422 之后在途都归零', async () => {
    const name = uniq() + '.jpg';
    const okPath = track(path.join(PHOTOS, name));
    expect((await pubUpload(name, Buffer.alloc(64, 0x48))).code).toBe(201);
    noLeaks();

    // 同名再来一次 ⇒ 'wx' 独占创建必 409,同样不留在途账
    expect((await pubUpload(name, Buffer.alloc(64, 0x49))).code).toBe(409);
    expect(fs.existsSync(okPath)).toBe(true);
    noLeaks();

    // 单文件超 300MB:Content-Length 预检即拒(在占位之前)——videos 上限 700MB,所以走到反刷闸
    const bigRes = fakeRes();
    handleUpload(
      bodyReq(null, { ua: TAG + 'ua', headers: { 'content-length': String(301 * 1024 * 1024) } }),
      bigRes,
      { dir: 'videos', name: uniq() + '.mp4' },
      true
    );
    expect(bigRes.code).toBe(429);
    noLeaks();

    // 审核判违规 ⇒ 删文件 + 422,位在写盘完成时已还
    process.env.NSFW_MODERATE = '1';
    chatVisionMock.mockResolvedValue({ text: 'BLOCK' });
    expect((await pubUpload(uniq() + '.png', Buffer.alloc(64, 0x4a))).code).toBe(422);
    noLeaks();
  });

  it('客户端断连也还位:body 永不结束时占一个位,req.destroy() 后归零', async () => {
    const req = bodyReq(null, { ua: TAG + 'abort' });
    req.headers['content-length'] = '64';
    const res = fakeRes();
    handleUpload(req, res, { dir: 'photos', name: uniq() + '.jpg' }, true);
    req.push(Buffer.alloc(16, 0x4b));
    await new Promise((r) => setImmediate(r));
    expect(slots().inflight).toBe(1); // 正在写,确实占着一个位
    req.destroy();
    await new Promise((r) => setImmediate(r));
    expect(slots().inflight).toBe(0); // 断连路径也释放(不留永久泄漏)
    expect(slots().reserved).toBe(0);
  });

  it('兜底闸:漏还的位在 SLOT_MAX_AGE_MS 之后被自动回收(账本永不永久卡死)', () => {
    const leaked = abuse.reserveUploadSlot('public', 1024, PHOTOS); // 故意不 done():模拟"结束路径漏还"
    expect(leaked.allow).toBe(true);
    expect(slots().inflight).toBe(1);
    const real = Date.now;
    try {
      Date.now = () => real() + abuse.SLOT_MAX_AGE_MS + 60 * 1000; // 时间往前推,模拟漏还的旧位
      const probe = abuse.reserveUploadSlot('admin', 1024, PHOTOS); // 任何一次调用都会顺手回收
      expect(probe.allow).toBe(true);
      expect(slots().inflight).toBe(1); // 只剩这次新占的,漏还的那个已被回收
      probe.done();
    } finally {
      Date.now = real;
    }
    noLeaks();
  });
});

describe('DG-SEC-005 降级与分片通道', () => {
  it('fs.statfsSync 不可用 ⇒ 水位读数 null、不崩、匿名上传仍放行,并告警一次', () => {
    const nodeFs = nodeRequire('fs');
    const real = nodeFs.statfsSync;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      delete nodeFs.statfsSync;
      abuse._resetUploadSlots();
      expect(abuse.diskFreeBytes(PHOTOS)).toBeNull();
      const g = abuse.reserveUploadSlot('public', 1024, PHOTOS);
      expect(g.allow).toBe(true);
      expect(warn.mock.calls.some((c) => /statfsSync/.test(String(c[0])))).toBe(true);
      g.done();
    } finally {
      nodeFs.statfsSync = real;
      warn.mockRestore();
      abuse._resetUploadSlots();
    }
    noLeaks();
  });

  it('statfsSync 抛异常(权限/路径问题)也不崩,返回 null 走降级', () => {
    const nodeFs = nodeRequire('fs');
    const real = nodeFs.statfsSync;
    abuse._resetUploadSlots(); // 清掉 beforeEach 的强制读数,这一条要的就是"真去量一次"
    try {
      nodeFs.statfsSync = () => {
        throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
      };
      expect(abuse.diskFreeBytes(PHOTOS)).toBeNull();
      const g = abuse.reserveUploadSlot('public', 1024, PHOTOS);
      expect(g.allow).toBe(true); // 量不到 = 不因"测不准"冤枉访客,降级只用总量闸
      g.done();
    } finally {
      nodeFs.statfsSync = real;
      abuse._resetUploadSlots();
    }
    noLeaks();
  });

  it('分片通道首片同样过水位闸:503 且不落 .part 残片', async () => {
    abuse._setDiskFreeBytes(1024 * 1024);
    const name = uniq() + '.jpg';
    const res = fakeRes();
    handleUploadChunk(bodyReq(Buffer.alloc(64, 0x4c), { ua: TAG + 'chunk' }), res, {
      dir: 'photos',
      name,
      seq: '0',
      total: '2',
    });
    await waitRes(res);
    expect(res.code).toBe(503);
    expect(res.json().reason).toBe('lowdisk');
    expect(fs.readdirSync(process.env.CHUNK_DIR).filter((f) => f.includes(name))).toEqual([]);
    noLeaks();
  });

  it('分片通道:在途写盘满 ⇒ 首片 503(reason=inflight);水位与总预算闸对分片一样生效', () => {
    const held = [];
    for (let i = 0; i < abuse.UPLOAD_MAX_INFLIGHT; i++)
      held.push(abuse.reserveUploadSlot('public', 1024, PHOTOS));
    const res = fakeRes();
    handleUploadChunk(bodyReq(Buffer.alloc(64, 0x4d), { ua: TAG + 'chunk2' }), res, {
      dir: 'photos',
      name: uniq() + '.jpg',
      seq: '0',
      total: '2',
    });
    expect(res.code).toBe(503);
    expect(res.json().reason).toBe('inflight');
    held.forEach((h) => h.done());
    noLeaks();
  });
});
