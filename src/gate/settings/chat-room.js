// chat-room.js — 聊天室·昆仑回声壁(全员共壁,最近 100 条,@昆仑之灵 召唤机器人)
import { ctx } from '../../ctx.js';

const chatOv = document.createElement('div');
chatOv.id = 'chatOv';
chatOv.style.cssText =
  'position:fixed;inset:0;z-index:380;display:none;align-items:center;justify-content:center;background:rgba(12,6,12,0.62);font-family:inherit';
const chatCard = document.createElement('div');
chatCard.style.cssText =
  'width:min(520px,92vw);max-height:82vh;display:flex;flex-direction:column;background:linear-gradient(160deg,rgba(38,22,34,0.98),rgba(24,14,26,0.98));border:1px solid rgba(255,214,170,.3);border-radius:18px;padding:16px;color:#fff;box-shadow:0 24px 80px rgba(0,0,0,.55)';
chatCard.innerHTML =
  '<div style="display:flex;align-items:center;margin-bottom:8px"><b style="letter-spacing:2px;font-size:15px">昆仑回声壁</b><span style="font-size:10px;color:rgba(255,217,168,.55);margin-left:8px">全员共壁 · 留最近 100 条 · @昆仑之灵 可召唤它回答</span><span id="chatX" style="margin-left:auto;cursor:pointer;color:rgba(255,255,255,.55);padding:2px 8px;font-size:14px">✕</span></div>' +
  '<div id="chatMsgs" style="flex:1;min-height:220px;max-height:54vh;overflow-y:auto;padding:8px;background:rgba(0,0,0,.25);border-radius:12px"></div>' +
  '<div style="display:flex;gap:6px;margin-top:8px"><input id="chatInput" maxlength="140" placeholder="说一句…(140字内)" style="flex:1;min-width:0;padding:9px 13px;border-radius:16px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font-size:13px;outline:none">' +
  '<button id="chatSend" style="padding:9px 16px;border:none;border-radius:16px;background:linear-gradient(135deg,#c98a4b,#8a5a2a);color:#fff;font-size:13px;cursor:pointer">发</button></div>';
chatOv.appendChild(chatCard);
document.body.appendChild(chatOv);

let chatTimer = null;
function onVis() {
  // 标签页隐藏时暂停轮询(对齐 paintings.js 模式,B-a 整改)
  if (document.hidden) {
    clearInterval(chatTimer);
  } else {
    loadChat();
    chatTimer = setInterval(loadChat, 5000);
  }
}
export const chatApi = ctx.overlay.register(chatOv, {
  x: '#chatX',
  onOpen() {
    loadChat();
    chatTimer = setInterval(loadChat, 5000);
    document.addEventListener('visibilitychange', onVis);
  },
  onClose() {
    clearInterval(chatTimer);
    document.removeEventListener('visibilitychange', onVis);
  },
});

function fmtT(ts) {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

async function loadChat() {
  try {
    const r = await fetch('/api/chat');
    const d = await r.json();
    const box = document.getElementById('chatMsgs');
    if (!box) return;
    box.innerHTML = '';
    const msgs = d.msgs || [];
    if (!msgs.length) {
      box.innerHTML =
        '<div style="opacity:.5;text-align:center;padding:14px;font-size:12px">还没有人说话。第一句，由你来开。</div>';
      return;
    }
    for (const m of msgs) {
      const row = document.createElement('div');
      row.style.cssText =
        'display:flex;flex-direction:column;margin:5px 0;align-items:' +
        (m.me ? 'flex-end' : 'flex-start');
      const head = document.createElement('div');
      head.style.cssText = 'font-size:10px;color:rgba(255,255,255,.45);margin-bottom:2px';
      head.textContent = (m.bot ? '✦ ' : '') + m.n + ' · ' + fmtT(m.ts);
      const bub = document.createElement('div');
      bub.style.cssText = m.bot
        ? 'max-width:88%;padding:7px 12px;border-radius:14px;border-bottom-left-radius:4px;font-size:12px;line-height:1.7;background:rgba(230,170,60,.14);border:1px solid rgba(255,214,130,.55);color:#ffe9c4'
        : m.me
          ? 'max-width:88%;padding:7px 12px;border-radius:14px;border-bottom-right-radius:4px;font-size:12px;line-height:1.7;background:linear-gradient(135deg,rgba(201,138,75,.85),rgba(138,90,42,.85));color:#fff'
          : 'max-width:88%;padding:7px 12px;border-radius:14px;border-bottom-left-radius:4px;font-size:12px;line-height:1.7;background:rgba(255,255,255,.12);color:rgba(255,255,255,.92)';
      bub.textContent = m.t;
      row.appendChild(head);
      row.appendChild(bub);
      box.appendChild(row);
    }
    box.scrollTop = box.scrollHeight;
  } catch (e) {}
}

async function sendChat() {
  const inp = document.getElementById('chatInput');
  const text = (inp.value || '').trim();
  if (!text) return;
  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const d = await r.json();
    if (!r.ok) {
      ctx.ui.modeToast && ctx.ui.modeToast(d.error || '发送失败');
      return;
    }
    inp.value = '';
    loadChat();
    if (/@(昆仑之灵|机器人|bot)/i.test(text)) setTimeout(loadChat, 6000);
  } catch (e) {
    ctx.ui.modeToast && ctx.ui.modeToast('网络开了个小差');
  }
}

document.getElementById('chatSend').onclick = sendChat;
document.getElementById('chatInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});
// gmChat 由 settings.js 动态创建，需延迟绑定
setTimeout(function () {
  document.getElementById('gmChat').onclick = function () {
    chatApi.open();
  };
}, 0);
