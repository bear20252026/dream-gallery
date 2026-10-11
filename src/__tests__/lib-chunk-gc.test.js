// lib-chunk-gc.test.js — 分片上传的残片回收与在途配额(2026-10-11 DG-UP-002)
// 钉住四件事:
//   ① 24h 龄期残片被周期清扫(过期删、未过期留),GC 句柄可启停(unref,不拖住进程退出);
//   ② 在途配额:首片按 IP 记并发数与体积投影,超限 503;合并/失败一律释放记账;
//   ③ 体积上限前移:首片按声明片数算下限即拒 413,不再靠末片算总账(也不误杀合法的 700MB 视频);
//   ④ 每片累计实字节超限即时 413 并清掉本上传已落分片(此前 4000 片可以一路写满 1.5GB 才拒)。
// CHUNK_DIR 走 process.env 重定向到系统临时目录:测试绝不往仓库 .chunks/ 里写东西。
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);
const CHUNK_TEST_DIR = path.join(os.tmpdir(), 'dg-chunk-test-' + Date.now().toString(36));
fs.mkdirSync(CHUNK_TEST_DIR, { recursive: true });
process.env.CHUNK_DIR = CHUNK_TEST_DIR; // 必须在 require files-upload 之前

const r2syncId = nodeRequire.resolve('../../lib/r2sync.js');
nodeRequire.cache[r2syncId] = {
  id: r2syncId,
  filename: r2syncId,
  loaded: true,
  path: path.dirname(r2syncId),
  exports: {
    r2Put: vi.fn(() => Promise.resolve(true)),
    r2Delete: vi.fn(() => Promise.resolve(true)),
  },
};

const { ROOT } = nodeRequire('../../lib/config.js');
const { gateData, saveGateData } = nodeRequire('../../lib/store.js');
const fu = nodeRequire('../../lib/files-upload.js');
const {
  handleUploadChunk,
  sweepStaleChunks,
  startChunkGc,
  stopChunkGc,
  chunkGcOn,
  inflightStats,
  _resetChunkState,
  CHUNK_STALE_MS,
  CHUNK_NOMINAL_BYTES,
  INFLIGHT_MAX_UPLOADS_PER_IP,
} = fu;

const PHOTOS = path.join(ROOT, 'photos');
const TAG = 'lib-chunk-gc-';
let seqNo = 0;
const uniq = () => `${TAG}${Date.now().toString(36)}-${(seqNo++).toString(36)}`;

// ---------- 假 req/res ----------
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
  res.writeHead = (code, headers) => {
    res.code = code;
    res.headers = headers;
    return res;
  };
  res.setHeader = () => res;
  res.json = () => {
    try {
      return JSON.parse(Buffer.concat(res.chunks).toString());
    } catch {
      return null;
    }
  };
  return res;
}
const waitRes = (res) => new Promise((r) => res.on('finish', r).on('close', r));
// socket=127.0.0.1 ⇒ store.realIP 信任 cf-connecting-ip(可信反代语义),可按 IP 分桶
const proxied = (ip, chunk, headers) => {
  const req = new Readable({ read() {} });
  req.headers = {
    'user-agent': TAG + 'ua',
    'cf-connecting-ip': ip,
    'content-length': String(chunk.length),
    ...(headers || {}),
  };
  req.socket = { remoteAddress: '127.0.0.1' };
  req.push(chunk);
  req.push(null);
  return req;
};
// 单片请求:query 齐(dir/name/seq/total)+ body=该片字节
function chunkReq({
  dir = 'photos',
  name,
  seq,
  total,
  chunk = Buffer.from('x'),
  ip = '203.0.113.7',
}) {
  const res = fakeRes();
  handleUploadChunk(proxied(ip, chunk), res, { dir, name, seq: String(seq), total: String(total) });
  return waitRes(res).then(() => res);
}
const listChunkDir = () => {
  try {
    return fs.readdirSync(CHUNK_TEST_DIR);
  } catch {
    return [];
  }
};
const settleMs = (ms = 60) => new Promise((r) => setTimeout(r, ms));

