// lib-r2-outbox.test.js — R2 对象同步的持久待发台账(2026-10-11 外部审计 P2:R2 可靠化)
// 钉死七件事(每一条都是"CDN 长期缺席该对象"的直接成因/后果):
//   ① 失败条目按 30s→2m→10m→1h→6h 封顶的阶梯重试,成功才出账,且台账文件里不再留这条;
//   ② 台账跨"重启"仍在(内存清掉后从盘上读回 attempts/nextRetryAt);
//   ③ 写盘去抖批量:N 次变更只落有限次盘(全成功路径更是一个字节都不落,不去抢 gate_data 的锁);
//   ④ 上限淘汰必留可见日志(点名 key + 说清"丢的只是自动重试,源站文件仍是权威"),绝不静默;
//   ⑤ stopOutbox() 后 vi.getTimerCount()===0(定时器全 unref 且句柄收干净)、startOutbox() 幂等;
//   ⑥ 台账文件半截 JSON 时不崩、能重建;
//   ⑦ 上传成功路径与 outbox 不重复推送:同 key 只一次在途。
// 约定同 lib-tts.test.js / lib-upload-overwrite.test.js:lib/*.js 是 CJS,用 createRequire 共享 require 缓存;
// GATE_DATA_FILE / R2_OUTBOX_FILE / CHUNK_DIR 全部在 require 任何 lib/*.js 之前重定向到系统临时目录;
// r2sync 在加载前打 require.cache 桩 ⇒ 零真网络、零 Cloudflare 花费。
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-r2outbox-'));
const LEDGER = path.join(TMP, '.r2-outbox.json');
const SRCDIR = path.join(TMP, 'media');
fs.mkdirSync(SRCDIR, { recursive: true });

process.env.GATE_DATA_FILE = path.join(TMP, 'gate_data.json');
process.env.CHUNK_DIR = path.join(TMP, 'chunks');
process.env.R2_OUTBOX_FILE = LEDGER;
delete process.env.R2_OUTBOX_DISABLE;
// 本文件用到的可调参数(用例里临时改的,收尾一律还原,免得牵连同进程的其他套件)
const ENV_KEYS = [
  'R2_OUTBOX_FILE',
  'R2_OUTBOX_DIR',
  'R2_OUTBOX_DISABLE',
  'R2_OUTBOX_MAX',
  'R2_OUTBOX_FLUSH_MS',
  'R2_OUTBOX_FLUSH_BATCH',
  'R2_OUTBOX_PUMP_MS',
  'R2_OUTBOX_INFLIGHT',
  'R2_OUTBOX_BURST_INFLIGHT',
  'R2_OUTBOX_BACKOFF_MS',
  'R2_OUTBOX_BACKOFF_CAP_MS',
];
const envSnap = {};
for (const k of ENV_KEYS) envSnap[k] = process.env[k];

// ---------- r2sync 全桩(网络层一条都不出) ----------
const r2syncId = nodeRequire.resolve('../../lib/r2sync.js');
const r2PutMock = vi.fn(() => Promise.resolve(true));
const r2DeleteMock = vi.fn(() => Promise.resolve(true));
nodeRequire.cache[r2syncId] = {
  id: r2syncId,
  filename: r2syncId,
  loaded: true,
  path: path.dirname(r2syncId),
  exports: {
    r2Put: r2PutMock,
    r2Delete: r2DeleteMock,
    r2Stats: () => ({ ok: 11, fail: 2, retry: 5 }),
  },
};

const outbox = nodeRequire('../../lib/r2outbox.js');
const security = nodeRequire('../../lib/security.js');
const { ROOT } = nodeRequire('../../lib/config.js');
const { gateData } = nodeRequire('../../lib/store.js');
// 空库(全新检出/CI)时 gateData 只有 {secret,applicants,stats};本文件自己播种需要的容器,
// 不依赖"恰好被别的模块顺手建了"(2026-10-11 CI 假红的根因)。
gateData.uploads = gateData.uploads || {};
gateData.photoCaptions = gateData.photoCaptions || {};
gateData.alerts = gateData.alerts || [];
gateData.applicants = gateData.applicants || {};

// ---------- 小工具 ----------
const BASE_NOW = 1760000000000;
let seq = 0;
function srcFile(tag = 'obj') {
  const p = path.join(SRCDIR, `${tag}-${seq++}.jpg`);
  fs.writeFileSync(p, 'fake-media-bytes');
  return p;
}
// 只做微任务轮转:桩返回的是已 resolve 的 promise,不需要真定时器
async function tick(times = 8) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}
function readLedger() {
  return JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
}
let warns = [];
let logs = [];

