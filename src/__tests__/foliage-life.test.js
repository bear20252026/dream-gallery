// foliage-life.test.js — 植被风摆/斑驳注入契约(2026-11-13 自然表面轮)
// node 无 WebGL,锁注入契约;真实观感由实机截图验证。
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { attachFoliageLife, tickFoliage, foliageUniforms } from '../scene/desert/foliage-life.js';

function std() {
  return {
    vert: THREE.ShaderLib.standard.vertexShader,
    frag: THREE.ShaderLib.standard.fragmentShader,
  };
}

describe('attachFoliageLife — 注入契约', () => {
  it('幂等:重复调用不叠加 onBeforeCompile', () => {
    const m = new THREE.MeshStandardMaterial();
    attachFoliageLife(m, { sway: 0.1, base: 0, height: 1, mottle: 0.2 });
    const f = m.onBeforeCompile;
    attachFoliageLife(m, { sway: 0.9, base: 9, height: 9, mottle: 0.9 });
    expect(m.onBeforeCompile).toBe(f);
  });

  it('锚点真实存在;注入保留锚点且代码在其后', () => {
    const t = std();
    expect(t.vert).toContain('#include <begin_vertex>');
    expect(t.frag).toContain('#include <color_fragment>');
    const m = new THREE.MeshStandardMaterial();
    attachFoliageLife(m, { sway: 0.1, base: 0, height: 1, mottle: 0.2 });
    const sh = { uniforms: {}, vertexShader: t.vert, fragmentShader: t.frag };
    m.onBeforeCompile(sh);
    expect(sh.vertexShader).toContain('#include <begin_vertex>');
    expect(sh.vertexShader).toContain('instanceMatrix'); // 实例化世界坐标
    expect(sh.vertexShader.indexOf('transformed.x +=')).toBeGreaterThan(
      sh.vertexShader.indexOf('#include <begin_vertex>')
    );
    expect(sh.fragmentShader).toContain('#include <color_fragment>');
    expect(sh.fragmentShader.indexOf('diffuseColor.rgb *=')).toBeGreaterThan(
      sh.fragmentShader.indexOf('#include <color_fragment>')
    );
  });

  it('共享风时间 uniform;每材质独立摆幅', () => {
    const a = new THREE.MeshStandardMaterial();
    const b = new THREE.MeshStandardMaterial();
    attachFoliageLife(a, { sway: 0.1, base: 0, height: 1, mottle: 0.2 });
    attachFoliageLife(b, { sway: 0.5, base: 2, height: 3, mottle: 0.3 });
    const sa = { uniforms: {}, vertexShader: std().vert, fragmentShader: std().frag };
    const sb = { uniforms: {}, vertexShader: std().vert, fragmentShader: std().frag };
    a.onBeforeCompile(sa);
    b.onBeforeCompile(sb);
    expect(sa.uniforms.uWindTime).toBe(foliageUniforms.uWindTime);
    expect(sb.uniforms.uWindTime).toBe(foliageUniforms.uWindTime);
    expect(sa.uniforms.uSway.value).toBe(0.1);
    expect(sb.uniforms.uSway.value).toBe(0.5);
    expect(sb.uniforms.uBase.value).toBe(2);
  });

  it('缺省参数不抛、null 材质容错', () => {
    const m = new THREE.MeshStandardMaterial();
    expect(() => attachFoliageLife(m)).not.toThrow();
    expect(() => attachFoliageLife(null)).not.toThrow();
    const sh = { uniforms: {}, vertexShader: std().vert, fragmentShader: std().frag };
    m.onBeforeCompile(sh);
    expect(Number.isFinite(sh.uniforms.uSway.value)).toBe(true);
    expect(sh.uniforms.uHeight.value).toBeGreaterThan(0); // 除零保护
  });
});

describe('tickFoliage — 风时间', () => {
  it('推进共享 uniform', () => {
    tickFoliage(7.25);
    expect(foliageUniforms.uWindTime.value).toBe(7.25);
    tickFoliage(0);
    expect(foliageUniforms.uWindTime.value).toBe(0);
  });
});
