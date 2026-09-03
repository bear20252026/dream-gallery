// ui/coord-hud.js — 世界坐标读数栏(2026-09-03 新增,便于远程沟通"我在哪")
// 需求来源:用户要一眼看到自己站在世界坐标的哪个点,好把坐标报给我定位问题。
// 设计要点:
//   ① 只读数不改状态 —— 不注册 overlay(不是弹层),容器 pointer-events:none,仅按钮可点
//   ② 节流 100ms 写 DOM,不每帧重排
//   ③ F3 切换显隐;点击标题栏折叠;「复制坐标」一键把 X/Y/Z 抄进剪贴板
//   ④ 明确标注 Y=高度 —— three.js 是 Y-up,和建筑图纸/Blender 的 Z-up 相反,最易混淆
//
// 坐标系速查(three.js 右手系,Y-up):
//   +X 东   -X 西   +Z 南   -Z 北   +Y 上(高度)
//   yaw=0 视线朝 -Z(北);yaw 增大向西转(俯视逆时针)

export function mountCoordHUD(ctx) {
  if (typeof document === 'undefined') return null;
  const el = document.createElement('div');
  el.id = 'coordHud';
  // 位置:右上角中部,避开左上任务卡(z=75)与右上小地图/罗盘。right:14 贴右,
  // top:50% 垂直居中后用 transform 锚定,带 4px 边距给罗盘右侧留空。
  el.style.cssText =
    'position:fixed;top:50%;right:14px;transform:translateY(-50%);z-index:60;pointer-events:none;' +
    'background:rgba(22,15,20,0.82);border:1px solid rgba(255,214,170,0.32);' +
    'border-radius:10px;padding:8px 10px;color:#ffe2c4;' +
    'font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;' +
    'text-shadow:0 1px 2px rgba(0,0,0,.8);user-select:none;backdrop-filter:blur(3px);' +
    'min-width:138px;text-align:right';

  const head = document.createElement('div');
  head.textContent = '世界坐标 · Y=高度';
  head.title = 'three.js 右手系 Y-up:+X 东 / -X 西 / +Z 南 / -Z 北 / +Y 上。点击折叠,F3 开关';
  head.style.cssText =
    'pointer-events:auto;cursor:pointer;letter-spacing:1px;opacity:.85;' +
    'border-bottom:1px solid rgba(255,214,170,0.22);padding-bottom:4px;margin-bottom:5px';

  const body = document.createElement('div');
  const rows = {};
  const mk = (label, hint) => {
    const r = document.createElement('div');
    r.style.cssText = 'display:flex;gap:6px;align-items:baseline;justify-content:flex-end';
    const k = document.createElement('span');
    k.textContent = label;
    k.style.cssText = 'opacity:.62;width:26px;display:inline-block;text-align:left';
    const v = document.createElement('span');
    v.textContent = '—';
    v.style.cssText = 'min-width:62px;display:inline-block;font-variant-numeric:tabular-nums';
    const u = document.createElement('span');
    u.textContent = hint || '';
    u.style.cssText = 'opacity:.45;font-size:11px';
    r.append(u, v, k); // 右对齐:单位-数值-标签
    body.appendChild(r);
    rows[label.trim()] = v;
    return r;
  };
  mk('X', '东+ / 西-');
  mk('Y', '高度');
  mk('Z', '南+ / 北-');
  mk('向', '');
  mk('FPS', '');

  const copyBtn = document.createElement('button');
  copyBtn.textContent = '复制坐标';
  copyBtn.style.cssText =
    'pointer-events:auto;margin-top:6px;width:100%;padding:4px;border-radius:6px;cursor:pointer;' +
    'border:1px solid rgba(255,214,170,0.3);background:rgba(60,40,25,0.6);color:#ffe2c4;' +
    'font:11px/1.4 inherit;letter-spacing:1px';

  el.append(head, body, copyBtn);
  document.body.appendChild(el);

  let last = '';
  copyBtn.addEventListener('click', async () => {
    const t = last;
    try {
      await navigator.clipboard.writeText(t);
      copyBtn.textContent = '已复制 ✓';
    } catch (e) {
      // 非 HTTPS / 无剪贴板权限时回退:选中文本由用户自行 Ctrl+C
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      copyBtn.textContent = document.execCommand('copy') ? '已复制 ✓' : '复制失败';
      ta.remove();
    }
    setTimeout(() => (copyBtn.textContent = '复制坐标'), 1200);
  });

  let folded = false;
  head.addEventListener('click', () => {
    folded = !folded;
    body.style.display = folded ? 'none' : '';
    copyBtn.style.display = folded ? 'none' : '';
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F3') {
      e.preventDefault();
      el.style.display = el.style.display === 'none' ? '' : 'none';
    }
  });

  // 8 方位:yaw 语义见文件头(0=北,π/2=西,π=南,3π/2=东 → 俯视逆时针)
  const DIRS = ['北', '西北', '西', '西南', '南', '东南', '东', '东北'];
  const f1 = (n) => (n >= 0 ? ' ' : '') + n.toFixed(1);

  let acc = 0;
  ctx.onTick((dt) => {
    acc += dt || 0;
    if (acc < 0.1) return; // 10Hz 刷新,肉眼够用且几乎零开销
    acc = 0;
    const pl = ctx.player && ctx.player.pl;
    if (!pl) return;
    const p = pl.p;
    const yaw = pl.y || 0;
    let a = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const dir = DIRS[Math.round(a / (Math.PI / 4)) % 8];
    const deg = Math.round((a * 180) / Math.PI);
    const fps = ctx.loopManager ? Math.round(ctx.loopManager.fps || 0) : 0;
    rows['X'].textContent = f1(p.x);
    rows['Y'].textContent = f1(p.y);
    rows['Z'].textContent = f1(p.z);
    rows['向'].textContent = dir + ' ' + deg + '°';
    rows['FPS'].textContent = String(fps);
    last = `X ${p.x.toFixed(1)}  Y ${p.y.toFixed(1)}  Z ${p.z.toFixed(1)}  朝${dir}(${deg}°)`;
  });

  return el;
}
