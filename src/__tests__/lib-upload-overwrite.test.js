// lib-upload-overwrite.test.js — 上传写路径的覆盖/竞态闸门(2026-10-11 安全整改 DG-FILE-001 / DG-UP-003 / 三十一)
// 钉住:
//   ① 视频后处理改名不再覆盖已存在的同名展品(文件内容与 gateData.uploads 归属都不动);
//   ② 归属/配文迁移只在目标键未被占用时发生,正常改名仍照常迁移;
//   ③ 同名并发上传第二个必 409('wx' 独占创建,禁覆盖原子化);
//   ④ 压缩临时名带进程内唯一后缀(同 basename 不共用同一个 tmp);
//   ⑤ 反刷 BIGFILE(300MB)在 Content-Length 阶段即拒,零写盘;
//   ⑥ 大屏(管理员入口 auth:'write')2GB 预检。
// 约定同 lib-tts.test.js:lib/*.js 是 CJS,用 createRequire 与模块共享同一 require 缓存;
// r2sync 在 files-upload 加载前打 require.cache 补丁 ⇒ 断言零真网络请求。
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);
// 必须在 require 任何 lib/*.js 之前重定向:否则本套件会写仓库真实的 gate_data.json,
// 全量 vitest 并发时与其他套件抢同一个文件的锁 → Windows 下 EPERM rename 失败、hook 超时假红。
const dgTmpData = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dg-updata-')), 'gate_data.json');
process.env.GATE_DATA_FILE = dgTmpData;
const r2syncId = nodeRequire.resolve('../../lib/r2sync.js');
const r2PutMock = vi.fn(() => Promise.resolve(true));
nodeRequire.cache[r2syncId] = {
  id: r2syncId,
  filename: r2syncId,
  loaded: true,
  path: path.dirname(r2syncId),
  exports: { r2Put: r2PutMock, r2Delete: vi.fn(() => Promise.resolve(true)) },
};

const { ROOT, TOKEN } = nodeRequire('../../lib/config.js');
const { gateData, deviceKey, saveGateData } = nodeRequire('../../lib/store.js');
// 空库(全新检出/CI)时 gateData 只有 {secret,applicants,stats};生产由 lib/siteconfig.js 在加载时
// 把 uploads/photoCaptions 建出来。本文件把 siteconfig 打桩或直接不加载它,所以必须自己播种,
// 否则断言会依赖"恰好被别的模块顺手建了容器"这种隐式前置(2026-10-11 CI 假红的根因)。
gateData.uploads = gateData.uploads || {};
gateData.photoCaptions = gateData.photoCaptions || {};
gateData.alerts = gateData.alerts || [];
gateData.applicants = gateData.applicants || {};
const { handleUpload, _resetChunkState } = nodeRequire('../../lib/files-upload.js');
const { handleBigscreenUpload, BIGSCREEN_MAX_BYTES } = nodeRequire('../../lib/bigscreen.js');

const PHOTOS = path.join(ROOT, 'photos');
const VIDEOS = path.join(ROOT, 'videos');
const TAG = 'lib-upload-overwrite-';

// ---------- 假 req/res(照 lib-tts.test.js 的形状) ----------
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
function waitRes(res) {
  return new Promise((r) => res.on('finish', r).on('close', r));
}
function fakeReq(chunks, headers) {
  const req = new Readable({ read() {} });
  req.headers = { 'user-agent': TAG + 'ua', ...(headers || {}) };
  req.socket = { remoteAddress: '203.0.113.40' };
  for (const c of chunks) req.push(c);
  req.push(null);
  return req;
}

