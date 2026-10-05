// voice-lines.mjs — every voiced story line, collected from the story text modules (2026-10-04).
// One collector for the browser prewarm (core/dialog-prewarm.js) and the release-time pre-render script
// (scripts/dev/warm-all-voices.mjs), so both always cover the same lines. Before this, the prewarm walked only
// story-text.mjs and silently skipped story-text-late.mjs (328-330, Earth day) and ending-text.mjs: 57% of
// all audio files were first cooked live, while the player waited.
// Pure: no DOM, no network. The caller passes `voiceFor` (the voice table lives in core/dialog-voice.mjs).

export const MAX_LINE_LEN = 220; // same cut as lib/tts.js MAX_LEN and dialog-voice MAX_SPEAK_LEN

/**
 * Walk story text modules for {en, zh} entries. A speaker id (`who.spk`) set on a container
 * is inherited by the lines below it, as in the dialogue system.
 * @param {Record<string, object>} modules  name -> module namespace, in priority order
 * @param {(spk: string, text: string) => string} voiceFor
 * @returns {{src:string, lang:'en'|'zh', spk:string, text:string, voice:string}[]} unique by voice+text
 */
export function collectVoiceLines(modules, voiceFor) {
  const out = [];
  const seen = new Set();
  const add = (src, entry, spk) => {
    for (const lang of ['en', 'zh']) {
      const raw = entry[lang];
      if (typeof raw !== 'string' || !raw.trim()) continue;
      const text = raw.slice(0, MAX_LINE_LEN);
      const voice = voiceFor(spk, text);
      const id = voice + '|' + text;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ src, lang, spk, text, voice });
    }
  };
  const walk = (node, spk, src, visited) => {
    if (!node || typeof node !== 'object' || visited.has(node)) return;
    if (typeof node.en === 'string' || typeof node.zh === 'string') {
      add(src, node, (node.who && node.who.spk) || spk || '');
      return;
    }
    visited.add(node);
    const own = (node.who && node.who.spk) || spk || '';
    for (const k of Object.keys(node)) {
      if (k === 'who') continue; // speaker metadata, not a line
      walk(node[k], own, src, visited);
    }
  };
  for (const [src, mod] of Object.entries(modules)) {
    const visited = new Set();
    for (const v of Object.values(mod)) {
      if (typeof v === 'function') continue;
      walk(v, '', src, visited);
    }
  }
  return out;
}

/** Order lines for background loading: the player's language first, each language in module (story) order. */
export function prioritizeLines(lines, lang) {
  const first = lines.filter((l) => l.lang === lang);
  const rest = lines.filter((l) => l.lang !== lang);
  return first.concat(rest);
}
