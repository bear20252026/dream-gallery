// ===================== 媒体变更即时推送(SSE, 2026-08-29) =====================
// 需求:后台/访客上传、删除文件后,游戏端"当即立即"刷新(不等待 45-60s 轮询)。
// 实现:游戏页持有 GET /api/media/sse 长连接;files.js 在增删成功后调 mediaBroadcast()
//       广播 media_changed(含 dir/name),游戏端 src/media-push.js 收到即触发对应刷新。
// 鉴权:仅推送"媒体变更"这类低敏信号,与 /api/gate/watch 一样不设 token(公开轻量)。
const mediaClients = new Set(); // Set<res> — 所有在线游戏页的长连接

function mediaSseRegister(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write(':ok\n\n');
  mediaClients.add(res);
  const hb = setInterval(() => { try { res.write(':hb\n\n'); } catch (e) {} }, 25000);
  req.on('close', () => { clearInterval(hb); mediaClients.delete(res); });
}

// payload: { dir: 'photos'|'videos'|'music', name: 'x.jpg' }
function mediaBroadcast(payload) {
  const data = JSON.stringify({ type: 'media_changed', ...payload, t: Date.now() });
  for (const res of mediaClients) {
    try { res.write(`data: ${data}\n\n`); } catch (e) { mediaClients.delete(res); }
  }
}

module.exports = { mediaSseRegister, mediaBroadcast };
