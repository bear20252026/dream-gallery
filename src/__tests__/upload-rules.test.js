// upload-rules.test.js — 访客上传预校验契约(2026-09-24 大文件抽缝批)
// 回归锚点:isVideo 判定原在 upload.js 写了两份(选文件/上传),若两份漂移,
// 选文件时报"图片"上传时却进 videos/ 目录 —— 单一源后契约钉死。
import { describe, it, expect } from 'vitest';
import {
  isVideo,
  maxBytes,
  isDirect,
  chunkCount,
  sanitizeExt,
  DIRECT_MAX,
  CHUNK_SIZE,
} from '../gate/upload-rules.mjs';

describe('isVideo(扩展名或 MIME 二选一命中)', () => {
  it('常见视频扩展名', () => {
    expect(isVideo('a.mp4', '')).toBe(true);
    expect(isVideo('b.MOV', '')).toBe(true); // 大小写不敏感
    expect(isVideo('c.m2ts', '')).toBe(true);
  });
  it('MIME video/ 命中(扩展名缺失时)', () => {
    expect(isVideo('', 'video/quicktime')).toBe(true);
  });
  it('图片/无类型不误判', () => {
    expect(isVideo('a.jpg', 'image/jpeg')).toBe(false);
    expect(isVideo('a.png', '')).toBe(false);
    expect(isVideo('', '')).toBe(false);
  });
  it('伪装扩展名不算:jpg.mp4 是视频,mp4.jpg 不是', () => {
    expect(isVideo('a.jpg.mp4', '')).toBe(true);
    expect(isVideo('a.mp4.jpg', 'image/jpeg')).toBe(false);
  });
});

describe('大小阈值与分片', () => {
  it('视频 700MB / 图片 50MB', () => {
    expect(maxBytes(true)).toBe(700 * 1024 * 1024);
    expect(maxBytes(false)).toBe(50 * 1024 * 1024);
  });
  it('≤384KB 直传,>384KB 分片(边界值在 384KB 上)', () => {
    expect(isDirect(DIRECT_MAX)).toBe(true);
    expect(isDirect(DIRECT_MAX + 1)).toBe(false);
  });
  it('chunkCount = ceil(size/256KB)', () => {
    expect(CHUNK_SIZE).toBe(256 * 1024);
    expect(chunkCount(DIRECT_MAX + 1)).toBe(2);
    expect(chunkCount(700 * 1024 * 1024)).toBe(2800); // 实测 700MB=2800 片
  });
});

describe('sanitizeExt(扩展名净化)', () => {
  it('小写+去非法字符(取最后一个点后的段 —— 原实现语义)', () => {
    expect(sanitizeExt('照片.HEIC', false)).toBe('heic');
    expect(sanitizeExt('a.b@d!.PNG', false)).toBe('png'); // 只取末段,b@d! 在前面的段里
  });
  it('无扩展名/全非法时按媒体类型兜底(存量怪癖如实钉住:点前整名会透传为扩展名)', () => {
    expect(sanitizeExt('noext', true)).toBe('noext'); // 原实现如此,行为保持
    expect(sanitizeExt('a.', true)).toBe('mp4'); // 空扩展名才走兜底
    expect(sanitizeExt('a.!!!', false)).toBe('jpg');
  });
});
