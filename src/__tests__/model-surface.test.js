import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createModelSurface } from '../scene/model-surface.js';

describe('原模型地表行走', () => {
  function planet() {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32));
    mesh.scale.y = 0.8;
    mesh.position.set(-2, -8, 1);
    return createModelSurface([mesh]);
  }
  it('中心与坡面高度来自真实网格，不沿固定平面悬空', () => {
    const surface = planet();
    expect(surface.height(-2, 1)).toBeCloseTo(0, 2);
    expect(surface.height(4, 1)).toBeCloseTo(-1.6, 1);
    expect(surface.place({ x: 4, z: 1 }).y).toBeCloseTo(0, 1);
    expect(surface.height(30, 30)).toBeUndefined();
  });
  it('越界输入保持在可走地表，地表孔洞保留上一处安全站位', () => {
    const surface = planet(),
      previous = surface.place({ x: -2, z: 1 });
    const next = surface.place({ x: 100, z: 1 }, previous);
    expect(Math.hypot(next.x + 2, next.z - 1)).toBeLessThanOrEqual(9.01);
    expect(next.y - 1.6).toBeCloseTo(surface.height(next.x, next.z));
    const mesh = new THREE.Mesh(new THREE.RingGeometry(1, 2, 32));
    mesh.rotation.x = -Math.PI / 2;
    const small = createModelSurface([mesh]);
    expect(small.place({ x: 0, z: 0 }, { x: 1.5, z: 0 })).toEqual({ x: 1.5, y: 1.6, z: 0 });
  });
  it('包含父级整体放大与平移，装饰网格不参与采样', () => {
    const group = new THREE.Group();
    group.scale.setScalar(2);
    group.position.y = -3;
    const ground = new THREE.Mesh(new THREE.SphereGeometry(2, 32, 16));
    group.add(ground);
    const rose = new THREE.Mesh(new THREE.BoxGeometry(1, 10, 1));
    group.add(rose);
    const surface = createModelSurface([ground]);
    expect(surface.height(0, 0)).toBeCloseTo(1, 2);
    expect(surface.place({ x: 0, z: 0 }).y).toBeCloseTo(2.6, 2);
  });
});