const createdMedia = [];
async function waitUntil(pred, timeoutMs = 8000) {
  const t0 = Date.now();
  for (;;) {
    let v = false;
    try {
      v = !!pred();
    } catch {}
    if (v) return true;
    if (Date.now() - t0 > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 30));
  }
}

let snap;
beforeAll(() => {
  fs.mkdirSync(PHOTOS, { recursive: true });
  stopChunkGc(); // 用例期间不让周期 GC 与手工断言互相干扰
});
beforeEach(() => {
  delete process.env.NSFW_MODERATE;
  snap = JSON.stringify({
    uploads: gateData.uploads,
    photoCaptions: gateData.photoCaptions,
    alerts: gateData.alerts,
  });
  _resetChunkState();
  for (const f of listChunkDir()) {
    try {
      fs.unlinkSync(path.join(CHUNK_TEST_DIR, f));
    } catch {}
  }
});
afterEach(() => {
  const s = JSON.parse(snap);
  gateData.uploads = s.uploads;
  gateData.photoCaptions = s.photoCaptions;
  gateData.alerts = s.alerts;
  try {
    saveGateData();
  } catch {}
  for (const p of createdMedia.splice(0)) {
    try {
      fs.unlinkSync(p);
    } catch {}
  }
});
afterAll(() => {
  try {
    fs.rmSync(CHUNK_TEST_DIR, { recursive: true, force: true });
  } catch {}
  try {
    for (const f of fs.readdirSync(PHOTOS))
      if (f.startsWith(TAG)) fs.unlinkSync(path.join(PHOTOS, f));
  } catch {}
});

describe('DG-UP-002#1 残片周期清扫', () => {
  it('24h 龄期口径:过期残片被删,未过期保留', () => {
    const stale = path.join(CHUNK_TEST_DIR, 'stale-a.jpg.0.part');
    const fresh = path.join(CHUNK_TEST_DIR, 'fresh-a.jpg.0.part');
    fs.writeFileSync(stale, 'x');
    fs.writeFileSync(fresh, 'x');
    const old = new Date(Date.now() - (CHUNK_STALE_MS + 3600 * 1000));
    fs.utimesSync(stale, old, old);

    sweepStaleChunks();

    expect(fs.existsSync(stale)).toBe(false); // 过期 = 删
    expect(fs.existsSync(fresh)).toBe(true); // 未过期 = 留(正在续传的分片不能误杀)
  });

  it('清扫同时释放过期上传的在途记账(账本与磁盘同口径)', () => {
    const name = uniq() + '.jpg';
    // 手动造一笔陈旧账本:首片准入后不发后续片(真实攻击形态:只发首片就消失)
    return chunkReq({ name, seq: 0, total: 3, chunk: Buffer.alloc(1000) }).then((r) => {
      expect(r.code).toBe(200);
      expect(inflightStats().uploads).toBe(1);
      // 把账本推到过期龄期:直接改文件 mtime + 用未来时刻调 sweep(账本 ts 与文件同时判)
      const f = listChunkDir()[0];
      const old = new Date(Date.now() - (CHUNK_STALE_MS + 1000));
      fs.utimesSync(path.join(CHUNK_TEST_DIR, f), old, old);
      sweepStaleChunks(Date.now() + CHUNK_STALE_MS + 2000);
      expect(inflightStats().tracked).toBe(0);
      expect(inflightStats().uploads).toBe(0);
    });
  });

  it('GC 句柄可启停,且模块加载即已开启(此前唯一调用点在末片合并里)', () => {
    stopChunkGc();
    expect(chunkGcOn()).toBe(false);
    expect(startChunkGc()).toBe(true);
    expect(chunkGcOn()).toBe(true);
    expect(startChunkGc()).toBe(false); // 幂等:不重复起第二个定时器
    expect(stopChunkGc()).toBe(true);
    expect(chunkGcOn()).toBe(false);
    expect(stopChunkGc()).toBe(false);
    startChunkGc();
  });

  it('只发首片的攻击者不再留下永久残片(无需等到末片合并)', () => {
    const name = uniq() + '.jpg';
    return chunkReq({ name, seq: 0, total: 50, chunk: Buffer.alloc(2000) }).then((r) => {
      expect(r.code).toBe(200);
      expect(listChunkDir().length).toBe(1); // 残片已在暂存目录
      const f = listChunkDir()[0];
      const old = new Date(Date.now() - (CHUNK_STALE_MS + 1000));
      fs.utimesSync(path.join(CHUNK_TEST_DIR, f), old, old);
      sweepStaleChunks(); // 周期 GC 到点即可回收,攻击者不再能无限占盘
      expect(listChunkDir()).toEqual([]);
    });
  });
});

