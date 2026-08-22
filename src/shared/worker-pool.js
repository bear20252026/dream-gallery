// worker-pool.js — Worker 池管理器(2026-08-22 大厂标准)
// 统一管理 Web Worker 生命周期,避免重复创建
// 用法: import { terrainPool } from './shared/worker-pool.js'

/**
 * 通用 Worker 池
 */
class WorkerPool {
  /**
   * @param {string} workerUrl - Worker 文件 URL
   * @param {number} [size=1] - 池大小
   */
  constructor(workerUrl, size = 1) {
    this._url = workerUrl;
    this._pool = [];
    this._queue = [];
    this._nextId = 0;

    for (let i = 0; i < size; i++) {
      this._pool.push(this._createWorker());
    }
  }

  _createWorker() {
    const w = new Worker(this._url, { type: 'module' });
    w._busy = false;
    w._id = this._nextId++;
    return w;
  }

  /**
   * 获取空闲 Worker
   * @returns {Worker|null}
   */
  _getIdle() {
    for (const w of this._pool) {
      if (!w._busy) return w;
    }
    return null;
  }

  /**
   * 发送消息并等待响应
   * @param {Object} msg - 消息体
   * @param {number} [timeout=5000] - 超时 ms
   * @returns {Promise<Object>}
   */
  post(msg, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const w = this._getIdle();
      if (!w) {
        this._queue.push({ msg, resolve, reject, timeout });
        return;
      }

      this._exec(w, msg, resolve, reject, timeout);
    });
  }

  _exec(w, msg, resolve, reject, timeout) {
    w._busy = true;

    const timer = setTimeout(() => {
      w._busy = false;
      reject(new Error('Worker timeout'));
      this._processQueue();
    }, timeout);

    const handler = (e) => {
      clearTimeout(timer);
      w.removeEventListener('message', handler);
      w._busy = false;
      resolve(e.data);
      this._processQueue();
    };

    w.addEventListener('message', handler);
    w.postMessage(msg);
  }

  _processQueue() {
    if (this._queue.length === 0) return;
    const w = this._getIdle();
    if (!w) return;
    const { msg, resolve, reject, timeout } = this._queue.shift();
    this._exec(w, msg, resolve, reject, timeout);
  }

  /** 终止所有 Worker */
  terminate() {
    for (const w of this._pool) w.terminate();
    this._pool = [];
    this._queue = [];
  }
}

// 地形 Worker 单例(懒创建)
let _terrainPool = null;
export function getTerrainPool() {
  if (!_terrainPool) {
    _terrainPool = new WorkerPool(new URL('./desert/terrain-worker.js', import.meta.url), 1);
  }
  return _terrainPool;
}
