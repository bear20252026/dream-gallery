// 音乐搜索后端代理(2026-11-11 全面审计 P1-1 回归):
// 密钥只在服务器环境变量 MUSIC_API_KEY,前端/仓库不持有;未配置 fail-closed;
// 按 IP 限流;上游响应只下发播放必需字段,绝不透传原始响应(可能含敏感字段)。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ratelimit = require('../../lib/ratelimit.js');

const UA = 'Mozilla/5.0 (music-proxy-test-ua)';
function reqMock(ip) {
  return {
    headers: { 'user-agent': UA },
    url: '/api/music/search',
    socket: { remoteAddress: ip || '203.0.113.55' },
    on() {},
    destroy() {},
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

// 每个用例重新加载模块:模块顶层读 MUSIC_API_KEY,必须带不同的 env 重新 require。
// ⚠️ createRequire 的缓存不受 vi.resetModules 管辖,必须显式 delete require.cache 才会重读 env。
const musicPath = require.resolve('../../lib/music.js');
async function loadWithKey(key) {
  if (key === undefined) delete process.env.MUSIC_API_KEY;
  else process.env.MUSIC_API_KEY = key;
  delete require.cache[musicPath];
  return require(musicPath);
}

let savedKey;
beforeEach(() => {
  savedKey = process.env.MUSIC_API_KEY;
  ratelimit._reset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete require.cache[musicPath];
  if (savedKey === undefined) delete process.env.MUSIC_API_KEY;
  else process.env.MUSIC_API_KEY = savedKey;
});

describe('未配置密钥:fail-closed,绝不向上游发请求', () => {
  it('MUSIC_API_KEY 缺失 ⇒ 503,fetch 零调用', async () => {
    const { handleMusicSearch } = await loadWithKey(undefined);
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const res = resMock();
    await handleMusicSearch(reqMock(), res, { name: '晴天' });
    expect(res.code).toBe(503);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('已配置密钥:代理行为与字段收口', () => {
  it('空歌名 400,不触上游', async () => {
    const { handleMusicSearch } = await loadWithKey('test-key-123');
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const res = resMock();
    await handleMusicSearch(reqMock(), res, { name: '  ' });
    expect(res.code).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('上游命中:只下发 name/artist/album/music_url,密钥与多余字段不出服务器', async () => {
    const { handleMusicSearch } = await loadWithKey('test-key-123');
    const spy = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        code: 1,
        name: '晴天',
        artist: '周杰伦',
        album: '叶惠美',
        music_url: 'https://cdn.example/s.mp3',
        secret_field: 'SHOULD-NOT-LEAK',
        apiKey: 'SHOULD-NOT-LEAK',
      }),
    }));
    vi.stubGlobal('fetch', spy);
    const res = resMock();
    await handleMusicSearch(reqMock(), res, { name: '晴天' });
    expect(res.code).toBe(200);
    expect(res.body).toEqual({
      code: 1,
      name: '晴天',
      artist: '周杰伦',
      album: '叶惠美',
      music_url: 'https://cdn.example/s.mp3',
    });
    expect(JSON.stringify(res.body)).not.toContain('SHOULD-NOT-LEAK');
    // 密钥只出现在发往上游的请求里,不在响应里
    expect(String(spy.mock.calls[0][0])).toContain('apiKey=test-key-123');
  });

  it('上游未命中(code!=1):回 code:0,不透传上游原文', async () => {
    const { handleMusicSearch } = await loadWithKey('test-key-123');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ code: 0, msg: '无结果', internal: 'x' }),
      }))
    );
    const res = resMock();
    await handleMusicSearch(reqMock(), res, { name: '不存在' });
    expect(res.code).toBe(200);
    expect(res.body).toEqual({ code: 0, msg: '未找到该歌曲' });
  });

  it('music_url 非 https:拒绝下发(防 javascript:/data: 载荷进 audio.src)', async () => {
    const { handleMusicSearch } = await loadWithKey('test-key-123');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ code: 1, music_url: 'javascript:alert(1)' }),
      }))
    );
    const res = resMock();
    await handleMusicSearch(reqMock(), res, { name: 'x' });
    expect(res.body.code).toBe(0);
  });

  it('上游 HTTP 错误/网络异常:502,不暴露内部细节', async () => {
    const { handleMusicSearch } = await loadWithKey('test-key-123');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500 }))
    );
    const res = resMock();
    await handleMusicSearch(reqMock(), res, { name: 'x' });
    expect(res.code).toBe(502);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED 10.0.0.1');
      })
    );
    const res2 = resMock();
    await handleMusicSearch(reqMock(), res2, { name: 'x' });
    expect(res2.code).toBe(502);
    expect(JSON.stringify(res2.body)).not.toContain('10.0.0.1');
  });
});

describe('按 IP 限流(盗刷防护)', () => {
  it('同一 IP 超过 MUSIC_RATE 次即 429;换 IP 仍有额度', async () => {
    const { handleMusicSearch, MUSIC_RATE } = await loadWithKey('test-key-123');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ code: 0 }) }))
    );
    const ip = '203.0.113.66';
    for (let i = 0; i < MUSIC_RATE; i++) {
      const res = resMock();
      await handleMusicSearch(reqMock(ip), res, { name: 'x' });
      expect(res.code).toBe(200);
    }
    const over = resMock();
    await handleMusicSearch(reqMock(ip), over, { name: 'x' });
    expect(over.code).toBe(429);
    const other = resMock();
    await handleMusicSearch(reqMock('203.0.113.67'), other, { name: 'x' });
    expect(other.code).toBe(200);
  });
});
