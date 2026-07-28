// dev.js — 本地开发一键启动:后端(server.js :3000,媒体/API)+ 前端(Vite :5173,HMR)
// 为什么需要:Vite 把 /api /photos /videos /music 代理到 :3000,单起 Vite 不起后端 = 全部媒体 404。
// 用法:npm run dev(等价于以前"启动画廊.bat + Vite"两个窗口);命令行参数原样转发给 Vite(--port/--host 等)。
// 关闭:Ctrl+C 一次,两个进程一起退出;任一进程崩溃,另一个也随之退出(不留孤儿进程)。
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const children = [];
let exiting = false;

function start(name, cmd, args, env = {}) {
  const child = spawn(cmd, args, {
    cwd: ROOT, stdio: 'inherit', shell: false,
    env: { ...process.env, ...env },
  });
  children.push(child);
  child.on('exit', (code) => {
    if (exiting) return;
    exiting = true;
    console.log(`\n[dev] ${name} 已退出(code ${code}),正在关闭另一个进程…`);
    for (const c of children) { try { c.kill(); } catch {} }
    process.exit(code || 0);
  });
  return child;
}

// 后端:媒体/门禁/API(固定 :3000,Vite 代理的目标)
start('后端 server.js (:3000)', process.execPath, ['server.js'], { PORT: '3000' });
// 前端:Vite 开发服务器(命令行参数如 --port 7100 --host 原样转发)
start('前端 Vite', process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), ...process.argv.slice(2)]);

process.on('SIGINT', () => {
  exiting = true;
  for (const c of children) { try { c.kill(); } catch {} }
  process.exit(0);
});
