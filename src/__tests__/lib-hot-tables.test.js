// lib-hot-tables.test.js — R1 第 1-2 步:版本化迁移 + 四张真表 + 影子双写 + 保留期 + 对账
// ===================== 这个文件钉住什么 =====================
//   ① 迁移幂等:跑两次不重复建表、不重复灌数据(schema_version 单向前进 + 回填哨兵);
//   ② 影子写:四个集合(chat / linkClicks / clientErrors 两条信道 / visits)在既有写入点旁边落表,
//      **读路径一条没动** —— 所以每个用例都同时断言"响应码/响应体与整改前一致";
//   ③ SHADOW_WRITE=0 与 USE_SQLITE=0 两道闸:整个影子层停用(不建表、不写、不回填、不裁表);
//   ④ 双写炸了绝不外抛、绝不改请求结论(同一条失败只 console.warn 一次,之后只计数);
//   ⑤ 保留期(DG-PRIV-001)覆盖新表:表侧 DELETE 与数组侧同 cutoff、同轮清扫,
//      且**表侧删除不产生第二次全库落盘**;RETENTION_DISABLED=1 时表侧一起闸住;
//   ⑥ 攒批语义不破:一批点击 = 一次多行 insert,不是每条一 insert;
//   ⑦ 对账脚本三种机器可判的退出码 0/1/2。
//
// ===================== 测试隔离(硬要求)=====================
// GATE_DATA_FILE / SQLITE_PATH / CLIENT_ERRORS_FILE 全部重定向到系统临时目录,
// **必须在 require lib 之前**设好 —— 否则 store.js 会打开仓库真实的 gate_data.db,
// 影子写就会往开发机的真库里灌行(Windows EPERM / Linux ENOENT 会把 CI 打成假红)。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-hot-tables-'));
const TMP_JSON = path.join(tmpDir, 'gate_data.json');
const TMP_DB = path.join(tmpDir, 'gate_data.db');
const TMP_ERRORS = path.join(tmpDir, 'client_errors.json');

process.env.GATE_DATA_FILE = TMP_JSON; // 必须在 require store 之前
process.env.SQLITE_PATH = TMP_DB; // 影子表与 kv 快照同一个临时库
process.env.CLIENT_ERRORS_FILE = TMP_ERRORS;
process.env.TOKEN = process.env.TOKEN || 'vitest-token-abc';
process.env.RETENTION_DISABLED = '1'; // 自动定时器不启;表侧裁剪由用例显式放开
delete process.env.SHADOW_WRITE; // 影子写默认开(本文件验的就是默认态)

const require = createRequire(import.meta.url);
const store = require('../../lib/store.js');
const sqlite = require('../../lib/sqlite-store.js');
const migrate = require('../../lib/migrate.js');
const shadow = require('../../lib/shadow.js');
const repoChat = require('../../lib/repo/chat.js');
const repoClicks = require('../../lib/repo/clicks.js');
const repoErrors = require('../../lib/repo/errors.js');
const repoVisits = require('../../lib/repo/visits.js');
const chat = require('../../lib/chat.js');
const track = require('../../lib/track.js');
const clientErrors = require('../../lib/client-errors.js');
const retention = require('../../lib/retention.js');
const ratelimit = require('../../lib/ratelimit.js');

const g = store.gateData;
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 12, 12, 0, 0);
const PARITY = path.join(ROOT, 'scripts/admin/table-parity.cjs');

// ---------- 假请求 / 假响应(与 lib-track-rate.test.js 同一套形态)----------
function mkRes() {
  return {
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    getHeader(k) {
      return this.headers[k];
    },
    writeHead(c, h) {
      this.code = c;
      Object.assign(this.headers, h || {});
    },
    end(b) {
      this.body = b;
    },
    on() {},
  };
}
function mkReq(ip, payload, uaName) {
  const handlers = {};
  return {
    method: 'POST', // client-errors.handleReport 只收 POST(405 是它的门)
    socket: { remoteAddress: ip },
    headers: { 'user-agent': uaName, 'content-type': 'application/json' },
    on(ev, cb) {
      (handlers[ev] = handlers[ev] || []).push(cb);
    },
    destroy() {},
    emit(ev, arg) {
      (handlers[ev] || []).forEach((f) => f(arg));
    },
    fire() {
      this.emit('data', Buffer.from(JSON.stringify(payload)));
      this.emit('end');
    },
  };
}

// 每次换一个 UA:deviceKey=sha256(UA) 是聊天 3 秒限流与访问 60 秒去重的身份键,
// 复用同一个 UA 会让后面的用例被前一个的窗口拦住(表现为 429 / 不计数,与影子写无关的假失败)。
let uaSeq = 0;
function ua(label) {
  uaSeq++;
  // 不得含 store.BOT_UA_RE 的词(headless/playwright/curl/…),否则被判自动化而不建档
  return (
    'Mozilla/5.0 (Linux; Android 14; Pixel 9) HotTables-' +
    (label || 'x') +
    '-' +
    uaSeq +
    '-' +
    Date.now()
  );
}
/** 发一条聊天(返回 {res, msg}) */
function postChat(text, ip) {
  const r = mkReq(ip || '203.0.113.10', { text }, ua('chat'));
  const res = mkRes();
  chat.handleChatPost(r, res);
  r.fire();
  return { res, r };
}
function postClick(payload, ip) {
  const r = mkReq(ip || '203.0.113.20', payload, ua('click'));
  const res = mkRes();
  track.handleTrackClick(r, res);
  r.fire();
  return res;
}
function postTrackError(payload, ip) {
  const r = mkReq(ip || '203.0.113.30', payload, ua('err'));
  const res = mkRes();
  track.handleTrackError(r, res);
  r.fire();
  return res;
}
function reportClientError(payload, ip) {
  const r = mkReq(ip || '203.0.113.31', payload, ua('report'));
  const res = mkRes();
  clientErrors.handleReport(r, res);
  r.fire();
  return res;
}

