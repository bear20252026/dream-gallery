// lib-vision-guard.test.js — AI 看图与审核闸门的整改回归(2026-10-11 DG-AI-001/002 · DG-UP-003/AI-003)
// 钉住:
//   ① 送样前降采样(≤512px,fs.promises 异步读盘),小文件/ffmpeg 缺失回退原图 —— 不再整张原图进 base64;
//   ② 同一照片只允许一个在途 AI 请求(并发去重,不双付费);
//   ③ 失败不落缓存(一次瞬时故障不再把照片永久锁成回退句),成功才写 photoCaptions;
//   ④ vision 补上 ratelimit 桶(每 IP 每分钟 6 次,缓存命中免检);
//   ⑤ moderateImage 三态 'allow'|'block'|'unavailable';
//   ⑥ 公开展品(白板)审核不可用 → 文件保留 + uploads[name].pending + 202,决策表据此不上墙/不下发。
// 约定:lib/*.js 走 createRequire;aichannels/r2sync/siteconfig 在加载前打 require.cache 桩
//   ⇒ 零真网络、零真 AI 调用;isMineUpload 用本地替身(授权语义正由另一条整改线改,本文件不钉它)。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);
// 必须在 require lib/store 之前重定向:photoCaptions 走 saveGateData,写仓库真实 gate_data.json
// 会与其他套件在全量并发时抢同一个文件的锁(Windows EPERM rename → hook 超时假红)。
process.env.GATE_DATA_FILE = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'dg-vision-')),
  'gate_data.json'
);
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
stubModule('../../lib/siteconfig.js', {
  isMineUpload: (req, u) => !!(u && u.mine === true), // 本文件内的"是不是本人"替身
  canServeMedia: () => true,
  handlePublicConfig: () => {},
  handleAdminMode: () => {},
  handleAdminLinks: () => {},
  handleAdminDemo: () => {},
  handleAdminCaption: () => {},
  handleMyLinks: () => {},
});

const { ROOT } = nodeRequire('../../lib/config.js');
const { gateData, saveGateData } = nodeRequire('../../lib/store.js');
// 空库(全新检出/CI)时 gateData 只有 {secret,applicants,stats};生产由 lib/siteconfig.js 在加载时
// 把 uploads/photoCaptions 建出来。本文件把 siteconfig 打桩或直接不加载它,所以必须自己播种,
// 否则断言会依赖"恰好被别的模块顺手建了容器"这种隐式前置(2026-10-11 CI 假红的根因)。
gateData.uploads = gateData.uploads || {};
gateData.photoCaptions = gateData.photoCaptions || {};
gateData.alerts = gateData.alerts || [];
gateData.applicants = gateData.applicants || {};
const vision = nodeRequire('../../lib/vision.js');
const fu = nodeRequire('../../lib/files-upload.js');
const ratelimit = nodeRequire('../../lib/ratelimit.js');
const MR = await import('../../src/shared/mediarules.mjs');

const { handleVisionAnalyze, analyzeImage, FALLBACK } = vision;
const { imgB64Sample, moderateImage, handleUpload } = fu;
const SAMPLE_INLINE_MAX = 256 * 1024; // 与 files-upload 内部同口径(小图不值得起 ffmpeg)
const PHOTOS = path.join(ROOT, 'photos');
const TAG = 'lib-vision-guard-';
let seqNo = 0;
const uniq = () => `${TAG}${Date.now().toString(36)}-${(seqNo++).toString(36)}`;

// ---------- req/res 桩 ----------
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
function jsonReq(obj, ip) {
  const req = new Readable({ read() {} });
  req.headers = {
    'user-agent': TAG + 'ua',
    'content-type': 'application/json',
    'cf-connecting-ip': ip || '203.0.113.60',
  };
  req.socket = { remoteAddress: '127.0.0.1' }; // 可信反代语义:realIP 才采纳 cf-connecting-ip
  req.push(JSON.stringify(obj));
  req.push(null);
  return req;
}
function bodyReq(body, headers) {
  const req = new Readable({ read() {} });
  req.headers = {
    'user-agent': TAG + 'ua',
    'content-length': String(Buffer.byteLength(body)),
    ...(headers || {}),
  };
  req.socket = { remoteAddress: '203.0.113.61' };
  req.push(Buffer.isBuffer(body) ? body : Buffer.from(body));
  req.push(null);
  return req;
}
const analyze = (file, ip) => {
  const res = fakeRes();
  handleVisionAnalyze(jsonReq({ file }, ip), res);
  return waitRes(res).then(() => res);
};

