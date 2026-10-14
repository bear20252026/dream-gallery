// lib-upload-modules.test.js — lib/upload/* 抽出来的纯逻辑单测(2026-10-12 审计挂账 R2 第一步)
// 钉住"搬家"之后仍然成立的四条外部不变量(与 lib-files-upload 那几套安全网互补,不重复它们的断言):
//   ① magic:扩展名白名单/体积上限的判定结论与改造前逐字相同(含"白名单里没有 .svg"这条历史口径);
//   ② names:服务端签发名形态、白板目录钉死、401(没表明身份)与 409(身份对不上)的分野、撞名换名;
//   ③ quota:四种 slotKind 的预约体积 + 还位对称(finish/error/超限/断连/预拒)与幂等;
//   ④ stream:四件套的固定顺序(destroy→unlink→还位→回响应→断连)与各结束路径都只还一次位。
// ⚠️ 约定同 lib-whiteboard-overwrite.test.js:GATE_DATA_FILE / R2_OUTBOX_FILE / CHUNK_DIR 必须在
//   require 任何 lib/*.js 之前重定向到临时目录(本仓库因写真实数据文件被 CI 咬过)。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-upload-mod-'));
process.env.GATE_DATA_FILE = path.join(tmpDir, 'gate_data.json');
process.env.R2_OUTBOX_FILE = path.join(tmpDir, 'r2-outbox.json');
process.env.CHUNK_DIR = path.join(tmpDir, 'chunks');

const magic = nodeRequire('../../lib/upload/magic.js');
const names = nodeRequire('../../lib/upload/names.js');
const quota = nodeRequire('../../lib/upload/quota.js');
const stream = nodeRequire('../../lib/upload/stream.js');
const chunksMod = nodeRequire('../../lib/upload/chunks.js');
const abuse = nodeRequire('../../lib/abuse.js');
const { gateData } = nodeRequire('../../lib/store.js');
const { ROUTES } = nodeRequire('../../lib/routes.js');
gateData.uploads = gateData.uploads || {};
gateData.applicants = gateData.applicants || {};

const wbGuard = (
  ROUTES.find(
    (r) =>
      r.method === 'POST' &&
      r.match === '/api/upload' &&
      r.guard &&
      String(r.guard).includes('whiteboard')
  ) || {}
).guard;

// ---------- 假 res:记录状态码/响应头/响应体 ----------
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
const waitRes = (res) => new Promise((r) => res.on('finish', r).on('close', r));
function bodyReq(body, { cl = null, cookie = null, ua = 'dg-upload-modules-ua' } = {}) {
  const req = new Readable({ read() {} });
  req.headers = {
    'user-agent': ua,
    'content-length': String(cl === null ? Buffer.byteLength(body) : cl),
  };
  if (cookie) req.headers.cookie = cookie;
  req.socket = { remoteAddress: '203.0.113.90' };
  if (body !== null) {
    req.push(body);
    req.push(null);
  }
  return req;
}

