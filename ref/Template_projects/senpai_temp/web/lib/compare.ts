// Loose comparison of a spoken sentence with the target, for review drills.
// Contractions, case, punctuation and small numbers don't count as mistakes,
// but the fixed fragment (`must`) has to be said exactly.

const CONTRACTIONS: [RegExp, string][] = [
  [/\bcan't\b/g, "can not"],
  [/\bcannot\b/g, "can not"],
  [/\bwon't\b/g, "will not"],
  [/n't\b/g, " not"],
  [/'re\b/g, " are"],
  [/'m\b/g, " am"],
  [/'ve\b/g, " have"],
  [/'ll\b/g, " will"],
  [/'d\b/g, " would"],
  [/\blet's\b/g, "let us"],
  [/\b(it|that|there|what|he|she|who|where|how|here)'s\b/g, "$1 is"],
];
const NUMBERS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

function norm(token: string): string[] {
  let t = token.toLowerCase().replace(/[’‘]/g, "'");
  for (const [re, to] of CONTRACTIONS) t = t.replace(re, to);
  return t
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter(Boolean)
    .map((w) => (NUMBERS.includes(w) ? String(NUMBERS.indexOf(w)) : w));
}

export type Compared = { score: number; ok: boolean; tokens: { text: string; missed: boolean }[] };

export function compare(target: string, heard: string, must = ""): Compared {
  const tokens = target.split(/\s+/).filter(Boolean);
  const a: { w: string; tok: number }[] = tokens.flatMap((t, i) => norm(t).map((w) => ({ w, tok: i })));
  const b = heard.split(/\s+/).flatMap(norm);
  // Longest common subsequence over words.
  const L = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i].w === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const hit = new Set<number>();
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i].w === b[j]) hit.add(i++), j++;
    else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  const score = a.length + b.length ? (2 * L[0][0]) / (a.length + b.length) : 0;
  const missedTok = new Set(a.filter((_, i) => !hit.has(i)).map((x) => x.tok));
  const need = must.split(/\s+/).flatMap(norm);
  const said = ` ${b.join(" ")} `;
  const fixed = !need.length || said.includes(` ${need.join(" ")} `);
  return { score, ok: score >= 0.8 && fixed, tokens: tokens.map((text, i) => ({ text, missed: missedTok.has(i) })) };
}