function clearTables() {
  repoChat.removeAll();
  repoClicks.removeAll();
  repoErrors.removeAll();
  repoVisits.removeAll();
  // 回填哨兵也要复位,否则"表为空 + 哨兵在"会让回填用例误判成已灌过
  sqlite.getDb().prepare('DELETE FROM shadow_backfill').run();
}

function tableCounts() {
  return shadow.shadowStats().tables;
}

beforeEach(() => {
  shadow.ensureSchema();
  track.flushTrack(); // 先排掉上一用例的在途批次(它会落表)
  clearTables();
  shadow._resetStats();
  g.chat = [];
  g.visits = [];
  g.clientErrors = [];
  g.linkClicks = [];
  g.chatRate = {};
  clientErrors._setErrorList([]);
  clearTables();
  ratelimit._reset();
  delete process.env.SHADOW_WRITE;
  process.env.RETENTION_DISABLED = '1';
});

// =====================================================================
describe('① 版本化迁移器', () => {
  // 这两个用例要验"从零开始前进",所以各自开一个**私有临时库**——
  // 共享库的 schema_version 在 beforeEach 的 ensureSchema() 里已经到 1 了。
  const Database = require('better-sqlite3');
  function freshDb(tag) {
    return new Database(
      path.join(tmpDir, tag + '-' + Date.now() + '-' + Math.random().toString(36).slice(2))
    );
  }

  it('schema_version 记版本;重复 runMigrations 不再应用任何迁移、不重复记账', () => {
    const db = freshDb('mig-advance');
    try {
      const first = migrate.runMigrations(db);
      expect(first.from).toBe(0);
      expect(first.applied).toEqual(['001_hot_tables']);
      expect(first.to).toBeGreaterThanOrEqual(1);
      const second = migrate.runMigrations(db);
      expect(second.applied).toEqual([]); // 版本已到,一条都不再跑
      expect(second.to).toBe(second.from);
      const rows = migrate.listApplied(db);
      expect(rows.length).toBe(1); // 台账只有一行(001),第二次跑没有追加
      expect(rows[0].name).toBe('001_hot_tables');
      // 迁移器自己的两张记账表也是幂等建的
      expect(migrate.hasTable(db, 'schema_version')).toBe(true);
      expect(migrate.hasTable(db, 'shadow_backfill')).toBe(true);
    } finally {
      db.close();
    }
  });

  it('001 的 SQL 逐语句幂等:同一份文本再 exec 两次都不报错', () => {
    const db = sqlite.getDb();
    const sql = fs.readFileSync(path.join(migrate.MIGRATIONS_DIR, '001_hot_tables.sql'), 'utf8');
    expect(() => db.exec(sql)).not.toThrow();
    expect(() => db.exec(sql)).not.toThrow();
  });

  it('迁移文件只加表/加索引,没有任何破坏性 ALTER(路线图 R1 第 1 步的明文纪律)', () => {
    const sql = fs.readFileSync(path.join(migrate.MIGRATIONS_DIR, '001_hot_tables.sql'), 'utf8');
    const code = sql
      .split('\n')
      .filter((l) => !/^\s*--/.test(l))
      .join('\n');
    for (const banned of ['ALTER', 'DROP', 'TRUNCATE', 'RENAME', 'DELETE', 'UPDATE']) {
      expect(new RegExp('\\b' + banned + '\\b', 'i').test(code)).toBe(false);
    }
    expect((code.match(/CREATE TABLE IF NOT EXISTS/gi) || []).length).toBe(4);
    expect((code.match(/CREATE INDEX IF NOT EXISTS/gi) || []).length).toBeGreaterThan(4);
  });

  it('四张真表 + 时间戳列 + 索引都在(按 ts/t 查询与裁剪的前提)', () => {
    const db = sqlite.getDb();
    for (const t of ['chat_messages', 'click_events', 'client_errors', 'visits']) {
      expect(migrate.hasTable(db, t)).toBe(true);
    }
    const cols = (t) =>
      db
        .prepare('PRAGMA table_info(' + t + ')')
        .all()
        .map((c) => c.name);
    expect(cols('chat_messages')).toEqual(
      expect.arrayContaining(['ts', 'nick', 'body', 'dk', 'admin', 'bot', 'src', 'written_at'])
    );
    expect(cols('click_events')).toEqual(
      expect.arrayContaining([
        't',
        'dk',
        'name',
        'ip',
        'geo',
        'ua',
        'brand',
        'dev',
        'fp',
        'link',
        'url',
        'pos',
      ])
    );
    expect(cols('client_errors')).toEqual(
      expect.arrayContaining([
        't',
        'last_t',
        'count',
        'channel',
        'src_id',
        'msg',
        'src_file',
        'line',
        'stack',
        'view_mode',
        'player_pos',
        'world',
        'lineno',
        'colno',
      ])
    );
    expect(cols('visits')).toEqual(expect.arrayContaining(['t', 'vid']));
    const idx = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'chat_messages'")
      .all()
      .map((i) => i.name);
    expect(idx).toContain('idx_chat_messages_ts');
  });

  it('改过已应用迁移的内容 = 拒绝执行(不能悄悄重放历史)', () => {
    const dir = fs.mkdtempSync(path.join(tmpDir, 'mig-'));
    const db = freshDb('mig-tamper');
    try {
      fs.writeFileSync(
        path.join(dir, '001_x.sql'),
        'CREATE TABLE IF NOT EXISTS t_probe (a INTEGER);'
      );
      expect(migrate.runMigrations(db, { dir }).applied).toEqual(['001_x']);
      fs.writeFileSync(
        path.join(dir, '001_x.sql'),
        'CREATE TABLE IF NOT EXISTS t_probe_other (a INTEGER);'
      );
      expect(() => migrate.runMigrations(db, { dir })).toThrow(/被改过/);
    } finally {
      db.close();
    }
  });
});

