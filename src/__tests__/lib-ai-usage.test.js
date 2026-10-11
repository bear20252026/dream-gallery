// lib-ai-usage.test.js — AI 用量台账契约(2026-10-12 外部审计 P2:统一用量统计)
// 钉死六件事:
//   ① record 汇总正确(按天×能力的 calls/ok/fail/ms/tokens/byChannel + recent 明细 + summary 派生量);
//   ② 落盘被节流:整库序列化是写放大主因,N 次 record 只触发有限次 saveGateData(攒够 FLUSH_BATCH 立刻落,
//      否则 FLUSH_MS 窗口合并一次);flush()/stop() 收尾后**无残留定时器**(假定时器计数为 0);
//   ③ 有界:recent ≤50、days ≤14(跨天裁剪留最新 14 天)—— 台账自身不许把库撑大;
//   ④ 台账里没有任何文本内容字段(不新增 prompt/台词/照片名的留存面);
//   ⑤ 消费方埋点真在记账:vision / tts / quiz-ai / chat-bot 各自留下一笔,并记下以前被丢掉的
//      r.by(命中通道)与 usage.total_tokens;被限流挡下(没出网)的那一笔不入账。
//      —— 全程把 lib/aichannels.js 与 lib/r2sync.js 打在 require.cache 上:零真网络、零真 AI 调用。
//   ⑥ 只读端点 GET /api/admin/ai-usage:带 x-token 200 / 无 token 401 / 错 token 401;路由快照 58→59。
// 约定(同 lib-vision-guard.test.js):GATE_DATA_FILE 重定向到临时目录 + 自己播种容器 + require.cache 打桩。
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);
// 本机 Windows 实测:同一批"落盘 + 读回"的用例耗时在 0.1s~2s 之间抖(杀软扫临时目录),
// 默认 5s 会偶发假红;整文件放宽到 20s,断言本身不变(节流比率/有界/键白名单都是硬判定)。
vi.setConfig({ testTimeout: 20000 });
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-aiusage-'));
// 必须在 require lib/store 之前重定向,否则台账会去刷真实的 gate_data.json(并发套件抢同一文件)
process.env.GATE_DATA_FILE = path.join(tmpDir, 'gate_data.json');
process.env.USE_SQLITE = '0'; // 只验 JSON 镜像这一路
process.env.TOKEN = 'vitest-aiusage-token';
process.env.MULTI = 'off';
process.env.PORT = '0';

// ===================== 桩:AI 通道层 + R2(绝不真调任何 AI 接口,也不真推 CDN) =====================
const chatVisionMock = vi.fn();
const chatTextMock = vi.fn();
const synthTtsMock = vi.fn();
const stubModule = (rel, exports) => {
  const id = nodeRequire.resolve(rel);
  nodeRequire.cache[id] = { id, filename: id, loaded: true, path: path.dirname(id), exports };
  return exports;
};
stubModule('../../lib/aichannels.js', {
  chatVision: chatVisionMock,
  chatText: chatTextMock,
  synthTts: synthTtsMock,
  usageTokens: () => 0,
});
stubModule('../../lib/r2sync.js', {
  r2Put: vi.fn(() => Promise.resolve(true)),
  r2Delete: vi.fn(() => Promise.resolve(true)),
  r2Stats: () => ({ ok: 0, fail: 0, retry: 0 }),
});

const store = nodeRequire('../../lib/store.js');
const { gateData } = store;
const { ROOT } = nodeRequire('../../lib/config.js');
// 空库播种:不依赖"恰好被别的模块顺手建了容器"(2026-10-11 CI 假红教训)
gateData.uploads = gateData.uploads || {};
gateData.photoCaptions = gateData.photoCaptions || {};
gateData.applicants = gateData.applicants || {};
gateData.chat = gateData.chat || [];
gateData.chatRate = gateData.chatRate || {};
gateData.quizAttempts = gateData.quizAttempts || [];

const aiusage = nodeRequire('../../lib/aiusage.js');
const { FLUSH_BATCH, FLUSH_MS, RECENT_MAX, DAYS_MAX } = aiusage;
const routes = nodeRequire('../../lib/routes.js');
const ratelimit = nodeRequire('../../lib/ratelimit.js');
const vision = nodeRequire('../../lib/vision.js');
const chat = nodeRequire('../../lib/chat.js');
const quiz = nodeRequire('../../lib/quiz.js');
const tts = nodeRequire('../../lib/tts.js');

