import type { Audio } from '../engine/audio'
import type { I18n } from '../engine/i18n'
import type { Input } from '../engine/input'
import { cleanName, type Locale, type Quality, type SaveData, type SaveStore } from '../engine/save'
import type { Caption } from '../game/game'
import { STARS, personalize, type Line, type StarId, type Target } from '../game/story'
import type { RoomStatus } from '../net/room'

/** Prompts for the shared hill: like a traveller, look at a note flower. */
export type SocialPrompt = 'ghost' | 'note' | 'ownNote'

export type Screen = 'boot' | 'title' | 'hud' | 'pause' | 'settings'

/** Account state shown on the title and pause screens (mirrors ManusAuth sessions). */
export type Account =
  | { status: 'loading' | 'logged_out' | 'offline' | 'pending' }
  | { status: 'authenticated'; name: string }

export type UiActions = {
  play: () => void
  resume: () => void
  quit: () => void
  settings: (patch: Partial<SaveData>) => void
  login: () => void
  logout: () => void
}

type ToggleKey = 'muted' | 'invertY' | 'reducedMotion'

/**
 * DOM overlay for the scene. Screens are <section data-screen> blocks toggled with `is-active`;
 * every string goes through i18n (`data-i18n`). Menus work with mouse, keyboard (Tab/arrows) and
 * gamepad (stick + A/B via `frame()`); the HUD stays nearly empty so the view is the experience.
 */
/** Where a traveller who liked you stands, as seen from where you look. */
export type LikeSide = 'front' | 'left' | 'right' | 'back'
const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.6C6.3 16.5 2.6 13.1 2.6 9.1 2.6 6.3 4.8 4.1 7.5 4.1c1.9 0 3.5 1 4.5 2.6 1-1.6 2.6-2.6 4.5-2.6 2.7 0 4.9 2.2 4.9 5 0 4-3.7 7.4-9.4 11.5z"/></svg>'

export class Ui {
  screen: Screen = 'boot'
  private readonly root: HTMLElement
  private stack: Screen[] = []
  private lastMethod = ''
  private navRepeat = 0
  private hintTimer = 0
  private noteKeyOn = false
  private likeTimer = 0
  private likesGot = 0
  private likeSide: LikeSide | null = null
  private captionTimer = 0
  private account: Account = { status: 'loading' }
  private talk: { lines: Line[]; i: number; shown: number; done: () => void } | null = null
  private focusKey = ''

  constructor(
    private readonly i18n: I18n,
    private readonly save: SaveStore,
    private readonly audio: Audio,
    private readonly input: Input,
    private readonly actions: UiActions,
  ) {
    this.root = document.getElementById('ui')!
    this.root.innerHTML = this.template()
    this.root.addEventListener('click', e => this.onClick(e))
    this.root.addEventListener('input', e => this.onInput(e))
    window.addEventListener('keydown', e => this.onKey(e))
    i18n.onChange(() => this.translate())
    this.refreshSettings()
    const nameField = this.q<HTMLInputElement>('.name-input')
    nameField.value = save.data.name
    nameField.placeholder = this.fallbackName()
    nameField.addEventListener('keydown', e => {
      // Enter sets off, but never while an IME is still composing (Chinese input confirms with Enter).
      if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return
      e.preventDefault()
      this.audio.play('ui')
      this.setOff()
    })
  }

  // ─── screens ────────────────────────────────────────────────────────────

  show(screen: Screen): void {
    this.stack = []
    this.activate(screen)
  }

  /** Open an overlay screen (settings) that returns to the current one on Back. */
  push(screen: Screen): void {
    this.stack.push(this.screen)
    this.activate(screen)
  }

  back(): void {
    const prev = this.stack.pop()
    if (prev) this.activate(prev)
    else if (this.screen === 'pause') this.actions.resume()
  }

