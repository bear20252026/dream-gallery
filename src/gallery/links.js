// links.js — 超链接图标系统(数据驱动版,2026-07-25 重构)
// 配置数组 + 通用构造函数;加链接只改 ICON_CFG/PLANET_CFG
// 特殊件单独成节:情书卷轴(isLink)、月球(isLink2)、滚动古文(isLink3)、秘密花园(isGarden)
import * as THREE from 'three';
import { buildIcons, decoLight } from './link-icons.js';
import { ctx } from '../ctx.js';
import { hotBegin, hotEnd } from '../hot.js';
hotBegin('links');
const { s, iG, onTick } = ctx;

// 通用:canvas 平面图标
// 平面图标配置/建造已拆分 gallery/link-icons.js(2026-09-20;加链接改 link-icons 的 ICON_CFG)
buildIcons(s, iG);
// ===================== 行星配置(isLink5/6/7 通用球体) =====================
// {key,r,pos,emissive,ei,rough,light,spin,draw(画球面纹理)}
const PLANET_CFG = [
  {
    key: 'isLink5',
    r: 0.45,
    pos: [-15.7, 2.5, -1],
    emissive: '#c1440e',
    ei: 0.08,
    rough: 0.85,
    light: ['#ffdd00', 2, 5],
    spin: 0.004,
    draw(x) {
      // 火星
      x.fillStyle = '#c1440e';
      x.fillRect(0, 0, 512, 256);
      for (let i = 0; i < 15; i++) {
        const cx = Math.random() * 512,
          cy = Math.random() * 256,
          r = 10 + Math.random() * 25;
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(80,30,10,0.6)');
        g.addColorStop(1, 'rgba(80,30,10,0)');
        x.fillStyle = g;
        x.beginPath();
        x.arc(cx, cy, r, 0, Math.PI * 2);
        x.fill();
      }
      for (let i = 0; i < 20; i++) {
        const cx = Math.random() * 512,
          cy = Math.random() * 256,
          r = 5 + Math.random() * 15;
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(220,140,80,0.4)');
        g.addColorStop(1, 'rgba(220,140,80,0)');
        x.fillStyle = g;
        x.beginPath();
        x.arc(cx, cy, r, 0, Math.PI * 2);
        x.fill();
      }
      const pg = x.createRadialGradient(256, 0, 0, 256, 0, 60);
      pg.addColorStop(0, 'rgba(240,240,255,0.7)');
      pg.addColorStop(1, 'rgba(240,240,255,0)');
      x.fillStyle = pg;
      x.beginPath();
      x.arc(256, 0, 60, 0, Math.PI * 2);
      x.fill();
    },
  },
  {
    key: 'isLink6',
    r: 0.5,
    pos: [15.7, 2.5, -1],
    emissive: '#D4AF37',
    ei: 0.1,
    rough: 0.7,
    light: ['#D4AF37', 2, 5],
    spin: 0.003,
    draw(x) {
      // 木星
      const bands = ['#d4a86a', '#c9956b', '#e8c89a', '#b0784a', '#deb887', '#a06838'];
      for (let y = 0; y < 256; y += 8) {
        x.fillStyle = bands[Math.floor(y / 8) % bands.length];
        x.fillRect(0, y, 512, 8);
      }
      const rg = x.createRadialGradient(350, 128, 0, 350, 128, 45);
      rg.addColorStop(0, 'rgba(180,60,40,0.85)');
      rg.addColorStop(1, 'rgba(180,60,40,0)');
      x.fillStyle = rg;
      x.beginPath();
      x.arc(350, 128, 45, 0, Math.PI * 2);
      x.fill();
      for (let i = 0; i < 30; i++) {
        x.fillStyle = `rgba(${120 + Math.random() * 80},${80 + Math.random() * 60},40,0.3)`;
        x.beginPath();
        x.ellipse(
          Math.random() * 512,
          Math.random() * 256,
          10 + Math.random() * 20,
          3 + Math.random() * 6,
          0,
          0,
          Math.PI * 2
        );
        x.fill();
      }
    },
  },
  {
    key: 'isLink7',
    r: 0.42,
    pos: [0, 2.5, 5.7],
    emissive: '#4488ff',
    ei: 0.08,
    rough: 0.75,
    light: ['#bf40ff', 3, 5],
    spin: 0.005,
    draw(x) {
      // 地球
      x.fillStyle = '#1a5276';
      x.fillRect(0, 0, 512, 256);
      for (let i = 0; i < 12; i++) {
        const cx = Math.random() * 512,
          cy = Math.random() * 256,
          r = 20 + Math.random() * 40;
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(34,139,34,0.8)');
        g.addColorStop(1, 'rgba(34,139,34,0)');
        x.fillStyle = g;
        x.beginPath();
        x.arc(cx, cy, r, 0, Math.PI * 2);
        x.fill();
      }
      for (let i = 0; i < 8; i++) {
        const cy = Math.random() * 256;
        x.fillStyle = 'rgba(255,255,255,0.25)';
        x.beginPath();
        x.ellipse(
          Math.random() * 512,
          cy,
          30 + Math.random() * 50,
          4 + Math.random() * 8,
          0,
          0,
          Math.PI * 2
        );
        x.fill();
      }
    },
  },
];