const UA = 'Mozilla/5.0 (aiusage-test)';
const IP = '203.0.113.9'; // 非可信反代:realIP 走 socket 地址,每用例 _reset 后限流桶干净
const TTS_CACHE = path.join(ROOT, '.tts-cache');
const createdFiles = [];
function mkTemp(file) {
  createdFiles.push(file);
  return file;
}

function reqOf(headers, method) {
  return {
    method: method || 'GET',
    headers: { 'user-agent': UA, host: 'localhost:3000', ...(headers || {}) },
    url: '',
    socket: { remoteAddress: IP },
    on() {},
    destroy() {},
  };
}
function mockRes() {
  const chunks = [];
  const res = new Writable({
    write(c, e, cb) {
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c)));
      cb();
    },
  });
  res.headers = {};
  res.code = 0;
  res.setHeader = () => res;
  res.getHeader = (k) => res.headers[k];
  res.writeHead = (code, h) => {
    res.code = code;
    if (h) Object.assign(res.headers, h);
    return res;
  };
  res.finished = new Promise((r) => res.once('finish', r));
  res.text = async () => {
    await res.finished;
    return Buffer.concat(chunks).toString('utf8');
  };
  res.json = async () => JSON.parse(await res.text());
  return res;
}
function jsonReq(obj) {
  const req = new Readable({ read() {} });
  req.push(JSON.stringify(obj));
  req.push(null);
  req.headers = { 'user-agent': UA, 'content-type': 'application/json' };
  req.socket = { remoteAddress: IP };
  req.destroy = () => {};
  return req;
}
// 收束 Promise 写链与 setImmediate 回调(本文件不靠定时器推进,只有 ②b 那组用假定时器)
async function drain(times = 8) {
  for (let i = 0; i < times; i++) await Promise.resolve();
  await new Promise((r) => setImmediate(r));
  for (let i = 0; i < times; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 20));
  for (let i = 0; i < times; i++) await Promise.resolve();
}
function diskLedger() {
  return JSON.parse(fs.readFileSync(process.env.GATE_DATA_FILE, 'utf8')).aiUsage;
}
// 递归收集 JSON 里出现过的所有键名(隐私断言的尺子)
function allKeys(node, out = new Set()) {
  if (Array.isArray(node)) node.forEach((v) => allKeys(v, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      out.add(k);
      allKeys(v, out);
    }
  }
  return out;
}
function todayBucket(cap) {
  const days = aiusage.ledger().days;
  for (const d of Object.values(days)) if (d[cap]) return d[cap];
  return null;
}
function recentOf(cap) {
  return aiusage.ledger().recent.filter((r) => r.cap === cap);
}
function freshLedger() {
  aiusage.flush(); // 先落掉上一条遗留在窗口里的在途数据,免得跨用例串味(pending 断言会假红)
  aiusage._reset();
  delete gateData.aiUsage;
  ratelimit._reset();
  chatTextMock.mockReset();
  chatVisionMock.mockReset();
  synthTtsMock.mockReset();
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
afterAll(() => {
  aiusage.stop(); // 停表 + 收尾落盘(台账定时器全部 unref,这里只是把在途批次清干净)
  for (const p of createdFiles.splice(0)) {
    try {
      fs.unlinkSync(p);
    } catch {
      /* 已清理/从未生成 */
    }
  }
});

describe('① record 汇总', () => {
  beforeEach(freshLedger);

  it('按天×能力累计 calls/ok/fail/ms/tokens 与通道命中;未知能力不入账', () => {
    aiusage.record({
      capability: 'vision',
      channel: 'mimo-tp',
      model: 'mimo-v2.5',
      ok: true,
      latencyMs: 1000,
      tokens: 200,
    });
    aiusage.record({
      capability: 'vision',
      channel: 'moonshot-vision',
      ok: true,
      latencyMs: 3000,
      tokens: 100,
    });
    aiusage.record({
      capability: 'vision',
      channel: 'mimo-tp',
      ok: false,
      latencyMs: 500,
      tokens: 0,
      errKind: 'no-channel',
    });
    aiusage.record({
      capability: 'quiz-ai',
      channel: 'kimi-code',
      ok: true,
      latencyMs: 200,
      tokens: 0,
    });
    const l = aiusage.ledger();
    expect(Object.keys(l.days)).toHaveLength(1); // 同一进程同一天
    expect(l.days[Object.keys(l.days)[0]].vision).toMatchObject({
      calls: 3,
      ok: 2,
      fail: 1,
      ms: 4500,
      tokens: 300,
    });
    expect(l.days[Object.keys(l.days)[0]].vision.byChannel).toEqual({
      'mimo-tp': 2,
      'moonshot-vision': 1,
    });
    expect(l.days[Object.keys(l.days)[0]]['quiz-ai'].byChannel).toEqual({ 'kimi-code': 1 });
    // 埋点写错(未知能力)不能污染台账
    expect(aiusage.record({ capability: 'moderate-image', channel: 'x', ok: true })).toBe(false);
    expect(aiusage.record({ ok: true })).toBe(false);
    expect(todayBucket('moderate-image')).toBe(null);
    expect(aiusage.summary().caps).toEqual(['vision', 'tts', 'tts-batch', 'quiz-ai', 'chat-bot']);
  });

  it('ok 缺省按失败计;NaN/负数夹成 0;通道/模型缺省有兜底值', () => {
    aiusage.record({ capability: 'tts', channel: 'edge-tts' });
    aiusage.record({ capability: 'tts', ok: true, latencyMs: NaN, tokens: -5 });
    const c = todayBucket('tts');
    expect(c).toMatchObject({ calls: 2, ok: 1, fail: 1, ms: 0, tokens: 0 });
    expect(c.byChannel).toEqual({ 'edge-tts': 1, unknown: 1 });
    expect(recentOf('tts')[1].ch).toBe('unknown');
  });

  it('summary 派生 avgMs/rate/totals 与通道滚动(看谁从不回 token)', () => {
    aiusage.record({ capability: 'tts', channel: 'edge-tts', ok: true, latencyMs: 400, tokens: 0 });
    aiusage.record({ capability: 'tts', channel: 'mimo-tp', ok: true, latencyMs: 800, tokens: 64 });
    const s = aiusage.summary();
    expect(s.days[Object.keys(s.days)[0]].tts).toMatchObject({ calls: 2, avgMs: 600, rate: 100 });
    expect(s.totals).toMatchObject({ calls: 2, ok: 2, fail: 0, tokens: 64, avgMs: 600 });
    expect(s.totals.byChannel).toEqual({ 'edge-tts': 1, 'mimo-tp': 1 });
    expect(s.channels.find((x) => x.ch === 'edge-tts')).toMatchObject({ tokens: 0, avgTok: 0 });
    expect(s.channels.find((x) => x.ch === 'mimo-tp')).toMatchObject({ tokens: 64, avgTok: 64 });
    expect(s.daysMax).toBe(DAYS_MAX);
    expect(s.recentMax).toBe(RECENT_MAX);
  });
});

describe('② 落盘被节流(合并写盘,不逐条刷整库)', () => {
  let spy;
  beforeEach(() => {
    freshLedger();
    const original = store.saveGateData;
    spy = vi.spyOn(store, 'saveGateData').mockImplementation((...a) => original(...a));
  });

  it(`攒够 ${FLUSH_BATCH} 条才落一次:120 次 record 只落盘 ${120 / FLUSH_BATCH} 次`, async () => {
    for (let i = 0; i < 120; i++) {
      aiusage.record({
        capability: 'chat-bot',
        channel: 'moonshot',
        ok: true,
        latencyMs: 10,
        tokens: 1,
      });
    }
    expect(spy).toHaveBeenCalledTimes(120 / FLUSH_BATCH); // 而不是 120 次整库序列化
    expect(aiusage.summary().pending).toBe(0);
    expect(todayBucket('chat-bot').calls).toBe(120);
    await drain();
    expect(diskLedger().days[Object.keys(diskLedger().days)[0]]['chat-bot'].calls).toBe(120);
  });

  it('没攒够就不写盘:内存读数永远最新,flush() 立刻收尾', async () => {
    for (let i = 0; i < 5; i++)
      aiusage.record({ capability: 'vision', channel: 'mimo-tp', ok: true });
    expect(spy).toHaveBeenCalledTimes(0);
    expect(aiusage.summary().pending).toBe(5);
    expect(todayBucket('vision').calls).toBe(5); // 节流只延后写盘,不延后统计
    expect(aiusage.flush()).toBe(5);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(aiusage.flush()).toBe(0); // 没有在途数据时不再刷盘
    expect(spy).toHaveBeenCalledTimes(1);
    await drain();
    expect(Object.keys(diskLedger())).toEqual(['days', 'recent']); // 形状:汇总只嵌在 days 之下
    expect(diskLedger().days[Object.keys(diskLedger().days)[0]].vision.calls).toBe(5);
  });
});

describe('②b 定时器与有界(假定时器,钉死无残留)', () => {
  beforeEach(() => {
    freshLedger(); // 先清上一条的真实定时器,再换假定时器
    vi.useFakeTimers();
  });

  it(`${FLUSH_MS}ms 窗口内多次 record 合并成一次落盘,窗口定时器只有一枚`, () => {
    const spy = vi.spyOn(store, 'saveGateData').mockImplementation(() => {});
    aiusage.record({ capability: 'vision', channel: 'mimo-tp', ok: true });
    aiusage.record({ capability: 'vision', channel: 'mimo-tp', ok: true });
    expect(spy).toHaveBeenCalledTimes(0);
    expect(vi.getTimerCount()).toBe(1); // 不是每条 record 一枚定时器
    vi.advanceTimersByTime(FLUSH_MS);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('flush()/stop() 之后无残留定时器;stop 会收尾落盘', () => {
    const spy = vi.spyOn(store, 'saveGateData').mockImplementation(() => {});
    aiusage.record({ capability: 'tts', channel: 'edge-tts', ok: true });
    expect(vi.getTimerCount()).toBe(1);
    expect(aiusage.flush()).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    aiusage.record({ capability: 'tts', channel: 'edge-tts', ok: true });
    expect(vi.getTimerCount()).toBe(1);
    aiusage.stop();
    expect(vi.getTimerCount()).toBe(0);
    expect(spy).toHaveBeenCalledTimes(2); // flush 一次 + stop 收尾一次
    expect(aiusage.summary().pending).toBe(0);
  });

  it('days 有界:跨 20 天记账只留最近 14 天(裁掉的是最旧那天)', () => {
    for (let i = 0; i < 20; i++) {
      vi.setSystemTime(new Date(2026, 0, 1 + i, 12, 0, 0)); // 每天正午,避开日界抖动
      aiusage.record({ capability: 'quiz-ai', channel: 'moonshot', ok: true, latencyMs: 10 });
    }
    const days = Object.keys(aiusage.ledger().days).sort();
    expect(days.length).toBe(DAYS_MAX);
    expect(days[days.length - 1]).toBe('2026-01-20');
    expect(days[0]).toBe('2026-01-07');
    expect(aiusage.summary().totals.calls).toBe(DAYS_MAX); // 被裁掉的那 6 天不再出现在汇总里
  });

  it(`recent 有界:只留最近 ${RECENT_MAX} 条,但 calls 记的是全量`, () => {
    for (let i = 0; i < RECENT_MAX + 30; i++) {
      aiusage.record({ capability: 'tts', channel: 'mimo-tp', ok: true, latencyMs: i });
    }
    const l = aiusage.ledger();
    expect(l.recent.length).toBe(RECENT_MAX);
    expect(l.recent[0].ms).toBe(30); // 最旧的 30 条被挤掉
    expect(l.recent[l.recent.length - 1].ms).toBe(RECENT_MAX + 29);
    expect(todayBucket('tts').calls).toBe(RECENT_MAX + 30);
    expect(aiusage.summary().recent[0].ms).toBe(RECENT_MAX + 29); // 端点侧最新在前
  });
});

describe('④ 隐私:台账里没有任何文本内容', () => {
  beforeEach(freshLedger);

  it('跑过真实消费方链路后,键名集合仍是白名单,且不含任何用户文本', async () => {
    const SECRET = '这句话绝不该出现在台账里';
    chatVisionMock.mockResolvedValue({
      text: SECRET,
      by: 'mimo-tp',
      model: 'mimo-v2.5',
      tokens: 11,
    });
    const photo = mkTemp(path.join(tmpDir, 'aiusage-privacy.jpg'));
    fs.writeFileSync(photo, Buffer.alloc(64, 7));
    expect(await vision.analyzeImage(photo)).toBe(SECRET); // 配文照常返回(功能不变),只是不进台账
    aiusage.flush();
    await drain();

    expect(JSON.stringify(gateData.aiUsage)).not.toContain(SECRET);
    // 键名白名单:结构键 + 能力名 + 通道名 + 日期键。除这几类以外出现的任何键都是"新增留存面",
    // 一律视为隐私违规(尤其 text/prompt/caption/msg/file/name/url/ip/dk 这类会夹带用户文本的键)。
    const ALLOWED = [
      'days',
      'recent',
      'byChannel', // 结构
      'calls',
      'ok',
      'fail',
      'ms',
      'tokens', // 按天×能力汇总
      't',
      'cap',
      'ch',
      'model',
      'tok',
      'err', // recent 明细
      'vision',
      'tts',
      'tts-batch',
      'quiz-ai',
      'chat-bot', // 能力名(作键出现)
      'mimo-tp',
      'mimo',
      'moonshot',
      'moonshot-vision',
      'kimi-code',
      'edge-tts',
      'unknown', // 通道名(作键出现)
    ];
    const keys = [...allKeys(gateData.aiUsage)];
    for (const k of keys) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k)) continue; // 日期键
      expect(ALLOWED, `台账出现了白名单外的键 ${k}`).toContain(k);
    }
    const banned = [
      'text',
      'prompt',
      'caption',
      'content',
      'question',
      'answer',
      'comment',
      'msg',
      'message',
      'file',
      'image',
      'name',
      'url',
      'ua',
      'ip',
      'dk',
    ];
    for (const k of banned) expect(keys, `台账出现了文本类键 ${k}`).not.toContain(k);
    // 磁盘镜像同样干净(落盘的是同一份内存台账)
    expect(JSON.stringify(diskLedger())).not.toContain(SECRET);
  });
});

