import * as THREE from 'three'
import { beforeAll, expect, test } from 'vitest'
import { initPhysics, Physics } from '../src/engine/physics'
import { Ruin, type BodyCapsule } from '../src/game/ruin'
import { terrainHeight } from '../src/game/terrain'

const wind = { uTime: { value: 0 }, uWindDir: { value: new THREE.Vector2(1, 0) }, uWindSpeed: { value: 1 }, uWindScroll: { value: 0 }, uWindGust: { value: 0 } }
let ruin: Ruin

beforeAll(async () => {
  await initPhysics()
  ruin = new Ruin(new Physics(), wind)
})

/** Distance from p to the capsule's core segment. */
function segDist(p: THREE.Vector3, c: BodyCapsule): number {
  const ab = c.b.clone().sub(c.a)
  const t = ab.lengthSq() > 1e-9 ? THREE.MathUtils.clamp(p.clone().sub(c.a).dot(ab) / ab.lengthSq(), 0, 1) : 0
  return p.distanceTo(c.a.clone().addScaledVector(ab, t))
}

test('the guardian sits on the summit: round and wide, not tall and slender', () => {
  const body = ruin.group.getObjectByName('guardian') as THREE.Mesh
  const ground = terrainHeight(0, 0)
  const pos = body.geometry.getAttribute('position')
  const f = ruin.anchors.forward
  const side = new THREE.Vector3(f.z, 0, -f.x)
  let top = -Infinity
  let lo = Infinity
  let hi = -Infinity
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i)
    top = Math.max(top, v.y)
    const s = v.dot(side)
    lo = Math.min(lo, s)
    hi = Math.max(hi, s)
  }
  const height = top - ground
  expect(height).toBeGreaterThan(7.5)
  expect(height).toBeLessThan(10)
  // Chubby: wider from hand to hand than it is tall (the old slender figure was about 0.55).
  expect((hi - lo) / height).toBeGreaterThan(0.9)
  // Sunk slightly into the turf, never floating above it.
  const box = new THREE.Box3().setFromObject(ruin.group)
  expect(box.min.y).toBeLessThan(terrainHeight(box.min.x, box.min.z) + 0.2)
})

test('its body meshes are merged and indexed, with grass growing on it', () => {
  const body = ruin.group.getObjectByName('guardian') as THREE.Mesh
  const grass = ruin.group.getObjectByName('guardian-grass') as THREE.Mesh
  expect(body.geometry.index).not.toBeNull()
  expect(grass.geometry.getAttribute('position').count).toBeGreaterThan(5000)
})

test('the silk is tied high on its head, clear of every shape it drapes over', () => {
  const a = ruin.anchors
  expect(a.knot.y - terrainHeight(0, 0)).toBeGreaterThan(7)
  expect(a.body.length).toBeGreaterThanOrEqual(8)
  for (const c of a.body) expect(segDist(a.knot, c)).toBeGreaterThanOrEqual(c.r - 0.02)
  expect(a.loopA.distanceTo(a.loopB)).toBeLessThan(a.loopLength)
})

test('the creature and the rose sit on open turf beside it', () => {
  const a = ruin.anchors
  for (const p of [a.critter, a.rose]) {
    expect(Math.abs(p.y - terrainHeight(p.x, p.z))).toBeLessThan(1e-6)
    for (const m of ruin.grassMask) expect(Math.hypot(p.x - m.x, p.z - m.z)).toBeGreaterThan(m.r)
  }
  expect(a.rose.distanceTo(a.handR)).toBeLessThan(4)
})
