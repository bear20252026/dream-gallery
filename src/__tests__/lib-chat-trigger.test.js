// lib-chat-trigger.test.js — 聊天室召唤机器人的"两侧必须同源"闸门(2026-10-17,外部审计 C9)
//
// 现场:界面写「@B612之灵 可召唤它回答」(src/gate/settings/chat-room.js),而后端只认
// `@(昆仑之灵|机器人|bot)`(lib/chat.js)⇒ **照屏幕上教的打字,机器人永不回帖**,而前端还会
// setTimeout(loadChat,6000) 刷一次去等那条不会来的回帖。这与温柔度面板"界面有按钮、实现没人接"同族:
// **两边各写一份正则,就没有任何东西保证它们相等。**
//
// 所以本文件判的不是"正则写得对不对",而是四件可失败的事实:
//  ① 触发词字面量只许住在 src/shared/chat-words.mjs(两侧源码剥注释后再出现 @( 即红);
//  ② 界面提示的那个词 ≡ 后端接受集里的词(从**真实导出**量,不是比文本);
//  ③ 真走一遍 handleChatPost:用界面教的词发言,chatText 必须被调用、剥掉触发词、回帖署名 = BOT_NAME;
//  ④ 后台手册(ADMIN_GUIDE.md)写的召唤词与限流口径必须与代码一致(文档漂移也是这一族)。
// 约定(同 lib-ai-usage.test.js):GATE_DATA_FILE 先指到临时目录再 require lib/*,AI 通道打在 require.cache 上
// —— 零真网络、零真 AI 调用、零真生产数据根。
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, '..', '..');
vi.setConfig({ testTimeout: 20000 });

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-chat-trigger-'));
process.env.GATE_DATA_FILE = path.join(tmpDir, 'gate_data.json');
process.env.USE_SQLITE = '0';
process.env.SHADOW_WRITE = '0';
process.env.TOKEN = 'vitest-chat-token';
process.env.MULTI = 'off';
process.env.PORT = '0';

// ---------- 桩:AI 通道(绝不出网)——**必须装在 require('../../lib/chat.js') 之前** ----------
// lib/chat.js 顶层写的是 `const { chatText } = require('./aichannels')`,解构发生在它自己被加载的那一刻;
// 先 require 它再打桩,桩就永远接不上(第一版就是这么"零调用"的,红得像是召唤没生效)。
const chatTextMock = vi.fn(async () => ({ ok: true, text: '山那边有风。', by: 'stub' }));
{
  const id = nodeRequire.resolve('../../lib/aichannels.js');
  nodeRequire.cache[id] = {
    id,
    filename: id,
    loaded: true,
    path: path.dirname(id),
    exports: {
      chatText: chatTextMock,
      callText: chatTextMock,
      callVision: vi.fn(),
      synthTts: vi.fn(),
    },
  };
}

const CHAT = nodeRequire('../../lib/chat.js');
const WORDS = nodeRequire('../../src/shared/chat-words.mjs');
// lib/chat.js 顶层 `const { gateData } = require('./store')` 拿的是同一个对象引用
// ⇒ 测试直接经 store 复位/读取 gateData.chat,不需要在后端模块上开测试专用的口子(不留新全局)。
const STORE = nodeRequire('../../lib/store.js');