// =====================================================================
describe('② 影子写:四个集合在既有写入点旁边落表', () => {
  it('聊天发言 → chat_messages,且响应码/响应体/数组内容都没变', () => {
    const { res } = postChat('今天的风好大');
    expect(res.code).toBe(200);
    expect(res.body).toBe('{"ok":true}');
    expect(g.chat.length).toBe(1);
    const rows = repoChat.readAll();
    expect(rows.length).toBe(1);
    expect(rows[0].t).toBe('今天的风好大');
    expect(rows[0].ts).toBe(g.chat[0].ts); // 同一个内存对象的同一个字段 ⇒ 逐位相等
    expect(rows[0].dk).toBe(g.chat[0].dk); // me 是读时投影,所以必须落 dk
  });

  it('recordVisit → visits 表,档案 id 为 null 时也照原样落 null', () => {
    store.recordVisit(mkReq('203.0.113.11', {}, ua('v1')), 'vid-abc', null);
    store.recordVisit(mkReq('203.0.113.12', {}, ua('v2')), null, null);
    const rows = repoVisits.readAll();
    expect(rows.length).toBe(2);
    expect(rows[0].id).toBe('vid-abc');
    expect(rows[1].id).toBe(null);
    expect(rows.map((r) => r.t)).toEqual(g.visits.map((v) => v.t));
  });

  it('一批点击 = 一次多行 insert(攒批语义没被影子写打散)', () => {
    const spy = vi.spyOn(repoClicks, 'insertMany');
    for (let i = 0; i < 5; i++) {
      const res = postClick({
        link: 'L' + i,
        url: 'https://e.com/' + i,
        pos: { x: 1, y: 2, z: 3 },
      });
      expect(res.code).toBe(200);
    }
    expect(repoClicks.count()).toBe(0); // 还在内存攒批,一条都没落
    expect(track.flushTrack()).toBe(5);
    expect(spy).toHaveBeenCalledTimes(1); // 一批一次,不是每条一次
    expect(repoClicks.count()).toBe(5);
    const rows = repoClicks.readAll();
    expect(rows.map((r) => r.link)).toEqual(['L0', 'L1', 'L2', 'L3', 'L4']);
    expect(rows[0].pos).toEqual({ x: 1, y: 2, z: 3 });
    expect(rows.map((r) => r.t)).toEqual(g.linkClicks.map((c) => c.t));
    spy.mockRestore();
  });

  it('/api/track/error → client_errors(channel=gate),字段逐条还原', () => {
    const res = postTrackError({ msg: 'boom', src: 'a.js', line: 7 });
    expect(res.code).toBe(200);
    expect(repoErrors.count(repoErrors.GATE)).toBe(1);
    const [row] = repoErrors.readGateTail(10);
    expect(row.msg).toBe('boom');
    expect(row.src).toBe('a.js');
    expect(row.line).toBe(7);
    expect(row.t).toBe(g.clientErrors[0].t);
  });

  it('client_errors.json 的聚合条目 → channel=file,同一条错误复发是覆盖而不是新增行', () => {
    expect(
      reportClientError({ type: 'js', message: '同一个错', source: 'x.js', stack: 'st' }).code
    ).toBe(200);
    expect(repoErrors.count(repoErrors.FILE)).toBe(1);
    expect(reportClientError({ type: 'js', message: '同一个错', source: 'x.js' }).code).toBe(200);
    expect(repoErrors.count(repoErrors.FILE)).toBe(1); // upsert,不产生重复行
    const [row] = repoErrors.readFileAll();
    expect(row.count).toBe(2);
    const list = clientErrors._getErrorList();
    expect(list[0].count).toBe(2);
    expect(row.lastT).toBe(list[0].lastT);
    expect(row.id).toBe(list[0].id);
  });

  it('后台"清空点击记录"是数组与表一起清(否则对账永远对不上)', () => {
    postClick({ link: 'L' });
    track.flushTrack();
    expect(repoClicks.count()).toBe(1);
    const cres = mkRes();
    track.handleClicksClear(
      { headers: { 'x-token': process.env.TOKEN }, socket: { remoteAddress: '127.0.0.1' } },
      cres,
      {}
    );
    expect(cres.code).toBe(200);
    expect(JSON.parse(cres.body).cleared).toBe(1);
    expect(g.linkClicks.length).toBe(0);
    expect(repoClicks.count()).toBe(0);
  });

  it('畸形行(缺时间戳/缺聚合主键)不落表,但不算失败', () => {
    expect(repoChat.insert({ n: 'x', t: 'y' })).toBe(0);
    expect(repoClicks.insert({ link: 'L' })).toBe(0);
    expect(repoVisits.insert({ id: 'v' })).toBe(0);
    expect(repoErrors.insertGate({ msg: 'm' })).toBe(0);
    expect(repoErrors.upsertFile({ t: 1, message: '没有 id' })).toBe(0);
    expect(repoChat.count()).toBe(0);
    expect(shadow.shadowStats().failures.chat).toBe(0);
  });
});

