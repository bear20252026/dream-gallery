import * as THREE from 'three'
import type { Physics } from '../engine/physics'
import type { Locale } from '../engine/save'
import { Fox } from './fox'
import { Props, type Circle } from './props'
import { SHOEBILL_SPOT, Shoebill } from './shoebill'
import type { RuinAnchors } from './ruin'
import { TAPIR_AREA, Tapir, type AnimalSound } from './tapir'
import { BOOKS, FOX_TAMED, STARS, chooseScript, type Line, type StarId, type StoryState, type Target } from './story'

/**
 * The hill's small encounters: what the player is looking at (focus), what happens on "interact",
 * and the ten stars that remember it. Effects of a talk are applied when it starts (dome lifts,
 * sprout comes up) or when it ends (the fox moves on, the star is announced).
 */

/** Where the fox waits before it is tamed (world x, z); it lies facing the spawn. */
export const FOX_SPOTS: [number, number][] = [
  [-9, 15.5],
  [-5.6, 10.2],
  [-2.6, 7.6],
]
const yawToSpawn = (x: number, z: number) => Math.atan2(5.5 - x, 30 - z)

export type Progress = { stars: string[]; fox: number; awake: boolean }
export type Focus = { target: Target; index: number; at: THREE.Vector3 }
type Spot = Focus & { reach: number; ok?: () => boolean }

export class Encounters {
  readonly group = new THREE.Group()
  readonly props: Props
  readonly fox = new Fox()
  readonly tapir = new Tapir()
  readonly shoebill: Shoebill
  readonly grassMask: Circle[]
  /** Areas the rock scatter must keep clear. */
  readonly reserved: Circle[]
  focus: Focus | null = null
  talking: { target: Target; lines: Line[] } | null = null
  /** A star was lit; called when its talk ends. */
  onStar?: (count: number, total: number) => void
  onPersist?: (p: Progress) => void
  /** The guardian's eye should wake (instant = restored from a save). */
  onAwaken?: (instant: boolean) => void
  /** An animal squeaks or clatters. */
  onSound?: (name: AnimalSound) => void
  private readonly state: StoryState = { stars: [], fox: 0, awake: false, visits: {}, sproutsLeft: 4, roseSmeltFox: false }
  private readonly spots: Spot[] = []
  private pendingFox = -1
  private pendingStar = false
  private readonly camPos = new THREE.Vector3()
  private readonly fwd = new THREE.Vector3()
  private readonly d = new THREE.Vector3()

  constructor(physics: Physics, anchors: RuinAnchors, sunDir: THREE.Vector3) {
    this.group.name = 'encounters'
    this.props = new Props(physics, anchors, sunDir)
    this.shoebill = new Shoebill(physics)
    this.group.add(this.props.group, this.fox.group, this.tapir.group, this.shoebill.group)
    const [fx, fz] = FOX_SPOTS[0]
    this.fox.place(fx, fz, yawToSpawn(fx, fz))
    const p = this.props
    const up = (v: THREE.Vector3, y: number) => v.clone().add(new THREE.Vector3(0, y, 0))
    this.spots.push(
      { target: 'plane', index: 0, at: p.planeFocus, reach: 5.2 },
      { target: 'hat', index: 0, at: p.hatFocus, reach: 4.6 },
      { target: 'box', index: 0, at: p.boxFocus, reach: 2.8 },
      { target: 'rose', index: 0, at: p.roseFocus, reach: 3 },
      { target: 'sheep', index: 0, at: up(anchors.critter, 0.45), reach: 3.2 },
      { target: 'guardian', index: 0, at: up(anchors.handL, 0.1), reach: 4 },
      { target: 'fox', index: 0, at: this.fox.focus, reach: 4, ok: () => this.fox.available },
      { target: 'tapir', index: 0, at: this.tapir.focus, reach: 4.2, ok: () => this.tapir.available },
      { target: 'shoebill', index: 0, at: this.shoebill.focus, reach: 4.2 },
      ...p.sprouts.map((s, i) => ({ target: 'sprout' as const, index: i, at: s.at, reach: 2.8, ok: () => s.state === 'up' })),
    )
    this.grassMask = [...p.grassMask, this.shoebill.grassMask]
    this.reserved = [...p.reserved, ...FOX_SPOTS.map(([x, z]) => ({ x, z, r: 2 })), { x: TAPIR_AREA.x, z: TAPIR_AREA.z, r: TAPIR_AREA.r + 1.5 }, { x: SHOEBILL_SPOT.x, z: SHOEBILL_SPOT.z, r: 1.6 }]
  }

