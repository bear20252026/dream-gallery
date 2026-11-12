// 统一浏览器与 URL 解析(2026-08-30 反回归地基):
// - 本地默认本机 Edge(playwright-core);CI 里设 PW_BROWSER=chromium 用注册表浏览器
// - BASE_URL 可覆盖,CI 冒烟跑本地起的服务
let chromium;
try {
  chromium = require('playwright').chromium;
} catch (e) {
  chromium = require('playwright-core').chromium;
}
const BASE_URL = process.env.BASE_URL || 'https://cloudbear.cloud/';
// 本机 Edge 的默认路径按平台解析(2026-11-11 审计 CI 覆盖:原先写死 Windows 路径,
// macOS 上本地探针/测试一律起不来)。PW_EDGE 显式覆盖仍然最优先;
// 找不到本机 Edge 时回落注册表 Chromium(需 npx playwright-core install chromium)。
const fs = require('fs');
function defaultEdgePath() {
  if (process.platform === 'win32') return 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  if (process.platform === 'darwin') return '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
  return '/usr/bin/microsoft-edge';
}
function launch(extraArgs) {
  const args = ['--no-sandbox'].concat(extraArgs || []);
  if (process.env.PW_BROWSER === 'chromium') {
    return chromium.launch({ headless: true, args });
  }
  const exe = process.env.PW_EDGE || defaultEdgePath();
  if (fs.existsSync(exe)) {
    return chromium.launch({ headless: true, args, executablePath: exe });
  }
  return chromium.launch({ headless: true, args }); // 注册表 Chromium 兜底
}
module.exports = { BASE_URL, launch };
