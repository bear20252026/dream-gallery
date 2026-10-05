import './styles/main.css'
import { ManusAuth, type ManusSession } from '../manus-auth.js'
import { Audio } from './engine/audio'
import { I18n, resolveLocale } from './engine/i18n'
import { Input } from './engine/input'
import { GameLoop } from './engine/loop'
import { SAVE_KEY, SaveStore, type Quality, type SaveData } from './engine/save'
import type { Game } from './game/game'
import { fetchMyNote, fetchNote, noteErrorKey, saveMyNote, type Note } from './net/notes'
import { Room } from './net/room'
import { Notepad } from './ui/notepad'
import { TouchControls } from './ui/touch'
import { Ui, type Account , type LikeSide } from './ui/ui'

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  const params = new URLSearchParams(location.search)
  const firstRun = safeGet(SAVE_KEY) === null
  const save = new SaveStore()

  // Arriving from the end of Dream Gallery: ?lang=en|zh carries the story's language over.
  const lang = params.get('lang')
  if (lang === 'en' || lang === 'zh' || lang === 'zh-CN') save.update({ locale: lang === 'en' ? 'en' : 'zh-CN' })
  const i18n = new I18n(resolveLocale(save.data.locale, navigator.languages))
  // Inside Dream Gallery the hill is a quiet place to stay alone: no sign-in, room or left drawings.
  document.body.dataset.solo = ''
  const input = new Input(canvas)
  const audio = new Audio()
  let game: Game | undefined
  let lockLostAt = 0
  // The shared hill (see src/net/room.ts): joins when a seat is free, otherwise plays alone.
  const room = new Room()
  let notepad: Notepad | undefined
  let peekTitle = () => {}

  const applySettings = (d: SaveData) => {
    input.sensitivity = d.sensitivity
    input.invertY = d.invertY
    audio.setVolumes(d.musicVolume, d.sfxVolume, d.muted)
    if (game) game.reducedMotion = d.reducedMotion
  }

  // Audio may only start after a user gesture; the first click/key anywhere starts the soundscape.
  const wake = () => {
    audio.unlock()
    audio.startMusic()
  }
  window.addEventListener('pointerdown', wake, { once: true, capture: true })
  window.addEventListener('keydown', wake, { once: true, capture: true })

  const play = () => {
    if (!game) return
    wake()
    game.start()
    ui.show('hud')
    loop.resetAccumulator()
    input.lockPointer()
  }
  const pause = () => {
    // The drawing pad already holds the traveller still; don't pull it out from under them.
    if (game?.mode !== 'playing' || notepad?.isOpen) return
    game.pause()
    ui.show('pause')
    input.unlockPointer()
  }
  const resume = () => {
    if (game?.mode !== 'paused') return
    game.resume()
    ui.show('hud')
    loop.resetAccumulator()
    input.lockPointer()
  }

  // ─── Manus sign-in (optional: the hill is open to everyone) ───────────────
  const toAccount = (s: ManusSession | null): Account =>
    !s ? { status: 'loading' } : s.status === 'authenticated' ? { status: 'authenticated', name: s.user.name ?? '' } : { status: s.status }
  const login = () => {
    ui.setAccount({ status: 'pending' })
    // Called synchronously inside the click so the embedded Preview may open the standalone game.
    ManusAuth.login()
      .catch(err => console.warn('Manus login did not start:', err))
      .finally(() => window.setTimeout(() => ui.setAccount(toAccount(ManusAuth.get_session())), 1200))
  }
  const logout = () => {
    ManusAuth.logout()
      .then(s => ui.setAccount(toAccount(s)))
      .catch(err => console.warn('Manus logout failed:', err))
  }
  window.addEventListener('manus-auth-change', e => ui.setAccount(toAccount(e.detail)))

  const ui = new Ui(i18n, save, audio, input, {
    play,
    resume,
    quit: () => {
      ui.closeTalk()
      notepad?.close()
      room.stop()
      game?.toTitle()
      ui.show('title')
      input.unlockPointer()
      peekTitle()
    },
    settings: patch => {
      const qualityChanged = patch.quality !== undefined && patch.quality !== save.data.quality
      save.update(patch)
      applySettings(save.data)
      if (patch.locale) i18n.set(patch.locale)
      if (qualityChanged) game?.setQuality(save.data.quality)
    },
    login,
    logout,
  })
  ui.show('boot')
  applySettings(save.data)
  ManusAuth.prepare()
    .then(s => ui.setAccount(toAccount(s)))
    .catch(() => ui.setAccount({ status: 'offline' }))

  // Boot: three.js, Rapier (WASM) and the scene load as a separate chunk behind the progress bar.
  let loaded = 0
  const track = <T>(p: Promise<T>): Promise<T> => p.then(v => (ui.setBootProgress(0.1 + (++loaded / 4) * 0.6), v))
  ui.setBootProgress(0.1)
  const [{ Game }, { Renderer, suggestQuality }, physics] = await Promise.all([
    track(import('./game/game')),
    track(import('./engine/renderer')),
    track(import('./engine/physics')),
    track(document.fonts.ready),
  ])
  await physics.initPhysics()
  if (firstRun) {
    save.update({ quality: suggestQuality() })
    ui.refreshSettings()
  }
  const forced = params.get('q')
  const quality: Quality = forced === 'low' || forced === 'medium' || forced === 'high' ? forced : save.data.quality

  // Let the progress bar paint before the heavy scene build (cloud noise, tower field, grass).
  ui.setBootProgress(0.8)
  await nextFrame()
  const renderer = new Renderer(canvas, quality)
  game = new Game(renderer, input, audio, quality)
  game.reducedMotion = save.data.reducedMotion
  game.onCaption = caption => ui.caption(caption)
  // The hill remembers what was found: stars, the fox's taming, the guardian's eye.
  const enc = game.encounters
  enc.restore({ stars: save.data.stars, fox: save.data.fox, awake: save.data.awake })
  ui.setStars(enc.stars)
  enc.onPersist = p => save.update(p)
  enc.onSound = name => audio.play(name)
  enc.onStar = (count, total) => {
    ui.setStars(enc.stars)
    audio.play('star')
    ui.note(count >= total ? i18n.t('star.all') : i18n.t('star.found', { n: count, total }))
  }
  game.ambience.start()
  const g = game
  ui.setBootProgress(1)

  // ─── the shared hill: travellers as silhouettes, likes, hand-drawn notes ────
  const social = g.social
  let myNote: Note | null = null
  let others: Note[] = []
  // Drawings left on this hill while we are here (or lately, from the room), newest first. They
  // always show, ahead of the random handful.
  let live: Note[] = []
  const showNotes = () => social.setNotes([...live, ...others.filter(n => !live.some(l => l.id === n.id))], myNote)
  const signedIn = () => ManusAuth.get_session()?.status === 'authenticated'
  room.onStatus = status => ui.setPresence(status, room.count)
  // Where a traveller stands as seen from here: angle from the view (0 = ahead, + = right) and a word.
  const bearing = (id: number): { angle: number; side: LikeSide } | null => {
    const r = room.remotes().find(p => p.id === id)
    if (!r) return null
    const e = g.camera.matrixWorld.elements
    const dx = r.x - g.player.feet.x
    const dz = r.z - g.player.feet.z
    const angle = Math.atan2(dx * e[0] + dz * e[2], -(dx * e[8] + dz * e[10]))
    const a = Math.abs(angle)
    return { angle, side: a < 0.7 ? 'front' : a > 2.3 ? 'back' : angle > 0 ? 'right' : 'left' }
  }
  let likedBy = 0
  room.onLiked = from => {
    social.pulse(from)
    audio.play('star')
    likedBy = from
    const b = bearing(from)
    ui.likeGot(b?.side ?? null, b?.angle ?? null)
  }
  room.onLikeResult = r => {
    if (r.ok) {
      social.pulse(r.to)
      ui.likeSent()
    } else if (r.reason === 'soon') ui.note(i18n.t('like.soon'))
    else if (r.reason === 'far' || r.reason === 'facing') ui.note(i18n.t('like.far'))
  }
  const fetching = new Set<number>()
  room.onNote = (id, from) => {
    // The welcome's backlog skips what is already shown; a live note may be a redrawing, so it is
    // fetched again. Only ids travel through the room: the drawing comes from the game's server.
    if (id === myNote?.id || fetching.has(id)) return
    if (from === null && (live.some(n => n.id === id) || others.some(n => n.id === id))) return
    fetching.add(id)
    void fetchNote(id).then(note => {
      fetching.delete(id)
      if (!note || note.id === myNote?.id) return
      live = [note, ...live.filter(n => n.id !== note.id)].slice(0, 12)
      showNotes()
      if (from !== null && g.mode === 'playing') {
        social.bloom(note.id)
        social.pulse(from)
        audio.play('pickup')
        ui.note(i18n.t('note.arrived'))
      }
    })
  }
  // A note is left a step ahead of the traveller's feet, inside the walkable hill.
  let noteSpot = { x: 0, z: 0 }
  const spotAhead = () => {
    const e = g.camera.matrixWorld.elements
    const len = Math.hypot(e[8], e[10]) || 1
    let x = g.player.feet.x - (e[8] / len) * 1.2
    let z = g.player.feet.z - (e[10] / len) * 1.2
    const r = Math.hypot(x, z)
    if (r > 60) {
      x *= 60 / r
      z *= 60 / r
    }
    return { x, z }
  }
  const pad = new Notepad(document.getElementById('ui')!, i18n, {
    save: strokes => {
      pad.setBusy(true)
      saveMyNote(noteSpot.x, noteSpot.z, strokes)
        .then(note => {
          myNote = note
          live = live.filter(n => n.id !== note.id)
          showNotes()
          room.sendNote(note.id)
          audio.play('star')
          pad.close(false)
          ui.note(i18n.t('note.saved'))
        })
        .catch(err => {
          pad.setBusy(false)
          const key = noteErrorKey(err)
          if (key === 'note.login') pad.openLogin()
          else pad.setMessage(key)
        })
    },
    login: () => login(),
    closed: gesture => {
      g.frozen = false
      loop.resetAccumulator()
      if (gesture && g.mode === 'playing') input.lockPointer()
    },
  })
  notepad = pad
  const openPad = (view?: { note: Note; own: boolean }) => {
    g.frozen = true
    ui.closeTalk()
    audio.play('ui')
    if (view) pad.openView(view.note, view.own)
    else if (!signedIn()) pad.openLogin()
    else {
      noteSpot = spotAhead()
      pad.openDraw(myNote?.strokes ?? null)
    }
    input.unlockPointer()
  }
  window.addEventListener('manus-auth-change', e => {
    if (e.detail?.status === 'authenticated') {
      fetchMyNote()
        .then(note => {
          myNote = note
          showNotes()
          if (pad.mode === 'login') {
            noteSpot = spotAhead()
            pad.openDraw(myNote?.strokes ?? null)
          }
        })
        .catch(() => {})
    } else if (e.detail?.status === 'logged_out') {
      myNote = null
      showNotes()
    }
  })
  const socialPrompt = () => {
    const f = social.focus
    return !f ? null : f.kind === 'ghost' ? 'ghost' : f.own ? 'ownNote' : 'note'
  }
  let lastFeet = { x: g.player.feet.x, z: g.player.feet.z }

  // Test/debug views: ?cam=x,y,z,yawDeg,pitchDeg,fov[,g]  (g = y is height above ground), ?play.
  const cam = params.get('cam')
  if (cam) {
    const [x, y, z, yaw, pitch, fov, ground] = cam.split(',')
    const n = (s: string | undefined, d: number) => (s === undefined || s === '' || !Number.isFinite(Number(s)) ? d : Number(s))
    g.debugCamera = { x: n(x, 0), y: n(y, 2), z: n(z, 0), yaw: (n(yaw, 0) * Math.PI) / 180, pitch: (n(pitch, 0) * Math.PI) / 180, fov: n(fov, 60), ground: ground === 'g' }
  }

  let frames = 0
  const loop = new GameLoop({
    step: dt => g.step(dt),
    render: (alpha, frameSeconds) => {
      input.update()
      if (pad.isOpen) {
        if (input.consume('pause')) pad.close(false)
      } else if (input.consume('pause') && performance.now() - lockLostAt > 300) {
        if (g.mode === 'playing') pause()
        else if (g.mode === 'paused' && ui.screen === 'pause') resume()
      }
      // E / click / pad Y talks to what is in view; E, Space or a tap moves the talk along.
      // The story's creatures come first; then travellers (a like) and note flowers (a look).
      if (g.mode === 'playing' && !g.debugCamera && !pad.isOpen) {
        if (ui.talking) {
          if (input.consume('interact') || input.consume('jump') || input.consume('confirm')) ui.advanceTalk()
        } else if (input.consume('interact')) {
          const lines = enc.interact(i18n.locale)
          const f = social.focus
          if (lines) {
            audio.play('talk')
            ui.openTalk(lines, () => enc.endDialogue())
          } else if (f?.kind === 'ghost') {
            audio.play('pickup')
            room.like(f.id)
          } else if (f?.kind === 'note') openPad({ note: f.note, own: f.own })
        } else input.consume('note')
      } else {
        input.consume('interact')
        input.consume('note')
      }
      ui.setFocus(g.mode === 'playing' && !ui.talking && !pad.isOpen ? (enc.focus?.target ?? socialPrompt()) : null)
      ui.setNoteKey(false)
      if (likedBy && ui.likeShowing) {
        const b = bearing(likedBy)
        ui.setLikeSide(b?.side ?? null, b?.angle ?? null)
      }
      // Share this traveller's pose (10 Hz) and show everyone else's.
      if (g.mode !== 'title' && !g.debugCamera) {
        const e = g.camera.matrixWorld.elements
        const feet = g.player.feet
        const speed = Math.hypot(feet.x - lastFeet.x, feet.z - lastFeet.z) / Math.max(frameSeconds, 1e-3)
        lastFeet = { x: feet.x, z: feet.z }
        room.sendPose(feet.x, feet.z, Math.atan2(e[8], e[10]), speed > 0.6)
      }
      social.setRemotes(room.remotes())
      ui.setPresence(room.status, room.count)
      ui.frame(frameSeconds)
      // The world keeps moving behind the pause menu; only the player stops (see Game.step).
      g.render(alpha, frameSeconds)
      input.endFrame()
      frames += 1
    },
  })
  loop.start()

  document.addEventListener('pointerlockchange', () => {
    // Browsers release pointer lock on Escape without delivering the key: treat that as pause.
    if (!document.pointerLockElement && g.mode === 'playing' && input.method === 'keyboard' && !pad.isOpen) {
      lockLostAt = performance.now()
      pause()
    }
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause()
  })
  window.addEventListener('game:pause', pause)
  canvas.addEventListener('click', () => {
    if (g.mode === 'playing' && !pad.isOpen) input.lockPointer()
  })
  new TouchControls(document.getElementById('ui')!, input, () => g.mode === 'playing')

  if (params.has('play')) play()
  else window.setTimeout(() => ui.show('title'), 300)
  // Debug/test hook (read-only use): screenshot and smoke tools inspect the scene through it.
  Object.assign(window, { __game: { game: g, ui, input, save, renderer, loop, room, notepad: pad } })
  Object.defineProperty(window, '__frames', { get: () => frames })
}

function nextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

boot().catch(err => {
  console.error(err)
  const el = document.getElementById('ui')
  const zh = /^zh/i.test(navigator.language)
  const lead = zh ? '场景加载失败。请使用支持 WebGL2 的浏览器（如最新版 Chrome、Edge、Safari 或 Firefox）后重试。' : 'The scene could not start. Please try a browser with WebGL2 support (recent Chrome, Edge, Safari or Firefox).'
  if (el) el.innerHTML = `<div class="fatal"><p>${lead}<br><small>${String((err as Error)?.message ?? err).replace(/[<>&]/g, '')}</small></p></div>`
})
