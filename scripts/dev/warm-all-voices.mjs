// warm-all-voices.mjs — pre-render EVERY story line's voice once, at release time (2026-10-04).
//
// Why: the browser prewarm makes the visitors' sessions cook the audio on the server (2 workers, ~4.5 s a line),
// and it used to skip the late chapters and the ending. A line nobody has cooked yet is synthesized live the first
// time it is heard, which is the slow line you notice. Run this after every change to the story text or a voice:
// when it finishes, every line exists as a file on the server (and is mirrored to R2 by lib/tts.js), so playing a
// line is only a download of a cached .mp3.
//
// Usage: node scripts/dev/warm-all-voices.mjs [BASE_URL] [--dry] [--check] [--max-minutes=180]
//   BASE_URL  the game server, default http://localhost:3000 (use the real site or run it on the server itself)
//   --dry     only list what would be cooked (counts per module / language / voice); touches nothing
//   --check   only report which lines are not cooked yet (reads /tts-audio/<key>.mp3, queues nothing)
//   (default) queue the missing lines in small chunks, wait for them, repeat until all exist
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const BASE = (args.find((a) => /^https?:\/\//.test(a)) || process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const MAX_MIN = Number((args.find((a) => a.startsWith('--max-minutes=')) || '').split('=')[1]) || 180;

const { collectVoiceLines } = await import('../../src/shared/voice-lines.mjs');
const { voiceFor } = await import('../../src/core/dialog-voice.mjs');
const modules = {
  'story-text': await import('../../src/shared/story-text.mjs'),
};
// Same key as lib/tts.js ttsKey() and dialog-voice.mjs ttsUrl(): sha256('tts1|voice|text') first 20 hex.
const keyOf = (voice, text) => createHash('sha256').update('tts1|' + voice + '|' + text).digest('hex').slice(0, 20);
const items = collectVoiceLines(modules, voiceFor).map((l) => ({ ...l, key: keyOf(l.voice, l.text) }));

const tally = (rows, f) => rows.reduce((a, r) => ((a[f(r)] = (a[f(r)] || 0) + 1), a), {});
console.log(`${items.length} audio files in total`);
console.log('by module  ', JSON.stringify(tally(items, (r) => r.src)));
console.log('by language', JSON.stringify(tally(items, (r) => r.lang)));
console.log('by voice   ', JSON.stringify(tally(items, (r) => r.voice)));
if (flag('dry')) process.exit(0);

async function exists(key) {
  try {
    const r = await fetch(`${BASE}/tts-audio/${key}.mp3`, { signal: AbortSignal.timeout(20000) });
    await r.body?.cancel();
    return r.status === 200;
  } catch (e) {
    return false;
  }
}
async function missingOf(list) {
  const out = [];
  for (let i = 0; i < list.length; i += 8) {
    const part = list.slice(i, i + 8);
    const ok = await Promise.all(part.map((it) => exists(it.key)));
    part.forEach((it, j) => !ok[j] && out.push(it));
  }
  return out;
}

let missing = await missingOf(items);
console.log(`already on the server: ${items.length - missing.length}   missing: ${missing.length}`);
if (flag('check') || !missing.length) {
  const bySrc = tally(missing, (r) => r.src);
  if (missing.length) console.log('missing by module', JSON.stringify(bySrc));
  else console.log('every line is cooked.');
  process.exit(missing.length ? 1 : 0);
}

// The server keeps at most 400 queued batch jobs and cooks ~13 lines a minute, so send what fits, wait, ask again.
const started = Date.now();
while (missing.length && (Date.now() - started) / 60000 < MAX_MIN) {
  let sent = 0;
  for (let i = 0; i < missing.length; i += 60) {
    const chunk = missing.slice(i, i + 60);
    let r;
    try {
      r = await fetch(`${BASE}/api/tts/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: chunk.map((c) => ({ text: c.text, voice: c.voice })) }),
      }).then((x) => x.json());
    } catch (e) {
      console.log('batch request failed:', String(e.message).slice(0, 80));
      break;
    }
    sent += chunk.length;
    if ((r.queued || 0) + (r.cached || 0) < chunk.length) break; // the server queue is full: wait for it to drain
  }
  await new Promise((res) => setTimeout(res, 45000));
  missing = await missingOf(missing);
  const done = items.length - missing.length;
  console.log(`[${Math.round((Date.now() - started) / 60000)} min] cooked ${done}/${items.length}  (sent ${sent} this round)`);
}
if (missing.length) {
  console.log(`stopped with ${missing.length} lines still missing (time limit). Run it again to continue.`);
  process.exit(1);
}
console.log('done: every story line is cooked and ready.');
