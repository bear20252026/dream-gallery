// ============================================================
// 实体注册表 — 统一管理所有 3D 交互对象
// 新增对象只需 ent.register(mesh, {type, tags})
// 可以用 ent.find('painting') 批量操作
// 2026-08-01 游戏引擎化改造
// ============================================================

/**
 * 实体注册表。
 *
 * 用法：
 *   const id = ctx.ent.register(mesh, { type: 'painting', tags: ['van-gogh', 'wall-north'] });
 *   ctx.ent.find('painting').forEach(e => e.visible = false); // 隐藏所有画
 *   ctx.ent.findByTag('wall-north').forEach(e => e.position.y += 1);
 */
export class EntityRegistry {
  constructor() {
    /** @type {Map<string, {mesh: THREE.Object3D, type: string, tags: string[], data: Object}>} */
    this._map = new Map();
    /** 按类型索引: Map<type, Set<id>> —— O(1) 查询，不再遍历全表 */
    this._byType = new Map();
    /** 脏标记: 只重建变了的东西，不每帧全量跑 */
    this._dirty = new Set();
    this._nextId = 0;
  }

  /**
   * 注册实体
   * @param {THREE.Object3D} mesh - Three.js 对象
   * @param {Object} opts
   * @param {string} opts.type - 实体类型（如 'painting', 'marker', 'sign'）
   * @param {string[]} [opts.tags] - 自定义标签
   * @param {Object} [opts.data] - 附加数据
   * @returns {string} 实体 ID
   */
  register(mesh, { type, tags = [], data = {} } = {}) {
    const id = 'ent_' + ++this._nextId;
    this._map.set(id, { mesh, type, tags, data, id });
    // 维护类型索引
    if (!this._byType.has(type)) this._byType.set(type, new Set());
    this._byType.get(type).add(id);
    return id;
  }

  /** 注销实体 */
  unregister(id) {
    const e = this._map.get(id);
    if (e && this._byType.has(e.type)) {
      this._byType.get(e.type).delete(id);
      if (this._byType.get(e.type).size === 0) this._byType.delete(e.type);
    }
    this._dirty.delete(id);
    this._map.delete(id);
  }

  /** 按类型查询（O(1) 索引） */
  find(type) {
    const ids = this._byType.get(type);
    if (!ids) return [];
    const result = [];
    ids.forEach((id) => {
      const e = this._map.get(id);
      if (e) result.push(e.mesh);
    });
    return result;
  }

  /** 按标签查询 */
  findByTag(tag) {
    const result = [];
    this._map.forEach((e) => {
      if (e.tags.includes(tag)) result.push(e.mesh);
    });
    return result;
  }

  /** 获取实体元数据 */
  get(id) {
    return this._map.get(id);
  }

  /** 遍历所有实体 */
  forEach(fn) {
    this._map.forEach((e, id) => fn(e, id));
  }

  /** 实体总数 */
  get size() {
    return this._map.size;
  }

  // ===================== 脏标记系统(2026-08-01) =====================

  /**
   * 标记实体为脏——下一帧需要重建/更新
   * @param {string} id
   */
  markDirty(id) {
    if (this._map.has(id)) this._dirty.add(id);
  }

  /**
   * 标记某一类型全部为脏
   * @param {string} type
   */
  markTypeDirty(type) {
    const ids = this._byType.get(type);
    if (ids) ids.forEach((id) => this._dirty.add(id));
  }

  /**
   * 取出所有脏实体 ID 并清空标记
   * 用法：每帧 Systems 调用 getDirtyAndClear() 获取需要更新的实体列表
   * @returns {string[]} 脏实体 ID 数组
   */
  getDirtyAndClear() {
    const dirty = Array.from(this._dirty);
    this._dirty.clear();
    return dirty;
  }

  /**
   * 只遍历脏实体，执行回调
   * @param {Function} fn - 接收 (entity, id)
   */
  processDirty(fn) {
    this._dirty.forEach((id) => {
      const e = this._map.get(id);
      if (e) fn(e, id);
    });
    this._dirty.clear();
  }
}

