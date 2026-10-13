// /api/mylinks 写接口与会话绑定(DG-SEC-002)+ 后台 query token 的本地判定(DG-SEC-007)。
// 旧实现:`action:'add'` 的配额判定走 isMineUpload(要求有效 vid)⇒ 不带 Cookie 的请求
// 既不计入自己的配额(每次从 0 起算)又能反复 saveGateData() 整库快照落盘,而 gateData.userLinks
// 没有任何总量上限。现钉死:
//   ① 无有效会话一律 401(这是写接口),既不新增也一次落盘都不发生;
//   ② 每人配额按 aid===本人 vid 计(同 UA 的两个真人各自 10 条,互不占用、互不可见);
//   ③ 全局硬上限 USER_LINKS_MAX:超限 503 且拒绝路径不写盘;
//   ④ 每 IP 分钟级洪水防护(ratelimit 'mylinks' 桶,只记账不新增持久化压力);
//   ⑤ del 只能删自己名下条目(2026-09-18 前无 aid 的存量仍按 dk 命中并当场绑 aid);
//   ⑥ 落库条目字段形状 aid/dk/name/url/model/pos/ts 不变(后台 handleAdminList 直读全量)。
// 必须用 createRequire 与被测模块共享同一 Node require 缓存;数据落系统临时目录,不碰真实 gate_data.json/db。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-mylinks-'));
process.env.GATE_DATA_FILE = path.join(tmpDir, 'gate_data.json'); // 必须在 require store 之前
process.env.TOKEN = process.env.TOKEN || 'vitest-token-abc';

const require = createRequire(import.meta.url);
const { TOKEN } = require('../../lib/config.js');
const { gateData, deviceKey, issueSession } = require('../../lib/store.js');
const {
  handleMyLinks,
  handlePublicConfig,
  canServeMedia,
  USER_LINKS_PER_PERSON,
  USER_LINKS_MAX,
  MYLINKS_RATE,
} = require('../../lib/siteconfig.js');
const ratelimit = require('../../lib/ratelimit.js');
const { tokenOk } = require('../../lib/admin.js');

const UA = 'Mozilla/5.0 (mylinks-test-ua)'; // 两个陌生访客刻意共用同一 UA:配额与可见性都不许再经 UA
let ipSeq = 0;

// 可被 util.readBody 消费的 req:handleMyLinks 先注册监听,send() 同步喂 body ⇒ 整条链路同步可断言
function postReq(opts) {
  const o = opts || {};
  const listeners = {};
  return {
    headers: { 'user-agent': o.ua || UA, ...(o.vid ? { cookie: 'vid=' + o.vid } : {}) },
    url: '/api/mylinks',
    socket: { remoteAddress: o.ip || '203.0.113.' + (100 + (++ipSeq % 140)) },
    on(ev, fn) {
      listeners[ev] = fn;
    },
    destroy() {},
    setHeader() {},
    send(b) {
      if (listeners.data) listeners.data(JSON.stringify(b));
      if (listeners.end) listeners.end();
    },
  };
}
function resMock() {
  const res = {
    code: 0,
    body: null,
    headers: {},
    setHeader(k, v) {
      res.headers[k] = v;
    },
    getHeader(k) {
      return res.headers[k];
    },
    writeHead(c, h) {
      res.code = c;
      if (h) Object.assign(res.headers, h);
    },
    end(b) {
      res.body = b ? JSON.parse(b) : null;
    },
    on() {},
  };
  return res;
}
function call(body, opts) {
  const res = resMock();
  const req = postReq(opts);
  handleMyLinks(req, res);
  req.send(body);
  return res;
}
function addLink(vid, name, ip) {
  return call(
    {
      action: 'add',
      name: name || 'n',
      url: 'https://example.com/' + name,
      model: 'cube',
      pos: { x: 1, y: 2, z: 3 },
    },
    { vid, ip }
  );
}
function mkVisitor(id) {
  gateData.applicants[id] = {
    answer: '访客' + id,
    ua: UA,
    dk: deviceKey({ headers: { 'user-agent': UA } }),
    status: 'approved',
    applyTime: Date.now(),
    lastAccess: Date.now(),
    visits: 0,
    note: '',
    localId: 'lid-' + id, // 已认领档案:不会被别人的 dk 归并
    fpSet: { h: id },
    ips: [],
  };
  issueSession(gateData.applicants[id]); // 会话有效 ⇒ authVid 认这个 vid
  return id;
}
function publicConfig(vid) {
  const res = resMock();
  handlePublicConfig(
    {
      headers: { 'user-agent': UA, ...(vid ? { cookie: 'vid=' + vid } : {}) },
      url: '/api/siteconfig',
      socket: { remoteAddress: '203.0.113.9' },
    },
    res
  );
  return res.body;
}
function seedLinks(n, ownFirst) {
  const list = [];
  for (let i = 0; i < n; i++) {
    list.push({
      id: 'seed' + i,
      aid: ownFirst && i === 0 ? 'vidA' : 'vidSeed' + i,
      dk: 'dk-seed',
      name: 's' + i,
      url: 'https://s' + i,
      model: 'sphere',
      pos: null,
      ts: Date.now() - 1000 - i,
    });
  }
  gateData.userLinks = list;
  return list;
}
// saveGateData() 的第一行是 gateData._savedAt = Date.now();把标记压成 1,
// 之后任何一次落盘都会把它顶成当前毫秒 ⇒ "断言仍等于 1"= 这一次请求一个字节都没写。
function noWriteMode() {
  gateData._savedAt = 1;
}
function assertNoWrite(label) {
  expect(gateData._savedAt, label + ' 不得落盘').toBe(1);
}

