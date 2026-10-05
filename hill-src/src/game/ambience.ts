import * as THREE from 'three'
import type { Audio } from '../engine/audio'
import { smoothstep } from './noise'
import type { Wind } from './wind'

/**
 * Procedural soundscape on the SFX bus, all driven by the shared wind:
 * - a filtered-noise wind bed that swells with gusts, plus a thin whistle on strong gusts;
 * - the guardian hums low when a gust passes through its hollow joints (louder up close);
 * - the red ribbon's cloth flutter near the summit;
 * - soft grass footsteps and landings for the player.
 */
export class Ambience {
  private readonly ctx: AudioContext
  private readonly out: AudioNode
  private readonly noise: AudioBuffer
  private started = false
  private windGain!: GainNode
  private windFilter!: BiquadFilterNode
  private whistleGain!: GainNode
  private whistleFilter!: BiquadFilterNode
  private fluteGain!: GainNode
  private fluteOsc: OscillatorNode[] = []
  private flutterGain!: GainNode
  private flutterLfo!: OscillatorNode
  private fluteNote = 0
  private fluteTimer = 0

  constructor(audio: Audio) {
    this.ctx = audio.ctx
    this.out = audio.output('sfx')
    this.noise = pinkNoise(this.ctx, 4)
  }

  /** Create the looping voices (safe before the context is unlocked; they start silent). */
  start(): void {
    if (this.started) return
    this.started = true
    const c = this.ctx
    const t = c.currentTime

    this.windFilter = c.createBiquadFilter()
    this.windFilter.type = 'lowpass'
    this.windFilter.frequency.value = 500
    this.windFilter.Q.value = 0.6
    this.windGain = gain(c, 0)
    this.loopNoise(0).connect(this.windFilter).connect(this.windGain).connect(this.out)

    this.whistleFilter = c.createBiquadFilter()
    this.whistleFilter.type = 'bandpass'
    this.whistleFilter.frequency.value = 2100
    this.whistleFilter.Q.value = 9
    this.whistleGain = gain(c, 0)
    this.loopNoise(1.3).connect(this.whistleFilter).connect(this.whistleGain).connect(this.out)

    // Guardian hum: breathy fundamental + fifth with a slow vibrato, plus a narrow band of breath noise.
    this.fluteGain = gain(c, 0)
    const fluteTone = c.createBiquadFilter()
    fluteTone.type = 'lowpass'
    fluteTone.frequency.value = 1400
    fluteTone.connect(this.fluteGain).connect(this.out)
    const vibrato = c.createOscillator()
    vibrato.frequency.value = 4.6
    const vibratoDepth = gain(c, 3.2)
    vibrato.connect(vibratoDepth)
    for (const [ratio, level] of [[1, 0.6], [1.5, 0.22], [2, 0.12]] as const) {
      const o = c.createOscillator()
      o.type = 'sine'
      o.frequency.value = FLUTE_NOTES[0] * ratio
      vibratoDepth.connect(o.detune)
      o.connect(gain(c, level)).connect(fluteTone)
      o.start(t)
      this.fluteOsc.push(o)
    }
    const breath = c.createBiquadFilter()
    breath.type = 'bandpass'
    breath.frequency.value = FLUTE_NOTES[0] * 2
    breath.Q.value = 3
    this.loopNoise(2.1).connect(breath).connect(gain(c, 0.5)).connect(fluteTone)
    vibrato.start(t)

    // Ribbon flutter: low band of noise amplitude-modulated at the cloth's flapping rate.
    this.flutterGain = gain(c, 0)
    const flutterBand = c.createBiquadFilter()
    flutterBand.type = 'bandpass'
    flutterBand.frequency.value = 180
    flutterBand.Q.value = 1.2
    const am = gain(c, 0.5)
    this.flutterLfo = c.createOscillator()
    this.flutterLfo.frequency.value = 7
    const amDepth = gain(c, 0.5)
    this.flutterLfo.connect(amDepth).connect(am.gain)
    this.loopNoise(0.7).connect(flutterBand).connect(am).connect(this.flutterGain).connect(this.out)
    this.flutterLfo.start(t)
  }