// ---------- spawn 桩(files-upload 调用期取用 spawn,故可桩) ----------
const cp = nodeRequire('child_process');
const realSpawn = cp.spawn;
let spawnCalls = [];
function stubSpawn(onChild) {
  spawnCalls = [];
  cp.spawn = (...args) => {
    spawnCalls.push(args);
    const child = new EventEmitter();
    setImmediate(() => onChild(child, args));
    return child;
  };
}
// 桩收到的第二个参数是 spawn 的调用参数元组:[命令, 参数数组, options] → 产物路径在参数数组末尾
const scaledSpawn = (child, callArgs) => {
  const argList = callArgs[1];
  const out = argList[argList.length - 1];
  try {
    fs.writeFileSync(out, Buffer.from('SCALED-JPEG-BYTES'));
    child.emit('close', 0);
  } catch {
    child.emit('close', 1);
  }
};
const failingSpawn = (child) => child.emit('error', new Error('ffmpeg not found'));

const created = [];
const mkPhoto = (name, content) => {
  const p = path.join(PHOTOS, name);
  created.push(p);
  fs.writeFileSync(p, content);
  return p;
};
const ownIt = (name) => {
  gateData.uploads = gateData.uploads || {};
  gateData.uploads[name] = { mine: true, dk: 'test-dk', ts: Date.now(), mt: 'test-mt' };
};

let snap;
beforeEach(() => {
  fs.mkdirSync(PHOTOS, { recursive: true });
  snap = JSON.stringify({
    uploads: gateData.uploads,
    photoCaptions: gateData.photoCaptions,
    alerts: gateData.alerts,
  });
  delete process.env.NSFW_MODERATE;
  ratelimit._reset();
  chatVisionMock.mockReset();
  chatVisionMock.mockResolvedValue({ text: '大漠孤烟,长河落日。', by: 'stub' });
  r2PutMock.mockClear();
  spawnCalls = [];
});
afterEach(() => {
  cp.spawn = realSpawn;
  const s = JSON.parse(snap);
  gateData.uploads = s.uploads;
  gateData.photoCaptions = s.photoCaptions;
  gateData.alerts = s.alerts;
  try {
    saveGateData();
  } catch {}
  for (const p of created.splice(0)) {
    try {
      fs.unlinkSync(p);
    } catch {}
  }
});

