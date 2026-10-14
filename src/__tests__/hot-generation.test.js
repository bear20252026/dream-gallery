// hot-generation.test.js — HMR 捕获路径的**代次守卫**(2026-10-14 第六轮审计 M-14 的那一半)
// 审计原文指"bag.async 执行前不校验代次";回读代码后实情是:
//   · `bag.register` 早就有守卫(hot.js:不在任就当场摘除释放)——**这条已对**;
//   · 但 `installCaptures` 里给 s.add / appendChild / onTick 打的补丁**没有**守卫 ⇒ 模块被热替换后,
//     迟到的异步回调(fetch/GLTF/setTimeout)仍会把那个**已 dispose 的旧 bag** 的补丁装回去,
//     回调期间创建的对象落进 `bag.objs`(dispose 时已 length=0,之后再没人读)= 留在场景里永不释放。
//   · 影响面只有开发期 HMR(生产不二次装配),所以这不是线上事故,而是"捕获机制的第二个洞"。
// 本文件的判据是**行为**而不是引用比较:uninstall 之后 s.add 是 bind 过的副本,拿身份比会假红。
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const { ctxStub } = vi.hoisted(() => {
  const objs = [];
  const removed = [];
  const tickers = [];
  const ctxStub = {
    scene: {
      s: {
        add(o) {
          objs.push(o);
          return o;
        },
        remove(o) {
          removed.push(o);
          const i = objs.indexOf(o);
          if (i >= 0) objs.splice(i, 1);
        },
      },
    },
    objs,
    removed,
    tickers,
    onTick(fn) {
      tickers.push(fn);
      return fn;
    },
  };
  return { ctxStub };
});
vi.mock('../ctx.js', () => ({ ctx: ctxStub }));

let hot;
let rawWindow;
let rawDocument;

beforeAll(async () => {
  // hot.js 在 import 时就要 window(它把登记表挂在 window.__HMR__ 上),所以全局桩必须先装再 import
  rawWindow = globalThis.window;
  rawDocument = globalThis.document;
  globalThis.window = {
    setInterval: (fn, t, ...a) => setTimeout(fn, t, ...a),
    clearInterval: (id) => clearInterval(id),
  };
  globalThis.document = {
    body: {
      dataset: {},
      appendChild(el) {
        el.__appended = (el.__appended || 0) + 1;
        return el;
      },
    },
  };
  hot = await import('../hot.js');
});

afterAll(() => {
  if (rawWindow === undefined) delete globalThis.window;
  else globalThis.window = rawWindow;
  if (rawDocument === undefined) delete globalThis.document;
  else globalThis.document = rawDocument;
});

