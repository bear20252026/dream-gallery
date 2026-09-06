// scene.js — 场景/相机/渲染器初始化 + 墙壁/地板/屋顶 + 天空系统 + 灯光 + 天空时间控制
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { createPaperTerrainMaterial, updatePaperTerrain } from './paper-floor.js'; // 山河舆图·纸质地形地板(2026-08-29)
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'; // 婚礼拱廊外壳加载(museum.js 同款静态导入,项目验证过)
import { LAYOUT } from './layout.mjs'; // 建筑布局尺寸唯一源(2026-09-07 P4)

const L = document.getElementById('l'),
  C = document.getElementById('c'),
  jT = document.getElementById('jt'),
  jB = document.getElementById('jb'),
  aB = document.getElementById('ab'),
  hP = document.getElementById('hp');
// 电脑端显示操作提示
if (!('ontouchstart' in window)) hP.style.display = 'block';

const s = new THREE.Scene();
s.background = null; // 天空球提供背景
s.fog = new THREE.FogExp2('#C8B88A', 0.006); // 指数雾(密度对齐西域线性雾手感;挂画放大景深虚化依赖 density)
const rnd = new THREE.WebGLRenderer({ antialias: true });
rnd.setPixelRatio(Math.min(devicePixelRatio, 2));
rnd.setSize(innerWidth, innerHeight);
rnd.outputColorSpace = THREE.SRGBColorSpace;
C.appendChild(rnd.domElement);
// 着色器错误检查会同步调 getProgramInfoLog,阻塞主线程直到 GPU 驱动编译完成
// (59 盏点光源的 MeshStandardMaterial shader 极大,单个程序编译 1~5 秒;
// 材质首次入镜才编译 → 运行时"走到哪卡到哪",视频被拖成 PPT,实测占主线程 50%)。
// 关掉后改走 KHR_parallel_shader_compile 异步编译:程序未就绪的物体暂不渲染,主线程不冻结。
// 排障时在 URL 加 ?shaderdebug 恢复同步诊断(test-mobile.js 的着色器错误检查依赖它)。
rnd.debug.checkShaderErrors = location.search.includes('shaderdebug');
// 诊断钩子:perf-probe.js 读 renderer.info(程序数/帧数)用
window.__rnd = rnd;
// 手机 WebView 内存吃紧时 WebGL 上下文可能被系统回收:自动刷新恢复,避免停在"页面已崩溃"
rnd.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  location.reload();
});
const cam = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 2000);
cam.rotation.order = 'YXZ';

// 射线检测/指针向量/可交互数组/纹理加载器：供 media/paintings 等模块共享，提前创建
const ray = new THREE.Raycaster(),
  mP2 = new THREE.Vector2();
const iG = []; // 可交互画框数组
const tL = new THREE.TextureLoader();
// 降采样纹理加载:手机原图(3000~4000px)直接传 GPU 极占内存,限制 1024 足够清晰
// 手机端降到 512(屏幕小看不出差别,单张显存 4MB→1MB,大幅降低崩溃率)
// 注意:three.js 纹理首次上传后尺寸不可再变(GL 报错/画面发白),
// 所以画布一开始就是固定尺寸,图片加载后画进同一画布,绝不 resize
// 规则(2026-07-24):答题通过(ctx.player.quizPassed)前不加载室内图片——
// 未进馆时带宽全留给室外大屏轮播;通过后统一放行,画框先显示占位色
const isMobile = 'ontouchstart' in window && Math.min(screen.width, screen.height) < 768;
const TEX_CAP = isMobile ? 512 : 1024;
const pendingTex = [];
let texGateTimer = null;
// 距离懒加载(2026-07-25):带坐标的纹理只在玩家 35m 内加载,弱网/弱 GPU 省首屏
const NEAR_D2 = 35 * 35;
const nearPending = [];
let nearTimer = null;
function loadTexCapped(url, onErr, pos) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = TEX_CAP;
  const cx2 = cv.getContext('2d');
  cx2.fillStyle = '#e8e0e4';
  cx2.fillRect(0, 0, TEX_CAP, TEX_CAP);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  let tries = 0,
    queued = false,
    noThumb = false;
  // 缩略图优先(gen-thumbs.js 预生成 photos/thumbs/*.webp),404 回退原图
  const thumbUrl =
    /^photos\//.test(url) && !/\.webp$/i.test(url)
      ? url.replace(/\.[^.]+$/, '.webp').replace(/^photos\//, 'photos/thumbs/')
      : url;
  // 本人上传媒体令牌(2026-07-27 血泪①:QQ 浏览器图片代理改用代理 UA 请求 <img>,dk 对不上 → 403 粉框;
  // 血泪②:令牌必须 attempt 内现取——loadTexCapped 常在 refreshMode 拉回 myUploadTokens 之前启动,
  //         外层一次性取值会让三次重试全部裸奔 403 → 粉框)
  function tok(u) {
    const t = (ctx.mode.myUploadTokens || {})[u.split('/').pop().split('?')[0]];
    return t ? u + '?mt=' + t : u;
  }
  function attempt() {
    // 距离门禁:给了坐标且玩家还远,挂进距离队列,走近再加载
    if (pos && ctx.player.pl) {
      const dx = pos.x - ctx.player.pl.p.x,
        dz = pos.z - ctx.player.pl.p.z;
      if (dx * dx + dz * dz > NEAR_D2) {
        if (!nearPending.includes(attempt)) nearPending.push(attempt);
        if (!nearTimer)
          nearTimer = setInterval(() => {
            for (let i = nearPending.length - 1; i >= 0; i--) {
              const f = nearPending.splice(i, 1)[0];
              f();
            }
            if (!nearPending.length) {
              clearInterval(nearTimer);
              nearTimer = null;
            }
          }, 1500);
        return;
      }
    }
    // 答题门禁:未通过前把加载请求挂起,通过后在定时器里统一放行
    // 模式门禁(mode.js):普通模式下 loadTexCapped 只放行演示照片和本人上传(ctx.mode.texAllowed 按 url 判断)
    if (!ctx.player.quizPassed || (ctx.mode.texAllowed && !ctx.mode.texAllowed(url))) {
      if (!queued) {
        queued = true;
        pendingTex.push(attempt);
      }
      if (!texGateTimer)
        texGateTimer = setInterval(() => {
          if (!ctx.player.quizPassed) return;
          // 全部重试:每个 attempt 自己再过一遍门禁,放行的加载,仍拦的自己重排队重武装
          // (曾按创建者的 url 判定,图库照片永久拦 → 整个队列卡死,2026-07-25 血泪)
          clearInterval(texGateTimer);
          texGateTimer = null;
          pendingTex.splice(0).forEach((fn) => fn());
        }, 800);
      return;
    }
    queued = false;
    const img = new Image();
    img.onload = function () {
      cx2.drawImage(img, 0, 0, TEX_CAP, TEX_CAP);
      tex.needsUpdate = true;
    };
    img.onerror = function () {
      // 缩略图 404 先回退原图(置 noThumb,后续重试直接拉原图——img.src 读出的是绝对路径,
      // 曾用 indexOf(thumbUrl) 判断永远为假,新上传无缩略图的照片全部重试缩略图到失败,2026-07-25 血泪);
      // 原图再失败重试 3 次(间隔1s),仍失败才走 onErr 占位
      if (!noThumb && thumbUrl !== url) {
        noThumb = true;
        img.src = tok(url);
        return;
      }
      if (++tries < 4) setTimeout(attempt, 1000);
      else if (onErr) onErr();
    };
    img.src = noThumb ? tok(url) : tok(thumbUrl);
  }
  attempt();
  return tex;
}

