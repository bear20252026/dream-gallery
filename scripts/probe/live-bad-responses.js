// 抓所有 >=400 响应 URL(2026-08-29)
import { chromium } from 'playwright-core';
const URL = process.argv[2] || 'http://127.0.0.1:39000/';
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const bad = [];
page.on('response', async (resp) => {
  const s = resp.status();
  if (s >= 400) bad.push(`${s} ${resp.request().method()} ${resp.url()}`);
});
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(()=>{});
await page.waitForTimeout(15000);
console.log('>=400 响应 (%d):', bad.length);
[...new Set(bad)].forEach((l) => console.log('  ' + l));
await browser.close();
