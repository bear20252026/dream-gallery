// ===================== 媒体即时刷新推送客户端(2026-08-29) =====================
// 需求:后台/访客上传删除文件后,游戏端"当即立即"刷新(不等 45-60s 轮询)。
// 实现:监听服务端 /api/media/sse(SSE 长连接),服务端在文件变更时主动广播 media_changed,
//       各系统通过 onMediaChanged(cb) 注册回调(音乐列表/晨光留影/新媒体墙),收到即刷新。
// 单例:EventSource 只建一个,所有注册方共享;失败自动重连(浏览器原生)。
const listeners = new Set();
let es = null;

export function onMediaChanged(cb) {
  listeners.add(cb);
  ensure();
}

function ensure() {
  if (es) return;
  try {
    es = new EventSource('/api/media/sse');
    es.onmessage = function (ev) {
      try {
        const d = JSON.parse(ev.data || '{}');
        if (d.type !== 'media_changed') return;
        for (const cb of listeners) {
          try { cb(d); } catch (e) {}
        }
      } catch (e) {}
    };
    es.onerror = function () { /* 浏览器自动重连 */ };
  } catch (e) {}
}
