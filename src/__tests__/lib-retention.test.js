// 访客数据保留期限与最小化清理(lib/retention.js,DG-PRIV-001)
// 钉死这几条行为:
//   ① 每个集合按**时间维度**裁剪:超保留期的清掉,未超期的逐条保留(与既有条数上限共存,不削弱);
//   ② 缺时间戳的畸形条目一律**跳过而不是删**(需要时间却没有字段的 geo / 历史 IP 首轮只补记);
//   ③ 访客档案保守处理:被踢出 / 待批 / 已批准且名下有私有资产 / 管理员标注过的**绝不自动清**;
//      纯匿名长期无访问的老档案默认只打 expiredAt 标记,真删要显式 RETENTION_DELETE_APPLICANTS=1
//      且过完隔离期;
//   ④ 整轮 sweep **只调用一次 saveGateData()**(全量快照写盘很贵),没东西可裁时一次都不调;
//   ⑤ startRetention/stopRetention 幂等且不残留定时器(定时器 unref,stop 之后计时器归零);
//   ⑥ runSweep 可重复调用(幂等:第二轮除"补记时间戳"外不再改变数据)。
// 必须用 createRequire 与被测模块共享同一 Node require 缓存(vitest ESM import 会产生双实例,
// gateData 改动传不进去)。数据一律落系统临时目录(GATE_DATA_FILE / CLIENT_ERRORS_FILE),
// **必须在 require lib 之前**设置;仓库真实的 gate_data.json / client_errors.json 不得被碰。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-retention-'));
process.env.GATE_DATA_FILE = path.join(tmpDir, 'gate_data.json');
process.env.CLIENT_ERRORS_FILE = path.join(tmpDir, 'client_errors.json');
process.env.RETENTION_DISABLED = '1'; // 自动启动留给用例显式验证,避免测试期间有隐藏定时器
process.env.TOKEN = process.env.TOKEN || 'vitest-token-abc';

const require = createRequire(import.meta.url);
const store = require('../../lib/store.js');
const retention = require('../../lib/retention.js');
const clientErrors = require('../../lib/client-errors.js');
const gate = require('../../lib/gate.js');
const chat = require('../../lib/chat.js');
const wishes = require('../../lib/wishes.js');
const track = require('../../lib/track.js');
const quiz = require('../../lib/quiz.js');

const g = store.gateData;
const DAY = 24 * 3600 * 1000;
const NOW = Date.UTC(2026, 9, 11, 12, 0, 0); // 固定时钟:所有判定都可注入,结果可复现
const { RETENTION_DAYS, RETENTION_MS } = retention;

// ---------- 播种工具 ----------
function emptyContainers() {
  g.chat = [];
  g.wishes = [];
  g.clientErrors = [];
  g.linkClicks = [];
  g.visits = [];
  g.quizAttempts = [];
  g.geo = {};
  g.geoTs = {};
  g.applicants = {};
  g.uploads = {};
  g.photoCaptions = {};
  g.userLinks = [];
  g.alerts = [];
  g.blockedIps = [];
  g.watchIps = [];
  g.chatRate = {};
  g.wishRate = {};
  g.renameRate = {};
  g._visitRate = {};
  clientErrors._setErrorList([]);
}
/** 造一个"很久没来过、也没被任何人认领"的匿名档案 */
function anonProfile(id, opts) {
  const o = opts || {};
  const idle = o.idleMs === undefined ? 400 * DAY : o.idleMs;
  g.applicants[id] = {
    answer: o.answer || '访客',
    ua: 'ua-' + id,
    dk: o.dk || 'dk-' + id,
    status: o.status || 'approved',
    applyTime: NOW - idle,
    lastAccess: NOW - idle,
    visits: o.visits || 0,
    note: o.note || '',
    localId: o.localId || '',
    fpSet: o.fpSet || {},
    ips: o.ips || [],
    ip: o.ip || '',
  };
  if (o.kickedTime) g.applicants[id].kickedTime = o.kickedTime;
  if (o.reapplyTime) {
    g.applicants[id].reapplyTime = o.reapplyTime;
    g.applicants[id].reapplyMsg = '想再看一次';
  }
  if (o.sess) g.applicants[id].sess = o.sess;
  if (o.authVersion !== undefined) g.applicants[id].authVersion = o.authVersion;
  return g.applicants[id];
}
function resMock() {
  const res = {
    headers: {},
    setHeader(k, v) {
      res.headers[k] = v;
    },
    getHeader(k) {
      return res.headers[k];
    },
    writeHead() {},
    end() {},
    on() {},
  };
  return res;
}
function reqOf(ua, ip) {
  return {
    headers: { 'user-agent': ua },
    url: '',
    socket: { remoteAddress: ip || '203.0.113.9' },
    on() {},
    setHeader() {},
    getHeader() {},
  };
}