let snap;
beforeEach(() => {
  snap = JSON.stringify({
    uploads: gateData.uploads,
    applicants: gateData.applicants,
    userLinks: gateData.userLinks,
    siteConfig: gateData.siteConfig,
  });
  ratelimit._reset(); // 限流是进程内 Map:逐例清桶,否则上一例的账串到这一例
  gateData.applicants = {};
  gateData.userLinks = [];
  gateData.uploads = {};
  mkVisitor('vidA');
  mkVisitor('vidB');
});
afterEach(() => {
  const s = JSON.parse(snap);
  gateData.uploads = s.uploads;
  gateData.applicants = s.applicants;
  gateData.userLinks = s.userLinks;
  gateData.siteConfig = s.siteConfig;
  delete process.env.TOKEN_QUERY;
});

describe('无有效会话不再能写 /api/mylinks(DG-SEC-002)', () => {
  it('不带 Cookie:add 一律 401,条目不增、一次落盘都不发生', () => {
    noWriteMode();
    expect(addLink(null, 'no-cookie').code).toBe(401);
    expect(gateData.userLinks.length).toBe(0);
    assertNoWrite('401 无会话');
  });

  it('伪造/不存在的 vid 同样 401(旧实现正是从这里被反复整库快照落盘)', () => {
    noWriteMode();
    expect(addLink('no-such-vid', 'x').code).toBe(401);
    expect(gateData.userLinks.length).toBe(0);
    assertNoWrite('401 伪造 vid');
  });

  it('del 也要求有效会话;action 非法仍是 400', () => {
    const id = addLink('vidA', 'mine').body.item.id;
    noWriteMode();
    expect(call({ action: 'del', id }, { vid: null }).code).toBe(401);
    expect(call({ action: 'nop' }, { vid: 'vidA' }).code).toBe(400);
    expect(gateData.userLinks.length).toBe(1);
    assertNoWrite('401/400 拒绝路径');
  });
});

describe('配额按 aid 计,不再经 UA', () => {
  it('同一 UA 的两个有效会话各自 10 条:互不占用对方配额', () => {
    expect(USER_LINKS_PER_PERSON).toBe(10);
    for (let i = 0; i < USER_LINKS_PER_PERSON; i++)
      expect(addLink('vidA', 'a' + i, '203.0.113.11').code).toBe(200);
    expect(addLink('vidA', 'a-over', '203.0.113.12').code).toBe(400); // 第 11 条拒
    for (let i = 0; i < USER_LINKS_PER_PERSON; i++)
      expect(addLink('vidB', 'b' + i, '203.0.113.21').code).toBe(200);
    expect(addLink('vidB', 'b-over', '203.0.113.22').code).toBe(400);
    expect(gateData.userLinks.length).toBe(2 * USER_LINKS_PER_PERSON);
    expect(gateData.userLinks.filter((l) => l.aid === 'vidA').length).toBe(USER_LINKS_PER_PERSON);
    expect(gateData.userLinks.filter((l) => l.aid === 'vidB').length).toBe(USER_LINKS_PER_PERSON);
  });

  it('本人只拿得到自己名下的链接(/api/siteconfig 的 myLinks 不再按 UA 串门)', () => {
    addLink('vidA', 'a1');
    addLink('vidB', 'b1');
    expect(publicConfig('vidA').myLinks.map((l) => l.name)).toEqual(['a1']);
    expect(publicConfig('vidB').myLinks.map((l) => l.name)).toEqual(['b1']);
    expect(publicConfig(null).myLinks).toEqual([]);
  });

  it('无 vid 者既进不了配额,也拿不到任何人的链接与私有媒体', () => {
    const item = addLink('vidA', 'a1').body.item;
    gateData.uploads['p.jpg'] = {
      dk: deviceKey({ headers: { 'user-agent': UA } }),
      aid: 'vidA',
      ts: Date.now(),
    };
    expect(publicConfig(null).myLinks).toEqual([]);
    expect(publicConfig(null).myUploads).toEqual([]);
    const req = {
      headers: { 'user-agent': UA },
      url: '/photos/p.jpg',
      socket: { remoteAddress: '203.0.113.30' },
      _mediaPublic: undefined,
    };
    expect(canServeMedia(req, 'photos', 'p.jpg')).toBe(false);
    expect(item.aid).toBe('vidA');
  });
});