  private activate(screen: Screen): void {
    this.screen = screen
    for (const el of this.qa('[data-screen]')) {
      const active = el.dataset.screen === screen
      el.classList.toggle('is-active', active)
      el.toggleAttribute('inert', !active)
    }
    document.body.dataset.screen = screen
    if (screen === 'settings') this.refreshSettings()
    if (screen === 'hud') this.showHint()
    // Focus the first control for keyboard/gamepad players (not on touch, to avoid focus rings).
    requestAnimationFrame(() => {
      // The title opens on the name field, so a keyboard player can type and press Enter.
      const first = screen === 'title' ? this.q('.name-input') : this.navItems()[0]
      if (first && screen !== 'hud' && this.input.method !== 'touch') first.focus({ preventScroll: true })
      else (document.activeElement as HTMLElement | null)?.blur?.()
    })
  }

  setBootProgress(progress: number): void {
    this.q('.boot-bar i').style.transform = `scaleX(${Math.max(0.04, Math.min(1, progress))})`
  }

  // ─── HUD: control hints and discovery captions ──────────────────────────

  private showHint(): void {
    this.hintTimer = 9
    this.renderHint()
    this.q('.hint').classList.add('is-active')
  }

  /** Someone liked you: a card with a beating heart and where they stand; the count goes up. */
  likeGot(side: LikeSide | null, angle: number | null): void {
    this.likesGot += 1
    const el = this.q('.like-toast')
    el.dataset.kind = 'got'
    el.querySelector('b')!.textContent = this.i18n.t('like.got')
    this.likeSide = null
    this.setLikeSide(side, angle)
    this.popLike(el, 5.5)
    const c = this.q('.presence-likes')
    c.hidden = false
    c.querySelector('em')!.textContent = String(this.likesGot)
    c.setAttribute('aria-label', this.i18n.t('like.count', { n: this.likesGot }))
    c.classList.remove('is-pop')
    void c.offsetWidth
    c.classList.add('is-pop')
  }
  /** Your like reached them. */
  likeSent(): void {
    const el = this.q('.like-toast')
    el.dataset.kind = 'sent'
    el.querySelector('b')!.textContent = this.i18n.t('like.sent')
    this.setLikeSide(null, null)
    this.popLike(el, 3)
  }
  /** While a received like shows, its words and arrow keep pointing at the traveller (angle: 0 = ahead, + = right). */
  setLikeSide(side: LikeSide | null, angle: number | null): void {
    const el = this.q('.like-toast')
    if (side !== this.likeSide) {
      this.likeSide = side
      el.querySelector('span')!.textContent = side ? this.i18n.t(`like.side.${side}`) : ''
    }
    const arrow = el.querySelector<HTMLElement>('.like-arrow')!
    arrow.hidden = angle === null
    if (angle !== null) arrow.style.transform = `rotate(${angle.toFixed(3)}rad)`
  }
  get likeShowing(): boolean {
    return this.likeTimer > 0 && this.q('.like-toast').dataset.kind === 'got'
  }
  private popLike(el: HTMLElement, seconds: number): void {
    el.classList.remove('is-active')
    void el.offsetWidth
    el.classList.add('is-active')
    this.likeTimer = seconds
  }
  /** "Q  leave a drawing" stays on screen while walking the hill (touch has its own button). */
  setNoteKey(on: boolean): void {
    if (on === this.noteKeyOn) return
    this.noteKeyOn = on
    this.q('.note-key').classList.toggle('is-active', on)
  }
  caption(caption: Caption): void {
    this.note(this.i18n.t(`caption.${caption}`))
  }

  /** A quiet line of text under the reticle for a few seconds. */
  note(text: string): void {
    const el = this.q('.caption')
    el.querySelector('span')!.textContent = text
    el.classList.remove('is-active')
    void el.offsetWidth
    el.classList.add('is-active')
    this.captionTimer = 6.5
  }

  // ─── talks, the interaction prompt and the stars ────────────────────────

  get talking(): boolean {
    return this.talk !== null
  }

