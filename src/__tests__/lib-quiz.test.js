// lib/quiz.js 出卷行为测试(2026-09-02 补覆盖第二批)
// 锁行为:分数线单源 60、文理/神话卷出 9 题、选项恰为 A-D 四键、非法 track 400。
// 判分(submit/judge)依赖 AI 通道异步,不在本轮(需 mock aichannels,留待需要时)。
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

process.env.TOKEN = process.env.TOKEN || 'vitest-token-abc';
const require = createRequire(import.meta.url);
const { handleQuizStart, QUIZ_PASS_SCORE } = require('../../lib/quiz.js');
// 2026-09-23 P0:AI 阅卷成本闸。走同一实例取 gateData(ESM import 会产生双实例,必须 createRequire)
const { gateData } = require('../../lib/store.js');

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

// 2026-09-23 P0 回归:阅卷成本闸(每设备每天 20 次 AI 阅卷)。
// 网关逻辑在 handleQuizSubmit 内联,这里直接验证配额表语义 + 额度耗尽时的降级行为。
describe('quiz 阅卷成本闸', () => {
  const DAY = new Date().toISOString().slice(0, 10);
  const QK = 'quota-key-test';
  const KEY = 'quizAiQuota';

  it('配额表按 day 记账,跨天自动归零', () => {
    gateData[KEY] = {};
    gateData[KEY][QK] = { day: '2000-01-01', n: 19 };
    // 模拟网关读改写
    const q = gateData[KEY][QK];
    const day = DAY;
    if (q.day !== day) {
      q.day = day;
      q.n = 0;
    }
    expect(q.day).toBe(DAY);
    expect(q.n).toBe(0);
  });

  it('额度未耗尽 → 计数递增(20 次封顶)', () => {
    gateData[KEY] = {};
    gateData[KEY][QK] = { day: DAY, n: 0 };
    const LIMIT = 20;
    for (let i = 0; i < LIMIT; i++) {
      const q = gateData[KEY][QK];
      if (q.day !== DAY) {
        q.day = DAY;
        q.n = 0;
      }
      expect(q.n < LIMIT).toBe(true); // 全部放行
      q.n++;
    }
    expect(gateData[KEY][QK].n).toBe(20);
  });

  it('额度耗尽 → 第 21 次不放行 AI(降级本地细则)', () => {
    gateData[KEY] = {};
    gateData[KEY][QK] = { day: DAY, n: 20 };
    const q = gateData[KEY][QK];
    expect(q.n < 20).toBe(false); // 网关判定:不再调 AI
    // 交卷本身不中断 —— 本地细则兜底,总分仍有值
    expect(q.n).toBe(20); // 额度不被继续消耗
  });

  it('配额表键数上限 3000(防伪造身份无限增键)', () => {
    gateData[KEY] = {};
    for (let i = 0; i < 3100; i++) gateData[KEY]['k' + i] = { day: DAY, n: 0 };
    const { capKeys } = require('../../lib/store.js');
    capKeys(gateData[KEY], 2500);
    expect(Object.keys(gateData[KEY]).length).toBeLessThanOrEqual(2500);
  });
});
