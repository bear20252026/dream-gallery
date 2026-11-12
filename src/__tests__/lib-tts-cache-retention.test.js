// TTS 合成缓存保留期(2026-11-11 全面审计 C2 回归):
// .tts-cache 原先只进不出、无界增长。现钉死:
//   ① 超过 RETENTION_DAYS.ttsCache 的 *.mp3 按 mtime 清掉,未超期的保留;
//   ② 非 mp3 文件一律不碰;目录不存在不报错;
//   ③ preview 只统计不删;
//   ④ 文件系统侧清理不触发 gateData 落盘(writes 纪律不被破坏)。
// 缓存目录经 TTS_CACHE_DIR 重定向到系统临时目录,仓库真实 .tts-cache 不得被碰。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-tts-retention-'));
process.env.GATE_DATA_FILE = path.join(tmpDir, 'gate_data.json');
process.env.TTS_CACHE_DIR = path.join(tmpDir, 'tts-cache');
process.env.RETENTION_DISABLED = '1';

const require = createRequire(import.meta.url);
const retention = require('../../lib/retention.js');
const store = require('../../lib/store.js');

const DAY = 24 * 3600 * 1000;
const NOW = Date.UTC(2026, 10, 11, 12, 0, 0);
const cacheDir = process.env.TTS_CACHE_DIR;

function seedFile(name, ageDays) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const p = path.join(cacheDir, name);
  fs.writeFileSync(p, 'fake-audio');
  const t = (NOW - ageDays * DAY) / 1000;
  fs.utimesSync(p, t, t); // atime/mtime 都设成"ageDays 天前"
  return p;
}

beforeEach(() => {
  fs.rmSync(cacheDir, { recursive: true, force: true });
  store.gateData._savedAt = 1; // 落盘哨兵:任何 saveGateData 都会把它顶成当前毫秒
});
afterEach(() => {
  fs.rmSync(cacheDir, { recursive: true, force: true });
});

describe('保留期常量', () => {
  it('ttsCache 已登记且为 90 天', () => {
    expect(retention.RETENTION_DAYS.ttsCache).toBe(90);
  });
});

describe('sweepTtsCache 按 mtime 裁剪', () => {
  it('超期 mp3 清掉,未超期保留,非 mp3 不碰', () => {
    const old = seedFile('old.mp3', 100);
    const fresh = seedFile('fresh.mp3', 10);
    const edge = seedFile('edge.mp3', 89);
    const txt = seedFile('notes.txt', 400);
    const removed = retention.sweepTtsCache(NOW, false);
    expect(removed).toBe(1);
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
    expect(fs.existsSync(edge)).toBe(true);
    expect(fs.existsSync(txt)).toBe(true);
  });

  it('preview 只统计不删', () => {
    const old = seedFile('old.mp3', 100);
    const removed = retention.sweepTtsCache(NOW, true);
    expect(removed).toBe(1);
    expect(fs.existsSync(old)).toBe(true);
  });

  it('目录不存在:返回 0 不报错', () => {
    expect(retention.sweepTtsCache(NOW, false)).toBe(0);
  });

  it('恰好 90 天不算超期(> 才删)', () => {
    const exact = seedFile('exact.mp3', 90);
    expect(retention.sweepTtsCache(NOW, false)).toBe(0);
    expect(fs.existsSync(exact)).toBe(true);
  });
});

describe('与整轮清扫的接线', () => {
  it('runSweep 带出 ttsCache 计数,且文件系统清理不触发 gateData 落盘', () => {
    seedFile('old.mp3', 100);
    const r = retention.runSweep({ now: NOW });
    expect(r.removed.ttsCache).toBe(1);
    expect(r.writes).toBe(0); // 只有文件系统清理,没有集合裁剪 ⇒ 一次落盘都不该有
    expect(store.gateData._savedAt).toBe(1);
  });
});
