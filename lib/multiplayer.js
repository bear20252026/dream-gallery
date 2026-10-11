// lib/multiplayer.js
// 大厅+房间多人同步(轻量 ws 实现,替代 Colyseus 以降低线上依赖风险)
// 设计:单人大地图保持原样,本模块只负责「小房间」——3-4 人实时走动/聊天/表情
//
// 客户端 -> 服务端(JSON):
//   {t:'join', code, name}   加入/创建房间(code 为 4-6 位字母数字)
//   {t:'move', x,y,z,ry}     上报本地玩家位置/朝向(约 12Hz)
//   {t:'chat', text}          房间内文字聊天
//   {t:'emote', e}           表情:e ∈ wave|point|sit
//   {t:'leave'}              离开
// 服务端 -> 客户端(JSON):
//   {t:'welcome', id, color, players:[...]}  加入成功,下发已有玩家
//   {t:'join', id,name,color,x,y,z,ry}       有新人进房
//   {t:'move', id,x,y,z,ry}                  他人移动
//   {t:'chat', id,name,text}                 他人聊天
//   {t:'emote', id,e}                        他人表情
//   {t:'leave', id}                          有人离开
//   {t:'full'}                               房间已满
//   {t:'err', msg}                           错误
//
// ⚠️ 安全边界(2026-10-11 DG-RT-001):Node 对 `Upgrade` 请求**不 emit `request`**,
// 所以 server.js 的 handler(applySecurityHeaders/dispatch/entryGate/staticDenied)对 /ws
// 完全不执行 —— WS 曾是绕过 HTTP 门禁的另一扇门。现在 upgrade 期自建守卫:
// Origin 白名单 + 有效 vid 会话 + 拉黑 IP/被踢状态一律拒 + 连接数上限;
// 另加 maxPayload(ws@8 默认 100MB)、每连接消息令牌桶、慢客户端背压断连。

const { WebSocketServer } = require('ws');
const store = require('./store');
const { gateData, realIP, getApplicant, sessionValid, authVid } = store;
const { getCookies } = require('./util');
const { isAllowedOrigin } = require('./security');

const ROOM_CAP = 8; // 容错上限,实际玩法 3-4 人
const MAX_PAYLOAD = 16 * 1024;        // 单帧上限:ws@8 默认 100MB,一条帧就能吃掉整块内存
const MAX_CONN_PER_IP = 8;            // 单 IP 并发连接(4 人玩法留足余量)
const MAX_CONN_GLOBAL = 500;          // 进程内总并发连接兜底
const MAX_BUFFERED = 1024 * 1024;     // 慢客户端写缓冲阈值:超了直接断,不为一个卡死的页面堆内存
const REJECT_KICKED = ['kicked', 'denied', 'history', 'reapply']; // 与 entryGate 同口径的「不放行」状态
const COLORS = [
  '#ff9aa2', '#ffb7b2', '#ffdac1', '#b5ead7',
  '#c7ceea', '#f6c6ea', '#a0e7e5', '#fbe7a1',
];
// 每连接消息令牌桶(窗口内条数上限)。超限**静默丢弃该条**:
// 回 {t:'err'} 会给洪水制造回显放大,前端也不会因丢一条 move 而错位(下一帧就纠正)。
const MSG_RATE = {
  move: { limit: 20, window: 1000 },
  chat: { limit: 3, window: 10000 },
  emote: { limit: 5, window: 10000 },
  join: { limit: 5, window: 60000 },
};

function randId() {
  return Math.random().toString(36).slice(2, 10);
}
function normCode(c) {
  return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}
function clampStr(s, n) {
  return String(s == null ? '' : s).slice(0, n);
}

// vid 会话是否可作授权用:优先走 store.authVid(身份判定唯一权威,只调用不改它);
// 该导出尚未落地时退回同一套 cookie→档案→sessionValid 判定,行为等价。
function hasValidVidSession(req) {
  if (typeof authVid === 'function') return Boolean(authVid(req));
  const vid = getCookies(req).vid;
  const a = vid ? getApplicant(vid) : null;
  return Boolean(a && sessionValid(a));
}

