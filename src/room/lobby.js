// src/room/lobby.js — 大厅逻辑:昵称 + 创建/加入房间
import './room.css';

function randCode() {
  const cs = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += cs[Math.floor(Math.random() * cs.length)];
  return s;
}
function go(code, name) {
  const c = encodeURIComponent(code);
  const n = encodeURIComponent(name || '访客');
  location.href = `/room.html?code=${c}&name=${n}`;
}
const nameEl = document.getElementById('name');
const codeEl = document.getElementById('code');

// 预填上次昵称
try {
  const last = localStorage.getItem('roomName');
  if (last) nameEl.value = last;
} catch (e) {}

document.getElementById('createBtn').onclick = () => {
  const name = nameEl.value.trim() || '访客';
  try { localStorage.setItem('roomName', name); } catch (e) {}
  go(randCode(), name);
};
document.getElementById('joinBtn').onclick = () => {
  const code = codeEl.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) { codeEl.focus(); return; }
  const name = nameEl.value.trim() || '访客';
  try { localStorage.setItem('roomName', name); } catch (e) {}
  go(code, name);
};
codeEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('joinBtn').click(); });
nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('createBtn').click(); });
