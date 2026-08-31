// probe-gallery-door.cjs — 验证画廊东墙门洞位置(直接查墙主体 mesh,比 bounds 可靠)
// 墙主体特征:x 精确 = ±18(东/西墙) 或 z 精确 = -12/28(北/南墙),y ≈ WH/2 = 2.5
// 覆盖:① 旧门洞 z∈[-4.5,-2] 已封堵 ② 新门洞 z∈[6.75,9.25](中轴 Z=8) 已开通
//      ③ 东墙 16 段完整无缺失 ④ 门洞装饰(门框/门楣)已移到新门位置
const { launch } = require('../probe/browser.js');

(async () => {
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await page.goto('http://localhost:3281/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__ctx && window.__ctx.scene && window.__ctx.scene.s, { timeout: 60000 });
  await page.waitForTimeout(3000);

  const out = await page.evaluate(() => {
    const s = window.__ctx.scene.s;
    const east = [], west = [], north = [], south = [];
    s.traverse((o) => {
      if (!o.isMesh) return;
      const p = o.position;
      if (Math.abs(p.y - 2.5) > 0.6) return; // 只看墙主体高度
      if (Math.abs(p.x - 18) < 0.02) east.push(+p.z.toFixed(2));
      else if (Math.abs(p.x + 18) < 0.02) west.push(+p.z.toFixed(2));
      else if (Math.abs(p.z + 12) < 0.02) north.push(+p.x.toFixed(2));
      else if (Math.abs(p.z - 28) < 0.02) south.push(+p.x.toFixed(2));
    });
    return { east: east.sort((a, c) => a - c), west: west.sort((a, c) => a - c), north: north.sort((a, c) => a - c), south: south.sort((a, c) => a - c) };
  });

  console.log('=== 画廊外墙主体 mesh(墙段中心坐标) ===');
  for (const [side, list] of Object.entries(out)) {
    console.log(`\n[${side}] ${list.length} 段`);
    console.log('  ' + list.join(', '));
  }

  console.log('\n=== 检查 ===');
  let pass = 0, total = 0;
  const chk = (name, ok, detail) => { total++; if (ok) pass++; console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

  // ① 东墙 16 段 w() 调用全部画出(门洞那一段压根没调用 w,所以仍是 16 段)
  //    再加门檐装饰 df4 (x=18, y=2.5, z=8) 落在同一过滤条件内 → 共 17 个 mesh
  chk('东墙 16 段墙 + 1 门檐装饰 = 17 mesh', out.east.length === 17, `实际 ${out.east.length} 段`);

  // ② 旧门洞 z∈[-4.5,-2] 已封堵 → 应有墙中心 z=-3.25
  const oldSealed = out.east.some((z) => Math.abs(z - (-3.25)) < 0.1);
  chk('旧门洞 z∈[-4.5,-2] 已封堵(有墙中心 -3.25)', oldSealed);

  // ③ 新门洞 z∈[6.75,9.25] 已开通 → 该区间内不应有墙主体,只有门檐装饰(z=8)
  const inDoor = out.east.filter((z) => z > 6.7 && z < 9.3);
  const newOpen = inDoor.length === 1 && Math.abs(inDoor[0] - 8) < 0.1;
  chk('新门洞 z∈[6.75,9.25] 已开通(区间内仅门檐装饰 z=8)', newOpen,
    '区间内: ' + JSON.stringify(inDoor));

  // ④ 门洞两侧墙段就位:左侧 w(18,5.5,18,6.75) 中心 6.125,右侧 w(18,9.25,18,10.5) 中心 9.875
  chk('新门洞左墙段(中心 6.13)就位', out.east.some((z) => Math.abs(z - 6.13) < 0.1));
  chk('新门洞右墙段(中心 9.88)就位', out.east.some((z) => Math.abs(z - 9.88) < 0.1));

  // ⑤ 东墙首尾覆盖 z=-12~28
  chk('东墙覆盖 z=-12(首段中心 -10.75)', Math.abs(out.east[0] - (-10.75)) < 0.1, `首段 ${out.east[0]}`);
  chk('东墙覆盖 z=28(末段中心 26.75)', Math.abs(out.east[out.east.length - 1] - 26.75) < 0.1, `末段 ${out.east[out.east.length - 1]}`);

  // ⑤ 其他三面墙完整(西 16 段, 北 14 段, 南 14 段)
  chk('西墙 16 段完整', out.west.length === 16, `实际 ${out.west.length}`);
  chk('北墙 14 段完整', out.north.length === 14, `实际 ${out.north.length}`);
  chk('南墙 14 段完整', out.south.length === 14, `实际 ${out.south.length}`);

  console.log(`\n通过 ${pass}/${total}`);
  console.log('页面错误:', errs.length);
  await b.close();
  process.exit(pass === total ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
