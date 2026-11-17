// lib-hot-read.test.js — B5 拆双轨后的热集合验收(2026-11-17 重写)
// ===================== 这个文件钉住什么 =====================
//   ① 核心验收:一次发言 / 一批点击 / 一条 gate 报错 / 一次访问明细 / 一次 file upsert,
//      确实落表 ⇒ saveGateData() 调用数 = **0**(真表唯一权威,WAL 崩溃安全);
//   ② 读路径走真表:表里有、数组里没有的行(挤出去的历史)也能被读到;
//   ③ SQLite 不可用 ⇒ 读回旁路数组、写回"数组+整库落盘"旁路(json/kv 契约保住);
//   ④ 表写失败(shadow 返回 false)⇒ 回旁路落盘,一条不丢;
//   ⑤ 读表抛错 ⇒ 该次读回退旁路数组并计数,绝不把 500 抛给请求;
//   ⑥ 旁路→表回灌:表空才灌(防追加重复),覆盖首次建表/离线崩溃旁路攒批;
//   ⑦ 响应码/响应体与拆除前逐字一致(拆双轨不改任何对外契约)。
//
// 拆除的旧矩阵(不再测试):HOT_READ 闸 / SHADOW_WRITE 闸 / confirm* / count* /
//   disable / setDisableHook / mergeTablesIntoArrays(表→数组反向归并)。
//
// ===================== 测试隔离(硬要求,与 lib-hot-tables 同款)=====================
// GATE_DATA_FILE / SQLITE_PATH / CLIENT_ERRORS_FILE 全部重定向到系统临时目录,
// **必须在 require lib 之前**设好。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-hot-read-'));
process.env.GATE_DATA_FILE = path.join(tmpDir, 'gate_data.json');
process.env.SQLITE_PATH = path.join(tmpDir, 'gate_data.db');
process.env.CLIENT_ERRORS_FILE = path.join(tmpDir, 'client_errors.json');
process.env.TOKEN = process.env.TOKEN || 'vitest-token-abc';
process.env.RETENTION_DISABLED = '1';

const require = createRequire(import.meta.url);
const store = require('../../lib/store.js');
const shadow = require('../../lib/shadow.js');
const hotread = require('../../lib/hotread.js');
const sqlite = require('../../lib/sqlite-store.js');
const repoChat = require('../../lib/repo/chat.js');
const repoClicks = require('../../lib/repo/clicks.js');
const repoErrors = require('../../lib/repo/errors.js');
const repoVisits = require('../../lib/repo/visits.js');
const chat = require('../../lib/chat.js');
const track = require('../../lib/track.js');
const clientErrors = require('../../lib/client-errors.js');

const g = store.gateData;
const UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

function mkReq(ip, headers, ua) {
  const handlers = {};
  return {
    socket: { remoteAddress: ip },
    headers: Object.assign(
      { 'user-agent': ua || UA, 'content-type': 'application/json' },
      headers || {}
    ),
    on(ev, cb) {
      handlers[ev] = cb;
    },
    destroy() {},
    _handlers: handlers,
  };
}
function mkRes() {
  return {
    setHeader() {},
    getHeader() {},
    writeHead(c) {
      this.code = c;
    },
    end(b) {
      this.body = b;
    },
    on() {},
  };
}
function postChat(text, ip) {
  const req = mkReq(ip || '203.0.113.201', {});
  const res = mkRes();
  chat.handleChatPost(req, res);
  req._handlers.data(Buffer.from(JSON.stringify({ text })));
  req._handlers.end();
  return { req, res };
}
function postClick(obj, ip) {
  const req = mkReq(ip || '203.0.113.202', {});
  const res = mkRes();
  track.handleTrackClick(req, res);
  req._handlers.data(Buffer.from(JSON.stringify(obj)));
  req._handlers.end();
  return res;
}
function postTrackError(obj, ip) {
  const req = mkReq(ip || '203.0.113.203', {});
  const res = mkRes();
  track.handleTrackError(req, res);
  req._handlers.data(Buffer.from(JSON.stringify(obj)));
  req._handlers.end();
  return res;
}
function clearAll() {
  repoChat.removeAll();
  repoClicks.removeAll();
  repoErrors.removeAll();
  repoVisits.removeAll();
  g.chat = [];
  g.linkClicks = [];
  g.clientErrors = [];
  g.visits = [];
  g.chatRate = {};
  g._visitRate = {};
  clientErrors._setErrorList([]);
  hotread._reset();
  shadow._resetStats();
  shadow._dropSchemaReady();
}

