// fountains.js — 户外四座 Zsolnay 喷泉(2026-09-03)
// 背景:原「户外白板区」(黄色立方体 + 说明牌 + 呼吸光圈 + z=47 作品展示墙)整套下线,
//       南侧那座就落在白板原址,其余三座按建筑中心的相对关系对称布置到北/东/西。
// 模型:Zsolnay Fountain(布达佩斯千年之家旁, Zsolnay 瓷厂 1884-85 炻器装饰)
//       by georgiyhazankin @ Sketchfab, CC-BY 4.0 —— 署名见 CREDITS.md
//
// 设计要点:
//   ① 四座共享同一份几何(clone 只复制节点树,geometry/material 复用),显存只占 1 份
//   ② 模型原点既不在几何中心也不在底面 → 先 scale,再按新包围盒把「底面贴 y=0、水平居中」
//      收进 Group 内部偏移,Group 本身只负责落位与朝向
//   ③ 沙漠地形有起伏,逐点取 getH 落地,取不到兜底 0
//   ④ 水池是实心石结构,按用户规则「实心挡、透明不挡」加 AABB 碰撞;盒边长小于水池直径,
//      允许人贴到池边围观
//   ⑤ 2026-09-03 追加:模型内 5 个 BezierCurve 部件(2 道环形水帘 + 3 条水柱)在原文件里
//      材质 alpha=0 且无贴图,是完全隐形的(Sketchfab 网页上看得到水是它自家渲染器补的)。
//      几何/UV/法线都是现成的,只差一层会动的水 → 这里换成程序化流动水材质。
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'; // 与 museum.js 同款(走 importmap)
import { ctx } from '../ctx.js';
import { hotBegin, hotEnd } from '../hot.js';

hotBegin('fountains');
const { s } = ctx;

// 建筑矩形 x ±18 / z -12~28,中心 (0, 8)。原白板在 (0, 42)=中心正南 34m,
// 其余三座沿用同一"距边 14m"的相对关系:北 z=-26、东 x=32、西 x=-32(横向 z 取中心 8)。
const SPOTS = [
  { name: 'fountainS', x: 0, z: 42, yaw: Math.PI }, // 南·画板原址,正面朝北(建筑)
  { name: 'fountainN', x: 0, z: -26, yaw: 0 }, // 北,正面朝南
  { name: 'fountainE', x: 32, z: 8, yaw: -Math.PI / 2 }, // 东,正面朝西
  { name: 'fountainW', x: -32, z: 8, yaw: Math.PI / 2 }, // 西,正面朝东
];
// 2026-09-03 用户要求改回原比例:模型原始直径 8.04m(石体高 2.45m,水柱顶 2.75m)
const TARGET_D = 8.04; // 目标直径(米)= 模型原始尺寸,不再缩小
const BASE_R = 4.4; // 八角石基座外接半径:比池体半径 4.02m 露出一圈台沿
const BASE_PAD = 0.08; // 基座顶面高出「池周地形最高点」的余量
const BASE_DEPTH = 1.0; // 基座向下深埋深度:防止低侧悬空
const HIT_D = 8.8; // 碰撞盒边长:覆盖基座直径,人绕台而行

function groundAt(x, z) {
  try {
    const h = ctx.media.desert ? ctx.media.desert.getH(x, z) : 0;
    return typeof h === 'number' && isFinite(h) ? h : 0;
  } catch (e) {
    return 0;
  }
}
// 池周地形起伏:沙漠并非全平(实测北/西两座边缘高差 0.5~0.6m),
// 只按中心点贴地会让池子一侧悬空、一侧埋沙 → 加基座把起伏吃掉
function terrainRange(x, z) {
  const offs = [
    [0, 0],
    [BASE_R, 0],
    [-BASE_R, 0],
    [0, BASE_R],
    [0, -BASE_R],
    [BASE_R * 0.7, BASE_R * 0.7],
    [BASE_R * 0.7, -BASE_R * 0.7],
    [-BASE_R * 0.7, BASE_R * 0.7],
    [-BASE_R * 0.7, -BASE_R * 0.7],
  ];
  let mn = Infinity,
    mx = -Infinity;
  for (const [dx, dz] of offs) {
    const h = groundAt(x + dx, z + dz);
    if (h < mn) mn = h;
    if (h > mx) mx = h;
  }
  if (!isFinite(mn)) mn = 0;
  if (!isFinite(mx)) mx = 0;
  return { mn, mx };
}

// ============================ 流动水材质 ============================
// 模型里的 5 个水部件:2 道环形水帘(5.2m/2.5m 宽,0.9m 高)+ 3 条水柱(2.3~2.4m 高)。
// 原材质 alpha=0 完全隐形,这里换成 MeshStandardMaterial + onBeforeCompile 注入程序化水:
//   · 保留标准光照/雾/色调映射,不另起 ShaderMaterial(和项目 terrain/paper-floor 一致的思路)
//   · 无任何贴图依赖:全部用局部坐标 + 时间算出来,省掉 16MB 图集也省掉加载
//   · 四座 clone 共享同一批材质实例 → uTime 只更新一次,20 个 draw call 全部同步流动
const WATER_TIME = { value: 0 }; // 全局共享时间(所有水部件引用同一个 uniform 对象)