// =====================================================================
describe('③ 两道总闸', () => {
  it('SHADOW_WRITE=0:四个写入点全部不落表,响应结论与数组行为一条不变', () => {
    process.env.SHADOW_WRITE = '0';
    expect(shadow.on()).toBe(false);

    expect(postChat('关掉影子也要发得出去').res.code).toBe(200);
    expect(postClick({ link: 'L' }).code).toBe(200);
    expect(track.flushTrack()).toBe(1);
    expect(postTrackError({ msg: 'e' }).code).toBe(200);
    expect(reportClientError({ type: 'js', message: 'm', source: 's' }).code).toBe(200);
    store.recordVisit(mkReq('203.0.113.44', {}, ua('off')), 'vid-x', null);

    expect(tableCounts()).toEqual({
      chat_messages: 0,
      click_events: 0,
      client_errors: 0,
      visits: 0,
    });
    // 数组侧一切照旧(读路径本来就只吃数组)
    expect(g.chat.length).toBe(1);
    expect(g.linkClicks.length).toBe(1);
    expect(g.clientErrors.length).toBe(1);
    expect(g.visits.length).toBe(1);
    // 表侧清扫同样停用
    expect(shadow.pruneTables({ now: NOW + 999 * DAY, keepMs: retention.RETENTION_MS })).toEqual({
      chat: 0,
      clicks: 0,
      errors: 0,
      visits: 0,
    });
    delete process.env.SHADOW_WRITE;
  });

  it('SHADOW_WRITE=0 时 shadow.start 不建表也不回填', () => {
    process.env.SHADOW_WRITE = '0';
    const rep = shadow.start({ chat: [{ n: 'a', t: 'x', ts: 1 }] });
    expect(rep.enabled).toBe(false);
    expect(rep.reason).toBe('SHADOW_WRITE=0');
    delete process.env.SHADOW_WRITE;
  });

  it('USE_SQLITE=0(子进程实测):影子层自动停用,.db 压根不生成,业务照写 JSON', () => {
    const dir = fs.mkdtempSync(path.join(tmpDir, 'nosqlite-'));
    const json = path.join(dir, 'gate_data.json');
    const dbPath = path.join(dir, 'gate_data.db');
    const code = `
      const fs = require('fs');
      const assert = (c, m) => { if (!c) throw new Error(m); };
      const store = require('./lib/store.js');
      const shadow = require('./lib/shadow.js');
      const sqlite = require('./lib/sqlite-store.js');
      const chat = require('./lib/chat.js');
      assert(shadow.on() === false, 'USE_SQLITE=0 时影子层必须停用');
      const handlers = {};
      const req = { socket: { remoteAddress: '203.0.113.99' },
        headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 14) Real Device', 'content-type': 'application/json' },
        on(ev, cb) { handlers[ev] = cb; }, destroy() {} };
      const res = { setHeader() {}, getHeader() {}, writeHead(c) { this.code = c; }, end(b) { this.body = b; }, on() {} };
      chat.handleChatPost(req, res);
      handlers.data(Buffer.from(JSON.stringify({ text: '离线也发得出' })));
      handlers.end();
      store.recordVisit(req, 'v1', null);
      assert(res.code === 200, '响应码不变');
      assert(store.gateData.chat.length === 1, '数组照旧');
      assert(sqlite.available() === false, 'SQLite 未开');
      process.stdout.write(JSON.stringify({ exists: fs.existsSync(process.env.SQLITE_PATH), on: shadow.shadowStats().on }));
      process.exit(0);`;
    const out = execFileSync(process.execPath, ['-e', code], {
      cwd: ROOT,
      env: {
        ...process.env,
        GATE_DATA_FILE: json,
        SQLITE_PATH: dbPath,
        CLIENT_ERRORS_FILE: path.join(dir, 'client_errors.json'),
        USE_SQLITE: '0',
        RETENTION_DISABLED: '1',
      },
      encoding: 'utf8',
    });
    const parsed = JSON.parse(out);
    expect(parsed.exists).toBe(false); // 影子层停用 ⇒ 连库文件都不该被创建
    expect(parsed.on).toBe(false);
  });

  it('句柄已关 / better-sqlite3 缺失(available()=false)时影子写自动停用且不抛', () => {
    sqlite.close();
    shadow._dropSchemaReady();
    expect(shadow.on()).toBe(false);
    expect(() => shadow.chat({ n: 'a', t: 'b', ts: Date.now() })).not.toThrow();
    expect(() => shadow.clicks([{ t: Date.now() }])).not.toThrow();
    expect(() => shadow.visit({ t: Date.now() })).not.toThrow();
    expect(() => shadow.gateError({ t: Date.now() })).not.toThrow();
    expect(() => shadow.fileError({ id: 'x', t: Date.now() })).not.toThrow();
    expect(() => shadow.pruneTables({ now: NOW, keepMs: retention.RETENTION_MS })).not.toThrow();
    expect(shadow.start(g).enabled).toBe(false);
    // 恢复:重新打开临时库,后续用例继续用
    sqlite.initDb(TMP_DB);
    shadow._dropSchemaReady();
    expect(shadow.ensureSchema()).toBe(true);
    expect(shadow.on()).toBe(true);
  });
});

