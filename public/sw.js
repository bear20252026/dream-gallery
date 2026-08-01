// sw.js — Service Worker(2026-07-25):静态资源 SWR + 媒体缓存优先 + 媒体 LRU 上限
// API 只走网络;开发环境(localhost/5173)不注册(见 index.html 注册处)
const VER = 'gallery-v11'; // 2026-08-01 资深重构:统一相机/角色单一 owner + 消除双循环双重执行
const MEDIA_CAP = 80; // 媒体缓存最多 80 个(超出逐出最旧)

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => c.add('/')).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VER).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isMedia(url) {
  return /^\/(photos|videos|music)\//.test(url.pathname);
}
async function mediaLRU(cache) {
  const keys = await cache.keys();
  if (keys.length > MEDIA_CAP) {
    // 逐出最旧的 20%
    const n = Math.ceil(keys.length * 0.2);
    for (let i = 0; i < n; i++) await cache.delete(keys[i]);
  }
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // API 只走网络
  // 协议/法律文本(用户协议/隐私指引/说明书)永不缓存,永远取最新(2026-07-26)
  if (/\/(agreement|privacy|guide)\.html$/.test(url.pathname)) return;
  // Range 请求(视频/音频拖放与起播)不拦截直接走网络:
  // Cache API 不允许存 206 响应,cache.put 会抛异常导致 respondWith 拒绝 → 视频全部加载失败
  if (e.request.headers.has('range')) return;

  // 媒体:缓存优先,后台补缓存(弱网/回头客秒开)
  if (isMedia(url)) {
    e.respondWith(
      caches.open(VER).then(async cache => {
        const hit = await cache.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok) {
          await cache.put(e.request, res.clone());
          mediaLRU(cache);
        }
        return res;
      })
    );
    return;
  }

  // HTML 页面(含协议页):网络优先,离线才回退缓存——否则协议锁/新功能会被旧 HTML 架空(2026-07-26 血泪)
  const isHtml = url.pathname === '/' || url.pathname.endsWith('.html');
  if (isHtml) {
    e.respondWith(
      caches.open(VER).then(async cache => {
        try {
          const res = await fetch(e.request);
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        } catch (err) {
          const hit = await cache.match(e.request);
          if (hit) return hit;
          throw err;
        }
      })
    );
    return;
  }

  // 其余(js/css/json):stale-while-revalidate
  e.respondWith(
    caches.open(VER).then(async cache => {
      const hit = await cache.match(e.request);
      const fetchP = fetch(e.request).then(res => {
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      }).catch(() => hit);
      return hit || fetchP;
    })
  );
});
