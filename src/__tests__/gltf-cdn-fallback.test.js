// gltf-cdn-fallback.test.js — CDN 失联时"每一个在途请求都要拿到自己的源站重试"(2026-10-17 审计 C3)
//
// 现场(回读 lib:src/scene/gltf-loader.js:64-76 旧形状):重试绑在 `!window.__modelCdnDown` 上,
// 也就是**只有把旗从 false 翻成 true 的那一次失败**才重试。而开机是一批模型并发飞的:
// 第一个失败者立旗并重试成功,**其余同时在途的请求**失败时旗已经是 true ⇒ 直接落进调用方的 onError,
// 而全站模型加载点的 onError 基本只 console.warn(planets.js:194/525/551、dome-towers.js:69、
// fountains.js:284、crash-site.js:214、scene.js:588)⇒ 一轮 CDN 抖动 = 当轮绝大多数模型静默缺席,
// 而且重载还复现(旗随刷新重置,THREE.Cache 又没开)。
//
// 本文件把"旗"与"这次请求要不要重试"这两件事分开验,四件事各自可失败:
//  ① 并发 N 个 CDN 请求全失败 ⇒ 必须出现 N 次源站重试(旧写法只会出现在第 1 次);
//  ② 这些请求最终都 onLoad 成功(= 没有静默缺席);
//  ③ 源站也失败时,onError 每个 URL 恰好一次(不许自己转圈重试);
//  ④ 旗立起来之后**新建**的请求直接走源站,失败时不再重试(它本来就没经过 CDN)。
// 只用 fake 替身顶掉 GLTFLoader(网络边界),LoadingManager 与 URL 改写用的是**真 three 的实现** ——
// resolveURL 每次重新求值这件事不能由我的桩来保证,否则测的是桩。
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  const calls = [];
  const done = { ok: 0, err: 0 };
  let mode = 'cdnFails'; // cdnFails:绝对地址一律失败,相对地址成功 | allFails:一律失败
  class FakeGLTFLoader {
    constructor(manager) {
      this.manager = manager;
    }
    setMeshoptDecoder() {
      return this;
    }
    setKTX2Loader() {
      return this;
    }
    load(url, onLoad, onProgress, onError) {
      calls.push(url);
      const viaAbsolute = /^https?:\/\//.test(url);
      const shouldFail = mode === 'allFails' || (mode === 'cdnFails' && viaAbsolute);
      setTimeout(() => {
        if (shouldFail) {
          done.err++;
          if (onError) onError(new Error('stub: ' + url));
        } else {
          done.ok++;
          if (onLoad) onLoad({ scene: 'stub' });
        }
      }, 0);
    }
  }
  return {
    calls,
    done,
    FakeGLTFLoader,
    setMode: (m) => (mode = m),
    reset: () => ((calls.length = 0), (done.ok = 0), (done.err = 0)),
  };
});

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({ GLTFLoader: h.FakeGLTFLoader }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ⚠️固定 25ms 会**先于「重试链的下一跳」到期**:桩里每一跳各是一个 setTimeout(0),
//    CDN 失败 → 源站重试就是两跳,再叠上并发用例抢 CPU ⇒ loaded<3 / surfaced>0 变红而产品没错。
//    所以主读数一律等**事件终态**;cap 只是防卡死,不构成通过(终态没到 ⇒ 后面的断言照样红)。
async function until(cond, cap = 4000) {
  const t0 = Date.now();
  while (!cond() && Date.now() - t0 < cap) await sleep(10);
}

// 终态之后再多等一拍:任何「多送的一次」(③ 的第三次调用、② 的重复 onLoad)都要算进账
const tail = () => sleep(250);

async function freshLoader() {
  // 被测模块在**模块作用域**算 IS_LOCAL 并读 window ⇒ globals 必须在 import 之前装好
  globalThis.window = {};
  globalThis.location = { hostname: 'cloudbear.cloud' };
  vi.resetModules();
  const mod = await import('../scene/gltf-loader.js');
  h.reset();
  return mod.createGLTFLoader();
}

describe('CDN 失联的回退半边', () => {
  beforeEach(() => {
    h.setMode('cdnFails');
  });

  it('① 并发三个模型全从 CDN 失败 ⇒ 每个都拿到自己的源站重试(旧写法只有第一个)', async () => {
    const loader = await freshLoader();
    const urls = ['/models/hall/a.glb', '/models/hall/b.glb', '/models/b612/c.glb'];
    for (const u of urls)
      loader.load(
        u,
        () => {},
        undefined,
        () => {}
      );
    await until(() => h.calls.filter((u) => u.startsWith('/models/')).length === 3);
    await tail();
    const cdn = h.calls.filter((u) => /^https:\/\//.test(u));
    const origin = h.calls.filter((u) => u.startsWith('/models/'));
    expect(cdn.length, '第一轮该有三次经 CDN 的请求').toBe(3);
    expect(origin.length, '每个失败请求都该有一次源站重试(旧形状只会重试第一条)').toBe(3);
    for (const u of urls) expect(origin, '缺了对 ' + u + ' 的源站重试').toContain(u);
  });

  it('② 重试成功后没有一个请求被静默判死(onLoad 三次都到)', async () => {
    const loader = await freshLoader();
    let loaded = 0;
    let surfaced = 0;
    for (const u of ['/models/hall/a.glb', '/models/hall/b.glb', '/models/hall/c.glb'])
      loader.load(
        u,
        () => loaded++,
        undefined,
        () => surfaced++
      );
    await until(() => loaded === 3 || surfaced > 0);
    await tail();
    expect(loaded, '三个模型都该最终加载成功').toBe(3);
    // 判据只数**交给调用方的那一次**(不是桩内部"这一跳失败了几次":CDN 那一跳本来就注定失败)
    expect(
      surfaced,
      'CDN 那一跳的失败应当被重试接住,不该转交给调用方(旧形状就是在这里静默判死)'
    ).toBe(0);
  });

  it('③ 源站也失败时:每个 URL 恰好一次 onError,不许转圈重试', async () => {
    h.setMode('allFails');
    const loader = await freshLoader();
    const errs = {};
    ['a', 'b'].forEach((k) => {
      errs[k] = 0;
      loader.load(
        '/models/hall/' + k + '.glb',
        () => {},
        undefined,
        () => errs[k]++
      );
    });
    await until(() => errs.a === 1 && errs.b === 1);
    await tail();
    expect(errs.a).toBe(1);
    expect(errs.b).toBe(1);
    // 每个 URL:1 次 CDN + 1 次源站 = 2 次调用,没有第三次
    expect(h.calls.length, JSON.stringify(h.calls)).toBe(4);
    expect(h.calls.filter((u) => u === '/models/hall/a.glb').length).toBe(1);
  });

  it('④ 旗立起后新建的请求直接走源站,失败时不再重试(它没经过 CDN)', async () => {
    const loader = await freshLoader();
    h.setMode('allFails');
    loader.load(
      '/models/hall/first.glb',
      () => {},
      undefined,
      () => {}
    );
    await until(() => globalThis.window.__modelCdnDown === true);
    await tail();
    expect(globalThis.window.__modelCdnDown, '第一条失败必须立旗(此后新请求直接源站)').toBe(true);
    const before = h.calls.length;
    let e = 0;
    loader.load(
      '/models/hall/second.glb',
      () => {},
      undefined,
      () => e++
    );
    await until(() => e === 1);
    await tail();
    const added = h.calls.slice(before);
    expect(added.length, '旗立起后的新请求只该有一次调用(源站直连,失败就交给调用方)').toBe(1);
    expect(added[0]).toBe('/models/hall/second.glb');
    expect(e).toBe(1);
  });
});