// =====================================================================
describe('④ 双写炸了不能带崩业务', () => {
  let origInsert;
  beforeEach(() => {
    origInsert = repoChat.insert;
  });
  afterEach(() => {
    repoChat.insert = origInsert;
    vi.restoreAllMocks();
  });

  it('repo 抛异常 ⇒ 请求结论一字不变、异常被吞、同因只 warn 一次并计数', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    repoChat.insert = () => {
      throw new Error('模拟炸库');
    };
    const codes = [];
    const bodies = [];
    for (let i = 0; i < 3; i++) {
      const { res } = postChat('炸了也要发' + i, '203.0.113.5' + i);
      codes.push(res.code);
      bodies.push(res.body);
    }
    expect(codes).toEqual([200, 200, 200]); // 响应码没变
    expect(bodies).toEqual(['{"ok":true}', '{"ok":true}', '{"ok":true}']); // 响应体没变
    expect(g.chat.length).toBe(3); // 数组照旧
    expect(repoChat.count()).toBe(0); // 表侧全挂
    const st = shadow.shadowStats();
    expect(st.failures.chat).toBe(3); // 失败只计数
    expect(warnSpy.mock.calls.filter((c) => String(c[0]).includes('双写失败'))).toHaveLength(1); // 不刷屏
  });

  it('影子写不新增/不删改任何数组字段(现有测试断言结果不受影响的正面证据)', () => {
    const beforeChat = JSON.stringify(g.chat);
    const { res } = postChat('比对');
    store.recordVisit(mkReq('203.0.113.61', {}, ua('shape')), 'v', null);
    expect(res.code).toBe(200);
    expect(JSON.stringify(g.chat)).not.toBe(beforeChat); // 数组照常追加
    // 但"多出来的东西"只有影子表:数组元素的键集与整改前逐字一致(undefined 值经 JSON 归一)
    expect(Object.keys(JSON.parse(JSON.stringify(g.chat[0]))).sort()).toEqual([
      'dk',
      'n',
      't',
      'ts',
    ]);
    expect(Object.keys(g.visits[0]).sort()).toEqual(['id', 't']);
    expect(repoChat.count()).toBe(1);
    expect(repoVisits.count()).toBe(1);
  });
});

// =====================================================================
describe('⑤ 一次性历史回填与幂等', () => {
  it('表为空且源数组有历史 ⇒ 灌一次;再跑一遍绝不重复灌', () => {
    clearTables();
    g.chat = [
      { n: 'a', t: '老话一', ts: NOW - 3 * DAY, dk: 'dk1' },
      { n: 'b', t: '老话二', ts: NOW - 2 * DAY, dk: 'dk2' },
    ];
    g.visits = [{ t: NOW - 5 * DAY, id: 'v1' }];
    g.linkClicks = [{ t: NOW - 6 * DAY, link: 'L', url: '', fp: {}, dev: {}, pos: null }];
    g.clientErrors = [{ t: NOW - 7 * DAY, msg: '老报错', src: 'a.js', line: 1 }];

    const first = shadow.start(g);
    expect(first.enabled).toBe(true);
    expect(first.backfill.chat_messages).toBe(2);
    expect(first.backfill.visits).toBe(1);
    expect(first.backfill.click_events).toBe(1);
    expect(first.backfill.client_errors_gate).toBe(1);
    expect(repoChat.count()).toBe(2);

    // 重跑(等价于进程重启):行数一字不变
    const second = shadow.start(g);
    expect(second.backfill.chat_messages).toBe(0);
    expect(repoChat.count()).toBe(2);
    expect(repoVisits.count()).toBe(1);
    expect(repoClicks.count()).toBe(1);
    expect(repoErrors.count(repoErrors.GATE)).toBe(1);

    // 影子写再追加一行后,第三轮也不得把历史再灌一遍(哨兵 + 空表双保险)
    shadow.chat({ n: 'c', t: '新话', ts: NOW, dk: 'dk3' });
    expect(repoChat.count()).toBe(3);
    expect(shadow.start(g).backfill.chat_messages).toBe(0);
    expect(repoChat.count()).toBe(3);
    // 回填行与实时行用 src 区分
    const srcs = sqlite
      .getDb()
      .prepare('SELECT DISTINCT src FROM chat_messages ORDER BY src')
      .all()
      .map((r) => r.src);
    expect(srcs.sort()).toEqual(['backfill', 'live']);
  });

  it('源数组为空 ⇒ 不灌、也不落哨兵(以后真有历史时仍能灌)', () => {
    clearTables();
    const rep = shadow.start({});
    expect(Object.values(rep.backfill).every((n) => n === 0)).toBe(true);
    expect(sqlite.getDb().prepare('SELECT collection FROM shadow_backfill').all().length).toBe(0);
    expect(repoChat.count()).toBe(0);
  });

  it('client_errors.json 的聚合表回填走同一个哨兵', () => {
    clearTables();
    const list = [
      {
        id: 'e1',
        t: NOW - DAY,
        lastT: NOW - DAY,
        count: 3,
        type: 'js',
        message: 'm1',
        source: 's1',
      },
      {
        id: 'e2',
        t: NOW - 2 * DAY,
        lastT: NOW,
        count: 1,
        type: 'network',
        message: 'm2',
        source: 's2',
      },
    ];
    expect(shadow.backfillFileErrors(list)).toBe(2);
    expect(repoErrors.count(repoErrors.FILE)).toBe(2);
    expect(shadow.backfillFileErrors(list)).toBe(0); // 第二次不灌
    expect(repoErrors.count(repoErrors.FILE)).toBe(2);
    const one = repoErrors.readFileAll().find((e) => e.id === 'e1');
    expect(one.count).toBe(3);
    expect(one.t).toBe(NOW - DAY);
  });
});