// ---------- ffmpeg/nice 桩(files-upload 经 spawnProc 在调用期取用 spawn,故可桩) ----------
const cp = nodeRequire('child_process');
const realSpawn = cp.spawn;
let spawnCalls = [];
let finishedJobs = []; // 收束信号:桩里 emit('close') 同步跑完被测的改名/清理逻辑后记录该任务参数
function stubSpawn(onChild) {
  spawnCalls = [];
  finishedJobs = [];
  cp.spawn = (...args) => {
    spawnCalls.push(args);
    const child = new EventEmitter();
    setImmediate(() => {
      onChild(child, args); // onChild 内部同步 emit('close') ⇒ 被测逻辑在本帧内收束
      finishedJobs.push(String(args[1]));
    });
    return child;
  };
}
// 压缩成功桩:产出"明显比原文件小"的产物 → 旧代码正是在此处裸 rename 覆盖他人展品
const compressSpawn = (child, callArgs) => {
  // 桩收到的第二参是 spawn 的调用参数元组 [命令, 参数数组, options] ⇒ 产物路径在参数数组末尾
  const argList = callArgs[1];
  const out = argList[argList.length - 1];
  try {
    fs.writeFileSync(out, Buffer.alloc(100, 0x41));
    child.emit('close', 0);
  } catch {
    child.emit('close', 1);
  }
};
// 压缩失败桩:保留原文件,用于只关心上传本身的用例
const noopSpawn = (child) => child.emit('close', 1);