// ===================== 整体布局(尺寸唯一源:layout.mjs,2026-09-07 P4 数据化) =====================
// 上方展厅区: z = -12 ~ 6（保留原A-G展厅）
// 下方回字大厅: z = 6 ~ 28（新增，内墙禁区 z=11~23）
// 整体范围: x=-18~18, z=-12~28
const OL = LAYOUT.outerWest,
  OR = LAYOUT.outerEast,
  OT = LAYOUT.outerNorth,
  OBE = LAYOUT.outerSouthEx; // 展厅区边界 (E=exhibition)
const OBR = LAYOUT.outerSouth; // 整体最南端 (R=rectangular hall)
const WH = LAYOUT.ceilingHeight; // 天花板高度5m（抬高1/4）
const IL = LAYOUT.innerWest,
  IR = LAYOUT.innerEast,
  IRT = LAYOUT.innerNorth,
  IRB = LAYOUT.innerSouth; // 回字内墙禁区边界
ctx.scene.layout = LAYOUT; // 探针/工具可读的布局单一源
const bounds = [];
// 碰撞盒移除门面(B4 整改):gate 等外部模块不再直接 indexOf/splice 本数组
ctx.scene.removeBounds = function (list) {
  for (const b of list) {
    const i = bounds.indexOf(b);
    if (i >= 0) bounds.splice(i, 1);
  }
};
ctx.scene.addBounds = function (list) {
  for (const b of list) bounds.push(b);
};
const wI = []; // 墙壁信息数组
// ===================== 婚礼拱廊外壳(C方案·全体大装修,2026-09-03) =====================
// 用婚礼拱廊 GLB(models/hall/wedding-arch.glb, CC-BY 4.0, 署名见 CREDITS.md)整体替换
// 原始建筑的可见外观:三段拱廊沿 z 覆盖 36×40 全馆,旧外围墙隐藏但保留碰撞(边界不破),
// 内墙保留挂画并刷暖白以配大理石风格。回滚开关:置 false 即恢复旧外观,零残留。
const WEDDING_SHELL = true;
const ARCH_SCL = 36 / 27.6; // 拱廊长轴 27.6m → 对齐原馆东西向 36m
// 古典装饰材质（深棕色带光泽）:腰线/门框装饰线 与 踢脚线 分开,房屋换色可独立染色
const decoM = new THREE.MeshStandardMaterial({ color: '#4a2510', roughness: 0.4, metalness: 0.15 });
const baseM = new THREE.MeshStandardMaterial({ color: '#3a1d0c', roughness: 0.4, metalness: 0.15 });
// 天花板(可换色):平整顶面,默认米白
// 可染色注册表(housecolor.js 分组染色;换色仅自己可见;ceil 组在屋顶创建处填入)
const houseMats = { wall: [], base: [baseM], deco: [decoM], ceil: [] };

function w(x1, z1, x2, z2) {
  const dx = x2 - x1,
    dz = z2 - z1,
    len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.3) return;
  const cx = (x1 + x2) / 2,
    cz = (z1 + z2) / 2,
    ang = Math.atan2(dx, dz);
  const hue = 335 + Math.random() * 20;
  const wallMat = new THREE.MeshStandardMaterial({
    // 婚礼拱廊装修:内墙刷暖白(近似大理石),配合白拱+木格栅天花;关闭开关恢复随机粉
    color: WEDDING_SHELL
      ? new THREE.Color('hsl(40,18%,86%)')
      : new THREE.Color(`hsl(${hue},45%,70%)`),
    roughness: WEDDING_SHELL ? 0.85 : 0.92,
    metalness: 0.02,
  });
  houseMats.wall.push(wallMat); // 房屋换色(housecolor.js)分组染色
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.3, WH, len), wallMat);
  wall.position.set(cx, WH / 2, cz);
  wall.rotation.y = ang;
  s.add(wall);
  const sA = Math.abs(Math.sin(ang)),
    cA = Math.abs(Math.cos(ang));
  const bBox = {
    mnX: cx - ((sA * len) / 2 + cA * 0.2) - 0.1,
    mxX: cx + ((sA * len) / 2 + cA * 0.2) + 0.1,
    mnZ: cz - ((cA * len) / 2 + sA * 0.2) - 0.1,
    mxZ: cz + ((cA * len) / 2 + sA * 0.2) + 0.1,
  };
  // 婚礼拱廊装修:标记外围墙(四至边线)的碰撞盒,供外壳装配时整批移除。
  //   不标记的话旧房隐形墙会把落地窗全堵死——看得见通、走不过去(2026-09-03 用户反馈)
  if (WEDDING_SHELL)
    bBox.perim =
      (x1 === x2 && (x1 === OL || x1 === OR)) || (z1 === z2 && (z1 === OT || z1 === OBR));
  bounds.push(bBox);
  wI.push({ x1, z1, x2, z2, cx, cz, ang, len, mesh: wall, bases: [], tubes: [] });
  // 法线方向（版本27验证：cos(ang), -sin(ang)）
  const pX = Math.cos(ang),
    pZ = -Math.sin(ang);
  // 踢脚线：墙两侧（正面+反面）
  // 内侧（走廊方向）
  const bm1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, len), baseM);
  bm1.userData = { isBaseboard: true }; // 标记为踢脚线，挂画系统排除
  bm1.position.set(cx + pX * 0.2, 0.05, cz + pZ * 0.2);
  bm1.rotation.y = ang;
  s.add(bm1);
  // 外侧（场景外方向）
  const bm2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, len), baseM);
  bm2.userData = { isBaseboard: true }; // 标记为踢脚线，挂画系统排除
  bm2.position.set(cx - pX * 0.2, 0.05, cz - pZ * 0.2);
  bm2.rotation.y = ang;
  s.add(bm2);
  wI[wI.length - 1].bases.push(bm1, bm2); // 婚礼拱廊装修:外围墙隐藏时一并隐藏
}