// upgrade 期守卫:返回拒绝原因(字符串)或 null(放行)
function upgradeRejectReason(req) {
  const ip = realIP(req) || 'unknown';
  if (Array.isArray(gateData.blockedIps) && gateData.blockedIps.includes(ip)) return 'blocked-ip';
  if (!isAllowedOrigin(req.headers.origin, req)) return 'origin'; // 浏览器必带 Origin;缺失按跨源拒绝
  const vid = getCookies(req).vid;
  const a = vid ? getApplicant(vid) : null;
  if (!a) return 'no-visitor';                                  // 没走过 HTTP 门禁(无 vid 档案)不放行
  if (REJECT_KICKED.includes(String(a.status))) return 'kicked'; // 与 entryGate 同口径
  if (!hasValidVidSession(req)) return 'stale-session';          // 会话过期/吊销 → 门禁同步失效
  return null;
}

class Hub {
  constructor() {
    this.rooms = new Map(); // code -> { code, players:Map(id->player) }
  }
  getOrCreate(code) {
    let r = this.rooms.get(code);
    if (!r) {
      r = { code, players: new Map() };
      this.rooms.set(code, r);
    }
    return r;
  }
  spawnPos(room) {
    const n = room.players.size;
    const a = (n * (Math.PI * 2)) / ROOM_CAP;
    return { x: Math.cos(a) * 3, y: 0, z: Math.sin(a) * 3, ry: a + Math.PI };
  }
}

