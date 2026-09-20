// mediarules.test.js — 媒体可见性决策表·单一源契约(2026-09-18 审计 P1 补测)
// 决策表是服务端 canServeMedia 与客户端上墙/配文共用的安全边界,改动必须有测试把关。
import { describe, it, expect } from 'vitest';
import { stripThumbs, isWhiteboard, isBigscreen, wallDecision, contentAllowed, captionAllowed, serveDecision } from '../shared/mediarules.mjs';

describe('mediarules 名字模式', () => {
  it('stripThumbs 剥缩略图前缀', () => {
    expect(stripThumbs('thumbs/a.jpg')).toBe('a.jpg');
    expect(stripThumbs('a.jpg')).toBe('a.jpg');
  });
  it('isWhiteboard 仅 photos 目录 + whiteboard- 前缀', () => {
    expect(isWhiteboard('photos', 'whiteboard-1.png')).toBe(true);
    expect(isWhiteboard('photos', 'demo-1.png')).toBe(false);
    expect(isWhiteboard('videos', 'whiteboard-1.png')).toBe(false);
  });
  it('isBigscreen 仅 videos 目录 + 户外大屏/ 前缀', () => {
    expect(isBigscreen('videos', '户外大屏/1号.mp4')).toBe(true);
    expect(isBigscreen('videos', '别的.mp4')).toBe(false);
    expect(isBigscreen('photos', '户外大屏/1号.mp4')).toBe(false);
  });
});

describe('mediarules 上墙/内容/配文决策(2026-09-06 后:演示+本人可见,其余隐藏)', () => {
  it('演示照片:可见出内容', () => {
    expect(wallDecision({ isDemo: true })).toEqual({ visible: true, content: true });
  });
  it('本人上传:可见出内容', () => {
    expect(wallDecision({ isMine: true })).toEqual({ visible: true, content: true });
  });
  it('图库/他人上传:整框隐藏', () => {
    expect(wallDecision({})).toEqual({ visible: false, content: false });
    expect(wallDecision({ isLib: true })).toEqual({ visible: false, content: false });
  });
  it('contentAllowed 与 wallDecision.content 恒一致', () => {
    for (const o of [{ isDemo: true }, { isMine: true }, {}, { isLib: true }]) {
      expect(contentAllowed(o)).toBe(wallDecision(o).content);
    }
  });
  it('captionAllowed 与内容门禁同表(演示+本人)', () => {
    expect(captionAllowed({ isDemo: true })).toBe(true);
    expect(captionAllowed({ isMine: true })).toBe(true);
    expect(captionAllowed({})).toBe(false);
  });
});

describe('mediarules 下载放行决策(服务端堵口版)', () => {
  it('白板/大屏:公开放行(可 CDN 缓存)', () => {
    expect(serveDecision({ dir: 'photos', base: 'whiteboard-x.png' })).toEqual({ allow: true, pub: true });
    expect(serveDecision({ dir: 'videos', base: '户外大屏/3号.mp4' })).toEqual({ allow: true, pub: true });
  });
  it('演示照片:公开放行', () => {
    expect(serveDecision({ dir: 'photos', base: '201.jpg', isDemo: true })).toEqual({ allow: true, pub: true });
  });
  it('本人上传(dk 或 mt):放行但不公开(门禁媒体禁 CDN 缓存)', () => {
    expect(serveDecision({ dir: 'photos', base: 'x.jpg', isMine: true })).toEqual({ allow: true, pub: false });
    expect(serveDecision({ dir: 'photos', base: 'x.jpg', hasMt: true })).toEqual({ allow: true, pub: false });
  });
  it('其余(图库/他人):一律拒绝——安全底线', () => {
    expect(serveDecision({ dir: 'photos', base: 'x.jpg' })).toEqual({ allow: false, pub: false });
    expect(serveDecision({ dir: 'photos', base: 'x.jpg', isLib: true })).toEqual({ allow: false, pub: false });
  });
});
