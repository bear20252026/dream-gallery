import type { I18n } from '../engine/i18n'
import { NOTE_LIMITS, type Note, type Stroke } from '../net/notes'

/**
 * The drawing pad: leave one small drawing on the hill, or look at one somebody else left.
 * Strokes use a 256×256 grid ([colour, width, x0, y0, x1, y1, …]); the sheet canvas is 512 px.
 */
export const INKS = ['#2d3a57', '#c9463d', '#4f8a3c', '#3f67c9']
const WIDTHS = [2.2, 4.6, 9] // grid units
const SCALE = 2

export type NotepadMode = 'closed' | 'draw' | 'view' | 'login'
export type NotepadActions = {
  /** Leave the drawing here (main saves it and then calls done() or setMessage()). */
  save(strokes: Stroke[]): void
  /** Sign in with Manus (called inside the click). */
  login(): void
  /** The pad closed; `gesture` is true when a click closed it (the pointer may be re-locked). */
  closed(gesture: boolean): void
}

const TEMPLATE = `
<div class="np-card">
  <header class="np-head"><h3 class="np-title"></h3><p class="np-sub"></p></header>
  <div class="np-sheet-wrap">
    <canvas class="np-sheet" width="512" height="512"></canvas>
    <div class="np-gate"><p class="np-gate-text"></p><button class="np-btn np-primary" data-np="login"><span class="account-mark" aria-hidden="true"></span><span class="np-login-text"></span></button></div>
  </div>
  <div class="np-tools">
    <div class="np-inks">${INKS.map((c, i) => `<button class="np-ink" data-ink="${i}" style="--ink:${c}"></button>`).join('')}</div>
    <div class="np-widths">${WIDTHS.map((_, i) => `<button class="np-width" data-width="${i}"><i style="--w:${4 + i * 5}px"></i></button>`).join('')}</div>
    <button class="np-tool" data-np="undo"></button>
    <button class="np-tool" data-np="clear"></button>
  </div>
  <div class="np-meter" aria-hidden="true"><i></i></div>
  <p class="np-msg" aria-live="polite"></p>
  <footer class="np-actions">
    <button class="np-btn" data-np="cancel"></button>
    <button class="np-btn" data-np="redraw"></button>
    <button class="np-btn np-primary" data-np="save"></button>
  </footer>
</div>`

export class Notepad {
  mode: NotepadMode = 'closed'
  private readonly el: HTMLElement
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private strokes: Stroke[] = []
  private current: Stroke | null = null
  private colour = 0
  private width = 1
  private busy = false
  private viewing: { note: Note; own: boolean } | null = null
  private msgKey = ''
  private anim = 0

  constructor(root: HTMLElement, private readonly i18n: I18n, private readonly actions: NotepadActions) {
    this.el = document.createElement('div')
    this.el.className = 'notepad'
    this.el.setAttribute('role', 'dialog')
    this.el.setAttribute('aria-modal', 'true')
    this.el.innerHTML = TEMPLATE
    root.appendChild(this.el)
    this.canvas = this.el.querySelector('canvas')!
    this.ctx = this.canvas.getContext('2d')!

    this.el.addEventListener('click', e => this.onClick(e))
    this.el.addEventListener('keydown', e => {
      // Keys pressed inside the pad never reach the game input, so the pad handles Escape itself
      // (not a user activation, so the pointer is re-locked by the next click instead).
      if (e.code === 'Escape') {
        e.preventDefault()
        this.close(false)
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && this.mode === 'draw') {
        e.preventDefault()
        this.undo()
      }
      e.stopPropagation()
    })
    const c = this.canvas
    c.addEventListener('pointerdown', e => this.down(e))
    c.addEventListener('pointermove', e => this.move(e))
    c.addEventListener('pointerup', () => this.up())
    c.addEventListener('pointercancel', () => this.up())
    i18n.onChange(() => this.translate())
    this.translate()
  }

  get isOpen(): boolean {
    return this.mode !== 'closed'
  }

  /** Start drawing (optionally from the traveller's existing drawing, to change it). */
  openDraw(from: Stroke[] | null = null): void {
    this.strokes = from ? from.map(s => s.slice()) : []
    this.setMode('draw')
  }