// ---------- saveGateData 计数 ----------
let saveCalls = 0;
let realSave = store.saveGateData;
function spySave() {
  saveCalls = 0;
  realSave = store.saveGateData;
  store.saveGateData = () => {
    saveCalls++;
    return Promise.resolve();
  };
}
function unspySave() {
  store.saveGateData = realSave;
}

beforeEach(() => {
  spySave();
  emptyContainers();
  delete process.env.RETENTION_DELETE_APPLICANTS;
  process.env.RETENTION_DISABLED = '1'; // 默认拒绝自动启动,只有"周期调度"用例临时摘掉这道闸
});
afterEach(() => {
  unspySave();
  retention.stopRetention();
  vi.useRealTimers();
  delete process.env.RETENTION_DELETE_APPLICANTS;
  process.env.RETENTION_DISABLED = '1';
});

describe('保留期表是单一源(数值改动要同步 ADMIN_GUIDE.md / AGENTS.md 的口径)', () => {
  it('每个集合一个保留期,数值与文档一致', () => {
    expect(RETENTION_DAYS).toEqual({
      chat: 90,
      wishes: 180,
      clientErrors: 30,
      linkClicks: 180,
      visits: 90,
      quizAttempts: 180,
      applicantIdle: 365,
      applicantQuarantine: 90,
      geo: 90,
      ipHistory: 180,
      rateTable: 7,
    });
  });
  it('毫秒表由天数表派生,调度周期为一天', () => {
    expect(RETENTION_MS.chat).toBe(90 * DAY);
    expect(RETENTION_MS.clientErrors).toBe(30 * DAY);
    expect(RETENTION_MS.applicantIdle).toBe(365 * DAY);
    expect(retention.SWEEP_INTERVAL_MS).toBe(DAY);
  });
});