  /** Show "E  Talk to the fox" for whatever is in focus (null hides it). */
  setFocus(target: Target | SocialPrompt | null): void {
    const key = target ? `${target}:${this.input.method}` : ''
    if (key === this.focusKey) return
    this.focusKey = key
    document.body.toggleAttribute('data-focus', !!target)
    const el = this.q('.prompt')
    if (!target) {
      el.classList.remove('is-active')
      return
    }
    el.querySelector('kbd')!.textContent = this.input.method === 'gamepad' ? 'Y' : 'E'
    el.querySelector('span')!.textContent = this.i18n.t(`prompt.${target}`)
    el.classList.add('is-active')
  }

  // ─── the traveller's name ───────────────────────────────────────────────
  /** What the animals call the player: the typed name, else the Manus account name, else “旅人”. */
  playerName(): string {
    return this.save.data.name || this.fallbackName()
  }
  private fallbackName(): string {
    const a = this.account
    return (a.status === 'authenticated' && cleanName(a.name)) || this.i18n.t('name.default')
  }
  /** Keep the typed name (the placeholder shows what an empty field will mean), then play. */
  private setOff(): void {
    const field = this.q<HTMLInputElement>('.name-input')
    const name = cleanName(field.value)
    field.value = name
    field.blur()
    if (name !== this.save.data.name) this.save.update({ name })
    this.actions.play()
  }
  openTalk(lines: Line[], done: () => void): void {
    if (!lines.length) return done()
    const name = this.playerName()
    this.talk = { lines: lines.map(([who, text]): Line => [who, personalize(text, name)]), i: 0, shown: 0, done }
    document.body.toggleAttribute('data-talking', true)
    this.q('.talk').classList.add('is-active')
    this.renderLine()
  }

  /** Finish the line being typed, or go on to the next; closes after the last. */
  advanceTalk(): void {
    const t = this.talk
    if (!t) return
    const len = t.lines[t.i][1].length
    if (t.shown < len) {
      t.shown = len
      this.renderLine()
      return
    }
    t.i += 1
    if (t.i >= t.lines.length) return this.closeTalk()
    t.shown = 0
    this.audio.play('talk')
    this.renderLine()
  }

  closeTalk(): void {
    const t = this.talk
    if (!t) return
    this.talk = null
    document.body.toggleAttribute('data-talking', false)
    this.q('.talk').classList.remove('is-active')
    t.done()
  }

  private renderLine(): void {
    const t = this.talk!
    const [who, text] = t.lines[t.i]
    const el = this.q('.talk')
    el.classList.toggle('is-narration', who === '')
    el.querySelector('.talk-name')!.textContent = who === 'you' ? this.playerName() : who ? this.i18n.t(`speaker.${who}`) : ''
    el.querySelector('.talk-text')!.textContent = text.slice(0, Math.floor(t.shown))
    el.classList.toggle('is-done', t.shown >= text.length)
  }

  setStars(lit: readonly StarId[]): void {
    for (const el of this.qa('[data-star]')) el.classList.toggle('is-lit', lit.includes(el.dataset.star as StarId))
    this.q('.stars').setAttribute('aria-label', this.i18n.t('stars.label', { n: lit.length, total: STARS.length }))
  }

  private renderHint(): void {
    const m = this.input.method === 'gamepad' ? 'gamepad' : this.input.method === 'touch' ? 'touch' : 'keyboard'
    const parts = m === 'touch' ? ['move', 'look'] : ['move', 'look', 'sprint', 'jump', 'interact', 'pause']
    this.q('.hint').innerHTML = parts.map(k => `<span>${this.i18n.t(`hint.${k}.${m}`)}</span>`).join('')
    this.q('.note-key kbd').textContent = m === 'gamepad' ? '↑' : 'Q'
  }

