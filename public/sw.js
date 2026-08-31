// sw.js — Service Worker(2026-07-25):静态资源 SWR + 媒体缓存优先 + 媒体 LRU 上限
// API 只走网络;开发环境(localhost/5173)不注册(见 index.html 注册处)
const VER = 'gallery-v12'; // 2026-08-31 媒体缓存策略修正:网络优先 + 只缓存公开媒体。升版以清除 v11 遗留的全部旧媒体缓存
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

  // 媒体:网络优先,离线才回退缓存(2026-08-31 安全修正)
  //   ⚠️ 旧策略「缓存优先」会绕过服务端权限校验:canServeMedia 只在网络请求时执行,
  //      SW 一旦命中缓存就直接返回,服务器已删除/已撤权的照片仍从本机缓存继续显示
  //      —— 这就是 2026-08-31 用户看到"后台没有的陌生照片"的真凶。
  //   新策略:①在线一律回源,让服务端可见性规则真正生效
  //          ②只缓存响应头标记为公开的媒体(demo 示例/白板/户外大屏,
  //            Cache-Control 不含 private/no-store);本人上传与他人不可见的私密媒体不落盘
  //          ③离线时仍可用已缓存的公开媒体兜底,不影响弱网体验
  if (isMedia(url)) {
    e.respondWith(
      caches.open(VER).then(async cache => {
        try {
          const res = await fetch(e.request);
          if (res.ok) {
            const cc = (res.headers.get('cache-control') || '').toLowerCase();
            // 私密媒体(private/no-store)= 本人上传或未授权内容,绝不缓存,避免在本机留副本
            if (!/private|no-store/.test(cc)) {
              await cache.put(e.request, res.clone());
              mediaLRU(cache);
            }
          }
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
