import "server-only";
import { phraseById, phrases, savePhrase, type PhraseRow } from "./db";
import { award, recordSpeech } from "./progress";

// Spaced repetition: a phrase comes back after 1, 3, 7 and 16 days; saying it
// right once more after that marks it known. A miss sends it back to the start.
const DAY = 86_400_000;
const INTERVALS = [1, 3, 7, 16].map((d) => d * DAY);
export const REVIEW_POINTS = 5;

export function phraseView(p: PhraseRow) {
  return { id: p.id, en: p.en, vi: p.vi, said: p.said, wrong: p.wrong, right: p.right, why: p.why, category: p.category, known: !!p.known, due: !p.known && p.due_at <= Date.now() };
}
export type PhraseView = ReturnType<typeof phraseView>;

export function phraseBook(userId: number) {
  const all = phrases(userId).map(phraseView);
  return { due: all.filter((p) => p.due), later: all.filter((p) => !p.due && !p.known), known: all.filter((p) => p.known) };
}

export function review(userId: number, id: number, okay: boolean, secs: number) {
  const p = phraseById(userId, id);
  if (!p || p.known) return null;
  const now = Date.now();
  if (okay) {
    const known = p.step >= INTERVALS.length;
    savePhrase(id, { step: p.step + 1, due_at: known ? now : now + INTERVALS[p.step], known: known ? 1 : 0 });
    // Points only for a phrase that was actually due, so drilling one card can't farm them.
    if (p.due_at <= now) award(userId, REVIEW_POINTS, "review");
  } else {
    savePhrase(id, { step: 0, due_at: now, known: 0 });
  }
  recordSpeech(userId, secs);
  return phraseView(phraseById(userId, id)!);
}