/**
 * 输入管理器 — 统一键盘/鼠标/触摸状态，支持动作映射。
 *
 * 用法：
 *   ctx.input.on('jump', () => { ... });
 *   ctx.input.isDown('forward'); // 某键是否按下
 *
 * 动作映射（默认）：
 *   forward → W/ArrowUp
 *   back → S/ArrowDown
 *   left → A/ArrowLeft
 *   right → D/ArrowRight
 */
export class InputManager {
  constructor() {
    this._keys = {};
    this._actions = {};
    this._mouse = { x: 0, y: 0, dx: 0, dy: 0, down: false };
    this._touch = { active: false, x: 0, y: 0 };
    this._bindings = {};
  }

  /** 绑定按键到动作 */
  bindAction(action, keys) {
    if (!this._bindings[action]) this._bindings[action] = [];
    keys.forEach((k) => this._bindings[action].push(k.toLowerCase()));
  }

  /** 检查动作是否激活 */
  isDown(action) {
    if (!this._bindings[action]) return false;
    return this._bindings[action].some((k) => !!this._keys[k]);
  }

  /** 鼠标移动增量 */
  get mouseDelta() {
    return { x: this._mouse.dx, y: this._mouse.dy };
  }

  /** 原始键是否按下(供统一输入 facade 读取,不新增监听) */
  isKeyDown(key) {
    return !!this._keys[String(key).toLowerCase()];
  }

  /** 指针完整状态(绝对坐标 + 本帧增量 + 是否按下) */
  get pointer() {
    return {
      x: this._mouse.x,
      y: this._mouse.y,
      dx: this._mouse.dx,
      dy: this._mouse.dy,
      down: this._mouse.down,
    };
  }

  /** 触摸状态 */
  get touch() {
    return { active: this._touch.active, x: this._touch.x, y: this._touch.y };
  }

  /** 初始化默认按键绑定和监听 */
  initDefaults() {
    this.bindAction('forward', ['w', 'arrowup']);
    this.bindAction('back', ['s', 'arrowdown']);
    this.bindAction('left', ['a', 'arrowleft']);
    this.bindAction('right', ['d', 'arrowright']);
    this.bindAction('jump', [' ']);

    // e.key 可能是 undefined:输入法 composition / 合成事件 / 部分移动端键盘 /
    // autofill 触发的 keydown 都没有 key,直接 .toLowerCase() 会抛 TypeError。
    document.addEventListener('keydown', (e) => {
      if (!e.key) return;
      this._keys[e.key.toLowerCase()] = true;
    });
    document.addEventListener('keyup', (e) => {
      if (!e.key) return;
      this._keys[e.key.toLowerCase()] = false;
    });
    document.addEventListener('mousemove', (e) => {
      this._mouse.dx = e.movementX || 0;
      this._mouse.dy = e.movementY || 0;
      this._mouse.x = e.clientX;
      this._mouse.y = e.clientY;
    });
    document.addEventListener('mousedown', () => {
      this._mouse.down = true;
    });
    document.addEventListener('mouseup', () => {
      this._mouse.down = false;
    });
    document.addEventListener('touchstart', (e) => {
      this._touch.active = true;
      this._touch.x = e.touches[0].clientX;
      this._touch.y = e.touches[0].clientY;
    });
    document.addEventListener('touchmove', (e) => {
      this._touch.x = e.touches[0].clientX;
      this._touch.y = e.touches[0].clientY;
    });
    document.addEventListener('touchend', () => {
      this._touch.active = false;
    });
  }

  /** 注册动作回调（在 INPUT 阶段调用） */
  on(action, fn) {
    if (!this._actions[action]) this._actions[action] = [];
    this._actions[action].push(fn);
  }

  /** 每一帧调用（INPUT 阶段） */
  tick(dt) {
    for (const [action, fns] of Object.entries(this._actions)) {
      if (this.isDown(action)) fns.forEach((fn) => fn(dt));
    }
    this._mouse.dx = 0;
    this._mouse.dy = 0; // 复位增量
  }
}
