import { ask } from "@/lib/claude";
import { WarmupSchema, warmupSystem } from "@/lib/coach";
import { CATEGORIES, WARMUP } from "@/lib/content";
import { addPhrase, profile, updateProfile, useAi } from "@/lib/db";
import { fail, ok, route } from "@/lib/http";
import { keepCorrections } from "@/lib/interview";
import { RATE, analyze, combine, describe, readPcm } from "@/lib/pronounce";
import { award, recordSpeech, type WarmupResult } from "@/lib/progress";
import { dayKey } from "@/lib/time";

type Answer = { text?: unknown; secs?: unknown };
// Scoring runs before Claude answers, so the clips share a budget that keeps the
// whole request well under the proxy's 100 s timeout; clips past it go unmeasured.
const PRON_BUDGET_SECS = 120;
// GET /api/warmup -> the saved result, or null.
export const GET = route((user) => {
  const w = profile(user.id).warmup;
  return ok(w ? (JSON.parse(w) as WarmupResult) : null);
});

// POST /api/warmup { answers: [{ text, secs }] x3 } (+ audio0..2, multipart)
// -> Miu's three habits. Free, so it is capped per day.
export const POST = route<{ answers?: Answer[] } & Record<`audio${number}`, Blob | undefined>>(async (user, b) => {
  const answers = Array.isArray(b.answers) ? b.answers.slice(0, WARMUP.length) : [];
  const texts = answers.map((a) => (typeof a.text === "string" ? a.text.trim().slice(0, 1500) : ""));
  if (!texts.some((t) => t.split(/\s+/).length >= 3)) return fail("too_short", 400);
  if (!useAi(user.id, dayKey(), "warmup", 3)) return fail("daily_limit", 429);

  let budget = PRON_BUDGET_SECS * RATE;
  const measured = [];
  for (const [i, t] of texts.entries()) {
    const pcm = t ? await readPcm(b[`audio${i}`]) : null;
    if (!pcm || pcm.length > budget) continue;
    budget -= pcm.length;
    measured.push(await analyze(pcm, t));
  }
  const pron = combine(measured.filter((p) => p !== null));
  const transcript = WARMUP.map((q, i) => `Miu: ${q.en}\nLearner: ${texts[i] || "(silence)"}`).join("\n");
  const r = await ask({
    system: warmupSystem(),
    messages: [{ role: "user", content: `${pron ? `${describe(pron)}\n\n` : ""}<transcript>\n${transcript}\n</transcript>` }],
    schema: WarmupSchema,
    effort: "medium",
    maxTokens: 8000,
  });
  const fixes = keepCorrections(r.value.corrections);
  const habits: WarmupResult["habits"] = r.value.habits
    .filter((h) => h.category !== "pronunciation")
    .slice(0, 3)
    .map((h) => ({
      category: h.category,
      label: h.label.trim().slice(0, 40) || CATEGORIES[h.category],
      measure: h.measure.trim().slice(0, 12),
    }));
  // A sound habit comes from what was measured, never from Claude's reading of a transcript.
  const sound = pron?.habits.find((h) => h.n >= 2);
  if (sound) habits.splice(2, 1, { category: "pronunciation", label: sound.label, measure: `${sound.n} lần`, example: { word: sound.example, heard: sound.heard, expected: sound.expected } });
  const result: WarmupResult = {
    summary: r.value.summary.trim(),
    habits: habits.slice(0, 3),
    fixes: fixes.length,
    at: Date.now(),
  };
  const first = !profile(user.id).warmup;
  updateProfile(user.id, { warmup: JSON.stringify(result) });
  for (const c of fixes) {
    addPhrase({ user_id: user.id, source: "warmup", en: c.better, vi: c.vi, said: c.said, wrong: c.wrong, right: c.right, why: c.why, category: c.category });
  }
  if (first) award(user.id, 20, "warmup");
  const secs = answers.reduce((s, a) => s + (typeof a.secs === "number" ? Math.min(120, Math.max(0, a.secs)) : 0), 0);
  recordSpeech(user.id, secs);
  return ok(result);
});