describe('超保留期被清,未超期逐条保留', () => {
  it('聊天 / 一念 / 客户端报错 / 点击 / 访问 / 答题:同集合内逐条判定', () => {
    g.chat = [
      { n: 'a', t: '超 120 天', ts: NOW - 120 * DAY, id: 'chat-old' },
      { n: 'b', t: '超 89 天', ts: NOW - 89 * DAY, id: 'chat-keep' },
      { n: 'c', t: '刚好 91 天', ts: NOW - 91 * DAY, id: 'chat-edge' },
    ];
    g.wishes = [
      { id: 'wish-old', t: '念', ts: NOW - 200 * DAY },
      { id: 'wish-keep', t: '念', ts: NOW - 179 * DAY },
    ];
    g.clientErrors = [
      { t: NOW - 40 * DAY, msg: '报错超期', id: 'err-old' },
      { t: NOW - 29 * DAY, msg: '报错新鲜', id: 'err-keep' },
    ];
    g.linkClicks = [
      { t: NOW - 200 * DAY, link: '点超期', id: 'click-old' },
      { t: NOW - 100 * DAY, link: '点未超', id: 'click-keep' },
    ];
    g.visits = [
      { t: NOW - 120 * DAY, id: 'v-old' },
      { t: NOW - 3 * DAY, id: 'v-keep' },
    ];
    g.quizAttempts = [
      { t: NOW - 200 * DAY, id: 'q-old' },
      { t: NOW - 60 * DAY, id: 'q-keep' },
    ];

    const r = retention.runSweep({ now: NOW });
    expect(r.removed).toMatchObject({
      chat: 2,
      wishes: 1,
      linkClicks: 1,
      visits: 1,
      quizAttempts: 1,
    });
    expect(g.chat.map((m) => m.id)).toEqual(['chat-keep']);
    expect(g.wishes.map((m) => m.id)).toEqual(['wish-keep']);
    expect(g.clientErrors.map((m) => m.id)).toEqual(['err-keep']);
    expect(g.linkClicks.map((m) => m.id)).toEqual(['click-keep']);
    expect(g.visits.map((m) => m.id)).toEqual(['v-keep']);
    expect(g.quizAttempts.map((m) => m.id)).toEqual(['q-keep']);
  });

  it('client_errors.json(独立小文件)按 lastT 判龄,仍在复发的错误不老化', () => {
    clientErrors._setErrorList([
      { id: 'ce-dead', t: NOW - 100 * DAY, lastT: NOW - 100 * DAY, message: '早就停了' },
      { id: 'ce-alive', t: NOW - 100 * DAY, lastT: NOW - DAY, message: '昨天还在报' },
      { id: 'ce-only-t', t: NOW - 31 * DAY, message: '没有 lastT' },
      { id: 'ce-no-time', message: '两个时间字段都没有' },
    ]);
    const r = retention.runSweep({ now: NOW });
    const left = clientErrors._getErrorList().map((e) => e.id);
    expect(left).toContain('ce-alive'); // lastT 只有一天:仍在复发,绝不老化
    expect(left).not.toContain('ce-dead'); // lastT 100 天:超 30 天保留期
    expect(left).not.toContain('ce-only-t'); // 无 lastT 时按 t 判龄:31 天 > 30 天
    expect(left).toContain('ce-no-time'); // 两个时间字段都没有 => 畸形,跳过不删
    // gateData.clientErrors(此例 0 条)与文件里的移除数合并计入 removed.clientErrors
    expect(r.removed.clientErrors).toBe(2);
    // 独立文件真的落盘了,而且只有留下的两条
    const onDisk = JSON.parse(fs.readFileSync(process.env.CLIENT_ERRORS_FILE, 'utf8')).list;
    expect(onDisk.map((e) => e.id).sort()).toEqual(['ce-alive', 'ce-no-time']);
  });

  it('限流/防刷死键(纯缓存)按 7 天回收', () => {
    g.chatRate = { fresh: NOW - DAY, dead: NOW - 8 * DAY };
    g.wishRate = {
      fresh: { day: '2026-10-11', n: 1, t: NOW },
      dead: { day: '2026-09-01', n: 3, t: NOW - 40 * DAY },
    };
    g.renameRate = { dead: NOW - 30 * DAY };
    g._visitRate = { dead: NOW - 30 * DAY, fresh: NOW };
    const r = retention.runSweep({ now: NOW });
    expect(Object.keys(g.chatRate)).toEqual(['fresh']);
    expect(Object.keys(g.wishRate)).toEqual(['fresh']);
    expect(Object.keys(g.renameRate)).toEqual([]);
    expect(Object.keys(g._visitRate)).toEqual(['fresh']);
    expect(r.removed.rate).toBe(4);
  });
});

describe('缺时间戳的畸形条目不被删', () => {
  it('t/ts 缺失、为字符串、为 null 或 NaN 的条目全部原样保留', () => {
    const junk = [
      { msg: '没有 t' },
      { t: null, msg: 't 为 null' },
      { t: '1700000000000', msg: 't 是字符串' },
      { t: NaN, msg: 't 是 NaN' },
      { ts: undefined, t: undefined, msg: '两个都没有' },
    ];
    g.clientErrors = junk.slice();
    g.linkClicks = junk.slice();
    g.visits = junk.slice();
    g.chat = junk.slice();
    g.wishes = junk.slice();
    g.quizAttempts = junk.slice();
    const r = retention.runSweep({ now: NOW + 1000 * DAY });
    expect(r.removed).toMatchObject({
      chat: 0,
      wishes: 0,
      linkClicks: 0,
      visits: 0,
      quizAttempts: 0,
    });
    for (const arr of [g.chat, g.wishes, g.clientErrors, g.linkClicks, g.visits, g.quizAttempts]) {
      expect(arr.length).toBe(junk.length);
    }
  });

  it('没有任何时间维度的访客档案既不打标记也不删', () => {
    g.applicants.orphan = { answer: '访客', dk: 'dk-orphan', status: 'approved' };
    const r = retention.runSweep({ now: NOW + 1000 * DAY });
    expect(g.applicants.orphan).toBeTruthy();
    expect(g.applicants.orphan.expiredAt).toBeUndefined();
    expect(r.removed.applicants).toBe(0);
    expect(r.marked.applicants).toBe(0);
  });
});