describe('全局硬上限与洪水防护', () => {
  it('总数达 USER_LINKS_MAX 即 503,且拒绝路径一次落盘都不发生', () => {
    expect(USER_LINKS_MAX).toBe(300);
    seedLinks(USER_LINKS_MAX, true);
    const before = JSON.stringify(gateData.userLinks);
    noWriteMode();
    expect(addLink('vidA', 'overflow').code).toBe(503);
    expect(gateData.userLinks.length).toBe(USER_LINKS_MAX);
    expect(JSON.stringify(gateData.userLinks)).toBe(before);
    assertNoWrite('503 全局上限');
    // 满了仍要能删(上限只挡新增,否则满库再也清不干净)
    expect(call({ action: 'del', id: 'seed0' }, { vid: 'vidA' }).code).toBe(200);
    expect(gateData.userLinks.length).toBe(USER_LINKS_MAX - 1);
  });

  it('同一 IP 超过每分钟 MYLINKS_RATE 次即 429(有有效会话也照样限)', () => {
    const ip = '203.0.113.88';
    for (let i = 0; i < USER_LINKS_PER_PERSON; i++)
      expect(addLink('vidA', 'r' + i, ip).code).toBe(200);
    for (let i = USER_LINKS_PER_PERSON; i < MYLINKS_RATE; i++)
      expect(addLink('vidA', 'r' + i, ip).code).toBe(400);
    expect(addLink('vidA', 'late', ip).code).toBe(429);
    expect(call({ action: 'del', id: 'nope' }, { vid: 'vidA', ip }).code).toBe(429);
    expect(gateData.userLinks.length).toBe(USER_LINKS_PER_PERSON);
    // 换 IP 就还有额度:限流按 realIP 打洪水,不是按身份封人
    expect(addLink('vidA', 'other-ip', '203.0.113.89').code).toBe(400);
  });

  it('配额拒绝与限流拒绝都不新增持久化压力', () => {
    const ip = '203.0.113.150';
    for (let i = 0; i < USER_LINKS_PER_PERSON; i++)
      expect(addLink('vidA', 'q' + i, ip).code).toBe(200);
    noWriteMode();
    for (let i = 0; i < 5; i++) expect(addLink('vidA', 'over' + i, ip).code).toBe(400);
    expect(gateData.userLinks.length).toBe(USER_LINKS_PER_PERSON);
    assertNoWrite('400 配额拒绝');
    noWriteMode();
    for (let i = 0; i < 5; i++) expect(addLink(null, 'anon' + i, ip).code).toBe(401); // 无会话者被拒在配额之前,同样不落盘
    assertNoWrite('401 无会话洪水');
  });
});

describe('del 只能删自己名下的条目', () => {
  it('他人(即便同 UA、带有效会话)按 id 删不动;本人可删', () => {
    const id = addLink('vidA', 'mine').body.item.id;
    expect(call({ action: 'del', id }, { vid: 'vidB' }).code).toBe(404);
    expect(gateData.userLinks.length).toBe(1);
    expect(call({ action: 'del', id: 'no-such-id' }, { vid: 'vidA' }).code).toBe(404);
    expect(call({ action: 'del', id }, { vid: 'vidA' }).code).toBe(200);
    expect(gateData.userLinks.length).toBe(0);
  });

  it('存量无 aid 的链接:同 UA 本人可删(一次性迁移路径不变)', () => {
    const dk = deviceKey({ headers: { 'user-agent': UA } });
    gateData.userLinks = [
      {
        id: 'legacy1',
        dk,
        name: '旧链接',
        url: 'https://legacy',
        model: 'sphere',
        pos: null,
        ts: Date.now() - 90 * 24 * 3600 * 1000,
      },
    ];
    expect(call({ action: 'del', id: 'legacy1' }, { vid: 'vidA' }).code).toBe(200);
    expect(gateData.userLinks.length).toBe(0);
  });
});