// =====================================================================
describe('⑥ 保留期覆盖新表(DG-PRIV-001 的表侧)', () => {
  const oldChat = NOW - 120 * DAY; // chat 90 天
  const oldClick = NOW - 200 * DAY; // linkClicks 180 天
  const oldErr = NOW - 60 * DAY; // clientErrors 30 天
  const oldVisit = NOW - 120 * DAY; // visits 90 天
  function seed() {
    repoChat.insertMany([
      { n: 'a', t: '老', ts: oldChat, dk: 'd' },
      { n: 'b', t: '新', ts: NOW - DAY, dk: 'd' },
    ]);
    repoClicks.insertMany([
      { t: oldClick, link: 'old', fp: {}, dev: {} },
      { t: NOW - DAY, link: 'new', fp: {}, dev: {} },
    ]);
    repoErrors.insertGate({ t: oldErr, msg: 'old', src: 'a.js' });
    repoErrors.insertGate({ t: NOW - DAY, msg: 'new', src: 'a.js' });
    repoErrors.upsertFile({
      id: 'f-old',
      t: oldErr,
      lastT: oldErr,
      count: 1,
      message: 'old',
      source: 's',
      type: 'js',
    });
    repoErrors.upsertFile({
      id: 'f-new',
      t: oldErr,
      lastT: NOW - DAY,
      count: 1,
      message: 'new',
      source: 's',
      type: 'js',
    });
    repoVisits.insertMany([
      { t: oldVisit, id: 'v' },
      { t: NOW - DAY, id: 'v' },
    ]);
    // 数组侧同样埋老数据(影子写阶段的真实形态:两边都有,同一批 cutoff)
    g.chat = [
      { n: 'a', t: '老', ts: oldChat, dk: 'd' },
      { n: 'b', t: '新', ts: NOW - DAY, dk: 'd' },
    ];
    g.linkClicks = [
      { t: oldClick, link: 'old', fp: {}, dev: {} },
      { t: NOW - DAY, link: 'new', fp: {}, dev: {} },
    ];
    g.clientErrors = [
      { t: oldErr, msg: 'old', src: 'a.js' },
      { t: NOW - DAY, msg: 'new', src: 'a.js' },
    ];
    g.visits = [
      { t: oldVisit, id: 'v' },
      { t: NOW - DAY, id: 'v' },
    ];
  }

  it('整轮清扫把四张表里的过期行删掉,新鲜行逐条留下', () => {
    seed();
    expect(tableCounts()).toEqual({
      chat_messages: 2,
      click_events: 2,
      client_errors: 4,
      visits: 2,
    });
    delete process.env.RETENTION_DISABLED; // 表侧裁剪跟着紧急闸走
    const r = retention.runSweep({ now: NOW });
    expect(r.removed).toMatchObject({
      chatTable: 1,
      linkClicksTable: 1,
      clientErrorsTable: 2, // gate 信道 1 条 + file 信道 1 条(lastT 也超期)
      visitsTable: 1,
    });
    expect(repoChat.count()).toBe(1);
    expect(repoClicks.count()).toBe(1);
    expect(repoVisits.count()).toBe(1);
    expect(repoErrors.count(repoErrors.GATE)).toBe(1);
    expect(repoErrors.count(repoErrors.FILE)).toBe(1);
    expect(repoErrors.readFileAll()[0].id).toBe('f-new'); // lastT 只有一天:仍在复发,绝不老化
    expect(g.chat.map((m) => m.t)).toEqual(['新']); // 数组侧同 cutoff 同步被裁
    const again = retention.runSweep({ now: NOW }); // 幂等:第二轮无事可做
    expect(again.removed.chatTable).toBe(0);
    expect(again.removed.clientErrorsTable).toBe(0);
    expect(again.writes).toBe(0);
  });

  it('表里只有过期行而数组没有 ⇒ 删表但**不产生第二次全库落盘**', () => {
    repoChat.insert({ n: 'a', t: '只有表里有', ts: NOW - 999 * DAY, dk: 'd' });
    g.chat = [];
    let saveCalls = 0;
    const real = store.saveGateData;
    store.saveGateData = () => {
      saveCalls++;
      return Promise.resolve();
    };
    delete process.env.RETENTION_DISABLED;
    try {
      const r = retention.runSweep({ now: NOW });
      expect(r.removed.chatTable).toBe(1);
      expect(repoChat.count()).toBe(0);
      expect(r.writes).toBe(0); // 全库快照一次都没写:表行与快照无关
      expect(saveCalls).toBe(0);
    } finally {
      store.saveGateData = real;
    }
  });

  it('预览只统计不删行,也不落盘', () => {
    seed();
    delete process.env.RETENTION_DISABLED;
    const p = retention.previewSweep({ now: NOW });
    expect(p.removed.chatTable).toBe(1);
    expect(p.writes).toBe(0);
    expect(repoChat.count()).toBe(2); // 一行都没删
  });

  it('RETENTION_DISABLED=1 时表侧 DELETE 一起闸住(紧急闸两边都闸)', () => {
    repoChat.insert({ n: 'a', t: '老', ts: NOW - 999 * DAY, dk: 'd' });
    expect(process.env.RETENTION_DISABLED).toBe('1');
    const r = retention.runSweep({ now: NOW });
    expect(r.removed.chatTable).toBe(0);
    expect(repoChat.count()).toBe(1);
  });

  it('缺时间戳的行根本不落表 ⇒ "跳过不删"的口径两边一致', () => {
    g.chat = [{ n: 'a', t: '没有 ts' }];
    shadow.chat(g.chat[0]);
    expect(repoChat.count()).toBe(0);
    expect(shadow.shadowStats().skipped.chat).toBe(1);
  });
});