beforeEach(() => {
  vi.useFakeTimers({ now: BASE_NOW });
  outbox._reset(); // 清内存台账 + 删台账文件 + 强制重新读盘
  r2PutMock.mockReset();
  r2PutMock.mockResolvedValue(true);
  r2DeleteMock.mockReset();
  r2DeleteMock.mockResolvedValue(true);
  warns = [];
  logs = [];
  vi.spyOn(console, 'warn').mockImplementation((...a) => {
    warns.push(a.join(' '));
  });
  vi.spyOn(console, 'log').mockImplementation((...a) => {
    logs.push(a.join(' '));
  });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const k of ENV_KEYS) {
    if (envSnap[k] === undefined) delete process.env[k];
    else process.env[k] = envSnap[k];
  }
  process.env.R2_OUTBOX_FILE = LEDGER; // 参数快照可能刚被用例改过,这里钉回本文件的临时台账
});
afterAll(() => {
  try {
    for (const f of fs.readdirSync(TMP)) fs.unlinkSync(path.join(TMP, f));
    fs.rmdirSync(TMP);
  } catch {
    /* 清不掉不影响结论 */
  }
});

// =========================================================================
describe('台账落点与公网可见性', () => {
  it('默认落在仓库根的 .r2-outbox.json,且被 staticDenied() 三重挡住公网', () => {
    delete process.env.R2_OUTBOX_FILE;
    delete process.env.R2_OUTBOX_DIR;
    const file = outbox.outboxFile();
    expect(path.basename(file)).toBe('.r2-outbox.json');
    expect(path.dirname(file)).toBe(ROOT);
    const pub = { socket: { remoteAddress: '203.0.113.40' }, headers: { host: 'cloudbear.cloud' } };
    const rel = '.r2-outbox.json';
    // ①文件名以点开头 ②任意路径段以点开头 ③根级 .json(仅 manifest.json 豁免)+ 根级白名单不含它
    expect(security.staticDenied(rel, pub)).toBe(true);
    // 本地回环也一样挡(staticDenied 的点文件条不看来源)
    expect(
      security.staticDenied(rel, {
        socket: { remoteAddress: '127.0.0.1' },
        headers: { host: 'localhost:3000' },
      })
    ).toBe(true);
    // 临时文件同样挡住(写盘走 file + '.tmp')
    expect(security.staticDenied('.r2-outbox.json.tmp', pub)).toBe(true);
    process.env.R2_OUTBOX_FILE = LEDGER;
  });

  it('R2_OUTBOX_DIR 可把台账搬到 web root 之外(主人想要绝对隔离时用)', () => {
    delete process.env.R2_OUTBOX_FILE;
    const outside = path.join(TMP, 'outside-webroot');
    process.env.R2_OUTBOX_DIR = outside;
    const f = outbox.outboxFile();
    expect(f).toBe(path.join(outside, '.r2-outbox.json'));
    expect(f.startsWith(ROOT + path.sep)).toBe(false);
    delete process.env.R2_OUTBOX_DIR;
    process.env.R2_OUTBOX_FILE = LEDGER;
  });

  it('全成功路径零落盘:台账文件压根不出现(不给仓库/服务器添常驻小文件)', async () => {
    for (const n of ['a.jpg', 'b.jpg', 'c.jpg'])
      expect(await outbox.syncPut('photos', n, srcFile())).toBe('ok');
    await tick();
    expect(outbox.outboxStats().pending).toBe(0);
    expect(outbox.outboxStats().totals.writes).toBe(0);
    await vi.advanceTimersByTimeAsync(60000);
    expect(fs.existsSync(LEDGER)).toBe(false);
  });
});

