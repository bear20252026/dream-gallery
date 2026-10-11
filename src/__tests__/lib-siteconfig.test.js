// lib/siteconfig.js canServeMedia 媒体门禁矩阵测试(2026-09-02 补覆盖)
// 门禁决策单一源 = src/shared/mediarules.mjs;本测试锁行为:
//   缩略图继承原图可见性(DG-SEC-003);演示照片/白板/大屏公开;普通模式下私有上传只有"本人有效 vid 会话"或本人 mt 可见
//   (2026-10-11 DG-SEC-001/002:UA 哈希 dk 不再单独构成授权;特殊模式已于 2026-09-06 删除)。
// 注意:必须用 createRequire 与被测模块共享同一 Node require 缓存——
//   vitest 的 ESM import 会为 lib/*.js 产生独立模块实例,gateData 改动传不进
//   siteconfig 内部持有的引用(双实例坑,2026-09-02 实测)。
// 数据一律落系统临时目录(照 lib-identity-authorization.test.js):本人认领时会绑 aid 落盘,
//   不重定向就会污染真实 gate_data.json/db。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-siteconfig-'));
process.env.GATE_DATA_FILE = path.join(tmpDir, 'gate_data.json'); // 必须在 require store 之前

const require = createRequire(import.meta.url);
const { gateData, deviceKey, issueSession } = require('../../lib/store.js');
const { canServeMedia, isMineUpload } = require('../../lib/siteconfig.js');

const UA = 'vitest-media-ua';
function mockReq(url, extraHeaders) {
  return {
    headers: { 'user-agent': UA, ...(extraHeaders || {}) },
    url: url || '',
    _mediaPublic: undefined,
  };
}
const asVid = (vid) => ({ cookie: 'vid=' + vid });

// 快照恢复,防污染真实 gate_data
let snap;
beforeEach(() => {
  snap = JSON.stringify({
    uploads: gateData.uploads,
    siteConfig: gateData.siteConfig,
    applicants: gateData.applicants,
  });
  gateData.siteConfig.mode = 'normal';
  gateData.siteConfig.demoPhotos = ['201.jpg', '202.png'];
  const dk = deviceKey(mockReq());
  // 两个都已建有效会话的访客:mine.jpg 只归属 owner
  gateData.applicants = {
    owner: {
      answer: '本人',
      ua: UA,
      dk,
      status: 'approved',
      applyTime: Date.now(),
      lastAccess: Date.now(),
      localId: '',
      fpSet: {},
      ips: [],
    },
    other: {
      answer: '他人',
      ua: UA,
      dk,
      status: 'approved',
      applyTime: Date.now(),
      lastAccess: Date.now(),
      localId: '',
      fpSet: {},
      ips: [],
    },
  };
  issueSession(gateData.applicants.owner);
  issueSession(gateData.applicants.other);
  gateData.uploads = {
    'mine.jpg': { dk, aid: 'owner', ts: 1, mt: 'mtoken123' },
    'theirs.jpg': { dk: 'dkother', ts: 2 },
  };
});
afterEach(() => {
  const s = JSON.parse(snap);
  gateData.uploads = s.uploads;
  gateData.siteConfig = s.siteConfig;
  gateData.applicants = s.applicants;
});