  openView(note: Note, own: boolean): void {
    this.viewing = { note, own }
    this.strokes = note.strokes.map(s => s.slice())
    this.setMode('view')
    this.replay()
  }

  openLogin(): void {
    this.setMode('login')
  }

  close(gesture = false): void {
    if (this.mode === 'closed') return
    cancelAnimationFrame(this.anim)
    this.mode = 'closed'
    this.current = null
    this.busy = false
    this.el.classList.remove('is-open', 'is-busy')
    this.actions.closed(gesture)
  }

  /** Main reports on a save: '' clears, a key shows a message (e.g. note.wait). */
  setMessage(key: string): void {
    this.msgKey = key
    this.el.querySelector('.np-msg')!.textContent = key ? this.i18n.t(key) : ''
  }

  setBusy(busy: boolean): void {
    this.busy = busy
    this.el.classList.toggle('is-busy', busy)
    if (busy) this.setMessage('note.pending')
  }

  private setMode(mode: Exclude<NotepadMode, 'closed'>): void {
    cancelAnimationFrame(this.anim)
    this.mode = mode
    this.busy = false
    this.current = null
    this.el.dataset.mode = mode
    this.el.classList.add('is-open')
    this.el.classList.remove('is-busy')
    this.setMessage('')
    this.translate()
    this.paint()
    const first = this.el.querySelector<HTMLElement>(mode === 'login' ? '[data-np="login"]' : '[data-np="cancel"]')
    first?.focus({ preventScroll: true })
  }

  private translate(): void {
    const t = (k: string) => this.i18n.t(k)
    const own = this.viewing?.own
    const title = this.mode === 'view' ? (own ? 'note.title.own' : 'note.title.view') : 'note.title.draw'
    const sub = this.mode === 'view' ? (own ? 'note.sub.own' : 'note.sub.view') : 'note.sub.draw'
    this.el.querySelector('.np-title')!.textContent = t(title)
    this.el.querySelector('.np-sub')!.textContent = t(sub)
    this.el.querySelector('.np-gate-text')!.textContent = t('note.login')
    this.el.querySelector('.np-login-text')!.textContent = t('note.btn.login')
    this.el.setAttribute('aria-label', t(title))
    const label: Record<string, string> = {
      cancel: this.mode === 'view' ? 'note.btn.close' : 'note.btn.cancel',
      redraw: 'note.btn.redraw',
      save: 'note.btn.save',
      undo: 'note.btn.undo',
      clear: 'note.btn.clear',
    }
    for (const [k, v] of Object.entries(label)) this.el.querySelector(`[data-np="${k}"]`)!.textContent = t(v)
    this.el.querySelectorAll<HTMLElement>('[data-ink]').forEach(b => {
      b.setAttribute('aria-label', t(`note.ink.${b.dataset.ink}`))
      b.classList.toggle('is-on', Number(b.dataset.ink) === this.colour)
    })
    this.el.querySelectorAll<HTMLElement>('[data-width]').forEach(b => {
      b.setAttribute('aria-label', t(`note.width.${b.dataset.width}`))
      b.classList.toggle('is-on', Number(b.dataset.width) === this.width)
    })
    this.el.querySelector<HTMLElement>('[data-np="redraw"]')!.hidden = !(this.mode === 'view' && own)
    if (this.msgKey) this.setMessage(this.msgKey)
  }

  private onClick(e: MouseEvent): void {
    const target = e.target as HTMLElement
    if (target === this.el) {
      // A click on the dimmed backdrop closes the pad (not while drawing: too easy to lose work).
      if (this.mode !== 'draw') this.close(true)
      return
    }
    const ink = target.closest<HTMLElement>('[data-ink]')
    if (ink) {
      this.colour = Number(ink.dataset.ink)
      this.translate()
      return
    }
    const w = target.closest<HTMLElement>('[data-width]')
    if (w) {
      this.width = Number(w.dataset.width)
      this.translate()
      return
    }
    const act = target.closest<HTMLElement>('[data-np]')?.dataset.np
    if (!act || this.busy) return
    if (act === 'cancel') this.close(true)
    else if (act === 'login') this.actions.login()
    else if (act === 'undo') this.undo()
    else if (act === 'clear') {
      this.strokes = []
      this.paint()
    } else if (act === 'redraw' && this.viewing) this.openDraw(this.viewing.note.strokes)
    else if (act === 'save') {
      if (!this.strokes.length) return this.setMessage('note.empty')
      this.actions.save(this.strokes.map(s => s.slice()))
    }
  }