// ===== 外围（覆盖整体范围） =====
// 北墙 z=-12, x=-18~18 (36m) → 14段
w(-18, -12, -15.5, -12);
w(-15.5, -12, -13, -12);
w(-13, -12, -10.5, -12);
w(-10.5, -12, -8, -12);
w(-8, -12, -5.5, -12);
w(-5.5, -12, -3, -12);
w(-3, -12, -0.5, -12);
w(-0.5, -12, 2, -12);
w(2, -12, 4.5, -12);
w(4.5, -12, 7, -12);
w(7, -12, 9.5, -12);
w(9.5, -12, 12, -12);
w(12, -12, 14.5, -12);
w(14.5, -12, 18, -12);
// 东墙 x=18, z=-12~28 (40m) → 16段
// 2026-08-31 用户要求:旧门洞 z∈[-4.5,-2] 偏离中轴线(gallery z 范围 -12~28,中轴 Z=8)有 10m,
//   不对称 → 封堵;改在中轴线 Z=8 开一道等宽(2.5m)的新门洞 z∈[6.75,9.25]。
// ⚠️ 2026-08-31 排坑:原代码把「被注释掉的墙段」和「后续墙段」写在同一行
//   (...w(18,-7,18,-4.5);//w(18,-4.5,18,-2);//门洞z∈[-4.5,-2]w(18,-2,18,0.5);...w(18,25.5,18,28);)
//   JS 的 // 一直吃到行尾 → 第二个 // 之后的所有 w() 调用(z=-2~28,共 30m)全部被注释,
//   东墙后半段 30 米从来没画过墙,整面东墙一直是敞开的(玩家可从东侧直接走进画廊)。
//   这就是旧"门洞"实际是个洞的原因。现改为每段墙独占一行,门洞位置用独立注释行标明。
w(18, -12, 18, -9.5);
w(18, -9.5, 18, -7);
w(18, -7, 18, -4.5);
w(18, -4.5, 18, -2);
w(18, -2, 18, 0.5);
w(18, 0.5, 18, 3);
w(18, 3, 18, 5.5);
// ↑ 新门洞 z∈[5.5,10.5](中轴 Z=8,宽 5m)—— 此处不画墙(2.5m 太窄,2026-08-31 加宽一倍)
w(18, 10.5, 18, 13);
w(18, 13, 18, 15.5);
w(18, 15.5, 18, 18);
w(18, 18, 18, 20.5);
w(18, 20.5, 18, 23);
w(18, 23, 18, 25.5);
w(18, 25.5, 18, 28);
//门洞装饰(2026-08-31:旧门洞 z∈[-4.5,-2] → 中轴线新门洞 x=18, z∈[5.5,10.5])
//   门框立柱 df1/df2 + 门楣横梁 df4;原 df3(门洞上方那块 0.15×(WH-2.5)×2.5 的深棕木板)
//   按用户要求 2026-08-31 直接删除,且不以任何材质补回——门洞通高到屋顶。
const df1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.5, 0.12), decoM);
df1.position.set(18, 1.25, 5.5);
s.add(df1);
const df2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.5, 0.12), decoM);
df2.position.set(18, 1.25, 10.5);
s.add(df2);
const df4 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 5), decoM);
df4.position.set(18, 2.5, 8);
s.add(df4);
// 南墙 z=28, x=-18~18 (36m) → 14段
w(-18, 28, -15.5, 28);
w(-15.5, 28, -13, 28);
w(-13, 28, -10.5, 28);
w(-10.5, 28, -8, 28);
w(-8, 28, -5.5, 28);
w(-5.5, 28, -3, 28);
w(-3, 28, -0.5, 28);
w(-0.5, 28, 2, 28);
w(2, 28, 4.5, 28);
w(4.5, 28, 7, 28);
w(7, 28, 9.5, 28);
w(9.5, 28, 12, 28);
w(12, 28, 14.5, 28);
w(14.5, 28, 18, 28);
// 西墙 x=-18, z=-12~28 (40m) → 16段
w(-18, -12, -18, -9.5);
w(-18, -9.5, -18, -7);
w(-18, -7, -18, -4.5);
w(-18, -4.5, -18, -2);
w(-18, -2, -18, 0.5);
w(-18, 0.5, -18, 3);
w(-18, 3, -18, 5.5);
w(-18, 5.5, -18, 8);
w(-18, 8, -18, 10.5);
w(-18, 10.5, -18, 13);
w(-18, 13, -18, 15.5);
w(-18, 15.5, -18, 18);
w(-18, 18, -18, 20.5);
w(-18, 20.5, -18, 23);
w(-18, 23, -18, 25.5);
w(-18, 25.5, -18, 28);

