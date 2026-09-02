// lib/client-errors.js 客户端报错上报测试(2026-09-02 补覆盖第二批)
// 锁行为:公开上报限流(30/分钟)、批量截断 20、重复错误合并计数、后台列表统计。
// 模块内部 save() 会写 ROOT/client_errors.json,测试后用文件快照恢复原状。
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

process.env.TOKEN = 'vitest-token-abc';
const require = createRequire(import.meta.url);
const {
  handleReport,
  handleAdminErrors,
  handleAdminErrorsClear,
} = require('../../lib/client-errors.js');
const { ROOT } = require('../../lib/config.js');
const FILE = path.join(ROOT, 'client_errors.json');

// 文件快照:恢复到测试前状态(不存在则删除)
let fileSnap;
let fileExisted;
beforeAll(() => {
  try {
    fileSnap = fs.readFileSync(FILE, 'utf8');
    fileExisted = true;
  } catch {
    fileSnap = null;
    fileExisted = false;
  }
});
afterAll(() => {
  try {
    if (fileExisted) fs.writeFileSync(FILE, fileSnap);
    else fs.unlinkSync(FILE);
  } catch {}
});

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
async function report(payload, ip = '10.1.1.1') {
  const chunks = Array.isArray(payload) ? payload : [JSON.stringify(payload)];
  const req = {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
    on(ev, cb) {
      if (ev === 'data') chunks.forEach(cb);
      if (ev === 'end') setImmediate(cb);
    },
  };
  const res = mockRes();
  handleReport(req, res);
  // readBody 的 end 回调经 setImmediate 异步执行,等一轮事件循环再读 res
  if (res.code === undefined) await new Promise((r) => setImmediate(r));
  return { code: res.code, body: res.body };
}
const entry = (over) => ({ type: 'js', message: 'Boom: probe', source: 'main-1.js:1', ...over });

describe('client-errors 上报', () => {
  it('单条上报 → accepted=1;同 message+source 重复上报合并计数(不再新增条目)', async () => {
    // 先清空,保证本用例从已知状态开始
    handleAdminErrorsClear({ headers: {} }, mockRes(), { token: 'vitest-token-abc' });
    const r1 = await report(entry());
    expect(r1.code).toBe(200);
    expect(r1.body.accepted).toBe(1);
    const r2 = await report(entry({ url: 'https://cloudbear.cloud/' }));
    expect(r2.body.accepted).toBe(1);
    const view = adminView();
    const mine = view.list.filter((e) => e.message === 'Boom: probe');
    expect(mine).toHaveLength(1); // 合并为一条
    expect(mine[0].count).toBe(2); // 计数累加
  });

  it('批量上报超 20 条截断(accepted 只算前 20)', async () => {
    const items = Array.from({ length: 30 }, (_, i) => entry({ message: 'Batch ' + i }));
    const r = await report({ items });
    expect(r.body.ok).toBe(true);
    expect(r.body.accepted).toBe(20);
  });

  it('限流:单 IP 每分钟 30 条,超过返回 429(防死循环报错打满磁盘)', async () => {
    const ip = '10.9.9.9';
    let last;
    for (let i = 0; i < 31; i++) {
      last = await report(entry({ message: 'Rate probe ' + i }), ip);
      if (last.code === 429) break;
    }
    expect(last.code).toBe(429);
  });

  it('后台列表:token 鉴权 + total/unique/recent24/byType 统计结构', () => {
    const res401 = mockRes();
    handleAdminErrors({ headers: {} }, res401, {});
    expect(res401.code).toBe(401);
    const view = adminView();
    expect(view).toHaveProperty('total');
    expect(view).toHaveProperty('unique');
    expect(view).toHaveProperty('byType');
    expect(view.total).toBeGreaterThanOrEqual(view.unique);
  });
});

function adminView() {
  const res = mockRes();
  handleAdminErrors({ headers: {} }, res, { token: 'vitest-token-abc' });
  return res.body;
}
