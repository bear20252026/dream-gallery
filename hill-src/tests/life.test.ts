import * as THREE from 'three'
import { expect, test } from 'vitest'
import { Drift } from '../src/game/drift'
import { Flyers } from '../src/game/flyers'
import { terrainHeight } from '../src/game/terrain'
import { Wind } from '../src/game/wind'

const m = new THREE.Matrix4()
const p = new THREE.Vector3()

test('birds keep clear of the hill and butterflies fly above the grass', () => {
  const flyers = new Flyers()
  let lowestBird = Infinity
  let lowestButterfly = Infinity
  let highestButterfly = -Infinity
  for (let t = 0; t < 600; t += 0.5) {
    flyers.update(t)
    for (let i = 0; i < flyers.birdMesh.count; i += 1) {
      flyers.birdMesh.getMatrixAt(i, m)
      p.setFromMatrixPosition(m)
      lowestBird = Math.min(lowestBird, p.y - terrainHeight(p.x, p.z))
    }
    for (let i = 0; i < flyers.butterflyMesh.count; i += 1) {
      flyers.butterflyMesh.getMatrixAt(i, m)
      p.setFromMatrixPosition(m)
      const agl = p.y - terrainHeight(p.x, p.z)
      lowestButterfly = Math.min(lowestButterfly, agl)
      highestButterfly = Math.max(highestButterfly, agl)
    }
  }
  expect(lowestBird).toBeGreaterThan(5)
  expect(lowestButterfly).toBeGreaterThan(0.6)
  expect(highestButterfly).toBeLessThan(1.6)
  flyers.dispose()
})

test('leaves and petals stay round a walking camera and never sink into the ground', () => {
  const drift = new Drift(1)
  const wind = new Wind()
  const cam = new THREE.Vector3(5.5, 0, 30)
  for (let i = 0; i < 900; i += 1) {
    wind.update(1 / 60)
    cam.x -= 0.03
    cam.y = terrainHeight(cam.x, cam.z) + 1.62
    drift.update(1 / 60, wind, cam)
  }
  expect(drift.mesh.count).toBe(170)
  for (let i = 0; i < drift.mesh.count; i += 1) {
    drift.mesh.getMatrixAt(i, m)
    p.setFromMatrixPosition(m)
    expect(Math.hypot(p.x - cam.x, p.z - cam.z)).toBeLessThan(16 * 1.05)
    expect(p.y).toBeGreaterThan(terrainHeight(p.x, p.z))
  }
  drift.setDensity(0.45)
  expect(drift.mesh.count).toBeLessThan(170)
  drift.dispose()
})
