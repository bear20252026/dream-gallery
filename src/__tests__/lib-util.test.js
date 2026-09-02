// lib/util.js 单元测试(2026-09-02 补覆盖:路由拆分配套)
// 覆盖:safeJoin 路径穿越、isValidName 文件名校验、getCookies、readBody 解析与限额、sendJson
import { describe, it, expect } from 'vitest';
import path from 'node:path';

const { safeJoin, isValidName, getCookies, readBody, sendJson } = await import('../../lib/util.js');
const { ROOT } = await import('../../lib/config.js');

describe('safeJoin(路径穿越防护)', () => {
  it('正常相对路径返回 ROOT 下的绝对路径', () => {
    const p = safeJoin('photos/a.jpg');
    expect(p).toBe(path.join(ROOT, 'photos', 'a.jpg'));
  });

  it('嵌套子目录正常', () => {
    expect(safeJoin('photos/thumbs/x.jpg')).not.toBeNull();
  });

  it('../ 穿越被拒绝(null)', () => {
    expect(safeJoin('../etc/passwd')).toBeNull();
    expect(safeJoin('../../etc/passwd')).toBeNull();
    expect(safeJoin('photos/../../secret')).toBeNull();
  });

  it('绝对路径拼接后不会逃出 ROOT(不穿越,仅产生无效路径)', () => {
    const p1 = safeJoin('C:/Windows/system32');
    if (p1 !== null) expect(p1.startsWith(ROOT + path.sep) || p1 === ROOT).toBe(true);
    const p2 = safeJoin('/etc/passwd');
    if (p2 !== null) expect(p2.startsWith(ROOT + path.sep) || p2 === ROOT).toBe(true);
  });

  it('前缀相似目录不绕过(/opt/gallery-evil 技巧,2026-07-28 审计案例;真实攻击面是 ../ 相对路径)', () => {
    const evil = '../' + path.basename(ROOT) + '-evil/x';
    expect(safeJoin(evil)).toBeNull();
  });

  it('ROOT 本身允许(空路径)', () => {
    expect(safeJoin('')).toBe(ROOT);
    expect(safeJoin('.')).toBe(ROOT);
  });
});

describe('isValidName(文件名校验)', () => {
  it.each([
    ['a.jpg', true],
    ['whiteboard-abc-1.png', true],
    ['中文 文件.mp4', true],
  ])('合法名 %s → %s', (n, ok) => expect(isValidName(n)).toBe(ok));

  it.each([
    ['', false],
    [null, false],
    [undefined, false],
    ['.', false],
    ['..', false],
    ['a/b.jpg', false],
    ['a\\b.jpg', false],
    ['..\\evil', false],
  ])('非法名 %s → false', (n, ok) => expect(isValidName(n)).toBe(ok));
});

describe('getCookies', () => {
  it('解析普通 cookie', () => {
    expect(getCookies({ headers: { cookie: 'a=1; b=2' } })).toEqual({ a: '1', b: '2' });
  });
  it('值里带等号不截断', () => {
    expect(getCookies({ headers: { cookie: 'vid=abc=def; x=y' } })).toEqual({
      vid: 'abc=def',
      x: 'y',
    });
  });
  it('无 cookie 头返回空对象', () => {
    expect(getCookies({ headers: {} })).toEqual({});
  });
});

describe('readBody', () => {
  function mockReq(chunks) {
    return {
      on(ev, cb) {
        if (ev === 'data') chunks.forEach(cb);
        if (ev === 'end') setImmediate(cb);
      },
      destroyed: false,
      destroy() {
        this.destroyed = true;
      },
    };
  }

  it('合法 JSON 传对象给回调', async () => {
    const out = await new Promise((r) => readBody(mockReq(['{"a":', '1}']), r));
    expect(out).toEqual({ a: 1 });
  });

  it('非法 JSON 回落空对象(不抛错)', async () => {
    const out = await new Promise((r) => readBody(mockReq(['not json']), r));
    expect(out).toEqual({});
  });

  it('空 body 回落空对象', async () => {
    const out = await new Promise((r) => readBody(mockReq(['']), r));
    expect(out).toEqual({});
  });

  it('超限触发 req.destroy() 防炸内存', () => {
    const req = mockReq(['x'.repeat(100), 'x'.repeat(100)]);
    readBody(req, () => {}, 64);
    expect(req.destroyed).toBe(true);
  });
});

describe('sendJson', () => {
  it('写 JSON 头与体,带安全头', () => {
    const headers = {};
    const res = {
      setHeader: (k, v) => {
        headers[k] = v;
      },
      writeHead(code, h) {
        this.code = code;
        Object.assign(headers, h);
      },
      end(b) {
        this.body = b;
      },
    };
    sendJson(res, 401, { error: 'x' });
    expect(res.code).toBe(401);
    expect(res.body).toBe('{"error":"x"}');
    expect(headers['Content-Type']).toContain('application/json');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Cache-Control']).toContain('no-store');
  });
});