describe('lib/upload/magic.js — 格式与体积判定的单一出处', () => {
  it('photos 只收图片、videos 只收视频;跨目录配名字一律不放行', () => {
    expect(magic.uploadKind('photos', 'a.jpg')).toMatchObject({
      isImg: true,
      isVid: false,
      allowed: true,
      maxBytes: magic.PUBLIC_MAX_IMG,
    });
    expect(magic.uploadKind('photos', 'a.png').allowed).toBe(true);
    expect(magic.uploadKind('videos', 'a.mp4').allowed).toBe(true);
    expect(magic.uploadKind('videos', 'a.mp4')).toMatchObject({
      isVid: true,
      maxBytes: magic.PUBLIC_MAX_VID,
    });
    expect(magic.uploadKind('photos', 'a.mp4').allowed).toBe(false); // 图片目录不收视频
    expect(magic.uploadKind('videos', 'a.jpg').allowed).toBe(false); // 视频目录不收图片
    expect(magic.uploadKind('music', 'a.mp3').allowed).toBe(false);
  });

  it('SVG 仍在白名单之外(2026-07-31 因可含脚本被移除),大小写与多重扩展名按最后一个点判定', () => {
    expect(magic.PUBLIC_IMG_EXT).not.toContain('.svg');
    expect(magic.uploadKind('photos', 'evil.svg').allowed).toBe(false);
    expect(magic.uploadKind('photos', 'evil.SVG').allowed).toBe(false);
    expect(magic.uploadKind('photos', 'a.tar.gz').allowed).toBe(false);
    expect(magic.uploadKind('photos', 'A.JPEG').allowed).toBe(true);
  });

  it('拒答文案与改造前逐字一致(公开路按类型、白板路按目录)', () => {
    expect(magic.uploadKind('videos', 'a.mp4').tooBigMessage).toBe('视频不能超过 700MB');
    expect(magic.uploadKind('photos', 'a.jpg').tooBigMessage).toBe('图片不能超过 50MB');
    expect(magic.PUBLIC_FORMAT_ERROR).toBe('仅支持 photos 图片(全格式)和 videos 视频(全格式)');
    expect(magic.maxBytesForDir('videos')).toBe(700 * 1024 * 1024);
    expect(magic.maxBytesForDir('photos')).toBe(50 * 1024 * 1024);
    expect(magic.dirTooBigMessage('videos')).toBe('视频不能超过 700MB');
    expect(magic.dirTooBigMessage('photos')).toBe('文件不能超过 50MB'); // 非公开分支的历史口径:说"文件"不说"图片"
    expect(magic.BSCREEN_FORMAT_ERROR).toBe('仅支持视频:mp4/webm/m4v/mov/mkv 或 HLS:m3u8');
    expect(magic.BSCREEN_TOO_BIG).toBe('大屏视频不能超过 2GB');
  });

  it('大屏扩展名白名单含 m3u8(HLS 清单)但不含 html(写盘前的格式闸)', () => {
    expect(magic.bscreenExtAllowed('x.mp4')).toBe(true);
    expect(magic.bscreenExtAllowed('x.m3u8')).toBe(true);
    expect(magic.bscreenExtAllowed('x.MKV')).toBe(true);
    expect(magic.bscreenExtAllowed('evil.html')).toBe(false);
    expect(magic.bscreenExtAllowed('evil.svg')).toBe(false);
  });
});