describe('捕获路径的代次守卫', () => {
  it('基线(前置条件):本轮存活期间一直捕获,hotEnd 之后才停', () => {
    const bag = hot.hotBegin('gen-baseline');
    const obj = { name: 'in-async-callback' };
    bag.async(() => {
      ctxStub.scene.s.add(obj);
    })();
    expect(bag.objs).toContain(obj); // 守卫没把正常路径一起关掉
    const during = { name: 'while-live' };
    ctxStub.scene.s.add(during);
    expect(bag.objs).toContain(during); // hotBegin 的捕获在本轮存活期间持续有效(hotEnd 才卸)
    hot.hotEnd('gen-baseline');
    const after = { name: 'after-hotend' };
    ctxStub.scene.s.add(after);
    expect(bag.objs).not.toContain(after); // 卸载后不再捕获,否则一个模块能无限收对象
  });

  it('热替换之后,迟到的 async 回调:不落死 bag,交给现任世代释放', () => {
    const oldBag = hot.hotBegin('gen-late'); // 上一世代
    hot.hotEnd('gen-late');
    const newBag = hot.hotBegin('gen-late'); // 同一模块的第二世代(现任)

    const late = { name: 'late-from-old-generation' };
    oldBag.async(() => {
      ctxStub.scene.s.add(late);
    })();

    expect(oldBag.objs).not.toContain(late); // 旧 bag 已 dispose,落进它里面 = 永不释放
    expect(newBag.objs).toContain(late); // 现任包着 ⇒ 归现任释放(不装也就不卸,不能把现任摘掉)
    hot.hotEnd('gen-late');
  });

  it('迟到的回调不许把现任世代的捕获摘走(不装就不卸)', () => {
    const b1 = hot.hotBegin('gen-clobber');
    hot.hotEnd('gen-clobber');
    const b2 = hot.hotBegin('gen-clobber');
    b1.async(() => {})(); // 空回调:只走 install/uninstall 一趟,检验卸载有没有伤到现任
    const obj = { name: 'still-captured' };
    ctxStub.scene.s.add(obj);
    expect(b2.objs).toContain(obj); // 若迟到的 finally 把 _prevAdd(记的是 b2 的包装)赋回去,这里就漏捕获
    hot.hotEnd('gen-clobber');
  });

  it('bag.register 的晚到摘除与捕获路径共用同一个代次判据(M-10:同一规则不留两份实现)', () => {
    const b1 = hot.hotBegin('gen-register');
    hot.hotEnd('gen-register');
    const b2 = hot.hotBegin('gen-register');
    const lateObj = { name: 'late-register' };
    b1.register(lateObj, { scene: ctxStub.scene.s });
    expect(b1.tracked).toHaveLength(0); // 不进旧 bag
    expect(ctxStub.removed).toContain(lateObj); // 当场从所属场景摘除
    expect(b2.tracked).toHaveLength(0); // 也不冒充现任的资源(register 只登记不 add)
    hot.hotEnd('gen-register');
  });

  it('DOM 捕获同样受守卫约束:迟到的 appendChild 不给死 bag', () => {
    const b1 = hot.hotBegin('gen-dom');
    hot.hotEnd('gen-dom');
    const b2 = hot.hotBegin('gen-dom');
    const el = { name: 'late-el', remove() {} };
    b1.async(() => {
      document.body.appendChild(el);
    })();
    expect(b1.doms).not.toContain(el);
    expect(b2.doms).toContain(el);
    hot.hotEnd('gen-dom');
  });

  // 这一条是写基线测试时**撞出来的真缺陷**(比审计说的 M-14 更糟):旧实现用 bag._prevAdd 等四个单槽
  // 记"装之前是什么",bag.async 进出会再压一层并把单槽置 null ⇒ hotEnd 时 `if (bag._prevAdd)` 已是假,
  // 外层那层补丁**永远卸不掉**:每次热更都在 s.add/appendChild/onTick 上留一层壳,壳还会越叠越厚。
  it('hotEnd 必须把补丁卸干净(async 进两层出两层之后仍然卸得掉)', () => {
    const b = hot.hotBegin('gen-stack');
    b.async(() => {
      ctxStub.scene.s.add({ name: 'inside-async' });
    })();
    expect(b._captureStack).toHaveLength(1); // 只剩 hotBegin 那一层
    hot.hotEnd('gen-stack');
    expect(b._captureStack).toHaveLength(0); // 卸干净了

    const orphan = { name: 'nobody-owns-me' };
    ctxStub.scene.s.add(orphan);
    expect(b.objs).not.toContain(orphan); // 死掉的上一世代不许继续收对象

    const other = hot.hotBegin('gen-stack-next');
    ctxStub.scene.s.add(orphan);
    expect(other.objs).toContain(orphan); // 现任世代接得住 ⇒ 说明还原落到了真身,不是落在一层空壳上
    expect(b.objs).not.toContain(orphan);
    hot.hotEnd('gen-stack-next');
    ctxStub.scene.s.add({ name: 'free' });
    expect(other.objs).toHaveLength(1); // 两层壳叠过之后仍然只有那一个
  });
});