describe('既有条数上限没有被削弱(与保留期共存)', () => {
  it('各模块的 cap 常量仍是原值', () => {
    expect(chat.MAX_MSG).toBe(100);
    expect(wishes.MAX_MSG).toBe(100);
    expect(wishes.MAX_TOTAL).toBe(5000);
    expect(track.CLICK_CAP).toBe(5000);
    expect(track.ERR_CAP).toBe(500);
    expect(quiz.QUIZ_ATTEMPT_CAP).toBe(200);
    expect(clientErrors.MAX_ITEMS).toBe(500);
  });
});

describe('访客档案:保护与处理策略', () => {
  it('被踢出 / 待批 / 管理员标注过 / 已被认领的:连标记都不打', () => {
    anonProfile('kicked1', { status: 'kicked', kickedTime: NOW - 400 * DAY });
    anonProfile('reapply1', { status: 'reapply', reapplyTime: NOW - 400 * DAY });
    anonProfile('noted1', { note: '主人备注:这个人不打扰' });
    anonProfile('claimed1', { answer: '阿X' }); // 改过昵称 = 已被真人认领
    anonProfile('fp1', { fpSet: { h: NOW } }); // 提交过指纹 = 已被真人认领
    anonProfile('revoked1', {
      authVersion: 1,
      sess: { revoked: true, revokedAt: NOW - 400 * DAY, authVersion: -1 },
    });
    process.env.RETENTION_DELETE_APPLICANTS = '1'; // 即使打开删除开关也不许动
    const r = retention.runSweep({ now: NOW });
    expect(Object.keys(g.applicants).sort()).toEqual([
      'claimed1',
      'fp1',
      'kicked1',
      'noted1',
      'reapply1',
      'revoked1',
    ]);
    for (const a of Object.values(g.applicants)) expect(a.expiredAt).toBeUndefined();
    expect(r.removed.applicants).toBe(0);
    expect(r.marked.applicants).toBe(0);
  });

  it('名下有私有资产(上传归属 aid / 存量无 aid 按 dk / 待审 pending / 访客链接 / 未处理预警)的不许清', () => {
    anonProfile('withUploadAid');
    g.uploads['a.jpg'] = { aid: 'withUploadAid', dk: 'other-dk', ts: NOW - 500 * DAY, mt: 'x' };
    anonProfile('withUploadDk', { dk: 'shared-dk' });
    g.uploads['b.jpg'] = { dk: 'shared-dk', ts: NOW - 500 * DAY, mt: 'y' }; // 存量无 aid
    anonProfile('withPending');
    g.uploads['c.jpg'] = { aid: 'withPending', pending: true, ts: NOW };
    anonProfile('withLink');
    g.userLinks = [{ id: 'l1', aid: 'withLink', name: 'n', url: 'https://x.example' }];
    anonProfile('withAlert');
    g.alerts = [{ t: NOW, dk: 'dk-withAlert', type: 'bigfile', dismissed: false }];
    anonProfile('watchedIp', { ip: '9.9.9.9' });
    g.watchIps = ['9.9.9.9'];
    process.env.RETENTION_DELETE_APPLICANTS = '1';
    const r = retention.runSweep({ now: NOW });
    expect(r.removed.applicants).toBe(0);
    expect(r.marked.applicants).toBe(0);
    expect(Object.keys(g.applicants).length).toBe(6);
    for (const a of Object.values(g.applicants)) expect(a.expiredAt).toBeUndefined();
  });

  it('纯匿名 + 长期无访问:默认只打 expiredAt 标记(不改 status,不参与门禁)', () => {
    const p = anonProfile('ghost', { idleMs: 400 * DAY });
    const r = retention.runSweep({ now: NOW });
    expect(r.marked.applicants).toBe(1);
    expect(r.removed.applicants).toBe(0);
    expect(g.applicants.ghost).toBeTruthy();
    expect(p.expiredAt).toBe(NOW);
    expect(p.expiredSeenAt).toBe(NOW - 400 * DAY);
    expect(p.status).toBe('approved'); // 判定字段一个没动
    // 标记后再来访问 → 下一轮自动撤标
    p.lastAccess = NOW - DAY;
    const r2 = retention.runSweep({ now: NOW + DAY });
    expect(r2.marked.applicantsUnmarked).toBe(1);
    expect(g.applicants.ghost.expiredAt).toBeUndefined();
  });

  it('未满保留期(未过一年)的匿名档案不被标记', () => {
    anonProfile('recent', { idleMs: 200 * DAY });
    const r = retention.runSweep({ now: NOW });
    expect(r.marked.applicants).toBe(0);
    expect(g.applicants.recent.expiredAt).toBeUndefined();
  });

  it('真删要显式开关 + 隔离期满,且只删"有资格被清理"的候选', () => {
    anonProfile('marked', { dk: 'dk-marked' });
    g.applicants.marked.expiredAt = NOW - 100 * DAY; // 已标记且过了 90 天隔离
    anonProfile('justMarked', { dk: 'dk-just' });
    g.applicants.justMarked.expiredAt = NOW - DAY; // 隔离期未满
    anonProfile('hasAsset', { dk: 'shared-asset-dk' });
    g.applicants.hasAsset.expiredAt = NOW - 100 * DAY;
    g.uploads['z.jpg'] = { dk: 'shared-asset-dk', ts: NOW }; // 存量无 aid 也算资产
    // 开关关着:一个都不删(但"有资产"档案的过期标记会被撤掉,所以仍落了一次盘)
    expect(retention.runSweep({ now: NOW }).removed.applicants).toBe(0);
    expect(saveCalls).toBe(1);
    expect(Object.keys(g.applicants).length).toBe(3);
    // 开关打开:只删过了隔离期的候选
    process.env.RETENTION_DELETE_APPLICANTS = '1';
    const r = retention.runSweep({ now: NOW });
    expect(r.removed.applicants).toBe(1);
    expect(saveCalls).toBe(2); // 每轮最多一次,不因集合数量翻倍
    expect(Object.keys(g.applicants).sort()).toEqual(['hasAsset', 'justMarked']);
    // 预览模式永远不落刀、也永远不落盘
    g.applicants.gone2 = {
      answer: '访客',
      dk: 'd',
      status: 'approved',
      applyTime: NOW - 400 * DAY,
      lastAccess: NOW - 400 * DAY,
      expiredAt: NOW - 100 * DAY,
    };
    const p = retention.previewSweep({ now: NOW });
    expect(p.removed.applicants).toBe(1);
    expect(g.applicants.gone2).toBeTruthy();
    expect(p.writes).toBe(0);
    expect(saveCalls).toBe(2); // 预览一次都没加
  });
});