for (const cfg of PLANET_CFG) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 256;
  cfg.draw(cv.getContext('2d'));
  const tex = new THREE.CanvasTexture(cv);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: cfg.rough,
    metalness: 0.05,
    emissive: cfg.emissive,
    emissiveIntensity: cfg.ei,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(cfg.r, 32, 32), mat);
  mesh.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
  s.add(mesh);
  decoLight(cfg.light[0], cfg.light[1], cfg.light[2], [
    cfg.pos[0] + 0.2,
    cfg.pos[1],
    cfg.pos[2] - 0.2,
  ], s);
  mesh.userData = { [cfg.key]: true };
  iG.push(mesh);
  onTick(function () {
    mesh.rotation.y += cfg.spin;
  });
}

// ===================== 特殊件 1:情书卷轴(isLink,带换文案钩子) =====================
(function () {
  const bc = document.createElement('canvas');
  bc.width = 512;
  bc.height = 256;
  const bx = bc.getContext('2d');
  const bg = bx.createLinearGradient(0, 0, 512, 256);
  bg.addColorStop(0, 'rgba(90,20,50,0.92)');
  bg.addColorStop(1, 'rgba(40,10,30,0.92)');
  bx.fillStyle = bg;
  bx.fillRect(0, 0, 512, 256);
  bx.lineWidth = 4;
  bx.strokeStyle = 'rgba(255,220,230,0.9)';
  bx.strokeRect(10, 10, 492, 236);
  bx.fillStyle = '#ffffff';
  bx.font = 'bold 48px Arial';
  bx.textAlign = 'center';
  bx.fillText('了解更多', 256, 110);
  bx.font = '28px Arial';
  bx.fillStyle = 'rgba(255,255,255,0.8)';
  bx.fillText('Click to Open', 256, 170);
  const bTex = new THREE.CanvasTexture(bc);
  // 换文案钩子(模式系统用):普通模式重写为《元素共鸣准则》,特殊模式恢复「了解更多」
  function redraw(title, sub) {
    const g = bx.createLinearGradient(0, 0, 512, 256);
    g.addColorStop(0, 'rgba(90,20,50,0.92)');
    g.addColorStop(1, 'rgba(40,10,30,0.92)');
    bx.fillStyle = g;
    bx.fillRect(0, 0, 512, 256);
    bx.lineWidth = 4;
    bx.strokeStyle = 'rgba(255,220,230,0.9)';
    bx.strokeRect(10, 10, 492, 236);
    bx.fillStyle = '#ffffff';
    bx.textAlign = 'center';
    if (title.length <= 6) {
      bx.font = 'bold 44px Arial';
      bx.fillText(title, 256, 110);
    } else {
      bx.font = 'bold 36px Arial';
      bx.fillText(title, 256, 105);
    }
    bx.font = '26px Arial';
    bx.fillStyle = 'rgba(255,255,255,0.8)';
    bx.fillText(sub || '', 256, 170);
    bTex.needsUpdate = true;
  }
  ctx.media.scrollLink = { redraw };
  const bMat = new THREE.MeshStandardMaterial({
    map: bTex,
    transparent: true,
    side: THREE.DoubleSide,
    emissive: '#ff80a0',
    emissiveIntensity: 0.2,
  });
  const btn = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), bMat);
  // 放在回字大厅东墙(x=16)内侧，面朝西
  btn.position.set(15.7, 2.2, 17);
  btn.rotation.y = -Math.PI / 2;
  s.add(btn);
  decoLight('#ff80a0', 2, 4, [15.5, 2.2, 17], undefined, s);
  // 添加到可交互数组
  btn.userData = { isLink: true };
  iG.push(btn);
})();

