/**
 * The shared hill: one online room (see room-server/server.mjs). When the room has a free seat
 * the traveller joins it and sees the others as silhouettes; when it is full, unreachable or not
 * configured, the game simply stays single-player (and quietly checks again later).
 *
 * The room endpoint is discovered at runtime from `multiplayer/bootstrap.json`, resolved relative
 * to the game page, so the same build works in Preview and when published.
 */
export const ROOM_BUILD = 'faraway-room-v1'

export type RoomStatus = 'idle' | 'connecting' | 'online' | 'full' | 'solo'
export type RemotePose = { id: number; x: number; z: number; yaw: number; moving: boolean }
export type LikeResult = { to: number; ok: boolean; reason?: string }

type Snapshot = { t: number; p: Map<number, [number, number, number, number]> }

const RESUME_KEY = 'faraway.room.resume'
const INTERP_DELAY = 140 // ms behind the newest snapshot
const FULL_RETRY = 60_000

/** Reads and validates the room descriptor; null means "play alone". */
export async function discoverRoom(): Promise<string | null> {
  try {
    const ctl = new AbortController()
    const timer = window.setTimeout(() => ctl.abort(), 5000)
    const res = await fetch(new URL('multiplayer/bootstrap.json', document.baseURI), { cache: 'no-store', signal: ctl.signal })
    window.clearTimeout(timer)
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null
    const d = (await res.json()) as { version?: unknown; build?: unknown; signalingUrl?: unknown }
    if (d.version !== 1 || d.build !== ROOM_BUILD || typeof d.signalingUrl !== 'string') return null
    const u = new URL(d.signalingUrl)
    const loopback = (h: string) => h === 'localhost' || h === '127.0.0.1'
    const localDev = u.protocol === 'ws:' && loopback(u.hostname) && loopback(location.hostname)
    if (u.protocol !== 'wss:' && !localDev) return null
    if (u.pathname !== '/ws' || u.search || u.hash || u.username || u.password) return null
    return u.href
  } catch {
    return null
  }
}

export class Room {
  status: RoomStatus = 'idle'
  selfId = 0
  /** Travellers on the hill including you (only meaningful while online). */
  count = 0
  onStatus?: (status: RoomStatus) => void
  onLiked?: (from: number) => void
  onLikeResult?: (result: LikeResult) => void
  /** A drawing left on this hill: `from` is the traveller's seat, or null for one left before you came. */
  onNote?: (id: number, from: number | null) => void

  private url: string | null = null
  private ws: WebSocket | null = null
  private snaps: Snapshot[] = []
  private offset: number | null = null
  private wanted = false
  private retries = 0
  private timer = 0
  private lastSent = 0
  private lastKey = ''

  /** Join the shared hill if it has room (idempotent). */
  async start(): Promise<void> {
    this.wanted = true
    if (this.ws || this.status === 'connecting') return
    this.setStatus('connecting')
    if (this.url === null) this.url = await discoverRoom()
    if (!this.wanted) return
    if (!this.url) return this.setStatus('solo')
    this.connect()
  }

  /** Travellers on the shared hill right now, read from the room's health route (null = unknown). */
  async peek(): Promise<number | null> {
    if (this.url === null) this.url = await discoverRoom()
    if (!this.url) return null
    try {
      const u = new URL(this.url)
      u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:'
      u.pathname = '/healthz'
      const ctl = new AbortController()
      const timer = window.setTimeout(() => ctl.abort(), 4000)
      const res = await fetch(u, { cache: 'no-store', credentials: 'omit', signal: ctl.signal })
      window.clearTimeout(timer)
      if (!res.ok) return null
      const d = (await res.json()) as { marker?: unknown; players?: unknown }
      if (d.marker !== ROOM_BUILD || typeof d.players !== 'number' || !Number.isFinite(d.players)) return null
      return Math.max(0, Math.round(d.players))
    } catch {
      return null
    }
  }

  /** Leave the room (back to the title); the seat is released after the server's grace period. */
  stop(): void {
    this.wanted = false
    window.clearTimeout(this.timer)
    const ws = this.ws
    this.ws = null
    ws?.close(1000, 'left')
    this.snaps = []
    this.count = 0
    this.setStatus('idle')
  }

  get online(): boolean {
    return this.status === 'online'
  }

  private connect(): void {
    window.clearTimeout(this.timer)
    const q = new URLSearchParams({ build: ROOM_BUILD })
    const token = safeSession(RESUME_KEY)
    if (token) q.set('resume', token)
    let ws: WebSocket
    try {
      ws = new WebSocket(`${this.url}?${q}`)
    } catch {
      return this.retry()
    }
    this.ws = ws
    ws.onmessage = e => {
      if (this.ws === ws && typeof e.data === 'string') this.onMessage(e.data)
    }
    ws.onclose = e => {
      if (this.ws !== ws) return
      this.ws = null
      this.snaps = []
      this.count = 0
      this.onClose(e.code)
    }
    ws.onerror = () => {}
  }