let saveSpy;
beforeEach(() => {
  shadow.start(g); // 幂等:建表+旁路回灌哨兵
  clearAll();
  saveSpy = vi.spyOn(store, 'saveGateData');
});
afterEach(() => {
  saveSpy.mockRestore();
  vi.restoreAllMocks();
});

describe('① 核心验收:热写确实落表 ⇒ saveGateData 调用数 0', () => {
  it('一次发言 → 0 次整库落盘,表行与数组同形', () => {
    const { res } = postChat('拆双轨后的第一条');
    expect(res.code).toBe(200);
    expect(res.body).toBe('{"ok":true}');
    expect(saveSpy).toHaveBeenCalledTimes(0);
    expect(repoChat.count()).toBe(1);
    expect(g.chat.length).toBe(1); // 内存数组照常维护(限流/保留期依赖)
    expect(repoChat.readTail(1)[0].t).toBe('拆双轨后的第一条');
  });

  it('一批点击 flush → 0 次整库落盘(攒批语义照旧:一批一次多行 insert)', () => {
    const spy = vi.spyOn(repoClicks, 'insertMany');
    for (let i = 0; i < 5; i++) expect(postClick({ link: 'R' + i }).code).toBe(200);
    expect(repoClicks.count()).toBe(0); // 还在攒批
    expect(track.flushTrack()).toBe(5);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledTimes(0);
    expect(repoClicks.count()).toBe(5);
    expect(g.linkClicks.length).toBe(5);
  });

  it('一条 gate 报错 → 0 次整库落盘', () => {
    const res = postTrackError({ msg: 'hot-read boom', src: 'x.js', line: 9 });
    expect(res.code).toBe(200);
    expect(saveSpy).toHaveBeenCalledTimes(0);
    expect(repoErrors.count(repoErrors.GATE)).toBe(1);
    expect(g.clientErrors.length).toBe(1);
  });

  it('一次访问明细 → 0 次整库落盘(stats 聚合仍留在内存,靠冷路径落盘)', () => {
    const totalBefore = g.stats.total;
    store.recordVisit(
      mkReq('203.0.113.211', { 'cf-connecting-ip': '203.0.113.211' }),
      'vid-hr',
      null
    );
    expect(saveSpy).toHaveBeenCalledTimes(0);
    expect(repoVisits.count()).toBe(1);
    expect(g.visits.length).toBe(1);
    expect(g.stats.total).toBe(totalBefore + 1);
  });

  it('file 错误 upsert(新增+合并)→ 0 次整文件重写,表行 count/lastT 跟上', () => {
    const report = (payload) => {
      const req = mkReq('203.0.113.250', {});
      req.method = 'POST';
      const res = mkRes();
      clientErrors.handleReport(req, res);
      req._handlers.data(Buffer.from(JSON.stringify(payload)));
      req._handlers.end();
      return res;
    };
    const writeSpy = vi.spyOn(fs, 'writeFileSync');
    expect(report({ type: 'js', message: '聚合错A', source: 'a.js' }).code).toBe(200);
    expect(report({ type: 'js', message: '聚合错A', source: 'a.js' }).code).toBe(200);
    expect(writeSpy).toHaveBeenCalledTimes(0); // 新增与合并都免整文件重写
    const rows = repoErrors.readFileAll();
    expect(rows.length).toBe(1);
    expect(rows[0].count).toBe(2);
    expect(rows[0].lastT).toBe(clientErrors._getErrorList()[0].lastT);
    writeSpy.mockRestore();
  });
});

describe('② 读路径走真表:保留期内被数组挤出去的历史也读得到', () => {
  it('chat 拉取:表里 150 条历史,数组只有最近 100 ⇒ API 返回最近 100 且含表侧历史', () => {
    const many = [];
    for (let i = 0; i < 150; i++)
      many.push({ n: 'a', t: '历史' + i, ts: Date.now() - 100000 + i, dk: 'd' });
    repoChat.insertMany(many);
    g.chat = many.slice(-100); // 数组被 MAX_MSG 挤过
    const req = mkReq('203.0.113.220', {});
    const res = mkRes();
    chat.handleChatList(req, res);
    const body = JSON.parse(res.body);
    expect(body.msgs.length).toBe(100);
    expect(body.msgs[0].t).toBe('历史50'); // tail(100) 从表取,不是数组
    expect(body.msgs[99].t).toBe('历史149');
  });
});