// =========================================================================
describe('退避重试与出账(核心)', () => {
  it('backoffMs 阶梯:30s→2m→10m→1h,第 5 次起封顶 6h(永不放弃)', () => {
    expect(outbox.backoffMs(1)).toBe(30000);
    expect(outbox.backoffMs(2)).toBe(120000);
    expect(outbox.backoffMs(3)).toBe(600000);
    expect(outbox.backoffMs(4)).toBe(3600000);
    expect(outbox.backoffMs(5)).toBe(21600000);
    expect(outbox.backoffMs(99)).toBe(21600000);
  });

  it('失败按阶梯重试、未到期不推、成功后出账且台账文件里不再存在', async () => {
    const src = srcFile();
    r2PutMock.mockResolvedValue(false);

    expect(await outbox.syncPut('photos', 'late.jpg', src)).toBe('fail');
    expect(r2PutMock).toHaveBeenCalledTimes(1);
    expect(r2PutMock).toHaveBeenCalledWith('photos', 'late.jpg', src);
    let e = outbox.entryOf('photos', 'late.jpg');
    expect(e.attempts).toBe(1);
    expect(e.nextRetryAt - Date.now()).toBe(30000);
    expect(e.lastError).toContain('r2Put');

    // 去抖窗口到点:条目已经在盘上了
    await vi.advanceTimersByTimeAsync(2000);
    expect(readLedger().entries.map((x) => x.key)).toEqual(['photos/late.jpg']);

    // 未到期不推(现在 t+29999,退避要到 t+30000)
    await vi.advanceTimersByTimeAsync(27999);
    expect((await outbox.pumpNow()).attempted).toBe(0);
    expect(r2PutMock).toHaveBeenCalledTimes(1);

    // 30s 到点 → 第 2 次 → 退避 2m
    await vi.advanceTimersByTimeAsync(1);
    expect((await outbox.pumpNow()).attempted).toBe(1);
    expect(r2PutMock).toHaveBeenCalledTimes(2);
    e = outbox.entryOf('photos', 'late.jpg');
    expect(e.attempts).toBe(2);
    expect(e.nextRetryAt - Date.now()).toBe(120000);

    await vi.advanceTimersByTimeAsync(120000);
    await outbox.pumpNow();
    expect(outbox.entryOf('photos', 'late.jpg').nextRetryAt - Date.now()).toBe(600000);
    await vi.advanceTimersByTimeAsync(600000);
    await outbox.pumpNow();
    expect(outbox.entryOf('photos', 'late.jpg').nextRetryAt - Date.now()).toBe(3600000);
    await vi.advanceTimersByTimeAsync(3600000);
    await outbox.pumpNow();
    expect(outbox.entryOf('photos', 'late.jpg').nextRetryAt - Date.now()).toBe(21600000);
    expect(r2PutMock).toHaveBeenCalledTimes(5);

    // 成功:出账 + 台账文件里不再存在该条(这里连文件一起清掉,不留"空台账"孤儿)
    r2PutMock.mockResolvedValue(true);
    await vi.advanceTimersByTimeAsync(21600000);
    const r = await outbox.pumpNow();
    expect(r.ok).toBe(1);
    expect(outbox.outboxStats().pending).toBe(0);
    expect(outbox.pendingKeys()).toEqual([]);
    outbox.flush();
    expect(fs.existsSync(LEDGER)).toBe(false);
    expect(outbox.has('photos/late.jpg')).toBe(false);
  });

  it('刷屏控制:只在前两次与每第十次失败时告警(永不放弃但不吼一晚上)', async () => {
    r2PutMock.mockResolvedValue(false);
    await outbox.syncPut('photos', 'quiet.jpg', srcFile());
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(6 * 3600 * 1000);
      await outbox.pumpNow();
    }
    expect(outbox.entryOf('photos', 'quiet.jpg').attempts).toBe(4);
    const failWarns = warns.filter((w) => w.includes('[r2outbox] 第') && w.includes('次失败'));
    expect(failWarns.length).toBe(2); // 第 1、2 次说,第 3、4 次闭嘴
  });

  it('台账跨重启仍在:内存清空后从盘上读回 attempts/nextRetryAt 并继续重试', async () => {
    const src = srcFile();
    r2PutMock.mockResolvedValue(false);
    await outbox.syncPut('videos', 'big.mp4', src);
    outbox.flush();
    expect(fs.existsSync(LEDGER)).toBe(true);

    outbox._reset({ unlink: false }); // 模拟进程重启:内存台账清空、文件留着
    const s = outbox.outboxStats();
    expect(s.pending).toBe(1);
    const e = outbox.entryOf('videos', 'big.mp4');
    expect(e.attempts).toBe(1);
    expect(e.op).toBe('put');
    expect(e.srcPath).toBe(src);

    await vi.advanceTimersByTimeAsync(30001);
    r2PutMock.mockResolvedValue(true);
    expect((await outbox.pumpNow()).ok).toBe(1);
    expect(outbox.outboxStats().pending).toBe(0);
  });

  it('delete 也记账:失败留账按退避重试,成功才出账(源站已删而 R2 删除失败的反向分歧)', async () => {
    r2DeleteMock.mockResolvedValue(false);
    expect(await outbox.syncDelete('photos', 'gone.jpg')).toBe('fail');
    expect(outbox.entryOf('photos', 'gone.jpg').op).toBe('delete');
    expect(outbox.entryOf('photos', 'gone.jpg').nextRetryAt - Date.now()).toBe(30000);
    await vi.advanceTimersByTimeAsync(30001);
    await outbox.pumpNow();
    expect(r2DeleteMock).toHaveBeenCalledTimes(2);
    r2DeleteMock.mockResolvedValue(true);
    await vi.advanceTimersByTimeAsync(120001);
    expect((await outbox.pumpNow()).ok).toBe(1);
    expect(outbox.outboxStats().pending).toBe(0);
    outbox.flush();
    expect(fs.existsSync(LEDGER)).toBe(false);
  });

  it('源文件已消失 ⇒ 出账并说明理由(不静默、也不无限空推)', async () => {
    const src = srcFile();
    r2PutMock.mockResolvedValue(false);
    await outbox.syncPut('photos', 'vanished.jpg', src);
    fs.unlinkSync(src);
    await vi.advanceTimersByTimeAsync(30001);
    const before = r2PutMock.mock.calls.length;
    const r = await outbox.pumpNow();
    expect(r.skipped).toBe(1);
    expect(r2PutMock.mock.calls.length).toBe(before); // 没源文件就不再发请求
    expect(outbox.outboxStats().pending).toBe(0);
    expect(warns.some((w) => w.includes('出账(不再重试)') && w.includes('源文件已不在'))).toBe(
      true
    );
  });

  it('未配置 CF(r2Put 返回 null)⇒ 出账 + 只说一次,不在本地攒一仓库死账', async () => {
    r2PutMock.mockResolvedValue(null);
    expect(await outbox.syncPut('photos', 'dev.jpg', srcFile())).toBe('skipped');
    expect(await outbox.syncPut('photos', 'dev2.jpg', srcFile())).toBe('skipped');
    expect(outbox.outboxStats().pending).toBe(0);
    expect(warns.filter((w) => w.includes('未配置 CF_R2_TOKEN')).length).toBe(1);
  });
});

