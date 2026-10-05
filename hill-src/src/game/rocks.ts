import * as THREE from 'three'
import { RAPIER, type Physics } from '../engine/physics'
import { noise2, rng } from './noise'
import { terrainHeight, terrainNormal } from './terrain'

/**
 * Grey rocks half-buried in the meadow. Each is the intersection of random half-spaces (a chunky
 * convex polyhedron, like painted anime rocks) with gentle noise, smooth-ish normals and moss on
 * the upward faces.
 */
type RockSpec = { x: number; z: number; s: number; yaw: number; tilt: number }

function rockGeometry(seed: number): THREE.BufferGeometry {
  const R = rng(seed)
  const planes: { n: THREE.Vector3; d: number }[] = []
  for (let i = 0; i < 13; i += 1) {
    const n = new THREE.Vector3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1).normalize()
    planes.push({ n, d: 0.72 + R() * 0.28 })
  }
  const geo = new THREE.IcosahedronGeometry(1, 4)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const dir = new THREE.Vector3()
  for (let i = 0; i < pos.count; i += 1) {
    dir.fromBufferAttribute(pos, i).normalize()
    let r = 1.25
    for (const p of planes) {
      const c = dir.dot(p.n)
      if (c > 1e-3) r = Math.min(r, p.d / c)
    }
    r *= 1 + noise2(dir.x * 2.3 + seed, dir.z * 2.3 + dir.y, 3) * 0.05
    pos.setXYZ(i, dir.x * r * 1.15, dir.y * r * 0.72, dir.z * r)
  }
  geo.computeVertexNormals()
  return geo
}

function rockMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.25, 0.265, 0.29), roughness: 0.92, metalness: 0, flatShading: false })
  m.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRockN;\nvarying vec3 vRockP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvRockN = normalize(mat3(modelMatrix) * objectNormal);\nvRockP = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRockN;\nvarying vec3 vRockP;')
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        float streak = fract(sin(dot(floor(vRockP * 3.1), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        diffuseColor.rgb *= 0.86 + streak * 0.22;
        float moss = smoothstep(0.55, 0.9, vRockN.y) * smoothstep(0.35, 0.65, fract(sin(dot(floor(vRockP * 1.7), vec3(7.1, 3.7, 5.3))) * 921.7) * 0.6 + 0.4);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.22, 0.04), moss * 0.75);
        // Bottoms blend into the turf.
        diffuseColor.rgb = mix(vec3(0.05, 0.12, 0.03), diffuseColor.rgb, smoothstep(-0.25, 0.25, vRockN.y + 0.2));`,
      )
  }
  return m
}

export class Rocks {
  readonly group = new THREE.Group()
  readonly grassMask: { x: number; z: number; r: number }[] = []
  readonly specs: RockSpec[] = []

  constructor(physics: Physics, avoid: { x: number; z: number; r: number }[] = []) {
    this.group.name = 'rocks'
    const R = rng(19)
    // Hand-placed feature rocks (in view from the approach), then a scatter over the slopes.
    const feature: RockSpec[] = [
      { x: 13, z: 9, s: 1.7, yaw: 0.4, tilt: 0.15 },
      { x: 15.2, z: 11.6, s: 0.8, yaw: 1.2, tilt: 0.2 },
      { x: -11, z: 14, s: 1.2, yaw: 2.1, tilt: 0.1 },
      { x: 24, z: -6, s: 2.4, yaw: 0.9, tilt: 0.25 },
      { x: 26.5, z: -3.2, s: 1.1, yaw: 0.2, tilt: 0.3 },
      { x: 9, z: 41, s: 1.4, yaw: 1.9, tilt: 0.2 },
      { x: -19, z: -16, s: 1.9, yaw: 0.7, tilt: 0.12 },
      { x: 3, z: -23, s: 1.0, yaw: 2.8, tilt: 0.2 },
    ]
    this.specs.push(...feature)
    for (let i = 0; i < 400 && this.specs.length < 26; i += 1) {
      const a = R() * Math.PI * 2
      const d = 20 + R() * 70
      const x = Math.sin(a) * d
      const z = Math.cos(a) * d
      // Keep the approach path from the spawn clear.
      if (Math.abs(x - 4) < 5 && z > 8 && z < 40) continue
      if (this.specs.some(s => Math.hypot(s.x - x, s.z - z) < s.s + 4)) continue
      if (avoid.some(c => Math.hypot(c.x - x, c.z - z) < c.r + 2.5)) continue
      this.specs.push({ x, z, s: 0.5 + Math.pow(R(), 2) * 2.2, yaw: R() * 6.28, tilt: R() * 0.3 })
    }
    const mat = rockMaterial()
    const geos = [11, 23, 37, 53, 71].map(rockGeometry)
    const n = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    this.specs.forEach((s, i) => {
      const geo = geos[i % geos.length]
      const mesh = new THREE.Mesh(geo, mat)
      const y = terrainHeight(s.x, s.z)
      terrainNormal(s.x, s.z, n)
      mesh.position.set(s.x, y - s.s * 0.28, s.z)
      mesh.quaternion.setFromUnitVectors(up, n.clone().lerp(up, 0.5).normalize())
      mesh.rotateY(s.yaw)
      mesh.rotateX(s.tilt)
      mesh.scale.setScalar(s.s)
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.group.add(mesh)
      mesh.updateMatrixWorld(true)
      const p = geo.getAttribute('position') as THREE.BufferAttribute
      const pts = new Float32Array(p.count * 3)
      const v = new THREE.Vector3()
      for (let k = 0; k < p.count; k += 1) {
        v.fromBufferAttribute(p, k).applyMatrix4(mesh.matrixWorld)
        pts.set([v.x, v.y, v.z], k * 3)
      }
      const hull = RAPIER.ColliderDesc.convexHull(pts)
      if (hull) physics.world.createCollider(hull.setFriction(0.9))
      this.grassMask.push({ x: s.x, z: s.z, r: s.s * 0.95 })
    })
  }
}
