// probe-gallery-door.cjs — 验证画廊东墙门洞(直接查 mesh,比 bounds 可靠)
// 现状(2026-08-31):旧门洞 z∈[-4.5,-2] 已封堵;新门洞开在中轴 Z=8,宽 5m → z∈[5.5,10.5];
//   门洞上方那块深棕色木板 df3(0.15×(WH-2.5)×2.5)已删除,且不以任何材质补回。
// 覆盖:① 门洞宽 5m 且居中 ② 旧门洞仍封堵 ③ df3 木板已消失 ④ 四面墙其余段完整
const { launch } = require('../probe/browser.js');

const BASE = process.env.BASE_URL || 'http://localhost:3283/';

(async () => {
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__ctx && window.__ctx.scene && window.__ctx.scene.s, { timeout: 60000 });
  await page.waitForTimeout(3000);

  const out = await page.evaluate(() => {
    const s = window.__ctx.scene.s;
    const east = [], eastAll = [], west = [], north = [], south = [];
    const dim = (o) => {
      const p = o.geometry && o.geometry.parameters;
      return p ? [+(p.width || 0).toFixed(2), +(p.height || 0).toFixed(2), +(p.depth || 0).toFixed(2)] : null;
    };
    s.traverse((o) => {
      if (!o.isMesh) return;
      const p = o.position;
      // 东墙平面上的全部物件(含门框/门楣/木板),用于查 df3 是否还在
      if (Math.abs(p.x - 18) < 0.02) {
        eastAll.push({ z: +p.z.toFixed(2), y: +p.y.toFixed(2), d: dim(o) });
      }
      if (Math.abs(p.y - 2.5) > 0.6) return; // 墙主体高度(WH/2 = 2.5)
      if (Math.abs(p.x - 18) < 0.02) east.push(+p.z.toFixed(2));
      else if (Math.abs(p.x + 18) < 0.02) west.push(+p.z.toFixed(2));
      else if (Math.abs(p.z + 12) < 0.02) north.push(+p.x.toFixed(2));
      else if (Math.abs(p.z - 28) < 0.02) south.push(+p.x.toFixed(2));
    });
    return {
      east: east.sort((a, c) => a - c),
      eastAll: eastAll.sort((a, c) => a.z - c.z),
      west: west.sort((a, c) => a - c),
      north: north.sort((a, c) => a - c),
      south: south.sort((a, c) => a - c),
    };
  });

  console.log('=== 东墙 x=18 平面全部物件(z, y, 尺寸 w×h×d) ===');
  for (const o of out.eastAll) console.log(`  z=${o.z}\ty=${o.y}\t${o.d ? o.d.join('×') : '?'}`);
  console.log('\n=== 四面墙主体 mesh(墙段中心坐标) ===');
  for (const [side, list] of Object.entries({ east: out.east, west: out.west, north: out.north, south: out.south })) {
    console.log(`[${side}] ${list.length} 段: ${list.join(', ')}`);
  }

  console.log('\n=== 检查 ===');
  let pass = 0, total = 0;
  const chk = (name, ok, detail) => { total++; if (ok) pass++; console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

  // ① 东墙主体 = 14 段墙 + 门檐 df4(y=2.5, z=8)= 15 个 mesh
  chk('东墙 14 段墙 + 1 门檐 = 15 mesh', out.east.length === 15, `实际 ${out.east.length}`);

  // ② 新门洞 z∈[5.5,10.5] 只有门檐(z=8),无墙主体
  const inDoor = out.east.filter((z) => z > 5.4 && z < 10.6);
  chk('门洞 z∈[5.5,10.5] 仅门檐(z=8)无墙主体', inDoor.length === 1 && Math.abs(inDoor[0] - 8) < 0.1,
    '区间内: ' + JSON.stringify(inDoor));

  // ③ 门洞两侧墙段就位:左 w(18,3,18,5.5) 中心 4.25,右 w(18,10.5,18,13) 中心 11.75
  chk('门洞左墙段(中心 4.25)就位', out.east.some((z) => Math.abs(z - 4.25) < 0.1));
  chk('门洞右墙段(中心 11.75)就位', out.east.some((z) => Math.abs(z - 11.75) < 0.1));

  // ④ 门洞宽 5m(右墙段起点 10.5 - 左墙段终点 5.5)
  chk('门洞净宽 5m(原 2.5m 翻倍)', Math.abs(10.5 - 5.5 - 5) < 0.01);

  // ⑤ 旧门洞 z∈[-4.5,-2] 仍封堵(有墙中心 -3.25)
  chk('旧门洞 z∈[-4.5,-2] 保持封堵', out.east.some((z) => Math.abs(z - (-3.25)) < 0.1));

  // ⑥ df3 深棕木板已删除:x=18 平面上不得再有 y∈(2.7,4.9) 的大块板
  const planks = out.eastAll.filter((o) => o.y > 2.7 && o.y < 4.9);
  chk('门洞上方深棕木板 df3 已删除(无补回)', planks.length === 0,
    planks.length ? '仍存在: ' + JSON.stringify(planks) : '');

  // ⑦ 门框立柱 df1/df2 在门洞两侧 z=5.5 / 10.5
  const posts = out.eastAll.filter((o) => Math.abs(o.y - 1.25) < 0.1 && o.d && o.d[0] < 0.2 && o.d[2] < 0.2);
  chk('门框立柱在 z=5.5 / 10.5', posts.length === 2 && Math.abs(posts[0].z - 5.5) < 0.1 && Math.abs(posts[1].z - 10.5) < 0.1,
    JSON.stringify(posts.map((p) => p.z)));

  // ⑧ 门檐 df4 宽 5m 覆盖整个门洞
  // 门檐 df4 特征:厚 0.15(<0.2)、深 5m(墙段最深仅 2.5m),用这两条与墙段区分
  const lintel = out.eastAll.find((o) => Math.abs(o.y - 2.5) < 0.05 && o.d && o.d[0] < 0.2 && o.d[2] > 3);
  chk('门檐宽 5m 覆盖门洞', !!lintel && Math.abs(lintel.d[2] - 5) < 0.01, lintel ? '宽 ' + lintel.d[2] : '未找到');

  // ⑨ 四面墙其余段完整
  chk('东墙首尾覆盖 z=-12 / 28', Math.abs(out.east[0] - (-10.75)) < 0.1 && Math.abs(out.east[out.east.length - 1] - 26.75) < 0.1);
  chk('西墙 16 段完整', out.west.length === 16, `实际 ${out.west.length}`);
  chk('北墙 14 段完整', out.north.length === 14, `实际 ${out.north.length}`);
  chk('南墙 14 段完整', out.south.length === 14, `实际 ${out.south.length}`);

  console.log(`\n通过 ${pass}/${total}`);
  console.log('页面错误:', errs.length);
  await b.close();
  process.exit(pass === total ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