// =====================================================================
describe('⑦ 对账脚本 scripts/admin/table-parity.cjs 的三种退出码', () => {
  function runParity(env) {
    try {
      const out = execFileSync(process.execPath, [PARITY], {
        cwd: ROOT,
        env: {
          ...process.env,
          GATE_DATA_FILE: TMP_JSON,
          SQLITE_PATH: TMP_DB,
          CLIENT_ERRORS_FILE: TMP_ERRORS,
          ...(env || {}),
        },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { status: 0, out };
    } catch (e) {
      // 退出码直接来自 process.exit(e.status):判据不是管道尾巴的 $?
      return {
        status: typeof e.status === 'number' ? e.status : 2,
        out: (e.stdout || '') + (e.stderr || ''),
      };
    }
  }

  /** 两边都从"同一个写入点"落一次,然后 await 快照写盘(让 kv/JSON 与表同时到货) */
  async function makeBothSidesAgree() {
    clearTables();
    g.chat = [];
    g.visits = [];
    g.linkClicks = [];
    g.clientErrors = [];
    clientErrors._setErrorList([]);
    expect(postChat('对账发言').res.code).toBe(200);
    store.recordVisit(mkReq('203.0.113.71', {}, ua('par')), 'vid-parity', null);
    expect(postClick({ link: 'L', url: 'https://e.com', pos: { x: 1, y: 1, z: 1 } }).code).toBe(
      200
    );
    track.flushTrack();
    expect(postTrackError({ msg: 'boom', src: 'a.js', line: 3 }).code).toBe(200);
    expect(reportClientError({ type: 'js', message: '聚合错', source: 's.js' }).code).toBe(200);
    await store.saveGateData();
    expect(fs.existsSync(TMP_ERRORS)).toBe(true);
    expect(fs.existsSync(TMP_JSON)).toBe(true);
  }

  it('一致 ⇒ 退出码 0', async () => {
    await makeBothSidesAgree();
    const out = runParity();
    expect(out.out).toContain('结果: 一致');
    expect(out.status).toBe(0);
  });

  it('表缺行 ⇒ 退出码 1(是"有差异",不是"无法比对")', async () => {
    await makeBothSidesAgree();
    repoChat.removeAll(); // 制造"源有、表没有"
    const out = runParity();
    expect(out.status).toBe(1);
    expect(out.out).toContain('有差异');
    expect(out.out).toContain('chat_messages');
  });

  it('表比源多(条数上限之外的历史行)⇒ 仍判 0,只报信息', async () => {
    await makeBothSidesAgree();
    // 灌 200 条:源数组 MAX_MSG=100 会挤掉最旧的,表不受条数上限约束(只受保留期)
    const many = [];
    for (let i = 0; i < 200; i++) many.push({ n: 'a', t: '挤出去的' + i, ts: NOW - 10 * DAY + i });
    repoChat.insertMany(many);
    const out = runParity();
    expect(out.status).toBe(0);
    expect(out.out).toMatch(/表多 \d+ 行/);
  });

  it('连不上库 / 表还没建 / SQLite 未启用 ⇒ 退出码 2', async () => {
    await makeBothSidesAgree();
    // (a) 库文件读不到
    const missing = runParity({ SQLITE_PATH: path.join(tmpDir, 'nope', 'none.db') });
    expect(missing.status).toBe(2);
    expect(missing.out).toContain('无法比对');
    // (b) USE_SQLITE=0 ⇒ 没有可比的东西
    const off = runParity({ USE_SQLITE: '0' });
    expect(off.status).toBe(2);
    expect(off.out).toContain('SQLite 未启用');
    // (c) 库能打开、快照读得出,但影子表没建(迁移从未跑过)
    const bare = path.join(tmpDir, 'bare.db');
    const Database = require('better-sqlite3');
    const fresh = new Database(bare);
    fresh.exec('CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    fresh
      .prepare("INSERT INTO kv (key, value) VALUES ('gateData', ?)")
      .run(JSON.stringify({ chat: [], visits: [] }));
    fresh.close();
    const noTables = runParity({ SQLITE_PATH: bare });
    expect(noTables.status).toBe(2);
    expect(noTables.out).toContain('表尚未建立');
  });
});

// =====================================================================
// ⑧ 线上第一次真数据对账暴露的两处形状差(2026-10-13)
// 本地 30 条用例全绿,线上第一次跑真数据就红了 177 行:不是行丢了,是**同一行的两种写法**——
//   · `view_mode TEXT` 收到 JS number 0,better-sqlite3 按 double 绑定,SQLite 的 TEXT 亲和
//     把它写成 '0.0';源里是数字 0 ⇒ 永远对不上(file 信道 158 行)。
//   · `brand` 源里既可能是字符串也可能是 UA 解析出的对象:对象被 textCol 存成 JSON 文本,
//     读回却是裸字符串,而 normText(对象) == '[object Object]' 会把两个不同品牌判成相等
//     (gate 8 行 / clicks 11 行)。⇒ 判据本身也有精度窟窿。
// 迁移文件已经在线上跑过,**改它一个字就会被校验和闸门拒绝**,所以列类型不动,归一放读写两侧。
describe('⑧ 表行必须回到源的那个域(线上真数据撞出来的两条)', () => {
  const HOUR = 3600 * 1000;
  it('数字 viewMode 落 TEXT 列再读回 ⇒ 还是数字,不是 "0.0"', () => {
    clearTables();
    const t = NOW - 2 * HOUR;
    shadow.fileError({
      id: 'shape-vm-1',
      t,
      lastT: t,
      count: 3,
      type: 'network',
      message: 'm',
      source: 's',
      lineno: 0,
      colno: 0,
      viewMode: 0,
    });
    // 直接看列的原始形状:写入侧已改成 textCol,新行存 '0' 而不是 '0.0'
    const raw = sqlite
      .getDb()
      .prepare("SELECT view_mode FROM client_errors WHERE channel='file' AND src_id='shape-vm-1'")
      .get();
    expect(raw.view_mode).toBe('0');
    expect(repoErrors.readFileAll()[0].viewMode).toBe(0);
  });

  it("历史行里已经落成的 '0.0' ⇒ 读回归一成数字(不删数据、不改列类型也能对得上源)", () => {
    clearTables();
    const t = NOW - 3 * HOUR;
    sqlite
      .getDb()
      .prepare(
        "INSERT INTO client_errors (channel, src_id, t, last_t, count, type, message, source, view_mode) VALUES ('file','legacy-00',?, ?,1,'js','m','s','0.0')"
      )
      .run(t, t);
    expect(repoErrors.readFileAll()[0].viewMode).toBe(0);
  });

  it('brand 是对象 ⇒ 读回还是对象;是字符串 ⇒ 原样;两种品牌不会被抹平成同一个', () => {
    clearTables();
    const t = NOW - 4 * HOUR;
    shadow.gateError({
      t,
      dk: 'dkA',
      name: '访客',
      ip: '1.1.1.1',
      brand: { brand: 'Mac', model: 'Mac', full: 'Mac' },
      msg: '',
      src: '',
      line: 0,
      ua: 'UA',
    });
    shadow.gateError({
      t: t + 1,
      dk: 'dkB',
      name: '访客',
      ip: '2.2.2.2',
      brand: '其他安卓',
      msg: '',
      src: '',
      line: 0,
      ua: 'UA',
    });
    const rows = repoErrors.readGateTail(10);
    expect(rows[0].brand).toEqual({ brand: 'Mac', model: 'Mac', full: 'Mac' });
    expect(rows[1].brand).toBe('其他安卓');
    // 判据的精度:对象品牌走 JSON 签名,不是 String(对象) 的 '[object Object]'
    const sigA = JSON.stringify({ brand: 'Mac', model: 'Mac', full: 'Mac' });
    expect(sigA).not.toBe(JSON.stringify({ brand: 'Xiaomi', model: 'X', full: 'Y' }));
  });

  it('影子写的形状与源逐字段一致(clicks 的 brand 对象 + file 的数字 viewMode)', () => {
    clearTables();
    const t = NOW - 5 * HOUR;
    repoClicks.insertMany([
      {
        t,
        dk: 'dkC',
        name: '访客',
        ip: '3.3.3.3',
        geo: '未知',
        ua: 'UA',
        brand: { brand: 'HONOR', model: 'HONOR', full: 'HONOR' },
        dev: {},
        fp: { tz: -480 },
        link: 'L',
        url: 'https://e.com',
        pos: { x: 13.6, y: 1.6, z: 20.7 },
      },
    ]);
    const c = repoClicks.readAll()[0];
    expect(c.brand).toEqual({ brand: 'HONOR', model: 'HONOR', full: 'HONOR' });
    expect(c.pos).toEqual({ x: 13.6, y: 1.6, z: 20.7 });
    expect(c.fp).toEqual({ tz: -480 });
  });
});
