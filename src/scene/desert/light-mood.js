// light-mood.js — 沙漠昼夜的「氛围增强层」(2026-11-12 光效)
//
// 为什么单独一层:沙漠的昼夜权威是 desert/atmosphere.js 的 dayNight(),它每帧写
// 天空背景色/雾色/日光色/环境光/半球光/星空。**任何在它之外改这些属性的代码都会被它覆盖**
// (本轮曾误在 scene.js 的 setTime 里加氛围层,实测被逐帧覆盖 ⇒ 完全无效,已回退)。
// 所以增强必须挂在 dayNight() **内部末尾**,由它主动调用,顺序上永远最后一个写。
//
// 本层只做四件 dayNight 现在没做的事(补真缺口,不抢它的活):
//   ① Bloom 强度/阈值随昼夜联动 —— 原先 Bloom 恒定 0.3/0.8,夜里灯火不发光、日落没有辉光;
//   ② 色调映射曝光随昼夜微调 —— 夜里略提亮保住可读性,正午略压避免沙面过曝发白;
//   ③ 雾密度随昼夜呼吸 —— 原先密度恒定 0.006,夜里远景与近景一样清楚,没有空气感;
//   ④ 沙暴不透明度随昼夜 —— 夜里沙暴压暗(否则浅色沙粒在夜空里像白噪点)。
//
// ⚠️ 零新增灯光:全站灯光预算是硬约束(core/light-budget.js;片元 uniform 上限 128~224 vec4),
//    新增 PointLight 会在弱机上链接失败。本层只改既有对象属性与后处理 uniform。
// ⚠️ 纯函数部分(算参数)与副作用部分(写对象)分离,便于单测直接喂 elev 断言。

/** 最近一次生效的氛围参数(诊断用;初值为正午档,避免首帧读到 null) */
let lastMood = null;
/** 读最近一次生效的氛围(探针/诊断用,只读) */
export function currentMood() {
  return lastMood;
}

/** 平滑阶跃(比线性分段更有「呼吸」感,消除 dayNight 三段插值的台阶) */
export function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0 || 1)));
  return t * t * (3 - 2 * t);
}

/**
 * 按太阳高度算氛围参数(纯函数,无副作用)。
 * @param {number} elev 太阳高度归一 0..1(dayNight 的 elev = (sin+1)/2;0=深夜 0.5=地平线 1=正午)
 * @returns {{bloom:number, bloomTh:number, exposure:number, fogDensity:number, sandOpacity:number, rimBoost:number, tintR:number, tintG:number, tintB:number, waterR:number, waterG:number, waterB:number}}
 */