describe('⑤ 消费方埋点(以前被丢掉的 r.by 现在进了台账)', () => {
  beforeEach(freshLedger);

  it('vision:命中通道与 usage.total_tokens 入账;全通道失败也记一笔 no-channel', async () => {
    const photo = mkTemp(path.join(tmpDir, 'aiusage-vision.jpg'));
    fs.writeFileSync(photo, Buffer.alloc(64, 7));
    chatVisionMock.mockResolvedValue({
      text: '大漠孤烟',
      by: 'mimo-tp',
      model: 'mimo-v2.5',
      tokens: 1234,
    });
    expect(await vision.analyzeImage(photo)).toBe('大漠孤烟');
    expect(todayBucket('vision')).toMatchObject({
      calls: 1,
      ok: 1,
      tokens: 1234,
      byChannel: { 'mimo-tp': 1 },
    });
    expect(recentOf('vision')[0].model).toBe('mimo-v2.5');

    chatVisionMock.mockResolvedValue(null);
    expect(await vision.analyzeImage(photo)).toBe(null);
    expect(todayBucket('vision')).toMatchObject({ calls: 2, ok: 1, fail: 1 });
    expect(recentOf('vision')[1]).toMatchObject({ ok: false, err: 'no-channel', tok: 0 });
  });

  it('tts:真合成才记账;MiMo 成功记命中通道,本地 edge-tts 兜底记 tokens=0', async () => {
    const text = 'aiusage-独一条台词-' + Date.now();
    mkTemp(path.join(TTS_CACHE, tts.ttsKey('', text) + '.mp3'));
    synthTtsMock.mockResolvedValue({
      audio: Buffer.alloc(1200, 7),
      by: 'mimo',
      model: 'mimo-v2.5-tts',
      tokens: 0,
    });
    const res = mockRes();
    tts.handleTts(reqOf({}), res, { text, voice: '' });
    await res.text();
    await drain(20);
    expect(todayBucket('tts')).toMatchObject({
      calls: 1,
      ok: 1,
      tokens: 0,
      byChannel: { mimo: 1 },
    });

    // 非 MiMo 预置音色 → 不试云端直接本地引擎(省一次必败调用),这笔账落在 edge-tts 上
    const localText = text + '-本地';
    const res2 = mockRes();
    tts.handleTts(reqOf({}), res2, { text: localText, voice: '云健' });
    await res2.text();
    await drain(20);
    expect(todayBucket('tts')).toMatchObject({ calls: 2, byChannel: { mimo: 1, 'edge-tts': 1 } });
    expect(recentOf('tts')[1].ch).toBe('edge-tts');

    // 缓存命中:不出网 ⇒ 不记账(同一句永不重合成是既有防线)
    const res3 = mockRes();
    tts.handleTts(reqOf({}), res3, { text, voice: '' });
    await res3.text();
    await drain(10);
    expect(todayBucket('tts').calls).toBe(2);
    expect(synthTtsMock).toHaveBeenCalledTimes(1);
  });

  it('quiz-ai:AI 阅卷成功记通道与 token;阅卷不可用时回退本地细则并记 no-channel(交卷不受影响)', async () => {
    const sd = await startQuiz();
    chatTextMock.mockResolvedValue({
      text: '{"score":12,"comment":"不错"}',
      by: 'mimo-tp',
      model: 'mimo-v2.5-pro',
      tokens: 800,
    });
    const r1 = mockRes();
    quiz.handleQuizSubmit(
      jsonReq({ sessionId: sd.sessionId, answers: sd.mc.map(() => 'A'), qaText: LONG_ANSWER }),
      r1
    );
    const d1 = await r1.json();
    expect(d1.qaBy).toBe('ai'); // 访客可见的阅卷方口径一字未动
    expect(todayBucket('quiz-ai')).toMatchObject({
      calls: 1,
      ok: 1,
      tokens: 800,
      byChannel: { 'mimo-tp': 1 },
    });

    const sd2 = await startQuiz();
    chatTextMock.mockResolvedValue(null); // 四通道全挂/未配置 key
    const r2 = mockRes();
    quiz.handleQuizSubmit(
      jsonReq({ sessionId: sd2.sessionId, answers: sd2.mc.map(() => 'A'), qaText: LONG_ANSWER }),
      r2
    );
    const d2 = await r2.json();
    expect(d2.qaBy).toBe('rubric');
    expect(todayBucket('quiz-ai')).toMatchObject({ calls: 2, ok: 1, fail: 1 });
    expect(recentOf('quiz-ai')[1]).toMatchObject({ ok: false, err: 'no-channel' });
  });

  it('quiz-ai:模型跑偏(返回的不是 JSON)只记一笔 bad-json,一次调用不虚增成两笔', async () => {
    const sd = await startQuiz();
    chatTextMock.mockResolvedValue({
      text: '我觉得写得不错,给 15 分吧',
      by: 'moonshot',
      model: 'kimi-k2.6',
      tokens: 40,
    });
    const r = mockRes();
    quiz.handleQuizSubmit(
      jsonReq({ sessionId: sd.sessionId, answers: sd.mc.map(() => 'A'), qaText: LONG_ANSWER }),
      r
    );
    const d = await r.json();
    expect(d.qaBy).toBe('rubric'); // 判分降级为本地细则(行为不变)
    expect(todayBucket('quiz-ai')).toMatchObject({ calls: 1, ok: 0, fail: 1, tokens: 40 });
    const rec = recentOf('quiz-ai')[0];
    expect(rec).toMatchObject({ ok: false, err: 'bad-json', ch: 'moonshot', tok: 40 });
    expect('text' in rec || 'prompt' in rec).toBe(false);
  });

  it('chat-bot:@召唤 记一笔,发言文本与机器人回话都不入台账', async () => {
    chatTextMock.mockResolvedValue({
      text: '灵在,勿扰。',
      by: 'moonshot',
      model: 'kimi-k2.6',
      tokens: 33,
    });
    const res = mockRes();
    chat.handleChatPost(jsonReq({ text: '@昆仑之灵 ' + '私密内容不外泄' }), res);
    await res.text();
    await drain(20);
    expect(todayBucket('chat-bot')).toMatchObject({
      calls: 1,
      ok: 1,
      tokens: 33,
      byChannel: { moonshot: 1 },
    });
    expect(JSON.stringify(gateData.aiUsage)).not.toContain('私密内容不外泄');
    expect(JSON.stringify(gateData.aiUsage)).not.toContain('灵在');
  });

  it('被限流挡下(根本没出网)的调用不记账 —— 台账只反映真实发生的 AI 调用', async () => {
    chatTextMock.mockResolvedValue({
      text: '{"score":10,"comment":"好"}',
      by: 'moonshot',
      model: 'kimi-k2.6',
      tokens: 5,
    });
    for (let i = 0; i < 8; i++) {
      const sd = await startQuiz(); // 每次新会话:限流桶按 IP 每分钟 6 次,第 7、8 次应被挡在出网之前
      const r = mockRes();
      quiz.handleQuizSubmit(
        jsonReq({ sessionId: sd.sessionId, answers: sd.mc.map(() => 'A'), qaText: LONG_ANSWER }),
        r
      );
      const d = await r.json();
      expect(d.qaBy).toBe(i < 6 ? 'ai' : 'rubric');
      await drain(10);
    }
    expect(todayBucket('quiz-ai').calls).toBe(6);
    expect(chatTextMock).toHaveBeenCalledTimes(6);
  });
});

