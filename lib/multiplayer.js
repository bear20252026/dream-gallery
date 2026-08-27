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

const { WebSocketServer } = require('ws');

const ROOM_CAP = 8; // 容错上限,实际玩法 3-4 人
const COLORS = [
  '#ff9aa2', '#ffb7b2', '#ffdac1', '#b5ead7',
  '#c7ceea', '#f6c6ea', '#a0e7e5', '#fbe7a1',
];

function randId() {
  return Math.random().toString(36).slice(2, 10);
}
function normCode(c) {
  return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}
function clampStr(s, n) {
  return String(s == null ? '' : s).slice(0, n);
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
  const wss = new WebSocketServer({ server: httpServer, path: opts.path || '/ws' });
  const hub = new Hub();

  function send(ws, obj) {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(JSON.stringify(obj)); } catch (e) {}
    }
  }
  function broadcast(room, obj, exceptId) {
    const s = JSON.stringify(obj);
    for (const p of room.players.values()) {
      if (p.id === exceptId) continue;
      if (p.ws.readyState === p.ws.OPEN) {
        try { p.ws.send(s); } catch (e) {}
      }
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

  wss.on('connection', (ws) => {
    ws.id = randId();
    ws.room = null;
    ws.player = null;
    ws.isAlive = true;

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch (e) { return; }
      if (!msg || typeof msg.t !== 'string') return;

      if (msg.t === 'join') {
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
        const text = clampStr(msg.text, 200);
        if (!text) return;
        broadcast(room, { t: 'chat', id: me.id, name: me.name, text }, me.id);
        return;
      }
      if (msg.t === 'emote') {
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

    ws.on('close', () => { leave(ws); });
    ws.on('error', () => { leave(ws); });
  });

  // 心跳:清理僵尸连接
  const timer = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) { ws.terminate(); return; }
      ws.isAlive = false;
      try { ws.ping(); } catch (e) {}
    });
  }, 30000);
  wss.on('close', () => clearInterval(timer));

  console.log(`[multiplayer] ws 房间服务已挂载 path=${opts.path || '/ws'} cap=${ROOM_CAP}`);
  return wss;
}

module.exports = attachMultiplayer;