// =========================================================================
describe('写盘节流(写放大主因不能复活)', () => {
  it('N 次变更只落有限次盘:去抖窗口 + 攒够批量立刻落', async () => {
    r2PutMock.mockResolvedValue(false);
    // 只入账不推(纯记账路径):25 次变更 ⇒ 第 20 次同步落一次盘,其余等 2s 窗口合并
    for (let i = 0; i < 25; i++) outbox.enqueuePut('photos', `bulk-${i}.jpg`, srcFile());
    const afterEnqueue = outbox.outboxStats().totals.writes;
    expect(afterEnqueue).toBe(1); // FLUSH_BATCH=20 触发的那一次
    expect(outbox.outboxStats().totals.dirty).toBe(5);
    await vi.advanceTimersByTimeAsync(2000);
    expect(outbox.outboxStats().totals.writes).toBe(2); // 窗口到点合并落盘
    outbox.flush();
    expect(outbox.outboxStats().totals.writes).toBeLessThanOrEqual(3);
    expect(outbox.outboxStats().pending).toBe(25);
    expect(readLedger().entries.length).toBe(25);
    // 关键对比:落盘次数远小于变更次数(每次变更都落盘的老口径会写 25+ 次)
    expect(outbox.outboxStats().totals.writes).toBeLessThan(5);
  });

  it('参数改得了:R2_OUTBOX_FLUSH_BATCH/FLUSH_MS 立即生效(主人一眼改)', async () => {
    process.env.R2_OUTBOX_FLUSH_BATCH = '5';
    process.env.R2_OUTBOX_FLUSH_MS = '500';
    for (let i = 0; i < 5; i++) outbox.enqueuePut('photos', `tuned-${i}.jpg`, srcFile());
    expect(outbox.outboxStats().totals.writes).toBe(1); // 攒够 5 条即落
    for (let i = 5; i < 9; i++) outbox.enqueuePut('photos', `tuned-${i}.jpg`, srcFile());
    await vi.advanceTimersByTimeAsync(500);
    expect(outbox.outboxStats().totals.writes).toBe(2);
    expect(outbox.paramsSnapshot().flushBatch).toBe(5);
    expect(outbox.paramsSnapshot().flushMs).toBe(500);
  });
});

