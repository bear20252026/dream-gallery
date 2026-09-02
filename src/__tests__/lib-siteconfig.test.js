// lib/siteconfig.js canServeMedia 媒体门禁矩阵测试(2026-09-02 补覆盖)
// 门禁决策单一源 = src/shared/mediarules.mjs;本测试锁行为:
//   缩略图永远公开;演示照片/白板/大屏公开;普通模式图库与他人上传仅本人/特殊设备;
//   全局 special 模式全展示。
// 注意:必须用 createRequire 与被测模块共享同一 Node require 缓存——
//   vitest 的 ESM import 会为 lib/*.js 产生独立模块实例,gateData 改动传不进
//   siteconfig 内部持有的引用(双实例坑,2026-09-02 实测)。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { gateData, deviceKey } = require('../../lib/store.js');
const { canServeMedia } = require('../../lib/siteconfig.js');

const UA = 'vitest-media-ua';
function mockReq(url, extraHeaders) {
  return {
    headers: { 'user-agent': UA, ...(extraHeaders || {}) },
    url: url || '',
    _mediaPublic: undefined,
  };
}

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
  gateData.uploads = {
    'mine.jpg': { dk: deviceKey(mockReq()), ts: 1, mt: 'mtoken123' },
    'theirs.jpg': { dk: 'dkother', ts: 2 },
  };
  gateData.applicants = {};
});
afterEach(() => {
  const s = JSON.parse(snap);
  gateData.uploads = s.uploads;
  gateData.siteConfig = s.siteConfig;
  gateData.applicants = s.applicants;
});

describe('canServeMedia 门禁矩阵', () => {
  it('缩略图(thumbs/)永远公开——不涉及隐私', () => {
    expect(canServeMedia(mockReq(), 'photos', 'thumbs/theirs.jpg')).toBe(true);
    expect(canServeMedia(mockReq(), 'photos', 'thumbs/nobody.jpg')).toBe(true);
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

  it('本人上传放行(UA 指纹匹配)', () => {
    expect(canServeMedia(mockReq(), 'photos', 'mine.jpg')).toBe(true);
  });

  it('他人上传拒绝', () => {
    expect(canServeMedia(mockReq(), 'photos', 'theirs.jpg')).toBe(false);
  });

  it('媒体令牌 mt= 命中仍认本人(UA 漂移兜底,2026-07-27 血泪)', () => {
    const req = mockReq('photos/mine.jpg?mt=mtoken123', { 'user-agent': 'QQ代理UA-漂移' });
    expect(canServeMedia(req, 'photos', 'mine.jpg')).toBe(true);
  });

  it('全局 special 模式全展示', () => {
    gateData.siteConfig.mode = 'special';
    expect(canServeMedia(mockReq(), 'photos', 'theirs.jpg')).toBe(true);
    expect(canServeMedia(mockReq(), 'photos', 'nobody.jpg')).toBe(true);
  });

  it('公开媒体标记 _mediaPublic(允许 CDN 边缘缓存),隐私媒体不标记', () => {
    const pub = mockReq();
    canServeMedia(pub, 'photos', '201.jpg');
    expect(pub._mediaPublic).toBe(true);
    const priv = mockReq();
    canServeMedia(priv, 'photos', 'nobody.jpg');
    expect(priv._mediaPublic).toBeFalsy();
  });
});
