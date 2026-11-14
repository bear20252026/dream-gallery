// surface-detail.test.js — 灰泥/接触阴影注入契约(2026-11-13 首屏六项轮)
// node 无 WebGL/DOM:锁注入契约与容错;真实观感由实机截图验证。
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { attachStucco } from '../scene/stucco.js';
import { makeContactShadows } from '../scene/desert/contact-shadows.js';

describe('attachStucco — 灰泥注入契约', () => {
  it('幂等:重复调用不叠加', () => {
    const m = new THREE.MeshStandardMaterial();
    attachStucco(m);
    const f = m.onBeforeCompile;
    attachStucco(m);
    expect(m.onBeforeCompile).toBe(f);
  });
  it('锚点保留且细节代码插在其后;实例化坐标有注入', () => {
    const m = new THREE.MeshStandardMaterial();
    attachStucco(m);
    const sh = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    };
    m.onBeforeCompile(sh);
    expect(sh.vertexShader).toContain('#include <begin_vertex>');
    expect(sh.vertexShader).toContain('instanceMatrix');
    expect(sh.fragmentShader).toContain('#include <color_fragment>');
    expect(sh.fragmentShader.indexOf('diffuseColor.rgb *=')).toBeGreaterThan(
      sh.fragmentShader.indexOf('#include <color_fragment>')
    );
    expect(sh.fragmentShader).toContain('#include <roughnessmap_fragment>');
  });
  it('null 容错', () => {
    expect(() => attachStucco(null)).not.toThrow();
  });
});

describe('makeContactShadows — 容错与结构', () => {
  it('无 DOM(node)返回 null 不抛', () => {
    expect(makeContactShadows([{ x: 0, y: 0, z: 0, r: 1 }])).toBeNull();
  });
  it('空落点返回 null', () => {
    expect(makeContactShadows([])).toBeNull();
    expect(makeContactShadows(null)).toBeNull();
  });
});