// =========================================================================
describe('上限淘汰必须可见(不得静默丢数据)', () => {
  it('超限淘汰最旧并在日志里点名 key + 说清"丢的只是自动重试"', () => {
    process.env.R2_OUTBOX_MAX = '3';
    for (let i = 0; i < 5; i++) outbox.enqueuePut('photos', `cap-${i}.jpg`, srcFile());
    const s = outbox.outboxStats();
    expect(s.pending).toBe(3);
    expect(s.totals.evicted).toBe(2);
    const evict = warns.filter((w) => w.includes('台账已满'));
    expect(evict.length).toBe(2);
    expect(evict[0]).toContain('放弃它的自动重试');
    expect(evict[0]).toContain('源站文件是权威');
    expect(evict[0]).toContain('photos/cap-0.jpg'); // 淘汰的是最旧那条
    expect(outbox.has('photos/cap-0.jpg')).toBe(false);
    expect(outbox.has('photos/cap-4.jpg')).toBe(true);
  });

  it('在途条目不被淘汰(否则白推一轮)', async () => {
    process.env.R2_OUTBOX_MAX = '2';
    let resolveFirst;
    r2PutMock.mockImplementation(
      () =>
        new Promise((res) => {
          resolveFirst = res;
        })
    );
    const p = outbox.syncPut('photos', 'busy.jpg', srcFile()); // 在途
    await tick();
    outbox.enqueuePut('photos', 'n1.jpg', srcFile());
    outbox.enqueuePut('photos', 'n2.jpg', srcFile());
    expect(outbox.outboxStats().pending).toBeLessThanOrEqual(2);
    expect(outbox.has('photos/busy.jpg')).toBe(true); // 在途的没被挤掉
    resolveFirst(true);
    expect(await p).toBe('ok');
  });
});