describe('DG-AI-001 送样降采样(不再整张原图进内存)', () => {
  it('小文件(≤256KB)直接原图 base64:不为小图起一次 ffmpeg', async () => {
    stubSpawn(scaledSpawn);
    const p = mkPhoto(uniq() + '.jpg', Buffer.alloc(1000, 0x11));
    const r = await imgB64Sample(p, 512);
    expect(r.via).toBe('raw');
    expect(r.b64).toBe(Buffer.alloc(1000, 0x11).toString('base64'));
    expect(spawnCalls).toEqual([]);
  });

  it('大文件走 scale=min(512,iw) 的降采样产物,临时样本用完即删', async () => {
    stubSpawn(scaledSpawn);
    const p = mkPhoto(uniq() + '.jpg', Buffer.alloc(SAMPLE_INLINE_MAX + 4096, 0x22));
    const r = await imgB64Sample(p, 512);

    expect(r.via).toBe('scaled');
    expect(r.b64).toBe(Buffer.from('SCALED-JPEG-BYTES').toString('base64'));
    const args = spawnCalls[0][1];
    expect(args.join(' ')).toContain("scale='min(512,iw)'");
    expect(args[0]).toBe('-y');
  });

  it('ffmpeg 不可用/失败 → 回退原图字节(via=raw),分析与审核都不因此中断', async () => {
    stubSpawn(failingSpawn);
    const p = mkPhoto(uniq() + '.jpg', Buffer.alloc(SAMPLE_INLINE_MAX + 64, 0x33));
    const r = await imgB64Sample(p, 512);
    expect(r.via).toBe('raw');
    expect(r.b64).toBe(Buffer.alloc(SAMPLE_INLINE_MAX + 64, 0x33).toString('base64'));
  });

  it('文件不存在 → b64 空 + via=missing/error(不抛)', async () => {
    const r = await imgB64Sample(path.join(PHOTOS, uniq() + '.nope'), 512);
    expect(r.b64).toBe('');
    expect(['missing', 'error']).toContain(r.via);
  });

  it('analyzeImage 把降采样后的样本交给 AI,而不是原图', async () => {
    stubSpawn(scaledSpawn);
    const p = mkPhoto(uniq() + '.jpg', Buffer.alloc(SAMPLE_INLINE_MAX + 128, 0x44));
    await analyzeImage(p);

    const sent = chatVisionMock.mock.calls[0][0].imageB64;
    expect(sent).toBe(Buffer.from('SCALED-JPEG-BYTES').toString('base64'));
    expect(sent).not.toBe(Buffer.alloc(SAMPLE_INLINE_MAX + 128, 0x44).toString('base64'));
  });
});

