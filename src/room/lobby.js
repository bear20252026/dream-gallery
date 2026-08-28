// src/room/lobby.js — 大厅逻辑:昵称 + 创建/加入房间
// 存档走 storeApi(src/state/store-api.js,纯持久化层,不依赖 ctx)——
// 本页是 lobby.html 独立入口,不加载 ctx.js 冷核心,故直接引 api 而非 ctx.store。
import './room.css';
import { storeApi } from '../state/store-api.js';

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

// 预填上次昵称(走 storeApi:roomName 已在 SCHEMA 登记,含异常兜底)
const last = storeApi.str('roomName');
if (last) nameEl.value = last;

document.getElementById('createBtn').onclick = () => {
  const name = nameEl.value.trim() || '访客';
  storeApi.setStr('roomName', name);
  go(randCode(), name);
};
document.getElementById('joinBtn').onclick = () => {
  const code = codeEl.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) { codeEl.focus(); return; }
  const name = nameEl.value.trim() || '访客';
  storeApi.setStr('roomName', name);
  go(code, name);
};
codeEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('joinBtn').click(); });
nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('createBtn').click(); });
