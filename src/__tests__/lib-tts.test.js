// lib-tts.test.js — 台词音频边缘缓存出口契约(2026-09-26)
// 背景:/api/tts?text=.. 响应 Cloudflare 恒不缓存(DYNAMIC)→ 每条音频跨境回源,
// 晚高峰拥塞时台词链条被拖成「无声」。修法:GET /tts-audio/<key>.mp3 只读出口,
// key = sha256('tts1|voice|text') 前 20 位,客户端 dialog-voice.mjs 复算同一算法直拼 URL。
import { describe, it, expect, afterAll } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';
import { ttsKey, handleTtsAudio, handleTts } from '../../lib/tts.js';

const CACHE_DIR = path.join(process.cwd(), '.tts-cache');

function fakeRes() {
  const res = new Writable({
    write(chunk, enc, cb) {
      res.chunks.push(chunk);
      cb();
    },
  });
  res.chunks = [];
  res.code = 0;
  res.headers = null;
  res.writeHead = (code, headers) => {
    res.code = code;
    res.headers = headers;
    return res;
  };
  res.setHeader = () => res;
  return res;
}

afterAll(() => {
  // 清理本测试写入的缓存文件(只删 tts1 键空间的测试样本)
  try {
    for (const k of [ttsKey('苏打', 'lib-tts-test-样本'), ttsKey('Milo', 'lib-tts-test-样本')]) {
      fs.unlinkSync(path.join(CACHE_DIR, k + '.mp3'));
    }
  } catch {
    /* 不存在则忽略 */
  }
});

describe('ttsKey 版本化缓存键(前后端契约的服务端半边)', () => {
  it('等于 sha256("tts1|voice|text") 前 20 位(客户端 ttsUrl 复算同一算法)', () => {
    const expectKey = crypto
      .createHash('sha256')
      .update('tts1|' + '苏打' + '|' + '请你——给我画一只羊！')
      .digest('hex')
      .slice(0, 20);
    expect(ttsKey('苏打', '请你——给我画一只羊！')).toBe(expectKey);
  });
  it('音色参与键(煮错音色=白煮,2026-09-26 取证教训)', () => {
    expect(ttsKey('苏打', '同一句')).not.toBe(ttsKey('Milo', '同一句'));
  });
  it('确定性:同输入同键;格式:20 位小写十六进制', () => {
    expect(ttsKey('Milo', 'draw me a sheep')).toBe(ttsKey('Milo', 'draw me a sheep'));
    expect(ttsKey('Milo', 'draw me a sheep')).toMatch(/^[0-9a-f]{20}$/);
  });
  // 截断口径:handleTts/handleTtsBatch 在调用 ttsKey 前已 slice(0,220),客户端 ttsUrl
  // 同样先截断再哈希 —— 两端「先截断后进哈希」的对齐由 dialog-voice.test.js 钉死。
});

describe('handleTtsAudio /tts-audio/<key>.mp3 只读出口', () => {
  const key = ttsKey('苏打', 'lib-tts-test-样本');
  const file = path.join(CACHE_DIR, key + '.mp3');

  it('未煮的冷台词 → 404(不合成:哈希不可逆,捞不回文本)', async () => {
    try {
      fs.unlinkSync(file);
    } catch {
      /* 本就不存在 */
    }
    const res = fakeRes();
    handleTtsAudio({ method: 'GET' }, res, key);
    await new Promise((r) => res.on('finish', r).on('close', r));
    expect(res.code).toBe(404);
  });

  it('已煮的台词 → 200 + audio/mpeg + public max-age=86400(CF 边缘缓存的资格线)', async () => {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(file, Buffer.from('fake-mp3-bytes'));
    const res = fakeRes();
    handleTtsAudio({ method: 'GET' }, res, key);
    await new Promise((r) => res.on('finish', r).on('close', r));
    expect(res.code).toBe(200);
    expect(res.headers['Content-Type']).toBe('audio/mpeg');
    expect(res.headers['Cache-Control']).toBe('public, max-age=86400');
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(Buffer.concat(res.chunks).toString()).toBe('fake-mp3-bytes');
  });

  it('畸形键 → 400(遍历防御:路由正则之外的兜底)', async () => {
    const res = fakeRes();
    handleTtsAudio({ method: 'GET' }, res, '../etc/passwd');
    await new Promise((r) => res.on('finish', r).on('close', r));
    expect(res.code).toBe(400);
  });
});

describe('handleTts 经典通道仍工作(回退通道不回归)', () => {
  it('空文本 → 400', () => {
    const res = fakeRes();
    handleTts({ method: 'GET' }, res, { text: '', voice: '' });
    expect(res.code).toBe(400);
  });
});