describe('lib/upload/names.js — 签发名与覆盖闸门', () => {
  it('签发名形态:仍过得了路由 guard,且每次都不重复', () => {
    const a = names.newWhiteboardName();
    const b = names.newWhiteboardName();
    expect(/^whiteboard-\d{8}-\d{6}-[0-9a-f]{8}\.png$/.test(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(wbGuard({ query: { name: a } })).toBe(true);
  });

  it('匿名侧目录钉死:只有 photos 的 whiteboard-<图片名> 算公开展品', () => {
    expect(names.isPublicLike('photos', 'whiteboard-20261012-101112-deadbeef.png')).toBe(true);
    expect(names.isPublicLike('photos', 'whiteboard-x.jpeg')).toBe(true);
    expect(names.isPublicLike('photos', 'whiteboard-x.webp')).toBe(true);
    expect(names.isPublicLike('videos', 'whiteboard-x.png')).toBe(false); // 第二个洞:借白板名写视频目录
    expect(names.isPublicLike('music', 'whiteboard-x.png')).toBe(false);
    expect(names.isPublicLike('photos', 'notwhiteboard-x.png')).toBe(false);
    expect(names.isPublicLike('photos', 'whiteboard-x.html')).toBe(false); // 路由 guard 同款扩展名口径
  });

  it('裁决:403(目录/名字不对)/401(没表明身份)/409(不是我的)/overwrite(我的)/issue(新作)', () => {
    const VID = 'vid-names-A';
    gateData.applicants[VID] = { id: VID, status: 'approved' };
    // 乙也必须是"有有效会话的本人",否则按契约应当回 401(没表明身份)而不是 409(身份对不上)
    gateData.applicants['vid-names-B'] = { id: 'vid-names-B', status: 'approved' };
    const mine = 'whiteboard-mine.png';
    const foreign = 'whiteboard-foreign.png';
    const legacy = 'whiteboard-legacy.png';
    gateData.uploads[mine] = { dk: 'dk-a', aid: VID, ts: 1, mt: 'mt-mine' };
    gateData.uploads[foreign] = { dk: 'dk-b', aid: 'vid-names-B', ts: 1, mt: 'mt-foreign' };
    gateData.uploads[legacy] = { dk: 'dk-old', ts: 1 }; // 2026-10-12 前的无归属存量

    const dirPath = path.join(tmpDir, 'photos');
    const p = (n) => path.join(dirPath, n);
    const asOwner = bodyReq('x', { cookie: 'vid=' + VID });
    const asStranger = bodyReq('x', { cookie: 'vid=vid-names-B' });

    // 403:目录不是 photos
    expect(
      names.decideAnonWhiteboard(
        asOwner,
        gateData,
        'videos',
        'whiteboard-x.png',
        p('whiteboard-x.png')
      )
    ).toMatchObject({ verdict: 'reject', code: 403 });
    // 401:名字指向他人作品但请求没表明身份(无 Cookie)
    expect(
      names.decideAnonWhiteboard(bodyReq('x'), gateData, 'photos', foreign, p(foreign))
    ).toMatchObject({ verdict: 'reject', code: 401 });
    expect(
      String(
        names.decideAnonWhiteboard(bodyReq('x'), gateData, 'photos', foreign, p(foreign)).error
      )
    ).toMatch(/有效的访客身份/);
    // 409:身份对不上(本人 ≠ 归属),以及无归属存量
    expect(names.decideAnonWhiteboard(asStranger, gateData, 'photos', mine, p(mine))).toMatchObject(
      { verdict: 'reject', code: 409 }
    );
    expect(
      names.decideAnonWhiteboard(asOwner, gateData, 'photos', legacy, p(legacy))
    ).toMatchObject({ verdict: 'reject', code: 409 });
    // overwrite:本人重保存既有作品(允许截断)
    expect(names.decideAnonWhiteboard(asOwner, gateData, 'photos', mine, p(mine))).toEqual({
      verdict: 'overwrite',
    });
    // issue:新作品 ⇒ 服务端签发名(不是前端拼的那一个),且文件不存在也不给记录
    const fresh = 'whiteboard-front-picked.png';
    const d = names.decideAnonWhiteboard(asOwner, gateData, 'photos', fresh, p(fresh));
    expect(d.verdict).toBe('issue');
    expect(d.name).not.toBe(fresh);
    expect(/^whiteboard-\d{8}-\d{6}-[0-9a-f]{8}\.png$/.test(d.name)).toBe(true);
    delete gateData.uploads[mine];
    delete gateData.uploads[foreign];
    delete gateData.uploads[legacy];
    delete gateData.applicants[VID];
    delete gateData.applicants['vid-names-B'];
  });

  it('独占创建:wx 撞名就换服务端新名重试,绝不写到别人的文件上;非独占则按既有语义截断', () => {
    const dirPath = path.join(tmpDir, 'open-targets');
    fs.mkdirSync(dirPath, { recursive: true });
    const taken = 'whiteboard-taken.png';
    fs.writeFileSync(path.join(dirPath, taken), 'SOMEONE-ELSE');

    const ex = names.openWriteTarget(dirPath, taken, true); // exclusiveNew
    expect(ex.fd).not.toBeNull();
    expect(ex.finalName).not.toBe(taken); // 换成了服务端签发的另一个名字
    expect(/^whiteboard-\d{8}-\d{6}-[0-9a-f]{8}\.png$/.test(ex.finalName)).toBe(true);
    fs.closeSync(ex.fd);
    expect(fs.readFileSync(path.join(dirPath, taken), 'utf8')).toBe('SOMEONE-ELSE'); // 他人字节未动
    fs.unlinkSync(ex.filePath);

    const noEx = names.openWriteTarget(dirPath, taken, false); // 后台/本人重保存:'w' 截断照旧
    expect(noEx.fd).not.toBeNull();
    fs.closeSync(noEx.fd);
    expect(fs.readFileSync(path.join(dirPath, taken), 'utf8')).toBe(''); // 截断=既有语义
    const err = names.openWriteTarget(dirPath, taken, true);
    expect(err.fd).not.toBeNull(); // 有独占重试 ⇒ 不会把 EEXIST 交回调用方
    fs.closeSync(err.fd);
    fs.unlinkSync(err.filePath);

    const bad = names.openWriteTarget(path.join(tmpDir, 'no-such-dir'), 'whiteboard-z.png', false);
    expect(bad.fd).toBeNull();
    expect(bad.error && bad.error.code).toBe('ENOENT'); // 目录都不存在 = 500 那条路(调用方按 error 判)
  });
});

describe('lib/upload/quota.js — 预约体积口径与还位对称', () => {
  const dirPath = path.join(tmpDir, 'photos');
  beforeEach(() => {
    abuse._resetUploadSlots();
    abuse._setDiskFreeBytes(64 * 1024 * 1024 * 1024);
    abuse._setMediaBytes(0);
  });
  afterEach(() => {
    abuse._resetUploadSlots();
  });
  const slots = () => abuse.uploadSlotStats();

  it('匿名侧没带 Content-Length 就按 8MB 预约;带了就按声明值;admin 没声明记 0(不开空头)', () => {
    const anon = quota.reserve('whiteboard', 0, dirPath);
    expect(anon.bytes).toBe(abuse.SLOT_RESERVE_FALLBACK);
    anon.release();
    const declared = quota.reserve('public', 1024 * 1024, dirPath);
    expect(declared.bytes).toBe(1024 * 1024);
    declared.release();
    const admin = quota.reserve('admin', 0, dirPath);
    expect(admin.bytes).toBe(0);
    admin.release();
    expect(slots().inflight).toBe(0);
    expect(slots().reserved).toBe(0);
  });

  it('release 幂等:同一条上传被多条结束路径各还一次,也只还一位', () => {
    const h = quota.reserve('public', 2048, dirPath);
    expect(slots().inflight).toBe(1);
    expect(h.release()).toBe(true);
    expect(h.release()).toBe(false);
    expect(h.release()).toBe(false);
    expect(slots().inflight).toBe(0);
    expect(slots().reserved).toBe(0);
  });

  it('probe(分片首片探测)判完即还:不占用在途名额,拒绝时回 503 + Retry-After', () => {
    const before = slots().inflight;
    const p = quota.probe('public', 4096, dirPath);
    expect(p.allow).toBe(true);
    expect(slots().inflight).toBe(before); // 已经还掉了
    abuse._setDiskFreeBytes(1024 * 1024); // 1MB:远低于水位
    const res = fakeRes();
    const rejected = quota.probe('public', 4096, dirPath);
    expect(rejected.allow).toBe(false);
    quota.reject(res, rejected);
    expect(res.code).toBe(503);
    expect(res.json().reason).toBe('lowdisk');
    expect(String(res.sentHeaders['retry-after'])).toBe(String(abuse.RETRY_AFTER_S));
    expect(slots().inflight).toBe(0); // 被拒者一个字节没写、也没留在途账
  });

  it('reject 直接吃 abuse 的原始返回(末片合并被拒那条路)形态一致', () => {
    abuse._setMediaBytes(abuse.DISK_MAX + 1024 * 1024 * 1024);
    const raw = abuse.reserveUploadSlot('public', 1024, dirPath);
    expect(raw.allow).toBe(false);
    const res = fakeRes();
    quota.reject(res, raw);
    expect(res.code).toBe(503);
    expect(res.json().reason).toBe('capacity');
    expect(String(res.json().error)).toMatch(/存储容量或写入并发已达上限/);
    expect(res.json().retryAfter).toBe(abuse.RETRY_AFTER_S);
  });

  it('低水位 ⇒ 匿名一律拒、admin 一律放行(主人自己要传,也只有他能清盘)', () => {
    abuse._setDiskFreeBytes(1024 * 1024);
    expect(quota.reserve('public', 1024, dirPath).allow).toBe(false);
    expect(quota.reserve('whiteboard', 1024, dirPath).allow).toBe(false);
    const admin = quota.reserve('admin', 1024, dirPath);
    expect(admin.allow).toBe(true);
    admin.release();
  });
});

describe('lib/upload/stream.js — 四件套与"每条结束路径都还位"', () => {
  const dirPath = path.join(tmpDir, 'stream');
  fs.mkdirSync(dirPath, { recursive: true });
  beforeEach(() => {
    abuse._resetUploadSlots();
    abuse._setDiskFreeBytes(64 * 1024 * 1024 * 1024);
    abuse._setMediaBytes(0);
  });
  afterEach(() => {
    abuse._resetUploadSlots();
  });

  function writeGuard(body, opts = {}) {
    const filePath = path.join(dirPath, 'out-' + Math.random().toString(36).slice(2) + '.jpg');
    const fd = fs.openSync(filePath, 'wx');
    const ws = fs.createWriteStream(filePath, { fd });
    const req = bodyReq(body, opts.reqOpts || {});
    const res = fakeRes();
    const slot = quota.reserve('public', stream.contentLength(req), dirPath);
    const log = { finish: 0, error: 0, aborts: 0, responded: [] };
    const st = stream.guard(req, ws, {
      maxBytes: opts.maxBytes === undefined ? 10 : opts.maxBytes,
      filePath,
      overflow: { code: 413, message: '图片不能超过 50MB' },
      release: slot.release,
      disconnect: opts.disconnect !== false,
      respond: (code, message) => {
        log.responded.push([code, message]);
        if (opts.realRespond !== false) sendError(res, code, message);
      },
      onAbort: () => {
        log.aborts += 1;
      },
      onFinish: () => {
        log.finish += 1;
        log.bytes = st.bytes();
        sendOk(res, { ok: true, name: path.basename(filePath) });
      },
      onError: () => {
        log.error += 1;
      },
    });
    return { req, res, st, log, filePath, slot, inflight: () => abuse.uploadSlotStats().inflight };
  }
  function sendError(res, code, message) {
    res.writeHead(code, {});
    res.end(JSON.stringify({ error: message }));
  }
  function sendOk(res, body) {
    res.writeHead(201, {});
    res.end(JSON.stringify(body));
  }

  it('正常完成:回 201 那条路之外不重复响应,还位一次、在途归零', async () => {
    const t = writeGuard('hello', { maxBytes: 100 });
    await waitRes(t.res);
    expect(t.log.finish).toBe(1);
    expect(t.log.bytes).toBe(5);
    expect(t.inflight()).toBe(0);
    expect(fs.readFileSync(t.filePath, 'utf8')).toBe('hello');
  });

  it('流式计数越界:destroy→unlink→还位→413→断连,一次都不许多', async () => {
    const t = writeGuard('A'.repeat(40), { maxBytes: 10, reqOpts: { cl: 40 } });
    await waitRes(t.res);
    expect(t.log.responded).toEqual([[413, '图片不能超过 50MB']]);
    expect(t.log.aborts).toBe(1);
    expect(t.log.finish).toBe(0); // 超限的 finish 被挡在门外(否则会给已响应的 res 再回一次)
    expect(t.st.over()).toBe(true);
    expect(t.inflight()).toBe(0);
    await new Promise((r) => setTimeout(r, 60));
    expect(fs.existsSync(t.filePath)).toBe(false); // 半成品不留盘
  });

  it('Content-Length 预检读数:畸形/缺失/非正一律按"没声明"(0),负数不当超大', () => {
    expect(stream.contentLength({ headers: { 'content-length': '123' } })).toBe(123);
    expect(stream.contentLength({ headers: {} })).toBe(0);
    expect(stream.contentLength({ headers: { 'content-length': 'abc' } })).toBe(0);
    expect(stream.contentLength({ headers: { 'content-length': '-5' } })).toBe(0);
    expect(stream.contentLength({})).toBe(0);
    expect(stream.overContentLength({ headers: { 'content-length': '11' } }, 10)).toBe(true);
    expect(stream.overContentLength({ headers: { 'content-length': '10' } }, 10)).toBe(false); // 等于上限不放行拒
  });

  it('客户端断连:aborted/close 都接到还位(幂等),在途不泄漏', async () => {
    const req = bodyReq(null, { cl: 64 });
    const filePath = path.join(dirPath, 'abort-' + Math.random().toString(36).slice(2) + '.jpg');
    const ws = fs.createWriteStream(filePath, { fd: fs.openSync(filePath, 'wx') });
    const slot = quota.reserve('public', 64, dirPath);
    stream.guard(req, ws, {
      maxBytes: 1024,
      filePath,
      release: slot.release,
      disconnect: true,
      respond: () => {},
      onFinish: () => {},
      onError: () => {},
    });
    req.push(Buffer.alloc(16, 0x41));
    await new Promise((r) => setImmediate(r));
    expect(abuse.uploadSlotStats().inflight).toBe(1); // 正在写,确实占着一个位
    req.destroy();
    await new Promise((r) => setImmediate(r));
    expect(abuse.uploadSlotStats().inflight).toBe(0); // 断连路径也释放(不留永久泄漏)
    expect(abuse.uploadSlotStats().reserved).toBe(0);
    fs.unlink(filePath, () => {});
  });

  it('不接断连(disconnect=false,大屏/分片那条路的既有口径)时,finish/error 仍各自只走一次', async () => {
    const t = writeGuard('abcdef', { maxBytes: 100, disconnect: false });
    await waitRes(t.res);
    expect(t.log.finish).toBe(1);
    expect(t.inflight()).toBe(0);
  });

  it('分片合并的账本口径:每片累计实字节即时闸能拿到累计值,超预算即拒且残片清零', async () => {
    const ownerKey = 'dkprobe';
    const name = 'acc-probe.jpg';
    const dirPath2 = path.join(tmpDir, 'photos');
    fs.mkdirSync(dirPath2, { recursive: true });
    chunksMod._resetChunkState();
    const id = chunksMod.ledgerId('ip', ownerKey, 'photos', name);
    expect(chunksMod.beginInflight('ip', id, 1000)).toBe(null);
    const p0 = chunksMod.partPath(ownerKey, name, 0);
    fs.mkdirSync(chunksMod.CHUNK_DIR, { recursive: true });
    fs.writeFileSync(p0, 'A'.repeat(10));
    chunksMod.addInflightBytes('ip', id, 10);
    expect(chunksMod.ledgerBytes(id)).toBe(10);
    expect(chunksMod.inflightStats().tracked).toBe(1);
    chunksMod.dropChunks(ownerKey, name);
    chunksMod.releaseInflight(id);
    expect(chunksMod.inflightStats().tracked).toBe(0);
    expect(chunksMod.inflightStats().uploads).toBe(0);
    expect(fs.existsSync(p0)).toBe(false);
  });
});

// =====================================================================
// M-18(2026-10-14)——"每条结束路径只还一次位"原先是**调用方**的义务(quota.js 里那块 freed 牌),
// 不是 stream.guard 自己的契约。本组把它钉成本模块的契约。
// ⚠️ 判据必须用朴素非幂等计数器:上面那些用例传的是 slot.release,它调 2 次也只减 1 次,
//    拿它来断言"只还一次"等于什么都没测 —— 这正是审计里"今天没有现役漏洞"与"保证放错了地方"的分界。
describe('lib/upload/stream.js — release() 自我幂等:各结束路径合计只调一次', () => {
  const dirPath = path.join(tmpDir, 'stream-once');
  fs.mkdirSync(dirPath, { recursive: true });

  function naiveGuard(body, opts = {}) {
    const filePath = path.join(dirPath, 'n-' + Math.random().toString(36).slice(2) + '.jpg');
    const ws = fs.createWriteStream(filePath, { fd: fs.openSync(filePath, 'wx') });
    const req = bodyReq(body, opts.reqOpts || {});
    const res = fakeRes();
    const box = { calls: 0, finish: 0, error: 0, aborts: 0, responded: [] };
    stream.guard(req, ws, {
      maxBytes: opts.maxBytes === undefined ? 100 : opts.maxBytes,
      filePath,
      overflow: { code: 413, message: '图片不能超过 50MB' },
      release: () => {
        box.calls += 1; // 朴素计数:后面每多一次就是真多还了一次位
      },
      disconnect: opts.disconnect !== false,
      respond: (code, message) => {
        box.responded.push([code, message]);
        res.writeHead(code, {});
        res.end(JSON.stringify({ error: message }));
      },
      onAbort: () => {
        box.aborts += 1;
      },
      onFinish: () => {
        box.finish += 1;
        res.writeHead(201, {});
        res.end('{}');
      },
      onError: () => {
        box.error += 1;
      },
    });
    return { req, res, box, filePath };
  }
  const settle = (ms) => new Promise((r) => setTimeout(r, ms));

  it('正常成功:finish 之后 req 的 close 也 fire,但还位只调一次', async () => {
    const t = naiveGuard('hello', { maxBytes: 100 });
    await waitRes(t.res);
    await settle(40); // 等 req 的 close 赶上来(它比 res 结束晚)
    expect(t.box.finish).toBe(1);
    expect(t.box.calls).toBe(1);
    expect(fs.readFileSync(t.filePath, 'utf8')).toBe('hello');
  });

  it('越限中止:abort 内一次 + ws error + req close 也会各来一次,合计仍是一次', async () => {
    const t = naiveGuard('A'.repeat(40), { maxBytes: 10, reqOpts: { cl: 40 } });
    await waitRes(t.res);
    await settle(60);
    expect(t.box.aborts).toBe(1);
    expect(t.box.responded).toEqual([[413, '图片不能超过 50MB']]);
    expect(t.box.calls).toBe(1);
  });

  it('客户端断连:线上是 aborted 然后 close 两个事件,合计仍只还一次', async () => {
    const t = naiveGuard(null, { maxBytes: 1024, reqOpts: { cl: 64 } });
    t.req.push(Buffer.alloc(16, 0x41));
    await new Promise((r) => setImmediate(r));
    expect(t.box.calls).toBe(0); // 还在写,一个字节都没还
    // 真实 IncomingMessage 被客户端掐断时先 aborted 再 close;手工 Readable 只给 close,
    // 所以按线上形态补这一次 aborted —— 不补的话这个用例退化成"只走一条路",断不了幂等。
    t.req.emit('aborted');
    t.req.destroy();
    await settle(60);
    expect(t.box.calls).toBe(1);
    try {
      fs.unlinkSync(t.filePath);
    } catch {
      /* Windows 句柄未放时清不掉就算了,不影响断言 */
    }
  });

  it('调用方没给 release(分片/大屏那两条不占槽位的既有口径)时,一律安静跳过不抛', async () => {
    const filePath = path.join(dirPath, 'no-rel-' + Math.random().toString(36).slice(2) + '.jpg');
    const ws = fs.createWriteStream(filePath, { fd: fs.openSync(filePath, 'wx') });
    const req = bodyReq('abc', { cl: 3 });
    const res = fakeRes();
    let finished = 0;
    stream.guard(req, ws, {
      maxBytes: 100,
      filePath,
      disconnect: true,
      respond: () => {},
      onFinish: () => {
        finished += 1;
        res.writeHead(201, {});
        res.end('{}');
      },
      onError: () => {},
    });
    await waitRes(res);
    await settle(40);
    expect(finished).toBe(1);
  });
});

// =====================================================================
// ⑤ 分片视频"空闲补转"(2026-10-13,主人拍板的第三条路)
// 分片通道有意不进实时压缩队列 ⇒ 走它的 .mov/.mkv 永远不容器归一,而直传会。补法是"启动 + 每小时
// 扫一轮投进同一个单工位队列",判据必须窄到不会误伤主人手工 scp 的归档文件:
//   ① 只吃 gateData.uploads 里有归属记录的名字(改名 = 搬归属 + PUT 新 R2 对象,不可逆对外动作);
//   ② 盘余低于水位、或**水位取不到** ⇒ 整批不捡;
//   ③ 每轮限量;④ 只碰 videos/ 根(户外大屏/ 与 hls/ 切片是另一套资产),点开头与 .bak 不参与。
describe('lib/upload/transcode.js — 分片视频补转的判据与三道闸', () => {
  const transcode = nodeRequire('../../lib/upload/transcode.js');
  const filesUpload = nodeRequire('../../lib/files-upload.js');
  const MB = 1024 * 1024,
    GB = 1024 * MB;

  it('needsNormalize:只认"浏览器可能放不出来"的容器,mp4/webm/图片都不算', () => {
    expect(transcode.needsNormalize('a.mov')).toBe(true);
    expect(transcode.needsNormalize('a.MKV')).toBe(true); // 大小写混来的名字也要认
    expect(transcode.needsNormalize('a.m4v')).toBe(true);
    expect(transcode.needsNormalize('a.mp4')).toBe(false); // 已是目标格式
    expect(transcode.needsNormalize('a.webm')).toBe(false); // 能播,补转它只省磁盘不修可用性
    expect(transcode.needsNormalize('a.jpg')).toBe(false);
    expect(transcode.needsNormalize('noext')).toBe(false);
    expect(transcode.needsNormalize('')).toBe(false);
    expect(transcode.needsNormalize(null)).toBe(false);
  });

  it('pickPending:只挑"访客上传 + videos 根 + 非点开头 + 非 .bak"的那批,并按名字稳定排序', () => {
    const uploads = { 'z-a.mov': { aid: 'v1' }, 'b.mkv': { aid: 'v2' } };
    const dir = [
      'z-a.mov', // ✓ 有归属
      'b.mkv', // ✓ 有归属
      'owner-archive.avi', // ✗ 主人手工 scp 的归档(无归属记录)—— 绝不能在别人脚下改名
      'c.mp4', // ✗ 已是 mp4
      '.compressing.d.mov', // ✗ 压缩临时文件
      'e.mov.bak-20261013', // ✗ 备份文件
      '户外大屏/f.mkv', // ✗ 带路径(大屏轮播片是另一套资产)
      'whiteboard-1.png', // ✗ 不是视频
    ];
    expect(transcode.pickPending(dir, uploads)).toEqual(['b.mkv', 'z-a.mov']);
    expect(transcode.pickPending(dir, {})).toEqual([]); // 一条归属都没有 ⇒ 一个都不捡
    expect(transcode.pickPending(null, uploads)).toEqual([]); // 目录读不出来不能抛
  });

  it('queuePending:每轮限量,且把 dir/名字/mirror 原样交给压缩队列', () => {
    const seen = [];
    const spy = (dir, name, mirror) => seen.push([dir, name, typeof mirror]);
    const list = ['1.mov', '2.mov', '3.mov', '4.mov', '5.mov'];
    const r = transcode.queuePending({
      list,
      mirror: () => {},
      freeBytes: 10 * GB,
      minFree: 2 * GB,
      max: 3,
      enqueue: spy,
    });
    expect(r.skipped).toBe(null);
    expect(r.enqueued).toEqual(['1.mov', '2.mov', '3.mov']);
    expect(seen).toEqual([
      ['videos', '1.mov', 'function'],
      ['videos', '2.mov', 'function'],
      ['videos', '3.mov', 'function'],
    ]);
  });

  it('queuePending:盘余低于水位 ⇒ 整批不捡;水位取不到(null/NaN)⇒ 同样不捡(判不了就停手)', () => {
    const spy = () => {
      throw new Error('被调用即错:被拒的批次不该碰到队列');
    };
    const list = ['a.mov'];
    expect(
      transcode.queuePending({ list, freeBytes: 1 * GB, minFree: 2 * GB, enqueue: spy })
    ).toMatchObject({ enqueued: [], skipped: 'lowdisk' });
    expect(
      transcode.queuePending({ list, freeBytes: null, minFree: 2 * GB, enqueue: spy })
    ).toMatchObject({ enqueued: [], skipped: 'nostats' });
    expect(
      transcode.queuePending({ list, freeBytes: NaN, minFree: 2 * GB, enqueue: spy })
    ).toMatchObject({ enqueued: [], skipped: 'nostats' });
    expect(
      transcode.queuePending({ list: [], freeBytes: 10 * GB, minFree: 2 * GB, enqueue: spy })
    ).toMatchObject({ enqueued: [], skipped: null }); // 本来就没活,不算跳过
  });

  it('sweepVideoNormalize:读目录 + 归属判定串起来,三道闸各挡一次', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-norm-'));
    for (const n of ['x.mov', 'y.mp4', 'z.mkv']) fs.writeFileSync(path.join(dir, n), 'x');
    const saved = gateData.uploads;
    gateData.uploads = { 'x.mov': { aid: 'v' }, 'z.mkv': { aid: 'v' } }; // y.mp4 有归属但不该被捡
    try {
      const seen = [];
      const r = filesUpload.sweepVideoNormalize({
        dirPath: dir,
        freeBytes: 50 * GB,
        minFree: 2 * GB,
        max: 5,
        enqueue: (d, n) => seen.push(d + '/' + n),
      });
      expect(r.enqueued).toEqual(['x.mov', 'z.mkv']);
      expect(seen).toEqual(['videos/x.mov', 'videos/z.mkv']);
      // 水位不足:一个都不捡
      expect(
        filesUpload.sweepVideoNormalize({
          dirPath: dir,
          freeBytes: MB,
          minFree: 2 * GB,
          enqueue: () => {
            throw new Error('不该入队');
          },
        }).skipped
      ).toBe('lowdisk');
      // 目录不存在 = 判不了,不是"没活"
      expect(
        filesUpload.sweepVideoNormalize({ dirPath: path.join(dir, 'nope'), freeBytes: 50 * GB })
          .skipped
      ).toBe('nodir');
    } finally {
      gateData.uploads = saved;
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* Windows 句柄未放时清不掉就算了,不影响断言 */
      }
    }
  });

  it('start/stop 幂等,定时器不重复挂(与分片 GC 同一套句柄纪律)', () => {
    const saved = gateData.uploads;
    gateData.uploads = {}; // 真 videos/ 目录 + 空归属 ⇒ 本轮零候选,不会 spawn ffmpeg
    try {
      expect(filesUpload.stopVideoNormalize()).toBe(false); // 没起过 ⇒ 停不出东西,也不报错
      expect(filesUpload.startVideoNormalize()).toBe(true);
      expect(filesUpload.videoNormalizeOn()).toBe(true);
      expect(filesUpload.startVideoNormalize()).toBe(false); // 二次启动不叠定时器
      expect(filesUpload.stopVideoNormalize()).toBe(true);
      expect(filesUpload.videoNormalizeOn()).toBe(false);
      expect(filesUpload.stopVideoNormalize()).toBe(false);
    } finally {
      gateData.uploads = saved;
    }
  });
});

