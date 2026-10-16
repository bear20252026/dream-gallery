// shared/dispose-object3d.mjs — 统一资源释放(2026-10-11 DG-GPU-001)
// 为什么存在:站内的"删对象"散落多处且口径不一(hot.js 内联 traverse、paintings.js removePaintByUrl、
// mode.js 每 60 秒重建链接却完全不释放),显存占用随页面存活时长线性增长,手机端最终可能触发
// webglcontextlost。本文件是**唯一实现**,各处共用,不再漂移。
//
// 铁律(照做,否则会出事故):
//   ① **共享资源不释放**。three 的 Sprite 几何是模块级共享单例(Sprite.js:`let _geometry` 惰性创建,
//      构造里 `this.geometry = _geometry`),对它调 dispose() 会让**全站所有 Sprite 一起消失**;
//      项目里已有同类规避先例(src/scene/desert/terrain.js 用 `sharedGeos.has(...)` 判断)。
//      本工具内置该保护,并允许调用方用 `shared` 传入自己的共享集(Set/数组/谓词皆可),
//      如 paintings.js 的画框共享材质 fW/mM。
//   ② **同一资源在本棵树内只 dispose 一次**(多个 mesh 共用同一 material 时不重复释放)。
//   ③ 拿不准就**不释放**——漏 dispose 是慢慢泄漏,错 dispose 共享资源是当场炸画面,后果不可比。
//
// 纯函数、零 three 依赖:靠鸭子类型判 `dispose` 方法/`isSprite`/`geometry.getAttribute`,
// 因此可在 node 里被 vitest 直测(src/__tests__/dispose-object3d.test.js 钉死行为)。
//
// 用法:
//   import { disposeObject3D } from '../shared/dispose-object3d.mjs';
//   scene.remove(g);
//   disposeObject3D(g, { shared: [fW, mM] });

/** 材质上挂贴图的属性名(逐个释放)。共享贴图靠 `shared` 或跨资源去重挡住,不靠猜。 */
export const TEXTURE_KEYS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'alphaMap',
  'aoMap',
  'envMap',
  'lightMap',
  'bumpMap',
  'displacementMap',
  'gradientMap',
  'specularMap',
  'sheenColorMap',
  'iridescenceMap',
];

/**
 * 会被本工具释放的三类资源 —— **单一出处**(原来这串字面量联合只在 `disposeObject3D` 的 opts 里写了一遍,
 * 而 `toSharedTest` 的返回值另写一份 `kind:string`,两边对不上就是编译器报的那条 TS2345)。
 * @typedef {"geometry"|"material"|"texture"} DisposeKind
 */
/**
 * "这个资源是共享的,别释放"的谓词形状。
 * @typedef {(res: *, kind: DisposeKind) => boolean} SharedTest
 */

/**
 * 把 `shared` 参数归一成谓词。接受 Set/WeakSet(有 .has)/数组/函数;其它一律视为"无共享集"。
 * 谓词那条写成**签名**而不是裸 `Function`(2026-10-16 第九刀):上一行 `typeof shared === 'function'`
 * 返回的是 `Function`,而本函数的返回类型是 `SharedTest` —— `Function` 赋不进去(编译器是对的,
 * 裸 `Function` 就是在说谎)。`.has` 那一支改用 `'has' in shared` 做窄化:它是 TS 认得的判据,
 * 而 `typeof shared.has` 在 `Set|WeakSet|Array` 这个联合上根本取不到属性。
 * 两支的先后与今天一致(数组仍走 `Array.isArray` 那条),对非 Set 但带 `has` 的对象也照旧放行。
 * @param {Set|WeakSet|Array|SharedTest|null|undefined} shared
 * @returns {SharedTest|null}
 */
export function toSharedTest(shared) {
  if (!shared) return null;
  if (typeof shared === 'function') return shared;
  if ('has' in shared && typeof shared.has === 'function') return (res) => shared.has(res);
  if (Array.isArray(shared)) {
    const s = new Set(shared);
    return (res) => s.has(res);
  }
  return null;
}

function isFn(v, name) {
  if (!v || (typeof v !== 'object' && typeof v !== 'function')) return false;
  try {
    return typeof v[name] === 'function';
  } catch (e) {
    return false;
  }
}

/**
 * 识别 three 内置的 Sprite 共享几何单例(r186:position/uv 是 InterleavedBufferAttribute、
 * 4 顶点、index 6 项)。作为 `node.isSprite` 之外的第二层网——同一几何引用被挂到别的对象上时
 * 仍不释放。判不准一律返回 false(不做内容嗅探式冒险,漏判由上层 isSprite/shared 规则兜)。
 */
