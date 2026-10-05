/**
 * Versioned local save. Everything the player keeps between sessions lives in one JSON record so
 * it is easy to migrate. Corrupt or foreign data falls back to defaults instead of crashing.
 */
export type Locale = 'en' | 'zh-CN'
export type Quality = 'low' | 'medium' | 'high'

export type ScoreEntry = { name: string; score: number; seconds: number; at: number }

export type SaveData = {
  version: 1
  /** '' = never chosen; the game follows the browser language until the player picks one. */
  locale: Locale | ''
  musicVolume: number
  sfxVolume: number
  muted: boolean
  sensitivity: number
  invertY: boolean
  quality: Quality
  reducedMotion: boolean
  tutorialDone: boolean
  playerName: string
  leaderboard: ScoreEntry[]
  /** Stars found on the hill, the fox's taming (0-3) and whether the guardian has woken. */
  stars: string[]
  fox: number
  awake: boolean
  /** What the animals call the player, typed on the title card ('' = not given; see Ui.playerName). */
  name: string
}

export const SAVE_KEY = 'skyruin.save'
export const NAME_MAX = 12
/** A typed name made safe to show: no control, zero-width or direction-override characters,
 * no braces (the script token), single spaces, at most NAME_MAX characters. */
export function cleanName(raw: string): string {
  const s = raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff{}]/g, '').replace(/\s+/g, ' ').trim()
  return Array.from(s).slice(0, NAME_MAX).join('').trim()
}
export const LEADERBOARD_SIZE = 10

export function defaultSave(): SaveData {
  return {
    version: 1,
    locale: '',
    musicVolume: 0.7,
    sfxVolume: 0.8,
    muted: false,
    sensitivity: 1,
    invertY: false,
    quality: 'high',
    stars: [],
    fox: 0,
    awake: false,
    name: '',
    reducedMotion: false,
    tutorialDone: false,
    playerName: 'PLAYER',
    leaderboard: [],
  }
}

const clamp01 = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback)

/** Parse untrusted stored JSON into a valid SaveData (pure; unit tested). */
export function parseSave(raw: string | null): SaveData {
  const base = defaultSave()
  if (!raw) return base
  let data: Record<string, unknown>
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return base
    data = parsed as Record<string, unknown>
  } catch {
    return base
  }
  if (data.version !== 1) return base
  const board = Array.isArray(data.leaderboard) ? data.leaderboard : []
  return {
    version: 1,
    locale: data.locale === 'en' || data.locale === 'zh-CN' ? data.locale : '',
    musicVolume: clamp01(data.musicVolume, base.musicVolume),
    sfxVolume: clamp01(data.sfxVolume, base.sfxVolume),
    muted: data.muted === true,
    sensitivity: typeof data.sensitivity === 'number' && data.sensitivity >= 0.2 && data.sensitivity <= 3 ? data.sensitivity : base.sensitivity,
    invertY: data.invertY === true,
    quality: data.quality === 'low' || data.quality === 'medium' || data.quality === 'high' ? data.quality : base.quality,
    reducedMotion: data.reducedMotion === true,
    tutorialDone: data.tutorialDone === true,
    stars: Array.isArray(data.stars) ? [...new Set(data.stars.filter((x): x is string => typeof x === 'string' && x.length <= 16))].slice(0, 16) : [],
    fox: typeof data.fox === 'number' && Number.isFinite(data.fox) ? Math.max(0, Math.min(3, Math.floor(data.fox))) : 0,
    awake: data.awake === true,
    name: typeof data.name === 'string' ? cleanName(data.name) : '',
    playerName: typeof data.playerName === 'string' && data.playerName.trim() ? data.playerName.trim().slice(0, 16) : base.playerName,
    leaderboard: board
      .filter((e): e is ScoreEntry => !!e && typeof e === 'object' && typeof (e as ScoreEntry).name === 'string' && Number.isFinite((e as ScoreEntry).score))
      .map(e => ({ name: e.name.slice(0, 16), score: Math.max(0, Math.floor(e.score)), seconds: Number.isFinite(e.seconds) ? e.seconds : 0, at: Number.isFinite(e.at) ? e.at : 0 }))
      .slice(0, LEADERBOARD_SIZE),
  }
}

/** Insert a run into a bounded, deterministically ordered leaderboard (higher score, then faster, then earlier). */
export function insertScore(board: ScoreEntry[], entry: ScoreEntry): { board: ScoreEntry[]; rank: number } {
  const next = [...board, entry].sort((a, b) => b.score - a.score || a.seconds - b.seconds || a.at - b.at).slice(0, LEADERBOARD_SIZE)
  return { board: next, rank: next.indexOf(entry) }
}

export class SaveStore {
  data: SaveData

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = globalThis.localStorage) {
    let raw: string | null = null
    try {
      raw = this.storage?.getItem(SAVE_KEY) ?? null
    } catch {
      raw = null
    }
    this.data = parseSave(raw)
  }

  update(patch: Partial<SaveData>): void {
    this.data = { ...this.data, ...patch }
    try {
      this.storage?.setItem(SAVE_KEY, JSON.stringify(this.data))
    } catch {
      // Private browsing or quota: the game keeps working with in-memory settings.
    }
  }
}
