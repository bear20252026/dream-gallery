// dialog-voice.test.js — 台词朗读纯逻辑契约(2026-09-24 建;2026-09-26 修订)
// 2026-09-26 主人报「还是没有声音」→ 根因:闸门默认英文(scriptLang=en)而旧决策表
// 「无汉字不读」把英文台词全拦 → 全程无声。修订:①英文行照读;②音色切 MiMo 官方
// 预置(中文 苏打/茉莉,英文 Milo/Dean/Mia),按文本语言分轨(voiceFor 带 text)。
import { describe, it, expect } from 'vitest';
import { voiceFor, hasCJK, speakDecision, prefetchLine, ttsUrl } from '../core/dialog-voice.mjs';
import crypto from 'node:crypto';

describe('voiceFor 说话人分声线(按文本语言分轨)', () => {
  it('中文行:prince/pilot=苏打(男)', () => {
    expect(voiceFor('prince', '请你——给我画一只羊！')).toBe('苏打');
    expect(voiceFor('pilot', '我六年前做过一次断航。')).toBe('苏打');
  });
  it('中文行:sheep/rose/未知说话人=茉莉(女)', () => {
    expect(voiceFor('sheep', '咩——')).toBe('茉莉');
    expect(voiceFor('rose', '我太难了')).toBe('茉莉');
    expect(voiceFor('', '你好')).toBe('茉莉');
    expect(voiceFor(undefined, '你好')).toBe('茉莉');
  });
  it('英文行:prince=Milo / pilot=Dean / 其余=Mia(2026-09-26 英文也读)', () => {
    expect(voiceFor('prince', 'If you please-- draw me a sheep!')).toBe('Milo');
    expect(voiceFor('pilot', 'I was six then.')).toBe('Dean');
    expect(voiceFor('sheep', 'baa!')).toBe('Mia');
    expect(voiceFor('', 'hello')).toBe('Mia');
  });
  it('无 text 时按英文轨兜底(不抛错)', () => {
    expect(voiceFor('prince')).toBe('Milo');
    expect(voiceFor('prince', undefined)).toBe('Milo');
  });
});

describe('hasCJK 声线分轨依据(不再是朗读门槛)', () => {
  it('汉字命中', () => {
    expect(hasCJK('请你——给我画一只羊！')).toBe(true);
  });
  it('纯英文/数字/空不命中', () => {
    expect(hasCJK('If you please-- draw me a sheep!')).toBe(false);
    expect(hasCJK('123')).toBe(false);
    expect(hasCJK('')).toBe(false);
    expect(hasCJK(undefined)).toBe(false);
  });
  it('中英混排命中(以汉字为准)', () => {
    expect(hasCJK('B612 是一颗小行星')).toBe(true);
  });
});

describe('speakDecision 决策表(2026-09-26 修订:英文行放行)', () => {
  it('静音优先级最高', () => {
    expect(speakDecision('画一只羊', true)).toEqual({ speak: false, reason: 'muted' });
  });
  it('英文行也读(修订:旧版 no-cjk 拦截致默认英文会话全程无声)', () => {
    expect(speakDecision('draw me a sheep', false)).toEqual({ speak: true, reason: 'ok' });
  });
  it('空文案不读', () => {
    expect(speakDecision('', false)).toEqual({ speak: false, reason: 'empty' });
    expect(speakDecision('  ', false)).toEqual({ speak: false, reason: 'empty' });
  });
  it('中文正常行放行', () => {
    expect(speakDecision('请你——给我画一只羊！', false)).toEqual({ speak: true, reason: 'ok' });
  });
  it('静音+英文行:静音理由优先(可诊断用户为何没听到)', () => {
    expect(speakDecision('draw', true).reason).toBe('muted');
  });
});

describe('prefetchLine 下一行预取(2026-09-24 流畅度)', () => {
  it('与 speakDecision 同一张决策表(静音/空不预取;中英文都预取)', () => {
    expect(prefetchLine('画一只羊', 'prince').speak).toBe(true);
    expect(prefetchLine('draw me a sheep', 'prince').speak).toBe(true);
    expect(prefetchLine('', 'prince').speak).toBe(false);
  });
  it('可朗读行在无 Audio 环境也不抛错(静默兜底)', () => {
    expect(() => prefetchLine('请你——给我画一只羊！', 'prince')).not.toThrow();
    expect(() => prefetchLine('draw me a sheep', 'prince')).not.toThrow();
  });
});

describe('ttsUrl 边缘可缓存台词 URL(2026-09-26,前后端键契约的客户端半边)', () => {
  it('直拼 /tts-audio/<key>.mp3,key 与服务端 ttsKey 同一算法(sha256("tts1|voice|text") 前 20 位)', async () => {
    const expectKey = crypto
      .createHash('sha256')
      .update('tts1|' + 'Milo' + '|' + 'If you please-- draw me a sheep!')
      .digest('hex')
      .slice(0, 20);
    expect(await ttsUrl('If you please-- draw me a sheep!', 'Milo')).toBe(
      '/tts-audio/' + expectKey + '.mp3'
    );
  });
  it('中文行同理(苏打轨)', async () => {
    const expectKey = crypto
      .createHash('sha256')
      .update('tts1|' + '苏打' + '|' + '请你——给我画一只羊！')
      .digest('hex')
      .slice(0, 20);
    expect(await ttsUrl('请你——给我画一只羊！', '苏打')).toBe('/tts-audio/' + expectKey + '.mp3');
  });
  it('超长文本按 220 截断后进哈希(与服务端 MAX_LEN 对齐,否则永不命中)', async () => {
    const long = '羊'.repeat(300);
    const expectKey = crypto
      .createHash('sha256')
      .update('tts1|' + '苏打' + '|' + '羊'.repeat(220))
      .digest('hex')
      .slice(0, 20);
    expect(await ttsUrl(long, '苏打')).toBe('/tts-audio/' + expectKey + '.mp3');
  });
});
