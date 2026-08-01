// ===================== 在线设备管理 + 点对点消息（Admin-User 私聊） =====================
const { sendJson, readBody } = require('./util');
const { gateData, saveGateData, deviceKey, parseBrand, realIP } = require('./store');

// 在线设备表：{ dk: { dk, ua, screen, ip, onlineSince, lastSeen } }
const onlineDevices = new Map();
// 设备名映射（首次注册时记录）
const devNames = {}; // dk -> readable name

// ===================== 设备注册(POST /api/device/register) =====================
function handleDeviceRegister(req, res) {
  readBody(req, obj => {
    const dk = deviceKey(req);
    const ua = String(obj.ua || req.headers['user-agent'] || '').slice(0, 200);
    const screen = String(obj.screen || '');
    const now = Date.now();
    if (onlineDevices.has(dk)) {
      onlineDevices.get(dk).lastSeen = now;
    } else {
      onlineDevices.set(dk, { dk, ua, screen, ip: realIP(req), onlineSince: now, lastSeen: now });
      // 生成设备名:优先客户端 userAgentData.model,其次服务端 parseBrand UA
      var clientModel = String(obj.model || '').trim();
      var brand = parseBrand(ua);
      var osMatch = ua.match(/(Windows|Mac|Linux|Android|iPhone|iPad)/i);
      var deviceType = screen && parseInt(screen.split('x')[0]) < 768 ? '📱' : '💻';
      var name = deviceType + ' ';
      if (clientModel) {
        name += clientModel; // 客户端 API 拿到的型号最准
      } else if (brand.full && brand.full.length > 3) {
        name += brand.full;
      } else {
        if (osMatch) name += osMatch[1] + ' ';
        if (screen) name += screen;
      }
      devNames[dk] = name;
    }
    sendJson(res, 200, { ok: true, dk });
    // 清理离线设备（超过30秒未心跳视为离线）
    const cutoff = now - 30000;
    for (const [k, v] of onlineDevices) { if (v.lastSeen < cutoff) onlineDevices.delete(k); }
  });
}

// ===================== 获取在线设备(SSE: GET /api/admin/online-sse) =====================
function handleOnlineSSE(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  const send = () => {
    const devices = [];
    const now = Date.now();
    for (const [dk, v] of onlineDevices) {
      if (now - v.lastSeen < 30000) {
        devices.push({
          dk: dk.slice(0, 8),
          name: devNames[dk] || '未知设备',
          screen: v.screen,
          onlineSince: v.onlineSince,
          lastSeen: v.lastSeen,
        });
      }
    }
    res.write(`data: ${JSON.stringify({ devices, count: devices.length, time: now })}\n\n`);
  };
  send();
  const timer = setInterval(send, 3000);
  res.on('close', () => clearInterval(timer));
}

// ===================== 点对点消息(POST /api/admin/chat) =====================
// 存储待发消息：{ targetDk: [{ from, text, ts }] }
const pendingMessages = {}; // targetDk -> messages[]
// 存储聊天历史
if (!gateData.adminChats) gateData.adminChats = {}; // { dk: [{ from, text, ts, dir }] }

function handleAdminChatPost(req, res) {
  readBody(req, obj => {
    const text = String(obj.text || '').trim().slice(0, 500);
    const targetDkPrefix = String(obj.target || '').trim();
    if (!text || !targetDkPrefix) { sendJson(res, 400, { error: '缺少参数' }); return; }

    // 匹配完整 dk（前缀匹配）
    let targetDk = null;
    for (const dk of onlineDevices.keys()) {
      if (dk.startsWith(targetDkPrefix)) { targetDk = dk; break; }
    }
    if (!targetDk) { sendJson(res, 404, { error: '设备不在线' }); return; }

    const msg = { from: 'admin', text, ts: Date.now(), dir: 'admin->user' };
    if (!pendingMessages[targetDk]) pendingMessages[targetDk] = [];
    pendingMessages[targetDk].push(msg);

    // 存历史
    if (!gateData.adminChats[targetDk]) gateData.adminChats[targetDk] = [];
    gateData.adminChats[targetDk].push(msg);
    if (gateData.adminChats[targetDk].length > 200) gateData.adminChats[targetDk].splice(0, gateData.adminChats[targetDk].length - 200);
    saveGateData();

    sendJson(res, 200, { ok: true });
  });
}

// ===================== 用户获取新消息(GET /api/device/messages) =====================
function handleDeviceMessages(req, res) {
  const dk = deviceKey(req);
  const msgs = pendingMessages[dk] || [];
  if (msgs.length > 0) {
    sendJson(res, 200, { msgs: msgs.slice() });
    pendingMessages[dk] = []; // 消费后清空
  } else {
    sendJson(res, 200, { msgs: [] });
  }
}

// ===================== 用户回复管理员(POST /api/device/reply) =====================
function handleDeviceReply(req, res) {
  readBody(req, obj => {
    const dk = deviceKey(req);
    const text = String(obj.text || '').trim().slice(0, 500);
    if (!text) { sendJson(res, 400, { error: '不能为空' }); return; }
    const msg = { from: 'user', name: devNames[dk] || '访客', dk: dk.slice(0, 8), text, ts: Date.now(), dir: 'user->admin' };
    if (!gateData.adminChats[dk]) gateData.adminChats[dk] = [];
    gateData.adminChats[dk].push(msg);
    if (gateData.adminChats[dk].length > 200) gateData.adminChats[dk].splice(0, gateData.adminChats[dk].length - 200);
    saveGateData();
    sendJson(res, 200, { ok: true });
  });
}

// ===================== 获取该设备聊天记录(GET /api/admin/chats?dk=xxx) =====================
function handleAdminChats(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const dkPrefix = url.searchParams.get('dk') || '';
  let targetDk = null;
  for (const dk of onlineDevices.keys()) {
    if (dk.startsWith(dkPrefix)) { targetDk = dk; break; }
  }
  if (!targetDk) {
    // 也查历史
    for (const dk of Object.keys(gateData.adminChats || {})) {
      if (dk.startsWith(dkPrefix)) { targetDk = dk; break; }
    }
  }
  const chats = (gateData.adminChats && gateData.adminChats[targetDk]) || [];
  sendJson(res, 200, { dk: (targetDk || '').slice(0, 8), chats: chats.slice(-100) });
}

module.exports = {
  handleDeviceRegister, handleOnlineSSE, handleAdminChatPost,
  handleDeviceMessages, handleDeviceReply, handleAdminChats,
  onlineDevices, // 导出供 server.js 清理心跳用
};
