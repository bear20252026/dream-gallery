// 线上 avatar 加载验证(2026-08-29) — CSP 修复后确认 FBX 能拉取成功
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + String(e).slice(0, 400)));
await page.goto('http://127.0.0.1:39000/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(()=>{});
// avatar 36MB FBX 下载 + 3 次重试逻辑,给足时间
await page.waitForTimeout(30000);
const status = await page.evaluate(() => {
  const out = {};
  // avatar 状态是动态创建的 fixed 顶栏 div(无 id),按行内样式特征匹配
  const candidates = [...document.querySelectorAll('body > div')].filter(
    (el) => (el.style.cssText || '').includes('top:12px') && (el.style.cssText || '').includes('border-radius:20px')
  );
  const node = candidates[candidates.length - 1];
  out.avatarStatus = node ? node.textContent.trim() : '(未找到 avatar 状态元素)';
  out.statusCount = candidates.length;
  out.bodyLen = (document.body.innerText || '').length;
  return out;
});
console.log('-- avatar 状态 --');
console.log(JSON.stringify(status, null, 2));
console.log('-- 相关日志 --');
const rel = logs.filter((l) => /avatar|加载失败|csp|content security|fbx|fetch/i.test(l));
rel.slice(0, 20).forEach((l) => console.log('  ' + l));
console.log('(其余日志 %d 条)', logs.length - rel.length);
try { await page.screenshot({ path: 'live-avatar.png' }); console.log('截图: live-avatar.png'); } catch (e) {}
await browser.close();
