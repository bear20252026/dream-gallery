// 批量地理位置补写 — 增量保存，每查一条就写 gate_data.json
const fs = require('fs');
const path = '/opt/gallery/gate_data.json';

const g = JSON.parse(fs.readFileSync(path, 'utf8'));
if (!g.geo) g.geo = {};

// 清掉占位符和假值
['::1', '127.0.0.1', '::ffff:127.0.0.1', undefined].forEach(k => { if (k !== undefined) delete g.geo[k]; });

// 收集所有真实 IP（去重）
const seen = new Set();
const ips = [];
Object.values(g.applicants || {}).forEach(a => {
  const ip = String(a.ip || '').replace('::ffff:', '');
  if (!ip || ip === '127.0.0.1' || ip === '::1' || seen.has(ip)) return;
  if (g.geo[ip]) return; // 已有结果（含"未知"）跳过
  seen.add(ip);
  ips.push(ip);
});

console.log('待查询 IP 数:', ips.length);
if (ips.length === 0) { console.log('无需查询'); process.exit(0); }

let idx = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function save() {
  fs.writeFileSync(path + '.tmp', JSON.stringify(g, null, 2));
  fs.renameSync(path + '.tmp', path);
}

async function next() {
  if (idx >= ips.length) {
    await save();
    console.log('全部完成，共写入', ips.length, '条');
    process.exit(0);
  }
  const ip = ips[idx++];
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch('http://ip-api.com/json/' + encodeURIComponent(ip) + '?lang=zh-CN&fields=status,regionName,city', { signal: ctrl.signal });
    clearTimeout(t);
    const d = await r.json();
    let geo = '未知';
    if (d.status === 'success') {
      geo = (d.regionName || '') + (d.city && d.city !== d.regionName ? ' ' + d.city : '');
      geo = geo.trim() || '未知';
    }
    g.geo[ip] = geo;
    console.log(ip, '→', geo);
  } catch (e) {
    g.geo[ip] = '未知';
    console.log(ip, '→ 未知 (查询失败)');
  }
  // 每 3 条保存一次 + 每次间隔 1.5s（防 ip-api 限速 45/min）
  if (idx % 3 === 0) await save();
  await sleep(1500);
  await next();
}

next();
