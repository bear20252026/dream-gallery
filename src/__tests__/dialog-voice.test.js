// dialog-voice.test.js — 台词朗读纯逻辑契约(2026-09-24)
// 回归锚点:①英文会话烧配额(只读汉字行);②前缀替换语义误改排队 → 声音越落越远;
// ③静音钮失效 → 用户无法关掉朗读。
import { describe, it, expect } from 'vitest';
import { voiceFor, hasCJK, speakDecision } from '../core/dialog-voice.mjs';

describe('voiceFor 说话人分声线', () => {
  it('prince=小艺 / pilot=云希(spk 来自 story-text who 常量)', () => {
    expect(voiceFor('prince')).toBe('zh-CN-XiaoyiNeural');
    expect(voiceFor('pilot')).toBe('zh-CN-YunxiNeural');
  });
  it('sheep/rose 与未知说话人走默认晓晓', () => {
    expect(voiceFor('sheep')).toBe('zh-CN-XiaoxiaoNeural');
    expect(voiceFor('rose')).toBe('zh-CN-XiaoxiaoNeural');
    expect(voiceFor('')).toBe('zh-CN-XiaoxiaoNeural');
    expect(voiceFor(undefined)).toBe('zh-CN-XiaoxiaoNeural');
  });
});

describe('hasCJK 朗读门槛', () => {
  it('汉字命中', () => {
    expect(hasCJK('请你——给我画一只羊！')).toBe(true);
  });
  it('纯英文/数字/空不命中(英文会话静默省配额)', () => {
    expect(hasCJK('If you please-- draw me a sheep!')).toBe(false);
    expect(hasCJK('123')).toBe(false);
    expect(hasCJK('')).toBe(false);
    expect(hasCJK(undefined)).toBe(false);
  });
  it('中英混排命中(以汉字为准)', () => {
    expect(hasCJK('B612 是一颗小行星')).toBe(true);
  });
});

describe('speakDecision 决策表', () => {
  it('静音优先级最高', () => {
    expect(speakDecision('画一只羊', true)).toEqual({ speak: false, reason: 'muted' });
  });
  it('无汉字不读', () => {
    expect(speakDecision('draw me a sheep', false)).toEqual({ speak: false, reason: 'no-cjk' });
  });
  it('空文案不读', () => {
    expect(speakDecision('', false)).toEqual({ speak: false, reason: 'empty' });
    expect(speakDecision('  ', false)).toEqual({ speak: false, reason: 'empty' });
  });
  it('中文正常行放行', () => {
    expect(speakDecision('请你——给我画一只羊！', false)).toEqual({ speak: true, reason: 'ok' });
  });
  it('静音+无汉字:静音理由优先(可诊断用户为何没听到)', () => {
    expect(speakDecision('draw', true).reason).toBe('muted');
  });
});
