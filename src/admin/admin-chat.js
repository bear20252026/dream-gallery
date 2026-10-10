// admin-chat.js — 在线对话 tab(2026-10-09 自 admin.js 切出,逐字迁移)
// 状态自持(chatCurDk/chatSse/chatPoll/chatDevices);switchTab 经 stopChatLive() 清理。

import { adminFetch, $, esc, toast } from './admin-core.js';

// SSE/轮询清理(原散在 admin.js switchTab 内;2026-10-09 随对话分区一起切出封装)
export function stopChatLive() {
  if (chatSse) {
    try {
      chatSse.close();
    } catch (e) {}
    chatSse = null;
    if (chatPoll) {
      clearInterval(chatPoll);
      chatPoll = null;
    }
  }
}

// =====  在线对话 =====
let chatCurDk = null,
  chatSse = null,
  chatPoll = null,
  chatDevices = [];
export async function startChat() {
  if (!$('tab-chat') || $('tab-chat').style.display === 'none') return;
  if (chatSse || chatPoll) return;
  // 优雅降级(2026-10-10 核实):/api/admin/online-sse|chat|chats 服务端从未实现,
  // 原 EventSource 对 404 每 8s 无限重试刷日志。先探测,404 则明示"未启用"。
  try {
    const probe = await adminFetch('/api/admin/online-sse');
    if (probe.status === 404) {
      if ($('chatDeviceList'))
        $('chatDeviceList').innerHTML =
          '<div style="text-align:center;color:#9ca3af;font-size:12px;padding:20px">点对点推送服务端未启用<br><span style="opacity:.6">下方输入框可直接回话到公开聊天室(以「管理员」身份)</span></div>';
      if ($('chatOnlineCount')) $('chatOnlineCount').textContent = '—';
    }
  } catch (e) {}
  // 公开聊天室:历史 + 3s 轮询(2026-10-10 管理员回话功能的主视图)
  loadPublicRoom();
  if (chatPoll) clearInterval(chatPoll);
  chatPoll = setInterval(loadPublicRoom, 3000);
  if (!$('chatMsgInput').disabled) return;
  $('chatMsgInput').disabled = false;
  $('chatSendBtn').disabled = false;
  $('chatMsgInput').placeholder = '回话到聊天室(以「管理员」身份)…';
  return;
}
function renderChatDevices() {
  if (!$('chatOnlineCount')) return;
  $('chatOnlineCount').textContent = chatDevices.length + ' 人在线';
  const l = $('chatDeviceList');
  if (!l) return;
  if (!chatDevices.length) {
    l.innerHTML =
      '<div style="text-align:center;color:#9ca3af;font-size:12px;padding:20px">暂无在线设备</div>';
    return;
  }
  l.innerHTML = chatDevices
    .map((d) => {
      const active =
        d.dk === chatCurDk ? ' style="border-color:#cc785c;background:rgba(204,120,92,.1)"' : '';
      return (
        '<div' +
        active +
        ' class="file-row" onclick="chatSelect(\'' +
        d.dk +
        '\')" style="cursor:pointer;margin-bottom:4px"><div><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#4caf50;margin-right:4px"></span><b>' +
        esc(d.name) +
        '</b></div><div style="font-size:10px;color:#9ca3af;margin-top:2px">' +
        Math.floor((Date.now() - d.onlineSince) / 60000) +
        '分钟前</div></div>'
      );
    })
    .join('');
}
async function loadPublicRoom() {
  const box = $('chatMsgArea');
  if (!box) return;
  try {
    const r = await adminFetch('/api/chat');
    const cs = await r.json();
    const msgs = (cs.chat || cs.msgs || []).slice(-30).reverse();
    if (!msgs.length) {
      box.innerHTML =
        '<div style="text-align:center;color:#9ca3af;font-size:12px;padding:30px">聊天室暂无消息</div>';
      return;
    }
    box.innerHTML = msgs
      .map((m) => {
        const isAdmin = m.admin || m.n === '管理员' || m.n === BOT_HINT;
        const t = new Date(m.ts).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
        });
        const bg = isAdmin
          ? 'linear-gradient(135deg,rgba(102,126,234,.5),rgba(118,75,162,.4))'
          : 'rgba(255,255,255,.1)';
        const self = isAdmin ? 'flex-end' : 'flex-start';
        const br = isAdmin ? 'right' : 'left';
        const name = esc(m.n || '访客');
        return (
          '<div style="max-width:75%;padding:10px 14px;border-radius:14px;font-size:13px;line-height:1.5;align-self:' +
          self +
          ';background:' +
          bg +
          ';border-bottom-' +
          br +
          '-radius:4px;margin-bottom:4px">' +
          esc(m.t) +
          '<div style="font-size:10px;opacity:.5;margin-top:4px;text-align:right">' +
          t +
          ' · ' +
          name +
          '</div></div>'
        );
      })
      .join('');
  } catch (e) {
    console.warn('[admin] 聊天室加载失败', e); // 原:静默(2026-10-10 空 catch 治理口径)
  }
}
const BOT_HINT = '管理员';

