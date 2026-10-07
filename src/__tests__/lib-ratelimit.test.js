// lib-ratelimit.test.js — 公开 AI 接口洪水防护的纯逻辑契约(2026-10-07 审查#2)
// 固定窗口按 realIP+bucket 计数;阈值本身是策略(见 lib/ratelimit.js 头注),这里钉行为:
// ①超限拒、②不同 IP/桶互不影响、③窗口滚动后重置、④直连伪造 CF 头无效(回退 socket 地址)。
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);
const { hit, _reset } = nodeRequire('../../lib/ratelimit.js');

// 造假请求:socket=127.0.0.1 时 realIP 才信任 CF 头(可信反代语义,与线上 Cloudflare 回源一致)
const proxied = (ip) => ({
  socket: { remoteAddress: '127.0.0.1' },
  headers: { 'cf-connecting-ip': ip },
});
const direct = (ip) => ({
  socket: { remoteAddress: ip },
  headers: { 'cf-connecting-ip': '6.6.6.6' },
});

describe('ratelimit.hit 洪水防护', () => {
  beforeEach(() => _reset());

  it('到量即拒:limit=3 时第 1~3 次 ok,第 4 次拒并给出 retryAfter', () => {
    for (let i = 0; i < 3; i++) expect(hit(proxied('1.1.1.1'), 'tts-synth', 3).ok).toBe(true);
    const r = hit(proxied('1.1.1.1'), 'tts-synth', 3);
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBeGreaterThanOrEqual(1);
  });

  it('不同 IP 各自计数,互不牵连', () => {
    for (let i = 0; i < 3; i++) expect(hit(proxied('1.1.1.1'), 'tts-synth', 3).ok).toBe(true);
    expect(hit(proxied('2.2.2.2'), 'tts-synth', 3).ok).toBe(true);
  });

  it('不同 bucket 各自计数(同一 IP 合成被限,批量仍可用)', () => {
    for (let i = 0; i < 3; i++) expect(hit(proxied('1.1.1.1'), 'tts-synth', 3).ok).toBe(true);
    expect(hit(proxied('1.1.1.1'), 'tts-batch', 60).ok).toBe(true);
  });

  it('窗口滚动后重置(windowMs=40ms,真实等待)', async () => {
    expect(hit(proxied('3.3.3.3'), 'quiz-ai', 1, 40).ok).toBe(true);
    expect(hit(proxied('3.3.3.3'), 'quiz-ai', 1, 40).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 70));
    expect(hit(proxied('3.3.3.3'), 'quiz-ai', 1, 40).ok).toBe(true);
  });

  it('直连伪造 CF 头无效:按 socket 地址归桶(与反代访客不串桶)', () => {
    for (let i = 0; i < 3; i++) expect(hit(direct('9.9.9.9'), 'tts-synth', 3).ok).toBe(true);
    // 同一个 socket 地址换着伪造头,仍然共享 9.9.9.9 的桶 → 第 4 次拒
    expect(hit(direct('9.9.9.9'), 'tts-synth', 3).ok).toBe(false);
    // 反代后的真实访客(1.2.3.4)是另一个桶
    expect(hit(proxied('1.2.3.4'), 'tts-synth', 3).ok).toBe(true);
  });

  it('无任何头的请求落进 unknown 桶,不抛异常', () => {
    const bare = { socket: { remoteAddress: '127.0.0.1' }, headers: {} };
    expect(hit(bare, 'chat-bot', 6).ok).toBe(true);
  });
});
