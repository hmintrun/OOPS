import "server-only";
import { CATEGORIES, SCENARIOS, type Category, type Scenario } from "./content";
import { activity, addActivity, addPoints, leaderboard, phrases, profile, recentPron, updateProfile, type ProfileRow } from "./db";
import type { Pron } from "./phonemes";
import { dayEnd, dayKey, shiftDay, weekEnd, weekKey, weekdayShort } from "./time";

// A day keeps the streak with one minute of speaking, or a freeze.
export const ACTIVE_SECS = 60;
const MAX_FREEZES = 2;

export type DayState = "done" | "frozen" | "missed" | "today";

export function streak(userId: number) {
  const byDay = new Map(activity(userId).map((a) => [a.day, a]));
  const active = (d: string) => {
    const a = byDay.get(d);
    return !!a && (a.secs >= ACTIVE_SECS || a.frozen === 1);
  };
  const today = dayKey();
  const todayDone = active(today);
  let days = 0;
  for (let d = todayDone ? today : shiftDay(today, -1); active(d); d = shiftDay(d, -1)) days++;
  const week = Array.from({ length: 7 }, (_, i) => {
    const key = shiftDay(today, i - 6);
    const a = byDay.get(key);
    const state: DayState = key === today && !todayDone ? "today" : !active(key) ? "missed" : a?.frozen && (a.secs ?? 0) < ACTIVE_SECS ? "frozen" : "done";
    return { key, label: key === today ? "Nay" : weekdayShort(key), state };
  });
  const todaySecs = byDay.get(today)?.secs ?? 0;
  return { days, todayDone, todaySecs, week, endsAt: dayEnd(), freezes: profile(userId).freezes };
}

// Speaking time from any exercise. Every full week of streak earns a freeze.
export function recordSpeech(userId: number, secs: number) {
  const s = Math.max(0, Math.min(600, Math.round(secs)));
  if (!s) return;
  const before = streak(userId).days;
  addActivity(userId, dayKey(), s);
  const after = streak(userId).days;
  if (after > before && after % 7 === 0) {
    const p = profile(userId);
    if (p.freezes < MAX_FREEZES) updateProfile(userId, { freezes: p.freezes + 1 });
  }
}

export function award(userId: number, pts: number, why: string) {
  if (pts > 0) addPoints(userId, weekKey(), Math.round(pts), why);
}

export function league(userId: number, username: string) {
  const rows = leaderboard(weekKey());
  if (!rows.some((r) => r.user_id === userId)) rows.push({ user_id: userId, username, pts: 0 });
  const board = rows.map((r, i) => ({ rank: i + 1, name: r.username, pts: r.pts, you: r.user_id === userId }));
  const me = board.find((r) => r.you)!;
  const ahead = me.rank > 1 ? board[me.rank - 2] : null;
  return { board, me, ahead: ahead && { name: ahead.name, gap: ahead.pts - me.pts }, endsAt: weekEnd() };
}

export type Habit = { category: Category; label: string; measure: string; example?: { wrong: string; right: string } };

const soundExample = (word: string, heard: string, expected: string) => ({ wrong: `${word} /${heard}/`, right: `/${expected}/` });

// The sound mistake that came up most in the last spoken answers, if any did twice.
function soundHabit(userId: number): Habit | null {
  const counts = new Map<string, Pron["habits"][number]>();
  for (const r of recentPron(userId)) {
    for (const h of (JSON.parse(r) as Pron).habits) {
      const c = counts.get(h.key);
      if (c) c.n += h.n;
      else counts.set(h.key, { ...h });
    }
  }
  const top = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  return top && top.n >= 2 ? { category: "pronunciation", label: top.label, measure: `${top.n} lần`, example: soundExample(top.example, top.heard, top.expected) } : null;
}

// The three mistakes that keep coming back: counted over every saved
// correction plus the measured sounds, falling back to what the warm-up noticed.
export function habits(userId: number): Habit[] {
  const counts = new Map<string, { n: number; wrong: string; right: string }>();
  for (const p of phrases(userId)) {
    const c = counts.get(p.category);
    if (c) c.n++;
    else counts.set(p.category, { n: 1, wrong: p.wrong, right: p.right });
  }
  const list: Habit[] = [...counts.entries()]
    .filter(([k]) => k !== "other" && k !== "pronunciation")
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 3)
    .map(([k, c]) => ({
      category: k as Category,
      label: CATEGORIES[k as Category] ?? CATEGORIES.other,
      measure: `${c.n} lần`,
      example: { wrong: c.wrong, right: c.right },
    }));
  // Sound and grammar counts aren't comparable, so the sound habit takes a fixed slot.
  const sound = soundHabit(userId);
  if (sound) list.splice(2, 1, sound);
  if (list.length >= 3) return list;
  const warm = profile(userId).warmup;
  const fromWarmup = warm ? (JSON.parse(warm) as WarmupResult).habits : [];
  const seen = new Set(list.map((h) => h.category));
  for (const h of fromWarmup) {
    if (seen.has(h.category as Category)) continue;
    const e = h.example;
    list.push({ category: h.category as Category, label: h.label, measure: h.measure, example: e && soundExample(e.word, e.heard, e.expected) });
  }
  return list.slice(0, 3);
}

// One scenario a day earns double weekly points, the same one for everyone.
export function challenge(day = dayKey()): Scenario {
  const pool = SCENARIOS.filter((s) => s.key !== "full");
  let h = 7;
  for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return pool[h % pool.length];
}

export function profileView(p: ProfileRow) {
  return {
    role: p.role,
    experience: p.experience,
    when: p.interview_when,
    jd: p.jd,
    sass: p.sass,
    onboarded: !!p.onboarded,
    warmedUp: !!p.warmup,
  };
}
export type ProfileView = ReturnType<typeof profileView>;

export type WarmupResult = {
  summary: string;
  // example: the word a measured sound habit showed up in, as heard and as expected (IPA)
  habits: { category: string; label: string; measure: string; example?: { word: string; heard: string; expected: string } }[];
  fixes: number;
  at: number;
};