export function chatSelect(dk) {
  chatCurDk = dk;
  renderChatDevices();
  const d = chatDevices.find((x) => x.dk === dk);
  $('chatSubTitle').textContent = '点对点 · ' + esc(d ? d.name : dk);
  $('chatMsgInput').disabled = false;
  $('chatSendBtn').disabled = false;
  $('chatMsgInput').placeholder = '回话到聊天室(以「管理员」身份)…';
  loadPublicRoom();
  if (chatPoll) clearInterval(chatPoll);
  chatPoll = setInterval(loadChatMsgs, 2500);
}
async function loadChatMsgs() {
  if (!chatCurDk) return;
  try {
    const r = await adminFetch('/api/admin/chats?dk=' + chatCurDk);
    const d = await r.json();
    const cs = d.chats || [],
      box = $('chatMsgArea');
    if (!box) return;
    if (!cs.length) {
      box.innerHTML =
        '<div style="text-align:center;color:#9ca3af;font-size:12px;padding:30px">暂无消息</div>';
      return;
    }
    box.innerHTML = cs
      .map((m) => {
        const isAdmin = m.from === 'admin' || m.dir === 'admin->user';
        const t = new Date(m.ts).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
        });
        const bg = isAdmin
          ? 'linear-gradient(135deg,rgba(102,126,234,.5),rgba(118,75,162,.4))'
          : 'rgba(255,255,255,.1)';
        const self = isAdmin ? 'flex-end' : 'flex-start';
        const br = isAdmin ? 'right' : 'left';
        return (
          '<div style="max-width:75%;padding:10px 14px;border-radius:14px;font-size:13px;line-height:1.5;align-self:' +
          self +
          ';background:' +
          bg +
          ';border-bottom-' +
          br +
          '-radius:4px;margin-bottom:4px">' +
          esc(m.text) +
          '<div style="font-size:10px;opacity:.5;margin-top:4px;text-align:right">' +
          t +
          (m.name ? ' · ' + esc(m.name) : ' · 管理员') +
          '</div></div>'
        );
      })
      .join('');
    box.scrollTop = box.scrollHeight;
  } catch (e) {
    // 原:静默吞掉 → 消息区空白,管理员误以为访客没留言(box 是 try 内 const,直取容器)
    const msgBox = $('chatMsgArea');
    if (msgBox)
      msgBox.innerHTML = `<div style="opacity:.6;padding:8px">聊天记录加载失败:${esc(String(e.message || e))}</div>`;
  }
}
export async function chatSend() {
  const t = $('chatMsgInput').value.trim();
  if (!t) return; // 2026-10-10 改公开聊天室回话:不再要求先点选设备(点对点端点未实现)
  $('chatMsgInput').value = '';
  $('chatSendBtn').disabled = true;
  try {
    // 2026-10-10:改走公开聊天室(以「管理员」身份,服务端按 x-token 识别);原点对点端点从未实现
    const r = await adminFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: t }),
    });
    if (r.ok) loadPublicRoom();
    else toast('发送失败', 1);
  } catch (e) {
    toast('发送失败', 1);
  }
  $('chatSendBtn').disabled = false;
}