// ===== 原展厅A-G（版本27布局，长墙分割）=====
// A左上 z=-12~-6
w(-18, -6, -15.5, -6);
w(-15.5, -6, -13, -6);
w(-13, -6, -10.5, -6);
w(-10.5, -6, -8, -6);
w(-5.5, -6, -4, -6);
w(-4, -12, -4, -9.5);
w(-4, -9.5, -4, -8);
// B右上 z=-12~-6
w(4, -6, 5.5, -6);
w(8, -6, 10.5, -6);
w(10.5, -6, 13, -6);
w(13, -6, 15.5, -6);
w(15.5, -6, 18, -6);
w(4, -12, 4, -9.5);
w(4, -9.5, 4, -8);
// C左中 z=-6~0
w(-18, 0, -15.5, 0);
w(-15.5, 0, -13, 0);
w(-13, 0, -10.5, 0);
w(-10.5, 0, -8, 0);
w(-5.5, 0, -4, 0);
w(-4, -6, -4, -4);
w(-4, -4, -4, -2);
w(-4, -2, -4, 0);
// D右中 z=-6~0
w(6, 0, 8.5, 0);
w(8.5, 0, 11, 0);
w(11, 0, 13.5, 0);
w(13.5, 0, 18, 0);
w(4, -6, 4, -4);
w(4, -4, 4, -2);
w(4, -2, 4, 0);
// E中下 z=0~6
w(-4, 6, -1.5, 6);
w(1.5, 6, 4, 6); // 门洞 x∈[-1.5,1.5]
w(-4, 4, -4, 4.5);
w(-4, 5.5, -4, 6);
w(4, 4, 4, 4.5);
w(4, 5.5, 4, 6);
// F左下 z=6~12
w(-18, 6, -10, 6);
w(-8, 6, -4, 6); // 门洞 x∈[-10,-8]
w(-4, 6, -4, 8.5);
w(-4, 8.5, -4, 10);
w(-4, 11, -4, 12);
// G右下 z=6~12
w(4, 6, 8, 6);
w(10, 6, 18, 6); // 门洞 x∈[8,10]
w(4, 6, 4, 8.5);
w(4, 8.5, 4, 10);
w(4, 11, 4, 12);
// 展示台
w(-1.5, 8, 1.5, 8);

// ===== 回字形大厅内墙（版本27布局，带门洞，长墙分割）=====
// 内北墙（z=11），北门洞 x∈[-2,2]
w(-7, 11, -4.5, 11);
w(-4.5, 11, -2, 11);
w(2, 11, 4.5, 11);
w(4.5, 11, 7, 11);
// 内南墙（z=23），南门洞 x∈[-2,2]
w(-7, 23, -4.5, 23);
w(-4.5, 23, -2, 23);
w(2, 23, 4.5, 23);
w(4.5, 23, 7, 23);
// 内西墙（x=-7），西门洞 z∈[15.5,18.5]
w(-7, 11, -7, 13.5);
w(-7, 13.5, -7, 15.5);
w(-7, 18.5, -7, 21);
w(-7, 21, -7, 23);
// 内东墙（x=7），东门洞 z∈[15.5,18.5]
w(7, 11, 7, 13.5);
w(7, 13.5, 7, 15.5);
w(7, 18.5, 7, 21);
w(7, 21, 7, 23);

// ===== 墙壁圆润化装饰（整边圆角管包裹）=====
const edgeTubeMat = new THREE.MeshStandardMaterial({
  color: '#c07080',
  roughness: 0.4,
  metalness: 0.2,
});
wI.forEach((wi) => {
  const pX = Math.cos(wi.ang),
    pZ = -Math.sin(wi.ang); // 法线（正面方向）
  const tX = Math.sin(wi.ang),
    tZ = Math.cos(wi.ang); // 切线（沿墙方向）
  const off = 0.17; // 管中心到墙表面的距离
  // 正面四根管状圆角条
  const tubeR = 0.07,
    seg = 6;
  // 顶边管（沿墙长度，在顶部）
  const topT = new THREE.Mesh(new THREE.CylinderGeometry(tubeR, tubeR, wi.len, seg), edgeTubeMat);
  topT.rotation.x = Math.PI / 2;
  topT.rotation.z = wi.ang;
  topT.position.set(wi.cx + pX * off, WH - 0.05, wi.cz + pZ * off);
  s.add(topT);
  // 底边管（沿墙长度，在底部/地板处）
  const botT = new THREE.Mesh(new THREE.CylinderGeometry(tubeR, tubeR, wi.len, seg), edgeTubeMat);
  botT.rotation.x = Math.PI / 2;
  botT.rotation.z = wi.ang;
  botT.position.set(wi.cx + pX * off, 0.05, wi.cz + pZ * off);
  s.add(botT);
  // 左边管（沿墙高度，在墙起始端）
  const lT = new THREE.Mesh(new THREE.CylinderGeometry(tubeR, tubeR, WH, seg), edgeTubeMat);
  lT.position.set(wi.x1 + tX * 0.15 + pX * off, WH / 2, wi.z1 + tZ * 0.15 + pZ * off);
  s.add(lT);
  // 右边管（沿墙高度，在墙结束端）
  const rT = new THREE.Mesh(new THREE.CylinderGeometry(tubeR, tubeR, WH, seg), edgeTubeMat);
  rT.position.set(wi.x2 - tX * 0.15 + pX * off, WH / 2, wi.z2 - tZ * 0.15 + pZ * off);
  s.add(rT);
  wi.tubes.push(topT, botT, lT, rT); // 婚礼拱廊装修:外围墙隐藏时一并隐藏
});

