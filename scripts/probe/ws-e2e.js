// scripts/probe/ws-e2e.js — 多人房间端到端验证(在服务器上运行)
// 用法: node scripts/probe/ws-e2e.js   (需 ws 在 node_modules)
const WebSocket = require('ws');
const URL = 'ws://localhost:3000/ws';

function open() {
  return new Promise((res, rej) => {
    const ws = new WebSocket(URL);
    ws.msgs = [];
    ws.on('message', (d) => { try { ws.msgs.push(JSON.parse(d.toString())); } catch (e) {} });
    ws.on('open', () => res(ws));
    ws.on('error', (e) => rej(e));
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ck(name, ok) { console.log((ok ? 'PASS ' : 'FAIL ') + name); ok ? pass++ : fail++; }

(async () => {
  const a = await open();
  a.send(JSON.stringify({ t: 'join', code: 'TEST1', name: 'Alice' }));
  await wait(200);
  const wA = a.msgs.find((m) => m.t === 'welcome');
  ck('A 收到 welcome(含自身 id)', !!(wA && wA.id));
  const b = await open();
  b.send(JSON.stringify({ t: 'join', code: 'TEST1', name: 'Bob' }));
  await wait(200);
  const joinOnA = a.msgs.find((m) => m.t === 'join' && m.name === 'Bob');
  ck('A 看到 B 加入', !!joinOnA);
  const wB = b.msgs.find((m) => m.t === 'welcome');
  ck('B welcome 含已有玩家(A)', !!(wB && wB.players.length === 1));
  ck('B 拿到房间码', !!(wB && wB.code === 'TEST1'));
  ck('B 拿到自身出生坐标', !!(wB && typeof wB.x === 'number'));

  a.send(JSON.stringify({ t: 'move', x: 1, y: 0, z: 2, ry: 0.5 }));
  await wait(150);
  const moveOnB = b.msgs.find((m) => m.t === 'move' && m.id === wA.id);
  ck('B 收到 A 移动', !!(moveOnB && moveOnB.x === 1 && moveOnB.z === 2));

  b.send(JSON.stringify({ t: 'chat', text: '你好' }));
  await wait(150);
  const chatOnA = a.msgs.find((m) => m.t === 'chat' && m.text === '你好');
  ck('A 收到 B 聊天', !!(chatOnA && chatOnA.name === 'Bob'));

  a.send(JSON.stringify({ t: 'emote', e: 'wave' }));
  await wait(150);
  const emoteOnB = b.msgs.find((m) => m.t === 'emote' && m.e === 'wave');
  ck('B 收到 A 表情', !!emoteOnB);

  // 房间满测试:开 9 个,第 9 人应收到 full(上限 8)
  const extra = [];
  for (let i = 0; i < 9; i++) { const c = await open(); c.send(JSON.stringify({ t: 'join', code: 'FULL1', name: 'P' + i })); extra.push(c); }
  await wait(200);
  const fullOne = extra[8].msgs.find((m) => m.t === 'full');
  ck('第 9 人收到 full(上限 8)', !!fullOne);
  extra.forEach((c) => c.close());

  b.close();
  await wait(200);
  const leaveOnA = a.msgs.find((m) => m.t === 'leave' && m.id === wB.id);
  ck('A 看到 B 离开', !!leaveOnA);
  a.close();

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('E2E 异常:', e.message); process.exit(2); });
