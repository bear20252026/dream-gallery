// ===================== 山河舆图·纸质地形地板(2026-08-29) =====================
// 移植自 Chartogne-Taillet 的核心效果:terrainData 高度图 + paper 纸纹 + 噪声流动 + 等高线金描。
// 手法(与 chartogne 的 3D 纸质山丘同源):
//   - 高度图驱动顶点微位移(边缘衰减到 0,保证与墙面齐平、不破坏行走碰撞)
//   - 片元:纸纹平铺(perlin 扰动 UV,画面"活"起来) + 高低染色(低处墨褐/高处纸金) + 等高线金描
//   - 基于 MeshStandardMaterial 的 onBeforeCompile 注入,保留画廊原有 PBR 灯光
// 纹理来自 public/textures/(paper/perlin/terrain1),缺失时自动回退纯色,不阻塞加载。
import * as THREE from 'three';

function loadTex(url, repeat, srgb) {
  const tex = new THREE.TextureLoader().load(
    url,
    undefined,
    undefined,
    () => {
      console.warn('[paper-floor] 纹理缺失,回退纯色:', url);
    }
  );
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (repeat) tex.repeat.set(repeat, repeat);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 生成「山河舆图」纸质地形材质(PBR 标准材质 + shader 注入)
 * @param {object} [opts]
 * @param {number} [opts.height=0.22]   顶点起伏幅度(世界单位;边缘衰减)
 * @param {number} [opts.contours=13]   等高线圈数
 * @param {string} [opts.lineColor]     等高线描色(香槟金)
 * @returns {THREE.MeshStandardMaterial}
 */
export function createPaperTerrainMaterial(opts) {
  const o = opts || {};
  const height = o.height != null ? o.height : 0.22;
  const contours = o.contours != null ? o.contours : 13;
  const lineColor = new THREE.Color(o.lineColor || '#c9a96e');

  const paperTex = loadTex('textures/paper.jpg', 1, true);
  const perlinTex = loadTex('textures/perlin.jpg', 1, false);
  const terrainTex = loadTex('textures/terrain1.jpg', 1, false);

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.04 });
  const uniforms = {
    uPaper: { value: paperTex },
    uPerlin: { value: perlinTex },
    uTerrain: { value: terrainTex },
    uTime: { value: 0 },
    uHeight: { value: height },
    uContours: { value: contours },
    uLineColor: { value: lineColor },
  };
  mat.userData.paperUniforms = uniforms;

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader =
      'uniform float uTime;\nuniform float uHeight;\nuniform sampler2D uTerrain;\nvarying vec2 vPUv;\nvarying float vPH;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vPUv = uv;
        float ph = texture2D(uTerrain, uv).r;
        vPH = ph;
        // 边缘衰减:保证地板四周与墙面齐平,不产生缝隙,也不影响行走碰撞(起伏仅视觉)
        float pe = smoothstep(0.0, 0.14, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
        transformed.z += (ph - 0.5) * uHeight * pe;`
      );

    shader.fragmentShader =
      'uniform sampler2D uPaper;\nuniform sampler2D uPerlin;\nuniform sampler2D uTerrain;\nuniform float uTime;\nuniform float uContours;\nuniform vec3 uLineColor;\nvarying vec2 vPUv;\nvarying float vPH;\n' +
      shader.fragmentShader.replace(
        '#include <map_fragment>',
        `vec2 pUv = vPUv;
        // 噪声扰动 UV:让纸面像 chartogne 那样微微流动
        vec2 pn = texture2D(uPerlin, pUv * 1.6 + vec2(uTime * 0.012, uTime * 0.008)).rg - 0.5;
        vec2 wUv = pUv + pn * 0.010;
        // 纸纹(平铺)
        vec3 paper = texture2D(uPaper, wUv * 24.0).rgb;
        // 地形高度(扰动后采样)
        float h = texture2D(uTerrain, wUv).r;
        // 高低染色:低处墨褐 → 高处纸金
        vec3 lowC  = vec3(0.58, 0.52, 0.43);
        vec3 highC = vec3(0.97, 0.90, 0.74);
        vec3 col = mix(lowC, highC, smoothstep(0.12, 0.88, h));
        col *= mix(0.70, 1.06, paper.r);
        // 等高线金描(无 fwidth,兼容 WebGL1)
        float bands = h * uContours;
        float dC = abs(fract(bands) - 0.5);
        float line = 1.0 - smoothstep(0.015, 0.055, dC);
        col = mix(col, uLineColor, line * 0.5);
        // 边缘淡出:与画廊地面自然衔接
        float pE = smoothstep(0.0, 0.05, min(min(pUv.x, 1.0 - pUv.x), min(pUv.y, 1.0 - pUv.y)));
        col = mix(vec3(0.90, 0.86, 0.79), col, pE);
        diffuseColor.rgb *= col;`
      );
  };
  return mat;
}

/** 每帧推进 uTime(由调用方在主循环里调用) */
export function updatePaperTerrain(mat, t) {
  const u = mat && mat.userData && mat.userData.paperUniforms;
  if (u) u.uTime.value = t;
}
