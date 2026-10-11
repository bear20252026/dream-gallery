// 缩略图文件级门禁(DG-SEC-003):photos/thumbs/* 不再是"无条件公开"的旁路。
// gen-thumbs.js 给 photos/ 下每张图都生成 thumbs/<同名>.webp(1024px,看得清内容),
// 旧实现 `if (name.includes('thumbs/')) return true` 让本人私有照片的原图 403 而缩略图人人可取,
// 待审核展品的缩略图同样照放。现规矩:缩略图先归一到原图条目名再走同一张决策表(src/shared/mediarules.mjs),
// 可见性与 CDN 缓存分级(req._mediaPublic)一起继承原图。钉死:
//   ① 私有照片的原图与其缩略图:陌生访客都拒,本人都放行;
//   ② 待审核(pending)展品:原图与缩略图都拒(连本人也拒,审核结论前不下发);
//   ③ 演示照片/白板作品(按名字公开):原图与缩略图都放行,且允许边缘缓存;
//   ④ 带有效 mt 的缩略图 URL 放行(QQ/UC 图片代理那条老场景不回退);
//   ⑤ 私有内容的缩略图 req._mediaPublic=false(2026-07-27 血泪链:200 被边缘缓存=对全员公开);
//   ⑥ 决策表拒收未归一的 thumbs/ 名字、查无归属的缩略图 fail-closed(归一规则只有一处)。
// 必须用 createRequire 与被测模块共享同一 Node require 缓存(vitest ESM import 会产生双实例,gateData 改动传不进去)。
// 数据一律落系统临时目录(照 lib-identity-authorization.test.js),不碰真实 gate_data.json/db。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-thumbgate-'));
process.env.GATE_DATA_FILE = path.join(tmpDir, 'gate_data.json'); // 必须在 require store 之前
process.env.TOKEN = process.env.TOKEN || 'vitest-token-abc';

const require = createRequire(import.meta.url);
const { gateData, deviceKey, issueSession } = require('../../lib/store.js');
const { canServeMedia } = require('../../lib/siteconfig.js');
const MR = require('../../src/shared/mediarules.mjs');

const UA = 'Mozilla/5.0 (thumb-gate-test-ua)';
const MT_OWNER = 'a1b2c3d4e5f60718293a';
const DAY = 24 * 3600 * 1000;