describe('DG-AI-002 在途去重 + 失败不锁死', () => {
  it('并发两次同一照片:只问一次 AI,两个响应拿到同一条配文', async () => {
    const name = uniq() + '.jpg';
    mkPhoto(name, Buffer.alloc(500, 0x55));
    ownIt(name);
    let release;
    const gate = new Promise((r) => {
      release = r;
    });
    chatVisionMock.mockImplementation(async () => {
      await gate;
      return { text: '风把沙写成一封信', by: 'stub' };
    });

    const a = analyze(name);
    const b = analyze(name); // 第二个请求在第一个未回时到达
    await new Promise((r) => setTimeout(r, 40));
    release();
    const [ra, rb] = await Promise.all([a, b]);

    expect(chatVisionMock).toHaveBeenCalledTimes(1); // 双付费被堵住
    expect(ra.code).toBe(200);
    expect(rb.code).toBe(200);
    expect(ra.json().caption).toBe('风把沙写成一封信');
    expect(rb.json().caption).toBe('风把沙写成一封信');
    expect(gateData.photoCaptions[name]).toBe('风把沙写成一封信');
  });

  it('AI 全通道失败(null)→ 回退句给前端但不写缓存,下次可重试', async () => {
    const name = uniq() + '.jpg';
    mkPhoto(name, Buffer.alloc(500, 0x55));
    ownIt(name);
    chatVisionMock.mockResolvedValue(null);

    const r1 = await analyze(name);
    expect(r1.code).toBe(200);
    expect(r1.json().fallback).toBe(true);
    expect(r1.json().retryable).toBe(true);
    expect(r1.json().caption).toBe(FALLBACK);
    expect(gateData.photoCaptions[name]).toBeUndefined(); // 关键:瞬时故障不再永久锁死这张照片

    chatVisionMock.mockResolvedValue({ text: '重试之后写好了', by: 'stub' });
    const r2 = await analyze(name);
    expect(chatVisionMock).toHaveBeenCalledTimes(2);
    expect(r2.json().caption).toBe('重试之后写好了');
    expect(gateData.photoCaptions[name]).toBe('重试之后写好了');
  });

  it('AI 抛异常 → 同样不写缓存', async () => {
    const name = uniq() + '.jpg';
    mkPhoto(name, Buffer.alloc(400, 0x55));
    ownIt(name);
    chatVisionMock.mockRejectedValue(new Error('timeout'));
    const r = await analyze(name);
    expect(r.json().fallback).toBe(true);
    expect(gateData.photoCaptions[name]).toBeUndefined();
  });

  it('已分析过的照片直接吃缓存,不再调 AI 也不占限流额度', async () => {
    const name = uniq() + '.jpg';
    mkPhoto(name, Buffer.alloc(400, 0x55));
    ownIt(name);
    gateData.photoCaptions[name] = '旧配文';
    for (let i = 0; i < 8; i++) {
      const r = await analyze(name);
      expect(r.json().cached).toBe(true);
    }
    expect(chatVisionMock).toHaveBeenCalledTimes(0);
  });

  it('洪水防护:同一 IP 每分钟第 7 次分析 → 429(vision 此前是四个 AI 端点里唯一没桶的)', async () => {
    const ip = '203.0.113.99';
    const name = uniq() + '.jpg';
    mkPhoto(name, Buffer.alloc(400, 0x55));
    ownIt(name);
    chatVisionMock.mockResolvedValue(null); // 不写缓存 ⇒ 每次都真走额度判定
    const codes = [];
    for (let i = 0; i < 7; i++) codes.push((await analyze(name, ip)).code);
    expect(codes.slice(0, 6)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(codes[6]).toBe(429);

    const other = await analyze(name, '203.0.113.98'); // 别的 IP 不受牵连
    expect(other.code).toBe(200);
  });

  it('不是自己上传的照片 → 403,且不花额度', async () => {
    const name = uniq() + '.jpg';
    mkPhoto(name, Buffer.alloc(400, 0x55));
    gateData.uploads = gateData.uploads || {};
    gateData.uploads[name] = { mine: false, dk: 'someone-else', ts: 1 };
    const r = await analyze(name);
    expect(r.code).toBe(403);
    expect(chatVisionMock).toHaveBeenCalledTimes(0);
  });
});

describe('DG-UP-003 / DG-AI-003 moderateImage 三态', () => {
  it('审核开关未开 → 恒 allow(主人的成本策略不变)', async () => {
    delete process.env.NSFW_MODERATE;
    const p = mkPhoto(uniq() + '.png', Buffer.alloc(64, 1));
    expect(await moderateImage(p)).toBe('allow');
    expect(chatVisionMock).toHaveBeenCalledTimes(0);
  });

  it('开启且 AI 判定 BLOCK → block', async () => {
    process.env.NSFW_MODERATE = '1';
    const p = mkPhoto(uniq() + '.png', Buffer.alloc(64, 1));
    chatVisionMock.mockResolvedValue({ text: 'BLOCK' });
    expect(await moderateImage(p)).toBe('block');
  });

  it('开启且 AI 判定 PASS → allow', async () => {
    process.env.NSFW_MODERATE = '1';
    const p = mkPhoto(uniq() + '.png', Buffer.alloc(64, 1));
    chatVisionMock.mockResolvedValue({ text: 'PASS' });
    expect(await moderateImage(p)).toBe('allow');
  });

  it('开启却拿不到结论(null / 空文本 / 抛异常)→ unavailable(不再是静默 allow)', async () => {
    process.env.NSFW_MODERATE = '1';
    const p = mkPhoto(uniq() + '.png', Buffer.alloc(64, 1));
    chatVisionMock.mockResolvedValue(null);
    expect(await moderateImage(p)).toBe('unavailable');
    chatVisionMock.mockResolvedValue({ text: '' });
    expect(await moderateImage(p)).toBe('unavailable');
    chatVisionMock.mockRejectedValue(new Error('all channels failed'));
    expect(await moderateImage(p)).toBe('unavailable');
  });
});

describe('DG-UP-003 公开展品 pending:不上墙、不下发、不删文件', () => {
  const wb = () => `whiteboard-${uniq()}-${Math.random().toString(36).slice(2, 6)}.png`;

  it('白板作品审核不可用 → 202 + uploads[name].pending,文件保留(数据保留铁律)', async () => {
    process.env.NSFW_MODERATE = '1';
    chatVisionMock.mockResolvedValue(null);
    const name = wb();
    const p = path.join(PHOTOS, name);
    created.push(p);
    let keptDuringReview = null;
    chatVisionMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 60)); // 审核"进行中"时文件必须还在盘上
      keptDuringReview = fs.existsSync(p);
      return null;
    });
    const res = fakeRes();
    handleUpload(bodyReq(Buffer.alloc(200, 0x66)), res, { dir: 'photos', name }); // 白板走非公开分支
    await waitRes(res);

    expect(res.code).toBe(202);
    expect(res.json().pending).toBe(true);
    expect(String(res.json().message)).toContain('审核');
    expect(keptDuringReview).toBe(true);
    expect(fs.existsSync(p)).toBe(true); // 拒的是"上墙",不是"留档"
    expect(typeof gateData.uploads[name].pending).toBe('number');
    expect(r2PutMock).not.toHaveBeenCalled(); // 待审核内容不镜像 CDN
  });

  it('重画同名且审核通过 → 201 且 pending 标记被摘掉', async () => {
    const name = wb();
    const p = path.join(PHOTOS, name);
    created.push(p);
    gateData.uploads = gateData.uploads || {};
    gateData.uploads[name] = { mine: true, dk: 'x', ts: 1, mt: 'aaaa', pending: Date.now() };

    process.env.NSFW_MODERATE = '1';
    chatVisionMock.mockResolvedValue({ text: 'PASS' });
    const res = fakeRes();
    handleUpload(bodyReq(Buffer.alloc(200, 0x66)), res, { dir: 'photos', name });
    await waitRes(res);

    expect(res.code).toBe(201);
    expect(gateData.uploads[name].pending).toBeUndefined();
  });

  it('判定违规仍走原路:删文件 + 422', async () => {
    process.env.NSFW_MODERATE = '1';
    chatVisionMock.mockResolvedValue({ text: 'BLOCK' });
    const name = wb();
    const p = path.join(PHOTOS, name);
    const res = fakeRes();
    handleUpload(bodyReq(Buffer.alloc(200, 0x66)), res, { dir: 'photos', name });
    await waitRes(res);

    expect(res.code).toBe(422);
    expect(fs.existsSync(p)).toBe(false);
    expect(gateData.uploads[name]).toBeUndefined();
  });

  it('私人上传不受影响:审核不可用仍照常 201(自己看自己,不外泄)', async () => {
    process.env.NSFW_MODERATE = '1';
    chatVisionMock.mockResolvedValue(null);
    const name = uniq() + '.jpg';
    created.push(path.join(PHOTOS, name));
    stubSpawn(failingSpawn);
    const res = fakeRes();
    handleUpload(bodyReq(Buffer.alloc(400, 0x77)), res, { dir: 'photos', name }, true);
    await waitRes(res);

    expect(res.code).toBe(201);
    expect(gateData.uploads[name].pending).toBeUndefined();
  });

  it('决策表(单一源)按 pending 短路:不上墙 / 不播 / 不配文 / 不下发', () => {
    expect(MR.wallDecision({ isMine: true })).toEqual({ visible: true, content: true });
    expect(MR.wallDecision({ isMine: true, pending: 1 })).toEqual({
      visible: false,
      content: false,
    });
    expect(MR.wallDecision({ isDemo: true, pending: true })).toEqual({
      visible: false,
      content: false,
    });
    expect(MR.contentAllowed({ isDemo: true, pending: true })).toBe(false);
    expect(MR.captionAllowed({ isMine: true, pending: true })).toBe(false);
    // 白板走"按名字公开"的下发路径,pending 必须排在它之前短路
    expect(MR.serveDecision({ dir: 'photos', base: 'whiteboard-x.png' })).toEqual({
      allow: true,
      pub: true,
    });
    expect(MR.serveDecision({ dir: 'photos', base: 'whiteboard-x.png', pending: 1 })).toEqual({
      allow: false,
      pub: false,
    });
    expect(MR.serveDecision({ dir: 'videos', base: '户外大屏/1号.mp4', pending: true })).toEqual({
      allow: false,
      pub: false,
    });
    expect(MR.serveDecision({ dir: 'photos', base: 'x.jpg', isMine: true })).toEqual({
      allow: true,
      pub: false,
    });
    // isPending 别名同样有效(客户端/服务端不必为字段名分叉)
    expect(MR.wallDecision({ isMine: true, isPending: true })).toEqual({
      visible: false,
      content: false,
    });
  });
});
