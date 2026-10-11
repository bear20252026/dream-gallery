// sw.js — Service Worker(2026-07-25):静态资源 SWR + 媒体缓存优先 + 媒体 LRU 上限
// API 只走网络;开发环境(localhost/5173)不注册(见 index.html 注册处)
const VER = 'gallery-v15'; // 2026-10-11 必须升版清旧池:v14 的「/admin 绕过」漏判 /admin-media(见下),
//   含 ?token= 的整请求 URL 已被当静态资源写进 v14 缓存池;不改名旧条目会永久留在磁盘上
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
// 后台路径判定(写成路径规则,不靠单条正则的边界):/admin、/admin/ 子页(docs)、/admin-media/ 缩略图与预览
// 2026-10-11 修:旧判定 /^\/admin(\/|$)/ 抓不到 /admin-media(- 既不是 / 也不是串尾),
//   后台缩略图 URL 直落底部 catch-all SWR,连 ?token= 一起被持久化进 Cache Storage
function isAdminPath(pathname) {
  return (
    pathname === '/admin' ||
    pathname === '/admin-media' ||
    pathname.startsWith('/admin/') ||
    pathname.startsWith('/admin-media/')
  );
}
// 凭据/令牌型查询串一律不拦截、不落盘(通用原则,不只后台):URL 本身就是凭据就不许进缓存
function hasCredential(url) {
  return url.searchParams.has('token') || url.searchParams.has('mt') || url.searchParams.has('sig');
}
// 唯一缓存准入闸(三段分流共用,防三处漂移):非 2xx / 服务端说不缓存 / 视频 / 超大文件一律不落盘
// ⚠️ 含 no-cache 是刻意收紧:本站 html/js/公开媒体全是 no-cache,过去被 SW 私存副本 = 服务端
//    「每次回源校验」的语义被架空(2026-09-25 旧 admin.html 血泪的同一条根)。代价:离线兜底只剩
//    immutable 哈希资产;要不要给公开媒体开 no-cache 例外,属主人拍板项。
function canCacheResponse(res) {
  if (!res.ok) return false;
  const cc = (res.headers.get('cache-control') || '').toLowerCase();
  if (/private|no-store|no-cache/.test(cc)) return false;
  const ctype = res.headers.get('content-type') || '';
  if (ctype.startsWith('video/')) return false;
  if (parseInt(res.headers.get('content-length') || '0', 10) > 8 * 1024 * 1024) return false;
  return true;
}
// 把落盘任务挂回事件生命周期:裸发即忘时 SW 可能在 cache.put 写完前被回收(2026-10-11)
// 用法:const arm = keepWriting(e); ... arm(cache.put(...)) —— arm 必须每条路径都调用一次,否则事件永挂
function keepWriting(e) {
  let arm;
  const gate = new Promise((resolve) => (arm = resolve));
  e.waitUntil(gate.then((job) => job));
  return (job) => arm(job ? Promise.resolve(job).catch(() => {}) : true);
}
async function mediaLRU(cache) {
  // 2026-09-20 审计 M2:只计量/只逐出媒体条目——js/css/html 与媒体共池时会互相挤占
  const keys = (await cache.keys()).filter(k => isMedia(new URL(k.url)));
  if (keys.length > MEDIA_CAP) {
    // 逐出最旧的 20%(近似 LRU:Cache keys 顺序≈插入序)
    const n = Math.ceil(keys.length * 0.2);
    for (let i = 0; i < n; i++) await cache.delete(keys[i]);
  }
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // API 只走网络
  // 后台页与后台媒体一律绕过 SW(2026-09-25 血泪 + 2026-10-11 补 /admin-media 漏判):
  //   ① isHtml 只认 '/' 与 *.html,/admin 被当静态资源走 SWR → 后台更新后主人首屏
  //      仍是 SW 缓存里的旧 admin.html(「报错反馈 文件不存在」久修不愈的真凶);
  //   ② 后台 URL 可能带凭据,一律不落盘(旧注释写着「/admin-media 整个绕过」但从未生效)
  if (hasCredential(url)) return; // 带 token/mt/sig 的请求:不拦截、不写缓存
  if (isAdminPath(url.pathname)) return;
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
  //          ②落盘与否一律由 canCacheResponse 裁决(私密媒体 private/no-store 永不落盘,
  //            视频与超大文件不占 LRU)
  //          ③离线时仍可用已缓存的公开媒体兜底,不影响弱网体验
  if (isMedia(url)) {
    const arm = keepWriting(e);
    e.respondWith(
      caches.open(VER)
        .then(async cache => {
          try {
            const res = await fetch(e.request);
            if (canCacheResponse(res)) arm(cache.put(e.request, res.clone()).then(() => mediaLRU(cache)));
            else arm();
            return res;
          } catch (err) {
            arm();
            const hit = await cache.match(e.request);
            if (hit) return hit;
            throw err;
          }
        })
        .catch((err) => { arm(); throw err; }) // caches.open 失败也要放行 waitUntil,不许永挂
    );
    return;
  }

  // HTML 页面(含协议页):网络优先,离线才回退缓存——否则协议锁/新功能会被旧 HTML 架空(2026-07-26 血泪)
  //   2026-09-25 补:凡文档导航(mode==='navigate')一律按 HTML 网络优先——/admin 这类
  //   不带 .html 的美化路径此前漏判,被下面 SWR 当静态缓存,后台更新后首屏仍是旧代码
  const isHtml =
    e.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html');
  if (isHtml) {
    const arm = keepWriting(e);
    e.respondWith(
      caches.open(VER)
        .then(async cache => {
          try {
            const res = await fetch(e.request);
            if (canCacheResponse(res)) arm(cache.put(e.request, res.clone()));
            else arm();
            return res;
          } catch (err) {
            arm();
            const hit = await cache.match(e.request);
            if (hit) return hit;
            throw err;
          }
        })
        .catch((err) => { arm(); throw err; })
    );
    return;
  }

  // 其余(js/css/json):stale-while-revalidate(哈希产物 immutable,才进得了缓存闸)
  const arm = keepWriting(e);
  e.respondWith(
    caches.open(VER)
      .then(async cache => {
        const hit = await cache.match(e.request);
        const fetchP = fetch(e.request).then(res => {
          if (canCacheResponse(res)) arm(cache.put(e.request, res.clone()));
          else arm();
          return res;
        }).catch(err => {
          arm();
          return hit || Promise.reject(err);
        });
        return hit || fetchP;
      })
      .catch((err) => { arm(); throw err; })
  );
});
