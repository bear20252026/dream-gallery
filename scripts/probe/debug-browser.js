// debug-browser.js — 浏览器黑匣子
// 抓取页面 console 日志 / JS 未捕获异常 / 失败请求 / 4xx-5xx 响应,写入 browser-debug.log
// 用法:
//   node debug-browser.js [url] [等待秒数]     例: node debug-browser.js http://localhost:3000/ 20
//   node debug-browser.js [url] 15 --quiz      加 --quiz 自动走一遍"解密测试"流程(点大屏→选理科→截图)
// 日志实时写入 browser-debug.log,可用 tail -f browser-debug.log 实时查看

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const URL_ARG = args.find(a => a.startsWith('http')) || 'http://localhost:3000/';
const WAIT_S = parseInt(args.find(a => /^\d+$/.test(a)) || '15', 10);
const QUIZ_MODE = args.includes('--quiz');

const logStream = fs.createWriteStream(path.join(__dirname, 'browser-debug.log'), { flags: 'a' });
function writeLog(level, content) {
  const line = `[${new Date().toISOString()}] [${level}] ${content}\n`;
  console.log(line.trim());
  logStream.write(line);
}

(async () => {
  const browser = await chromium.launch({
    channel: 'msedge',   // 直接用系统安装的 Edge,无需下载浏览器
    headless: true,      // 调试时改成 false 可看界面
  });
  const page = await browser.newPage();

  // 1. Console 日志(log/warn/error/info)
  page.on('console', msg => writeLog('CONSOLE', `[${msg.type()}] ${msg.text()}`));
  // 2. 页面 JS 未捕获异常(脚本崩溃主因)
  page.on('pageerror', err => writeLog('PAGE_ERROR', `${err.message}\n${err.stack || ''}`));
  // 3. 网络请求失败(接口挂了/资源404)
  page.on('requestfailed', req => writeLog('REQ_FAIL', `${req.url()} - ${(req.failure() || {}).errorText || 'Unknown'}`));
  // 4. 4xx/5xx 响应
  page.on('response', res => { if (res.status() >= 400) writeLog('HTTP_' + res.status(), res.url()); });
  // 5. 弹窗自动关闭,防止挂起
  page.on('dialog', async d => { writeLog('DIALOG', d.message()); await d.dismiss(); });

  writeLog('START', `打开 ${URL_ARG}`);
  await page.goto(URL_ARG, { waitUntil: 'domcontentloaded', timeout: 60000 });
  writeLog('INFO', '页面加载完成,等待场景初始化…');
  await page.waitForTimeout(5000);

  if (QUIZ_MODE) {
    writeLog('FLOW', '开始解密测试流程:点击答题屏→选择理科卷');
    await page.evaluate(() => window.startQuiz && window.startQuiz());
    await page.waitForTimeout(1500);
    const trackBtn = await page.$('.qz-track button');
    if (trackBtn) {
      await trackBtn.click();
      writeLog('FLOW', '已点击理科卷,等待题目加载…');
    } else {
      writeLog('FLOW', '未找到选科按钮!');
    }
    await page.waitForTimeout(4000);
    const hasQ = await page.$('.qz-q');
    writeLog('FLOW', hasQ ? '题目已正常加载 ✓' : '题目未加载 ✗(看日志找原因)');
    await page.screenshot({ path: 'debug-quiz.png' });
    writeLog('SHOT', '已保存截图 debug-quiz.png');
  }

  await page.waitForTimeout(Math.max(0, (WAIT_S - 5) * 1000));
  await page.screenshot({ path: 'debug-final.png' });
  writeLog('SHOT', '已保存截图 debug-final.png');
  await browser.close();
  writeLog('END', '调试完成,完整日志见 browser-debug.log');
  logStream.end();
})().catch(e => { writeLog('FATAL', e.message); process.exit(1); });