function makeWaterMat(kind, yMin, yMax, tag) {
  // kind: 0 = 环形水帘(沿高度向下淌)  1 = 水柱(自下往上喷)
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(kind ? '#d8f4fb' : '#9fdcec'),
    roughness: 0.12, // 水要光滑才有高光
    metalness: 0.0,
    transparent: true,
    depthWrite: false, // 半透明层不写深度,避免互相切出硬边
    side: THREE.DoubleSide, // 原模型本来就是双面(水帘从背面看也得是水)
    emissive: new THREE.Color('#0e3542'), // 暗处也能看见水,不至于糊成一团黑
    emissiveIntensity: 0.4,
  });
  mat.name = 'fountain-water-' + tag;
  mat.userData.isFountainWater = true;
  mat.userData.waterKind = kind;

  const u = {
    uTime: WATER_TIME, // 共享 → 只需每帧改一次
    uKind: { value: kind },
    uYMin: { value: yMin }, // 几何局部 Y 范围(用于归一化高度,避免受模型单位影响)
    uYMax: { value: yMax },
    uSpeed: { value: kind ? 1.45 : 0.95 }, // 水柱喷得急,水帘淌得缓
    uFreq: { value: kind ? 24.0 : 14.0 }, // 沿高度的条纹密度
  };
  mat.userData.waterU = u;

  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vWPos = (modelMatrix * vec4(position, 1.0)).xyz;'
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWPos;
uniform float uTime, uKind, uYMin, uYMax, uSpeed, uFreq;
// 极廉价的 value noise:一次 sin 点乘 + 双线性插值,够做水纹扰动
float fwHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fwNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fwHash(i), fwHash(i + vec2(1.0, 0.0)), f.x),
             mix(fwHash(i + vec2(0.0, 1.0)), fwHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  // 归一化高度:让条纹密度与"模型是 804 单位还是 8.04 米"无关
  float hN = clamp((vWPos.y - uYMin) / max(0.0001, uYMax - uYMin), 0.0, 1.0);
  float ang = atan(vWPos.z, vWPos.x);
  // 周向分股:真实的水帘/水柱不是均匀一圈,会分成一股股。
  // 频率取整数(16 / 7)以保证 -PI 与 +PI 处接缝对齐,不出现竖直裂痕。
  float strand = 0.58 + 0.42 * (sin(ang * mix(16.0, 7.0, uKind) + uTime * 0.4) * 0.5 + 0.5);
  // 主流动:水帘向下淌(dir=-1),水柱向上喷(dir=+1)
  float dir = mix(-1.0, 1.0, uKind);
  float f1 = hN * uFreq + uTime * uSpeed * dir;
  float r1 = sin(f1) * 0.5 + 0.5;
  // 第二层:错开频率并掺噪声,打散规则感(noise 的角向频率也取整数 2.0 防接缝)
  float f2 = hN * uFreq * 0.47 - uTime * uSpeed * dir * 1.31
           + fwNoise(vec2(ang * 2.0, hN * 3.0 - uTime * uSpeed * dir * 0.5)) * 5.0;
  float r2 = sin(f2) * 0.5 + 0.5;
  float w = clamp(r1 * 0.5 + r2 * 0.5, 0.0, 1.0) * strand;
  w = mix(w, w * w, 0.35); // 提一点对比,让水股更分明
  vec3 deep = vec3(0.20, 0.56, 0.71); // 青蓝水色
  vec3 foam = vec3(0.90, 0.98, 1.00); // 泛白的泡沫/高光
  vec3 col = mix(deep, foam, smoothstep(0.28, 0.92, w));
  // 首尾渐隐:水帘顶部接盘沿最实、底部散开;水柱底部实、越高越散成水雾
  float fade = uKind < 0.5 ? mix(0.55, 1.0, hN)
                           : 1.0 - smoothstep(0.55, 1.0, hN) * 0.7;
  diffuseColor.rgb = col;
  diffuseColor.a = mix(0.38, 0.52, uKind) + 0.46 * w * fade;
}`
      )
      // 菲涅尔掠射增亮:视线越贴着水面越亮,是水"看起来像水"的关键
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
#ifndef FLAT_SHADED
{
  float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.0);
  gl_FragColor.rgb += vec3(0.30, 0.52, 0.60) * fres * 0.55;
}
#endif`
      );
  };
  return mat;
}

