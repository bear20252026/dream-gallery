import * as THREE from 'three'

/**
 * All scene tuning in one place. World units are metres; the summit (tower base) is the origin
 * and the player first looks toward -Z at the ruin, with the sun behind their left shoulder and
 * the wind blowing the ribbon to their left, matching the reference shot.
 */
export const CONFIG = {
  player: {
    radius: 0.35,
    halfHeight: 0.55,
    eyeHeight: 1.62,
    walkSpeed: 3.2,
    sprintSpeed: 6.2,
    acceleration: 9,
    jumpSpeed: 5.2,
    gravity: -18,
    /** Soft boundary: beyond `softRadius` the wind pushes back, `hardRadius` is a wall. */
    softRadius: 58,
    hardRadius: 70,
    spawn: new THREE.Vector3(5.5, 0, 30),
    spawnYaw: 0.12,
    spawnPitch: 0.2,
  },
  camera: { fov: 68, near: 0.08, far: 60000, minPitch: -1.35, maxPitch: 1.4 },
  /** Direction toward the sun. */
  sunDir: new THREE.Vector3(-0.72, 0.55, 0.42).normalize(),
  wind: {
    /** Direction the wind blows toward (x/z). */
    dir: new THREE.Vector2(-1, 0.18).normalize(),
    speed: 7.5,
  },
  clouds: {
    /** Cloud sea: base and mean top height, below the summit. */
    seaBase: -520,
    seaTop: -128,
    /** Towering cumulus reach this height at most. */
    ceiling: 3600,
    /** Half-size of the weather map square around the summit. */
    extent: 14000,
    /** Base shape drift with the wind (m/s); detail boils faster. */
    drift: 6,
  },
  ruin: {
    /** The guardian's slight settle toward its left side (radians) and the yaw it faces (toward the sun). */
    lean: 0.03,
    yaw: -0.47,
  },
} as const

export type QualityLevel = 'low' | 'medium' | 'high'

/** Render budgets per quality preset. */
export const QUALITY = {
  low: { pixelRatio: 1, cloudScale: 0.34, cloudSteps: 72, lightSteps: 4, grass: 0.45, shadows: false, shadowMap: 1024, msaa: 0 },
  medium: { pixelRatio: 1.25, cloudScale: 0.45, cloudSteps: 96, lightSteps: 5, grass: 0.72, shadows: true, shadowMap: 2048, msaa: 0 },
  high: { pixelRatio: 1.5, cloudScale: 0.5, cloudSteps: 128, lightSteps: 6, grass: 1, shadows: true, shadowMap: 2048, msaa: 4 },
} as const satisfies Record<QualityLevel, Record<string, number | boolean>>

export type QualityPreset = (typeof QUALITY)[QualityLevel]
