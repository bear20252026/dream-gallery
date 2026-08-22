// spatial-index.js — 空间索引加速碰撞检测(2026-08-22 大厂标准)
// 用网格空间索引替代 bounds 数组的线性遍历,O(n) → O(1) 平均查询
// 用法: import { SpatialIndex } from './shared/spatial-index.js'

/**
 * 网格空间索引。将 AABB 碰撞盒按网格分桶，查询时只检查附近格子。
 */
export class SpatialIndex {
  /**
   * @param {number} cellSize - 网格单元大小(建议略大于最大碰撞体尺寸)
   */
  constructor(cellSize = 8) {
    this.cellSize = cellSize;
    /** @type {Map<string, Array>} */
    this.grid = new Map();
    this.count = 0;
  }

  /** 世界坐标 → 网格键 */
  _key(cx, cz) {
    const gx = Math.floor(cx / this.cellSize);
    const gz = Math.floor(cz / this.cellSize);
    return gx + ',' + gz;
  }

  /**
   * 添加 AABB 碰撞盒
   * @param {{mnX:number,mxX:number,mnZ:number,mxZ:number}} box
   */
  insert(box) {
    // 碰撞盒可能跨越多个格子，插入所有覆盖的格子
    const gx0 = Math.floor(box.mnX / this.cellSize);
    const gx1 = Math.floor(box.mxX / this.cellSize);
    const gz0 = Math.floor(box.mnZ / this.cellSize);
    const gz1 = Math.floor(box.mxZ / this.cellSize);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const k = gx + ',' + gz;
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(box);
      }
    }
    this.count++;
  }

  /**
   * 批量导入 bounds 数组
   * @param {Array} bounds
   */
  bulkInsert(bounds) {
    for (const box of bounds) {
      this.insert(box);
    }
  }

  /**
   * 查询点 (x,z) 附近的碰撞盒
   * @param {number} x
   * @param {number} z
   * @returns {Array} 可能碰撞的盒子列表
   */
  query(x, z) {
    const gx = Math.floor(x / this.cellSize);
    const gz = Math.floor(z / this.cellSize);
    const k = gx + ',' + gz;
    return this.grid.get(k) || [];
  }

  /** 清空 */
  clear() {
    this.grid.clear();
    this.count = 0;
  }
}

/**
 * 使用空间索引的碰撞检测(替代 player.js 中的 hT 线性遍历)
 * @param {number} x - 测试点 X
 * @param {number} z - 测试点 Z
 * @param {SpatialIndex} index - 空间索引
 * @param {number} radius - 碰撞半径
 * @returns {boolean}
 */
export function hitTestFast(x, z, index, radius) {
  const nearby = index.query(x, z);
  for (let i = 0; i < nearby.length; i++) {
    const b = nearby[i];
    const cx = Math.max(b.mnX, Math.min(x, b.mxX));
    const cz = Math.max(b.mnZ, Math.min(z, b.mxZ));
    if ((x - cx) ** 2 + (z - cz) ** 2 < radius ** 2) return true;
  }
  return false;
}

/**
 * 使用空间索引的滑动碰撞解决
 * @param {number} nx - 目标 X
 * @param {number} nz - 目标 Z
 * @param {number} px - 当前 X
 * @param {number} pz - 当前 Z
 * @param {SpatialIndex} index
 * @param {number} radius
 * @returns {{x:number, z:number}}
 */
export function resolveSlideFast(nx, nz, px, pz, index, radius) {
  if (!hitTestFast(nx, nz, index, radius)) return { x: nx, z: nz };
  const mx = !hitTestFast(nx, pz, index, radius);
  const mz = !hitTestFast(px, nz, index, radius);
  if (mx && mz) return Math.abs(nx - px) > Math.abs(nz - pz) ? { x: nx, z: pz } : { x: px, z: nz };
  if (mx) return { x: nx, z: pz };
  if (mz) return { x: px, z: nz };
  return { x: px, z: pz };
}
