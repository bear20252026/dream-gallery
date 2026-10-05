import * as THREE from 'three'
import { RAPIER, type Physics } from '../engine/physics'
import { GLSL_MEADOW, GLSL_NOISE, GLSL_WIND } from './glsl'
import { fbm2, smoothstep } from './noise'

/**
 * Summit dome: gentle meadow within ~50 m of the ruin, then ever steeper slopes that plunge into
 * the cloud sea (~ -128 m) about 125 m out. Pure function of x/z so grass, props and physics agree.
 */
export function terrainHeight(x: number, z: number): number {
  const r = Math.hypot(x, z)
  let h = -0.0055 * r * r - 0.004 * Math.pow(Math.max(0, r - 45), 2.1)
  // A long shoulder toward the approach side (+z, slightly +x) so the ruin is seen from below.
  const a = Math.atan2(x, z)
  const shoulder = Math.exp(-((a - 0.25) ** 2) / 0.35) * smoothstep(14, 70, r) * smoothstep(150, 70, r)
  h += shoulder * 9
  // The far (shadow) side falls away faster, like the reference hill's dark right flank.
  h -= Math.max(0, x) * 0.05 * smoothstep(20, 80, r)
  h += fbm2(x / 46, z / 46, 3, 11) * 3.2 * smoothstep(6, 40, r)
  h += fbm2(x / 13 + 7.3, z / 13 - 2.1, 2, 23) * 0.42 * smoothstep(4, 18, r)
  // Small mound the ring base sits in.
  h += 0.55 * Math.exp(-(r * r) / 26)
  return h
}

export function terrainNormal(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  const e = 0.35
  const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z)
  const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e)
  return out.set(-hx, 2 * e, -hz).normalize()
}

/** Height texture (R = height, G/B = normal x/z, A = grass mask) for the grass vertex shader. */
export const HEIGHT_TEX = { size: 512, extent: 128 } as const

export class Terrain {
  readonly mesh: THREE.Mesh
  readonly heightTexture: THREE.DataTexture
  readonly material: THREE.MeshLambertMaterial
  readonly uniforms = {
    uTime: { value: 0 },
    uWindDir: { value: new THREE.Vector2(1, 0) },
    uWindSpeed: { value: 6 },
    uWindScroll: { value: 0 },
    uWindGust: { value: 0 },
    uSunDirT: { value: new THREE.Vector3(-0.72, 0.55, 0.42).normalize() },
  }
  private readonly heightData: Float32Array
  private readonly texData: Uint16Array

  constructor(physics: Physics) {
    this.mesh = new THREE.Mesh(this.buildGeometry(), (this.material = this.buildMaterial()))
    this.mesh.receiveShadow = true
    this.mesh.name = 'terrain'
    this.addCollider(physics)
    const { size, extent } = HEIGHT_TEX
    this.heightData = new Float32Array(size * size * 4)
    const n = new THREE.Vector3()
    for (let j = 0; j < size; j += 1) {
      for (let i = 0; i < size; i += 1) {
        const x = ((i + 0.5) / size) * 2 * extent - extent
        const z = ((j + 0.5) / size) * 2 * extent - extent
        terrainNormal(x, z, n)
        const k = (j * size + i) * 4
        this.heightData[k] = terrainHeight(x, z)
        this.heightData[k + 1] = n.x
        this.heightData[k + 2] = n.z
        this.heightData[k + 3] = 1
      }
    }
    // Half floats are always linearly filterable in WebGL2 (full floats are not everywhere).
    this.texData = new Uint16Array(this.heightData.length)
    this.heightTexture = new THREE.DataTexture(this.texData, size, size, THREE.RGBAFormat, THREE.HalfFloatType)
    this.heightTexture.minFilter = THREE.LinearFilter
    this.heightTexture.magFilter = THREE.LinearFilter
    this.upload()
  }

  private upload(): void {
    for (let i = 0; i < this.heightData.length; i += 1) this.texData[i] = THREE.DataUtils.toHalfFloat(this.heightData[i])
    this.heightTexture.needsUpdate = true
  }