const tmpFiles = [];
const track = (p) => {
  tmpFiles.push(p);
  return p;
};
let seqNo = 0;
const uniq = () =>
  `${TAG}${Date.now().toString(36)}-${(seqNo++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
// 压缩队列是单工位 + 任务间 1s 冷却 ⇒ 不能靠固定 sleep,轮询等可观察效果
async function waitUntil(pred, timeoutMs = 8000) {
  const t0 = Date.now();
  for (;;) {
    let v = false;
    try {
      v = !!pred();
    } catch {}
    if (v) return true;
    if (Date.now() - t0 > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 40));
  }
}
const tmpsFor = (base) =>
  spawnCalls.filter((a) => String(a[1]).includes(base)).map((a) => a[1][a[1].length - 1]);
// 等本次上传的压缩任务真正收束(桩在 emit('close') 同步跑完改名逻辑后才登记 finishedJobs)
async function waitCompress(base) {
  return await waitUntil(() => finishedJobs.some((j) => j.includes(base)));
}
const up = (dir, name, body, headers) => {
  const res = fakeRes();
  const req = fakeReq([body], {
    'content-length': String(Buffer.byteLength(body)),
    ...(headers || {}),
  });
  handleUpload(req, res, { dir, name }, true);
  return { res, req };
};

// gate_data 快照恢复(规矩同 lib-abuse.test.js:测试只动自己的键,收尾整体回写)
let snap;
beforeAll(() => {
  fs.mkdirSync(PHOTOS, { recursive: true });
  fs.mkdirSync(VIDEOS, { recursive: true });
});
beforeEach(() => {
  delete process.env.NSFW_MODERATE; // 默认口径:审核关闭 ⇒ moderateImage 恒 'allow'
  snap = JSON.stringify({
    uploads: gateData.uploads,
    photoCaptions: gateData.photoCaptions,
    alerts: gateData.alerts,
  });
  r2PutMock.mockClear();
  spawnCalls = [];
  finishedJobs = [];
  _resetChunkState();
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
});
afterAll(() => {
  cp.spawn = realSpawn;
  for (const f of tmpFiles) {
    try {
      fs.unlinkSync(f);
    } catch {}
  }
  for (const dir of [VIDEOS, PHOTOS]) {
    try {
      for (const f of fs.readdirSync(dir)) if (f.startsWith(TAG)) fs.unlinkSync(path.join(dir, f));
    } catch {}
  }
});

describe('DG-FILE-001 视频改名覆盖链', () => {
  it('目标已存在(abc.mp4):compressJob 处理 abc.mov 后,abc.mp4 的内容与 uploads 归属一字不动', async () => {
    const base = uniq();
    const mp4Path = track(path.join(VIDEOS, base + '.mp4'));
    fs.writeFileSync(mp4Path, 'ORIGINAL-PUBLIC-EXHIBIT');
    gateData.uploads = gateData.uploads || {};
    gateData.uploads[base + '.mp4'] = {
      dk: 'victim-dk',
      aid: 'victim-vid',
      ts: 1,
      mt: 'victim-mt',
    };
    gateData.photoCaptions = gateData.photoCaptions || {};
    gateData.photoCaptions[base + '.mp4'] = '别人的配文';

    stubSpawn(compressSpawn); // 上传后 setImmediate 排入的 compressJob 必落到改名闸门
    const { res, req } = up('videos', base + '.mov', Buffer.alloc(2000, 0x42));
    await waitRes(res);
    expect(res.code).toBe(201);
    expect(await waitCompress(base)).toBe(true);

    expect(fs.readFileSync(mp4Path, 'utf8')).toBe('ORIGINAL-PUBLIC-EXHIBIT');
    expect(gateData.uploads[base + '.mp4'].dk).toBe('victim-dk');
    expect(gateData.uploads[base + '.mp4'].mt).toBe('victim-mt');
    expect(gateData.photoCaptions[base + '.mp4']).toBe('别人的配文');
    expect(fs.existsSync(path.join(VIDEOS, base + '.mov'))).toBe(true); // 放弃改名=原文件保留
    expect(gateData.uploads[base + '.mov'].dk).toBe(deviceKey(req)); // 自己的归属不被搬走
    // CDN 侧也不 PUT 新名(旧实现裸覆盖 R2 对象)
    for (const call of r2PutMock.mock.calls) expect(call[1]).not.toBe(base + '.mp4');
    expect(fs.readdirSync(VIDEOS).filter((f) => f.startsWith(base + '.compressing'))).toEqual([]);
  });

  it('目标不存在:改名照常发生,uploads 与 photoCaptions 随迁并按新名镜像 R2', async () => {
    const base = uniq();
    const movPath = path.join(VIDEOS, base + '.mov'); // 由上传创建,不在这里预建(否则 'wx' 会 409)
    const mp4Path = track(path.join(VIDEOS, base + '.mp4'));
    gateData.photoCaptions = gateData.photoCaptions || {};

    stubSpawn(compressSpawn);
    const { res } = up('videos', base + '.mov', Buffer.alloc(2000, 0x42));
    await waitRes(res);
    expect(res.code).toBe(201);
    gateData.photoCaptions[base + '.mov'] = '待迁移配文'; // 落账后再挂配文,模拟"分析在先、压缩在后"
    expect(await waitCompress(base)).toBe(true);

    expect(fs.existsSync(mp4Path)).toBe(true);
    expect(fs.existsSync(movPath)).toBe(false);
    expect(gateData.uploads[base + '.mp4']).toBeTruthy();
    expect(gateData.uploads[base + '.mov']).toBeUndefined();
    expect(gateData.photoCaptions[base + '.mp4']).toBe('待迁移配文');
    expect(gateData.photoCaptions[base + '.mov']).toBeUndefined();
    expect(r2PutMock.mock.calls.some((c) => c[0] === 'videos' && c[1] === base + '.mp4')).toBe(
      true
    );
  });

  it('迁移前二次确认目标键归属:改名被拒时不搬走他人 uploads 记录', async () => {
    const base = uniq();
    const movPath = path.join(VIDEOS, base + '.mov');
    const mp4Path = track(path.join(VIDEOS, base + '.mp4'));
    fs.writeFileSync(mp4Path, 'EXISTING'); // 磁盘目标已存在 → 改名闸门第一道即拒
    gateData.uploads = gateData.uploads || {};
    gateData.uploads[base + '.mp4'] = { dk: 'other-dk', mt: 'other-mt', ts: 1 };

    stubSpawn(compressSpawn);
    const { res } = up('videos', base + '.mov', Buffer.alloc(2000, 0x42));
    await waitRes(res);
    expect(res.code).toBe(201);
    expect(await waitCompress(base)).toBe(true);

    expect(gateData.uploads[base + '.mp4'].dk).toBe('other-dk');
    expect(gateData.uploads[base + '.mp4'].mt).toBe('other-mt');
    expect(gateData.uploads[base + '.mov']).toBeTruthy();
    expect(fs.existsSync(movPath)).toBe(true);
    expect(fs.readFileSync(mp4Path, 'utf8')).toBe('EXISTING');
  });

  it('压缩临时名带进程内唯一后缀:同 basename 两轮压缩不共用同一个 tmp', async () => {
    const base = uniq();
    const movPath = path.join(VIDEOS, base + '.mov');
    const mp4Path = track(path.join(VIDEOS, base + '.mp4'));

    stubSpawn(compressSpawn);
    const a = up('videos', base + '.mov', Buffer.alloc(2000, 0x42));
    await waitRes(a.res);
    expect(a.res.code).toBe(201);
    expect(await waitCompress(base)).toBe(true);
    const firstTmp = tmpsFor(base).slice(-1)[0];
    expect(fs.existsSync(mp4Path)).toBe(true); // 第一轮:目标不存在 → 改名成功

    const b = up('videos', base + '.mov', Buffer.alloc(2000, 0x42)); // 第二轮:同名可再传(第一个 .mov 已改名走)
    await waitRes(b.res);
    expect(b.res.code).toBe(201);
    spawnCalls = [];
    finishedJobs = [];
    expect(await waitCompress(base)).toBe(true);
    const secondTmp = tmpsFor(base).slice(-1)[0];

    expect(secondTmp).not.toBe(firstTmp);
    expect(/\.compressing\.\d+\.\d+\.mp4$/.test(secondTmp)).toBe(true);
    expect(fs.readFileSync(mp4Path, 'utf8')).toBe('A'.repeat(100)); // 第二轮改名被拒 → 产物未被再写
    expect(fs.existsSync(movPath)).toBe(true);
    expect(fs.readdirSync(VIDEOS).filter((f) => f.includes('.compressing'))).toEqual([]);
  });
});

describe('DG-FILE-001#3 同名并发禁覆盖原子化', () => {
  it('并发同名:第二个 409,第一个 201 且落盘内容是它自己的', async () => {
    const name = uniq() + '.jpg';
    const p = track(path.join(PHOTOS, name));
    stubSpawn(noopSpawn);
    const res1 = fakeRes();
    const res2 = fakeRes();
    // 'wx' 在调用栈内同步占位 ⇒ 一个微任务之后第二个请求必然看到已存在的文件
    handleUpload(fakeReq(['AAA'], { 'content-length': '3' }), res1, { dir: 'photos', name }, true);
    await Promise.resolve();
    handleUpload(fakeReq(['BBB'], { 'content-length': '3' }), res2, { dir: 'photos', name }, true);
    await Promise.all([waitRes(res1), waitRes(res2)]);

    expect(res1.code).toBe(201);
    expect(res2.code).toBe(409);
    expect(String(res2.json().error)).toMatch(/同名文件已存在/);
    expect(fs.readFileSync(p, 'utf8')).toBe('AAA'); // 并发未覆盖:内容仍是先占位者的
    expect(gateData.uploads[name]).toBeTruthy();
  });

  it('孤儿文件(有文件无归属记录):仍 409 且不截断他人文件', async () => {
    const name = uniq() + '.jpg';
    const p = track(path.join(PHOTOS, name));
    fs.writeFileSync(p, 'SOMEONE-ELSE');
    stubSpawn(noopSpawn);
    const res = fakeRes();
    handleUpload(fakeReq(['X'], { 'content-length': '1' }), res, { dir: 'photos', name }, true);
    await waitRes(res);

    expect(res.code).toBe(409);
    expect(fs.readFileSync(p, 'utf8')).toBe('SOMEONE-ELSE');
  });

  it('已存在同名文件:直传 409 且不截断他人文件、不动他人归属', async () => {
    const name = uniq() + '.jpg';
    const p = track(path.join(PHOTOS, name));
    fs.writeFileSync(p, 'SOMEONE-ELSE');
    gateData.uploads = gateData.uploads || {};
    gateData.uploads[name] = { dk: 'other-dk', aid: 'other-vid', ts: 1, mt: 'other-mt' };
    stubSpawn(noopSpawn);
    const res = fakeRes();
    handleUpload(fakeReq(['X'], { 'content-length': '1' }), res, { dir: 'photos', name }, true);
    await waitRes(res);

    expect(res.code).toBe(409);
    expect(fs.readFileSync(p, 'utf8')).toBe('SOMEONE-ELSE');
    expect(gateData.uploads[name].dk).toBe('other-dk');
    expect(gateData.uploads[name].mt).toBe('other-mt');
  });

  it('死名(有归属记录无文件):新上传可占回这个名字,不给攻击者留永久占位', async () => {
    const name = uniq() + '.jpg';
    const p = track(path.join(PHOTOS, name));
    gateData.uploads = gateData.uploads || {};
    gateData.uploads[name] = { dk: 'stale-dk', ts: 1, mt: 'stale-mt' };
    stubSpawn(noopSpawn);
    const res = fakeRes();
    handleUpload(fakeReq(['NEW'], { 'content-length': '3' }), res, { dir: 'photos', name }, true);
    await waitRes(res);

    expect(res.code).toBe(201);
    expect(fs.readFileSync(p, 'utf8')).toBe('NEW');
    expect(gateData.uploads[name].mt).not.toBe('stale-mt');
  });
});

describe('DG-UP-003 反刷 BIGFILE 阈值前移', () => {
  it('Content-Length 301MB → 429 且零写盘(不等写满才发现)', () => {
    const name = uniq() + '.mp4';
    const p = path.join(VIDEOS, name);
    const res = fakeRes();
    handleUpload(
      fakeReq([], { 'content-length': String(301 * 1024 * 1024) }),
      res,
      { dir: 'videos', name },
      true
    );

    expect(res.code).toBe(429);
    expect(fs.existsSync(p)).toBe(false);
    expect((gateData.alerts || []).filter((a) => a.type === 'bigfile').length).toBeGreaterThan(0);
  });

  it('Content-Length 701MB 仍是 413(体积上限优先于反刷阈值)', () => {
    const name = uniq() + '.mp4';
    const res = fakeRes();
    handleUpload(
      fakeReq([], { 'content-length': String(701 * 1024 * 1024) }),
      res,
      { dir: 'videos', name },
      true
    );
    expect(res.code).toBe(413);
    expect(fs.existsSync(path.join(VIDEOS, name))).toBe(false);
  });
});

describe('三十一 大屏上传上限(auth:write=管理员入口 2GB)', () => {
  const tokenQuery = TOKEN ? { token: TOKEN } : {};

  it('常量=2GB,且注明是管理员入口上限', () => {
    expect(BIGSCREEN_MAX_BYTES).toBe(2 * 1024 * 1024 * 1024);
    expect(BIGSCREEN_MAX_BYTES).toBeGreaterThan(700 * 1024 * 1024);
  });

  it('Content-Length 超上限 → 413,不落盘、不动槽位配置', () => {
    const name = uniq() + '.mp4';
    const p = path.join(VIDEOS, '户外大屏', name);
    const { getBigscreen } = nodeRequire('../../lib/bigscreen.js');
    const before = getBigscreen().find((s) => s.slot === 'main1').file;
    const res = fakeRes();
    handleBigscreenUpload(fakeReq([], { 'content-length': String(BIGSCREEN_MAX_BYTES + 1) }), res, {
      slot: 'main1',
      name,
      ...tokenQuery,
    });

    expect(res.code).toBe(413);
    expect(fs.existsSync(p)).toBe(false);
    expect(getBigscreen().find((s) => s.slot === 'main1').file).toBe(before);
  });

  it('扩展名不合法 → 400(在写盘之前)', () => {
    const res = fakeRes();
    handleBigscreenUpload(fakeReq(['x'], { 'content-length': '1' }), res, {
      slot: 'main1',
      name: 'evil.html',
      ...tokenQuery,
    });
    expect(res.code).toBe(400);
  });
});