const CACHE = new Map();
const read = (rel) => {
  if (!CACHE.has(rel))
    CACHE.set(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'));
  return CACHE.get(rel);
};
// 判据读的是**代码**:两侧文件头的说明必然要复述旧正则,不剥注释就是把散文数成读数(第九刀起记过三次)
const codeOf = (rel) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');

// 发言有两条按"设备"算的限流:3 秒/条(RATE_MS)与召唤 6 次/分/IP ⇒ 每条用例换一个源 IP + 换一个 UA
// (quotaKey 优先 vid Cookie,没有 Cookie 时退回 deviceKey(UA)),否则测的是限流器不是召唤。
let ipSeq = 0;
const jsonReq = (obj) => {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  ipSeq++;
  const req = Readable.from([body]); // 必须真把 body 送出去:readBody 靠 data/end,空 Readable 会挂在 await 上
  Object.assign(req, {
    method: 'POST',
    url: '/api/chat',
    headers: {
      'content-type': 'application/json',
      'content-length': String(body.length),
      'user-agent': 'vitest-chat-trigger/' + ipSeq,
    },
    socket: { remoteAddress: '203.0.113.' + (ipSeq % 200) },
  });
  return req;
};
// lib/util.js 的 sendJson 走 res.writeHead(code,…)+res.end(body) ⇒ 假 res 必须**在实例上**有这两个方法
// (把 writeHead 写进 new Writable({...}) 的 options 里是不成立的,第一版就这么踩过:"writeHead is not a function")
const resJson = () => {
  const chunks = [];
  const res = new Writable({
    write(c, _e, cb) {
      chunks.push(c);
      cb();
    },
  });
  res.headers = {};
  res.code = 0;
  res.statusCode = 0;
  res.setHeader = () => res;
  res.getHeader = (k) => res.headers[k];
  res.writeHead = (code, h) => {
    res.code = code;
    res.statusCode = code;
    if (h) Object.assign(res.headers, h);
    return res;
  };
  res.finished = new Promise((r) => res.once('finish', r));
  res.json = async () => JSON.parse(Buffer.concat(chunks).toString('utf8'));
  return res;
};
const settle = (n = 4) => new Promise((r) => setTimeout(r, n * 15));

describe('① 触发词只许住在一个地方', () => {
  const sites = ['lib/chat.js', 'src/gate/settings/chat-room.js'];
  for (const rel of sites) {
    it(`${rel} 里不再自带召唤词正则`, () => {
      const code = codeOf(rel);
      expect(code, rel + ' 又写了一份 @(…) 字面量').not.toMatch(/@\((?:[^)]*)(?:之灵|机器人|bot)/);
      expect(code).not.toMatch(/['"`]@(?:昆仑之灵|B612之灵)['"`]/);
    });
  }

  it('两侧都真的从单一源取(不是删掉了就算)', () => {
    expect(codeOf('lib/chat.js')).toMatch(/CHAT_WORDS\.triggerRe\(\)/);
    expect(codeOf('lib/chat.js')).toMatch(/CHAT_WORDS\.stripTriggers\(/);
    expect(codeOf('lib/chat.js')).toMatch(/CHAT_WORDS\.BOT_NAME/);
    const front = codeOf('src/gate/settings/chat-room.js');
    expect(front).toMatch(/CHAT_WORDS\.triggerRe\(\)/);
    expect(front).toMatch(/CHAT_WORDS\.BOT_TRIGGERS\[0\]/);
  });

  it('单一源自己不许引用回消费点(叶子模块,防成环)', () => {
    const s = read('src/shared/chat-words.mjs');
    expect(s).not.toMatch(/\bimport\b[^\n]*(lib\/|\.\.\/\.\.\/)/);
    expect(s).not.toMatch(/require\(/);
  });
});

describe('② 界面教的词,后端一定认(从真实导出量,不比文本)', () => {
  it('BOT_TRIGGERS 非空、去重、每项都无前导 @', () => {
    const t = WORDS.BOT_TRIGGERS;
    expect(t.length).toBeGreaterThan(0);
    expect(new Set(t).size).toBe(t.length);
    for (const w of t) expect(w.startsWith('@')).toBe(false);
  });

  it('界面提示用的词 ∈ 后端接受集(这条就是 C9 的本体)', () => {
    const hint = read('src/gate/settings/chat-room.js');
    const at = hint.indexOf('const BOT_HINT');
    if (at < 0) throw new Error('chat-room.js 里找不到 BOT_HINT ⇒ 提示语不再从单一源生成');
    // BOT_HINT = '@' + CHAT_WORDS.BOT_TRIGGERS[0] + … ⇒ 提示词必然是表里的第一个,二者不可能再漂
    expect(hint.slice(at, at + 200)).toMatch(/BOT_TRIGGERS\[0\]/);
    expect(WORDS.BOT_TRIGGERS).toContain(WORDS.BOT_TRIGGERS[0]);
    expect(WORDS.triggerRe().test('@' + WORDS.BOT_TRIGGERS[0] + ' 你好')).toBe(true);
  });

  it('老词(2026-09-06 重题之前的叫法)仍然可召唤,不破坏既有输入', () => {
    expect(WORDS.BOT_TRIGGERS).toContain('昆仑之灵');
    expect(WORDS.triggerRe().test('@昆仑之灵 在吗')).toBe(true);
  });

  it('每个表内词都触发;表外词不误触发;大小写不敏感', () => {
    for (const w of WORDS.BOT_TRIGGERS) expect(WORDS.triggerRe().test('@' + w)).toBe(true);
    expect(WORDS.triggerRe().test('@BOT 你好')).toBe(true);
    expect(WORDS.triggerRe().test('@B612 你好')).toBe(false);
    expect(WORDS.triggerRe().test('没有 at 的 昆仑之灵')).toBe(false);
    expect(WORDS.triggerRe().test('@某某人')).toBe(false);
  });

  it('triggerRe() 每次给新实例(带 /g 的共享正则会因 lastIndex 漏判第二句)', () => {
    const a = WORDS.triggerRe();
    const b = WORDS.triggerRe();
    expect(a).not.toBe(b);
    expect(a.global, '判定用的正则不许带 /g').toBe(false);
    const t = '你好吗';
    expect(WORDS.triggerRe().test('@bot ' + t)).toBe(true);
    expect(WORDS.triggerRe().test('@bot ' + t)).toBe(true);
  });

  it('stripTriggers 剥掉每一个触发词并 trim(送 AI 的正文不带 @)', () => {
    expect(WORDS.stripTriggers('@B612之灵 今天有什么建议')).toBe('今天有什么建议');
    expect(WORDS.stripTriggers('@bot @机器人 两句都剥')).toBe('两句都剥');
    expect(WORDS.stripTriggers('@昆仑之灵')).toBe('');
    expect(WORDS.stripTriggers('')).toBe('');
    expect(WORDS.stripTriggers(null)).toBe('');
  });

  it('限流口径单一源(桶名与次数),后台手册不许各写一份', () => {
    expect(WORDS.BOT_RATE_BUCKET).toBe('chat-bot');
    expect(WORDS.BOT_RATE_PER_MIN).toBe(6);
    expect(codeOf('lib/chat.js')).toMatch(/BOT_RATE_BUCKET/);
    expect(codeOf('lib/chat.js')).not.toMatch(/'chat-bot',\s*6/);
  });
});

describe('③ 端到端:照界面打字发言,机器人真的回帖', () => {
  beforeEach(() => {
    chatTextMock.mockClear();
    STORE.gateData.chat = []; // 不开后端测试专用钩子:lib/chat.js 顶层解构的就是这同一个对象引用
  });

  it('用界面教的词 @<BOT_TRIGGERS[0]> 发言 ⇒ chatText 被调用且收到剥词后的正文', async () => {
    const q = '今夜的风从哪边来';
    const res = resJson();
    // handleChatPost 先 await readBody(流) ⇒ 任何断言都必须排在 settle 之后,否则读到的永远是初始值
    CHAT.handleChatPost(jsonReq({ text: '@' + WORDS.BOT_TRIGGERS[0] + ' ' + q }), res);
    await settle();
    expect(res.statusCode, '发言本身照常 200(召唤是异步的)').toBe(200);
    expect(chatTextMock.mock.calls.length, '界面教的词必须真的召唤(旧版这里是 0 次调用)').toBe(1);
    const sent = chatTextMock.mock.calls[0][0];
    const user = sent.messages[sent.messages.length - 1];
    expect(user.role).toBe('user');
    expect(user.content).toBe(q);
    expect(user.content).not.toContain('@');
  });

  it('老词同样召唤,署名取 BOT_NAME 且 bot 标记为真', async () => {
    const res = resJson();
    CHAT.handleChatPost(jsonReq({ text: '@昆仑之灵 山那边有什么' }), res);
    await settle();
    expect(res.statusCode).toBe(200);
    expect(chatTextMock.mock.calls.length).toBe(1);
    const bot = (STORE.gateData.chat || []).filter((m) => m.bot).pop();
    expect(bot, '桩返回了答案却没有 bot 回帖').toBeTruthy();
    expect(bot.n).toBe(WORDS.BOT_NAME);
    expect(bot.t).toBe('山那边有风。');
  });

  it('不含触发词的发言绝不出网(召唤是 AI 成本)', async () => {
    const res = resJson();
    CHAT.handleChatPost(jsonReq({ text: '只是随便说一句' }), res);
    await settle();
    expect(res.statusCode).toBe(200);
    expect(chatTextMock.mock.calls.length).toBe(0);
  });
});

describe('④ 后台手册与代码同口径(C 族的文档漂移)', () => {
  const guide = read('ADMIN_GUIDE.md');

  it('手册写的召唤词必须真的能召唤', () => {
    const words = [...guide.matchAll(/@([\u4e00-\u9fa5A-Za-z0-9之灵]+)/g)].map((m) => m[1]);
    const known = words.filter((w) => /之灵|机器人|bot/i.test(w));
    expect(known.length, '手册里没提召唤词 = 这条判据空转').toBeGreaterThan(0);
    for (const w of known) expect(WORDS.BOT_TRIGGERS, '手册教的词后端不认:' + w).toContain(w);
  });

  it('手册不许写回已拆除的"每设备每天 N 次"(2026-09-24 主人令)', () => {
    expect(guide).not.toMatch(/召唤[^。\n]{0,40}每设备每天\s*\d+\s*次/);
    expect(guide).toMatch(/每\s*IP\s*每分钟\s*6\s*次|每分钟 6 次/);
  });
});

afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Windows 上 SQLite 句柄晚于 rmSync,删不掉就交给 global-setup 的 6 小时清扫(清理不计入判定)
  }
});
