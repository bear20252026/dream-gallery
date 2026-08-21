// EntityRegistry 单元测试
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntityRegistry } from '../engine.js';

// Mock THREE.Object3D
function mockMesh(name = 'mesh') {
  return { isObject3D: true, name, visible: true };
}

describe('EntityRegistry', () => {
  let reg;

  beforeEach(() => {
    reg = new EntityRegistry();
  });

  it('初始状态为空', () => {
    expect(reg.size).toBe(0);
    expect(reg.find('painting')).toEqual([]);
    expect(reg.findByTag('wall')).toEqual([]);
  });

  it('register 返回唯一 ID', () => {
    const id1 = reg.register(mockMesh('a'), { type: 'painting' });
    const id2 = reg.register(mockMesh('b'), { type: 'painting' });
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^ent_/);
    expect(reg.size).toBe(2);
  });

  it('find 按类型 O(1) 查询', () => {
    reg.register(mockMesh('p1'), { type: 'painting' });
    reg.register(mockMesh('p2'), { type: 'painting' });
    reg.register(mockMesh('s1'), { type: 'sign' });
    const paintings = reg.find('painting');
    expect(paintings).toHaveLength(2);
    expect(paintings.every((m) => m.name.startsWith('p'))).toBe(true);
  });

  it('findByTag 按标签查询', () => {
    reg.register(mockMesh('a'), { type: 'painting', tags: ['north', 'oil'] });
    reg.register(mockMesh('b'), { type: 'painting', tags: ['south'] });
    reg.register(mockMesh('c'), { type: 'sign', tags: ['north'] });
    const northItems = reg.findByTag('north');
    expect(northItems).toHaveLength(2);
  });

  it('get 返回实体元数据', () => {
    const mesh = mockMesh('test');
    const id = reg.register(mesh, { type: 'marker', tags: ['floor'], data: { room: 1 } });
    const entry = reg.get(id);
    expect(entry.mesh).toBe(mesh);
    expect(entry.type).toBe('marker');
    expect(entry.tags).toEqual(['floor']);
    expect(entry.data).toEqual({ room: 1 });
  });

  it('unregister 移除实体', () => {
    const id = reg.register(mockMesh(), { type: 'painting' });
    expect(reg.size).toBe(1);
    reg.unregister(id);
    expect(reg.size).toBe(0);
    expect(reg.get(id)).toBeUndefined();
  });

  it('unregister 后 find 不再返回', () => {
    const id = reg.register(mockMesh('gone'), { type: 'sign' });
    reg.unregister(id);
    expect(reg.find('sign')).toEqual([]);
  });

  it('forEach 遍历所有实体', () => {
    reg.register(mockMesh('a'), { type: 'a' });
    reg.register(mockMesh('b'), { type: 'b' });
    const items = [];
    reg.forEach((e) => items.push(e.mesh.name));
    expect(items).toEqual(['a', 'b']);
  });

  it('markDirty + getDirtyAndClear', () => {
    const id1 = reg.register(mockMesh(), { type: 'a' });
    const id2 = reg.register(mockMesh(), { type: 'b' });
    reg.markDirty(id1);
    reg.markDirty(id2);
    const dirty = reg.getDirtyAndClear();
    expect(dirty).toEqual([id1, id2]);
    // 二次调用为空
    expect(reg.getDirtyAndClear()).toEqual([]);
  });

  it('markTypeDirty 标记某类型全部为脏', () => {
    const id1 = reg.register(mockMesh(), { type: 'painting' });
    const id2 = reg.register(mockMesh(), { type: 'painting' });
    const id3 = reg.register(mockMesh(), { type: 'sign' });
    reg.markTypeDirty('painting');
    const dirty = reg.getDirtyAndClear();
    expect(dirty).toContain(id1);
    expect(dirty).toContain(id2);
    expect(dirty).not.toContain(id3);
  });

  it('processDirty 处理后清空', () => {
    const id = reg.register(mockMesh('x'), { type: 'a' });
    reg.markDirty(id);
    const processed = [];
    reg.processDirty((e) => processed.push(e.mesh.name));
    expect(processed).toEqual(['x']);
    expect(reg.getDirtyAndClear()).toEqual([]);
  });

  it('markDirty 对不存在的 ID 不报错', () => {
    expect(() => reg.markDirty('nonexistent')).not.toThrow();
  });
});
