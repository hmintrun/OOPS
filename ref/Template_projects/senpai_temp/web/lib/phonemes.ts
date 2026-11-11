// Pronunciation scoring from phonemes: what the dictionary says each word
// should sound like (CMUdict, ARPAbet) against what the phoneme recognizer
// heard (espeak-style IPA). Both are folded into one small English set, aligned,
// and scored per word. Pure code: the model itself lives in lib/pronounce.ts.

// --- one phoneme set ----------------------------------------------------------

const VOWELS = new Set(["i", "ɪ", "eɪ", "ɛ", "æ", "ʌ", "ə", "ɚ", "ɑ", "ɔ", "oʊ", "ʊ", "u", "aɪ", "aʊ", "ɔɪ"]);
export const isVowel = (p: string) => VOWELS.has(p);

const ARPABET: Record<string, string> = {
  AA: "ɑ", AE: "æ", AO: "ɔ", AW: "aʊ", AY: "aɪ", EH: "ɛ", ER: "ɚ", EY: "eɪ", IH: "ɪ", IY: "i", OW: "oʊ", OY: "ɔɪ", UH: "ʊ", UW: "u",
  B: "b", CH: "tʃ", D: "d", DH: "ð", F: "f", G: "g", HH: "h", JH: "dʒ", K: "k", L: "l", M: "m", N: "n", NG: "ŋ", P: "p",
  R: "r", S: "s", SH: "ʃ", T: "t", TH: "θ", V: "v", W: "w", Y: "j", Z: "z", ZH: "ʒ",
};

export function fromArpabet(pron: string): string[] {
  return pron.split(" ").map((p) => {
    const base = p.replace(/\d/g, "");
    if (base === "AH") return p.endsWith("0") ? "ə" : "ʌ";
    return ARPABET[base] ?? "";
  }).filter(Boolean);
}

// Recognizer tokens (espeak IPA) that belong to English, folded to the set above.
// Everything else is masked out before decoding.
export const MODEL_TOKENS: Record<string, string[]> = {
  p: ["p"], b: ["b"], t: ["t"], d: ["d"], k: ["k"], ɡ: ["g"], f: ["f"], v: ["v"], θ: ["θ"], ð: ["ð"], s: ["s"], z: ["z"],
  ʃ: ["ʃ"], ʒ: ["ʒ"], h: ["h"], tʃ: ["tʃ"], dʒ: ["dʒ"], m: ["m"], n: ["n"], ŋ: ["ŋ"], l: ["l"], ɹ: ["r"], r: ["r"],
  w: ["w"], j: ["j"], ɾ: ["ɾ"], ʔ: ["ʔ"],
  iː: ["i"], i: ["i"], ɪ: ["ɪ"], ᵻ: ["ɪ"], eɪ: ["eɪ"], ɛ: ["ɛ"], æ: ["æ"], ʌ: ["ʌ"], ɐ: ["ʌ"], ə: ["ə"], ɚ: ["ɚ"],
  ɜː: ["ɚ"], ɜ: ["ɚ"], ɑː: ["ɑ"], ɑ: ["ɑ"], ɔː: ["ɔ"], ɔ: ["ɔ"], oʊ: ["oʊ"], ʊ: ["ʊ"], uː: ["u"], u: ["u"],
  aɪ: ["aɪ"], aʊ: ["aʊ"], ɔɪ: ["ɔɪ"],
  əl: ["ə", "l"], ɑːɹ: ["ɑ", "r"], ɔːɹ: ["ɔ", "r"], oːɹ: ["ɔ", "r"], ɛɹ: ["ɛ", "r"], ɪɹ: ["ɪ", "r"], ʊɹ: ["ʊ", "r"],
  aɪɚ: ["aɪ", "ɚ"], iə: ["i", "ə"],
};

// --- comparing two phonemes --------------------------------------------------

const pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
// Accent variation that is not a mistake.
const SAME = new Set([pair("ʌ", "ə"), pair("ɪ", "ə"), pair("ɑ", "ɔ"), pair("ɚ", "ə")]);
// Close, but worth half: often the thing a learner gets wrong.
const NEAR = new Map<string, number>([
  [pair("i", "ɪ"), 0.5], [pair("u", "ʊ"), 0.5], [pair("ɛ", "æ"), 0.5], [pair("eɪ", "ɛ"), 0.5], [pair("oʊ", "ɔ"), 0.5],
  [pair("ʌ", "ɑ"), 0.5], [pair("s", "z"), 0.6], [pair("t", "d"), 0.6], [pair("ʃ", "s"), 0.3], [pair("ð", "d"), 0.3], [pair("θ", "t"), 0.3],
]);

// Vowel swaps a Vietnamese speaker is told about; other vowel differences are
// mostly accent (and recognizer noise), so they cost little and get no tip.
const VOWEL_TIPS = new Set([pair("i", "ɪ"), pair("ɛ", "æ"), pair("u", "ʊ")]);

// Credit for hearing `h` where `e` was expected (0..1).
export function credit(e: string, h: string): number {
  if (e === h) return 1;
  // A flap or glottal stop is how Americans say many t's and d's.
  if (h === "ɾ" && (e === "t" || e === "d")) return 1;
  if (h === "ʔ" && e === "t") return 0.9;
  const k = pair(e, h);
  if (SAME.has(k)) return 1;
  const near = NEAR.get(k);
  if (near !== undefined) return near;
  return isVowel(e) && isVowel(h) ? 0.7 : 0;
}

const weight = (p: string) => (isVowel(p) ? 0.7 : 1);

// --- alignment ------------------------------------------------------------------

export type Word = { text: string; phones: string[] | null };
export type Phone = { e: string; h: string | null; c: number };
export type Issue =
  | { kind: "drop_final"; ph: string }
  | { kind: "drop"; ph: string }
  | { kind: "sub"; from: string; to: string }
  | { kind: "extra_vowel" };
export type WordScore = { text: string; score: number; expected: string; heard: string; phones: Phone[]; issues: Issue[] };

// Global alignment of the expected phonemes (all words) with what was heard.
// Words the dictionary doesn't know are wildcards that swallow anything.
export function align(words: Word[], heard: string[]): WordScore[] {
  type E = { p: string; w: number };
  const exp: E[] = [];
  words.forEach((w, i) => (w.phones ? w.phones.forEach((p) => exp.push({ p, w: i })) : exp.push({ p: "*", w: i })));
  const n = exp.length;
  const m = heard.length;
  const INS = 0.5;
  const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const B = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1)); // 1 diag, 2 del, 3 ins
  const free = (i: number) => i > 0 && exp[i - 1].p === "*";
  for (let i = 1; i <= n; i++) {
    D[i][0] = D[i - 1][0] + (exp[i - 1].p === "*" ? 0 : weight(exp[i - 1].p));
    B[i][0] = 2;
  }
  for (let j = 1; j <= m; j++) {
    D[0][j] = D[0][j - 1] + INS;
    B[0][j] = 3;
  }
  for (let i = 1; i <= n; i++) {
    const e = exp[i - 1].p;
    for (let j = 1; j <= m; j++) {
      const diag = D[i - 1][j - 1] + (e === "*" ? 0 : weight(e) * (1 - credit(e, heard[j - 1])));
      const del = D[i - 1][j] + (e === "*" ? 0 : weight(e));
      const ins = D[i][j - 1] + (free(i) ? 0 : INS);
      if (diag <= del && diag <= ins) [D[i][j], B[i][j]] = [diag, 1];
      else if (del <= ins) [D[i][j], B[i][j]] = [del, 2];
      else [D[i][j], B[i][j]] = [ins, 3];
    }
  }
  // Walk back, collecting per-word phones and inserted sounds.
  const per: Phone[][] = words.map(() => []);
  const extra: string[][] = words.map(() => []);
  for (let i = n, j = m; i > 0 || j > 0; ) {
    const b = B[i][j];
    if (b === 1) {
      const e = exp[i - 1];
      if (e.p !== "*") per[e.w].push({ e: e.p, h: heard[j - 1], c: credit(e.p, heard[j - 1]) });
      i--, j--;
    } else if (b === 2) {
      const e = exp[i - 1];
      if (e.p !== "*") per[e.w].push({ e: e.p, h: null, c: 0 });
      i--;
    } else {
      const w = i > 0 ? exp[i - 1].w : 0;
      if (!words[w].phones) {
        j--;
        continue;
      }
      extra[w].push(heard[j - 1]);
      j--;
    }
  }
  return words.map((w, k) => {
    const phones = per[k].reverse();
    if (!w.phones) return { text: w.text, score: -1, expected: "", heard: "", phones: [], issues: [] };
    const total = phones.reduce((s, p) => s + weight(p.e), 0);
    const got = phones.reduce((s, p) => s + weight(p.e) * p.c, 0);
    const extraVowels = extra[k].filter(isVowel).length;
    const raw = total ? Math.max(0, got - 0.3 * extraVowels) / total : 0;
    return {
      text: w.text,
      score: Math.round(raw * 100),
      expected: phones.map((p) => p.e).join(""),
      heard: phones.map((p) => p.h ?? "").join(""),
      phones,
      issues: issuesOf(phones, extraVowels),
    };
  });
}