describe('③ SQLite 不可用 ⇒ 读回旁路数组、写回旁路落盘(json/kv 契约)', () => {
  it('available=false:发言 → saveGateData 1 次,数组照旧,表 0 行', () => {
    const spy = vi.spyOn(sqlite, 'available').mockReturnValue(false);
    const { res } = postChat('离线也要发');
    expect(res.code).toBe(200);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(g.chat.length).toBe(1);
    expect(repoChat.count()).toBe(0);
    spy.mockRestore();
  });
  it('available=false:chat 拉取读回旁路数组', () => {
    g.chat = [{ n: 'x', t: '旁路兜底', ts: Date.now(), dk: 'd' }];
    const spy = vi.spyOn(sqlite, 'available').mockReturnValue(false);
    const req = mkReq('203.0.113.221', {});
    const res = mkRes();
    chat.handleChatList(req, res);
    const body = JSON.parse(res.body);
    expect(body.msgs[0].t).toBe('旁路兜底');
    spy.mockRestore();
  });
});

describe('④ 表写失败(shadow 返回 false)⇒ 回旁路落盘一条不丢', () => {
  it('shadow.chat 返回 false ⇒ saveGateData 1 次,数组照旧', () => {
    const spy = vi.spyOn(shadow, 'chat').mockReturnValue(false);
    const { res } = postChat('表挂了也要发');
    expect(res.code).toBe(200);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(g.chat.length).toBe(1);
    spy.mockRestore();
  });

  it('shadow.clicks 返回 false ⇒ flush 走旁路 saveGateData 1 次', () => {
    const spy = vi.spyOn(shadow, 'clicks').mockReturnValue(false);
    for (let i = 0; i < 3; i++) postClick({ link: 'F' + i });
    expect(track.flushTrack()).toBe(3);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(g.linkClicks.length).toBe(3);
    spy.mockRestore();
  });
});

describe('⑤ 读表抛错 ⇒ 该次读回退旁路数组,不抛 500', () => {
  it('repoChat.readTail 抛错 ⇒ chat 拉取仍 200 且内容来自数组', () => {
    g.chat = [{ n: 'x', t: '数组兜底', ts: Date.now(), dk: 'd' }];
    const spy = vi.spyOn(repoChat, 'readTail').mockImplementation(() => {
      throw new Error('table locked');
    });
    const req = mkReq('203.0.113.230', {});
    const res = mkRes();
    chat.handleChatList(req, res);
    expect(res.code).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.msgs[0].t).toBe('数组兜底');
    expect(hotread.hotReadStats().readFallbacks).toBe(1);
    spy.mockRestore();
  });
});

describe('⑥ 旁路→表回灌:表空才灌,防追加重复', () => {
  // 哨兵在共享临时库跨用例持久:前面①用例真灌过行会写哨兵,这里先清掉才能验回灌
  function clearSentinel() {
    try {
      sqlite.getDb().prepare('DELETE FROM shadow_backfill').run();
    } catch {
      /* 表未建时忽略 */
    }
  }
  it('表空+旁路有历史 ⇒ start 回灌进表', () => {
    clearSentinel();
    shadow._dropSchemaReady();
    repoChat.removeAll();
    g.chat = [{ n: 'a', t: '旁路历史', ts: 1000, dk: 'd' }];
    const report = shadow.start(g);
    expect(report.enabled).toBe(true);
    expect(repoChat.count()).toBe(1);
    expect(repoChat.readTail(1)[0].t).toBe('旁路历史');
  });
  it('表非空 ⇒ 不灌(权威已在表,防追加重复)', () => {
    clearSentinel();
    repoChat.removeAll();
    repoChat.insertMany([{ n: 'a', t: '表权威', ts: 2000, dk: 'd' }]);
    g.chat = [{ n: 'a', t: '旁路滞后', ts: 1000, dk: 'd' }];
    shadow._dropSchemaReady();
    shadow.start(g);
    expect(repoChat.count()).toBe(1); // 不追加
    expect(repoChat.readTail(1)[0].t).toBe('表权威');
  });
});

describe('⑦ 对外契约不变:响应码/响应体与拆除前逐字一致', () => {
  it('发言/拉取/报错/点击四端点的码与体', () => {
    const post = postChat('契约');
    expect(post.res.code).toBe(200);
    expect(post.res.body).toBe('{"ok":true}');
    const listRes = mkRes();
    chat.handleChatList(mkReq('203.0.113.240', {}), listRes);
    expect(listRes.code).toBe(200);
    const parsed = JSON.parse(listRes.body);
    expect(Object.keys(parsed)).toEqual(['msgs']);
    expect(Object.keys(parsed.msgs[0]).sort()).toEqual(['me', 'n', 't', 'ts']);
    expect(postTrackError({ msg: 'e', src: 's' }).code).toBe(200);
    expect(postClick({ link: 'c' }).code).toBe(200);
  });
});