  // ─── the shared hill ────────────────────────────────────────────────────
  private presence: { status: RoomStatus; count: number } = { status: 'idle', count: 0 }
  private titleCount: number | null = null
  /** The little pill under the stars: are other travellers on this hill? */
  setPresence(status: RoomStatus, count: number): void {
    if (status === this.presence.status && count === this.presence.count) return
    this.presence = { status, count }
    this.renderPresence()
  }
  /** Live head-count on the shared hill for the title card (null hides the line). */
  setTitlePresence(count: number | null): void {
    if (count === this.titleCount) return
    this.titleCount = count
    this.renderTitlePresence()
  }
  private renderTitlePresence(): void {
    const el = this.q('.title-presence')
    const n = this.titleCount
    el.hidden = n === null
    if (n === null) return
    el.dataset.count = String(n)
    const key = n === 0 ? 'title.presence.none' : n === 1 ? 'title.presence.one' : 'title.presence.some'
    el.querySelector('span')!.textContent = this.i18n.t(key, { n })
  }
  private renderPresence(): void {
    const { status, count } = this.presence
    const el = this.q('.presence')
    el.dataset.status = status
    const key = status === 'online' ? (count > 1 ? 'presence.online' : 'presence.alone') : `presence.${status}`
    el.querySelector('span')!.textContent = status === 'idle' ? '' : this.i18n.t(key, { n: count })
  }
  // ─── account (Manus sign-in) ────────────────────────────────────────────

  setAccount(account: Account): void {
    this.account = account
    this.renderAccount()
  }

  private renderAccount(): void {
    const a = this.account
    let html: string
    if (a.status === 'authenticated') {
      const shown = a.name || this.i18n.t('account.traveler')
      html = `<span class="account-avatar" aria-hidden="true">${escapeHtml([...shown][0] ?? '·')}</span>
        <span class="account-text"><small>${escapeHtml(this.i18n.t('account.greeting'))}</small><b>${escapeHtml(shown)}</b></span>
        <button data-nav class="account-link" data-action="logout">${escapeHtml(this.i18n.t('account.logout'))}</button>`
    } else if (a.status === 'logged_out') {
      html = `<button data-nav class="account-login" data-action="login"><span class="account-mark" aria-hidden="true"></span>${escapeHtml(this.i18n.t('account.login'))}</button>`
    } else {
      html = `<span class="account-status">${escapeHtml(this.i18n.t(`account.${a.status}`))}</span>`
    }
    for (const el of this.qa('.account')) {
      el.innerHTML = html
      el.dataset.status = a.status
    }
    this.q<HTMLInputElement>('.name-input').placeholder = this.fallbackName()
  }

  // ─── settings ───────────────────────────────────────────────────────────

  /** Re-read the save into the Settings controls (call after changing settings outside the UI). */
  refreshSettings(): void {
    const d = this.save.data
    this.q<HTMLInputElement>('[name="musicVolume"]').value = String(d.musicVolume)
    this.q<HTMLInputElement>('[name="sfxVolume"]').value = String(d.sfxVolume)
    this.q<HTMLInputElement>('[name="sensitivity"]').value = String(d.sensitivity)
    for (const t of this.qa<HTMLButtonElement>('.toggle')) {
      const on = d[t.dataset.setting as ToggleKey] === true
      t.setAttribute('aria-pressed', String(on))
      t.querySelector('span')!.setAttribute('data-i18n', on ? 'settings.on' : 'settings.off')
    }
    for (const b of this.qa<HTMLButtonElement>('.seg button')) {
      const key = b.parentElement!.dataset.setting as 'quality' | 'locale'
      const current = key === 'locale' ? this.i18n.locale : d.quality
      b.setAttribute('aria-pressed', String(b.dataset.value === current))
    }
    for (const r of this.qa<HTMLInputElement>('input[type="range"]')) setFill(r)
    this.translate()
  }

  // ─── events ─────────────────────────────────────────────────────────────