// ===================== 特殊件 2:月球(isLink2) =====================
(function () {
  const moonGeo = new THREE.SphereGeometry(0.4, 32, 32);
  const moonCv = document.createElement('canvas');
  moonCv.width = 512;
  moonCv.height = 256;
  const mx = moonCv.getContext('2d');
  // 月球表面
  const g = mx.createLinearGradient(0, 0, 512, 256);
  g.addColorStop(0, '#c8c8c8');
  g.addColorStop(1, '#a0a0a0');
  mx.fillStyle = g;
  mx.fillRect(0, 0, 512, 256);
  // 环形山
  for (let i = 0; i < 40; i++) {
    const cx = Math.random() * 512,
      cy = Math.random() * 256,
      r = 3 + Math.random() * 12;
    const g2 = mx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g2.addColorStop(0, 'rgba(160,160,160,0.8)');
    g2.addColorStop(1, 'rgba(140,140,140,0)');
    mx.fillStyle = g2;
    mx.beginPath();
    mx.arc(cx, cy, r, 0, Math.PI * 2);
    mx.fill();
  }
  // 暗区（月海）
  for (let i = 0; i < 6; i++) {
    const cx = Math.random() * 512,
      cy = Math.random() * 256,
      r = 15 + Math.random() * 30;
    const g3 = mx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g3.addColorStop(0, 'rgba(90,90,90,0.5)');
    g3.addColorStop(1, 'rgba(90,90,90,0)');
    mx.fillStyle = g3;
    mx.beginPath();
    mx.arc(cx, cy, r, 0, Math.PI * 2);
    mx.fill();
  }
  const moonTex = new THREE.CanvasTexture(moonCv);
  const moonMat = new THREE.MeshStandardMaterial({
    map: moonTex,
    roughness: 0.9,
    metalness: 0.05,
    emissive: '#888888',
    emissiveIntensity: 0.1,
  });
  const moon = new THREE.Mesh(moonGeo, moonMat);
  moon.position.set(-15.7, 2.5, 17);
  s.add(moon);
  decoLight('#d4a574', 3, 5, [-15.5, 2.5, 17], undefined, s);
  // 浮动+自转动画
  let st = 0;
  function floatMoon() {
    st += 0.02;
    moon.position.y = 2.5 + Math.sin(st) * 0.08;
    moon.rotation.y += 0.005;
  }
  onTick(floatMoon);
  moon.userData = { isLink2: true };
  iG.push(moon);
})();