  private onMessage(data: string): void {
    let m: Record<string, unknown>
    try {
      m = JSON.parse(data)
    } catch {
      return
    }
    switch (m.type) {
      case 'welcome':
        this.selfId = Number(m.id) || 0
        if (typeof m.resume === 'string') safeSessionSet(RESUME_KEY, m.resume)
        this.retries = 0
        this.snaps = []
        this.offset = null
        this.setStatus('online')
        if (Array.isArray(m.notes)) for (const id of m.notes) if (Number.isSafeInteger(id) && (id as number) > 0) this.onNote?.(id as number, null)
        break
      case 'full':
        this.setStatus('full')
        break
      case 'state': {
        const t = Number(m.t)
        if (!Number.isFinite(t) || !Array.isArray(m.p)) return
        const p = new Map<number, [number, number, number, number]>()
        for (const row of m.p as unknown[]) {
          if (!Array.isArray(row) || row.length < 5) continue
          const [id, x, z, yaw, mv] = row.map(Number)
          if (id === this.selfId || ![id, x, z, yaw].every(Number.isFinite)) continue
          p.set(id, [x, z, yaw, mv])
        }
        this.count = p.size + 1
        // Server-clock offset, smoothed: remote poses are shown a little behind the newest frame.
        const off = performance.now() - t
        this.offset = this.offset === null ? off : this.offset + (off - this.offset) * 0.08
        this.snaps.push({ t, p })
        if (this.snaps.length > 30) this.snaps.shift()
        break
      }
      case 'liked':
        this.onLiked?.(Number(m.from))
        break
      case 'likeOk':
        this.onLikeResult?.({ to: Number(m.to), ok: true })
        break
      case 'likeNo':
        this.onLikeResult?.({ to: Number(m.to), ok: false, reason: String(m.reason ?? '') })
        break
      case 'note': {
        const id = Number(m.id)
        if (Number.isSafeInteger(id) && id > 0) this.onNote?.(id, Number(m.from) || 0)
        break
      }
    }
  }

  private onClose(code: number): void {
    if (!this.wanted) return
    if (code === 4003) {
      // The hill is full: play alone, and look again later in case a seat frees up.
      this.setStatus('full')
      this.timer = window.setTimeout(() => this.wanted && this.connect(), FULL_RETRY)
      return
    }
    if (code === 4001 || code === 4002) {
      // Another tab took this seat, or this page is an older build: stay single-player.
      if (code === 4002) safeSessionSet(RESUME_KEY, '')
      this.setStatus('solo')
      return
    }
    this.retry()
  }

  private retry(): void {
    this.retries += 1
    if (this.retries > 3) this.setStatus('solo')
    else this.setStatus('connecting')
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.retries, 5))
    this.timer = window.setTimeout(() => this.wanted && this.connect(), delay)
  }

  private setStatus(s: RoomStatus): void {
    if (s === this.status) return
    this.status = s
    this.onStatus?.(s)
  }

  /** Send the local pose (10 Hz while moving, 1 Hz keep-alive while still). */
  sendPose(x: number, z: number, yaw: number, moving: boolean, now = performance.now()): void {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN || this.status !== 'online') return
    if (now - this.lastSent < 100) return
    const key = `${x.toFixed(2)},${z.toFixed(2)},${yaw.toFixed(2)},${moving ? 1 : 0}`
    if (key === this.lastKey && now - this.lastSent < 1000) return
    this.lastSent = now
    this.lastKey = key
    ws.send(JSON.stringify({ type: 'pose', x: round(x), z: round(z), yaw: Math.round(yaw * 1000) / 1000, m: moving ? 1 : 0 }))
  }

  like(id: number): void {
    const ws = this.ws
    if (ws && ws.readyState === WebSocket.OPEN && this.status === 'online') ws.send(JSON.stringify({ type: 'like', to: id }))
  }

  /** Tell everyone on the hill about the drawing just saved (only its id travels). */
  sendNote(id: number): void {
    const ws = this.ws
    if (ws && ws.readyState === WebSocket.OPEN && this.status === 'online') ws.send(JSON.stringify({ type: 'note', id }))
  }

  /** Other travellers, interpolated between server snapshots. */
  remotes(now = performance.now()): RemotePose[] {
    const out: RemotePose[] = []
    const snaps = this.snaps
    if (!snaps.length || this.offset === null || this.status !== 'online') return out
    const t = now - this.offset - INTERP_DELAY
    let i = snaps.length - 1
    while (i > 0 && snaps[i - 1].t > t) i--
    const b = snaps[i]
    const a = i > 0 ? snaps[i - 1] : b
    const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1
    // Everyone in the newest snapshot is on the hill now; older frames only smooth their motion.
    for (const [id, pb] of snaps[snaps.length - 1].p) {
      const q = b.p.get(id) ?? pb
      const p = a.p.get(id) ?? q
      out.push({ id, x: p[0] + (q[0] - p[0]) * k, z: p[1] + (q[1] - p[1]) * k, yaw: p[2] + wrap(q[2] - p[2]) * k, moving: (k < 0.5 ? p[3] : q[3]) > 0 })
    }
    return out
  }
}

const round = (v: number) => Math.round(v * 100) / 100
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

function safeSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key) || null
  } catch {
    return null
  }
}
function safeSessionSet(key: string, value: string): void {
  try {
    if (value) sessionStorage.setItem(key, value)
    else sessionStorage.removeItem(key)
  } catch {
    /* private mode: no resume, a fresh seat each time */
  }
}