// ===================== 婚礼拱廊外壳装配（C方案,2026-09-03） =====================
// 旧外围墙(含踢脚线/圆角管)与东门框隐藏,但 bounds 保留——碰撞边界不破,门洞仍通行;
// 三段拱廊实例沿 z 均布覆盖 36×40 全馆(单段 36×14.1×6.65m,南端外挑 2.3m 入沙漠);
// 挂画墙筛选(paintings.js)同步排除隐藏墙,挂画自动重分配到内墙。
if (WEDDING_SHELL) {
  const isPerimeter = (wi) =>
    (wi.x1 === wi.x2 && (wi.x1 === OL || wi.x1 === OR)) ||
    (wi.z1 === wi.z2 && (wi.z1 === OT || wi.z1 === OBR));
  wI.forEach((wi) => {
    if (!isPerimeter(wi)) return;
    wi.mesh.visible = false;
    wi.bases.forEach((b) => (b.visible = false));
    wi.tubes.forEach((t) => (t.visible = false));
  });
  df1.visible = df2.visible = df4.visible = false; // 东门框让位拱廊柱
  // 拆掉旧外围墙的碰撞盒:拱廊是开敞建筑,落地窗应当可以径直走出去(用户要求,不设权限)。
  //   内墙(展厅隔断/回字内墙)碰撞保留——那是实心墙,照旧挡人。
  const perimB = bounds.filter((b) => b.perim);
  ctx.scene.removeBounds(perimB);
  console.log('[wedding] 旧外围隐形墙碰撞已移除 ×' + perimB.length);
  // 三段实例:几何共享 1 份,显存只多 2 份矩阵
  // ✅ 用顶部静态导入的 GLTFLoader(museum.js/dome-towers.js 同款,项目内验证过);
  //    之前用动态 import 引 vendor 副本在此模块上下文始终失败且无日志(2026-09-03 排坑)
  try {
    new GLTFLoader().load(
      '/models/hall/wedding-arch.glb',
      (g) => {
        const base = g.scene;
        base.scale.setScalar(ARCH_SCL);
        const box = new THREE.Box3().setFromObject(base);
        const ctr = box.getCenter(new THREE.Vector3());
        base.position.x -= ctr.x; // 长轴中心对 x=0
        base.position.z -= ctr.z;
        base.position.y -= box.min.y; // 底面贴地
        // ---- 碰撞:只给实心柱子建盒(2026-09-03 用户拍板"玻璃可穿、柱子不可穿") ----
        // 实测(脚本 scripts/probe/dump-arch-aabb.cjs,世界坐标):
        //   Square_Pillar ×26  0.96×3.81×0.98m  y 0.36~4.16  → 实心,加碰撞
        //   Line(窗框)+Shape(窗框)+玻璃材质     y 0.31~5.4   → 落地窗,不挡人
        //   Box233(地板薄板)                     y 0.24~0.36  → 那是地面,不能挡
        //   Arch / Support / pasted__Planks / Rectangle 全在 y≥4.03 头顶,天然不参与脚底碰撞
        // ⚠️ 2026-09-07 主人报「南出口有透明墙」:旧法在 base 居中后先量局部 AABB,再按
        //    pb+dz 推算各段世界盒——与实例最终渲染位置错位,南门正中留下一根隐形柱。
        //    改为:每段实例 add 进场景、updateMatrixWorld 后,从其 Square_Pillar 的
        //    **最终世界 AABB** 实测注册,碰撞与所见永不脱节。
        const segD = 10.8 * ARCH_SCL; // 14.09m 每段进深
        let pillarHits = 0;
        const addPillarBounds = (inst) => {
          inst.updateMatrixWorld(true);
          inst.traverse((o) => {
            if (!o.isMesh || !/^Square_Pillar/.test(o.name || '')) return;
            const bb = new THREE.Box3().setFromObject(o);
            bounds.push({
              mnX: bb.min.x,
              mxX: bb.max.x,
              mnZ: bb.min.z,
              mxZ: bb.max.z,
              mnY: bb.min.y,
              mxY: bb.max.y,
            });
            pillarHits++;
          });
        };
        for (let i = 0; i < 3; i++) {
          const dz = OT + segD / 2 + i * segD;
          const inst = i === 0 ? base : base.clone(true);
          inst.position.z = dz;
          inst.name = 'weddingShell' + i; // 验收探针按此名定位
          s.add(inst);
          addPillarBounds(inst);
        }
        console.log('[wedding] 拱廊外壳已装填 ×3,柱子碰撞盒 +' + pillarHits + '(世界 AABB 实测)');
      },
      undefined,
      (e) => console.error('[wedding] GLB 加载失败:', e)
    );
  } catch (e) {
    console.error('[wedding] loader 同步异常:', e);
  }
}

// ===================== 地板（画廊内部拼花）+ 云影外部地面 =====================
const floorW = OR - OL; // 36
const floorD = OBR - OT; // 40
// 原拼花地板贴图(floor_tile.png)已被下方「山河舆图」纸质地形材质取代,纹理不再加载
// 山河舆图地板:Chartogne 式纸质地形(高度图起伏+纸纹+等高线金描),细分以支持顶点位移
const paperFloorMat = createPaperTerrainMaterial({
  height: 0.22,
  contours: 13,
  lineColor: '#c9a96e',
});
const floorM = new THREE.Mesh(new THREE.PlaneGeometry(floorW, floorD, 120, 132), paperFloorMat);
floorM.rotation.x = -Math.PI / 2;
floorM.position.z = (OT + OBR) / 2;
s.add(floorM);
// 自包含逐帧驱动(uTime 用于纸面微流动;起伏为纯视觉,不参与碰撞)
ctx.onTick(() => updatePaperTerrain(paperFloorMat, performance.now() * 0.001));

// 云影外部地面（覆盖建筑周围大片区域）