export function moodAt(elev) {
  const e = Math.max(0, Math.min(1, Number(elev) || 0));
  // 夜(0) → 晨昏(0.5) → 正午(1)
  const night = 1 - smoothstep(0.18, 0.42, e); // 夜的权重
  const noon = smoothstep(0.62, 0.95, e); // 正午的权重
  // 晨昏峰:在 e≈0.5 附近最大(日落/日出的琥珀辉光)
  const dusk = Math.max(0, 1 - Math.abs(e - 0.5) / 0.22);

  // ① Bloom:夜里 0.55(灯火/星屑发光) → 晨昏 0.62(琥珀辉光最强) → 正午 0.20(不刺眼)
  const bloom = 0.2 + night * 0.35 + dusk * 0.22;
  // 阈值:夜里降到 0.66 让暗部灯火也能溢出;正午抬到 0.88 只让最亮处发光
  const bloomTh = 0.88 - night * 0.22 - dusk * 0.08;
  // ② 曝光:夜 1.10(保可读) → 正午 0.94(压住浅沙过曝,这正是「画面发白」的一环)
  const exposure = 1.1 - noon * 0.16 - dusk * 0.03;
  // ③ 雾密度:夜 0.0088(远景沉进夜色,有空气纵深) → 正午 0.0052(通透)
  const fogDensity = 0.0052 + night * 0.0036 + dusk * 0.0008;
  // ④ 沙暴:夜里压到 0.05(浅沙粒在夜空里像噪点),白天 0.16
  const sandOpacity = 0.05 + (1 - night) * 0.11;
  // 轮廓光加成:晨昏给角色/沙脊一道暖边(强度加成,不新增灯)
  const rimBoost = dusk * 0.35 + night * 0.1;

  // ⑤ 地表染色(治「画面发白」的真病根):顶点色里盐滩近白(0.85/0.82/0.78),
  // 叠 1.6 强度日光后过曝。材质 color 与顶点色**相乘**,所以这里给一个 <1 的染色因子
  // 把地表压回沙色,并按时段染色:夜偏冷蓝、晨昏偏琥珀、正午中性略压。
  // 数值口径:正午 0.72 左右(压掉过曝但仍是明亮沙漠),夜 0.42(沉进夜色),晨昏 0.62 且偏暖。
  const tintLevel = 0.72 - night * 0.3 - dusk * 0.1;
  const tintR = tintLevel * (1 + dusk * 0.16 + night * 0.02);
  const tintG = tintLevel * (1 + dusk * 0.02 - night * 0.04);
  const tintB = tintLevel * (1 - dusk * 0.14 + night * 0.16);

  // ⑥ 水面光照(2026-11-12):水面是自定义 ShaderMaterial,**不走 Three 光照管线**,
  // 昼夜怎么变它都不动 ⇒ 夜里天空全黑、水面仍是白天亮度,像一片自发光的青绿地面。
  // 白天必须恰好是 (1,1,1) 以保持原样;夜里压到 0.2 上下并偏冷蓝(月光),晨昏染暖。
  const wLevel = 1 - night * 0.8 - dusk * 0.18;
  const waterR = wLevel * (1 + dusk * 0.2 - night * 0.1);
  const waterG = wLevel * (1 + dusk * 0.04 - night * 0.02);
  const waterB = wLevel * (1 - dusk * 0.12 + night * 0.22);

  return {
    bloom,
    bloomTh,
    exposure,
    fogDensity,
    sandOpacity,
    rimBoost,
    tintR,
    tintG,
    tintB,
    waterR,
    waterG,
    waterB,
  };
}

/**
 * 把氛围应用到场景(由 dayNight() 末尾调用,保证不被覆盖)。
 * 全部改既有对象属性;任何一项缺失都静默跳过(后处理挂载晚于沙漠模块)。
 * @param {{setAtmosphere?: (o: {bloomStrength: number, bloomThreshold: number, exposure: number}) => void, s?: {fog?: import('three').Fog | import('three').FogExp2}}} sc ctx.scene(只用到这两件;线性 Fog 没有 density,运行时按存在性跳过)
 * @param {number} elev 太阳高度 0..1
 * @param {{sandMat?: {opacity: number}, rimL?: {intensity: number}, baseRim?: number, terrainMat?: {color: {setRGB: (r: number, g: number, b: number) => void}}, waterU?: {uLight?: {value: {setRGB: (r: number, g: number, b: number) => void}}}}} [refs] 沙漠侧引用
 * @returns {ReturnType<typeof moodAt>}
 */
export function applyMood(sc, elev, refs) {
  const m = moodAt(elev);
  // 最近一次生效的氛围(诊断/探针可读;后处理实例不经总线暴露,靠这份读数验证联动)
  lastMood = m;
  if (!sc) return m;
  if (sc.setAtmosphere) {
    sc.setAtmosphere({ bloomStrength: m.bloom, bloomThreshold: m.bloomTh, exposure: m.exposure });
  }
  // 类型收窄:声明里 fog 是 Fog|FogExp2 联合,线性 Fog 没有 density;
  // 运行时按存在性跳过(与原先行为一字不差),cast 只服务于 checkJs。
  const fog = sc.s && sc.s.fog ? /** @type {{density?: number}} */ (sc.s.fog) : null;
  if (fog && typeof fog.density === 'number') {
    fog.density = m.fogDensity;
  }
  const r = refs || {};
  if (r.sandMat) r.sandMat.opacity = m.sandOpacity;
  if (r.rimL && typeof r.baseRim === 'number') r.rimL.intensity = r.baseRim + m.rimBoost;
  // 地表整体染色(与顶点色相乘):这是治「盐滩过曝发白」的关键一步
  if (r.terrainMat && r.terrainMat.color) r.terrainMat.color.setRGB(m.tintR, m.tintG, m.tintB);
  // 水面光照:自定义着色器不吃场景灯,只能这样喂(否则夜里水面自发光)
  if (r.waterU && r.waterU.uLight && r.waterU.uLight.value) {
    r.waterU.uLight.value.setRGB(m.waterR, m.waterG, m.waterB);
  }
  return m;
}