describe('geo 缓存与历史 IP 的时间维度', () => {
  it('geo 首轮只补记时间戳(缺时间戳不当老数据),下轮起才裁;当前仍在用的 IP 不裁', () => {
    g.geo = { '1.1.1.1': '未知', '2.2.2.2': '广东 深圳', '::ffff:3.3.3.3': '上海' };
    anonProfile('live', { idleMs: 10 * DAY, ip: '3.3.3.3' }); // 当前 IP = 3.3.3.3(::ffff: 归一)
    const first = retention.runSweep({ now: NOW });
    expect(first.removed.geo).toBe(0);
    expect(Object.keys(g.geo).length).toBe(3);
    expect(g.geoTs['1.1.1.1']).toBe(NOW);
    expect(g.geoTs['2.2.2.2']).toBe(NOW);
    // 91 天后:非当前 IP 的过期条目被清,当前 IP 仍在
    const second = retention.runSweep({ now: NOW + 91 * DAY });
    expect(second.removed.geo).toBe(2);
    expect(Object.keys(g.geo)).toEqual(['::ffff:3.3.3.3']);
    expect(g.geoTs['1.1.1.1']).toBeUndefined();
    expect(g.geoTs['2.2.2.2']).toBeUndefined();
  });

  it('历史 IP:超过保留期的丢掉,当前 a.ip 永远保留;缺 ipsAt 的存量档案只补记', () => {
    anonProfile('aged', {
      idleMs: 10 * DAY,
      ip: '5.5.5.5',
      ips: ['4.4.4.4', '5.5.5.5', '6.6.6.6'],
    });
    // 存量:有 ips 没有 ipsAt => 本轮只补记,一条都不删
    const first = retention.runSweep({ now: NOW });
    expect(g.applicants.aged.ipsAt).toEqual([0, 0, 0]);
    expect(first.removed.ipHistory).toBe(0);
    expect(g.applicants.aged.ips.length).toBe(3);
    // 补上时间戳(模拟 pushIp 已运行一段时间):两个远超 180 天,其中一个就是当前 IP
    g.applicants.aged.ipsAt = [NOW - 300 * DAY, NOW - 300 * DAY, NOW - 30 * DAY];
    const second = retention.runSweep({ now: NOW });
    expect(second.removed.ipHistory).toBe(1);
    expect(g.applicants.aged.ips).toEqual(['5.5.5.5', '6.6.6.6']); // 当前 IP 即使很老也留着
    expect(g.applicants.aged.ipsAt).toEqual([NOW - 300 * DAY, NOW - 30 * DAY]);
    // ips 与 ipsAt 形状被写坏(长度不齐)时:重建而不猜、不删
    g.applicants.aged.ipsAt = [NOW];
    const third = retention.runSweep({ now: NOW });
    expect(third.removed.ipHistory).toBe(0);
    expect(g.applicants.aged.ips.length).toBe(2);
  });

  it('pushIp(经 autoAdmit)写档案时为历史 IP 盖上时间戳,ips 仍是字符串数组', () => {
    gate.autoAdmit(reqOf('Mozilla/5.0 (new visitor)'), resMock(), '/api/x');
    const id = Object.keys(g.applicants)[0];
    const a = g.applicants[id];
    expect(Array.isArray(a.ips)).toBe(true);
    expect(typeof a.ips[0]).toBe('string');
    expect(a.ips).toEqual(['203.0.113.9']);
    expect(a.ipsAt).toEqual([expect.any(Number)]);
    expect(a.ipsAt[0]).toBeGreaterThan(0);
  });
});