  get awake(): boolean {
    return this.state.awake
  }

  get progress(): Progress {
    return { stars: [...this.state.stars], fox: this.state.fox, awake: this.state.awake }
  }

  get stars(): readonly StarId[] {
    return this.state.stars
  }

  /** Apply saved progress (called once at boot). */
  restore(p: Progress): void {
    this.state.stars = STARS.filter(id => p.stars.includes(id))
    this.state.fox = Math.max(0, Math.min(FOX_TAMED, Math.floor(p.fox) || 0))
    // A guardian woken before new friends came to the hill stays awake.
    this.state.awake = !!p.awake
    const [x, z] = FOX_SPOTS[Math.min(this.state.fox, FOX_SPOTS.length - 1)]
    this.fox.place(x, z, yawToSpawn(x, z))
    if (this.state.fox >= FOX_TAMED) this.fox.follow()
    if (this.state.awake) this.onAwaken?.(true)
  }

  update(dt: number, time: number, camera: THREE.Camera, feet: THREE.Vector3, active: boolean, gust: number): void {
    this.props.update(dt, time, gust)
    camera.getWorldPosition(this.camPos)
    camera.getWorldDirection(this.fwd)
    this.fox.update(dt, time, this.camPos, feet, this.fwd, this.talking?.target === 'fox')
    this.tapir.update(dt, time, this.camPos, this.talking?.target === 'tapir')
    this.shoebill.update(dt, time, this.camPos, this.talking?.target === 'shoebill', gust)
    for (const a of [this.tapir, this.shoebill]) {
      if (a.sound) this.onSound?.(a.sound)
      a.sound = null
    }
    this.focus = null
    if (!active || this.talking) return
    let best = Infinity
    for (const s of this.spots) {
      if (s.ok && !s.ok()) continue
      // Untamed, the fox speaks up from further away ("stop there").
      const reach = s.target === 'fox' && this.state.fox === 0 ? 6.5 : s.reach
      this.d.subVectors(s.at, this.camPos)
      const dist = this.d.length()
      if (dist > reach || dist < 1e-3) continue
      const cos = this.d.dot(this.fwd) / dist
      if (cos < (dist < 1.6 ? 0.5 : 0.84)) continue
      const score = (1 - cos) * 6 + dist * 0.08
      if (score < best) {
        best = score
        this.focus = s
      }
    }
  }

  /** Start talking to whatever is in focus; returns the lines, or null if nothing is. */
  interact(locale: Locale): Line[] | null {
    const f = this.focus
    if (!f || this.talking) return null
    const st = this.state
    st.sproutsLeft = this.props.sproutsStanding()
    const choice = chooseScript(BOOKS[locale], f.target, st)
    if (choice.repeat) st.visits[f.target] = (st.visits[f.target] ?? 0) + 1
    const e = choice.effects
    if (e.pullSprout) this.props.pullSprout(f.index)
    if (e.liftDome) this.props.setDome(true)
    if (e.fox !== undefined) this.pendingFox = e.fox
    if (e.roseSmeltFox) st.roseSmeltFox = true
    if (f.target === 'tapir') this.tapir.greet()
    if (f.target === 'shoebill') this.shoebill.clatter()
    if (e.awaken) {
      st.awake = true
      this.onAwaken?.(false)
    }
    if (e.star && !st.stars.includes(e.star)) {
      st.stars.push(e.star)
      this.pendingStar = true
    }
    this.onPersist?.(this.progress)
    this.talking = { target: f.target, lines: choice.lines }
    this.focus = null
    return choice.lines
  }

  /** The talk box closed: put the dome back, let the fox move on, announce a new star. */
  endDialogue(): void {
    const t = this.talking
    if (!t) return
    this.talking = null
    if (t.target === 'rose') this.props.setDome(false)
    if (t.target === 'fox') this.fox.cheer()
    if (t.target === 'shoebill') this.shoebill.bow()
    if (this.pendingFox >= 0) {
      this.state.fox = this.pendingFox
      this.pendingFox = -1
      if (this.state.fox >= FOX_TAMED) this.fox.follow()
      else {
        const [x, z] = FOX_SPOTS[this.state.fox]
        this.fox.goTo(x, z, yawToSpawn(x, z))
      }
    }
    if (this.pendingStar) {
      this.pendingStar = false
      this.onStar?.(this.state.stars.length, STARS.length)
    }
    this.onPersist?.(this.progress)
  }

  dispose(): void {
    this.props.dispose()
    this.fox.dispose()
    this.tapir.dispose()
    this.shoebill.dispose()
  }
}