// ============ 云影地面 ============
const groundUniforms = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunHeight: { value: 1.0 },
  uCloudCoverage: { value: 0.55 },
  uWindSpeed: { value: 0.3 },
  uCameraPos: { value: new THREE.Vector3() },
  uDetail: { value: 0.5 },
  uScale: { value: 1.0 },
};
const groundMat = new THREE.ShaderMaterial({
  uniforms: groundUniforms,
  vertexShader: `
    varying vec3 vWorldPos;
    void main(){
      vec4 wp=modelMatrix*vec4(position,1.0);
      vWorldPos=wp.xyz;
      gl_Position=projectionMatrix*viewMatrix*wp;
    }
  `,
  fragmentShader: `
    precision highp float;
    varying vec3 vWorldPos;
    uniform float uTime;
    uniform vec3 uSunDir;
    uniform float uSunHeight;
    uniform float uCloudCoverage;
    uniform float uWindSpeed;
    uniform vec3 uCameraPos;
    uniform float uDetail;
    uniform float uScale;
    
float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f*f*(3.0-2.0*f);
  float a = hash21(i);
  float b = hash21(i+vec2(1.0,0.0));
  float c = hash21(i+vec2(0.0,1.0));
  float d = hash21(i+vec2(1.0,1.0));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for(int i=0;i<5;i++){
    v += a * vnoise(p);
    p = rot * p * 2.02 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}
float sampleCloud(vec2 uv, float time, float coverage, float wind, float detail, float scale){
  vec2 p = uv * 0.045 / scale;
  p += vec2(time * wind * 0.4, time * wind * 0.1);
  vec2 q = vec2(
    vnoise(p * 1.3 + vec2(0.0, time * 0.04)),
    vnoise(p * 1.3 + vec2(5.2, 1.3) + vec2(time * 0.035, 0.0))
  );
  float base = fbm(p + q * 0.7);
  float det = fbm(p * 3.0 + 11.3 + q * 0.4);
  float covField = vnoise(p * 0.2 + vec2(time * 0.025, time * 0.018) + 17.3);
  float effCov = coverage + (covField - 0.5) * 0.55;
  effCov = clamp(effCov, 0.0, 1.0);
  float d = base + det * detail * 0.35;
  d = d - (1.0 - effCov) * 0.85;
  d = smoothstep(0.0, 0.28, d);
  return d;
}

    void main(){
      vec3 pos=vWorldPos;
      vec3 gColor;
      if(uSunHeight>0.3){
        gColor=vec3(0.93,0.94,0.96);
      }else if(uSunHeight>0.0){
        float f=uSunHeight/0.3;
        gColor=mix(vec3(0.96,0.72,0.55),vec3(0.93,0.94,0.96),f);
      }else{
        float f=clamp(-uSunHeight/0.3,0.0,1.0);
        gColor=mix(vec3(0.93,0.94,0.96),vec3(0.18,0.20,0.28),f);
      }
      vec2 grid=abs(fract(pos.xz*0.5)-0.5);
      float gline=min(grid.x,grid.y);
      float gfac=1.0-smoothstep(0.0,0.025,gline);
      float dist=length(pos.xz-uCameraPos.xz);
      float gfade=1.0-smoothstep(15.0,55.0,dist);
      gColor=mix(gColor,gColor*0.78,gfac*gfade*0.55);
      vec3 sunDir=normalize(uSunDir);
      float cloudY=80.0;
      float t=(cloudY-pos.y)/max(sunDir.y,0.04);
      vec2 cuv=pos.xz+sunDir.xz*t;
      float shadow=sampleCloud(cuv,uTime,uCloudCoverage,uWindSpeed,uDetail,uScale);
      float shStrength=smoothstep(0.0,0.45,uSunHeight);
      shadow*=shStrength*0.62;
      gColor=mix(gColor,gColor*0.38,shadow);
      vec3 fogCol;
      if(uSunHeight>0.3){
        fogCol=vec3(0.78,0.88,0.96);
      }else if(uSunHeight>0.0){
        float f=uSunHeight/0.3;
        fogCol=mix(vec3(0.96,0.58,0.38),vec3(0.78,0.88,0.96),f);
      }else{
        float f=clamp(-uSunHeight/0.3,0.0,1.0);
        fogCol=mix(vec3(0.78,0.88,0.96),vec3(0.07,0.09,0.16),f);
      }
      float fogF=smoothstep(35.0,180.0,dist);
      gColor=mix(gColor,fogCol,fogF);
      gColor=pow(gColor,vec3(1.0/2.2));
      gl_FragColor=vec4(gColor,1.0);
    }
  `,
});

const groundGeo = new THREE.PlaneGeometry(2000, 2000, 1, 1);
groundGeo.rotateX(-Math.PI / 2);
const groundM = new THREE.Mesh(groundGeo, groundMat);
// 云影地面停用:沙海地形接管近处地面,远处由西域天空背景+雾兜底
groundM.visible = false;
groundM.position.y = -8; // 沉到沙海最低洼地(-6.5m)之下,即使恢复显示也不会穿出土丘
s.add(groundM);

// ===================== 屋顶（从外部可见）====================
// 屋顶 Mesh(外看是屋顶,内看是天花板;换色组 ceil)
const roofMat = new THREE.MeshStandardMaterial({
  color: '#e8e0d5',
  roughness: 0.85,
  side: THREE.DoubleSide,
});
const roof = new THREE.Mesh(new THREE.PlaneGeometry(floorW, floorD), roofMat);
roof.rotation.x = Math.PI / 2;
roof.position.y = WH;
roof.position.z = (OT + OBR) / 2;
s.add(roof);

// 屋顶上方薄层（增加厚度感）
const roofThickM = new THREE.MeshStandardMaterial({ color: '#d0c8bd', roughness: 0.9 });
const roofThick = new THREE.Mesh(new THREE.BoxGeometry(floorW, 0.15, floorD), roofThickM);
roofThick.position.y = WH + 0.08;
roofThick.position.z = (OT + OBR) / 2;
s.add(roofThick);
houseMats.ceil.push(roofMat, roofThickM);
// 婚礼拱廊装修:整块平屋顶隐藏,拱廊木格栅天花接管(金缮补天奖励在拱廊态暂不可见)
if (WEDDING_SHELL) {
  roof.visible = false;
  roofThick.visible = false;
}

// ===================== 金缮天花板(2026-07-28 C1,补天 100% 奖励,设计文档第 9 步钦定) =====================
// 天穹 100% 后:天花板换为半透明金缮纹理——天空透过,淡金色愈合纹路如瓷器金缮;
// 玩家抬头注视时纹路微微发亮(0.55→0.95 缓动)。零 PointLight(MeshBasicMaterial),手机灯光账户不动。
// 触发:settings.js checkSkyMs 100 档 或 启动时进度已 100 → ctx.scene.kintsugiOn()
const kintsugiTex = (function () {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  let seed = 42;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let v = 0; v < 9; v++) {
    // 9 条主纹,随机游走+断枝,如金缮修补痕
    let px = rnd() * 512,
      py = rnd() * 512,
      a = rnd() * Math.PI * 2;
    x.strokeStyle = 'rgba(212,168,75,0.85)';
    x.lineWidth = 1.6 + rnd() * 1.4;
    x.beginPath();
    x.moveTo(px, py);
    for (let k = 0; k < 14; k++) {
      a += (rnd() - 0.5) * 1.1;
      px += Math.cos(a) * (18 + rnd() * 30);
      py += Math.sin(a) * (18 + rnd() * 30);
      x.lineTo(px, py);
      if (rnd() < 0.22) x.moveTo(px, py);
    }
    x.stroke();
  }
  return new THREE.CanvasTexture(c);
})();
let kintsugiOn = false,
  kintsugiMat = null;