describe('整轮 sweep 只落一次盘', () => {
  it('多集合一起裁也只调用一次 saveGateData,没东西可裁时一次都不调', () => {
    g.chat = [{ ts: NOW - 200 * DAY }, { ts: NOW - 200 * DAY }];
    g.wishes = [{ ts: NOW - 400 * DAY }];
    g.clientErrors = [{ t: NOW - 90 * DAY }];
    g.linkClicks = [{ t: NOW - 400 * DAY }];
    g.visits = [{ t: NOW - 400 * DAY }];
    g.quizAttempts = [{ t: NOW - 400 * DAY }];
    g.geo = { '7.7.7.7': 'x' };
    g.geoTs = { '7.7.7.7': NOW - 91 * DAY };
    anonProfile('ghost', { idleMs: 400 * DAY });
    clientErrors._setErrorList([{ t: NOW - 90 * DAY, lastT: NOW - 90 * DAY }]);

    const r = retention.runSweep({ now: NOW });
    expect(saveCalls).toBe(1);
    expect(r.writes).toBe(1);
    expect(Object.values(r.removed).reduce((s, n) => s + n, 0)).toBeGreaterThan(0);

    // 再来一轮:无事可做 => 一次都不写(幂等)
    const snap = JSON.stringify(g);
    const r2 = retention.runSweep({ now: NOW + DAY });
    expect(saveCalls).toBe(1);
    expect(r2.writes).toBe(0);
    expect(r2.removed).toMatchObject({
      chat: 0,
      wishes: 0,
      clientErrors: 0,
      linkClicks: 0,
      visits: 0,
      quizAttempts: 0,
      applicants: 0,
      geo: 0,
      rate: 0,
      ipHistory: 0,
    });
    expect(JSON.stringify(g)).toBe(snap);
  });

  it('预览模式绝不落盘', () => {
    g.chat = [{ ts: NOW - 200 * DAY }];
    const p = retention.previewSweep({ now: NOW });
    expect(p.removed.chat).toBe(1);
    expect(p.writes).toBe(0);
    expect(saveCalls).toBe(0);
    expect(g.chat.length).toBe(1);
  });
});