  private onClick(e: MouseEvent): void {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action], .toggle, .seg button')
    if (!target) return
    this.audio.unlock()
    if (target.matches('.toggle')) {
      const key = target.dataset.setting as ToggleKey
      this.actions.settings({ [key]: !this.save.data[key] })
      this.refreshSettings()
      this.audio.play('ui')
      return
    }
    if (target.matches('.seg button')) {
      const key = target.parentElement!.dataset.setting
      if (key === 'quality') this.actions.settings({ quality: target.dataset.value as Quality })
      if (key === 'locale') this.actions.settings({ locale: target.dataset.value as Locale })
      this.refreshSettings()
      this.audio.play('ui')
      return
    }
    const action = target.dataset.action
    if (action === 'talk') return this.advanceTalk()
    this.audio.play('ui')
    switch (action) {
      case 'play': this.setOff(); break
      case 'resume': this.actions.resume(); break
      case 'quit': this.actions.quit(); break
      case 'settings': this.push('settings'); break
      case 'back': this.back(); break
      // ManusAuth.login() must run inside the click itself (popup and redirect rules).
      case 'login': this.actions.login(); break
      case 'logout': this.actions.logout(); break
      case 'pause': window.dispatchEvent(new CustomEvent('game:pause')); break
    }
  }

  private onInput(e: Event): void {
    const el = e.target as HTMLInputElement
    if (el.type !== 'range') return
    setFill(el)
    this.actions.settings({ [el.name]: Number(el.value) } as Partial<SaveData>)
  }

  private onKey(e: KeyboardEvent): void {
    if (this.screen === 'hud' || this.screen === 'boot') return
    if ((e.code === 'Escape' || e.code === 'Backspace') && this.screen === 'settings') {
      e.preventDefault()
      // Escape is also the pause toggle; consume it so leaving Settings doesn't resume.
      this.input.consume('pause')
      this.back()
      return
    }
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      e.preventDefault()
      this.moveFocus(e.code === 'ArrowDown' ? 1 : -1)
    }
  }

  /** Per-frame: HUD timers and gamepad menu navigation (keyboard uses native focus + onKey). */
  frame(frameSeconds: number): void {
    if (this.input.method !== this.lastMethod) {
      this.lastMethod = this.input.method
      document.body.dataset.input = this.input.method
      this.renderHint()
    }
    if (this.screen === 'hud') {
      const t = this.talk
      if (t && t.shown < t.lines[t.i][1].length) {
        // Typewriter: a little slower for Chinese, instant with reduced motion.
        const len = t.lines[t.i][1].length
        t.shown = this.save.data.reducedMotion ? len : Math.min(len, t.shown + frameSeconds * (this.i18n.locale === 'en' ? 52 : 22))
        this.renderLine()
      }
      if (this.hintTimer > 0) {
        // Hints fade once the player has had time to read them and started walking.
        const moving = Math.hypot(this.input.move.x, this.input.move.y) > 0.1
        this.hintTimer -= frameSeconds * (moving ? 1.6 : 1)
        if (this.hintTimer <= 0) this.q('.hint').classList.remove('is-active')
      }
      if (this.captionTimer > 0) {
        this.captionTimer -= frameSeconds
        if (this.captionTimer <= 0) this.q('.caption').classList.remove('is-active')
      }
      if (this.likeTimer > 0) {
        this.likeTimer -= frameSeconds
        if (this.likeTimer <= 0) this.q('.like-toast').classList.remove('is-active')
      }
      return
    }
    if (this.screen === 'boot') return
    if (this.input.method !== 'gamepad') {
      this.input.consume('confirm')
      this.input.consume('back')
      return
    }
    const y = this.input.move.y
    const x = this.input.move.x
    this.navRepeat = Math.max(0, this.navRepeat - frameSeconds)
    const active = document.activeElement as HTMLElement | null
    if (Math.abs(y) > 0.6 && this.navRepeat <= 0) {
      this.moveFocus(y < 0 ? 1 : -1)
      this.navRepeat = 0.22
    } else if (Math.abs(x) > 0.6 && this.navRepeat <= 0 && active?.matches('input[type="range"]')) {
      const r = active as HTMLInputElement
      r.value = String(Number(r.value) + Math.sign(x) * Number(r.step || 0.1))
      r.dispatchEvent(new Event('input', { bubbles: true }))
      this.navRepeat = 0.12
    } else if (Math.abs(x) > 0.6 && this.navRepeat <= 0 && active?.parentElement?.matches('.seg')) {
      const sib = (Math.sign(x) > 0 ? active.nextElementSibling : active.previousElementSibling) as HTMLElement | null
      sib?.focus()
      this.navRepeat = 0.22
    } else if (Math.abs(y) < 0.3 && Math.abs(x) < 0.3) {
      this.navRepeat = 0
    }
    if (this.input.consume('confirm')) active?.click()
    if (this.input.consume('back') && this.screen !== 'title') this.back()
  }

  private navItems(): HTMLElement[] {
    // Null after a failed boot replaced the UI with the error card (a focus callback may still be queued).
    const screen = this.root.querySelector<HTMLElement>(`[data-screen="${this.screen}"]`)
    if (!screen) return []
    return [...screen.querySelectorAll<HTMLElement>('[data-nav]')].filter(el => el.offsetParent !== null)
  }

  private moveFocus(dir: 1 | -1): void {
    const items = this.navItems()
    if (items.length === 0) return
    // Buttons inside one segmented control count as a single row.
    const rows: HTMLElement[][] = []
    for (const el of items) {
      const seg = el.parentElement?.matches('.seg') ? el.parentElement : null
      const last = rows[rows.length - 1]
      if (seg && last && last[0].parentElement === seg) last.push(el)
      else rows.push([el])
    }
    const current = rows.findIndex(r => r.includes(document.activeElement as HTMLElement))
    const next = rows[(current + dir + rows.length) % rows.length]
    ;(next.find(el => el.getAttribute('aria-pressed') === 'true') ?? next[0]).focus()
  }

  // ─── helpers ────────────────────────────────────────────────────────────

  private translate(): void {
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = this.i18n.t(el.dataset.i18n!)
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-i18n-label]')) el.setAttribute('aria-label', this.i18n.t(el.dataset.i18nLabel!))
    this.renderHint()
    this.renderAccount()
    this.renderPresence()
    this.renderTitlePresence()
    this.focusKey = ''
    document.title = this.i18n.t('game.title')
    document.documentElement.lang = this.i18n.locale
  }

  private q<T extends HTMLElement = HTMLElement>(sel: string): T {
    return this.root.querySelector<T>(sel)!
  }

  private qa<T extends HTMLElement = HTMLElement>(sel: string): T[] {
    return [...this.root.querySelectorAll<T>(sel)]
  }

  private template(): string {
    const range = (name: string, label: string, min: number, max: number, step: number) =>
      `<label class="row"><span data-i18n="${label}"></span><input data-nav type="range" name="${name}" min="${min}" max="${max}" step="${step}"></label>`
    const toggle = (setting: string, label: string) =>
      `<div class="row"><span data-i18n="${label}"></span><button data-nav class="toggle" data-setting="${setting}" aria-pressed="false"><i></i><span></span></button></div>`
    return /* html */ `
<section class="screen screen-boot is-active" data-screen="boot">
  <div class="boot-title" data-i18n="game.title"></div>
  <div class="boot-bar"><i></i></div>
  <div class="boot-label" data-i18n="boot.loading"></div>
</section>

<section class="screen screen-title" data-screen="title">
  <div class="title-shade"></div>
  <div class="account account-corner"></div>
  <div class="title-block">
    <div class="title-mark" aria-hidden="true"><i></i></div>
    <h1 class="title-name" data-i18n="game.title"></h1>
    <p class="title-sub" data-i18n="game.subtitle"></p>
    <p class="title-tagline" data-i18n="game.tagline"></p>
    <label class="title-namefield">
      <span class="namefield-label" data-i18n="name.ask"></span>
      <input data-nav class="name-input" type="text" name="travellerName" maxlength="24" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="go">
      <small class="namefield-hint" data-i18n="name.hint"></small>
    </label>
    <nav class="menu">
      <button data-nav class="btn btn-primary" data-action="play"><span data-i18n="menu.play"></span></button>
      <button data-nav class="btn" data-action="settings"><span data-i18n="menu.settings"></span></button>
    </nav>
    <p class="title-presence" hidden><i aria-hidden="true"></i><span></span></p>
  </div>
  <footer class="title-foot"><small data-i18n="credits.fonts"></small></footer>
</section>

<section class="screen screen-hud" data-screen="hud">
  <div class="reticle" aria-hidden="true"></div>
  <div class="hint"></div>
  <div class="note-key" aria-hidden="true"><kbd>Q</kbd><span data-i18n="notekey.label"></span></div>
  <div class="caption"><span></span></div>
  <div class="like-toast" aria-live="polite"><i class="like-heart" aria-hidden="true">${HEART}<s>${HEART}</s><s>${HEART}</s><s>${HEART}</s></i><div class="like-text"><b></b><span></span></div><i class="like-arrow" aria-hidden="true" hidden></i></div>
  <div class="presence" aria-live="polite"><i aria-hidden="true"></i><span></span><b class="presence-likes" hidden>${HEART}<em>0</em></b></div>
  <div class="stars" role="img">${STARS.map(id => `<i data-star="${id}"></i>`).join('')}</div>
  <div class="prompt"><kbd>E</kbd><span></span></div>
  <div class="talk" data-action="talk" role="dialog" aria-live="polite"><div class="talk-name"></div><p class="talk-text"></p><i class="talk-next" aria-hidden="true"></i></div>
  <button class="hud-pause" data-action="pause" data-i18n-label="touch.pause"><i></i><i></i></button>
  <div class="touch">
    <div class="touch-stick"><i></i></div>
    <button class="touch-btn touch-sprint" data-touch="sprint"><span data-i18n="touch.sprint"></span></button>
    <button class="touch-btn touch-jump" data-touch="jump"><span data-i18n="touch.jump"></span></button>
    <button class="touch-btn touch-talk" data-touch="interact"><span data-i18n="touch.interact"></span></button>
    <button class="touch-btn touch-note" data-touch="note"><span data-i18n="touch.note"></span></button>
  </div>
</section>

<section class="screen screen-pause screen-modal" data-screen="pause">
  <div class="modal">
    <h2 class="modal-title" data-i18n="pause.title"></h2>
    <p class="modal-sub" data-i18n="pause.sub"></p>
    <nav class="menu">
      <button data-nav class="btn btn-primary" data-action="resume"><span data-i18n="menu.continue"></span></button>
      <button data-nav class="btn" data-action="settings"><span data-i18n="menu.settings"></span></button>
      <button data-nav class="btn" data-action="quit"><span data-i18n="menu.quit"></span></button>
    </nav>
    <div class="account account-inline"></div>
  </div>
</section>

<section class="screen screen-settings screen-modal" data-screen="settings">
  <div class="modal modal-wide">
    <h2 class="modal-title" data-i18n="settings.title"></h2>
    <div class="settings-grid">
      <fieldset><legend data-i18n="settings.audio"></legend>
        ${range('musicVolume', 'settings.music', 0, 1, 0.05)}
        ${range('sfxVolume', 'settings.sfx', 0, 1, 0.05)}
        ${toggle('muted', 'settings.mute')}
      </fieldset>
      <fieldset><legend data-i18n="settings.controls"></legend>
        ${range('sensitivity', 'settings.sensitivity', 0.2, 3, 0.1)}
        ${toggle('invertY', 'settings.invertY')}
      </fieldset>
      <fieldset><legend data-i18n="settings.display"></legend>
        <div class="row"><span data-i18n="settings.quality"></span><div class="seg" data-setting="quality">
          <button data-nav data-value="low" data-i18n="settings.quality.low"></button><button data-nav data-value="medium" data-i18n="settings.quality.medium"></button><button data-nav data-value="high" data-i18n="settings.quality.high"></button>
        </div></div>
        ${toggle('reducedMotion', 'settings.reducedMotion')}
        <div class="row"><span data-i18n="settings.language"></span><div class="seg" data-setting="locale">
          <button data-nav data-value="zh-CN" lang="zh-CN">简体中文</button><button data-nav data-value="en" lang="en">English</button>
        </div></div>
      </fieldset>
    </div>
    <nav class="menu menu-row"><button data-nav class="btn" data-action="back"><span data-i18n="menu.back"></span></button></nav>
  </div>
</section>`
  }
}

function setFill(r: HTMLInputElement): void {
  r.style.setProperty('--fill', `${((Number(r.value) - Number(r.min)) / (Number(r.max) - Number(r.min))) * 100}%`)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