  /** Follow the wind and the listener; call once per rendered frame. */
  update(dt: number, wind: Wind, listener: THREE.Vector3, flute: THREE.Vector3, ribbonTip: THREE.Vector3, playing: boolean): void {
    if (!this.started || this.ctx.state !== 'running') return
    const t = this.ctx.currentTime
    const g = wind.gust
    // Higher up = more exposed; the title camera floats in open air.
    const exposure = playing ? 0.75 + smoothstep(-20, 8, listener.y) * 0.35 : 0.8
    this.windGain.gain.setTargetAtTime((0.1 + g * 0.3) * exposure, t, 0.35)
    this.windFilter.frequency.setTargetAtTime(320 + g * 1100, t, 0.4)
    this.whistleGain.gain.setTargetAtTime(smoothstep(0.55, 1, g) * 0.05 * exposure, t, 0.5)
    this.whistleFilter.frequency.setTargetAtTime(1900 + g * 900, t, 0.6)

    const dFlute = listener.distanceTo(flute)
    const near = 1 / (1 + (dFlute / 14) ** 2)
    const sing = smoothstep(0.35, 0.9, g)
    this.fluteGain.gain.setTargetAtTime(sing * (0.015 + near * 0.16), t, 0.6)
    // Each new swell picks the next note of a slow pentatonic phrase.
    this.fluteTimer -= dt
    if (sing < 0.05 && this.fluteTimer <= 0) {
      this.fluteNote = (this.fluteNote + 1 + Math.floor(Math.random() * 2)) % FLUTE_NOTES.length
      this.fluteTimer = 2.5
      const f = FLUTE_NOTES[this.fluteNote]
      this.fluteOsc.forEach((o, i) => o.frequency.setTargetAtTime(f * [1, 1.5, 2][i], t, 0.3))
    }

    const dRibbon = listener.distanceTo(ribbonTip)
    this.flutterGain.gain.setTargetAtTime((0.05 + g * 0.3) / (1 + (dRibbon / 9) ** 2), t, 0.25)
    this.flutterLfo.frequency.setTargetAtTime(5 + g * 7, t, 0.3)
  }

  footstep(sprinting: boolean): void {
    if (this.ctx.state !== 'running') return
    const c = this.ctx
    const t = c.currentTime
    const src = c.createBufferSource()
    src.buffer = this.noise
    src.playbackRate.value = 0.8 + Math.random() * 0.5
    const band = c.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 1800 + Math.random() * 1400
    band.Q.value = 0.7
    const g = gain(c, 0.0001)
    const v = (sprinting ? 0.2 : 0.12) * (0.8 + Math.random() * 0.4)
    g.gain.exponentialRampToValueAtTime(v, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
    src.connect(band).connect(g).connect(this.out)
    src.start(t, Math.random() * 3)
    src.stop(t + 0.2)
  }

  land(impact: number): void {
    if (this.ctx.state !== 'running') return
    const c = this.ctx
    const t = c.currentTime
    const o = c.createOscillator()
    o.frequency.setValueAtTime(110, t)
    o.frequency.exponentialRampToValueAtTime(45, t + 0.14)
    const g = gain(c, 0.0001)
    g.gain.exponentialRampToValueAtTime(0.12 + impact * 0.25, t + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
    o.connect(g).connect(this.out)
    o.start(t)
    o.stop(t + 0.2)
    this.footstep(true)
  }

  private loopNoise(offset: number): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    src.start(this.ctx.currentTime, offset)
    return src
  }
}

/** A slow D-major pentatonic phrase the tower sings, one note per gust. */
const FLUTE_NOTES = [293.66, 329.63, 369.99, 440, 493.88, 587.33]

function gain(c: AudioContext, value: number): GainNode {
  const g = c.createGain()
  g.gain.value = value
  return g
}

/** Pink noise (Paul Kellet's filter) with seamless looping. */
function pinkNoise(c: AudioContext, seconds: number): AudioBuffer {
  const n = Math.floor(c.sampleRate * seconds)
  const buffer = c.createBuffer(1, n, c.sampleRate)
  const d = buffer.getChannelData(0)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856
    b4 = 0.55 * b4 + w * 0.5329522
    b5 = -0.7616 * b5 - w * 0.016898
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
    b6 = w * 0.115926
  }
  // Crossfade the ends so the loop has no click.
  const fade = Math.floor(c.sampleRate * 0.05)
  for (let i = 0; i < fade; i++) {
    const k = i / fade
    d[i] = d[i] * k + d[n - fade + i] * (1 - k)
  }
  return buffer
}