describe('lib/upload/transcode.js — 补转投进队列后炸不出异常(名字对应的文件不在盘上也要安静)', () => {
  const transcode = nodeRequire('../../lib/upload/transcode.js');
  it('compressJob 收到一个磁盘上不存在的名字 ⇒ 不抛、不外泄,队列自己清空', async () => {
    const bogus = 'dg-normalize-does-not-exist-' + Date.now() + '.mov';
    expect(() => transcode.compressJob('videos', bogus, () => {})).not.toThrow();
    // 队列是单工位 + 每步 1s 间隔;这里只需要它不炸,不需要真转码完成
    await new Promise((r) => setTimeout(r, 1100));
  });
});

describe('lib/upload/transcode.js — queuePending 只报"真的排进去了"的', () => {
  const transcode = nodeRequire('../../lib/upload/transcode.js');
  it('enqueue 返回 false(同名已在飞或已排队)就不计进 enqueued,日志不虚报捡了几个', () => {
    const r = transcode.queuePending({
      list: ['a.mov', 'b.mov', 'c.mov'],
      freeBytes: 10 * 1024 * 1024 * 1024,
      minFree: 2 * 1024 * 1024 * 1024,
      max: 5,
      enqueue: (d, n) => n !== 'b.mov', // 模拟 b 这件已在队列里被去重
    });
    expect(r.enqueued).toEqual(['a.mov', 'c.mov']);
    expect(r.skipped).toBe(null);
  });
});