// What went wrong in one word, most telling first.
function issuesOf(phones: Phone[], extraVowels: number): Issue[] {
  const finals: Issue[] = [];
  const subs: Issue[] = [];
  const drops: Issue[] = [];
  const lastVowel = phones.map((p) => isVowel(p.e)).lastIndexOf(true);
  phones.forEach((p, i) => {
    if (p.c >= 0.6) return;
    const vowel = isVowel(p.e);
    // A consonant heard as a vowel is really a consonant that went missing.
    if (p.h === null || (!vowel && isVowel(p.h))) {
      // A consonant after the last vowel that went missing: the classic swallowed ending.
      if (!vowel && i > lastVowel) finals.push({ kind: "drop_final", ph: p.e });
      else if (!vowel) drops.push({ kind: "drop", ph: p.e });
    } else if ((!vowel && !isVowel(p.h)) || VOWEL_TIPS.has(pair(p.e, p.h)) || (p.e === "ɚ" && isVowel(p.h))) {
      subs.push({ kind: "sub", from: p.e, to: p.h });
    }
  });
  return [...finals, ...subs, ...drops, ...(extraVowels > 0 ? [{ kind: "extra_vowel" } as const] : [])];
}

// --- tips -----------------------------------------------------------------------

const SOUND_TIPS: Record<string, string> = {
  θ: "/θ/ như “think”: đặt đầu lưỡi giữa hai hàm răng rồi thổi hơi ra, không đọc thành /t/ hay /s/.",
  ð: "/ð/ như “this”: lưỡi giữa hai răng, rung cổ họng, không đọc thành /d/ hay /z/.",
  ʃ: "/ʃ/ như “she”: chu môi, lưỡi lùi vào trong hơn /s/.",
  ʒ: "/ʒ/ như “usually”: giống /ʃ/ nhưng rung cổ họng.",
  z: "/z/: đặt lưỡi như /s/ nhưng rung cổ họng.",
  v: "/v/: răng trên chạm nhẹ môi dưới, rung cổ họng; không đọc thành /j/ hay /b/.",
  r: "/r/: cong lưỡi lên, không chạm vòm miệng; không đọc thành /z/.",
  l: "/l/: đầu lưỡi chạm lợi trên, hơi thoát hai bên.",
  n: "/n/: đầu lưỡi chạm lợi trên, hơi thoát qua mũi.",
  tʃ: "/tʃ/ như “chair”: bật mạnh, giống “ch” nhưng chu môi.",
  dʒ: "/dʒ/ như “job”: như /tʃ/ nhưng rung cổ họng.",
  i: "/iː/ dài như “sheep”: kéo dài, căng môi sang hai bên.",
  ɪ: "/ɪ/ ngắn như “ship”: ngắn và thả lỏng, không kéo dài.",
  æ: "/æ/ như “cat”: mở miệng rộng, giữa “a” và “e”.",
  ɚ: "/ɚ/ như “her”: cong lưỡi lên khi đọc.",
};