// req 形态与线上一致:security.mediaGate 传 (dir, name),name 是 photos/ 之后的整段(含 thumbs/ 前缀)
function reqOf(vid, url, ua) {
  return {
    headers: { 'user-agent': ua || UA, ...(vid ? { cookie: 'vid=' + vid } : {}) },
    url: url || '',
    socket: { remoteAddress: '203.0.113.7' },
    _mediaPublic: undefined,
    on() {},
    setHeader() {},
  };
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
const allow = (req, dir, name) => canServeMedia(req, dir, name);

let snap;
beforeEach(() => {
  snap = JSON.stringify({
    uploads: gateData.uploads,
    applicants: gateData.applicants,
    siteConfig: gateData.siteConfig,
    userLinks: gateData.userLinks,
  });
  gateData.applicants = {};
  gateData.userLinks = [];
  mkVisitor('vidOwner');
  mkVisitor('vidStranger');
  gateData.siteConfig.demoPhotos = ['201.jpg', '205.png'];
  gateData.siteConfig.customLinks = [];
  gateData.uploads = {
    'priv.jpg': { dk: 'dkOwner', aid: 'vidOwner', ts: Date.now(), mt: MT_OWNER },
    'theirs.jpg': { dk: 'dkOther', aid: 'vidStranger', ts: Date.now() - DAY },
    'pend.jpg': {
      dk: 'dkOwner',
      aid: 'vidOwner',
      ts: Date.now(),
      mt: 'pendtoken00000000000',
      pending: Date.now(),
    },
    'dual.jpg': { dk: 'dkOwner', aid: 'vidOwner', ts: Date.now() },
    'dual.png': { dk: 'dkOther', aid: 'vidStranger', ts: Date.now() },
  };
});
afterEach(() => {
  const s = JSON.parse(snap);
  gateData.uploads = s.uploads;
  gateData.applicants = s.applicants;
  gateData.siteConfig = s.siteConfig;
  gateData.userLinks = s.userLinks;
});

describe('私有照片:缩略图继承原图(DG-SEC-003)', () => {
  it('陌生访客:原图与缩略图都拒(生成器换扩展名也要按主干名回查)', () => {
    expect(allow(reqOf(), 'photos', 'priv.jpg')).toBe(false);
    expect(allow(reqOf(), 'photos', 'thumbs/priv.webp')).toBe(false); // 旧实现在此 return true
    expect(allow(reqOf(), 'photos', 'thumbs/priv.jpg')).toBe(false); // 同扩展名形态
    expect(allow(reqOf(null, '/photos/thumbs/priv.webp'), 'photos', 'thumbs/priv.webp')).toBe(
      false
    );
  });

  it('同 UA 的另一个有效会话(陌生人 vid)也拿不到别人的缩略图', () => {
    expect(allow(reqOf('vidStranger'), 'photos', 'thumbs/priv.webp')).toBe(false);
    expect(allow(reqOf('vidStranger'), 'photos', 'priv.jpg')).toBe(false);
  });

  it('本人:原图与缩略图都放行(带 vid Cookie)', () => {
    expect(allow(reqOf('vidOwner'), 'photos', 'priv.jpg')).toBe(true);
    expect(allow(reqOf('vidOwner'), 'photos', 'thumbs/priv.webp')).toBe(true);
    expect(allow(reqOf('vidOwner'), 'photos', 'thumbs/priv.jpg')).toBe(true);
  });

  it('待审核展品:原图与缩略图都拒(审核结论前不下发,含本人)', () => {
    expect(allow(reqOf('vidOwner'), 'photos', 'pend.jpg')).toBe(false);
    expect(allow(reqOf('vidOwner'), 'photos', 'thumbs/pend.webp')).toBe(false);
    expect(allow(reqOf(), 'photos', 'thumbs/pend.webp')).toBe(false);
  });

  it('同名多扩展(dual.jpg 私有 + dual.png 他人)取交集:任一候选私有就拒', () => {
    expect(allow(reqOf('vidOwner'), 'photos', 'thumbs/dual.webp')).toBe(false);
    expect(allow(reqOf('vidStranger'), 'photos', 'thumbs/dual.webp')).toBe(false);
  });
});

describe('按名字公开的类别:原图公开则缩略图公开', () => {
  it('演示照片:原图与缩略图都放行(陌生访客亦然)', () => {
    expect(allow(reqOf(), 'photos', '201.jpg')).toBe(true);
    expect(allow(reqOf(), 'photos', 'thumbs/201.webp')).toBe(true);
    expect(allow(reqOf(), 'photos', '205.png')).toBe(true);
    expect(allow(reqOf(), 'photos', 'thumbs/205.webp')).toBe(true);
  });

  it('白板作品:原图与缩略图都放行', () => {
    expect(allow(reqOf(), 'photos', 'whiteboard-abc.png')).toBe(true);
    expect(allow(reqOf(), 'photos', 'thumbs/whiteboard-abc.webp')).toBe(true);
  });

  it('查无归属的缩略图 fail-closed(旧语义"thumbs 恒公开"放行的正是这一类)', () => {
    expect(allow(reqOf(), 'photos', 'thumbs/nobody.webp')).toBe(false);
    expect(allow(reqOf(), 'photos', 'nobody.jpg')).toBe(false);
  });
});

describe('mt 令牌与 CDN 缓存分级', () => {
  it('带有效 mt 的缩略图 URL 放行(图片代理 UA 漂移那条老场景不回退)', () => {
    const req = reqOf(null, '/photos/thumbs/priv.webp?mt=' + MT_OWNER);
    // 代理 UA 既没有 Cookie 也认不出本人,只有 mt 能认出
    expect(allow(req, 'photos', 'thumbs/priv.webp')).toBe(true);
    // 错误/别人的令牌不放行
    expect(
      allow(reqOf(null, '/photos/thumbs/priv.webp?mt=nope'), 'photos', 'thumbs/priv.webp')
    ).toBe(false);
    expect(allow(reqOf(null, '/photos/priv.jpg?mt=' + MT_OWNER), 'photos', 'priv.jpg')).toBe(true);
  });

  it('私有内容的缩略图 req._mediaPublic=false;公开名的缩略图才允许边缘缓存', () => {
    const ownerThumb = reqOf('vidOwner');
    expect(canServeMedia(ownerThumb, 'photos', 'thumbs/priv.webp')).toBe(true);
    expect(ownerThumb._mediaPublic).toBe(false); // 本人可见≠可公开缓存

    const demoThumb = reqOf();
    expect(canServeMedia(demoThumb, 'photos', 'thumbs/201.webp')).toBe(true);
    expect(demoThumb._mediaPublic).toBe(true);

    // 防"同一 req 上的脏 true"把私有缩略图标成可缓存(files-static 据此选 no-cache / private,no-store)
    const stale = reqOf();
    stale._mediaPublic = true;
    expect(canServeMedia(stale, 'photos', 'thumbs/priv.webp')).toBe(false);
    expect(stale._mediaPublic).toBe(false);
  });
});

describe('决策表同源:归一规则只有一处', () => {
  it('serveDecision 拒收未归一的 thumbs/ 名字(漏归一不放行)', () => {
    expect(
      MR.serveDecision({ dir: 'photos', base: 'thumbs/201.jpg', isThumb: true, isDemo: true })
    ).toEqual({ allow: false, pub: false });
    expect(
      MR.serveDecision({ dir: 'photos', base: 'thumbs/x.png', isThumb: true, isMine: true })
    ).toEqual({
      allow: false,
      pub: false,
    });
    // 归一之后就是一条普通条目名:演示照片公开、私有内容仍走 aid/mt
    expect(
      MR.serveDecision({ dir: 'photos', base: '201.jpg', isThumb: true, isDemo: true })
    ).toEqual({
      allow: true,
      pub: true,
    });
  });

  it('isThumbName / mediaStem / thumbSourceNames 的形态', () => {
    expect(MR.isThumbName('thumbs/a.webp')).toBe(true);
    expect(MR.isThumbName('a.webp')).toBe(false);
    expect(MR.mediaStem('thumbs/a.webp')).toBe('a');
    expect(MR.mediaStem('a.jpg')).toBe('a');
    expect(MR.mediaStem('户外大屏/3号.mp4')).toBe('户外大屏/3号');
    const entries = ['priv.jpg', '201.jpg', 'priv.png'];
    expect(MR.thumbSourceNames('thumbs/priv.webp', entries).sort()).toEqual([
      'priv.jpg',
      'priv.png',
    ]);
    expect(MR.thumbSourceNames('thumbs/nobody.webp', entries)).toEqual(['nobody.webp']); // 查无候选→交决策表拒
    expect(MR.thumbSourceNames('priv.jpg', entries)).toEqual(['priv.jpg']); // 非缩略图:原样
  });

  it('wallDecision / contentAllowed 的既有语义未被触动(上墙表与下载表各管一件事)', () => {
    expect(MR.wallDecision({ isDemo: true })).toEqual({ visible: true, content: true });
    expect(MR.wallDecision({ isMine: true })).toEqual({ visible: true, content: true });
    expect(MR.wallDecision({ pending: Date.now() })).toEqual({ visible: false, content: false });
    expect(MR.wallDecision({})).toEqual({ visible: false, content: false });
    expect(MR.contentAllowed({ isDemo: true })).toBe(true);
    expect(MR.contentAllowed({ isLib: true })).toBe(false);
    expect(MR.captionAllowed({ pending: 1, isMine: true })).toBe(false);
  });
});

describe('测试隔离', () => {
  it('数据写在临时目录,不落真实 gate_data.json/db', () => {
    expect(process.env.GATE_DATA_FILE).toContain('dg-thumbgate-');
    expect(path.dirname(process.env.GATE_DATA_FILE)).toBe(tmpDir);
    expect(fs.existsSync(process.env.GATE_DATA_FILE)).toBe(true);
  });
});