describe('周期调度', () => {
  it('startRetention 启动即跑一次 + 每天一次;stopRetention 收干净不残留定时器', () => {
    vi.useFakeTimers();
    delete process.env.RETENTION_DISABLED; // 显式打开这道闸,才能验证调度本身
    const base = retention.sweepCount();
    expect(retention.startRetention()).toBe(true);
    expect(retention.retentionOn()).toBe(true);
    expect(retention.sweepCount()).toBe(base + 1); // 启动跑一次
    expect(retention.startRetention()).toBe(false); // 幂等:已有调度就拒绝重复启动
    expect(retention.sweepCount()).toBe(base + 1);
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(RETENTION_MS.clientErrors); // 30 天:应该已经跑过若干轮,但都无事可做
    expect(retention.sweepCount()).toBeGreaterThan(base + 1);

    expect(retention.stopRetention()).toBe(true);
    expect(retention.retentionOn()).toBe(false);
    expect(vi.getTimerCount()).toBe(0); // 定时器真的从计时器堆里摘掉了(unref 不等于停)
    const after = retention.sweepCount();
    vi.advanceTimersByTime(10 * DAY);
    expect(retention.sweepCount()).toBe(after); // 停了就再也不跑
    expect(retention.stopRetention()).toBe(false); // 幂等
  });

  it('RETENTION_DISABLED=1 时不启动(单测与运维的紧急闸)', () => {
    expect(process.env.RETENTION_DISABLED).toBe('1');
    expect(retention.startRetention()).toBe(false);
    expect(retention.retentionOn()).toBe(false);
  });
});

describe('时钟可注入', () => {
  it('不传 now 用 Date.now(),传 now 完全按注入值判定(测试不依赖真实时间)', () => {
    g.chat = [{ id: 'k', ts: NOW }];
    expect(retention.runSweep({ now: NOW - DAY }).removed.chat).toBe(0);
    expect(g.chat.length).toBe(1);
    expect(retention.runSweep({ now: NOW + 200 * DAY }).removed.chat).toBe(1);
    expect(g.chat.length).toBe(0);
    const auto = retention.runSweep();
    expect(typeof auto.now).toBe('number');
  });
});

describe('测试隔离', () => {
  it('数据写在临时目录,不碰仓库真实的 gate_data.json / client_errors.json', () => {
    expect(store.DATA_FILE).toBe(process.env.GATE_DATA_FILE);
    expect(path.dirname(store.DATA_FILE)).toBe(tmpDir);
    expect(path.dirname(clientErrors.FILE)).toBe(tmpDir);
    expect(path.join(require('../../lib/config.js').ROOT, 'gate_data.json')).not.toBe(
      store.DATA_FILE
    );
    unspySave();
    store.saveGateData(); // 真的写一次:必须落在临时目录
    expect(fs.existsSync(process.env.GATE_DATA_FILE)).toBe(true);
    expect(fs.readFileSync(process.env.GATE_DATA_FILE, 'utf8').length).toBeGreaterThan(0);
    spySave();
  });
});