export type Habit = { key: string; label: string; tip: string };

// The one thing to say about a pronunciation issue, in Vietnamese.
export function habitOf(i: Issue): Habit {
  if (i.kind === "drop_final") {
    return { key: "drop_final", label: "Nuốt âm cuối", tip: `Bật rõ âm cuối /${i.ph}/. Nuốt mất là người nghe dễ hiểu sang từ khác.` };
  }
  if (i.kind === "drop") return { key: "drop", label: "Rớt phụ âm", tip: `Đọc đủ âm /${i.ph}/, đừng bỏ bớt, nhất là trong cụm phụ âm.` };
  if (i.kind === "extra_vowel") return { key: "extra_vowel", label: "Chêm “ơ” giữa phụ âm", tip: "Đừng chêm “ơ” giữa hai phụ âm hay sau âm cuối (“s-ơ-tr”), nối liền cho gọn." };
  return { key: `sub:${i.from}`, label: `Âm /${i.from}/ thành /${i.to}/`, tip: SOUND_TIPS[i.from] ?? `Đọc /${i.from}/, đừng đọc thành /${i.to}/.` };
}

// Words below this get a tip and count towards habits.
export const WEAK = 70;

// Splits text into scoreable words with their dictionary pronunciation.
export function wordsOf(text: string, dict: Record<string, string>): Word[] {
  return text
    .replace(/[’‘]/g, "'")
    .split(/\s+/)
    .map((raw) => raw.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, ""))
    .filter(Boolean)
    .map((t) => {
      const pron = dict[t.toLowerCase()];
      return { text: t, phones: pron ? fromArpabet(pron) : null };
    });
}

export type Pron = {
  score: number;
  words: { text: string; score: number; expected: string; heard: string; tip?: string }[];
  habits: { key: string; label: string; tip: string; n: number; example: string; expected: string; heard: string }[];
  pauses: number;
  secs: number;
};

// Utterance score from per-word results, plus the habits worth mentioning.
export function summarize(scored: WordScore[], pauses: number, secs: number): Pron | null {
  const real = scored.filter((w) => w.score >= 0 && w.phones.length);
  const total = real.reduce((s, w) => s + w.phones.reduce((a, p) => a + weight(p.e), 0), 0);
  if (total < 4) return null;
  const got = real.reduce((s, w) => s + (w.score / 100) * w.phones.reduce((a, p) => a + weight(p.e), 0), 0);
  const counts = new Map<string, { h: Habit; n: number; words: string[]; sounds: Set<string>; first: WordScore }>();
  for (const w of real) {
    if (w.score >= WEAK) continue;
    for (const i of w.issues) {
      const h = habitOf(i);
      const c = counts.get(h.key) ?? { h, n: 0, words: [], sounds: new Set<string>(), first: w };
      c.n++;
      if (!c.words.includes(w.text)) c.words.push(w.text);
      if (i.kind === "drop_final") c.sounds.add(i.ph);
      counts.set(h.key, c);
    }
  }
  const habits = [...counts.values()]
    .sort((a, b) => b.n - a.n)
    .map((c) => {
      const tip =
        c.h.key === "drop_final"
          ? `Bật rõ âm cuối ${[...c.sounds].slice(0, 3).map((x) => `/${x}/`).join(", ")}, ví dụ “${c.words.slice(0, 2).join("”, “")}”. Nuốt mất là người nghe dễ hiểu sang từ khác.`
          : c.h.tip;
      return { key: c.h.key, label: c.h.label, tip, n: c.n, example: c.words[0], expected: c.first.expected, heard: c.first.heard };
    });
  return {
    score: Math.round((got / total) * 100),
    words: real.map((w) => ({ text: w.text, score: w.score, expected: w.expected, heard: w.heard, tip: w.score < WEAK && w.issues[0] ? habitOf(w.issues[0]).tip : undefined })),
    habits,
    pauses,
    secs,
  };
}
