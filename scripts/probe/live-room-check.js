// live-room-check.js — 实测线上房间:两客户端能否连上 /ws 并互相看到
// 用法: node live-room-check.js
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const out = [];
const log = (s) => { out.push(s); console.log(s); };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const CODE = 'PROB' + Math.floor(Math.random() * 900 + 100);
  const url = (name) => `https://cloudbear.cloud/room.html?code=${CODE}&name=${name}`;

  const makePage = async (name) => {
    const page = await browser.newPage();
    page.on('console', (m) => { if (m.type() === 'error') log(`[${name}][console.error] ${m.text()}`); });
    page.on('pageerror', (e) => log(`[${name}][PAGE_ERROR] ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400) log(`[${name}][HTTP ${r.status()}] ${r.url()}`); });
    await page.goto(url(name), { waitUntil: 'domcontentloaded', timeout: 60000 });
    return page;
  };

  const A = await makePage('Alice');
  const B = await makePage('Bob');

  const read = async (page, name) => {
    const count = await page.$eval('#hudCount', (e) => e.textContent).catch(() => '?');
    const banner = await page.$eval('#banner', (e) => ({ text: e.textContent, disp: getComputedStyle(e).display })).catch(() => ({}));
    const canvas = await page.$eval('#room-c canvas', (c) => ({ w: c.width, h: c.height })).catch(() => null);
    log(`[${name}] hudCount=${count} banner=${JSON.stringify(banner)} canvas=${JSON.stringify(canvas)}`);
  };

  await page_sleep(4000);
  await read(A, 'Alice');
  await read(B, 'Bob');

  // B 发一条聊天,A 应收到
  await B.fill('#chatInput', 'hello-from-bob').catch(() => {});
  await B.click('#chatSend').catch(() => {});
  await page_sleep(1500);
  const aChat = await A.$eval('#chatLog', (e) => e.textContent).catch(() => '');
  log(`[relay] Alice 收到聊天内容: "${aChat.trim()}"`);

  // 检查 A 是否能看到 B 的位置(通过把远端玩家数打到 HUD 之外——这里只能间接判断:再开 C)
  await page_sleep(500);
  await read(A, 'Alice');
  await read(B, 'Bob');

  await A.close(); await B.close();
  await browser.close();
  fs.writeFileSync(path.join(__dirname, 'live-room-check.log'), out.join('\n') + '\n');
})().catch((e) => { log('FATAL ' + e.message); process.exit(1); });

function page_sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
