// src/__tests__/global-setup.mjs — 开跑前收走**自己**在系统临时目录里留下的旧残渣(2026-10-15 加)
// 为什么需要:后端类单测(lib-*.test.js 等 40 多个文件)各自 `fs.mkdtempSync(os.tmpdir()/dg-…)`,
//   afterAll 里 `fs.rmSync(..., {force:true})` 收尾 —— 但 Windows 上父进程还握着 `gate_data.db` 的句柄
//   (store.js 的 close 挂在 process.on('exit'),晚于 rmSync),于是**目录里的文件删掉了、目录本身删不掉**:
//   实测本机 %TEMP% 攒了 **2063 个** `dg-*` 空目录(2026-10-15 数的),每跑一次套件再加几十个。
//   Linux/CI 上 rmSync 是成功的,所以这条只在 Windows 本地有意义 —— 也正因为如此它没人发现。
// 只扫 `dg-` 前缀:那是本仓测试自己起的命名;别的目录/文件一概不碰。
// ⚠️**按 mtime 只收 6 小时前的**:同机并发跑两套(vitest 与 npm test 串在一起、或两个终端)时,
//   新鲜目录可能正被另一个进程使用 —— 删别人的活动数据根会制造无法复现的飘红。宁可少收,不可错收。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PREFIX = 'dg-';
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export default function sweepStaleTempDataRoots() {
  const dir = os.tmpdir();
  let removed = 0;
  let kept = 0;
  let failed = 0;
  let names; // 不预赋 []:旧写法在这里写 `= []`,而 try 里立刻整体覆盖 ⇒ 那次赋值永远读不到
  try {
    names = fs.readdirSync(dir);
  } catch {
    return; // 连临时目录都读不到就不管了:这是清理,不是判定
  }
  const now = Date.now();
  for (const name of names) {
    if (!name.startsWith(PREFIX)) continue;
    const p = path.join(dir, name);
    try {
      const st = fs.statSync(p);
      if (now - st.mtimeMs < MAX_AGE_MS) {
        kept++;
        continue;
      }
      fs.rmSync(p, { recursive: true, force: true });
      removed++;
    } catch {
      failed++; // 仍被占用 ⇒ 这次不动它,下次再收(清理永远不该让测试红)
    }
  }
  console.log(
    `[globalSetup] 临时数据根清扫:搬走 ${removed} 个超过 6 小时的 ${PREFIX}* 残留,留下 ${kept} 个可能正被并发使用,失败 ${failed}`
  );
}