// ===================== 特殊件 3:爱心花园入口(isGarden) =====================
(function () {
  const g = new THREE.Group();
  // 圆形底板（深绿色花园风）
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.06, 32),
    new THREE.MeshStandardMaterial({ color: 0x2d5a1e, roughness: 0.4, metalness: 0.3 })
  );
  base.rotation.x = Math.PI / 2;
  g.add(base);
  // 金色边框环
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.03, 16, 32),
    new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.2, metalness: 0.8 })
  );
  g.add(ring);
  // 心形Canvas
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const x = c.getContext('2d');
  x.save();
  x.translate(128, 128);
  x.scale(0.9, 0.9);
  x.beginPath();
  x.moveTo(0, 80);
  x.bezierCurveTo(-90, 10, -140, 40, -140, -30);
  x.bezierCurveTo(-140, -120, -50, -160, 0, -200);
  x.bezierCurveTo(50, -160, 140, -120, 140, -30);
  x.bezierCurveTo(140, 40, 90, 10, 0, 80);
  x.closePath();
  const grad = x.createRadialGradient(0, -60, 10, 0, -60, 120);
  grad.addColorStop(0, '#ff6b8a');
  grad.addColorStop(0.5, '#ff1744');
  grad.addColorStop(1, '#c62828');
  x.fillStyle = grad;
  x.fill();
  x.lineWidth = 6;
  x.strokeStyle = '#ff8a80';
  x.stroke();
  x.beginPath();
  x.ellipse(-35, -100, 25, 18, Math.PI / 4, 0, Math.PI * 2);
  x.fillStyle = 'rgba(255,255,255,0.35)';
  x.fill();
  x.restore();
  x.fillStyle = 'rgba(255,220,200,0.9)';
  x.font = 'bold 18px serif';
  x.textAlign = 'center';
  x.fillText('秘密花园', 128, 230);
  const tex = new THREE.CanvasTexture(c);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.8),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  face.position.z = 0.035;
  g.add(face);
  // 位置：回字大厅内南墙，面朝北
  g.position.set(0, 2.5, 17.7);
  g.rotation.y = Math.PI;
  s.add(g);
  // 粉色光环
  decoLight('#ff6b8a', 2, 4, [0, 0, 0.5], g, s);
  g.userData = { isGarden: true };
  iG.push(g);
  // 呼吸动画
  let t = 0;
  function breathe() {
    t += 0.02;
    g.scale.setScalar(1 + Math.sin(t) * 0.04);
  }
  onTick(breathe);
})();

