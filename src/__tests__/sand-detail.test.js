// sand-detail.test.js — 沙地程序化细节的回归锁(2026-11-12 画质:去塑料感)
//
// node 环境没有 WebGL,不能真编译着色器;这里锁的是**注入契约**:
// 替换的 #include 锚点必须存在、uniform 必须挂上、幂等不叠加、时间推进生效。
// 真实视觉效果由实机截图验证(.tmp/mood-shots)。
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  attachSandDetail,
  tickSandDetail,
  sandDetailUniforms,
} from '../scene/desert/sand-detail.js';

/** 取 three 内置 standard 着色器模板,验证锚点真实存在(防止替换静默落空) */
function standardTemplates() {
  return {
    vert: THREE.ShaderLib.standard.vertexShader,
    frag: THREE.ShaderLib.standard.fragmentShader,
  };
}

describe('attachSandDetail — 注入契约', () => {
  it('挂上 onBeforeCompile 且幂等(重复调用不叠加)', () => {
    const mat = new THREE.MeshStandardMaterial();
    attachSandDetail(mat);
    const first = mat.onBeforeCompile;
    expect(typeof first).toBe('function');
    attachSandDetail(mat);
    expect(mat.onBeforeCompile).toBe(first); // 同一函数,没被包第二层
    // 注意:three 的 needsUpdate 是**只写访问器**(set 里 bump version,读回 undefined),
    // 不能断言它 === true;幂等性由 onBeforeCompile 同一引用保证。
  });

  it('锚点真实存在于 three 模板(替换不会静默落空)', () => {
    const t = standardTemplates();
    expect(t.vert).toContain('#include <begin_vertex>');
    expect(t.frag).toContain('#include <color_fragment>');
    expect(t.frag).toContain('#include <roughnessmap_fragment>');
  });

  it('注入后着色器含世界坐标 varying 与两个 uniform,且锚点保留', () => {
    const mat = new THREE.MeshStandardMaterial();
    attachSandDetail(mat);
    const t = standardTemplates();
    const shader = {
      uniforms: {},
      vertexShader: t.vert,
      fragmentShader: t.frag,
    };
    mat.onBeforeCompile(shader);
    expect(shader.uniforms.uSandTime).toBe(sandDetailUniforms.uSandTime);
    expect(shader.uniforms.uSandDetail).toBe(sandDetailUniforms.uSandDetail);
    expect(shader.vertexShader).toContain('vSandWorld');
    expect(shader.vertexShader).toContain('#include <begin_vertex>'); // 原锚点保留
    expect(shader.fragmentShader).toContain('vSandWorld');
    expect(shader.fragmentShader).toContain('uSandDetail');
    expect(shader.fragmentShader).toContain('#include <color_fragment>');
    expect(shader.fragmentShader).toContain('#include <roughnessmap_fragment>');
    // 细节**调用块**插在锚点之后(噪声函数声明在头部,不能用它判位置;
    // 用只出现在注入块里的 diffuseColor.rgb *= m 判)
    expect(shader.fragmentShader.indexOf('diffuseColor.rgb *= m')).toBeGreaterThan(
      shader.fragmentShader.indexOf('#include <color_fragment>')
    );
    expect(shader.fragmentShader.indexOf('roughnessFactor = clamp')).toBeGreaterThan(
      shader.fragmentShader.indexOf('#include <roughnessmap_fragment>')
    );
  });

  it('null 材质不抛(装配顺序容错)', () => {
    expect(() => attachSandDetail(null)).not.toThrow();
  });
});

describe('tickSandDetail — 云影时间', () => {
  it('推进 uniform 值', () => {
    tickSandDetail(12.5);
    expect(sandDetailUniforms.uSandTime.value).toBe(12.5);
    tickSandDetail(0);
    expect(sandDetailUniforms.uSandTime.value).toBe(0);
  });
});