describe('DG-UP-002#3 体积上限前移(首片即拒)', () => {
  it('4000 片按 256KB 标称下限已超图片 50MB ⇒ 首片 413,一片都不落盘', () => {
    const name = uniq() + '.jpg';
    return chunkReq({ name, seq: 0, total: 4000, chunk: Buffer.alloc(10) }).then((r) => {
      expect(r.code).toBe(413);
      expect(listChunkDir()).toEqual([]); // 不消耗任何暂存空间
      expect(inflightStats().tracked).toBe(0);
    });
  });

  it('合法的 700MB 视频(2800×256KB)首片不被误杀(下限判定不用 total×400KB)', () => {
    const name = uniq() + '.mp4';
    expect((2800 - 1) * CHUNK_NOMINAL_BYTES + 1).toBeLessThan(
      700 * 1024 * 1024 + CHUNK_NOMINAL_BYTES
    );
    return chunkReq({ dir: 'videos', name, seq: 0, total: 2800, chunk: Buffer.alloc(10) }).then(
      (r) => {
        expect(r.code).toBe(200);
        expect(inflightStats().tracked).toBe(1);
      }
    );
  });

  it('片数上限仍是 4000:4001 片 → 400(序号不合法)', () => {
    const name = uniq() + '.jpg';
    return chunkReq({ name, seq: 0, total: 4001, chunk: Buffer.alloc(1) }).then((r) => {
      expect(r.code).toBe(400);
    });
  });
});

describe('DG-UP-002#2 在途配额(按 IP 记并发与体积)', () => {
  it(`同一 IP 第 ${INFLIGHT_MAX_UPLOADS_PER_IP + 1} 路在途上传 → 503,前 ${INFLIGHT_MAX_UPLOADS_PER_IP} 路放行`, async () => {
    const ip = '203.0.113.8';
    const codes = [];
    for (let i = 0; i <= INFLIGHT_MAX_UPLOADS_PER_IP; i++) {
      const r = await chunkReq({
        name: uniq() + '.jpg',
        seq: 0,
        total: 3,
        chunk: Buffer.from('x'),
        ip,
      });
      codes.push(r.code);
    }
    expect(codes.slice(0, INFLIGHT_MAX_UPLOADS_PER_IP)).toEqual(
      new Array(INFLIGHT_MAX_UPLOADS_PER_IP).fill(200)
    );
    expect(codes[codes.length - 1]).toBe(503);
    expect(inflightStats().uploads).toBe(INFLIGHT_MAX_UPLOADS_PER_IP);

    // 另一个 IP 不受牵连(配额是按 realIP 记的,不是全局封)
    const other = await chunkReq({
      name: uniq() + '.jpg',
      seq: 0,
      total: 3,
      chunk: Buffer.from('x'),
      ip: '198.51.100.9',
    });
    expect(other.code).toBe(200);
  });

  it('合并成功后记账归零(在途配额不被历史上传吃满)', async () => {
    const name = uniq() + '.jpg';
    const r0 = await chunkReq({ name, seq: 0, total: 1, chunk: Buffer.from('hello-chunk') });
    expect(r0.code).toBe(201);
    expect(inflightStats().tracked).toBe(0);
    expect(inflightStats().uploads).toBe(0);
    expect(listChunkDir()).toEqual([]);
    const finalPath = path.join(PHOTOS, name);
    createdMedia.push(finalPath);
    expect(fs.readFileSync(finalPath, 'utf8')).toBe('hello-chunk');
    expect(gateData.uploads[name]).toBeTruthy();
  });

  it('缺片(只发来首片与末片之间的空洞)合并失败也释放记账', async () => {
    const name = uniq() + '.jpg';
    const r0 = await chunkReq({ name, seq: 0, total: 3, chunk: Buffer.from('aa') });
    expect(r0.code).toBe(200);
    const r2 = await chunkReq({ name, seq: 2, total: 3, chunk: Buffer.from('cc') });
    expect(r2.code).toBe(409); // 分片不完整
    expect(inflightStats().tracked).toBe(0);
  });

  it('同名文件已存在:首片即 409,不落残片(与直传同规)', async () => {
    const name = uniq() + '.jpg';
    const p = path.join(PHOTOS, name);
    fs.writeFileSync(p, 'OTHER-EXHIBIT');
    createdMedia.push(p);
    const r = await chunkReq({ name, seq: 0, total: 3, chunk: Buffer.from('x') });
    expect(r.code).toBe(409);
    expect(fs.readFileSync(p, 'utf8')).toBe('OTHER-EXHIBIT');
    expect(listChunkDir()).toEqual([]);
  });
});

