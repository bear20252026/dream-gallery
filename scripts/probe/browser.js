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
function launch(extraArgs) {
  const args = ['--no-sandbox'].concat(extraArgs || []);
  if (process.env.PW_BROWSER === 'chromium') {
    return chromium.launch({ headless: true, args });
  }
  return chromium.launch({
    headless: true,
    args,
    executablePath:
      process.env.PW_EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  });
}
module.exports = { BASE_URL, launch };
