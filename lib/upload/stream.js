// stream.js — "把 req 安全落到一个已打开的写流"的唯一实现(2026-10-12 审计挂账 R2 第一步)
//
// 审计点名的"形态复制":直传 / 白板 / 分片 / 户外大屏四条上传入口原先各写一遍同样的四件套
// (2026-10-11 分批补上的)——① Content-Length 预检 ② 流式字节计数 ③ 超限即刻 destroy
// ④ 任何失败路径 unlink 半成品。这里收成一处,四条路共用,**判定结论与各站响应文案仍由调用方定**
// (错误码、文案、是否检查 writableEnded 都是外部契约,不许被抽取顺手"统一"掉)。
//
// 本模块保证的顺序(与改造前逐条对齐):
//   计数:data 事件累加,越过 maxBytes 且此前未判超 ⇒ 中止一次(不重复)
//   中止:ws.destroy() → fs.unlink(半成品) → release() → onAbort()(调用方清自己那笔账)
//         → respond(code, message) → req.destroy()
//   完成:超限则直接 return;否则 release() 一次后调用 onFinish()
//   写错:先 release()(与改造前公开/白板分支一致:即便已超限也还位,还位幂等),再调用 onError()
//   断连:disconnect=true 时 req 的 aborted/close 也接 release()(匿名两条路的"结束路径还位")
const fs = require('fs');

// ① Content-Length 预检用的读数:没有/畸形/非正一律按 0(= 没声明),与原各处 parseInt 口径等价
function contentLength(req) {
  let n = 0;
  try { n = parseInt((req && req.headers ? req.headers['content-length'] : '') || '0', 10); } catch (e) { n = 0; }
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function overContentLength(req, maxBytes) {
  return contentLength(req) > maxBytes;
}

// ②③④ 流式守护:req 已 attach 过任何监听之前调用本函数,监听注册顺序保持 data→aborted→close→pipe
function guard(req, ws, opts) {
  const maxBytes = Number(opts.maxBytes) > 0 ? Number(opts.maxBytes) : 0;
  const filePath = opts.filePath;
  let bytes = 0;
  let over = false;

  const release = () => {
    if (typeof opts.release !== 'function') return;
    try { opts.release(); } catch (e) {}
  };

  const state = {
    bytes: () => bytes,
    over: () => over,
    // 超限/体积闸拒:一个字节都不许多留 —— 半成品必删、在途账必还、响应必回、连接必断
    abort: (code, message) => {
      if (over) return;
      over = true;
      try { ws.destroy(); } catch (e) {}
      fs.unlink(filePath, (err) => {
        if (err && err.code !== 'ENOENT' && typeof opts.onUnlinkError === 'function') {
          try { opts.onUnlinkError(err, message); } catch (e2) {}
        }
      });
      release();
      if (typeof opts.onAbort === 'function') {
        try { opts.onAbort(state); } catch (e) {}
      }
      if (typeof opts.respond === 'function') opts.respond(code, message);
      try { req.destroy(); } catch (e) {}
    },
  };

  req.on('data', (chunk) => {
    bytes += chunk.length;
    if (maxBytes > 0 && bytes > maxBytes && !over) {
      const o = opts.overflow || { code: 413, message: '文件超过上限' };
      state.abort(o.code, o.message);
    }
  });
  // 客户端断连也是"结束路径":还位在账(幂等,漏掉则由 abuse.js 的 5 分钟兜底闸回收)
  if (opts.disconnect) {
    req.on('aborted', release);
    req.on('close', release);
  }
  req.pipe(ws);

  ws.on('finish', () => {
    if (over) return;
    release();
    if (opts.onFinish) opts.onFinish(state);
  });
  ws.on('error', (err) => {
    release();
    if (opts.onError) opts.onError(state, err);
  });
  return state;
}

module.exports = { contentLength, overContentLength, guard };