describe('落库字段形状(后台直读 gateData.userLinks 的契约)', () => {
  it('add 出的条目含 id/aid/dk/name/url/model/pos/ts,不多不少', () => {
    const item = addLink('vidA', '契约').body.item;
    expect(Object.keys(item).sort()).toEqual([
      'aid',
      'dk',
      'id',
      'model',
      'name',
      'pos',
      'ts',
      'url',
    ]);
    expect(item.model).toBe('cube');
    expect(item.pos).toEqual({ x: 1, y: 2, z: 3 });
    expect(typeof item.ts).toBe('number');
    expect(item.url).toBe('https://example.com/契约');
  });
});

describe('TOKEN_QUERY=0 的「本地」判定只认 socket(DG-SEC-007)', () => {
  function reqHost(host, remote, extra) {
    return {
      headers: { 'user-agent': UA, host, ...(extra || {}) },
      url: '',
      socket: { remoteAddress: remote },
      on() {},
      destroy() {},
    };
  }
  it('夹具自证:主 TOKEN 已就位(否则下面的断言全是假绿)', () => {
    expect(TOKEN).toBeTruthy();
  });
  it('公网 socket + 伪造 Host: localhost ⇒ query token 必被拒', () => {
    process.env.TOKEN_QUERY = '0';
    expect(tokenOk(reqHost('localhost', '203.0.113.9'), { token: TOKEN })).toBe(false);
    expect(tokenOk(reqHost('localhost:3000', '203.0.113.9'), { token: TOKEN })).toBe(false);
    expect(tokenOk(reqHost('cloudbear.cloud', '203.0.113.9'), { token: TOKEN })).toBe(false);
  });
  it('127.0.0.1/::1 socket 才允许 query;回环但带公网 Host 仍拒(CF Tunnel/本机反代)', () => {
    process.env.TOKEN_QUERY = '0';
    expect(tokenOk(reqHost('localhost:3000', '127.0.0.1'), { token: TOKEN })).toBe(true);
    expect(tokenOk(reqHost('localhost', '127.0.0.1'), { token: TOKEN })).toBe(true);
    expect(tokenOk(reqHost('localhost', '::1'), { token: TOKEN })).toBe(true);
    expect(tokenOk(reqHost('cloudbear.cloud', '127.0.0.1'), { token: TOKEN })).toBe(false);
    expect(tokenOk(reqHost('localhost', ''), { token: TOKEN })).toBe(false); // 取不到来源地址按非本地
  });
  it('x-token 头通道不受本地判定影响(CI/探针/命令行运维不断)', () => {
    process.env.TOKEN_QUERY = '0';
    expect(tokenOk(reqHost('cloudbear.cloud', '203.0.113.9', { 'x-token': TOKEN }))).toBe(true);
    expect(tokenOk(reqHost('cloudbear.cloud', '203.0.113.9', { 'x-token': 'wrong' }))).toBe(false);
  });
});

describe('测试隔离', () => {
  it('数据写在临时目录,不落真实 gate_data.json/db', () => {
    expect(process.env.GATE_DATA_FILE).toContain('dg-mylinks-');
    expect(path.dirname(process.env.GATE_DATA_FILE)).toBe(tmpDir);
    expect(fs.existsSync(process.env.GATE_DATA_FILE)).toBe(true);
  });
});

describe('三道闸常量的唯一出处(2026-10-13 搬到 lib/config.js 之后)', () => {
  const config = require('../../lib/config.js');
  const siteconfig = require('../../lib/siteconfig.js');
  // 搬到叶子层是因为后台要显示"已用 n / 上限"的读数,而 admin → siteconfig 会成环。
  // 搬完之后只允许有一份值:这条断言防的是"后来人又在 siteconfig 里写回一个字面量"
  // —— 那样面板显示的上限与真实判定会悄悄分叉(而且两边看着都对)。
  // 判定本身(铺满 USER_LINKS_MAX ⇒ 503 且不落盘)由上面第 ③ 组用例钉着,不在此重复。
  it('siteconfig re-export 的就是 config.js 里那几个数,不是各写一份字面量', () => {
    expect(siteconfig.USER_LINKS_PER_PERSON).toBe(config.USER_LINKS_PER_PERSON);
    expect(siteconfig.USER_LINKS_MAX).toBe(config.USER_LINKS_MAX);
    expect(siteconfig.MYLINKS_RATE).toBe(config.MYLINKS_RATE);
    expect(config.USER_LINKS_MAX).toBe(300); // 量级主人未拍板改动;要改连文档一起改(AGENTS/ADMIN_GUIDE 各一处)
  });
});