describe('canServeMedia 门禁矩阵', () => {
  it('缩略图继承原图可见性(DG-SEC-003:旧语义"thumbs/ 永远公开"已废)', () => {
    // 他人上传/查无归属的照片:原图拒,它的缩略图同样拒(旧实现在此无条件 return true = 私有内容经 1024px 缩略图泄露)
    expect(canServeMedia(mockReq(), 'photos', 'thumbs/theirs.jpg')).toBe(false);
    expect(canServeMedia(mockReq(), 'photos', 'thumbs/nobody.jpg')).toBe(false);
    // 本人上传:带本人有效 vid 才放行;生成器把扩展名统一写成 .webp,按主干名回查原条目
    expect(canServeMedia(mockReq('', asVid('owner')), 'photos', 'thumbs/mine.webp')).toBe(true);
    expect(canServeMedia(mockReq('', asVid('other')), 'photos', 'thumbs/mine.webp')).toBe(false);
    // 演示照片(按名字公开)的缩略图仍公开
    expect(canServeMedia(mockReq(), 'photos', 'thumbs/201.webp')).toBe(true);
  });

  it('演示照片公开', () => {
    expect(canServeMedia(mockReq(), 'photos', '201.jpg')).toBe(true);
  });

  it('白板作品公开(2026-08-31 H2 已限扩展名,门禁只管放行)', () => {
    expect(canServeMedia(mockReq(), 'photos', 'whiteboard-abc.png')).toBe(true);
  });

  it('普通模式:图库非演示照片默认拒绝', () => {
    expect(canServeMedia(mockReq(), 'photos', 'nobody.jpg')).toBe(false);
  });

  it('本人上传放行:只认本人有效 vid 会话(DG-SEC-001/002)', () => {
    expect(canServeMedia(mockReq('', asVid('owner')), 'photos', 'mine.jpg')).toBe(true);
    expect(
      isMineUpload(mockReq('', asVid('owner')), gateData.uploads['mine.jpg'], deviceKey(mockReq()))
    ).toBe(true);
  });

  it('纯 UA 指纹不再构成授权:同 UA 无有效 vid 的陌生访客 403', () => {
    // 旧实现在此按 dk=sha256(UA) 命中即放行——同型号设备/抄 UA 的陌生人互相能取对方的私有照片
    expect(canServeMedia(mockReq(), 'photos', 'mine.jpg')).toBe(false);
    expect(isMineUpload(mockReq(), gateData.uploads['mine.jpg'], deviceKey(mockReq()))).toBe(false);
    // 陌生人的有效 vid 也拿不到别人的记录(有效身份 ≠ 任意身份)
    expect(canServeMedia(mockReq('', asVid('other')), 'photos', 'mine.jpg')).toBe(false);
    // 伪造/不存在的 vid 同样无效
    expect(canServeMedia(mockReq('', asVid('no-such-vid')), 'photos', 'mine.jpg')).toBe(false);
  });

  it('他人上传拒绝', () => {
    expect(canServeMedia(mockReq(), 'photos', 'theirs.jpg')).toBe(false);
  });

  it('媒体令牌 mt= 命中仍认本人(UA 漂移兜底,2026-07-27 血泪)', () => {
    const req = mockReq('photos/mine.jpg?mt=mtoken123', { 'user-agent': 'QQ代理UA-漂移' });
    expect(canServeMedia(req, 'photos', 'mine.jpg')).toBe(true);
  });

  it('特殊模式已删除:他人/无归属媒体一律拒绝(2026-09-06)', () => {
    gateData.siteConfig.mode = 'special'; // 即使残留脏数据也不生效
    expect(canServeMedia(mockReq(), 'photos', 'theirs.jpg')).toBe(false);
    expect(canServeMedia(mockReq(), 'photos', 'nobody.jpg')).toBe(false);
  });

  it('公开媒体标记 _mediaPublic(允许 CDN 边缘缓存),隐私媒体不标记', () => {
    const pub = mockReq();
    canServeMedia(pub, 'photos', '201.jpg');
    expect(pub._mediaPublic).toBe(true);
    const priv = mockReq();
    canServeMedia(priv, 'photos', 'nobody.jpg');
    expect(priv._mediaPublic).toBe(false);
    // 私有内容的缩略图同样不得被标成可公开缓存(DG-SEC-003;脏 true 也要被覆盖掉)
    const privThumb = mockReq();
    privThumb._mediaPublic = true;
    expect(canServeMedia(privThumb, 'photos', 'thumbs/nobody.webp')).toBe(false);
    expect(privThumb._mediaPublic).toBe(false);
  });
});