function attachMultiplayer(httpServer, opts = {}) {
  const pathName = opts.path || '/ws';
  const wss = new WebSocketServer({ noServer: true, path: pathName, maxPayload: MAX_PAYLOAD });
  const hub = new Hub();
  const connsByIp = new Map(); // ip -> 连接数(握手放行时 +1,close/error -1)
  let totalConns = 0;

  function send(ws, obj) {
    if (ws.readyState === ws.OPEN) safeSend(ws, JSON.stringify(obj));
  }
  function safeSend(ws, text) {
    if (ws.readyState !== ws.OPEN) return;
    if (ws.bufferedAmount > MAX_BUFFERED) {
      // 背压:对端消费不动就放手(terminate 会走既有 close→leave 清理与房间摘除)
      console.warn('[multiplayer] 慢客户端背压超限,断开 ws=', ws.id);
      ws.terminate();
      return;
    }
    try { ws.send(text); } catch (e) {}
  }
  function broadcast(room, obj, exceptId) {
    const s = JSON.stringify(obj);
    for (const p of room.players.values()) {
      if (p.id === exceptId) continue;
      safeSend(p.ws, s);
    }
  }
  function leave(ws) {
    if (!ws.room || !ws.player) return;
    const room = ws.room;
    const id = ws.player.id;
    room.players.delete(id);
    broadcast(room, { t: 'leave', id });
    ws.room = null;
    ws.player = null;
    if (room.players.size === 0) hub.rooms.delete(room.code);
  }
  function dropConn(ws) {
    if (ws._counted) {
      ws._counted = false;
      totalConns = Math.max(0, totalConns - 1);
      const n = (connsByIp.get(ws._ip) || 1) - 1;
      if (n <= 0) connsByIp.delete(ws._ip);
      else connsByIp.set(ws._ip, n);
    }
    leave(ws);
  }
  function rlOk(ws, kind) {
    const r = MSG_RATE[kind];
    if (!r) return true;
    const now = Date.now();
    const buckets = ws._rl || (ws._rl = {});
    const w = buckets[kind];
    if (!w || now - w.start >= r.window) { buckets[kind] = { n: 1, start: now }; return true; }
    w.n += 1;
    return w.n <= r.limit;
  }

  // upgrade 分发:noServer 模式下自己判定再交给 ws 库(比 verifyClient 可控——能拿到 socket 并 destroy)
  function onUpgrade(req, socket, head) {
    if (!wss.shouldHandle(req)) return; // 不是本服务的 upgrade 路径,留给其他监听者
    const reason = upgradeRejectReason(req);
    if (reason) {
      // 拉黑/被踢是 HTTP 门禁状态的必然跟随(entryGate 已经拦过同一个访客),不刷屏
      console.warn('[multiplayer] 拒绝 ws 握手:', reason, 'ip=' + (realIP(req) || 'unknown'));
      socket.destroy();
      return;
    }
    const ip = realIP(req) || 'unknown';
    if (totalConns >= MAX_CONN_GLOBAL || (connsByIp.get(ip) || 0) >= MAX_CONN_PER_IP) {
      console.warn('[multiplayer] 拒绝 ws 握手: 连接数上限 total=' + totalConns + ' ip=' + ip);
      socket.destroy();
      return;
    }
    req._wsIp = ip; // handleUpgrade 之后在 connection 里取用
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  }
  httpServer.on('upgrade', onUpgrade);

  wss.on('connection', (ws, req) => {
    ws.id = randId();
    ws.room = null;
    ws.player = null;
    ws.isAlive = true;
    ws._ip = (req && req._wsIp) || realIP(req) || 'unknown';
    ws._counted = true;
    totalConns += 1;
    connsByIp.set(ws._ip, (connsByIp.get(ws._ip) || 0) + 1);

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch (e) { return; }
      if (!msg || typeof msg.t !== 'string') return;

      if (msg.t === 'join') {
        if (!rlOk(ws, 'join')) return; // 房间码可枚举:限住「脚本扫房」这一路
        // 若已在一个房间(重连),先退旧
        if (ws.room) leave(ws);
        const code = normCode(msg.code);
        if (!code) { send(ws, { t: 'err', msg: '房间码无效' }); return; }
        const room = hub.getOrCreate(code);
        if (room.players.size >= ROOM_CAP) { send(ws, { t: 'full' }); return; }
        const color = COLORS[room.players.size % COLORS.length];
        const sp = hub.spawnPos(room);
        const player = {
          id: ws.id,
          name: clampStr(msg.name || '访客', 16) || '访客',
          color,
          x: sp.x, y: sp.y, z: sp.z, ry: sp.ry,
          emote: null,
          ws,
        };
        room.players.set(player.id, player);
        ws.room = room;
        ws.player = player;
        // 给本人下发欢迎 + 现有玩家
        const others = [];
        for (const p of room.players.values()) {
          if (p.id === player.id) continue;
          others.push({ id: p.id, name: p.name, color: p.color, x: p.x, y: p.y, z: p.z, ry: p.ry });
        }
        send(ws, { t: 'welcome', id: player.id, color, players: others, code, x: sp.x, y: sp.y, z: sp.z, ry: sp.ry });
        // 通知他人
        broadcast(room, { t: 'join', id: player.id, name: player.name, color, x: sp.x, y: sp.y, z: sp.z, ry: sp.ry }, player.id);
        return;
      }

      if (!ws.room || !ws.player) return; // 其他消息需先 join
      const room = ws.room;
      const me = ws.player;

      if (msg.t === 'move') {
        if (!rlOk(ws, 'move')) return;
        const x = +msg.x, y = +msg.y, z = +msg.z, ry = +msg.ry;
        if ([x, y, z, ry].some((v) => !isFinite(v))) return;
        me.x = Math.max(-30, Math.min(30, x));
        me.y = Math.max(-5, Math.min(10, y));
        me.z = Math.max(-30, Math.min(30, z));
        me.ry = ry;
        broadcast(room, { t: 'move', id: me.id, x: me.x, y: me.y, z: me.z, ry: me.ry }, me.id);
        return;
      }
      if (msg.t === 'chat') {
        if (!rlOk(ws, 'chat')) return;
        const text = clampStr(msg.text, 200);
        if (!text) return;
        broadcast(room, { t: 'chat', id: me.id, name: me.name, text }, me.id);
        return;
      }
      if (msg.t === 'emote') {
        if (!rlOk(ws, 'emote')) return;
        const e = ['wave', 'point', 'sit'].includes(msg.e) ? msg.e : null;
        if (!e) return;
        me.emote = e;
        broadcast(room, { t: 'emote', id: me.id, e }, me.id);
        return;
      }
      if (msg.t === 'leave') {
        leave(ws);
        return;
      }
    });

    ws.on('close', () => { dropConn(ws); });
    ws.on('error', () => { dropConn(ws); });
  });

  // 心跳:清理僵尸连接
  const timer = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) { ws.terminate(); return; }
      ws.isAlive = false;
      try { ws.ping(); } catch (e) {}
    });
  }, 30000);
  wss.on('close', () => {
    clearInterval(timer);
    httpServer.removeListener('upgrade', onUpgrade);
  });

  console.log(`[multiplayer] ws 房间服务已挂载 path=${pathName} cap=${ROOM_CAP} maxPayload=${MAX_PAYLOAD} 连接上限=${MAX_CONN_PER_IP}/IP·${MAX_CONN_GLOBAL}/进程`);
  return wss;
}

module.exports = attachMultiplayer;
module.exports.attachMultiplayer = attachMultiplayer;
module.exports.upgradeRejectReason = upgradeRejectReason; // 测试/探针可复用同一条守卫
