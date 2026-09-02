// lib/quiz.js 出卷行为测试(2026-09-02 补覆盖第二批)
// 锁行为:分数线单源 60、文理/神话卷出 9 题、选项恰为 A-D 四键、非法 track 400。
// 判分(submit/judge)依赖 AI 通道异步,不在本轮(需 mock aichannels,留待需要时)。
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

process.env.TOKEN = process.env.TOKEN || 'vitest-token-abc';
const require = createRequire(import.meta.url);
const { handleQuizStart, QUIZ_PASS_SCORE } = require('../../lib/quiz.js');

const REQ = { headers: { 'user-agent': 'quiz-ua' }, url: '' };
function mockRes() {
  const res = {
    setHeader() {},
    writeHead(code) {
      this.code = code;
    },
    end(b) {
      this.body = b ? JSON.parse(b) : null;
    },
  };
  return res;
}
function start(track) {
  const res = mockRes();
  handleQuizStart(REQ, res, track ? { track } : {});
  return { code: res.code, body: res.body };
}

describe('quiz 出卷', () => {
  it('分数线单源 = 60(前端不再硬编码)', () => {
    expect(QUIZ_PASS_SCORE).toBe(60);
  });

  it.each(['li', 'wen'])('文理卷 track=%s:出 9 题选择题 + 1 道问答 + passScore 下发', (track) => {
    const { code, body } = start(track);
    expect(code).toBe(200);
    expect(body.sessionId).toBeTruthy();
    expect(body.mc).toHaveLength(9);
    expect(body.passScore).toBe(60);
    expect(body.qa.q).toBeTruthy();
    for (const m of body.mc) {
      // 选项恰为 A/B/C/D 四键,且互不重复(答案锚定后干扰项逐格填充)
      expect(Object.keys(m.options).sort()).toEqual(['A', 'B', 'C', 'D']);
      expect(new Set(Object.values(m.options)).size).toBe(4);
    }
  });

  it('神话卷 track=shen:独立题池正常出卷', () => {
    const { code, body } = start('shen');
    expect(code).toBe(200);
    expect(body.mc).toHaveLength(9);
    expect(body.qa.q).toBeTruthy();
  });

  it('非法 track → 400(不允许任意注入)', () => {
    expect(start('hack').code).toBe(400);
    expect(start(undefined).code).toBe(400);
  });

  it('两个 sessionId 互不相同(会话隔离)', () => {
    const a = start('li').body.sessionId;
    const b = start('li').body.sessionId;
    expect(a).not.toBe(b);
  });
});