function enableKintsugi() {
  if (kintsugiOn) return;
  kintsugiOn = true;
  kintsugiMat = new THREE.MeshBasicMaterial({
    map: kintsugiTex,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  roof.material = kintsugiMat; // 天花板半透明:天空透出+纹路浮光
  roofThick.visible = false; // 厚层挡光,金缮态关掉
}
ctx.scene.kintsugiOn = enableKintsugi;
// 注视发亮:仰头(pi>0.55)纹路增亮,视线移开渐复
ctx.onTick(function () {
  if (!kintsugiOn || !kintsugiMat) return;
  const pi = ctx.player && ctx.player.pl ? ctx.player.pl.pi : 0;
  kintsugiMat.opacity += ((pi > 0.55 ? 0.95 : 0.55) - kintsugiMat.opacity) * 0.06;
});

// 半透明粉红色四棱锥屋顶 - 完美匹配建筑 36×40
const bW = OR - OL,
  bD = OBR - OT; // 建筑宽36，深40
const pyrRadius = (bD / 2) * Math.sqrt(2); // 旋转后底面深度=40
const pyrHeight = 30;
const pyrGeo = new THREE.ConeGeometry(pyrRadius, pyrHeight, 4, 1, true);
pyrGeo.rotateY(Math.PI / 4);
const pyrMat = new THREE.MeshStandardMaterial({
  color: '#ff88aa',
  transparent: true,
  opacity: 0.55,
  roughness: 0.4,
  metalness: 0.1,
  side: THREE.DoubleSide,
});
const pyramid = new THREE.Mesh(pyrGeo, pyrMat);
pyramid.scale.set(bW / bD, 1, 1); // x方向缩放到36，z保持40
pyramid.position.set(0, WH + pyrHeight / 2, (OT + OBR) / 2);
s.add(pyramid);
// 发光钻石 - 在金字塔顶点
const diamond = new THREE.Mesh(
  new THREE.OctahedronGeometry(3.5, 0),
  new THREE.MeshStandardMaterial({
    color: '#ff88cc',
    emissive: '#ff4499',
    emissiveIntensity: 2.0,
    transparent: true,
    opacity: 0.85,
    roughness: 0.1,
    metalness: 0.9,
  })
);
diamond.position.set(0, WH + pyrHeight, (OT + OBR) / 2);
s.add(diamond);
const dLight = new THREE.PointLight('#ff88cc', 8, 40, 1.5);
dLight.position.copy(diamond.position);
s.add(dLight);
// 婚礼拱廊装修:粉色四棱锥屋顶+钻石+其点光源一并隐藏,拱廊木格栅天花接管天际线
if (WEDDING_SHELL) {
  pyramid.visible = false;
  diamond.visible = false;
  dLight.visible = false;
}

// ============ 天空系统 ============
const skyUniforms = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunHeight: { value: 1.0 },
  uCloudCoverage: { value: 0.55 },
  uWindSpeed: { value: 0.3 },
  uCameraPos: { value: new THREE.Vector3() },
  uDetail: { value: 0.5 },
  uScale: { value: 1.0 },
  uExposure: { value: 1.0 },
};
const skyMat = new THREE.ShaderMaterial({
  uniforms: skyUniforms,
  side: THREE.BackSide,
  depthWrite: false,
  vertexShader: `
    varying vec3 vWorldDir;
    void main(){
      vWorldDir=normalize(position);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    varying vec3 vWorldDir;
    uniform float uTime;
    uniform vec3 uSunDir;
    uniform float uSunHeight;
    uniform float uCloudCoverage;
    uniform float uWindSpeed;
    uniform vec3 uCameraPos;
    uniform float uDetail;
    uniform float uScale;
    uniform float uExposure;
    
float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f*f*(3.0-2.0*f);
  float a = hash21(i);
  float b = hash21(i+vec2(1.0,0.0));
  float c = hash21(i+vec2(0.0,1.0));
  float d = hash21(i+vec2(1.0,1.0));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for(int i=0;i<5;i++){
    v += a * vnoise(p);
    p = rot * p * 2.02 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}
float sampleCloud(vec2 uv, float time, float coverage, float wind, float detail, float scale){
  vec2 p = uv * 0.045 / scale;
  p += vec2(time * wind * 0.4, time * wind * 0.1);
  vec2 q = vec2(
    vnoise(p * 1.3 + vec2(0.0, time * 0.04)),
    vnoise(p * 1.3 + vec2(5.2, 1.3) + vec2(time * 0.035, 0.0))
  );
  float base = fbm(p + q * 0.7);
  float det = fbm(p * 3.0 + 11.3 + q * 0.4);
  float covField = vnoise(p * 0.2 + vec2(time * 0.025, time * 0.018) + 17.3);
  float effCov = coverage + (covField - 0.5) * 0.55;
  effCov = clamp(effCov, 0.0, 1.0);
  float d = base + det * detail * 0.35;
  d = d - (1.0 - effCov) * 0.85;
  d = smoothstep(0.0, 0.28, d);
  return d;
}

    vec3 getSkyColor(vec3 dir,float sh){
      float t=clamp(dir.y*0.5+0.5,0.0,1.0);
      vec3 dayHorizon=vec3(0.78,0.88,0.96);
      vec3 dayZenith=vec3(0.30,0.55,0.92);
      vec3 nightHorizon=vec3(0.09,0.11,0.20);
      vec3 nightZenith=vec3(0.02,0.03,0.07);
      vec3 sunsetHoriz=vec3(1.0,0.50,0.22);
      vec3 sunsetZen=vec3(0.35,0.22,0.42);
      float dayF=smoothstep(-0.15,0.28,sh);
      float sunsetF=clamp(1.0-abs(sh)*2.6,0.0,1.0);
      sunsetF*=smoothstep(-0.22,0.06,sh);
      vec3 horizon=mix(nightHorizon,dayHorizon,dayF);
      vec3 zenith=mix(nightZenith,dayZenith,dayF);
      horizon=mix(horizon,sunsetHoriz,sunsetF*0.88);
      zenith=mix(zenith,sunsetZen,sunsetF*0.42);
      return mix(horizon,zenith,pow(t,0.55));
    }
    vec3 getSun(vec3 dir,vec3 sunDir,float sh){
      float sd=max(0.0,dot(dir,sunDir));
      float disk=smoothstep(0.9995,0.99978,sd);
      float glow=pow(sd,80.0)*0.55+pow(sd,8.0)*0.22+pow(sd,2.0)*0.06;
      vec3 sunCol=vec3(1.0,0.96,0.88);
      if(sh<0.35) sunCol=mix(vec3(1.0,0.42,0.15),sunCol,smoothstep(0.0,0.35,sh));
      if(sh<0.0) sunCol=vec3(0.85,0.9,1.0);
      return disk*sunCol*2.2+glow*sunCol*0.7;
    }
    void main(){
      vec3 dir=normalize(vWorldDir);
      vec3 sky=getSkyColor(dir,uSunHeight);
      sky+=getSun(dir,uSunDir,uSunHeight);
      if(uSunHeight<0.1){
        float nightF=smoothstep(0.1,-0.25,uSunHeight);
        float s=step(0.9986,hash21(dir.xy*900.0+dir.z*120.0));
        float tw=0.55+0.45*sin(uTime*2.5+hash21(dir.xy*40.0)*30.0);
        sky+=s*vec3(0.95,0.98,1.0)*nightF*tw*0.9;
      }
      if(dir.y>0.02){
        float cloudY=80.0;
        float t=(cloudY-uCameraPos.y)/dir.y;
        vec2 cuv=dir.xz*t+uCameraPos.xz;
        float density=sampleCloud(cuv,uTime,uCloudCoverage,uWindSpeed,uDetail,uScale);
        float edge=smoothstep(0.0,0.18,dir.y);
        density*=edge;
        vec3 sunDir=normalize(uSunDir);
        float sunLight=clamp(sunDir.y*1.6+0.25,0.0,1.0);
        vec3 cLit,cShadow;
        if(uSunHeight>0.35){
          cLit=vec3(1.0,0.99,0.97);cShadow=vec3(0.48,0.54,0.66);
        }else if(uSunHeight>0.0){
          float f=uSunHeight/0.35;
          cLit=mix(vec3(1.0,0.55,0.30),vec3(1.0,0.99,0.97),f);
          cShadow=mix(vec3(0.42,0.28,0.42),vec3(0.48,0.54,0.66),f);
        }else{
          cLit=vec3(0.28,0.32,0.44);cShadow=vec3(0.10,0.13,0.20);
        }
        vec3 dirXZ=normalize(vec3(dir.x,0.0,dir.z)+1e-5);
        vec3 sunXZ=normalize(vec3(sunDir.x,0.0,sunDir.z)+1e-5);
        float sunInfl=max(0.0,dot(dirXZ,sunXZ));
        sunInfl=pow(sunInfl,3.0);
        float sunsetF=clamp(1.0-abs(uSunHeight)*2.6,0.0,1.0)*step(-0.22,uSunHeight);
        vec3 warmTint=vec3(1.0,0.55,0.30);
        vec3 coolTint=vec3(0.65,0.42,0.62);
        vec3 dirTint=mix(coolTint,warmTint,sunInfl);
        vec3 cloudCol=mix(cShadow,cLit,sunLight);
        cloudCol=mix(cloudCol,dirTint,sunsetF*0.45);
        cloudCol=mix(cloudCol,cLit*1.25,sunInfl*sunsetF*0.55);
        sky=mix(sky,cloudCol,density);
      }
      sky*=uExposure;
      sky=sky/(sky+vec3(1.0));
      sky=pow(sky,vec3(1.0/2.2));
      gl_FragColor=vec4(sky,1.0);
    }
  `,
});
const skyGeo = new THREE.SphereGeometry(800, 32, 16);
const skyMesh = new THREE.Mesh(skyGeo, skyMat);
skyMesh.frustumCulled = false;
// 云影天空停用:改用西域原版纯色天空+日/月/星(desert.js 驱动);mesh 保留以便随时恢复
skyMesh.visible = false;
s.add(skyMesh);

// 初始化时间
setTime(12);

// ===================== 灯光 =====================
const pls = [];
function addL(x, z) {
  const pl = new THREE.PointLight('#fff5e8', 5, 12, 1.5);
  pl.position.set(x, WH - 0.3, z);
  s.add(pl);
  pls.push({ l: pl, base: 5 });
  // 圆形灯盘:与点光源的圆形光斑造型一致(原为长方形灯条,光形不符)
  const t = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, 0.04, 24),
    new THREE.MeshBasicMaterial({ color: '#fffef5' })
  );
  t.position.set(x, WH - 0.15, z);
  s.add(t);
}
// 展厅区灯光
for (let x = -14; x <= 14; x += 7) for (let z = -9; z <= 3; z += 6) addL(x, z);
addL(0, 5);
// 回字北走廊灯光
addL(0, 8);
addL(-12, 8);
addL(12, 8);
// 回字南走廊灯光
addL(0, 25);
addL(-12, 25);
addL(12, 25);
// 回字西走廊灯光
addL(-12, 17);
// 回字东走廊灯光
addL(12, 17);
// 内墙门洞附近灯光
addL(0, 10.5);
addL(0, 23.5);
addL(-6.5, 17);
addL(6.5, 17);
// 回字中央区域灯光
addL(0, 17);
addL(-3, 14);
addL(3, 14);
addL(-3, 20);
// 环境灯光(存入变量供昼夜系统调节)
const ambL = new THREE.AmbientLight('#ffe8f0', 0.45);
s.add(ambL);
const hemiL = new THREE.HemisphereLight('#fff0f0', '#6a4a3a', 0.2);
s.add(hemiL);

// ============ 天空时间控制 ============
function setTime(hour) {
  const angle = ((hour - 6) / 12) * Math.PI;
  const sunDir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).normalize();
  skyUniforms.uSunDir.value.copy(sunDir);
  skyUniforms.uSunHeight.value = sunDir.y;
  groundUniforms.uSunDir.value.copy(sunDir);
  groundUniforms.uSunHeight.value = sunDir.y;
}

// 导出共享上下文
Object.assign(ctx.scene, {
  s,
  cam,
  rnd,
  L,
  jT,
  jB,
  aB,
  ray,
  mP2,
  iG,
  tL,
  loadTexCapped,
  OL,
  OR,
  OT,
  OBE,
  OBR,
  WH,
  IL,
  IR,
  IRT,
  IRB,
  bounds,
  floorW,
  floorD,
  bW,
  bD,
  pyrHeight,
  groundUniforms,
  skyUniforms,
  pls,
  ambL,
  hemiL,
});
ctx.gallery.houseMats = houseMats;
ctx.setTime = setTime; // 未映射属性,保持扁平
