// detail-quality.js — 程序化表面细节的画质档联动(2026-11-13 性能护栏)
//
// 病2026-11-12/13 加的沙纹、植被风摆斑驳、灰泥、水面涟漪全是**逐片元程序化噪声**,
// 而低画质档此前只降 pixelRatio ⇒ 弱机降了分辨率仍要付全额噪声开销。
// 沙纹一层每片元约 6 次 noise(每次 4 hash),地面又是画面最大表面,这是实打实的浪费。
// (`loop:qualityChanged` 事件此前全仓零监听,等于发了没人收。)
//
// 本模块做两件事:
//   ① 把各细节层的 uniform 收进一张登记表,按画质档统一缩放;
//   ② 低档时给材质打 DETAIL_LOW define,**编译期**砍掉细尺度噪声项
//      (只调 uniform 只能去掉视觉贡献,GPU 仍在算 ⇒ 必须走 define 才真省)。
//
// 档位口径:
//   高档(默认) 强度 ×1,全细节;
//   低档       强度 ×0.5,且只留粗尺度项(沙纹去 grain/云影细项、植被去细噪声、
//              灰泥去细颗粒、水面去第二层涟漪)。
//
// ⚠️ 无顶层副作用;纯函数 detailScaleFor 可单测。
// ⚠️ 不动几何/灯光/玩法,只改材质参数与 define ⇒ 零玩法回归风险。

/** 低档强度系数(不是 0:全关掉会让地面重新变塑料,失去本轮画质成果) */
export const LOW_DETAIL_SCALE = 0.5;

/**
 * 按画质档算强度系数(纯函数)。
 * @param {boolean} lowQuality 是否低画质档
 * @returns {number} 1 = 全强度;LOW_DETAIL_SCALE = 低档
 */
export function detailScaleFor(lowQuality) {
  return lowQuality ? LOW_DETAIL_SCALE : 1;
}

/** 登记项:{u: uniform, base: number} 或 {mat: Material}(只需重编译) */
const layers = [];

/**
 * 登记一个可按档位缩放的 uniform。
 * @param {{value: number}} u uniform 对象
 * @param {number} base 高档基准值
 */
export function registerScaled(u, base) {
  if (!u || typeof base !== 'number') return;
  // 同一 uniform 重复登记只保留一条(幂等,热重载友好)
  const hit = layers.find((l) => l.u === u);
  if (hit) hit.base = base;
  else layers.push({ u, base });
  // ⚠️ 登记时立刻套当前档:玩家的低画质来自存档,在沙漠模块加载**之前**就设好了,
  // 若只等下一次 setLowQuality 才应用,读档进游戏这一路会全程跑满强度(护栏形同虚设)。
  u.value = base * detailScaleFor(currentLow);
}

/**
 * 登记一个只需切 define 重编译的材质。
 * @param {import('three').Material} mat 材质(defines 在 three 里是可选的,故内部按需建)
 */
export function registerRecompile(mat) {
  if (!mat) return;
  if (!layers.some((l) => l.mat === mat)) layers.push({ mat });
  // 同上:读档路径要立刻带上正确的 define,不能等下一次切档
  if (currentLow) {
    const d = ensureDefines(mat);
    if (d.DETAIL_LOW !== 1) {
      d.DETAIL_LOW = 1;
      mat.needsUpdate = true;
    }
  }
}

/**
 * 取材质的 defines(没有就建),并把类型收窄成可读写 DETAIL_LOW 的形状。
 * @param {import('three').Material} mat 材质
 * @returns {{DETAIL_LOW?: number}} defines 对象
 */
function ensureDefines(mat) {
  if (!mat.defines) mat.defines = {};
  return /** @type {{DETAIL_LOW?: number}} */ (mat.defines);
}

/** 当前档位(诊断/探针可读) */
let currentLow = false;
export function currentDetailLow() {
  return currentLow;
}

/**
 * 应用画质档到所有登记的细节层。
 * @param {boolean} lowQuality 是否低画质档
 * @returns {{scale: number, uniforms: number, materials: number}} 实际改动计数(便于验证)
 */
export function applyDetailQuality(lowQuality) {
  currentLow = !!lowQuality;
  const scale = detailScaleFor(currentLow);
  let nu = 0,
    nm = 0;
  for (const l of layers) {
    if (l.u) {
      l.u.value = l.base * scale;
      nu++;
    }
    if (l.mat) {
      const m = l.mat;
      const d = ensureDefines(m);
      const want = currentLow ? 1 : undefined;
      // 只在真的要变时才 needsUpdate:每帧重编译会卡死
      if (d.DETAIL_LOW !== want) {
        if (currentLow) d.DETAIL_LOW = 1;
        else delete d.DETAIL_LOW;
        m.needsUpdate = true;
        nm++;
      }
    }
  }
  return { scale, uniforms: nu, materials: nm };
}