describe('⑥ 只读统计端点与路由契约', () => {
  beforeEach(freshLedger);

  function hit(headers) {
    const req = reqOf(headers);
    const res = mockRes();
    const handled = routes.dispatch(req, res, '/api/admin/ai-usage', {});
    return { handled, res };
  }

  it('路由表加一行且 auth=token;端点数快照 58→59', () => {
    const rows = routes.ROUTES.filter((r) => String(r.match).includes('/api/admin/ai-usage'));
    expect(rows).toHaveLength(1);
    expect(rows[0].method).toBe('GET');
    expect(rows[0].auth).toBe('token');
    expect(routes.ROUTES.length).toBe(59); // 与 lib-routes.test.js 的快照同源
  });

  it('带 x-token → 200:按天×能力的汇总 + 最近调用 + 通道命中', async () => {
    aiusage.record({
      capability: 'vision',
      channel: 'mimo-tp',
      model: 'mimo-v2.5',
      ok: true,
      latencyMs: 900,
      tokens: 21,
    });
    const { handled, res } = hit({ 'x-token': process.env.TOKEN });
    expect(handled).toBe(true);
    expect(res.code).toBe(200);
    const d = await res.json();
    expect(d.caps).toEqual(['vision', 'tts', 'tts-batch', 'quiz-ai', 'chat-bot']);
    expect(d.days[Object.keys(d.days)[0]].vision).toMatchObject({
      calls: 1,
      ok: 1,
      avgMs: 900,
      rate: 100,
      tokens: 21,
    });
    expect(d.recent[0]).toMatchObject({ cap: 'vision', ch: 'mimo-tp', tok: 21, ok: true });
    expect(d.totals.calls).toBe(1);
    expect(d.flushMs).toBe(FLUSH_MS);
    expect(d.flushBatch).toBe(FLUSH_BATCH);
    expect(d.pending).toBe(1); // 还没到合并窗口,端点如实告知
    expect([...allKeys(d)].filter((k) => ['text', 'prompt', 'caption', 'msg'].includes(k))).toEqual(
      []
    );
  });

  it('无 token → 401(fail-closed,与其余 /api/admin/* 同规)', async () => {
    const { res } = hit({});
    expect(res.code).toBe(401);
    expect(await res.text()).toContain('未授权');
  });

  it('错误 token → 401(头通道与 query 通道都不放过)', async () => {
    expect(hit({ 'x-token': 'nope-nope-nope' }).res.code).toBe(401);
    const req = reqOf({});
    const res = mockRes();
    routes.dispatch(req, res, '/api/admin/ai-usage', { token: 'wrong' });
    expect(res.code).toBe(401);
  });
});

// ===================== 夹具 =====================
const LONG_ANSWER =
  '这道题我想从三个层面来谈。首先,它触及了记忆与责任的关系:正因为人会选择性地记住,我们才需要为自己在意的事物负责。' +
  '其次,论证不能只靠抒情,还要给出可检验的理由——如果一件东西值得被保存,那一定是因为它改变了我们看待其它东西的方式。' +
  '再次,知识本身不是目的,见解才是:同样的星图,牧羊人看见季节,航海者看见方向。综上所述,我倾向于认为真正的度量不是拥有多少, ' +
  '而是愿意为哪一朵花时间;因此这道题的答案,最终落在"驯养"这个概念上,它把抽象的责任变成了具体的、可重复的仪式。';

async function startQuiz() {
  const res = mockRes();
  quiz.handleQuizStart(reqOf({}), res, { track: 'li' });
  const d = await res.json();
  if (!d.sessionId) throw new Error('出卷失败:' + JSON.stringify(d));
  return d;
}