describe('DG-UP-002#3 每片累计实字节即时闸', () => {
  it('一路刷满 50MB 才拒?现在中途即 413 且清掉已落分片', async () => {
    const name = uniq() + '.jpg';
    const part = Buffer.alloc(400000, 0x5a); // 单片 400KB(仍低于 400*1024 上限)
    const total = 140; // 140×400KB ≈ 56MB > 图片 50MB 上限
    let rejected = null;
    let sent = 0;
    for (let i = 0; i < total; i++) {
      const r = await chunkReq({ name, seq: i, total, chunk: part });
      sent++;
      if (r.code !== 200 && r.code !== 201) {
        rejected = { seq: i, code: r.code };
        break;
      }
    }
    expect(rejected).toBeTruthy();
    expect(rejected.code).toBe(413);
    // 触发点应在 50MB 处,而不是等末片(139)才算总账
    expect(rejected.seq).toBeLessThan(total - 1);
    expect(sent).toBeLessThan(135);
    // 拒绝即清理:本上传的分片不留,记账也释放
    await waitUntil(() => listChunkDir().length === 0);
    expect(listChunkDir()).toEqual([]);
    expect(inflightStats().tracked).toBe(0);
    expect(fs.existsSync(path.join(PHOTOS, name))).toBe(false);
  });
});

describe('DG-FILE-001#3 分片合并禁覆盖原子化', () => {
  it('分片期间同名文件被别人抢注 ⇒ 末片 409,不覆盖对方文件也不留半成品', async () => {
    const name = uniq() + '.jpg';
    const r0 = await chunkReq({ name, seq: 0, total: 2, chunk: Buffer.from('AA') });
    expect(r0.code).toBe(200);
    const p = path.join(PHOTOS, name);
    fs.writeFileSync(p, 'SOMEONE-ELSE'); // 模拟另一请求/他人先落了同名文件
    createdMedia.push(p);
    const r1 = await chunkReq({ name, seq: 1, total: 2, chunk: Buffer.from('BB') });
    expect(r1.code).toBe(409);
    expect(fs.readFileSync(p, 'utf8')).toBe('SOMEONE-ELSE');
    expect(inflightStats().tracked).toBe(0);
  });

  it('两片正常合并:内容按序拼接,残片清空,归属记录带令牌', async () => {
    const name = uniq() + '.jpg';
    const r0 = await chunkReq({ name, seq: 0, total: 2, chunk: Buffer.from('part-one-') });
    expect(r0.code).toBe(200);
    const r1 = await chunkReq({ name, seq: 1, total: 2, chunk: Buffer.from('part-two') });
    expect(r1.code).toBe(201);
    const p = path.join(PHOTOS, name);
    createdMedia.push(p);
    expect(fs.readFileSync(p, 'utf8')).toBe('part-one-part-two');
    expect(gateData.uploads[name].mt).toMatch(/^[0-9a-f]{20}$/);
    expect(listChunkDir()).toEqual([]);
    await settleMs(80); // 压缩任务在 setImmediate 里排入(桩掉 spawn 后无产物,不应改名)
  });
});