export function isSharedBuiltinGeometry(geo) {
  try {
    if (!geo || !isFn(geo, 'getAttribute')) return false;
    const pos = geo.getAttribute('position');
    if (!pos || pos.count !== 4 || pos.isInterleavedBufferAttribute !== true) return false;
    const idx = geo.index;
    if (!idx || idx.count !== 6) return false;
    return isFn(pos, 'getX') && pos.getX(0) === -0.5;
  } catch (e) {
    return false;
  }
}

/**
 * 遍历子树释放 geometry / material / material 上的贴图(内置共享资源保护 + 树内去重)。
 * @param {object|object[]} root 待释放的 Object3D(或其数组)
 * @param {{
 *   shared?: Set|WeakSet|Array|SharedTest,
 *   skipGeometry?: boolean,
 *   skipMaterial?: boolean,
 *   skipTextures?: boolean,
 *   clearTextureRefs?: boolean,
 *   onWarn?: (msg:string, err:unknown)=>void,
 * }} [opts]
 * @returns {{objects:number,geometries:number,materials:number,textures:number,skipped:number}}
 *   实际释放计数(skipped=被共享保护/树内去重/无 dispose 方法而挡下的次数),供调用方与测试断言。
 */
export function disposeObject3D(root, opts) {
  const o = opts || {};
  const isShared = toSharedTest(o.shared);
  const stats = { objects: 0, geometries: 0, materials: 0, textures: 0, skipped: 0 };
  const seen = new Set(); // 本棵树内已处理过的资源(geometry/material/texture 共用一个集合)
  const warn = o.onWarn || ((msg, err) => console.warn('[disposeObject3D] ' + msg, err));

  /** 释放单个资源;返回 true=真的 dispose 了。共享/已处理/无 dispose 方法都只记账不动手。 */
  const release = (res, kind, counter, ref) => {
    if (!res || (typeof res !== 'object' && typeof res !== 'function')) return false;
    if (seen.has(res)) {
      stats.skipped++;
      return false;
    }
    seen.add(res);
    if (isShared && isShared(res, kind)) {
      stats.skipped++;
      return false;
    }
    if (!isFn(res, 'dispose')) {
      stats.skipped++; // 无 dispose 方法(桩对象/非 GPU 资源)——安全跳过
      return false;
    }
    try {
      res.dispose();
      stats[counter]++;
      if (o.clearTextureRefs && ref && ref.holder) {
        try {
          ref.holder[ref.key] = null; // 已释放的贴图引用留在材质上=下次复用即黑块(paintings.js 旧口径)
        } catch (e) {
          /* 只读属性等极端材质:清不掉就算了,不影响释放 */
        }
      }
      return true;
    } catch (e) {
      stats.skipped++;
      warn(kind + '.dispose() 抛错', e);
      return false;
    }
  };

  const visit = (node) => {
    if (!node || (typeof node !== 'object' && typeof node !== 'function')) return;
    stats.objects++;
    // InstancedMesh/BatchedMesh 自带 dispose(实例属性缓冲),与 terrain.js 先例同口径
    if ((node.isInstancedMesh || node.isBatchedMesh) && isFn(node, 'dispose')) {
      try {
        node.dispose();
      } catch (e) {
        warn('object.dispose() 抛错', e);
      }
    }
    if (!o.skipGeometry && node.geometry) {
      const geo = node.geometry;
      // three 的 Sprite 几何是模块级单例:对它 dispose = 全站 Sprite 一起消失(血泪级陷阱)
      if (node.isSprite || isSharedBuiltinGeometry(geo)) stats.skipped++;
      else release(geo, 'geometry', 'geometries');
    }
    if (o.skipMaterial || !node.material) return;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    for (const m of mats) {
      if (!m || (typeof m !== 'object' && typeof m !== 'function')) continue;
      if (seen.has(m)) {
        stats.skipped++;
        continue; // 同一材质被多个 mesh 共用:只处理一次(含它的贴图)
      }
      const sharedMat = !!isShared && isShared(m, 'material');
      if (sharedMat) {
        seen.add(m);
        stats.skipped++;
        continue; // 共享材质整件不动:连贴图一起跳过(材质活着而贴图被释放=全场景闪黑)
      }
      release(m, 'material', 'materials');
      if (o.skipTextures) continue;
      for (const key of TEXTURE_KEYS) {
        let tex;
        try {
          tex = m[key];
        } catch (e) {
          tex = null; // getter 抛错的自定义材质:该键当作无贴图
        }
        if (!tex) continue;
        release(tex, 'texture', 'textures', { holder: m, key });
      }
    }
  };

  const walk = (one) => {
    if (!one) return;
    if (typeof one.traverse === 'function') one.traverse(visit);
    else visit(one);
  };

  if (Array.isArray(root)) for (const r of root) walk(r);
  else walk(root);
  return stats;
}

export default disposeObject3D;