  /** Clear grass under props: circles (x, z, radius) get mask 0 with a soft edge. */
  maskGrass(circles: { x: number; z: number; r: number }[]): void {
    const { size, extent } = HEIGHT_TEX
    const texel = (2 * extent) / size
    for (const c of circles) {
      const i0 = Math.max(0, Math.floor((c.x - c.r - 1 + extent) / texel))
      const i1 = Math.min(size - 1, Math.ceil((c.x + c.r + 1 + extent) / texel))
      const j0 = Math.max(0, Math.floor((c.z - c.r - 1 + extent) / texel))
      const j1 = Math.min(size - 1, Math.ceil((c.z + c.r + 1 + extent) / texel))
      for (let j = j0; j <= j1; j += 1) {
        for (let i = i0; i <= i1; i += 1) {
          const x = (i + 0.5) * texel - extent
          const z = (j + 0.5) * texel - extent
          const d = Math.hypot(x - c.x, z - c.z)
          const k = (j * size + i) * 4 + 3
          this.heightData[k] = Math.min(this.heightData[k], smoothstep(c.r * 0.8, c.r + 0.6, d))
        }
      }
    }
    this.upload()
  }

  update(time: number, wind: { dir: THREE.Vector2; speed: number; scroll: number; gustSmooth: number }): void {
    this.uniforms.uTime.value = time
    this.uniforms.uWindDir.value.copy(wind.dir)
    this.uniforms.uWindSpeed.value = wind.speed
    this.uniforms.uWindScroll.value = wind.scroll
    this.uniforms.uWindGust.value = wind.gustSmooth
  }

  /** Non-uniform grid: ~0.45 m cells at the summit growing to ~20 m at the 460 m rim. */
  private buildGeometry(): THREE.BufferGeometry {
    const N = 300
    const map = (u: number) => 64 * u + 396 * u * u * u
    const verts = (N + 1) * (N + 1)
    const pos = new Float32Array(verts * 3)
    const nor = new Float32Array(verts * 3)
    const n = new THREE.Vector3()
    for (let j = 0; j <= N; j += 1) {
      for (let i = 0; i <= N; i += 1) {
        const x = map((i / N) * 2 - 1)
        const z = map((j / N) * 2 - 1)
        const k = (j * (N + 1) + i) * 3
        pos[k] = x
        pos[k + 1] = terrainHeight(x, z)
        pos[k + 2] = z
        terrainNormal(x, z, n)
        nor[k] = n.x
        nor[k + 1] = n.y
        nor[k + 2] = n.z
      }
    }
    const index = new Uint32Array(N * N * 6)
    let o = 0
    for (let j = 0; j < N; j += 1) {
      for (let i = 0; i < N; i += 1) {
        const a = j * (N + 1) + i
        const b = a + 1
        const c = a + N + 1
        const d = c + 1
        index.set([a, c, b, b, c, d], o)
        o += 6
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
    geo.setIndex(new THREE.BufferAttribute(index, 1))
    geo.computeBoundingSphere()
    return geo
  }

  private addCollider(physics: Physics): void {
    const half = 116
    const step = 1
    const n = (2 * half) / step + 1
    const vertices = new Float32Array(n * n * 3)
    for (let j = 0; j < n; j += 1) {
      for (let i = 0; i < n; i += 1) {
        const x = -half + i * step
        const z = -half + j * step
        const k = (j * n + i) * 3
        vertices[k] = x
        vertices[k + 1] = terrainHeight(x, z)
        vertices[k + 2] = z
      }
    }
    const indices = new Uint32Array((n - 1) * (n - 1) * 6)
    let o = 0
    for (let j = 0; j < n - 1; j += 1) {
      for (let i = 0; i < n - 1; i += 1) {
        const a = j * n + i
        const b = a + 1
        const c = a + n
        const d = c + 1
        indices.set([a, c, b, b, c, d], o)
        o += 6
      }
    }
    physics.world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices).setFriction(0.8))
  }

  private buildMaterial(): THREE.MeshLambertMaterial {
    // Lambert like the grass: no grazing specular sheen, so blades and turf read as one surface.
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff })
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vWorldPos;\nuniform vec3 uSunDirT;\n${GLSL_NOISE}\n${GLSL_MEADOW}\n${GLSL_WIND}`)
        .replace(
          '#include <color_fragment>',
          /* glsl */ `#include <color_fragment>
          {
            vec2 xz = vWorldPos.xz;
            float fine = vnoise(xz * 1.7) * 0.6 + vnoise(xz * 5.3) * 0.4;
            vec3 col = meadowColor(xz) * (0.8 + fine * 0.34);
            // The turf seen between near blades is their shaded understory.
            col *= mix(0.8, 1.0, smoothstep(30.0, 110.0, distance(vWorldPos, cameraPosition)));
            // Distant meadow: wind waves brighten the grass as they pass.
            float gust = windAt(xz).x;
            col *= 1.0 + gust * 0.22;
            // Slopes turned from the sun lean blue (matches the grass).
            vec3 wn = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
            wn *= sign(wn.y + 1e-4);
            col = meadowShade(col, dot(wn, uSunDirT));
            diffuseColor.rgb = col;
          }`,
        )
    }
    return material
  }
}