  private undo(): void {
    this.strokes.pop()
    this.paint()
  }

  private points(): number {
    return this.strokes.reduce((n, s) => n + (s.length - 2) / 2, 0)
  }

  private grid(e: PointerEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect()
    const x = Math.round(((e.clientX - r.left) / r.width) * 255)
    const y = Math.round(((e.clientY - r.top) / r.height) * 255)
    return [Math.min(255, Math.max(0, x)), Math.min(255, Math.max(0, y))]
  }

  private down(e: PointerEvent): void {
    if (this.mode !== 'draw' || this.busy || e.button > 0) return
    e.preventDefault()
    if (this.strokes.length >= NOTE_LIMITS.strokes || this.points() >= NOTE_LIMITS.points) return this.setMessage('note.ink')
    this.canvas.setPointerCapture(e.pointerId)
    const [x, y] = this.grid(e)
    this.current = [this.colour, this.width, x, y]
    this.strokes.push(this.current)
    if (this.msgKey) this.setMessage('')
    this.paint()
  }

  private move(e: PointerEvent): void {
    const s = this.current
    if (!s) return
    const [x, y] = this.grid(e)
    const lx = s[s.length - 2]
    const ly = s[s.length - 1]
    if (Math.hypot(x - lx, y - ly) < 2) return
    if (this.points() >= NOTE_LIMITS.points) {
      this.current = null
      return this.setMessage('note.ink')
    }
    s.push(x, y)
    this.segment(s[0], s[1], lx, ly, x, y)
    this.meter()
  }

  private up(): void {
    this.current = null
  }

  // ─── painting ────────────────────────────────────────────────────────────

  private paint(limit = Infinity): void {
    const g = this.ctx
    g.clearRect(0, 0, this.canvas.width, this.canvas.height)
    let budget = limit
    for (const s of this.strokes) {
      if (budget <= 0) break
      const n = (s.length - 2) / 2
      this.stroke(s, Math.min(n, budget))
      budget -= n
    }
    this.meter()
  }

  private stroke(s: Stroke, n: number): void {
    const g = this.ctx
    const w = WIDTHS[s[1]] * SCALE
    g.strokeStyle = g.fillStyle = INKS[s[0]]
    g.lineWidth = w
    g.lineCap = 'round'
    g.lineJoin = 'round'
    if (n <= 1) {
      g.beginPath()
      g.arc(s[2] * SCALE, s[3] * SCALE, w / 2, 0, Math.PI * 2)
      g.fill()
      return
    }
    g.beginPath()
    g.moveTo(s[2] * SCALE, s[3] * SCALE)
    for (let i = 1; i < n; i++) g.lineTo(s[2 + i * 2] * SCALE, s[3 + i * 2] * SCALE)
    g.stroke()
  }

  private segment(c: number, w: number, x0: number, y0: number, x1: number, y1: number): void {
    const g = this.ctx
    g.strokeStyle = INKS[c]
    g.lineWidth = WIDTHS[w] * SCALE
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(x0 * SCALE, y0 * SCALE)
    g.lineTo(x1 * SCALE, y1 * SCALE)
    g.stroke()
  }

  /** Someone else's drawing appears as if being drawn again, over about two seconds. */
  private replay(): void {
    const total = this.points()
    const start = performance.now()
    const duration = Math.min(2400, 600 + total * 4)
    const step = () => {
      const k = Math.min(1, (performance.now() - start) / duration)
      this.paint(Math.ceil(total * k))
      if (k < 1 && this.mode === 'view') this.anim = requestAnimationFrame(step)
    }
    step()
  }

  private meter(): void {
    const left = Math.max(0, 1 - this.points() / NOTE_LIMITS.points)
    this.el.querySelector<HTMLElement>('.np-meter i')!.style.transform = `scaleX(${left})`
  }
}
