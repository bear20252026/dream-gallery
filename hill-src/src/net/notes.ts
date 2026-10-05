import { ManusAuth } from '../../manus-auth.js'

/**
 * Hand-drawn notes (server/notes.mjs). Strokes are [[colour, width, x0, y0, x1, y1, …], …] on a
 * 256×256 sheet. Anyone can find other travellers' notes; leaving one needs a Manus sign-in.
 */
export type Stroke = number[]
export type Note = { id: number; x: number; z: number; strokes: Stroke[] }

export const NOTE_LIMITS = { colours: 4, widths: 3, strokes: 120, points: 1600, radius: 62 }

const isNote = (n: unknown): n is Note => {
  const o = n as Note
  return !!o && Number.isFinite(o.id) && Number.isFinite(o.x) && Number.isFinite(o.z) && Array.isArray(o.strokes) && o.strokes.length > 0
}

/** A random handful of other travellers' notes (empty when the notes service is unreachable). */
export async function fetchRandomNotes(n = 12): Promise<Note[]> {
  try {
    const res = await fetch(new URL(`api/notes/random?n=${n}`, document.baseURI), { cache: 'no-store', credentials: 'same-origin' })
    if (!res.ok) return []
    const body = (await res.json()) as { notes?: unknown[] }
    return (body.notes ?? []).filter(isNote)
  } catch {
    return []
  }
}

/** One note by id: a drawing someone on the same hill just left (null when gone or unreachable). */
export async function fetchNote(id: number): Promise<Note | null> {
  if (!Number.isSafeInteger(id) || id < 1) return null
  try {
    const res = await fetch(new URL(`api/notes/${id}`, document.baseURI), { cache: 'no-store', credentials: 'same-origin' })
    if (!res.ok) return null
    const body = (await res.json()) as { note?: unknown }
    return isNote(body.note) ? body.note : null
  } catch {
    return null
  }
}

export async function fetchMyNote(): Promise<Note | null> {
  const note = await ManusAuth.query<Note | null>('notes.mine')
  return isNote(note) ? note : null
}

export async function saveMyNote(x: number, z: number, strokes: Stroke[]): Promise<Note> {
  return ManusAuth.mutate<Note>('notes.save', { x, z, strokes })
}

/** Maps a failed save to a UI message key. */
export function noteErrorKey(err: unknown): 'note.wait' | 'note.login' | 'note.fail' {
  const text = String((err as { message?: string })?.message ?? err)
  const code = (err as { data?: { code?: string } })?.data?.code ?? ''
  if (code === 'TOO_MANY_REQUESTS' || /wait a moment/i.test(text)) return 'note.wait'
  if (code === 'UNAUTHORIZED' || /login|10001/i.test(text)) return 'note.login'
  return 'note.fail'
}
