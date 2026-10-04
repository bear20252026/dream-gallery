// witness-logic.mjs — "witness cards" for the 325 / 326 / 327 memories (2026-10-04).
// The player is a ghost in these memories: the King, the Vain Man and the Tippler never see or
// answer them, and no finalized line changes. A witness card is a private paper card shown after
// the dialogue, where the player can answer in their own head (325), clap along (326) or count the
// bottles (327). Every card can be skipped. Answers are only recorded; nothing branches on them yet.
// Pure data and rules, zero dependencies; unit-tested.

export const WITNESS_IDS = ['king325', 'vain326', 'tippler327'];

export const WITNESS = {
  king325: {
    kind: 'choice',
    title: { en: 'If the King had given you an order', zh: '如果国王对你下了令' },
    hint: {
      en: 'He cannot hear you; you are only watching. This stays between you and the book.',
      zh: '他听不见你,你只是旁观。这只留在你和这本书之间。',
    },
    options: [
      { value: 'obey', label: { en: 'I would obey at once', zh: '我会立刻照办' } },
      { value: 'ask', label: { en: 'I would ask for a reason', zh: '我会问一句为什么' } },
      { value: 'refuse', label: { en: 'I would refuse', zh: '我会拒绝' } },
    ],
    done: { en: 'Noted. Only you will know.', zh: '记下了。只有你知道。' },
  },
  vain326: {
    kind: 'clap',
    title: { en: 'Clap along', zh: '跟着拍手' },
    hint: {
      en: 'He cannot hear you. Tap to fill the five minutes, or skip.',
      zh: '他听不见你。点一点,把这五分钟拍满,或者跳过。',
    },
    target: 12,
    action: { en: 'Clap', zh: '拍手' },
    done: { en: 'Five minutes passed.', zh: '五分钟过去了。' },
  },
  tippler327: {
    kind: 'count',
    title: { en: 'Count the bottles', zh: '数一数瓶子' },
    hint: {
      en: 'Tap once for each of the three bottles at his feet, or skip.',
      zh: '他脚边的三只瓶子,每只点一下,或者跳过。',
    },
    target: 3,
    action: { en: 'One more bottle', zh: '再一只' },
    done: { en: 'Counted.', zh: '数完了。' },
  },
};

export const WITNESS_SKIP = { en: 'Skip', zh: '跳过' };

/** One tap on a clap/count card. Returns the new tap total (never past the target) and whether it is full. */
export function tapStep(taps, target) {
  const t = Math.max(0, Math.floor(Number(taps) || 0));
  const goal = Math.max(1, Math.floor(Number(target) || 1));
  const next = Math.min(goal, t + 1);
  return { taps: next, done: next >= goal };
}

/** Clean a saved record: unknown ids, unknown choices and out-of-range numbers are dropped. */
export function cleanWitness(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  const k = raw.king325;
  if (k && WITNESS.king325.options.some((o) => o.value === k.value)) out.king325 = { value: k.value };
  for (const id of ['vain326', 'tippler327']) {
    const e = raw[id];
    const n = e && Math.floor(Number(e.taps));
    if (e && Number.isFinite(n) && n >= 0 && n <= 99) out[id] = { taps: n };
  }
  return out;
}

/** Record one answer (the latest replay wins). `answer` is a choice value or a tap count. */
export function recordWitness(raw, id, answer) {
  const book = cleanWitness(raw);
  if (!WITNESS_IDS.includes(id)) return book;
  const entry = id === 'king325' ? { value: answer } : { taps: answer };
  return cleanWitness({ ...book, [id]: entry });
}