// =========================================================================
describe('启停与定时器卫生', () => {
  it('startOutbox() 幂等,启动即补推一次,stopOutbox() 后计时器句柄为 0', async () => {
    expect(outbox.startOutbox()).toBe(true);
    expect(outbox.startOutbox()).toBe(false); // 幂等:不起第二套定时器
    expect(outbox.outboxStats().started).toBe(true);
    r2PutMock.mockResolvedValue(false);
    await tick();
    expect(r2PutMock).toHaveBeenCalledTimes(0); // 启动补推时台账是空的,没推过任何东西
    outbox.enqueuePut('photos', 'due.jpg', srcFile());
    expect(r2PutMock).toHaveBeenCalledTimes(0); // 入账 ≠ 推送:推不推由 pump 决定(响应路径不等它)
    await outbox.pumpNow();
    expect(r2PutMock).toHaveBeenCalledTimes(1); // 到期的账由 pump 接手推
    expect(vi.getTimerCount()).toBeGreaterThan(0); // 周期 pump + 去抖窗口
    // 2026-10-14 M-17:stopOutbox() 以前 `flush(); return was;` —— 落盘成败被丢掉,调用方(server.js
    // 优雅关闭)把"没抛"读成"已落盘"。现在返回 { was, flushed, pending, error }。
    const st = outbox.stopOutbox();
    expect(st.was).toBe(true);
    expect(st.flushed).toBe(true); // 台账确实落成了
    expect(st.pending).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(outbox.stopOutbox().was).toBe(false); // 幂等
    expect(outbox.outboxStats().started).toBe(false);
  });

  it('注入:台账写坏 ⇒ flush()/stopOutbox() 报 false 且条数留在 pending(不谎称已落盘)', async () => {
    outbox.startOutbox();
    outbox.enqueuePut('photos', 'ledger-broken.jpg', srcFile());
    await tick();
    const good = outbox.flush();
    expect(good.ok).toBe(true); // 前置条件:换坏路径之前它本来是落得成的

    // 把台账文件位置换成一个**同名目录**:rename 与退回覆盖写都会 EISDIR/EPERM
    const blocked = path.join(TMP, 'blocked-ledger.json');
    fs.mkdirSync(blocked, { recursive: true });
    process.env.R2_OUTBOX_FILE = blocked;
    outbox.enqueuePut('photos', 'ledger-broken-2.jpg', srcFile());
    await tick();
    const bad = outbox.flush();
    expect(bad.ok).toBe(false);
    expect(bad.entries).toBeGreaterThan(0); // 以前这里返回的就是这个数,而且它长得像结论
    expect(bad.pending).toBeGreaterThan(0); // 没落成就不许说"已同步"
    expect(/EISDIR|EPERM| Directory/.test(bad.error)).toBe(true);
    const s = outbox.outboxStats();
    expect(s.lastWrite.ok).toBe(false); // 观测面也留了痕(admin 页/日志据此能看见)

    const stoppedWhileBroken = outbox.stopOutbox();
    expect(stoppedWhileBroken.flushed).toBe(false); // 关闭路径同样不能报假成功

    // 还原 ⇒ 下一次照常成立(一次写坏不会把台账打断;内存台账始终是唯一真相)
    process.env.R2_OUTBOX_FILE = LEDGER;
    outbox.startOutbox();
    outbox.enqueuePut('photos', 'ledger-ok-again.jpg', srcFile());
    await tick();
    const back = outbox.flush();
    expect(back.ok).toBe(true);
    expect(back.pending).toBe(0);
    outbox.stopOutbox();
  });

  it('周期 pump 自己会把到期条目再推一遍(没人再上传也自愈)', async () => {
    process.env.R2_OUTBOX_PUMP_MS = '60000';
    r2PutMock.mockResolvedValue(false);
    await outbox.syncPut('photos', 'tick.jpg', srcFile());
    expect(r2PutMock).toHaveBeenCalledTimes(1);
    outbox.startOutbox();
    await tick();
    await vi.advanceTimersByTimeAsync(30000);
    await tick();
    expect(r2PutMock).toHaveBeenCalledTimes(1); // 2m 后的下一轮才推?不:30s 退避已到,但周期是 60s
    await vi.advanceTimersByTimeAsync(30000);
    await tick();
    expect(r2PutMock).toHaveBeenCalledTimes(2); // 60s 周期到点,台账自己接手
    outbox.stopOutbox();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('R2_OUTBOX_DISABLE=1 只关台账,不关同步本身', async () => {
    process.env.R2_OUTBOX_DISABLE = '1';
    expect(await outbox.syncPut('photos', 'off.jpg', srcFile())).toBe('ok');
    expect(r2PutMock).toHaveBeenCalledTimes(1); // 该推还推
    expect(outbox.outboxStats().pending).toBe(0); // 但不记账
    expect(outbox.startOutbox()).toBe(false);
    await vi.advanceTimersByTimeAsync(120000);
    expect(fs.existsSync(LEDGER)).toBe(false); // 一个字节都不落
    expect(vi.getTimerCount()).toBe(0);
  });
});

// =========================================================================
describe('台账文件损坏(半截 JSON)不崩、能重建', () => {
  it('JSON.parse 炸了也只是告警 + 重建,后续变更照常覆盖写回合法 JSON', async () => {
    fs.writeFileSync(LEDGER, '{"v":1,"entries":[{"key":"photos/a'); // 写盘途中掉电的形状
    outbox._reset({ unlink: false }); // 模拟重启:强制读这份坏文件
    expect(() => outbox.outboxStats()).not.toThrow();
    expect(outbox.outboxStats().pending).toBe(0);
    expect(warns.some((w) => w.includes('台账文件损坏') && w.includes('重建为空台账'))).toBe(true);
    // 重建:一次变更就把文件纠回合法 JSON
    r2PutMock.mockResolvedValue(false);
    await outbox.syncPut('photos', 'rebuild.jpg', srcFile());
    outbox.flush();
    const raw = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
    expect(raw.entries.length).toBe(1);
    expect(raw.entries[0].key).toBe('photos/rebuild.jpg');
    expect(outbox.outboxStats().totals.evicted).toBe(0);
  });

  it('形态不合法的条目逐条忽略,不整本放弃、也不崩', () => {
    fs.writeFileSync(
      LEDGER,
      JSON.stringify({
        v: 1,
        entries: [
          null,
          'string-row',
          { name: '' },
          {
            key: 'photos/ok.jpg',
            dir: 'photos',
            name: 'ok.jpg',
            op: 'put',
            srcPath: srcFile(),
            attempts: 3,
            nextRetryAt: 123,
            ts: 456,
          },
          {
            key: 'videos/ok.mp4',
            dir: 'videos',
            name: 'ok.mp4',
            op: 'delete',
            attempts: 'NaN-ish',
            nextRetryAt: -5,
            ts: 'nope',
          },
        ],
      })
    );
    outbox._reset({ unlink: false });
    expect(outbox.outboxStats().pending).toBe(2);
    const a = outbox.entryOf('photos', 'ok.jpg');
    expect(a.attempts).toBe(3);
    expect(a.nextRetryAt).toBe(123);
    const b = outbox.entryOf('videos', 'ok.mp4');
    expect(b.op).toBe('delete');
    expect(b.attempts).toBe(0); // 非数字归零,不炸
  });

  it('读盘时超限同样可见(不把重启后的老账静默吃掉)', () => {
    process.env.R2_OUTBOX_MAX = '2';
    fs.writeFileSync(
      LEDGER,
      JSON.stringify({
        v: 1,
        entries: [0, 1, 2, 3].map((i) => ({
          key: `photos/r-${i}.jpg`,
          dir: 'photos',
          name: `r-${i}.jpg`,
          op: 'put',
          srcPath: srcFile(),
          attempts: 1,
          nextRetryAt: 0,
          ts: BASE_NOW + i,
        })),
      })
    );
    outbox._reset({ unlink: false });
    expect(outbox.outboxStats().pending).toBe(2);
    expect(outbox.outboxStats().totals.evicted).toBe(2);
    expect(warns.filter((w) => w.includes('台账已满')).length).toBe(2);
  });
});

// =========================================================================
describe('观测面 outboxStats()', () => {
  it('待办数/最老条目龄/失败次数分布/参数/传输计数一次读全', async () => {
    r2PutMock.mockResolvedValue(false);
    r2DeleteMock.mockResolvedValue(false); // 三条都失败才留在台账里(观测面看的是待办)
    await outbox.syncPut('photos', 's1.jpg', srcFile()); // attempts=1
    await outbox.syncPut('photos', 's2.jpg', srcFile()); // attempts=1
    await vi.advanceTimersByTimeAsync(30001);
    await outbox.pumpNow(); // s1/s2 → attempts=2
    await outbox.syncDelete('videos', 's3.mp4'); // attempts=1(delete)
    const s = outbox.outboxStats();
    expect(s.pending).toBe(3);
    expect(s.put).toBe(2);
    expect(s.delete).toBe(1);
    expect(s.oldestAgeMs).toBeGreaterThanOrEqual(30001);
    expect(s.attempts['2']).toBe(2);
    expect(s.attempts['1']).toBe(1);
    expect(s.transport).toEqual({ ok: 11, fail: 2, retry: 5 }); // 传输层计数收在这一个读数口
    expect(s.params.backoffMs).toEqual([30000, 120000, 600000, 3600000, 21600000]);
    expect(s.params.backoffCapMs).toBe(21600000);
    expect(s.file).toBe(LEDGER);
    expect(s.keys).toContain('photos/s1.jpg');
  });
});

// =========================================================================
describe('与上传路径的接线:r2Mirror/r2HealMedia 走台账,同 key 只一次在途', () => {
  /**@type {any} */
  let fu;
  beforeAll(() => {
    // 与 lib-upload-overwrite.test.js 同一套 require 顺序:r2sync 已打桩 ⇒ files-upload 与
    // r2outbox 拿到的都是桩;加载即起的分片 GC 定时器立刻停掉(不牵连同文件其他用例的计时器断言)
    fu = nodeRequire('../../lib/files-upload.js');
    fu.stopChunkGc();
    fu._resetChunkState();
  });

  it('r2Mirror 成功:一次 PUT、零重复、台账清空、待补推清单为空', async () => {
    const src = srcFile('wire');
    fu.r2Mirror('photos', 'wire.jpg', src);
    await tick();
    expect(r2PutMock).toHaveBeenCalledTimes(1);
    expect(r2PutMock).toHaveBeenCalledWith('photos', 'wire.jpg', src);
    expect(outbox.outboxStats().pending).toBe(0);
    expect(fu.r2PendingMedia()).toEqual([]);
    expect(fs.existsSync(LEDGER)).toBe(false);
  });

  it('同一对象连投两次(上传 + 压缩后再镜像)只一次在途;内容换新后补推一次才出账', async () => {
    const src = srcFile('dup');
    let inFlight = 0;
    let maxInFlight = 0;
    /**@type {Array<() => void>} */
    const resolvers = [];
    r2PutMock.mockImplementation(() => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((res) =>
        resolvers.push(() => {
          inFlight -= 1;
          res(true);
        })
      );
    });
    const p1 = outbox.syncPut('photos', 'dup.jpg', src);
    const p2 = outbox.syncPut('photos', 'dup.jpg', src); // 在途期间又入账(压缩产物同名覆盖式镜像)
    await tick();
    expect(r2PutMock).toHaveBeenCalledTimes(1); // 绝不同时推两次
    expect(maxInFlight).toBe(1);
    while (resolvers.length) resolvers.shift()();
    expect(await p1).toBe('pending'); // 旧内容的成功不作数
    expect(await p2).toBe('pending');
    expect(outbox.outboxStats().pending).toBe(1); // 新内容还欠一次推
    r2PutMock.mockResolvedValue(true);
    const r = await outbox.pumpNow();
    expect(r.ok).toBe(1);
    expect(r2PutMock).toHaveBeenCalledTimes(2);
    expect(maxInFlight).toBe(1);
    expect(outbox.outboxStats().pending).toBe(0);
    outbox.flush();
    expect(fs.existsSync(LEDGER)).toBe(false);
  });

  it('r2Mirror 失败:进台账 + 进待补推清单;媒体命中时 r2HealMedia 补推并清账', async () => {
    const src = srcFile('fail');
    r2PutMock.mockResolvedValue(false);
    fu.r2Mirror('photos', 'fail.jpg', src);
    await tick();
    expect(outbox.outboxStats().pending).toBe(1);
    expect(outbox.entryOf('photos', 'fail.jpg').attempts).toBe(1);
    expect(fu.r2PendingMedia()).toContain('photos/fail.jpg');
    // 从没失败过的对象不补推(语义与改造前一致)
    expect(fu.r2HealMedia('photos', 'never-tried.jpg', src)).toBe(false);
    expect(r2PutMock).toHaveBeenCalledTimes(1);

    // 在推去重:上一次补推还挂在途上时,同键第二次调用不再发起(仍然"同 key 一次在途")
    let settleHeal;
    r2PutMock.mockImplementation(
      () =>
        new Promise((res) => {
          settleHeal = () => {
            res(false);
          };
        })
    );
    expect(fu.r2HealMedia('photos', 'fail.jpg', src)).toBe(true);
    expect(fu.r2HealMedia('photos', 'fail.jpg', src)).toBe(false); // 在推去重
    await tick();
    expect(r2PutMock).toHaveBeenCalledTimes(2);
    settleHeal();
    await tick();
    expect(outbox.entryOf('photos', 'fail.jpg').attempts).toBe(2);

    // 补推成功:台账出账 + 待补推清单摘掉
    r2PutMock.mockResolvedValue(true);
    expect(fu.r2HealMedia('photos', 'fail.jpg', src)).toBe(true);
    await tick();
    expect(outbox.outboxStats().pending).toBe(0);
    expect(fu.r2PendingMedia()).toEqual([]);
  });

  it('删除路径也走台账(源站已删 + R2 删除失败的反向分歧能自愈)', async () => {
    r2DeleteMock.mockResolvedValue(false);
    expect(await outbox.syncDelete('photos', 'deleted.jpg')).toBe('fail');
    expect(outbox.outboxStats().pending).toBe(1);
    expect(outbox.entryOf('photos', 'deleted.jpg').op).toBe('delete');
    outbox.flush();
    expect(readLedger().entries[0].op).toBe('delete');
    r2DeleteMock.mockResolvedValue(true);
    await vi.advanceTimersByTimeAsync(30001);
    expect((await outbox.pumpNow()).ok).toBe(1);
    expect(outbox.outboxStats().pending).toBe(0);
  });
});

// =========================================================================
// 源码只看"非注释行":病根描述里的 r2Put(...).catch(()=>{}) 是历史说明,不是现存代码
function codeOnly(s) {
  return s
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
}
describe('接线口径(不许再退回裸 fire-and-forget)', () => {
  it('files-upload / bigscreen 的镜像与删除全部改走 r2outbox,不再直连 r2sync', () => {
    const fuSrc = codeOnly(fs.readFileSync(path.join(ROOT, 'lib', 'files-upload.js'), 'utf8'));
    const bsSrc = codeOnly(fs.readFileSync(path.join(ROOT, 'lib', 'bigscreen.js'), 'utf8'));
    // 三个上传镜像点 + 压缩后镜像都经 r2Mirror → r2outbox.syncPut;删除经 syncDelete
    expect(fuSrc).toContain("require('./r2outbox')");
    expect(fuSrc).toContain('r2outbox.syncPut(dir, name, filePath)');
    expect(fuSrc).toContain('r2outbox.syncDelete(dir, name)');
    expect(bsSrc).toContain("require('./r2outbox')");
    expect(bsSrc).toContain('r2outbox.syncPut(dir, keyName, filePath)');
    expect(bsSrc).toContain("r2outbox.syncDelete('videos', BSCREEN_KEY + '/' + old)");
    // 旧的"吞掉失败"写法一个都不许留(那正是"永久缺席 R2"的成因),也不再直连 r2sync
    for (const s of [fuSrc, bsSrc]) {
      expect(s).not.toMatch(/r2(Put|Delete)\([^)]*\)\s*\.catch\(\(\)\s*=>\s*\{\}\)/);
      expect(s).not.toMatch(/require\('\.\/r2sync'\)/);
    }
  });

  it('tts 的 r2Heal 契约不动,但补推底下换成同一套台账(两套重试并存的坑填平)', () => {
    const ttsSrc = fs.readFileSync(path.join(ROOT, 'lib/tts.js'), 'utf8');
    expect(ttsSrc).toContain('function r2Heal(key, file)'); // 名字与入参一字不改(lib-tts.test.js 钉着)
    expect(ttsSrc).toContain('const r2Mirrored = new Set()'); // 进程内去重仍在
    expect(ttsSrc).toContain("r2outbox.syncPut('tts-audio', name, file)"); // 统一到持久台账
    expect(ttsSrc).toMatch(/r2Mirrored\.delete\(key\)/); // 失败解标记:下次命中仍会重试
  });
});