// 把指定 proto 内的水部件换成流动水材质,返回改造数量。
// 模型是 Z-up 导出的(GLB 内 mesh 自带旋转+0.01 缩放把 Z-up 折到 Y-up 世界),kind 判定
// 必须在世界坐标下做,直接看 mesh 占据多少垂直高度 → 高的像水柱,矮扁的像水帘。
// 每座喷泉落位不同 → 世界 Y 范围也不同,所以**每座独立赋材质**(4×5=20 个材质实例,
//GPU program 按 kind 共享只有 2 种;uniform 不同不影响 program 缓存)。
function setupWater(localProto) {
  localProto.updateMatrixWorld(true); // 让 localProto + 所有 mesh.matrixWorld 与当前 TRS 一致
  let n = 0;
  localProto.traverse((o) => {
    if (!o.isMesh) return;
    const nm = (o.name || '') + ' ' + ((o.material && o.material.name) || '');
    if (!/bezier/i.test(nm)) return; // 只有 BezierCurve.* 是水,石头部件跳过
    o.updateWorldMatrix(true, false);
    const bb = new THREE.Box3().setFromObject(o);
    const yMin = +bb.min.y.toFixed(3),
      yMax = +bb.max.y.toFixed(3);
    const w = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z); // 水平宽度
    const h = bb.max.y - bb.min.y; // 垂直高度
    const kind = h > w ? 1 : 0;
    o.material = makeWaterMat(kind, yMin, yMax, kind ? 'jet' : 'veil');
    o.renderOrder = 2;
    o.castShadow = false;
    n++;
  });
  return n;
}

new GLTFLoader().load(
  '/models/hall/zsolnay-fountain.glb',
  (g) => {
    const proto = g.scene;
    // 先缩放到目标直径,再按缩放后的包围盒做居中/贴地偏移
    const b0 = new THREE.Box3().setFromObject(proto);
    const dia = Math.max(b0.max.x - b0.min.x, b0.max.z - b0.min.z) || TARGET_D;
    proto.scale.setScalar(TARGET_D / dia);
    const b = new THREE.Box3().setFromObject(proto);
    const c = b.getCenter(new THREE.Vector3());
    proto.position.set(-c.x, -b.min.y, -c.z); // 底面贴 y=0、水平居中

    // 每帧推进共享时间 → 所有 20 个水材质同步流动(每座喷泉的 5 个共享 WATER_TIME 引用)
    ctx.onTick((dt) => {
      WATER_TIME.value += Math.min(dt || 0, 0.1); // 掉帧/切后台回来时别让水瞬移
    });

    // 八角石台基:呼应 Zsolnay 喷泉的八角造型,同时吃掉池周地形起伏
    const stoneMat = new THREE.MeshStandardMaterial({
      color: '#b9ab93',
      roughness: 0.92,
      metalness: 0.02,
    });
    const boxes = [];
    let nWater = 0;
    SPOTS.forEach((sp, i) => {
      const t = terrainRange(sp.x, sp.z);
      const topY = t.mx + BASE_PAD; // 台面高过池周最高地形
      const botY = t.mn - BASE_DEPTH; // 底部深埋,低侧也不会悬空
      const h = Math.max(0.4, topY - botY);
      const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(BASE_R, BASE_R * 1.05, h, 8),
        stoneMat
      );
      pedestal.name = sp.name + '-base';
      pedestal.position.set(sp.x, (topY + botY) / 2, sp.z);
      pedestal.rotation.y = Math.PI / 8; // 八角边对齐正南北
      pedestal.receiveShadow = true;
      s.add(pedestal);

      const grp = new THREE.Group();
      grp.name = sp.name;
      const localProto = i === 0 ? proto : proto.clone(true);
      grp.add(localProto);
      grp.position.set(sp.x, topY, sp.z); // 坐在台面上,不再直接贴地形
      grp.rotation.y = sp.yaw;
      s.add(grp);
      // 每座喷泉独立初始化水材质(世界 bbox 受落位影响,共用会错位)
      nWater += setupWater(localProto);
      boxes.push({
        mnX: sp.x - HIT_D / 2,
        mxX: sp.x + HIT_D / 2,
        mnZ: sp.z - HIT_D / 2,
        mxZ: sp.z + HIT_D / 2,
      });
    });
    // 水池+台基均为实心石结构:按「实心挡、透明不挡」加碰撞(不设 mnY/mxY = 全高)
    if (ctx.scene.addBounds) ctx.scene.addBounds(boxes);
    const spreads = SPOTS.map((sp) => {
      const t = terrainRange(sp.x, sp.z);
      return +(t.mx - t.mn).toFixed(2);
    });
    console.log(
      '[fountain] 四座喷泉已落位 直径' +
        TARGET_D +
        'm 原始' +
        dia.toFixed(2) +
        'm 台基' +
        BASE_R +
        'm 池周地形高差[' +
        spreads.join(', ') +
        '] 水部件' +
        nWater +
        ' 个(已启用流动)'
    );
  },
  undefined,
  (e) => console.error('[fountain] GLB 加载失败:', e)
);

hotEnd('fountains');
if (import.meta.hot) import.meta.hot.accept();