// ===================== 特殊件 4:A/B走廊滚动古文(isLink3) =====================
// 2026-07-31:男女两段合并,取消性别分别
(function () {
  const maleText =
    '挥手从兹去。更那堪凄然相向，苦情重诉。眼角眉梢都似恨，热泪欲零还住。知误会前番书语。过眼滔滔云共雾，算人间知己吾和汝。人有病，天知否？今朝霜重东门路，照横塘半天残月，凄清如许。汽笛一声肠已断，从此天涯孤旅。凭割断愁丝恨缕。要似B612崩绝壁，又恰像台风扫寰宇。重比翼，和云翥。横空出世，莽B612，阅尽人间春色。飞起玉龙三百万，搅得周天寒彻。夏日消溶，江河横溢，人或为鱼鳖。千秋功罪，谁人曾与评说？而今我谓B612：不要这高，不要这多雪。安得倚天抽宝剑，把汝裁为三截？一截遗欧，一截赠美，一截还东国。太平世界，环球同此凉热。云开衡岳积阴止，天马凤凰春树里。年少峥嵘屈贾才，山川奇气曾钟此。君行吾为发浩歌，鲲鹏击浪从兹始。洞庭湘水涨连天，艨艟巨舰直东指。无端散出一天愁，幸被东风吹万里。丈夫何事足萦怀，要将宇宙看稊米。沧海横流安足虑，世事纷纭从君理。管却自家身与心，胸中日月常新美。名世于今五百年，诸公碌碌皆余子。平浪官前友谊多，崇明对马衣带水。东瀛濯剑有书还，我返自崖君去矣。';
  const femaleText =
    '有女公子者，瑶华毓秀，琼树含章。年甫十八，春煦方浓；性本贞闲，秋澄比洁。承紫微之精曜，秉坤厚之淑灵。幼娴内则，长擅外仪。德耀璜佩，容光璎珞。早膺凤藻之选，入奉鸾掖之清班。步玉墀而珩璜有节，捧彤管而云霞生色。兰台列侍，已沐天家之渥；凤藻承恩，弥深夙夜之诚。时值上元，还家故园。立春应序，万象维新。萱堂相见，慈颜共话；兰阶叙旧，笑语同欢。或当中宵静夜，独披锦卷而诵宫箴。虽被华衮之荣，愈怀冰玉之洁；虽居凤阙之邃，常存葵藿之诚。登楼则望故山，步阁以舒远目；涉园则寻旧径，缘水以寄幽情。太液澄波，临流而鉴玉貌；上林芳树，倚槛以寄遐心。榴火初明，映其丹靥之艳，恰应宫闱之瑞；玉茗吐萼，比其皓质之清，宛合阆苑之姿。汀溆回环，恰似故园之曲；烟霞舒卷，宛如旧梦之痕。顾恩思义，惕然自省；秉德怀仁，谦以持身。雅操绿绮，一弹则韵生林樾；兼工彤管，数染则色染烟霞。今者德音四达，令望九驰。簪缨仰其风裁，闺壶奉为仪则。然其襟怀朗月，气度春晖。虽绾银槎之贵，不矜不伐；虽被翟茀之华，惟敬惟和。瑶编纪其徽范，兰闺诵其嘉言。诚所谓贵而能谦，荣而能谨者也。方今凤藻增辉，榴花耀日，怡红快绿，俱呈瑞霭；蓬岛长春，潇湘云暖，衔山抱水，蔚然深秀。声闻天阙，光动星躔。他日鸾舆贲临，凤池叠庆，则门庭增辉，奕世流芳。今之览者，览其懿范，仰其清芬，当知榴火年年，永昭淑景；凤池岁岁，长映瑶华。斯诚邦家之祯祥，闺门之仪则矣。';
  const fullText = maleText + femaleText;
  const W = 1024,
    H = 512,
    fontSize = 42;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const cx2 = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    emissive: '#d4a8c8',
    emissiveIntensity: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const bgColor = 'rgba(100,60,100,0.15)';
  const textColor = 'rgba(240,220,240,';
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), mat);
  mesh.position.set(0, 2.2, -11.5); // A/B走廊北墙内侧
  mesh.rotation.y = 0; // 面朝+z/南方，从走廊走过来正面可读
  s.add(mesh);
  mesh.userData = { isLink3: true }; // 传送门链接移植到滚动文字上
  iG.push(mesh);
  // 分句（每句约15-20字）
  const sentences = [];
  let buf = '';
  for (let i = 0; i < fullText.length; i++) {
    buf += fullText[i];
    if (/[。；]/.test(fullText[i]) && buf.length >= 10) {
      sentences.push(buf);
      buf = '';
    }
  }
  if (buf) sentences.push(buf);
  let idx = 0,
    alpha = 0,
    phase = 'in',
    t = 0,
    holdT = 0;
  function draw() {
    t += 0.012;
    // 淡入淡出
    if (phase === 'in') {
      alpha += 0.015;
      if (alpha >= 1) {
        alpha = 1;
        phase = 'hold';
        holdT = 0;
      }
    } else if (phase === 'hold') {
      holdT++;
      if (holdT > 120) {
        phase = 'out';
      }
    } else if (phase === 'out') {
      alpha -= 0.015;
      if (alpha <= 0) {
        alpha = 0;
        idx = (idx + 1) % sentences.length;
        phase = 'in';
      }
    }
    // 绘制
    cx2.clearRect(0, 0, W, H);
    cx2.fillStyle = bgColor;
    cx2.fillRect(0, 0, W, H);
    cx2.fillStyle = textColor + alpha + ')';
    cx2.font = 'bold ' + fontSize + 'px "Noto Serif SC", serif';
    cx2.textAlign = 'center';
    cx2.textBaseline = 'middle';
    // 每句换行显示，最多2行
    const lines = sentences[idx].match(/.{1,20}/g) || [sentences[idx]];
    lines.slice(0, 2).forEach((line, i) => {
      cx2.fillText(line, W / 2, H / 2 + (i - 0.5) * (fontSize + 10));
    });
    tex.needsUpdate = true;
  }
  onTick(draw);
})();

hotEnd('links');
if (import.meta.hot) import.meta.hot.accept();
